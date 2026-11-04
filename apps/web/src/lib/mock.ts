// 백엔드 완성 전 가짜 데이터. 함수 이름·시그니처는 CLAUDE.md "데이터 함수 계약"과 같다.
// 상태는 localStorage에 두고 storage 이벤트로 탭끼리 맞춘다 → 학생 탭 / 검표 탭 / 관리자 탭 데모 가능.
// 로그인은 탭마다 따로(sessionStorage)라서 탭마다 다른 역할·학교로 들어갈 수 있다.

import {
  ApiError,
  type CancelResult,
  type DeviceResetRequest,
  type Event,
  type EventSettings,
  type EventStats,
  type EventTheme,
  type Reassignment,
  type ReassignMode,
  type RosterEntry,
  type ScanLog,
  type ScanResult,
  type School,
  type StaffStats,
  type Ticket,
  type TicketHistoryItem,
  type TicketRow,
  type User,
  type VerifyResult,
  type WaitlistEntry,
} from '@/types';

import registry from './fixtures/studentRegistry.json';
import { matchesStudent, type StudentIdentity } from '../../../../functions/src/domain/studentRegistry';

const STATE_KEY = 'safepass-mock-v5';
const SESSION_KEY = 'safepass-mock-session';
const SELECTED_KEY = 'safepass-mock-selected';
const QR_TTL_MS = 30_000;
const LATENCY_MS = 300;

type Roster = { sheetUrl: string; importedAt: number; entries: RosterEntry[] };

type MockState = {
  schools: School[];
  users: User[];
  events: Event[];
  tickets: Ticket[];
  /** 지난 QR 토큰. 캡처한 QR을 "만료"로 판정하기 위해 남겨 둔다. */
  pastTokens: Record<string, string>; // token → ticketId
  reassignments: Reassignment[];
  waitlists: Record<string, WaitlistEntry[]>; // eventId → 대기 명단
  scanLogs: ScanLog[];
  rosters: Record<string, Roster>; // eventId → 명단
  deviceResets: DeviceResetRequest[];
  seq: number;
};

// ---------- 시드: 가상의 학교 3곳 (상징색 빨강·파랑·초록) ----------

type SeedPerson = {
  key: string;
  name: string;
  studentId: string;
  local: string;
  role: User['role'];
  hasTicket?: boolean;
  verify?: User['verifyStatus'];
  blocked?: boolean;
  /** 데모 패널에 보여줄지 */
  demo?: string;
};

type SeedSchool = {
  school: Omit<School, 'currentEventId'>;
  event: Pick<Event, 'name' | 'date' | 'place' | 'capacity' | 'faceValue' | 'enteredCount' | 'issuedCount'>;
  people: SeedPerson[];
};

// 학교마다 같은 구성: 학생 2(1명은 입장권 보유), 첫 로그인 학생, 기기 변경 학생, 스태프, 학생회, 승인 대기 2명
const people = (n: string[], ids: string[], locals: string[]): SeedPerson[] => [
  { key: 's1', name: n[0], studentId: ids[0], local: locals[0], role: 'student', demo: '학생' },
  { key: 's2', name: n[1], studentId: ids[1], local: locals[1], role: 'student', hasTicket: true, demo: '학생·입장권 있음' },
  { key: 'new', name: n[2], studentId: ids[2], local: locals[2], role: 'student', verify: 'none', demo: '첫 로그인' },
  { key: 'moved', name: n[3], studentId: ids[3], local: locals[3], role: 'student', blocked: true, demo: '기기 바꿈' },
  { key: 'staff', name: n[4], studentId: ids[4], local: locals[4], role: 'staff', demo: '스태프' },
  { key: 'admin', name: n[5], studentId: ids[5], local: 'council', role: 'admin', demo: '학생회' },
  { key: 'ap1', name: n[6], studentId: ids[6], local: locals[6], role: 'student', verify: 'pending' },
  { key: 'ap2', name: n[7], studentId: ids[7], local: locals[7], role: 'student', verify: 'pending' },
];

const SEED: SeedSchool[] = [
  {
    school: { id: 'hanbit', name: '한빛대학교', domain: 'hanbit.ac.kr', brandColor: '#C8102E' },
    event: {
      name: '2026 한빛 대동제',
      date: '2026-11-06T18:00:00+09:00',
      place: '대운동장 특설무대',
      capacity: 500,
      faceValue: 0,
      enteredCount: 311,
      issuedCount: 427,
    },
    people: people(
      ['김하늘', '이도윤', '송하윤', '남궁민', '최민준', '정유진', '문가은', '홍준서'],
      ['20231234', '20220517', '20260031', '20220874', '20210342', '20210911', '20250412', '20240977'],
      ['haneul', 'doyoon', 'hayun', 'nmin', 'minjun', '', 'gaeun', 'junseo'],
    ),
  },
  {
    school: { id: 'pureun', name: '푸른대학교', domain: 'pureun.ac.kr', brandColor: '#0B4EA2' },
    event: {
      name: '2026 푸른 축제',
      date: '2026-11-07T17:30:00+09:00',
      place: '노천극장',
      capacity: 800,
      faceValue: 5000,
      enteredCount: 512,
      issuedCount: 690,
    },
    people: people(
      ['박서연', '한지우', '권나은', '서도경', '오세린', '강민호', '류시온', '백예준'],
      ['20240088', '20230745', '20260117', '20221390', '20220156', '20210488', '20250236', '20240561'],
      ['seoyeon', 'jiwoo', 'naeun', 'dokyung', 'serin', '', 'sion', 'yejun'],
    ),
  },
  {
    school: { id: 'chorok', name: '초록대학교', domain: 'chorok.ac.kr', brandColor: '#00843D' },
    event: {
      name: '2026 초록 가을제',
      date: '2026-11-08T18:00:00+09:00',
      place: '중앙 잔디광장',
      capacity: 300,
      faceValue: 0,
      enteredCount: 278, // 정원에 거의 찬 행사
      issuedCount: 296,
    },
    people: people(
      ['윤채원', '임도현', '차은솔', '구본우', '송지훈', '배수아', '탁하람', '편지성'],
      ['20230312', '20221108', '20260204', '20231577', '20220901', '20210233', '20250618', '20240349'],
      ['chaewon', 'dohyun', 'eunsol', 'bonwoo', 'jihoon', '', 'haram', 'jisung'],
    ),
  },
];

/** 로그인 화면 데모 패널용 계정 목록 (학교별) */
export const MOCK_SCHOOL_ACCOUNTS = SEED.map(({ school, people: ps }) => ({
  school: { id: school.id, name: school.name, brandColor: school.brandColor },
  accounts: ps
    .filter((p) => p.demo)
    .map((p) => ({ uid: `${school.id}-${p.key}`, label: `${p.demo} ${p.name}` })),
}));
export const MOCK_OUTSIDER = { uid: 'outsider', label: '개인 Gmail (외부인)' };
const DEFAULT_ACCOUNT = 'hanbit-s1';

const photo = (uid: string) => `/mock/${uid}.svg`;
const FAKE_NAMES = ['윤지호', '강예린', '조현우', '한소율', '서지안', '임태윤', '신유나', '오다온', '장민재', '하지민'];

function seed(): MockState {
  const now = Date.now();
  const s: MockState = {
    schools: [],
    users: [],
    events: [],
    tickets: [],
    pastTokens: {},
    reassignments: [],
    waitlists: {},
    scanLogs: [],
    rosters: {},
    deviceResets: [],
    seq: 100,
  };
  const logResults: ScanResult[] = ['ok', 'ok', 'expired', 'ok', 'used', 'ok', 'expired', 'ok', 'invalid', 'ok'];

  for (const { school, event, people: ps } of SEED) {
    const eventId = `${school.id}-2026-fall`;
    s.schools.push({ ...school, currentEventId: eventId });
    s.events.push({
      ...event,
      id: eventId,
      schoolId: school.id,
      schoolIds: [school.id],
      allowedDomains: [school.domain],
      theme: { source: 'school', colors: [] },
      settings: { requireRoster: false },
      reassignMode: 'queue',
      allowReissueAfterCancel: false,
      dataRetentionDays: 7,
    });
    for (const p of ps) {
      const uid = `${school.id}-${p.key}`;
      const verify = p.verify ?? 'approved';
      s.users.push({
        uid,
        schoolId: school.id,
        name: p.name,
        studentId: p.studentId,
        email: `${p.local || 'council'}@${school.domain}`,
        photoUrl: photo(uid),
        role: p.role,
        verifyStatus: verify,
        idCardUrl: verify === 'pending' ? `/mock/idcard-${uid}.svg` : undefined,
        submittedAt: verify === 'pending' ? now - (p.key === 'ap1' ? 3_600_000 : 900_000) : undefined,
        deviceStatus: p.blocked ? 'blocked' : 'registered',
        deviceName: p.blocked ? 'iPhone 13 (이전 기기)' : 'iPhone 15',
      });
      if (p.hasTicket) {
        const ticket: Ticket = {
          id: `t-${uid}`,
          eventId,
          ownerUid: uid,
          nftTokenId: `#${String(event.issuedCount).padStart(4, '0')}`,
          status: 'issued',
          qrToken: randomToken(),
          qrExpiresAt: now + QR_TTL_MS,
          issuedAt: now - 2 * 86_400_000,
        };
        s.tickets.push(ticket);
        // 취소·재배정 기록 (관리자 "취소·재배정" 데모)
        s.reassignments.push(
          {
            id: `seed-ra-${school.id}-1`,
            ticketId: `seed-${school.id}-cancel-1`,
            eventId,
            nftTokenId: `#${String(event.issuedCount - 40).padStart(4, '0')}`,
            fromName: FAKE_NAMES[1],
            toName: FAKE_NAMES[4],
            mode: 'queue',
            outcome: 'reassigned',
            createdAt: now - 7_200_000,
          },
          {
            id: `seed-ra-${school.id}-2`,
            ticketId: `seed-${school.id}-cancel-2`,
            eventId,
            nftTokenId: `#${String(event.issuedCount - 12).padStart(4, '0')}`,
            fromName: FAKE_NAMES[3],
            mode: 'queue',
            outcome: 'reassigned',
            toName: FAKE_NAMES[5],
            createdAt: now - 2_700_000,
          },
        );
      }
    }
    const staffUid = `${school.id}-staff`;
    logResults.forEach((result, i) => {
      s.scanLogs.push({
        id: `seed-${school.id}-${i}`,
        eventId,
        userName: FAKE_NAMES[i],
        studentId: `2023${String(1000 + i * 37)}`,
        staffUid,
        result,
        at: now - (i + 1) * 47_000,
      });
    });
    // 대기 명단: 앞의 두 명은 이미 배정받음. 승인 대기 학생도 줄 서 있다
    s.waitlists[eventId] = [
      { email: `wait1@${school.domain}`, name: FAKE_NAMES[4], order: 1, status: 'assigned' },
      { email: `wait2@${school.domain}`, name: FAKE_NAMES[5], order: 2, status: 'assigned' },
      { email: `wait3@${school.domain}`, name: FAKE_NAMES[7], order: 3, status: 'waiting' },
      { email: `wait4@${school.domain}`, name: FAKE_NAMES[8], order: 4, status: 'waiting' },
      { email: `wait5@${school.domain}`, name: FAKE_NAMES[9], order: 5, status: 'waiting' },
    ];
    s.deviceResets.push({
      id: `seed-reset-${school.id}`,
      uid: `${school.id}-fake`,
      userName: FAKE_NAMES[6],
      studentId: '20230558',
      deviceName: 'Galaxy S22',
      requestedAt: now - 1_800_000,
      status: 'pending',
    });
  }
  s.users.push({
    uid: 'outsider',
    schoolId: '',
    name: '외부인',
    studentId: '',
    email: 'someone@gmail.com',
    photoUrl: '/mock/outsider.svg',
    role: 'student',
    verifyStatus: 'none',
    deviceStatus: 'registered',
  });
  return s;
}

// ---------- 저장소 ----------

function load(): MockState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // 손상된 값이면 새로 만든다
  }
  const s = seed();
  save(s);
  return s;
}

const localListeners = new Set<() => void>();

function save(s: MockState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
  // storage 이벤트는 다른 탭에만 오므로 같은 탭 구독자는 직접 깨운다
  localListeners.forEach((fn) => fn());
}

function onChange(fn: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === STATE_KEY || e.key === null) fn();
  };
  window.addEventListener('storage', handler);
  localListeners.add(fn);
  return () => {
    window.removeEventListener('storage', handler);
    localListeners.delete(fn);
  };
}

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

function randomToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function fakeTxHash(seedText: string) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `0x${part(h)}${part(h * 31)}${part(h * 17)}${part(h * 7)}`;
}

function nextId(s: MockState, prefix: string) {
  s.seq += 1;
  return `${prefix}-${s.seq}`;
}

function currentUid(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

function requireUser(s: MockState, roles?: User['role'][]): User {
  const uid = currentUid();
  const user = s.users.find((u) => u.uid === uid);
  if (!user || (roles && !roles.includes(user.role))) throw new ApiError('unauthenticated');
  return user;
}

function findEvent(s: MockState, eventId: string): Event {
  const event = s.events.find((e) => e.id === eventId);
  if (!event) throw new ApiError('not_found');
  return event;
}

function myEvent(s: MockState, user: User): Event {
  const id = s.schools.find((sc) => sc.id === user.schoolId)?.currentEventId;
  if (!id) throw new ApiError('not_found');
  return findEvent(s, id);
}

function domainOf(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function rotateToken(s: MockState, t: Ticket) {
  s.pastTokens[t.qrToken] = t.id;
  t.qrToken = randomToken();
  t.qrExpiresAt = Date.now() + QR_TTL_MS;
}

function userByEmail(s: MockState, email: string) {
  return s.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

function addLog(s: MockState, event: Event, staff: User, result: ScanResult, t?: Ticket) {
  const owner = t && s.users.find((u) => u.uid === t.ownerUid);
  s.scanLogs.unshift({
    id: nextId(s, 'log'),
    eventId: event.id,
    ticketId: t?.id,
    userName: owner?.name,
    userPhotoUrl: owner?.photoUrl,
    studentId: owner?.studentId,
    staffUid: staff.uid,
    result,
    at: Date.now(),
  });
  s.scanLogs = s.scanLogs.slice(0, 300);
}

function subscribe<T>(compute: (s: MockState) => T | null, cb: (v: T) => void): () => void {
  const emit = () => {
    const v = compute(load());
    if (v !== null) cb(v);
  };
  const timer = setTimeout(emit, LATENCY_MS);
  const off = onChange(emit);
  return () => {
    clearTimeout(timer);
    off();
  };
}

// ---------- 계약 함수: 로그인·학교·행사 ----------

export async function signInWithSchoolAccount(): Promise<User> {
  await wait();
  const s = load();
  const uid = sessionStorage.getItem(SELECTED_KEY) ?? DEFAULT_ACCOUNT;
  const user = s.users.find((u) => u.uid === uid);
  if (!user) throw new ApiError('unknown');
  if (!s.schools.some((sc) => sc.domain === domainOf(user.email))) throw new ApiError('not_school_account');
  sessionStorage.setItem(SESSION_KEY, user.uid);
  return user;
}

export async function signOut(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
}

/** 새로고침 후 로그인 상태 복원용 (Firebase는 onAuthStateChanged로 구현) */
export async function getCurrentUser(): Promise<User | null> {
  const s = load();
  const uid = currentUid();
  return s.users.find((u) => u.uid === uid) ?? null;
}

export async function getSchool(schoolId: string): Promise<School> {
  const s = load();
  const school = s.schools.find((sc) => sc.id === schoolId);
  if (!school) throw new ApiError('not_found');
  return school;
}

/** 학교가 참여하는 행사. mock은 학교당 1개 */
export async function listEvents(schoolId: string): Promise<Event[]> {
  return load().events.filter((e) => e.schoolId === schoolId);
}

/** 관리자·스태프가 고를 수 있는 학교. mock은 자기 학교만 */
export async function listSchools(): Promise<School[]> {
  const s = load();
  const uid = currentUid();
  const user = s.users.find((u) => u.uid === uid);
  return s.schools.filter((sc) => sc.id === user?.schoolId);
}

export async function getEvent(eventId: string): Promise<Event> {
  await wait();
  return findEvent(load(), eventId);
}

export async function updateEventTheme(eventId: string, theme: EventTheme): Promise<Event> {
  await wait();
  const s = load();
  const user = requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  if (user.schoolId !== event.schoolId) throw new ApiError('unauthenticated');
  event.theme = { source: theme.source, colors: theme.source === 'event' ? theme.colors.slice(0, 3) : [] };
  save(s);
  return event;
}

export async function updateEventSettings(eventId: string, settings: EventSettings): Promise<Event> {
  await wait();
  const s = load();
  const user = requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  if (user.schoolId !== event.schoolId) throw new ApiError('unauthenticated');
  event.settings = { ...settings };
  save(s);
  return event;
}

// ---------- 재학생 승인 · 기기 (기술 설계 2.2~2.3) ----------

/** 사진은 data URL (프로토타입). 실제는 Storage 업로드 후 경로를 넘긴다. */
export async function submitVerification(photoDataUrl: string, idCardDataUrl: string, identity?: Pick<StudentIdentity, 'name' | 'studentId'>): Promise<User> {
  await wait();
  const s = load();
  const user = requireUser(s, ['student']);
  if (user.verifyStatus === 'approved') return user;
  if (!photoDataUrl || !idCardDataUrl) throw new ApiError('invalid_state');
  if (identity) Object.assign(user, { name: identity.name.trim(), studentId: identity.studentId.trim() });
  user.photoUrl = photoDataUrl;
  user.idCardUrl = idCardDataUrl;
  user.verifyStatus = matchesStudent(user, registry) ? 'approved' : 'rejected';
  user.rejectReason = user.verifyStatus === 'rejected' ? '학적 명단과 일치하지 않아요. 이름·학번·학교 계정을 확인하고, 계속 실패하면 학교 담당자에게 문의해 주세요.' : undefined;
  user.submittedAt = Date.now();
  save(s);
  return user;
}

export async function listPendingVerifications(): Promise<User[]> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  return s.users
    .filter((u) => u.schoolId === admin.schoolId && u.verifyStatus === 'pending')
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
}

export async function reviewVerification(uid: string, approve: boolean, reason?: string): Promise<void> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  const user = s.users.find((u) => u.uid === uid && u.schoolId === admin.schoolId);
  if (!user || user.verifyStatus !== 'pending') throw new ApiError('invalid_state');
  if (approve && !matchesStudent(user, registry)) throw new ApiError('not_in_roster');
  user.verifyStatus = approve ? 'approved' : 'rejected';
  user.rejectReason = approve ? undefined : reason || '사진을 확인할 수 없어요';
  save(s);
}

export async function requestDeviceReset(): Promise<DeviceResetRequest> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const existing = s.deviceResets.find((r) => r.uid === user.uid && r.status === 'pending');
  if (existing) return existing;
  const req: DeviceResetRequest = {
    id: nextId(s, 'reset'),
    uid: user.uid,
    userName: user.name,
    studentId: user.studentId,
    deviceName: user.deviceName ?? '알 수 없는 기기',
    requestedAt: Date.now(),
    status: 'pending',
  };
  s.deviceResets.push(req);
  save(s);
  return req;
}

export async function getMyDeviceReset(): Promise<DeviceResetRequest | null> {
  const s = load();
  const user = requireUser(s);
  return s.deviceResets.find((r) => r.uid === user.uid && r.status === 'pending') ?? null;
}

export async function listDeviceResets(): Promise<DeviceResetRequest[]> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  const schoolUids = new Set(s.users.filter((u) => u.schoolId === admin.schoolId).map((u) => u.uid));
  return s.deviceResets
    .filter((r) => schoolUids.has(r.uid) || r.uid.startsWith(`${admin.schoolId}-`))
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

export async function resolveDeviceReset(id: string): Promise<void> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const req = s.deviceResets.find((r) => r.id === id);
  if (!req) throw new ApiError('not_found');
  req.status = 'done';
  const user = s.users.find((u) => u.uid === req.uid);
  if (user) {
    user.deviceStatus = 'registered';
    user.deviceName = '새 기기';
  }
  save(s);
}

/** 학생 이메일로 기기 등록을 지운다 (관리자 직접 초기화) */
export async function resetDeviceByEmail(email: string): Promise<string> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const user = userByEmail(s, email);
  if (!user) throw new ApiError('not_found');
  user.deviceStatus = 'registered';
  s.deviceResets.filter((r) => r.uid === user.uid).forEach((r) => (r.status = 'done'));
  save(s);
  return user.name;
}

// ---------- 입장권 ----------

export async function issueTicket(eventId: string): Promise<Ticket> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const event = findEvent(s, eventId);
  if (user.role === 'student' && user.verifyStatus !== 'approved') throw new ApiError('not_in_roster');
  if (!event.allowedDomains.includes(domainOf(user.email))) throw new ApiError('not_school_account');
  const existing = s.tickets.find((t) => t.eventId === eventId && t.ownerUid === user.uid);
  if (existing) return existing;
  // 취소한 학생은 다시 받을 수 없다 (테스트 행사만 예외)
  const cancelledBefore = s.reassignments.some((r) => r.eventId === eventId && r.fromUid === user.uid);
  if (cancelledBefore && !event.allowReissueAfterCancel) throw new ApiError('cancelled_before');
  if (event.settings.requireRoster) {
    const inRoster = s.rosters[eventId]?.entries.some((r) => r.email.toLowerCase() === user.email.toLowerCase());
    if (!inRoster) throw new ApiError('not_in_roster');
  }
  if (event.issuedCount >= event.capacity) throw new ApiError('sold_out');
  event.issuedCount += 1;
  const ticket: Ticket = {
    id: nextId(s, 't'),
    eventId,
    ownerUid: user.uid,
    nftTokenId: `#${String(event.issuedCount).padStart(4, '0')}`,
    status: 'issued',
    qrToken: randomToken(),
    qrExpiresAt: Date.now() + QR_TTL_MS,
    issuedAt: Date.now(),
  };
  s.tickets.push(ticket);
  save(s);
  return ticket;
}

export async function getMyTicket(eventId: string): Promise<Ticket | null> {
  await wait();
  const s = load();
  const user = requireUser(s);
  return s.tickets.find((t) => t.eventId === eventId && t.ownerUid === user.uid) ?? null;
}

export async function refreshQrToken(ticketId: string): Promise<{ token: string; expiresAt: number }> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const t = s.tickets.find((x) => x.id === ticketId && x.ownerUid === user.uid);
  if (!t) throw new ApiError('not_found');
  rotateToken(s, t);
  save(s);
  return { token: t.qrToken, expiresAt: t.qrExpiresAt };
}

/** QR 내용. 실제 백엔드는 TTV1: 접두사 (firebaseApi.ts) */
export function formatQrPayload(ticketId: string, token: string): string {
  return `safepass:${ticketId}:${token}`;
}

export async function getTicketHistory(ticketId: string): Promise<TicketHistoryItem[]> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const t = s.tickets.find((x) => x.id === ticketId);
  if (!t) throw new ApiError('not_found');
  const assigned = s.reassignments.find((r) => r.ticketId === ticketId && r.outcome === 'reassigned');
  const owner = s.users.find((u) => u.uid === t.ownerUid)?.name ?? '';
  const items: TicketHistoryItem[] = [
    {
      type: 'issued',
      at: t.issuedAt,
      detail: assigned ? `${assigned.fromName}님에게 발급` : `${owner}님에게 발급`,
      txHash: fakeTxHash(`${t.id}-mint`),
    },
  ];
  if (assigned) {
    items.push({
      type: 'reassigned',
      at: assigned.createdAt,
      detail: `취소표를 대기 명단에서 ${user.name}님에게 배정`,
      txHash: fakeTxHash(`${assigned.id}-reassign`),
    });
  }
  if (t.usedAt) items.push({ type: 'used', at: t.usedAt, detail: '입장 확인', txHash: fakeTxHash(`${t.id}-used`) });
  return items.sort((a, b) => a.at - b.at);
}

// ---------- 입장권 취소 → 대기 명단 재배정 (양도 대체) ----------

function candidates(mode: ReassignMode, waiting: WaitlistEntry[]): WaitlistEntry[] {
  const list = [...waiting];
  if (mode === 'queue') return list.sort((a, b) => a.order - b.order);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** 주인이 취소하면 운영진이 정한 방식(순서/무작위)으로 대기자에게 넘긴다. 받을 사람이 없으면 다시 발급 가능 */
export async function cancelTicket(ticketId: string): Promise<CancelResult> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const ticket = s.tickets.find((t) => t.id === ticketId && t.ownerUid === me.uid);
  if (!ticket) throw new ApiError('not_found');
  if (ticket.status === 'used') return 'used';
  const event = findEvent(s, ticket.eventId);
  const waiting = (s.waitlists[event.id] ?? []).filter((w) => w.status === 'waiting');
  const next = candidates(event.reassignMode, waiting).find((w) => {
    const account = userByEmail(s, w.email);
    return !account || !s.tickets.some((t) => t.eventId === event.id && t.ownerUid === account.uid);
  });
  const record: Reassignment = {
    id: nextId(s, 'ra'),
    ticketId,
    eventId: event.id,
    nftTokenId: ticket.nftTokenId,
    fromUid: me.uid,
    fromName: me.name,
    toName: next?.name,
    mode: event.reassignMode,
    outcome: next ? 'reassigned' : 'released',
    createdAt: Date.now(),
  };
  s.reassignments.unshift(record);
  if (next) {
    // 대기자가 아직 가입 전이면 메일 주소로 자리를 잡아 둔다
    ticket.ownerUid = userByEmail(s, next.email)?.uid ?? `waitlist:${next.email}`;
    rotateToken(s, ticket);
    next.status = 'assigned';
  } else {
    s.tickets = s.tickets.filter((t) => t.id !== ticketId);
    event.issuedCount -= 1;
  }
  save(s);
  return record.outcome;
}

// ---------- 검표 ----------

export async function verifyEntry(qrPayload: string, _eventId?: string): Promise<VerifyResult> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);

  const match = /^safepass:([^:]+):([^:]+)$/.exec(qrPayload.trim());
  const found = match ? s.tickets.find((t) => t.id === match[1]) : undefined;
  const fail = (result: VerifyResult['result'], t?: Ticket): VerifyResult => {
    addLog(s, event, staff, result === 'wrong_event' ? 'invalid' : result, t);
    save(s);
    return { result };
  };
  if (!match || !found) return fail('invalid');
  // 다른 학교 행사 입장권은 기록에 그 학생 정보를 남기지 않는다
  if (found.eventId !== event.id) return fail('wrong_event');
  const ticket = found;

  const owner = s.users.find((u) => u.uid === ticket.ownerUid);
  const userView = owner && { name: owner.name, studentId: owner.studentId, photoUrl: owner.photoUrl };
  const token = match[2];

  if (ticket.status === 'used') {
    addLog(s, event, staff, 'used', ticket);
    save(s);
    return { result: 'used', usedAt: ticket.usedAt, user: userView, nftTokenId: ticket.nftTokenId };
  }
  const isCurrent = token === ticket.qrToken;
  const isPast = s.pastTokens[token] === ticket.id;
  if (!isCurrent && !isPast) return fail('invalid', ticket);
  if (isPast || Date.now() > ticket.qrExpiresAt) return fail('expired', ticket);

  ticket.status = 'used';
  ticket.usedAt = Date.now();
  event.enteredCount += 1;
  addLog(s, event, staff, 'ok', ticket);
  save(s);
  return { result: 'ok', user: userView, nftTokenId: ticket.nftTokenId, ticketId: ticket.id };
}

export function subscribeStaffStats(eventId: string, cb: (s: StaffStats) => void): () => void {
  const uid = currentUid();
  return subscribe((s) => {
    const event = s.events.find((e) => e.id === eventId);
    if (!event) return null;
    const myCount = s.scanLogs.filter((l) => l.eventId === eventId && l.staffUid === uid && l.result === 'ok').length;
    return { enteredCount: event.enteredCount, capacity: event.capacity, myCount };
  }, cb);
}

export async function getMyScanHistory(): Promise<ScanLog[]> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);
  return s.scanLogs.filter((l) => l.eventId === event.id && l.staffUid === staff.uid);
}

// ---------- 관리자 ----------

export function subscribeEventStats(eventId: string, cb: (s: EventStats) => void): () => void {
  return subscribe((s) => {
    const event = s.events.find((e) => e.id === eventId);
    if (!event) return null;
    const logs = s.scanLogs.filter((l) => l.eventId === eventId);
    return {
      enteredCount: event.enteredCount,
      capacity: event.capacity,
      rejectedCount: logs.filter((l) => l.result !== 'ok').length,
      recent: logs.slice(0, 20),
    };
  }, cb);
}

export async function listEntries(eventId: string): Promise<ScanLog[]> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  return s.scanLogs.filter((l) => l.eventId === eventId);
}

export async function listReassignments(eventId: string): Promise<Reassignment[]> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  return s.reassignments.filter((r) => r.eventId === eventId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateAllowReissue(eventId: string, allow: boolean): Promise<Event> {
  await wait();
  const s = load();
  const user = requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  if (user.schoolId !== event.schoolId) throw new ApiError('unauthenticated');
  event.allowReissueAfterCancel = allow;
  save(s);
  return event;
}

export async function getWaitlist(eventId: string): Promise<WaitlistEntry[]> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  return [...(s.waitlists[eventId] ?? [])].sort((a, b) => a.order - b.order);
}

export async function updateReassignMode(eventId: string, mode: ReassignMode): Promise<Event> {
  await wait();
  const s = load();
  const user = requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  if (user.schoolId !== event.schoolId) throw new ApiError('unauthenticated');
  event.reassignMode = mode;
  save(s);
  return event;
}

/** 실제 발급 입장권 + 시드 행사 규모에 맞춘 가짜 행 (프로토타입) */
export async function listTickets(eventId: string): Promise<TicketRow[]> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  const real: TicketRow[] = s.tickets
    .filter((t) => t.eventId === eventId)
    .map((t) => {
      const owner = s.users.find((u) => u.uid === t.ownerUid);
      const waiter = s.waitlists[eventId]?.find((w) => t.ownerUid === `waitlist:${w.email}`);
      return { ...t, ownerName: owner?.name ?? waiter?.name ?? '-', ownerStudentId: owner?.studentId ?? '' };
    });
  const now = Date.now();
  const fake: TicketRow[] = Array.from({ length: 24 }, (_, i) => {
    const used = i % 3 !== 0;
    return {
      id: `fake-${eventId}-${i}`,
      eventId,
      ownerUid: '',
      nftTokenId: `#${String(event.issuedCount - real.length - i).padStart(4, '0')}`,
      status: used ? 'used' : 'issued',
      qrToken: '',
      qrExpiresAt: 0,
      issuedAt: now - (i + 3) * 3_600_000,
      usedAt: used ? now - i * 600_000 : undefined,
      ownerName: FAKE_NAMES[i % FAKE_NAMES.length],
      ownerStudentId: `2024${String(1100 + i * 13)}`,
    };
  });
  return [...real.sort((a, b) => b.issuedAt - a.issuedAt), ...fake];
}

export async function getRoster(eventId: string): Promise<Roster | null> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  return s.rosters[eventId] ?? null;
}

/** 구글 시트 명단 불러오기 (기술 설계 2.5). mock은 학교 학생 + 가짜 행을 만든다 */
export async function importRoster(eventId: string, sheetUrl: string): Promise<Roster> {
  await wait();
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheetUrl.trim())) throw new ApiError('invalid_state');
  const school = s.schools.find((sc) => sc.id === admin.schoolId);
  const students = s.users
    .filter((u) => u.schoolId === admin.schoolId && u.role === 'student')
    .map((u) => ({ email: u.email, name: u.name, studentId: u.studentId }));
  const extra = FAKE_NAMES.map((name, i) => ({
    email: `member${i + 1}@${school?.domain}`,
    name,
    studentId: `2024${String(2000 + i * 11)}`,
  }));
  const roster: Roster = { sheetUrl: sheetUrl.trim(), importedAt: Date.now(), entries: [...students, ...extra] };
  s.rosters[eventId] = roster;
  save(s);
  return roster;
}

export async function listStaff(): Promise<User[]> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  return s.users.filter((u) => u.schoolId === admin.schoolId && u.role !== 'student');
}

export async function addStaff(email: string): Promise<User> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  const user = userByEmail(s, email);
  if (!user || user.schoolId !== admin.schoolId) throw new ApiError('not_found');
  if (user.role === 'student') user.role = 'staff';
  save(s);
  return user;
}

export async function removeStaff(uid: string): Promise<void> {
  await wait();
  const s = load();
  const admin = requireUser(s, ['admin']);
  const user = s.users.find((u) => u.uid === uid && u.schoolId === admin.schoolId);
  if (!user || user.role !== 'staff') throw new ApiError('invalid_state');
  user.role = 'student';
  save(s);
}

// ---------- 개발용 (mock 전용, 실제 api.ts에는 없음) ----------

export function mockSelectAccount(uid: string) {
  sessionStorage.setItem(SELECTED_KEY, uid);
}

export function mockSelectedAccount(): string {
  return sessionStorage.getItem(SELECTED_KEY) ?? DEFAULT_ACCOUNT;
}

export function mockReset() {
  save(seed());
}
