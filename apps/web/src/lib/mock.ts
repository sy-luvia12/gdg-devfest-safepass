// 백엔드 완성 전 가짜 데이터. 함수 이름·시그니처는 CLAUDE.md "데이터 함수 계약"과 같다.
// 상태는 localStorage에 두고 storage 이벤트로 탭끼리 맞춘다 → 학생 탭 / 검표 탭 / 관리자 탭 데모 가능.
// 로그인은 탭마다 따로(sessionStorage)라서 탭마다 다른 역할·학교로 들어갈 수 있다.

import {
  ApiError,
  type CancelResult,
  type ConfirmResult,
  type DeviceResetRequest,
  type Event,
  type EventInput,
  type EventSettings,
  type EventStats,
  type EventTheme,
  type OpenSchool,
  type OpsEditResult,
  type OpsEventAdmin,
  type OpsRoster,
  type OpsRosterEdit,
  type OpsRosterKind,
  type OpsRosterRow,
  type OpsStudent,
  type PrecheckResult,
  type QrRefresh,
  type Reassignment,
  type ReassignMode,
  type RosterEntry,
  type RosterImport,
  type RosterSkipReason,
  type RosterView,
  type ScanLog,
  type ScanResult,
  type School,
  type SchoolInput,
  type SignupInfo,
  type StaffStats,
  type Ticket,
  type TicketHistoryItem,
  type TicketRow,
  type User,
  type VerifyResult,
  type WaitlistView,
} from '@/types';
import demoDraw from './chain/demo-draw.json';
import { checkMyDraw } from './chain/draw';
import { checkEntry, entryIdOf, scoreOf, studentRefOf } from './chain/entry';
import type { ChainDraw, ChainEntry, ChainEventStatus, DrawCheck, EntryVerification, MyDrawEntry } from './chain/types';
import type { ClaimResult, EntryDraw, EntryDrawAdmin, MyLottery, RevokeResult, RosterStatus, RunDrawResult } from '@/types';

const STATE_KEY = 'safepass-mock-v10';
const SESSION_KEY = 'safepass-mock-session';
const SELECTED_KEY = 'safepass-mock-selected';
const QR_TTL_MS = 30_000;
const LATENCY_MS = 300;

type StudentRow = { email: string; name: string; studentId: string };
/** 대기 명단 한 줄 (서버처럼 메일을 키로 둔다. 화면에는 메일을 주지 않는다) */
type MockWaiter = { email: string; name: string; studentId: string; order: number; status: 'waiting' | 'assigned' };
type EventRow = { name: string; studentId: string };
type Roster<R = StudentRow | EventRow> = { sheetUrl: string; importedAt: number; entries: R[] };

type MockState = {
  schools: School[];
  users: User[];
  events: Event[];
  tickets: Ticket[];
  /** 지난 QR 토큰. 캡처한 QR을 "만료"로 판정하기 위해 남겨 둔다. */
  pastTokens: Record<string, string>; // token → ticketId
  reassignments: Reassignment[];
  waitlists: Record<string, MockWaiter[]>; // eventId → 대기 명단
  /** 대기 명단 시트 요약 (행사 담당자가 불러온 시트) */
  waitlistSheets?: Record<string, { sheetUrl: string; importedAt: number }>;
  scanLogs: ScanLog[];
  rosters: Record<string, Roster<EventRow>>; // eventId → 행사 명단 (이름·학번)
  studentRosters: Record<string, Roster<StudentRow>>; // schoolId → 재학생 명단 (이름·학번·메일)
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
// 스페이스를 아직 만들지 않은 학교의 학생회. 로그인하면 /admin/setup부터 시작한다
const NEW_SPACE = { id: 'saebit', name: '새빛대학교', domain: 'saebit.ac.kr', brandColor: '#6B4EFF' };
MOCK_SCHOOL_ACCOUNTS.push({
  school: { id: NEW_SPACE.id, name: `${NEW_SPACE.name} (스페이스 없음)`, brandColor: NEW_SPACE.brandColor },
  accounts: [{ uid: `${NEW_SPACE.id}-admin`, label: '학생회 처음 세팅' }],
});
export const MOCK_OUTSIDER = { uid: 'outsider', label: '개인 Gmail (외부인)' };
/** mock 운영진 계정. 아이디 ops / 비밀번호 ops (mock 전용, 실제 배포는 시드에서 정한 값) */
export const MOCK_OPS = { uid: 'ops', id: 'ops', password: 'ops' };
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
    studentRosters: {},
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
      // 푸른대 축제는 즉석 추첨 행사 (mock: 브라우저에서 결과를 정한다)
      instantDraw: school.id === 'pureun',
      drawPool: Math.round(event.capacity * 2.5),
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
        adminSchoolId: p.role === 'admin' ? school.id : undefined,
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
      { email: `wait1@${school.domain}`, name: FAKE_NAMES[4], studentId: `20250111`, order: 1, status: 'assigned' },
      { email: `wait2@${school.domain}`, name: FAKE_NAMES[5], studentId: `20250222`, order: 2, status: 'assigned' },
      { email: `wait3@${school.domain}`, name: FAKE_NAMES[7], studentId: `20250333`, order: 3, status: 'waiting' },
      { email: `wait4@${school.domain}`, name: FAKE_NAMES[8], studentId: `20250444`, order: 4, status: 'waiting' },
      { email: `wait5@${school.domain}`, name: FAKE_NAMES[9], studentId: `20250555`, order: 5, status: 'waiting' },
    ];
    // 재학생 명단: 학교 학생 + 가짜 학생. 스페이스가 이미 세팅된 학교로 시작한다
    s.studentRosters[school.id] = {
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1SafePassDemoStudentRoster000000/edit',
      importedAt: now - 3 * 86_400_000,
      entries: rosterEntries(s, school.id, school.domain),
    };
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
    uid: `${NEW_SPACE.id}-admin`,
    schoolId: NEW_SPACE.id,
    adminSchoolId: NEW_SPACE.id,
    name: '새빛 학생회',
    studentId: '',
    email: `council@${NEW_SPACE.domain}`,
    photoUrl: '/mock/outsider.svg',
    role: 'admin',
    verifyStatus: 'approved',
    deviceStatus: 'registered',
  });
  s.users.push({
    uid: MOCK_OPS.uid,
    schoolId: '',
    name: '어둠의 운영진',
    studentId: '',
    email: 'ops@ops.safepass.app',
    photoUrl: '/mock/outsider.svg',
    role: 'admin',
    operator: true,
    verifyStatus: 'approved',
    deviceStatus: 'registered',
  });
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

const summaryOf = (r: Roster | undefined) => r && { sheetUrl: r.sheetUrl, importedAt: r.importedAt, count: r.entries.length };

/** 학교 학생 + 가짜 학생 (명단 불러오기 mock) */
function rosterEntries(s: MockState, schoolId: string, domain: string): StudentRow[] {
  const students = s.users
    .filter((u) => u.schoolId === schoolId && u.role === 'student')
    .map((u) => ({ email: u.email, name: u.name, studentId: u.studentId }));
  const extra = FAKE_NAMES.map((name, i) => ({
    email: `member${i + 1}@${domain}`,
    name,
    studentId: `2024${String(2000 + i * 11)}`,
  }));
  return [...students, ...extra];
}

/** 학교 관리자는 자기 학교만 (adminSchoolId) */
function requireSchoolAdmin(s: MockState, schoolId: string): User {
  const admin = requireUser(s, ['admin']);
  if (admin.adminSchoolId && admin.adminSchoolId !== schoolId) throw new ApiError('unauthenticated');
  return admin;
}

const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/;

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
  // 학생회는 스페이스가 아직 없어도 들어와서 만든다
  if (user.role !== 'admin' && !s.schools.some((sc) => sc.domain === domainOf(user.email))) {
    throw new ApiError('not_school_account');
  }
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
  return { ...school, studentRoster: summaryOf(s.studentRosters[schoolId]) };
}

/** 학교가 참여하는 행사. mock은 학교당 1개 */
export async function listEvents(schoolId: string): Promise<Event[]> {
  const s = load();
  return s.events
    .filter((e) => e.schoolIds.includes(schoolId))
    .map((e) => ({ ...e, roster: summaryOf(s.rosters[e.id]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 관리자·스태프가 고를 수 있는 학교. mock은 자기 학교만 */
export async function listSchools(): Promise<School[]> {
  const s = load();
  const uid = currentUid();
  const user = s.users.find((u) => u.uid === uid);
  // 운영진은 모든 학교
  if (user?.operator) return [...s.schools].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return s.schools.filter((sc) => sc.id === user?.schoolId);
}

export async function getEvent(eventId: string): Promise<Event> {
  await wait();
  const s = load();
  return { ...findEvent(s, eventId), roster: summaryOf(s.rosters[eventId]) };
}

// ---------- 스페이스 · 명단 · 행사 등록 (관리자) ----------

/** 스페이스 만들기·수정. 학교 관리자는 자기 학교만 */
export async function upsertSchool(schoolId: string, input: SchoolInput): Promise<School> {
  await wait();
  const s = load();
  requireSchoolAdmin(s, schoolId);
  const domain = input.domain.trim().toLowerCase();
  if (s.schools.some((sc) => sc.id !== schoolId && sc.domain === domain)) throw new ApiError('domain_taken');
  const fields = { name: input.name.trim(), domain, brandColor: input.brandColor };
  const school = s.schools.find((sc) => sc.id === schoolId);
  if (school) Object.assign(school, fields);
  else s.schools.push({ id: schoolId, ...fields, currentEventId: '' });
  save(s);
  return getSchool(schoolId);
}

function rosterView(r: Roster | undefined): RosterView {
  const entries: RosterEntry[] = [...(r?.entries ?? [])];
  return {
    summary: summaryOf(r) ?? null,
    entries: entries.sort((a, b) => a.studentId.localeCompare(b.studentId)).slice(0, 200),
    serviceAccountEmail: 'ttv-festival-pass@appspot.gserviceaccount.com',
  };
}

function checkSheetUrl(sheetUrl: string) {
  if (!SHEET_URL.test(sheetUrl.trim())) throw new ApiError('sheet_bad_url');
}

export async function getStudentRoster(schoolId: string): Promise<RosterView> {
  await wait();
  const s = load();
  requireSchoolAdmin(s, schoolId);
  return rosterView(s.studentRosters[schoolId]);
}

/** 재학생 시트 불러오기. mock은 학교 학생 + 가짜 학생을 만든다 */
export async function importStudentRoster(schoolId: string, sheetUrl: string): Promise<RosterImport> {
  await wait();
  await wait();
  const s = load();
  requireSchoolAdmin(s, schoolId);
  checkSheetUrl(sheetUrl);
  const school = s.schools.find((sc) => sc.id === schoolId);
  if (!school) throw new ApiError('not_found');
  const roster = { sheetUrl: sheetUrl.trim(), importedAt: Date.now(), entries: rosterEntries(s, schoolId, school.domain) };
  s.studentRosters[schoolId] = roster;
  save(s);
  return { summary: summaryOf(roster)!, skipped: [{ row: 14, reason: 'BAD_DOMAIN' }] };
}

export async function getEventRoster(eventId: string): Promise<RosterView> {
  await wait();
  const s = load();
  requireSchoolAdmin(s, findEvent(s, eventId).schoolId);
  return rosterView(s.rosters[eventId]);
}

/** 행사 명단(당첨자) 불러오기. 시트는 이름·학번만. mock은 재학생 명단의 학교 학생 + 가짜 학생 절반, 그리고 맞지 않는 줄 2개 */
export async function importEventRoster(eventId: string, sheetUrl: string): Promise<RosterImport> {
  await wait();
  await wait();
  const s = load();
  const event = findEvent(s, eventId);
  requireSchoolAdmin(s, event.schoolId);
  checkSheetUrl(sheetUrl);
  const pool = s.studentRosters[event.schoolId]?.entries ?? [];
  const students = pool.filter((r) => !r.email.startsWith('member'));
  const winners = pool.filter((r) => r.email.startsWith('member')).filter((_, i) => i % 2 === 0);
  const entries = [...students, ...winners].map(({ name, studentId }) => ({ name, studentId }));
  const roster = { sheetUrl: sheetUrl.trim(), importedAt: Date.now(), entries };
  s.rosters[eventId] = roster;
  save(s);
  return {
    summary: summaryOf(roster)!,
    skipped: [
      { row: entries.length + 2, reason: 'NOT_IN_STUDENT_ROSTER' },
      { row: entries.length + 3, reason: 'NAME_MISMATCH' },
    ],
  };
}

/** 행사 등록. 주최 학교(schoolIds[0]) 관리자만 */
export async function createEvent(input: EventInput): Promise<Event> {
  await wait();
  const s = load();
  const host = input.schoolIds[0];
  requireSchoolAdmin(s, host);
  const schools = input.schoolIds.map((id) => s.schools.find((sc) => sc.id === id));
  if (schools.some((sc) => !sc)) throw new ApiError('not_found');
  const event: Event = {
    id: nextId(s, 'event'),
    schoolId: host,
    schoolIds: input.schoolIds,
    name: input.name.trim(),
    date: input.date,
    place: input.place.trim(),
    capacity: input.capacity,
    faceValue: input.faceValue,
    enteredCount: 0,
    issuedCount: 0,
    allowedDomains: schools.map((sc) => sc!.domain),
    theme: { source: 'school', colors: [] },
    settings: { requireRoster: input.requireRoster },
    reassignMode: 'queue',
    allowReissueAfterCancel: false,
    dataRetentionDays: 7,
  };
  s.events.push(event);
  const school = s.schools.find((sc) => sc.id === host);
  if (school && !school.currentEventId) school.currentEventId = event.id;
  save(s);
  return event;
}

export async function updateEvent(eventId: string, patch: Partial<Omit<EventInput, 'schoolIds'>>): Promise<Event> {
  await wait();
  const s = load();
  const event = findEvent(s, eventId);
  requireSchoolAdmin(s, event.schoolId);
  if (patch.capacity !== undefined && patch.capacity < Math.max(1, event.issuedCount)) throw new ApiError('invalid_state');
  const { requireRoster, ...rest } = patch;
  Object.assign(event, rest);
  if (requireRoster !== undefined) event.settings = { ...event.settings, requireRoster };
  save(s);
  return { ...event, roster: summaryOf(s.rosters[eventId]) };
}

/** 회원가입: 학번으로 재학생 명단의 줄을 찾고, 이름과 로그인 메일이 그 줄과 같아야 한다 */
export async function verifyStudentRoster(schoolId: string, name: string, studentId: string): Promise<User> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const row = s.studentRosters[schoolId]?.entries.find((r) => r.studentId === studentId.trim());
  if (!row || row.name.replace(/\s+/g, '') !== name.replace(/\s+/g, '')) throw new ApiError('not_in_roster');
  if (row.email.toLowerCase() !== user.email.toLowerCase()) throw new ApiError('email_mismatch');
  const taken = s.users.some((u) => u.uid !== user.uid && u.schoolId === schoolId && u.studentId === row.studentId);
  if (taken) throw new ApiError('student_id_taken');
  // 사진까지 내야 가입 완료 (submitProfilePhoto). 사진이 없으면 /onboarding으로 간다
  Object.assign(user, { schoolId, name: row.name, studentId: row.studentId, verifyStatus: user.photoUrl ? 'approved' : 'none' });
  save(s);
  return user;
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

// ---------- 학생 가입·로그인: 메일 링크 (docs/student-auth.md) ----------
// mock은 메일을 보내지 않는다. sendSignInLink 뒤에 mockSignInLinkFor(email)로 받은 주소를 열면 메일의 링크를 누른 것과 같다

const LINK_KEY = 'safepass-mock-link';
type PendingLink = { email: string; signup?: SignupInfo };

function pendingLinks(): Record<string, PendingLink> {
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) ?? '{}') as Record<string, PendingLink>;
  } catch {
    return {};
  }
}

/** 학번 줄을 이미 가입한 계정이 쓰고 있는지 */
const claimedBy = (s: MockState, schoolId: string, studentId: string) =>
  s.users.find((u) => u.schoolId === schoolId && u.studentId === studentId && u.role === 'student');

export async function listOpenSchools(): Promise<OpenSchool[]> {
  await wait();
  const s = load();
  return s.schools
    .filter((sc) => s.studentRosters[sc.id])
    .map((sc) => ({ id: sc.id, name: sc.name, domain: sc.domain }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function precheckStudent(input: { email: string; studentId: string; name?: string }): Promise<PrecheckResult> {
  await wait();
  const s = load();
  const email = input.email.trim().toLowerCase();
  const school = s.schools.find((sc) => sc.domain === domainOf(email) && s.studentRosters[sc.id]);
  if (!school) throw new ApiError('not_school_account');
  const row = s.studentRosters[school.id].entries.find((r) => r.studentId === input.studentId.trim());
  const owner = row && claimedBy(s, school.id, row.studentId);
  if (input.name !== undefined) {
    if (!row || row.name.replace(/\s+/g, '') !== input.name.replace(/\s+/g, '')) throw new ApiError('not_in_roster');
    if (row.email.toLowerCase() !== email) throw new ApiError('email_mismatch');
    if (owner) throw new ApiError('student_id_taken');
  } else {
    if (!row) throw new ApiError('not_in_roster');
    if (row.email.toLowerCase() !== email) throw new ApiError('email_mismatch');
    if (!owner) throw new ApiError('not_registered');
  }
  return { schoolId: school.id, schoolName: school.name };
}

export async function sendSignInLink(email: string, signup?: SignupInfo): Promise<void> {
  await wait();
  const normalized = email.trim().toLowerCase();
  localStorage.setItem(LINK_KEY, JSON.stringify({ ...pendingLinks(), [normalized]: { email: normalized, signup } }));
}

/** mock 전용: 메일 대신 열 링크 주소 */
export function mockSignInLinkFor(email: string): string {
  return `/auth/finish?mockEmail=${encodeURIComponent(email.trim().toLowerCase())}`;
}

export function isSignInLink(href: string): boolean {
  return new URL(href, location.origin).searchParams.has('mockEmail');
}

export function pendingSignInEmail(): string | null {
  return new URL(location.href).searchParams.get('mockEmail');
}

export async function completeSignInLink(href: string, email?: string): Promise<User> {
  await wait();
  const s = load();
  const address = (email ?? new URL(href, location.origin).searchParams.get('mockEmail') ?? '').trim().toLowerCase();
  if (!address) throw new ApiError('invalid_state');
  const links = pendingLinks();
  const pending = links[address];
  if (!pending) throw new ApiError('invalid_state');
  delete links[address];
  localStorage.setItem(LINK_KEY, JSON.stringify(links));
  let user = userByEmail(s, address);
  if (pending.signup) {
    const { schoolId, name, studentId } = pending.signup;
    if (!user) {
      user = {
        uid: nextId(s, 'u'),
        // 학번은 명단 대조(verifyStudentRoster)가 통과하면 채운다
        schoolId,
        name,
        studentId: '',
        email: address,
        photoUrl: '',
        role: 'student',
        verifyStatus: 'none',
        deviceStatus: 'registered',
        deviceName: 'iPhone 15',
      };
      s.users.push(user);
      save(s);
    }
    sessionStorage.setItem(SESSION_KEY, user.uid);
    return verifyStudentRoster(schoolId, name, studentId);
  }
  if (!user) throw new ApiError('not_registered');
  sessionStorage.setItem(SESSION_KEY, user.uid);
  return user;
}

export async function submitProfilePhoto(photoDataUrl: string, idCardDataUrl: string): Promise<User> {
  await wait();
  const s = load();
  const user = requireUser(s, ['student']);
  user.photoUrl = photoDataUrl;
  user.idCardUrl = idCardDataUrl;
  user.verifyStatus = 'approved';
  save(s);
  return user;
}

// ---------- 재학생 승인 · 기기 (기술 설계 2.2~2.3) ----------

/** 사진은 data URL (프로토타입). 실제는 Storage 업로드 후 경로를 넘긴다. */
export async function submitVerification(photoDataUrl: string, idCardDataUrl: string): Promise<User> {
  await wait();
  const s = load();
  const user = requireUser(s);
  user.photoUrl = photoDataUrl;
  user.idCardUrl = idCardDataUrl;
  user.verifyStatus = 'pending';
  user.rejectReason = undefined;
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
  if (!event.allowedDomains.includes(domainOf(user.email))) throw new ApiError('not_school_account');
  if (user.role === 'student' && user.verifyStatus !== 'approved') throw new ApiError('not_registered');
  const existing = s.tickets.find((t) => t.eventId === eventId && t.ownerUid === user.uid);
  if (existing) return existing;
  // 취소한 학생은 다시 받을 수 없다 (테스트 행사만 예외)
  const cancelledBefore = s.reassignments.some((r) => r.eventId === eventId && r.fromUid === user.uid);
  if (cancelledBefore && !event.allowReissueAfterCancel) throw new ApiError('cancelled_before');
  if (event.instantDraw) {
    if (mockEntries()[`${eventId}:${user.uid}`]?.status !== 'won') throw new ApiError('draw_not_won');
  } else if (event.settings.requireRoster) {
    const name = user.name.replace(/\s+/g, '');
    const inRoster = s.rosters[eventId]?.entries.some((r) => r.studentId === user.studentId && r.name.replace(/\s+/g, '') === name);
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

export async function myRosterStatus(eventIds: string[]): Promise<Record<string, RosterStatus>> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const name = user.name.replace(/\s+/g, '');
  const out: Record<string, RosterStatus> = {};
  for (const id of eventIds) {
    const event = s.events.find((e) => e.id === id);
    if (!event) continue;
    const roster = s.rosters[id];
    if (event.instantDraw) {
      const st = mockEntry(id, user.uid)?.status;
      out[id] = st === 'won' ? 'draw_won' : st === 'lost' ? 'draw_lost' : st ? 'draw_pending' : 'draw_open';
      continue;
    }
    out[id] = !event.settings.requireRoster
      ? 'open'
      : !roster
        ? 'no_roster'
        : roster.entries.some((r) => r.studentId === user.studentId && r.name.replace(/\s+/g, '') === name)
          ? 'on_roster'
          : 'not_on_roster';
  }
  return out;
}

export async function getMyTicket(eventId: string): Promise<Ticket | null> {
  await wait();
  const s = load();
  const user = requireUser(s);
  return s.tickets.find((t) => t.eventId === eventId && t.ownerUid === user.uid) ?? null;
}

export function subscribeMyTicket(eventId: string, cb: (ticket: Ticket | null) => void, onError?: () => void): () => void {
  return subscribe((s) => {
    const uid = currentUid();
    if (!uid) {
      onError?.();
      return null;
    }
    return { ticket: s.tickets.find((t) => t.eventId === eventId && t.ownerUid === uid) ?? null };
  }, (v) => cb(v.ticket));
}

export async function refreshQrToken(ticketId: string): Promise<QrRefresh> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const t = s.tickets.find((x) => x.id === ticketId && x.ownerUid === user.uid);
  if (!t) throw new ApiError('not_found');
  rotateToken(s, t);
  save(s);
  return { token: t.qrToken, expiresAt: t.qrExpiresAt };
}

/** QR 내용. 실제 백엔드와 같은 TTV1: 접두사 (firebaseApi.ts) */
export function formatQrPayload(ticketId: string, token: string): string {
  return `TTV1:${ticketId}:${token}`;
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

function candidates(mode: ReassignMode, waiting: MockWaiter[]): MockWaiter[] {
  const list = [...waiting];
  if (mode === 'queue') return list.sort((a, b) => a.order - b.order);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** 주인이 취소하면 운영진이 정한 방식(순서/무작위)으로 대기자에게 넘긴다. 받을 사람이 없으면 다시 발급 가능 */
export async function revokeTicket(ticketId: string): Promise<RevokeResult> {
  await wait();
  const s = load();
  const me = requireUser(s);
  if (me.role !== 'admin') throw new ApiError('wrong_role');
  const ticket = s.tickets.find((t) => t.id === ticketId);
  if (!ticket) return 'not_issued';
  if (ticket.status === 'used') return 'used';
  const event = findEvent(s, ticket.eventId);
  const owner = s.users.find((u) => u.uid === ticket.ownerUid);
  s.reassignments.unshift({
    id: nextId(s, 'r'),
    ticketId,
    eventId: ticket.eventId,
    nftTokenId: ticket.nftTokenId,
    fromUid: ticket.ownerUid,
    fromName: owner?.name ?? '알 수 없음',
    mode: event.reassignMode,
    outcome: 'revoked',
    createdAt: Date.now(),
  });
  s.tickets = s.tickets.filter((t) => t.id !== ticketId);
  event.issuedCount = Math.max(0, event.issuedCount - 1);
  save(s);
  return 'revoked';
}

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
  return record.outcome as CancelResult;
}

// ---------- 검표 ----------

export async function verifyEntry(qrPayload: string, _eventId?: string): Promise<VerifyResult> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);

  const match = /^TTV1:([^:]+):([^:]+)$/.exec(qrPayload.trim());
  const found = match ? s.tickets.find((t) => t.id === match[1]) : undefined;
  const fail = (result: ScanResult | 'wrong_event', t?: Ticket): VerifyResult => {
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

/** mock은 needs_confirm을 돌려주지 않지만 계약을 맞춰 둔다 */
export async function confirmEntry(ticketId: string, match: boolean): Promise<ConfirmResult> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);
  const ticket = s.tickets.find((t) => t.id === ticketId && t.eventId === event.id);
  if (!ticket) return { result: 'invalid' };
  if (ticket.status === 'used') return { result: 'used' };
  if (!match) {
    addLog(s, event, staff, 'mismatch', ticket);
    save(s);
    return { result: 'mismatch' };
  }
  ticket.status = 'used';
  ticket.usedAt = Date.now();
  event.enteredCount += 1;
  addLog(s, event, staff, 'ok', ticket);
  save(s);
  return { result: 'ok' };
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

export async function getWaitlist(eventId: string): Promise<WaitlistView> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const r = s.waitlistSheets?.[eventId];
  return {
    summary: r ? { sheetUrl: r.sheetUrl, importedAt: r.importedAt, count: (s.waitlists[eventId] ?? []).length } : null,
    entries: [...(s.waitlists[eventId] ?? [])]
      .sort((a, b) => a.order - b.order)
      .map(({ name, studentId, order, status }) => ({ name, studentId, order, status })),
    serviceAccountEmail: 'ttv-festival-pass@appspot.gserviceaccount.com',
  };
}

/** 대기 명단 시트 불러오기. mock은 재학생 명단의 가짜 학생 중 행사 명단에 없는 학생을 순서대로 넣는다. 배정된 줄은 그대로 둔다 */
export async function importWaitlist(eventId: string, sheetUrl: string): Promise<RosterImport> {
  await wait();
  await wait();
  const s = load();
  const event = findEvent(s, eventId);
  requireSchoolAdmin(s, event.schoolId);
  checkSheetUrl(sheetUrl);
  const onRoster = new Set((s.rosters[eventId]?.entries ?? []).map((r) => r.studentId));
  const pool = (s.studentRosters[event.schoolId]?.entries ?? []).filter((r) => r.email.startsWith('member') && !onRoster.has(r.studentId));
  const settled = (s.waitlists[eventId] ?? []).filter((w) => w.status !== 'waiting');
  const fresh = pool.filter((r) => !settled.some((w) => w.email === r.email));
  s.waitlists[eventId] = [
    ...settled,
    ...fresh.map((r, i) => ({ email: r.email, name: r.name, studentId: r.studentId, order: settled.length + i + 1, status: 'waiting' as const })),
  ];
  s.waitlistSheets = { ...(s.waitlistSheets ?? {}), [eventId]: { sheetUrl: sheetUrl.trim(), importedAt: Date.now() } };
  save(s);
  return {
    summary: { sheetUrl: sheetUrl.trim(), importedAt: Date.now(), count: s.waitlists[eventId].length },
    skipped: [{ row: fresh.length + 2, reason: 'NOT_IN_STUDENT_ROSTER' }],
  };
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

// ---------- 운영진 콘솔 (/ops) ----------

export async function signInAsOperator(id: string, password: string): Promise<User> {
  await wait();
  if (id.trim().toLowerCase() !== MOCK_OPS.id || password !== MOCK_OPS.password) throw new ApiError('wrong_password');
  const s = load();
  const user = s.users.find((u) => u.uid === MOCK_OPS.uid);
  if (!user) throw new ApiError('unknown');
  sessionStorage.setItem(SESSION_KEY, user.uid);
  return user;
}

function requireOperator(s: MockState): User {
  const user = requireUser(s, ['admin']);
  if (!user.operator) throw new ApiError('wrong_role');
  return user;
}

const sameName = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
const STUDENT_ID = /^[A-Za-z0-9-]{1,32}$/;

export async function opsListRoster(kind: OpsRosterKind, id: string): Promise<OpsRoster> {
  await wait();
  const s = load();
  requireOperator(s);
  if (kind === 'school') {
    if (!s.schools.some((sc) => sc.id === id)) throw new ApiError('not_found');
    const r = s.studentRosters[id];
    const rows: OpsRosterRow[] = [...(r?.entries ?? [])]
      .sort((a, b) => a.studentId.localeCompare(b.studentId))
      .map((e) => ({ ...e, claimed: !!claimedBy(s, id, e.studentId) }));
    return { rows, summary: summaryOf(r) ?? null, editable: true };
  }
  const event = findEvent(s, id);
  const school = s.studentRosters[event.schoolId]?.entries ?? [];
  const r = s.rosters[id];
  const rows: OpsRosterRow[] = [...(r?.entries ?? [])]
    .sort((a, b) => a.studentId.localeCompare(b.studentId))
    .map((e) => {
      const m = school.find((x) => x.studentId === e.studentId);
      const match = !m ? 'NOT_IN_STUDENT_ROSTER' : sameName(m.name, e.name) ? 'OK' : 'NAME_MISMATCH';
      return { name: e.name, studentId: e.studentId, ...(m ? { email: m.email } : {}), match };
    });
  return { rows, summary: summaryOf(r) ?? null, schoolId: event.schoolId, editable: !!r?.sheetUrl };
}

export async function opsEditRoster(kind: OpsRosterKind, id: string, edit: OpsRosterEdit): Promise<OpsEditResult> {
  await wait();
  const s = load();
  requireOperator(s);
  const school = kind === 'school' ? s.schools.find((sc) => sc.id === id) : undefined;
  if (kind === 'school' && !school) throw new ApiError('not_found');
  // 행사 명단은 행사 담당자가 시트로 한 번 불러온 뒤에만 고친다
  if (kind === 'event' && !(findEvent(s, id) && s.rosters[id]?.sheetUrl)) throw new ApiError('invalid_state');

  const skipped: { index: number; reason: RosterSkipReason }[] = [];
  const byId = new Map<string, StudentRow | EventRow>();
  edit.upserts.forEach((u, index) => {
    const row = { name: u.name.trim(), studentId: u.studentId.trim(), email: (u.email ?? '').trim().toLowerCase() };
    if (!row.name && !row.studentId && !row.email) return;
    if (!row.name || !row.studentId || (kind === 'school' && !row.email)) return skipped.push({ index, reason: 'MISSING_FIELD' });
    if (!STUDENT_ID.test(row.studentId)) return skipped.push({ index, reason: 'BAD_STUDENT_ID' });
    if (kind === 'school' && domainOf(row.email) !== school!.domain) return skipped.push({ index, reason: 'BAD_DOMAIN' });
    byId.set(row.studentId, kind === 'school' ? row : { name: row.name, studentId: row.studentId });
  });

  const now = Date.now();
  const current = kind === 'school' ? s.studentRosters[id] : s.rosters[id];
  const before: (StudentRow | EventRow)[] = current?.entries ?? [];
  const removed = new Set(edit.deletes.filter((d) => !byId.has(d)));
  if (edit.replace) for (const e of before) if (!byId.has(e.studentId)) removed.add(e.studentId);
  const deleted = before.filter((e) => removed.has(e.studentId)).length;
  const kept = before.filter((e) => !removed.has(e.studentId) && !byId.has(e.studentId));
  const entries = [...kept, ...byId.values()];
  const roster = { sheetUrl: current?.sheetUrl ?? '', importedAt: now, entries };
  if (kind === 'school') s.studentRosters[id] = roster as Roster<StudentRow>;
  else s.rosters[id] = roster as Roster<EventRow>;
  save(s);
  return { saved: byId.size, deleted, skipped, summary: summaryOf(roster)! };
}

export async function opsListStudents(schoolId: string): Promise<OpsStudent[]> {
  await wait();
  const s = load();
  requireOperator(s);
  return s.users
    .filter((u) => u.schoolId === schoolId && u.role === 'student')
    .map((u) => ({
      uid: u.uid,
      name: u.name,
      studentId: u.studentId,
      email: u.email,
      deviceRegistered: !!u.deviceName,
      resetRequested: s.deviceResets.some((r) => r.uid === u.uid && r.status === 'pending'),
    }))
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
}

export async function opsResetDevice(uid: string): Promise<void> {
  await wait();
  const s = load();
  requireOperator(s);
  const user = s.users.find((u) => u.uid === uid);
  if (!user) throw new ApiError('not_found');
  // 등록을 지운다. 다음에 로그인한 기기가 새로 등록된다
  user.deviceStatus = 'registered';
  user.deviceName = undefined;
  for (const r of s.deviceResets) if (r.uid === uid) r.status = 'done';
  save(s);
}

/** mock: 이미 있는 계정(학생회)만 보여준다. 새 메일은 로그인 전 상태로 기억한다 */
const MOCK_PENDING_ADMINS = 'safepass-mock-pending-admins';
function pendingAdmins(): OpsEventAdmin[] {
  try {
    return JSON.parse(localStorage.getItem(MOCK_PENDING_ADMINS) ?? '[]') as OpsEventAdmin[];
  } catch {
    return [];
  }
}

export async function opsListEventAdmins(): Promise<OpsEventAdmin[]> {
  await wait();
  const s = load();
  requireOperator(s);
  const active = s.users
    .filter((u) => u.role === 'admin' && u.adminSchoolId)
    .map((u) => ({ email: u.email, name: u.name, schoolId: u.adminSchoolId!, pending: false }));
  return [...active, ...pendingAdmins()].sort((a, b) => a.schoolId.localeCompare(b.schoolId) || a.email.localeCompare(b.email));
}

export async function opsSetEventAdmin(email: string, schoolId: string | null): Promise<void> {
  await wait();
  const s = load();
  requireOperator(s);
  const addr = email.trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(addr)) throw new ApiError('invalid_state');
  if (schoolId && !s.schools.some((sc) => sc.id === schoolId)) throw new ApiError('not_found');
  const user = userByEmail(s, addr);
  if (user?.role === 'admin' && !user.adminSchoolId) throw new ApiError('invalid_state');
  const rest = pendingAdmins().filter((a) => a.email !== addr);
  if (user) {
    Object.assign(user, schoolId ? { role: 'admin', adminSchoolId: schoolId } : { role: 'student', adminSchoolId: undefined });
    save(s);
  } else if (schoolId) {
    rest.push({ email: addr, name: addr.split('@')[0], schoolId, pending: true });
  }
  localStorage.setItem(MOCK_PENDING_ADMINS, JSON.stringify(rest));
}

// ---------- 체인 직접 읽기 (mock: 데모 회차 값과 고정 현황) ----------

/** 고정 현황. 실제 연결은 chain/live.ts가 Base Sepolia에서 읽는다 */
export async function getChainEventStatus(_eventId: string): Promise<ChainEventStatus> {
  await wait();
  return {
    exists: true,
    capacity: 300,
    active: 5,
    withinCapacity: true,
    issued: 6,
    used: 2,
    reassigned: { queue: 0, lottery: 2 },
    released: { noWaiter: 0, adminRevoke: 1 },
    drawRounds: 1,
    entries: { settled: 128, won: 51 },
    actions: { lostReissue: 2, refund: 0, manualEntry: 3 },
    asOfBlock: '54300000',
    contractUrl: 'https://base-sepolia.blockscout.com/address/0x577aDF622034aBE56a4dE0792EDBFCe1d1c6A5fE',
  };
}

/** 데모 회차만 있다 (실제 체인에 올라간 값과 같다) */
export async function getChainDraw(eventId: string, round: number): Promise<ChainDraw | null> {
  await wait();
  if (eventId !== demoDraw.eventId || round !== demoDraw.round) return null;
  return { commitment: demoDraw.commitment, seedBlock: String(demoDraw.seedBlock), seed: demoDraw.seed, commitTx: demoDraw.commitTx, seedTx: demoDraw.seedTx };
}

export async function verifyMyDraw(entry: MyDrawEntry): Promise<DrawCheck> {
  return checkMyDraw(entry, await getChainDraw(entry.eventId, entry.round));
}

// ---------- 즉석 추첨 (mock: 체인 대신 브라우저가 5초 뒤 결과를 정한다) ----------

const MOCK_ENTRIES = 'safepass-mock-entry-draws';
const MOCK_DRAW_MS = 5_000;
// mock 행사는 재학생 수가 정원의 2.5배라고 본다 → 당첨 확률 40%
const MOCK_POOL_FACTOR = 2.5;

function mockEntries(): Record<string, EntryDraw> {
  try {
    return JSON.parse(localStorage.getItem(MOCK_ENTRIES) ?? '{}') as Record<string, EntryDraw>;
  } catch {
    return {};
  }
}

const hex32 = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** 결과 시각이 지난 응모는 체인 대신 여기서 결과를 정해 저장한다 (점수 = 실제와 같은 공식) */
function mockEntry(eventId: string, uid: string): EntryDraw | null {
  const all = mockEntries();
  const key = `${eventId}:${uid}`;
  const e = all[key];
  if (!e) return null;
  if (e.status === 'pending' && Date.now() - e.createdAt >= MOCK_DRAW_MS) {
    const seed = hex32();
    const score = scoreOf(seed, e.entryId);
    all[key] = { ...e, status: score < e.winBps ? 'won' : 'lost', seed, score, seedBlock: 54_800_000 + (e.createdAt % 1000), settleTx: hex32() };
    localStorage.setItem(MOCK_ENTRIES, JSON.stringify(all));
  }
  return all[key];
}

export async function enterDraw(eventId: string): Promise<EntryDraw> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const event = findEvent(s, eventId);
  if (user.role !== 'student') throw new ApiError('wrong_role');
  if (!event.instantDraw) throw new ApiError('invalid_state');
  const existing = mockEntry(eventId, user.uid);
  if (existing) return existing;
  const studentRef = studentRefOf(user.schoolId, user.studentId);
  const salt = hex32();
  const entry: EntryDraw = {
    eventId,
    status: 'pending',
    winBps: winBpsOf(event.capacity, event.drawPool ?? Math.round(event.capacity * MOCK_POOL_FACTOR)),
    studentRef,
    salt,
    entryId: entryIdOf(eventId, studentRef, salt),
    seedBlock: null,
    seed: null,
    score: null,
    openTx: hex32(),
    settleTx: null,
    createdAt: Date.now(),
  };
  localStorage.setItem(MOCK_ENTRIES, JSON.stringify({ ...mockEntries(), [`${eventId}:${user.uid}`]: entry }));
  return entry;
}

export async function listEntryDraws(eventId: string): Promise<EntryDrawAdmin> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  const pool = event.drawPool ?? Math.round(event.capacity * MOCK_POOL_FACTOR);
  const entries = Object.entries(mockEntries())
    .filter(([key]) => key.startsWith(`${eventId}:`))
    .map(([key]) => {
      const uid = key.slice(eventId.length + 1);
      const e = mockEntry(eventId, uid)!;
      const u = s.users.find((x) => x.uid === uid);
      return { name: u?.name ?? '알 수 없음', studentId: u?.studentId ?? '', status: e.status, score: e.score, createdAt: e.createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const count = (st: string) => entries.filter((e) => e.status === st).length;
  return {
    capacity: event.capacity,
    drawPool: pool,
    winBps: winBpsOf(event.capacity, pool),
    counts: { total: entries.length, pending: count('pending'), won: count('won'), lost: count('lost') },
    entries,
  };
}

export async function updateDrawSettings(eventId: string, draw: { instantDraw: boolean; drawPool: number }): Promise<Event> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  const event = findEvent(s, eventId);
  event.instantDraw = draw.instantDraw;
  event.drawPool = draw.drawPool;
  save(s);
  return event;
}

export async function getMyEntryDraw(eventId: string): Promise<EntryDraw | null> {
  await wait();
  return mockEntry(eventId, requireUser(load()).uid);
}

/** mock: 저장된 시드가 곧 그 블록의 해시라고 보고 같은 공식으로 다시 계산한다 */
export async function verifyMyEntry(mine: EntryDraw): Promise<EntryVerification> {
  await wait();
  const chain: ChainEntry | null =
    mine.status === 'pending'
      ? null
      : { seedBlock: mine.seedBlock ?? 0, winBps: mine.winBps, result: mine.status === 'won' ? 1 : 2, seed: mine.seed, score: mine.score, openTx: mine.openTx, settleTx: mine.settleTx };
  return { chain, check: checkEntry(mine, chain, mine.seed), links: { open: null, settle: null, block: null } };
}

function winBpsOf(capacity: number, pool: number): number {
  if (!(capacity > 0)) return 0;
  if (!(pool > capacity)) return 10_000;
  return Math.max(1, Math.floor((capacity * 10_000) / pool));
}

// ---------- 취소표 추첨 (mock: 데모 회차의 첫 응모자로 대기 중) ----------

export async function getMyLottery(_eventId: string): Promise<MyLottery> {
  await wait();
  const e = demoDraw.entries[0];
  return {
    state: 'waiting',
    nextAnnounceAt: Date.now() + 3 * 3_600_000,
    offer: null,
    receipt: { eventId: demoDraw.eventId, round: demoDraw.round, uid: e.uid, salt: e.salt, proof: e.proof, root: demoDraw.root, tokenIds: demoDraw.tokenIds },
  };
}

export async function claimTicket(_eventId: string): Promise<ClaimResult> {
  await wait();
  return 'no_offer';
}

export async function runDrawNow(_eventId: string): Promise<RunDrawResult> {
  await wait();
  return { ok: false, reason: 'not_lottery' };
}
