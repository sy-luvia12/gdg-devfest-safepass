// 백엔드(functions/, docs/api.md)에 연결한 데이터 함수.
// 백엔드 응답을 화면이 쓰는 types.ts 모양으로 바꿔서 돌려준다.
// 백엔드에 아직 없는 값(학교, 승인 상태, 기기, 행사 장소·테마)은 기본값을 채운다.
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { FunctionsError, httpsCallable } from 'firebase/functions';
import type { Callables, UserProfile } from '../../../../functions/src/api';
import { ApiError, type CancelResult, type Event, type EventStats, type School, type StaffStats, type Ticket, type User, type VerifyResult } from '@/types';
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

function toUser(p: UserProfile): User {
  return {
    uid: p.uid,
    schoolId: SCHOOL_ID,
    name: p.name,
    studentId: p.studentId,
    email: p.email,
    photoUrl: p.photoUrl ?? '',
    role: p.role,
    // 재학생 승인·기기 등록은 백엔드 다음 단계(2.2, 2.3). 지금은 통과한 것으로 본다
    verifyStatus: 'approved',
    deviceStatus: 'registered',
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
    // 토큰이 없거나 지났으면 qrExpiresAt이 0이라 화면이 바로 refreshQrToken을 부른다
    qrToken: d.qrToken ?? '',
    qrExpiresAt: millis(d.qrExpiresAt),
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
    const user = toUser(data);
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
  return toUser(data);
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

export async function refreshQrToken(ticketId: string): Promise<{ token: string; expiresAt: number }> {
  try {
    const { data } = await call('refreshQrToken')({ ticketId });
    return { token: data.qrPayload.split(':')[2] ?? '', expiresAt: data.expiresAt };
  } catch (e) {
    throw toApiError(e);
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

// 내가 처리한 입장 수. 백엔드에 검표 기록이 아직 없어서 이 탭에서 센다
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

/** 입장 인원만 실시간. 거부 수·최근 기록은 백엔드에 검표 기록이 생기면 채운다 */
export function subscribeEventStats(eventId: string, cb: (s: EventStats) => void): () => void {
  return watchEvent(eventId, (e) => cb({ enteredCount: e.enteredCount, capacity: e.capacity, rejectedCount: 0, recent: [] }));
}
