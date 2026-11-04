// 백엔드(functions/, docs/api.md)에 연결한 데이터 함수.
// 백엔드 응답을 화면이 쓰는 types.ts 모양으로 바꿔서 돌려준다.
// 백엔드에 아직 없는 값(학교, 승인 상태, 행사 테마)은 기본값을 채운다.
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { FunctionsError, httpsCallable } from 'firebase/functions';
import type { Callables, UserProfile } from '../../../../functions/src/api';
import {
  ApiError,
  type CancelResult,
  type DeviceResetRequest,
  type Event,
  type EventStats,
  type ReassignMode,
  type Reassignment,
  type ScanLog,
  type School,
  type StaffStats,
  type Ticket,
  type TicketRow,
  type User,
  type VerifyResult,
  type WaitlistEntry,
} from '@/types';
import { describeThisDevice, getDeviceKeys, publicKeyJwk, setRegistered, signRefresh } from './device';
import { auth, db, functions } from './firebase';

/** 학교에 행사가 없을 때 처음 보여줄 행사 */
export const EVENT_ID = import.meta.env.VITE_EVENT_ID || 'demo-festival';
const DEFAULT_BRAND = '#9C8CFF';

// 지금 보고 있는 학교. 고연전/연고전처럼 학교마다 다른 묶음 이름을 고를 때 쓴다
let viewerSchoolId = '';

function call<K extends keyof Callables>(name: K) {
  return httpsCallable<Callables[K][0], Callables[K][1]>(functions, name);
}

/** 백엔드 HttpsError → 화면용 ApiError */
function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof FunctionsError) {
    const code = e.code.replace('functions/', '');
    if (deviceReason(e) === 'NOT_VERIFIED') return new ApiError('not_in_roster');
    if (deviceReason(e) === 'CANCELLED_BEFORE') return new ApiError('cancelled_before');
    if (code === 'permission-denied') return new ApiError('not_school_account');
    if (code === 'resource-exhausted') return new ApiError('sold_out');
    if (code === 'not-found') return new ApiError('not_found');
    if (code === 'unauthenticated') return new ApiError('unauthenticated');
    if (code === 'failed-precondition' || code === 'already-exists') return new ApiError('invalid_state');
  }
  return new ApiError('unknown');
}

/** 함수 오류의 details.reason (기기 확인 실패, 재발급 금지 등) */
function deviceReason(e: unknown): string | undefined {
  if (!(e instanceof FunctionsError)) return undefined;
  const details = e.details as { reason?: string } | undefined;
  return details?.reason;
}

// schoolId: 메일 도메인으로 찾은 학교. 학교 메일이 아닌 운영 계정(gmail)은 빈 값
function toUser(p: UserProfile, schoolId: string, deviceStatus: User['deviceStatus'] = 'registered'): User {
  return {
    uid: p.uid,
    schoolId,
    name: p.name,
    studentId: p.studentId,
    email: p.email,
    photoUrl: p.photoUrl ?? '',
    role: p.role,
    verifyStatus: p.verifyStatus ?? 'none',
    rejectReason: p.rejectReason,
    deviceStatus,
  };
}

function millis(v: unknown): number {
  return v && typeof v === 'object' && 'toMillis' in v ? (v as { toMillis(): number }).toMillis() : 0;
}

function toEvent(id: string, d: DocumentData): Event {
  return {
    id,
    schoolId: (d.schoolIds as string[] | undefined)?.[0] ?? '',
    schoolIds: d.schoolIds ?? [],
    seriesName: (d.seriesName as Record<string, string> | undefined)?.[viewerSchoolId] ?? firstValue(d.seriesName),
    name: d.name ?? '',
    date: new Date(millis(d.date) || Date.now()).toISOString(),
    place: d.place ?? '',
    capacity: d.capacity ?? 0,
    faceValue: d.faceValue ?? 0,
    enteredCount: d.enteredCount ?? 0,
    issuedCount: d.issuedCount ?? 0,
    allowedDomains: d.allowedDomains ?? [],
    theme: { source: 'school', colors: [] },
    settings: { requireRoster: false },
    reassignMode: d.reassignMode === 'random' ? 'random' : 'queue',
    allowReissueAfterCancel: d.allowReissueAfterCancel === true,
    dataRetentionDays: 7,
  };
}

function toTicket(id: string, d: DocumentData): Ticket {
  return {
    id,
    eventId: d.eventId,
    ownerUid: d.ownerUid,
    nftTokenId: d.nftNumber ?? '',
    status: d.status === 'used' ? 'used' : 'issued',
    // 문서의 토큰은 쓰지 않는다. 0으로 두면 화면이 바로 기기 서명을 붙인 refreshQrToken을 부른다
    qrToken: '',
    qrExpiresAt: 0,
    issuedAt: millis(d.issuedAt),
    usedAt: d.usedAt ? millis(d.usedAt) : undefined,
    chain: toChain(d.chain),
  };
}

function toChain(c: unknown): Ticket['chain'] {
  if (!c || typeof c !== 'object') return undefined;
  const { status, tokenId, lastTx } = c as Record<string, unknown>;
  if (status !== 'pending' && status !== 'done' && status !== 'blocked') return undefined;
  return {
    status,
    tokenId: typeof tokenId === 'string' ? tokenId : undefined,
    lastTx: typeof lastTx === 'string' ? lastTx : undefined,
  };
}

function domainOf(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function firstValue(v: unknown): string | undefined {
  return v && typeof v === 'object' ? (Object.values(v)[0] as string | undefined) : undefined;
}

function toSchool(id: string, d: DocumentData): School {
  return {
    id,
    name: d.name ?? '',
    domain: (d.domains as string[] | undefined)?.[0] ?? '',
    brandColor: d.brandColor ?? DEFAULT_BRAND,
    // 처음 보여줄 행사는 AuthProvider가 listEvents로 정한다
    currentEventId: EVENT_ID,
  };
}

/** 메일 도메인이 속한 학교. 없으면 null */
async function schoolIdForEmail(email: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, 'schools'), where('domains', 'array-contains', domainOf(email)), limit(1)),
  );
  return snap.docs[0]?.id ?? null;
}

/** 학생은 학교 메일이어야 한다. 스태프·관리자는 시드로 정해진 계정이라 학교 없이 들어와 학교를 고른다 */
async function profileToUser(p: UserProfile): Promise<User | null> {
  const schoolId = await schoolIdForEmail(p.email);
  if (!schoolId && p.role === 'student') return null;
  return withDevice(toUser(p, schoolId ?? ''));
}

// ---------- 로그인 · 학교 · 행사 ----------

export async function signInWithSchoolAccount(): Promise<User> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    const { data } = await call('ensureUser')();
    const user = await profileToUser(data);
    // 학생은 등록된 학교의 메일이어야 들어온다
    if (!user) {
      await fbSignOut(auth);
      throw new ApiError('not_school_account');
    }
    return user;
  } catch (e) {
    throw toApiError(e);
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export async function getCurrentUser(): Promise<User | null> {
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  const { data } = await call('ensureUser')();
  return profileToUser(data);
}

export async function submitVerification(photo: string, idCard: string, identity?: { name: string; studentId: string }): Promise<User> {
  try {
    const current = identity ?? await getCurrentUser();
    if (!current) throw new ApiError('unauthenticated');
    const { data } = await call('submitVerification')({ photo, idCard, name: current.name, studentId: current.studentId });
    const user = await profileToUser(data);
    if (!user) throw new ApiError('not_school_account');
    return user;
  } catch (e) {
    throw toApiError(e);
  }
}

// ---------- 기기 묶기 (docs/api.md 9장) ----------

/** 이 기기를 등록한다. 이미 다른 기기가 등록돼 있으면 'blocked' */
async function registerThisDevice(uid: string): Promise<User['deviceStatus']> {
  const stored = await getDeviceKeys(uid);
  if (stored.registered) return 'registered';
  try {
    await call('registerDevice')({ publicKeyJwk: await publicKeyJwk(stored.keys) });
  } catch (e) {
    if (e instanceof FunctionsError && e.code.replace('functions/', '') === 'already-exists') return 'blocked';
    throw e;
  }
  await setRegistered(stored, true);
  return 'registered';
}

/** 학생만 기기를 묶는다. IndexedDB·WebCrypto를 못 쓰는 브라우저는 확인 없이 통과 (서버가 requireDevice로 막는다) */
async function withDevice(user: User): Promise<User> {
  if (user.role !== 'student') return user;
  try {
    const deviceStatus = await registerThisDevice(user.uid);
    // 서버는 기기 이름을 따로 두지 않는다. 이 기기가 등록 기기일 때만 이 기기 이름을 보여준다
    return { ...user, deviceStatus, deviceName: deviceStatus === 'registered' ? `${describeThisDevice()} (이 기기)` : undefined };
  } catch {
    return user;
  }
}

/** 학교 이름·상징색 (schools/{id}). 이 학교가 보는 사람 학교가 된다 */
export async function getSchool(schoolId: string): Promise<School> {
  const snap = await getDoc(doc(db, 'schools', schoolId));
  if (!snap.exists()) throw new ApiError('not_found');
  viewerSchoolId = snap.id;
  return toSchool(snap.id, snap.data());
}

/** 관리자·스태프가 고를 수 있는 학교 전체 */
export async function listSchools(): Promise<School[]> {
  const snap = await getDocs(collection(db, 'schools'));
  return snap.docs.map((d) => toSchool(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 학교가 참여하는 행사들, 날짜순. 고연전처럼 두 학교가 함께하는 행사는 양쪽에 나온다 */
export async function listEvents(schoolId: string): Promise<Event[]> {
  viewerSchoolId = schoolId;
  const snap = await getDocs(query(collection(db, 'events'), where('schoolIds', 'array-contains', schoolId)));
  return snap.docs.map((d) => toEvent(d.id, d.data())).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getEvent(eventId: string): Promise<Event> {
  const snap = await getDoc(doc(db, 'events', eventId));
  if (!snap.exists()) throw new ApiError('not_found');
  return toEvent(snap.id, snap.data());
}

// ---------- 입장권 ----------

export async function getMyTicket(eventId: string): Promise<Ticket | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new ApiError('unauthenticated');
  const snap = await getDocs(
    query(collection(db, 'tickets'), where('ownerUid', '==', uid), where('eventId', '==', eventId), limit(1)),
  );
  const d = snap.docs[0];
  return d ? toTicket(d.id, d.data()) : null;
}

/** 1인 1매. 이미 있으면 기존 입장권을 돌려준다 */
export async function issueTicket(eventId: string): Promise<Ticket> {
  try {
    await call('issueTicket')({ eventId });
  } catch (e) {
    const err = toApiError(e);
    if (err.code !== 'invalid_state') throw err;
  }
  const ticket = await getMyTicket(eventId);
  if (!ticket) throw new ApiError('unknown');
  return ticket;
}

async function requestQr(ticketId: string, uid: string) {
  let deviceProof;
  try {
    deviceProof = await signRefresh((await getDeviceKeys(uid)).keys, ticketId);
  } catch {
    deviceProof = undefined;
  }
  const { data } = await call('refreshQrToken')({ ticketId, deviceProof });
  return { token: data.qrPayload.split(':')[2] ?? '', expiresAt: data.expiresAt };
}

/** 기기 서명을 붙여 새 QR을 받는다. 다른 기기에 등록된 계정이면 ApiError('device_blocked') */
export async function refreshQrToken(ticketId: string): Promise<{ token: string; expiresAt: number }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new ApiError('unauthenticated');
  try {
    return await requestQr(ticketId, uid);
  } catch (e) {
    const reason = deviceReason(e);
    if (!reason) throw toApiError(e);
    // 서버 등록이 지워졌거나(관리자 초기화) 서명이 안 맞으면 이 기기로 다시 등록해 본다
    const stored = await getDeviceKeys(uid);
    await setRegistered(stored, false);
    if ((await registerThisDevice(uid)) === 'blocked') throw new ApiError('device_blocked');
    try {
      return await requestQr(ticketId, uid);
    } catch (again) {
      throw deviceReason(again) ? new ApiError('device_blocked') : toApiError(again);
    }
  }
}

/** QR 내용 (docs/api.md 7장) */
export function formatQrPayload(ticketId: string, token: string): string {
  return `TTV1:${ticketId}:${token}`;
}

/** 입장권 취소 → 대기 명단 재배정 (docs/api.md 2.5) */
export async function cancelTicket(ticketId: string): Promise<CancelResult> {
  try {
    const { data } = await call('cancelTicket')({ ticketId });
    if (!data.ok) return 'used';
    return data.outcome === 'REASSIGNED' ? 'reassigned' : 'released';
  } catch (e) {
    throw toApiError(e);
  }
}

// ---------- 검표 ----------

// 내가 처리한 입장 수. 스태프는 scanLogs를 읽을 수 없어서 이 탭에서 센다
let myOkCount = 0;
const myCountListeners = new Set<() => void>();

/** 찍는 순간 입장 처리한다. 사진은 확인용으로 보여주기만 한다 */
export async function verifyEntry(qrPayload: string, eventId?: string): Promise<VerifyResult> {
  try {
    const { data } = await call('verifyEntry')({ qrPayload, eventId });
    if (data.ok) {
      myOkCount += 1;
      myCountListeners.forEach((f) => f());
      return { result: 'ok', ticketId: data.ticketId, user: { ...data.holder, photoUrl: data.holder.photoUrl ?? '' } };
    }
    if (data.reason === 'USED') return { result: 'used' };
    if (data.reason === 'WRONG_EVENT') return { result: 'wrong_event' };
    if (data.reason === 'EXPIRED' || data.reason === 'TOKEN_MISMATCH') return { result: 'expired' };
    return { result: 'invalid' };
  } catch (e) {
    throw toApiError(e);
  }
}

function watchEvent(eventId: string, cb: (e: Event) => void): () => void {
  return onSnapshot(doc(db, 'events', eventId), (snap) => {
    if (snap.exists()) cb(toEvent(snap.id, snap.data()));
  });
}

export function subscribeStaffStats(eventId: string, cb: (s: StaffStats) => void): () => void {
  let last: Event | null = null;
  const emit = () => last && cb({ enteredCount: last.enteredCount, capacity: last.capacity, myCount: myOkCount });
  myCountListeners.add(emit);
  const off = watchEvent(eventId, (e) => {
    last = e;
    emit();
  });
  return () => {
    myCountListeners.delete(emit);
    off();
  };
}

// ---------- 관리자 ----------

function toScanLog(id: string, d: DocumentData): ScanLog {
  return {
    id,
    eventId: d.eventId ?? '',
    ticketId: d.ticketId ?? undefined,
    userName: d.studentName ?? undefined,
    studentId: d.studentId ?? undefined,
    staffUid: d.staffUid ?? undefined,
    staffName: d.staffName || undefined,
    result: d.result,
    // 서버 시각이 아직 안 붙은 로컬 스냅샷은 지금 시각으로 보여준다
    at: millis(d.scannedAt) || Date.now(),
  };
}

// 행사별 최근 기록. eventId + scannedAt 복합 색인 (firestore.indexes.json)
const scanLogsQuery = (eventId: string, n: number) =>
  query(collection(db, 'scanLogs'), where('eventId', '==', eventId), orderBy('scannedAt', 'desc'), limit(n));

/** 입장 인원(행사 문서) + 거부 수·최근 기록(scanLogs 최근 500건) */
export function subscribeEventStats(eventId: string, cb: (s: EventStats) => void): () => void {
  let event: Event | null = null;
  let logs: ScanLog[] = [];
  const emit = () =>
    event &&
    cb({
      enteredCount: event.enteredCount,
      capacity: event.capacity,
      rejectedCount: logs.filter((l) => l.result !== 'ok').length,
      recent: logs.slice(0, 20),
    });
  const offEvent = watchEvent(eventId, (e) => {
    event = e;
    emit();
  });
  const offLogs = onSnapshot(
    scanLogsQuery(eventId, 500),
    (snap) => {
      logs = snap.docs.map((d) => toScanLog(d.id, d.data()));
      emit();
    },
    () => emit(),
  );
  return () => {
    offEvent();
    offLogs();
  };
}

export async function listEntries(eventId: string): Promise<ScanLog[]> {
  const snap = await getDocs(scanLogsQuery(eventId, 500));
  return snap.docs.map((d) => toScanLog(d.id, d.data()));
}

async function userName(uid: string | null | undefined, cache: Map<string, string>): Promise<string | undefined> {
  if (!uid) return undefined;
  if (!cache.has(uid)) {
    const snap = await getDoc(doc(db, 'users', uid));
    cache.set(uid, (snap.get('name') as string | undefined) ?? '알 수 없음');
  }
  return cache.get(uid);
}

/** 취소·재배정 기록. 백엔드는 uid만 남기므로 이름과 입장권 번호를 붙인다 (관리자는 users·tickets를 읽을 수 있다) */
export async function listReassignments(eventId: string): Promise<Reassignment[]> {
  // eventId + createdAt 복합 색인 (firestore.indexes.json). eventId가 없는 아주 예전 기록은 빠진다
  const snap = await getDocs(
    query(collection(db, 'reassignments'), where('eventId', '==', eventId), orderBy('createdAt', 'desc'), limit(200)),
  );
  const names = new Map<string, string>();
  return Promise.all(
    snap.docs.map(async (d) => {
      const r = d.data();
      // 새 기록은 표시용 값을 같이 저장한다. 예전 기록만 따로 찾아 붙인다
      const ticket = r.nftNumber ? null : await getDoc(doc(db, 'tickets', r.ticketId));
      return {
        id: d.id,
        ticketId: r.ticketId,
        eventId: r.eventId ?? (ticket?.get('eventId') as string | undefined) ?? eventId,
        nftTokenId: r.nftNumber ?? (ticket?.get('nftNumber') as string | undefined) ?? '-',
        fromUid: r.fromUid,
        fromName: r.fromName || ((await userName(r.fromUid, names)) ?? '알 수 없음'),
        toName: r.toUid ? r.toName || (await userName(r.toUid, names)) : undefined,
        mode: r.mode === 'random' ? 'random' : 'queue',
        outcome: r.toUid ? 'reassigned' : 'released',
        createdAt: millis(r.createdAt),
      } satisfies Reassignment;
    }),
  );
}

/** 발급 현황. 취소된 입장권은 빼고, 주인 이름·학번을 붙인다 (관리자는 users를 읽을 수 있다) */
export async function listTickets(eventId: string): Promise<TicketRow[]> {
  const snap = await getDocs(query(collection(db, 'tickets'), where('eventId', '==', eventId)));
  const owners = new Map<string, DocumentData | undefined>();
  const live = snap.docs.filter((d) => d.get('status') !== 'cancelled' && d.get('ownerUid'));
  await Promise.all(
    [...new Set(live.map((d) => d.get('ownerUid') as string))].map(async (uid) => {
      owners.set(uid, (await getDoc(doc(db, 'users', uid))).data());
    }),
  );
  return live
    .map((d) => {
      const owner = owners.get(d.get('ownerUid'));
      return {
        ...toTicket(d.id, d.data()),
        ownerName: (owner?.name as string | undefined) ?? '알 수 없음',
        ownerStudentId: (owner?.studentId as string | undefined) ?? '',
      };
    })
    .sort((a, b) => b.issuedAt - a.issuedAt);
}

/** 대기 명단. 문서 id가 이메일이고, 가입한 사람이면 이름을 붙인다 */
export async function getWaitlist(eventId: string): Promise<WaitlistEntry[]> {
  const snap = await getDocs(collection(db, 'events', eventId, 'waitlist'));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const account = await getDocs(query(collection(db, 'users'), where('email', '==', d.id), limit(1)));
      return {
        email: d.id,
        name: (account.docs[0]?.get('name') as string | undefined) ?? '가입 전',
        order: (d.get('order') as number | undefined) ?? 0,
        status: d.get('status') === 'assigned' ? 'assigned' : 'waiting',
      } satisfies WaitlistEntry;
    }),
  );
  return rows.sort((a, b) => a.order - b.order);
}

export async function updateReassignMode(eventId: string, mode: ReassignMode): Promise<Event> {
  try {
    await call('setReassignMode')({ eventId, mode });
  } catch (e) {
    throw toApiError(e);
  }
  return getEvent(eventId);
}

/** 학생 이메일로 찾아 기기 등록을 지운다. 학생이 다음에 로그인한 폰이 새 기기가 된다 */
export async function resetDeviceByEmail(email: string): Promise<string> {
  const found = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()), limit(1)));
  const account = found.docs[0];
  if (!account) throw new ApiError('not_found');
  try {
    await call('resetDevice')({ uid: account.id });
  } catch (e) {
    throw toApiError(e);
  }
  return (account.get('name') as string | undefined) ?? email;
}

export async function updateAllowReissue(eventId: string, allow: boolean): Promise<Event> {
  try {
    await call('setAllowReissue')({ eventId, allow });
  } catch (e) {
    throw toApiError(e);
  }
  return getEvent(eventId);
}

// ---------- 기기 초기화 요청 (deviceResets/{uid}) ----------

function toDeviceReset(id: string, d: DocumentData): DeviceResetRequest {
  return {
    id,
    uid: d.uid ?? id,
    userName: d.name ?? '',
    studentId: d.studentId ?? '',
    deviceName: d.email ?? '',
    requestedAt: millis(d.requestedAt) || Date.now(),
    status: d.status === 'done' ? 'done' : 'pending',
  };
}

export async function requestDeviceReset(): Promise<DeviceResetRequest> {
  try {
    await call('requestDeviceReset')();
  } catch (e) {
    throw toApiError(e);
  }
  const mine = await getMyDeviceReset();
  if (!mine) throw new ApiError('unknown');
  return mine;
}

export async function getMyDeviceReset(): Promise<DeviceResetRequest | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'deviceResets', uid));
  const reset = snap.exists() ? toDeviceReset(snap.id, snap.data()) : null;
  return reset?.status === 'pending' ? reset : null;
}

export async function listDeviceResets(): Promise<DeviceResetRequest[]> {
  const snap = await getDocs(query(collection(db, 'deviceResets'), orderBy('requestedAt', 'desc'), limit(200)));
  return snap.docs.map((d) => toDeviceReset(d.id, d.data()));
}

/** 요청 문서 id가 학생 uid라서 그대로 resetDevice에 넘긴다 */
export async function resolveDeviceReset(id: string): Promise<void> {
  try {
    await call('resetDevice')({ uid: id });
  } catch (e) {
    throw toApiError(e);
  }
}

/** 스태프 본인 검표 기록. 규칙상 staffUid 조건이 있어야 읽을 수 있고, 복합 색인을 피하려고 정렬은 여기서 한다 */
export async function getMyScanHistory(): Promise<ScanLog[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new ApiError('unauthenticated');
  const snap = await getDocs(query(collection(db, 'scanLogs'), where('staffUid', '==', uid), limit(500)));
  return snap.docs.map((d) => toScanLog(d.id, d.data())).sort((a, b) => b.at - a.at);
}

// ---------- 스태프 관리 (setStaff) ----------

/** 스태프와 학생회 계정. 학교 구분 없이 운영 계정 전체 */
export async function listStaff(): Promise<User[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
  return snap.docs
    .map((d) => toUser({ ...(d.data() as Omit<UserProfile, 'uid'>), uid: d.id, photoUrl: d.get('photoUrl') ?? null }, ''))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'ko') : a.role === 'admin' ? -1 : 1));
}

/** 이메일로 스태프 권한을 준다. 아직 로그인 전인 사람은 처음 로그인할 때 스태프가 된다 */
export async function addStaff(email: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  try {
    await call('setStaff')({ email: normalized, staff: true });
  } catch (e) {
    throw toApiError(e);
  }
  const found = await getDocs(query(collection(db, 'users'), where('email', '==', normalized), limit(1)));
  const d = found.docs[0];
  return d
    ? toUser({ ...(d.data() as Omit<UserProfile, 'uid'>), uid: d.id, photoUrl: d.get('photoUrl') ?? null }, '')
    : toUser({ uid: '', email: normalized, name: normalized, studentId: '', photoUrl: null, role: 'staff' }, '');
}

export async function removeStaff(uid: string): Promise<void> {
  const snap = await getDoc(doc(db, 'users', uid));
  const email = snap.get('email') as string | undefined;
  if (!email) throw new ApiError('not_found');
  try {
    await call('setStaff')({ email, staff: false });
  } catch (e) {
    throw toApiError(e);
  }
}
