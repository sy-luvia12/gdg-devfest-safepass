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
  type Event,
  type EventStats,
  type ReassignMode,
  type Reassignment,
  type ScanLog,
  type School,
  type StaffStats,
  type Ticket,
  type User,
  type VerifyResult,
  type WaitlistEntry,
} from '@/types';
import { getDeviceKeys, publicKeyJwk, setRegistered, signRefresh } from './device';
import { auth, db, functions } from './firebase';

/** 프로토타입은 행사 1개 (functions/seed.ts) */
export const EVENT_ID = import.meta.env.VITE_EVENT_ID || 'demo-festival';
const SCHOOL_ID = 'ttv';

function call<K extends keyof Callables>(name: K) {
  return httpsCallable<Callables[K][0], Callables[K][1]>(functions, name);
}

/** 백엔드 HttpsError → 화면용 ApiError */
function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof FunctionsError) {
    const code = e.code.replace('functions/', '');
    if (code === 'permission-denied') return new ApiError('not_school_account');
    if (code === 'resource-exhausted') return new ApiError('sold_out');
    if (code === 'not-found') return new ApiError('not_found');
    if (code === 'unauthenticated') return new ApiError('unauthenticated');
    if (code === 'failed-precondition' || code === 'already-exists') return new ApiError('invalid_state');
  }
  return new ApiError('unknown');
}

function deviceReason(e: unknown): string | undefined {
  if (!(e instanceof FunctionsError)) return undefined;
  const details = e.details as { reason?: string } | undefined;
  return details?.reason;
}

function toUser(p: UserProfile, deviceStatus: User['deviceStatus'] = 'registered'): User {
  return {
    uid: p.uid,
    schoolId: SCHOOL_ID,
    name: p.name,
    studentId: p.studentId,
    email: p.email,
    photoUrl: p.photoUrl ?? '',
    role: p.role,
    // 재학생 승인은 백엔드 다음 단계(2.3). 지금은 통과한 것으로 본다
    verifyStatus: 'approved',
    deviceStatus,
  };
}

function millis(v: unknown): number {
  return v && typeof v === 'object' && 'toMillis' in v ? (v as { toMillis(): number }).toMillis() : 0;
}

function toEvent(id: string, d: DocumentData): Event {
  return {
    id,
    schoolId: SCHOOL_ID,
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
  };
}

function domainOf(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

// ---------- 로그인 · 학교 · 행사 ----------

export async function signInWithSchoolAccount(): Promise<User> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    const { data } = await call('ensureUser')();
    const user = await withDevice(toUser(data));
    // 학생은 행사에서 허용한 학교 도메인만 들어온다. 스태프·관리자는 시드로 정해진 계정이라 통과
    if (user.role === 'student') {
      const event = await getEvent(EVENT_ID);
      if (!event.allowedDomains.includes(domainOf(user.email))) {
        await fbSignOut(auth);
        throw new ApiError('not_school_account');
      }
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
  return withDevice(toUser(data));
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
    return { ...user, deviceStatus: await registerThisDevice(user.uid) };
  } catch {
    return user;
  }
}

export async function getSchool(_schoolId: string): Promise<School> {
  // 학교 개념은 백엔드 다음 단계. 기본 보라 테마를 쓰도록 보라색을 넣는다
  return { id: SCHOOL_ID, name: 'Tell the Vision', domain: '', brandColor: '#9C8CFF', currentEventId: EVENT_ID };
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
export async function verifyEntry(qrPayload: string): Promise<VerifyResult> {
  try {
    const { data } = await call('verifyEntry')({ qrPayload });
    if (data.ok) {
      myOkCount += 1;
      myCountListeners.forEach((f) => f());
      return { result: 'ok', ticketId: data.ticketId, user: { ...data.holder, photoUrl: data.holder.photoUrl ?? '' } };
    }
    if (data.reason === 'USED') return { result: 'used' };
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

// 행사가 하나라 eventId로 거르지 않는다 (같이 쓰면 복합 색인이 필요하다)
const scanLogsQuery = (n: number) => query(collection(db, 'scanLogs'), orderBy('scannedAt', 'desc'), limit(n));

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
    scanLogsQuery(500),
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

export async function listEntries(_eventId: string): Promise<ScanLog[]> {
  const snap = await getDocs(scanLogsQuery(500));
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
  const snap = await getDocs(query(collection(db, 'reassignments'), orderBy('createdAt', 'desc'), limit(200)));
  const names = new Map<string, string>();
  return Promise.all(
    snap.docs.map(async (d) => {
      const r = d.data();
      const ticket = await getDoc(doc(db, 'tickets', r.ticketId));
      return {
        id: d.id,
        ticketId: r.ticketId,
        eventId: (ticket.get('eventId') as string | undefined) ?? eventId,
        nftTokenId: (ticket.get('nftNumber') as string | undefined) ?? '-',
        fromName: (await userName(r.fromUid, names)) ?? '알 수 없음',
        toName: await userName(r.toUid, names),
        mode: r.mode === 'random' ? 'random' : 'queue',
        outcome: r.toUid ? 'reassigned' : 'released',
        createdAt: millis(r.createdAt),
      } satisfies Reassignment;
    }),
  );
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
