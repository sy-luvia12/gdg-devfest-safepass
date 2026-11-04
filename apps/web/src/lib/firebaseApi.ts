// 백엔드(functions/, docs/api.md)에 연결한 데이터 함수.
// 백엔드 응답을 화면이 쓰는 types.ts 모양으로 바꿔서 돌려준다.
// 백엔드에 아직 없는 값(학교, 승인 상태, 행사 테마)은 기본값을 채운다.
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
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
import type {
  Callables,
  GetRosterResponse,
  ImportRosterResponse,
  PrecheckReason,
  RosterSummary as ApiRosterSummary,
  SheetReason,
  UserProfile,
} from '../../../../functions/src/api';
import {
  ApiError,
  type CancelResult,
  type ConfirmResult,
  type DeviceResetRequest,
  type Event,
  type EventInput,
  type EventStats,
  type ReassignMode,
  type Reassignment,
  type QrRefresh,
  type QrSignature,
  type RosterImport,
  type RosterSummary,
  type RosterView,
  type ScanLog,
  type OpenSchool,
  type OpsEditResult,
  type OpsRoster,
  type OpsRosterEdit,
  type OpsRosterKind,
  type OpsStudent,
  type PrecheckResult,
  type School,
  type SchoolInput,
  type SignupInfo,
  type StaffStats,
  type Ticket,
  type TicketRow,
  type User,
  type VerifyResult,
  type WaitlistEntry,
} from '@/types';
import { describeThisDevice, getDeviceKeys, publicKeyJwk, setRegistered, signQr, signRefresh } from './device';
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
    const reason = deviceReason(e);
    if (reason === 'CANCELLED_BEFORE') return new ApiError('cancelled_before');
    if (reason === 'NOT_IN_ROSTER') return new ApiError('not_in_roster');
    if (reason === 'NOT_REGISTERED') return new ApiError('not_registered');
    if (reason && reason in SHEET_ERRORS) return new ApiError(SHEET_ERRORS[reason as SheetReason]);
    if (code === 'permission-denied') return new ApiError(reason === 'ROLE' ? 'wrong_role' : 'not_school_account');
    if (code === 'resource-exhausted') return new ApiError('sold_out');
    if (code === 'not-found') return new ApiError('not_found');
    if (code === 'unauthenticated') return new ApiError('unauthenticated');
    if (code === 'failed-precondition' || code === 'already-exists') return new ApiError('invalid_state');
  }
  return new ApiError('unknown');
}

const SHEET_ERRORS: Record<SheetReason, ApiError['code']> = {
  BAD_SHEET_URL: 'sheet_bad_url',
  SHEET_NOT_SHARED: 'sheet_not_shared',
  SHEET_NOT_FOUND: 'sheet_not_found',
  SHEETS_API_DISABLED: 'sheet_api_disabled',
  MISSING_COLUMNS: 'sheet_missing_columns',
};

/** 함수 오류의 details.reason (기기 확인 실패, 재발급 금지, 명단·시트 오류 등) */
function deviceReason(e: unknown): string | undefined {
  if (!(e instanceof FunctionsError)) return undefined;
  const details = e.details as { reason?: string } | undefined;
  return details?.reason;
}

// schoolId: 메일 도메인으로 찾은 학교. 학교 메일이 아닌 운영 계정(gmail)은 빈 값
function toUser(
  p: UserProfile,
  schoolId: string,
  deviceStatus: User['deviceStatus'] = 'registered',
  verifyStatus: User['verifyStatus'] = 'approved',
): User {
  return {
    uid: p.uid,
    schoolId,
    name: p.name,
    studentId: p.studentId,
    email: p.email,
    photoUrl: p.photoUrl ?? '',
    role: p.role,
    adminSchoolId: p.adminSchoolId,
    staffSchoolId: p.staffSchoolId,
    operator: p.operator === true ? true : undefined,
    // 재학생 명단이 있는 학교의 학생만 가입 단계를 본다 (profileToUser). 그 밖에는 통과로 본다
    verifyStatus,
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
    settings: { requireRoster: d.requireRoster === true },
    roster: rosterSummary(d.roster),
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
    studentRoster: rosterSummary(d.studentRoster),
  };
}

/** 학교·행사 문서의 명단 요약 필드 (importedAt은 Timestamp) */
function rosterSummary(v: unknown): RosterSummary | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as DocumentData;
  return { sheetUrl: r.sheetUrl ?? '', importedAt: millis(r.importedAt), count: r.count ?? 0 };
}

/** 메일 도메인이 속한 학교와 재학생 명단이 있는지. 없으면 null */
async function schoolForEmail(email: string): Promise<{ id: string; hasRoster: boolean } | null> {
  const snap = await getDocs(
    query(collection(db, 'schools'), where('domains', 'array-contains', domainOf(email)), limit(1)),
  );
  const d = snap.docs[0];
  return d ? { id: d.id, hasRoster: !!d.get('studentRoster') } : null;
}

/**
 * 학생은 학교 메일이어야 한다. 스태프·관리자는 시드로 정해진 계정이라 학교 없이 들어와 학교를 고른다.
 * 재학생 명단이 있는 학교의 학생은 가입(명단 대조)을 마쳐야 들어오고, 사진을 안 냈으면 verifyStatus 'none'(→ /onboarding).
 */
async function profileToUser(p: UserProfile): Promise<User | null> {
  const school = await schoolForEmail(p.email);
  if (!school && p.role === 'student') return null;
  if (p.role === 'student' && school?.hasRoster) {
    if (!p.rosterVerified) throw new ApiError('not_registered');
    return withDevice(toUser(p, school.id, 'registered', p.photoSubmitted ? 'approved' : 'none'));
  }
  return withDevice(toUser(p, school?.id ?? ''));
}

// ---------- 로그인 · 학교 · 행사 ----------

/** 구글 로그인. 운영진(스태프·학생회)용. 학생은 메일 링크(sendSignInLink)로 들어온다 */
export async function signInWithSchoolAccount(): Promise<User> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    const { data } = await call('ensureUser')();
    const user = await profileToUser(data).catch(async (e) => {
      await fbSignOut(auth);
      throw e;
    });
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

// ---------- 운영진 (어둠의 운영진) ----------

/** 운영진 아이디는 이 도메인의 메일 주소로 Firebase 이메일·비밀번호 계정이 된다 (시드가 만든다) */
const OPS_EMAIL_DOMAIN = 'ops.safepass.app';
export const opsEmailOf = (id: string) => `${id.trim().toLowerCase()}@${OPS_EMAIL_DOMAIN}`;

/** 아이디·비밀번호로 운영진 계정에 들어간다. 운영진이 아닌 계정이면 로그아웃하고 wrong_password */
export async function signInAsOperator(id: string, password: string): Promise<User> {
  if (!/^[a-z0-9._-]{1,40}$/i.test(id.trim()) || !password) throw new ApiError('wrong_password');
  try {
    await signInWithEmailAndPassword(auth, opsEmailOf(id), password);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/too-many-requests') throw new ApiError('too_many_attempts');
    if (code.startsWith('auth/')) throw new ApiError('wrong_password');
    throw toApiError(e);
  }
  try {
    const { data } = await call('ensureUser')();
    if (data.role !== 'admin' || !data.operator) throw new ApiError('wrong_password');
    return toUser(data, '');
  } catch (e) {
    await fbSignOut(auth);
    throw toApiError(e);
  }
}

export async function opsListRoster(kind: OpsRosterKind, id: string): Promise<OpsRoster> {
  const { data } = await run(() => call('opsListRoster')({ kind, id }));
  return { rows: data.rows, summary: data.summary && fromApiSummary(data.summary), schoolId: data.schoolId };
}

export async function opsEditRoster(kind: OpsRosterKind, id: string, edit: OpsRosterEdit): Promise<OpsEditResult> {
  const { data } = await run(() => call('opsEditRoster')({ kind, id, ...edit }));
  return { saved: data.saved, deleted: data.deleted, skipped: data.skipped, summary: fromApiSummary(data.summary) };
}

export async function opsListStudents(schoolId: string): Promise<OpsStudent[]> {
  return (await run(() => call('opsListStudents')({ schoolId }))).data.students;
}

/** 학생 기기 등록을 지운다 (resetDevice). 다음에 로그인한 기기가 새로 등록된다 */
export async function opsResetDevice(uid: string): Promise<void> {
  await run(() => call('resetDevice')({ uid }));
}

export async function getCurrentUser(): Promise<User | null> {
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  const { data } = await call('ensureUser')();
  // 명단에서 빠진 학생(졸업·휴학)은 로그인이 풀린 것으로 본다
  return profileToUser(data).catch(() => null);
}

// ---------- 학생 가입·로그인: 메일 링크 (docs/student-auth.md) ----------

const LINK_KEY = 'safepass-email-link';
type PendingLink = { email: string; signup?: SignupInfo };

function storeLink(v: PendingLink | null) {
  try {
    if (v) localStorage.setItem(LINK_KEY, JSON.stringify(v));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    // 저장이 막힌 브라우저는 링크를 열 때 메일을 다시 묻는다
  }
}

function storedLink(): PendingLink | null {
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as PendingLink | null;
  } catch {
    return null;
  }
}

const PRECHECK_ERRORS: Record<PrecheckReason, ApiError['code']> = {
  NO_SCHOOL: 'not_school_account',
  NOT_IN_ROSTER: 'not_in_roster',
  EMAIL_MISMATCH: 'email_mismatch',
  STUDENT_ID_TAKEN: 'student_id_taken',
  NOT_REGISTERED: 'not_registered',
};

/** 가입 화면의 학교 고르기. 재학생 명단을 불러온 학교만 (로그인 전에 부른다) */
export async function listOpenSchools(): Promise<OpenSchool[]> {
  return (await run(() => call('listOpenSchools')())).data.schools;
}

/**
 * 메일을 보내기 전에 명단과 맞춰 본다 (로그인 전에 부른다).
 * name이 있으면 가입: 이름·학번·메일이 명단의 한 줄과 같고 아직 가입 전이어야 한다.
 * name이 없으면 학번 로그인: 학번 줄의 메일과 같고 이미 가입했어야 한다.
 */
export async function precheckStudent(input: { email: string; studentId: string; name?: string }): Promise<PrecheckResult> {
  const { data } = await run(() => call('precheckStudent')(input));
  if (!data.ok) throw new ApiError(PRECHECK_ERRORS[data.reason]);
  return { schoolId: data.schoolId, schoolName: data.schoolName };
}

/** 학교 메일로 로그인 링크를 보낸다. 가입이면 signup(학교·이름·학번)을 같이 넘겨 두면 링크를 열 때 명단 대조까지 한다 */
export async function sendSignInLink(email: string, signup?: SignupInfo): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await run(() =>
    sendSignInLinkToEmail(auth, normalized, { url: `${location.origin}/auth/finish`, handleCodeInApp: true }),
  );
  storeLink({ email: normalized, signup });
}

/** 지금 주소가 메일의 로그인 링크인지 (/auth/finish 화면에서) */
export function isSignInLink(href: string): boolean {
  return isSignInWithEmailLink(auth, href);
}

/** 링크를 보낸 브라우저면 메일을 기억하고 있다. 다른 기기에서 열었으면 null → 화면에서 메일을 다시 묻는다 */
export function pendingSignInEmail(): string | null {
  return storedLink()?.email ?? null;
}

/**
 * 링크로 로그인한다. 가입 중이면 명단 대조(verifyStudentRoster)까지 하고, 사진 전이라 verifyStatus 'none'으로 돌아온다.
 * 가입하지 않은 메일이면 로그아웃하고 ApiError('not_registered').
 */
export async function completeSignInLink(href: string, email?: string): Promise<User> {
  const pending = storedLink();
  const address = (email ?? pending?.email ?? '').trim().toLowerCase();
  if (!address) throw new ApiError('invalid_state');
  try {
    await signInWithEmailLink(auth, address, href);
    await call('ensureUser')();
    // 가입 정보는 같은 메일로 보낸 링크일 때만 쓴다
    const signup = pending?.email === address ? pending.signup : undefined;
    if (signup) await verifyStudentRoster(signup.schoolId, signup.name, signup.studentId);
    storeLink(null);
    const { data } = await call('ensureUser')();
    const user = await profileToUser(data);
    if (!user) throw new ApiError('not_school_account');
    return user;
  } catch (e) {
    await fbSignOut(auth);
    throw toApiError(e);
  }
}

/** 가입 마지막 단계: 검표 때 보여줄 본인 사진 (ImagePicker의 JPEG data URL) */
export async function submitProfilePhoto(photoDataUrl: string): Promise<User> {
  const { data } = await run(() => call('submitProfilePhoto')({ photoDataUrl }));
  const user = await profileToUser(data.profile);
  if (!user) throw new ApiError('not_school_account');
  return user;
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

// ---------- 스페이스 · 명단 · 행사 등록 (관리자) ----------

const fromApiSummary = (r: ApiRosterSummary): RosterSummary => ({ sheetUrl: r.sheetUrl, importedAt: r.importedAtMs, count: r.count });
const toRosterView = (r: GetRosterResponse): RosterView => ({
  summary: r.summary && fromApiSummary(r.summary),
  entries: r.entries,
  serviceAccountEmail: r.serviceAccountEmail,
});
const toRosterImport = (r: ImportRosterResponse): RosterImport => ({ summary: fromApiSummary(r.summary), skipped: r.skipped });

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toApiError(e);
  }
}

export async function upsertSchool(schoolId: string, input: SchoolInput): Promise<School> {
  try {
    await call('upsertSchool')({ schoolId, name: input.name, domains: [input.domain], brandColor: input.brandColor });
  } catch (e) {
    // 같은 메일 도메인을 다른 학교가 쓰고 있으면 already-exists
    if (e instanceof FunctionsError && e.code === 'functions/already-exists') throw new ApiError('domain_taken');
    throw toApiError(e);
  }
  return getSchool(schoolId);
}

export async function getStudentRoster(schoolId: string): Promise<RosterView> {
  return toRosterView((await run(() => call('getStudentRoster')({ schoolId }))).data);
}

export async function importStudentRoster(schoolId: string, sheetUrl: string): Promise<RosterImport> {
  return toRosterImport((await run(() => call('importStudentRoster')({ schoolId, sheetUrl }))).data);
}

export async function getEventRoster(eventId: string): Promise<RosterView> {
  return toRosterView((await run(() => call('getEventRoster')({ eventId }))).data);
}

export async function importEventRoster(eventId: string, sheetUrl: string): Promise<RosterImport> {
  return toRosterImport((await run(() => call('importEventRoster')({ eventId, sheetUrl }))).data);
}

export async function createEvent(input: EventInput): Promise<Event> {
  const { data } = await run(() => call('createEvent')(input));
  return getEvent(data.eventId);
}

export async function updateEvent(eventId: string, patch: Partial<Omit<EventInput, 'schoolIds'>>): Promise<Event> {
  await run(() => call('updateEvent')({ eventId, ...patch }));
  return getEvent(eventId);
}

/** 행사 설정 화면의 "명단에 있는 학생만 발급" */
export async function updateEventSettings(eventId: string, settings: Event['settings']): Promise<Event> {
  return updateEvent(eventId, { requireRoster: settings.requireRoster });
}

/** 회원가입: 학번·이름이 재학생 명단의 그 줄과 맞고, 로그인한 메일이 그 줄의 메일이어야 한다 */
export async function verifyStudentRoster(schoolId: string, name: string, studentId: string): Promise<User> {
  const { data } = await run(() => call('verifyStudentRoster')({ schoolId, name, studentId }));
  if (!data.ok) {
    if (data.reason === 'EMAIL_MISMATCH') throw new ApiError('email_mismatch');
    if (data.reason === 'STUDENT_ID_TAKEN') throw new ApiError('student_id_taken');
    throw new ApiError('not_in_roster');
  }
  return withDevice(toUser(data.profile, schoolId));
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

/** 내 입장권 실시간 구독. 재배정·입장·취소가 새로고침 없이 바로 반영된다 */
export function subscribeMyTicket(
  eventId: string,
  cb: (ticket: Ticket | null) => void,
  onError?: () => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onError?.();
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'tickets'), where('ownerUid', '==', uid), where('eventId', '==', eventId), limit(1)),
    (snap) => {
      const d = snap.docs[0];
      cb(d ? toTicket(d.id, d.data()) : null);
    },
    () => onError?.(),
  );
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

async function requestQr(ticketId: string, uid: string): Promise<QrRefresh> {
  // 키 생성·서명이 실패하면(WebCrypto 없는 http 등) deviceProof 키 자체를 뺀다. undefined를 보내면 SDK가 null로 바꾼다
  let proof: Awaited<ReturnType<typeof signRefresh>> | undefined;
  try {
    proof = await signRefresh((await getDeviceKeys(uid)).keys, ticketId);
  } catch {
    proof = undefined;
  }
  const { data } = await call('refreshQrToken')(proof ? { ticketId, deviceProof: proof } : { ticketId });
  const token = data.qrPayload.split(':')[2] ?? '';
  // 서명을 못 붙여도 서명 없는 QR(TTV1)로 계속 보여준다. 서버가 서명을 요구하면 그때 검표에서 거부된다
  let signature: QrSignature | undefined;
  try {
    signature = await signQr((await getDeviceKeys(uid)).keys, ticketId, token);
  } catch {
    signature = undefined;
  }
  return { token, expiresAt: data.expiresAt, signature };
}

/** 기기 서명을 붙여 새 QR을 받는다. 다른 기기에 등록된 계정이면 ApiError('device_blocked') */
export async function refreshQrToken(ticketId: string): Promise<QrRefresh> {
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
export function formatQrPayload(ticketId: string, token: string, signature?: QrSignature): string {
  if (signature) return `TTV2:${ticketId}:${token}:${signature.signedAt}:${signature.signature}`;
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

function countMyEntry() {
  myOkCount += 1;
  myCountListeners.forEach((f) => f());
}

/** 2단계 검표가 꺼진 행사는 찍는 순간 입장 처리한다. 켜진 행사는 needs_confirm으로 돌려주고 confirmEntry를 기다린다 */
export async function verifyEntry(qrPayload: string, eventId?: string): Promise<VerifyResult> {
  try {
    const { data } = await call('verifyEntry')({ qrPayload, eventId });
    if (data.ok) {
      const user = { ...data.holder, photoUrl: data.holder.photoUrl ?? '' };
      if (data.needsConfirm) return { result: 'needs_confirm', ticketId: data.ticketId, user };
      countMyEntry();
      return { result: 'ok', ticketId: data.ticketId, user };
    }
    if (data.reason === 'USED') return { result: 'used' };
    if (data.reason === 'WRONG_EVENT') return { result: 'wrong_event' };
    if (data.reason === 'SIGNATURE_INVALID') return { result: 'signature_invalid' };
    if (data.reason === 'EXPIRED' || data.reason === 'TOKEN_MISMATCH') return { result: 'expired' };
    return { result: 'invalid' };
  } catch (e) {
    throw toApiError(e);
  }
}

/** 2단계 검표의 스태프 답. match true면 입장 처리, false면 mismatch로 기록 */
export async function confirmEntry(ticketId: string, match: boolean): Promise<ConfirmResult> {
  try {
    const { data } = await call('confirmEntry')({ ticketId, match });
    if (data.ok) {
      countMyEntry();
      return { result: 'ok' };
    }
    if (data.reason === 'MISMATCH') return { result: 'mismatch' };
    if (data.reason === 'USED') return { result: 'used' };
    if (data.reason === 'NO_PENDING_CHECK') return { result: 'no_pending' };
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

/** 스태프와 학생회 계정. 지금 보는 학교에 속한 계정과 학교가 정해지지 않은 팀 계정 */
export async function listStaff(): Promise<User[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
  return snap.docs
    .filter((d) => {
      const school = d.get('role') === 'admin' ? d.get('adminSchoolId') : d.get('staffSchoolId');
      return !school || school === viewerSchoolId;
    })
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
