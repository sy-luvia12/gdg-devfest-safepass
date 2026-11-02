// 백엔드 완성 전 가짜 데이터. 함수 이름·시그니처는 CLAUDE.md "데이터 함수 계약"과 같다.
// 상태는 localStorage에 두고 storage 이벤트로 탭끼리 맞춘다 → 학생 탭 / 검표 탭 / 관리자 탭 데모 가능.
// 로그인은 탭마다 따로(sessionStorage)라서 탭마다 다른 역할·학교로 들어갈 수 있다.

import {
  ApiError,
  type DeviceResetRequest,
  type Event,
  type EventSettings,
  type EventStats,
  type EventTheme,
  type RosterEntry,
  type ScanLog,
  type ScanResult,
  type School,
  type StaffStats,
  type Ticket,
  type TicketHistoryItem,
  type TicketRow,
  type Transfer,
  type TransferView,
  type User,
  type VerifyResult,
} from '@/types';

const STATE_KEY = 'safepass-mock-v3';
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
  transfers: Transfer[];
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
    transfers: [],
    scanLogs: [],
    rosters: {},
    deviceResets: [],
    seq: 100,
  };
  const logResults: ScanResult[] = ['ok', 'ok', 'expired', 'ok', 'used', 'ok', 'mismatch', 'ok', 'invalid', 'ok'];

  for (const { school, event, people: ps } of SEED) {
    const eventId = `${school.id}-2026-fall`;
    s.schools.push({ ...school, currentEventId: eventId });
    s.events.push({
      ...event,
      id: eventId,
      schoolId: school.id,
      allowedDomains: [school.domain],
      theme: { source: 'school', colors: [] },
      settings: { requireRoster: false, twoStepCheck: true },
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
        // 웃돈 양도 시도가 막힌 기록 (관리자 "양도 기록" 데모)
        const admin = `council@${school.domain}`;
        [30000, 50000].forEach((extra, i) => {
          s.transfers.push({
            id: `seed-tr-${uid}-${i}`,
            ticketId: ticket.id,
            eventId,
            fromUid: uid,
            toEmail: admin,
            price: event.faceValue + extra,
            result: 'rejected',
            reason: 'over_face_value',
            createdAt: now - (i + 1) * 5_400_000,
            resolvedAt: now - (i + 1) * 5_400_000,
          });
        });
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

function toView(s: MockState, t: Transfer): TransferView {
  const ticket = s.tickets.find((x) => x.id === t.ticketId);
  return {
    ...t,
    fromName: s.users.find((u) => u.uid === t.fromUid)?.name ?? '알 수 없음',
    toName: userByEmail(s, t.toEmail)?.name,
    eventName: findEvent(s, t.eventId).name,
    nftTokenId: ticket?.nftTokenId ?? '-',
  };
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

// ---------- 입장권 ----------

export async function issueTicket(eventId: string): Promise<Ticket> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const event = findEvent(s, eventId);
  if (!event.allowedDomains.includes(domainOf(user.email))) throw new ApiError('not_school_account');
  const existing = s.tickets.find((t) => t.eventId === eventId && t.ownerUid === user.uid);
  if (existing) return existing;
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

export async function getTicketHistory(ticketId: string): Promise<TicketHistoryItem[]> {
  await wait();
  const s = load();
  const user = requireUser(s);
  const t = s.tickets.find((x) => x.id === ticketId);
  if (!t) throw new ApiError('not_found');
  const moves = s.transfers.filter((tr) => tr.ticketId === ticketId && tr.result === 'success');
  // 처음 받은 사람: 양도가 있었다면 첫 양도의 보낸 사람, 없으면 지금 주인
  const firstOwner = moves[0]?.fromUid ?? t.ownerUid;
  const firstName = s.users.find((u) => u.uid === firstOwner)?.name ?? '';
  const items: TicketHistoryItem[] = [
    { type: 'issued', at: t.issuedAt, detail: `${firstName}님에게 발급`, txHash: fakeTxHash(`${t.id}-mint`) },
  ];
  for (const m of moves) {
    const from = s.users.find((u) => u.uid === m.fromUid)?.name ?? '';
    const to = userByEmail(s, m.toEmail)?.name ?? m.toEmail;
    items.push({
      type: m.fromUid === user.uid ? 'transfer_out' : 'transfer_in',
      at: m.resolvedAt ?? m.createdAt,
      detail: `${from} → ${to} · ${m.price === 0 ? '0원' : `${m.price.toLocaleString('ko-KR')}원`}`,
      txHash: fakeTxHash(`${m.id}-buy`),
    });
  }
  if (t.usedAt) items.push({ type: 'used', at: t.usedAt, detail: '입장 확인', txHash: fakeTxHash(`${t.id}-used`) });
  return items.sort((a, b) => a.at - b.at);
}

// ---------- 양도 (요청 → 수락) ----------

export async function transferTicket(ticketId: string, toEmail: string, price: number): Promise<Transfer> {
  await wait();
  const s = load();
  const from = requireUser(s);
  const ticket = s.tickets.find((t) => t.id === ticketId && t.ownerUid === from.uid);
  if (!ticket || ticket.status !== 'issued') throw new ApiError('not_found');
  const event = findEvent(s, ticket.eventId);
  if (s.transfers.some((t) => t.ticketId === ticketId && t.result === 'pending')) throw new ApiError('invalid_state');

  const record = (result: Transfer['result'], reason?: Transfer['reason']): Transfer => {
    const tr: Transfer = {
      id: nextId(s, 'tr'),
      ticketId,
      eventId: event.id,
      fromUid: from.uid,
      toEmail: toEmail.trim(),
      price,
      result,
      reason,
      createdAt: Date.now(),
      resolvedAt: result === 'pending' ? undefined : Date.now(),
    };
    s.transfers.push(tr);
    save(s);
    return tr;
  };

  if (price > event.faceValue) return record('rejected', 'over_face_value');
  const to = userByEmail(s, toEmail);
  if (!to || to.uid === from.uid || !event.allowedDomains.includes(domainOf(to.email))) {
    return record('rejected', 'not_student');
  }
  if (s.tickets.some((t) => t.eventId === ticket.eventId && t.ownerUid === to.uid)) {
    return record('rejected', 'already_has_ticket');
  }
  return record('pending');
}

export async function getMyTransfers(): Promise<{ incoming: TransferView[]; outgoing: TransferView[] }> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const pending = s.transfers.filter((t) => t.result === 'pending');
  return {
    incoming: pending.filter((t) => t.toEmail.toLowerCase() === me.email.toLowerCase()).map((t) => toView(s, t)),
    outgoing: pending.filter((t) => t.fromUid === me.uid).map((t) => toView(s, t)),
  };
}

export async function getTransfer(transferId: string): Promise<TransferView> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const t = s.transfers.find((x) => x.id === transferId);
  if (!t || (t.fromUid !== me.uid && t.toEmail.toLowerCase() !== me.email.toLowerCase())) {
    throw new ApiError('not_found');
  }
  return toView(s, t);
}

/** 받는 사람이 수락하면 입장권과 대금이 한 번에 이동 (실제는 컨트랙트 buy) */
export async function acceptTransfer(transferId: string): Promise<Ticket> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const tr = s.transfers.find((x) => x.id === transferId);
  if (!tr || tr.toEmail.toLowerCase() !== me.email.toLowerCase()) throw new ApiError('not_found');
  if (tr.result !== 'pending') throw new ApiError('invalid_state');
  const ticket = s.tickets.find((t) => t.id === tr.ticketId);
  if (!ticket || ticket.ownerUid !== tr.fromUid || ticket.status !== 'issued') throw new ApiError('invalid_state');
  if (s.tickets.some((t) => t.eventId === ticket.eventId && t.ownerUid === me.uid)) {
    tr.result = 'rejected';
    tr.reason = 'already_has_ticket';
    tr.resolvedAt = Date.now();
    save(s);
    throw new ApiError('invalid_state');
  }
  ticket.ownerUid = me.uid;
  rotateToken(s, ticket);
  tr.result = 'success';
  tr.resolvedAt = Date.now();
  save(s);
  return ticket;
}

export async function declineTransfer(transferId: string): Promise<void> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const tr = s.transfers.find((x) => x.id === transferId && x.toEmail.toLowerCase() === me.email.toLowerCase());
  if (!tr || tr.result !== 'pending') throw new ApiError('invalid_state');
  tr.result = 'declined';
  tr.resolvedAt = Date.now();
  save(s);
}

export async function cancelTransfer(transferId: string): Promise<void> {
  await wait();
  const s = load();
  const me = requireUser(s);
  const tr = s.transfers.find((x) => x.id === transferId && x.fromUid === me.uid);
  if (!tr || tr.result !== 'pending') throw new ApiError('invalid_state');
  tr.result = 'cancelled';
  tr.resolvedAt = Date.now();
  save(s);
}

// ---------- 검표 ----------

export async function verifyEntry(qrPayload: string): Promise<VerifyResult> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);

  const match = /^safepass:([^:]+):([^:]+)$/.exec(qrPayload.trim());
  // 다른 학교 행사 입장권도 확인 불가로 처리한다
  const ticket = match ? s.tickets.find((t) => t.id === match[1] && t.eventId === event.id) : undefined;
  const fail = (result: VerifyResult['result'], t?: Ticket): VerifyResult => {
    addLog(s, event, staff, result, t);
    save(s);
    return { result };
  };
  if (!match || !ticket) return fail('invalid');

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

  // 2단계 검표: 여기서는 확인만 하고, 스태프가 사진을 대조한 뒤 confirmEntry로 확정
  if (event.settings.twoStepCheck) {
    return { result: 'ok', user: userView, nftTokenId: ticket.nftTokenId, ticketId: ticket.id, needsConfirm: true };
  }
  ticket.status = 'used';
  ticket.usedAt = Date.now();
  event.enteredCount += 1;
  addLog(s, event, staff, 'ok', ticket);
  save(s);
  return { result: 'ok', user: userView, nftTokenId: ticket.nftTokenId, ticketId: ticket.id };
}

/** 2단계 검표 확정. match=false면 얼굴 불일치로 거부 기록 */
export async function confirmEntry(ticketId: string, match: boolean): Promise<{ result: 'ok' | 'mismatch' | 'used' }> {
  await wait();
  const s = load();
  const staff = requireUser(s, ['staff', 'admin']);
  const event = myEvent(s, staff);
  const ticket = s.tickets.find((t) => t.id === ticketId && t.eventId === event.id);
  if (!ticket) throw new ApiError('not_found');
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

export async function listTransfers(eventId: string): Promise<TransferView[]> {
  await wait();
  const s = load();
  requireUser(s, ['admin']);
  return s.transfers
    .filter((t) => t.eventId === eventId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => toView(s, t));
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
      return { ...t, ownerName: owner?.name ?? '-', ownerStudentId: owner?.studentId ?? '' };
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
