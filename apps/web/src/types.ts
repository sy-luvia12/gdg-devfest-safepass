// 공통 타입 (백엔드 소유). 계약은 CLAUDE.md "데이터 모델" 기준.

export type Role = 'student' | 'staff' | 'admin';

export type School = {
  id: string;
  name: string; // 예: "한빛대학교"
  domain: string; // 학교 이메일 도메인
  brandColor: string; // 학교 상징색 hex. 테마 기본 시드
  currentEventId: string; // 처음 보여줄 행사. 학교의 행사 목록은 listEvents(schoolId)
  /** 재학생 명단 요약. 없으면 아직 시트를 불러오지 않은 스페이스 → 관리자는 /admin/setup부터 */
  studentRoster?: RosterSummary;
};

/** 행사 테마. source가 'event'면 행사 디자인(포스터)에서 뽑은 색, 'school'이면 학교 상징색 */
export type EventTheme = {
  source: 'school' | 'event';
  colors: string[]; // hex 1~3개 (source 'event'일 때)
};

/** 재학생 승인 상태 (기술 설계 2.3). none: 첫 로그인, 아직 제출 전 */
export type VerifyStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type User = {
  uid: string;
  schoolId: string;
  name: string;
  studentId: string; // 학번
  email: string; // 학교 이메일
  photoUrl: string; // 프로토타입은 미리 넣어둔 테스트 사진
  role: Role; // staff: 검표 / admin: 검표 + 관리자
  /** 학교 관리자가 맡은 학교. admin인데 없으면 SafePass 팀 계정 (모든 학교, 새 스페이스 만들기) */
  adminSchoolId?: string;
  /** 학교 관리자가 추가한 스태프가 맡은 학교. 그 학교 행사만 검표한다. 없으면 모든 학교 (팀 계정) */
  staffSchoolId?: string;
  /** SafePass 운영진 계정 (어둠의 운영진). /ops 콘솔에서 모든 학교의 명단과 기기를 고친다 */
  operator?: boolean;
  verifyStatus: VerifyStatus;
  rejectReason?: string;
  idCardUrl?: string; // 학생증 사진 (관리자만 열람)
  submittedAt?: number; // 승인 요청 시각
  /** 기기 서명 QR (기술 설계 2.2). blocked: 다른 기기에 이미 등록됨 */
  deviceStatus: 'registered' | 'blocked';
  deviceName?: string;
};

export type EventSettings = {
  requireRoster: boolean; // 명단에 있는 학생만 발급
};

/** 취소표 재배정 방식. queue: 대기 순서대로 / random: 대기 명단에서 무작위 (운영진이 행사별로 정함) */
export type ReassignMode = 'queue' | 'random';

export type Event = {
  id: string;
  schoolId: string; // 주최 학교
  /** 참여 학교. 고연전처럼 두 학교가 함께하면 둘 다 */
  schoolIds: string[];
  /** 묶음 이름 (예: 고연전). 보는 사람 학교의 표기로 풀린 값. 있으면 name은 경기 이름 */
  seriesName?: string;
  name: string;
  date: string; // ISO
  place: string;
  capacity: number;
  faceValue: number; // 정가 (무료 행사는 0)
  enteredCount: number;
  issuedCount: number; // 발급 수 (남은 수량 = capacity - issuedCount)
  allowedDomains: string[];
  theme: EventTheme;
  settings: EventSettings;
  /** 행사 명단 요약 (당첨자·참가자). settings.requireRoster가 켜져 있으면 여기 있는 학생만 발급 */
  roster?: RosterSummary;
  reassignMode: ReassignMode;
  /** 테스트용: 취소한 학생도 다시 받을 수 있음. 실제 행사는 false (노션 "요청 처리 방침") */
  allowReissueAfterCancel: boolean;
  dataRetentionDays: number; // 행사 후 개인정보 보관 기간 (기술 설계 2.6)
};

export type Ticket = {
  id: string;
  eventId: string;
  ownerUid: string;
  nftTokenId: string; // 표시용 "#0012"
  status: 'issued' | 'used';
  qrToken: string;
  qrExpiresAt: number; // epoch ms
  /** 이 기기 키로 서명한 QR 증명. 서명할 수 없는 환경(WebCrypto 없음)에서는 없고 QR은 서명 없이 표시된다 */
  qrSignature?: QrSignature;
  issuedAt: number;
  usedAt?: number;
  /** 온체인 기록 (functions TicketChainState). 체인 연동 전 입장권과 mock에는 없다 */
  chain?: TicketChain;
};

/** QR 서명 (functions DeviceProof와 같은 모양). signedAt: 서명한 시각 epoch ms */
export type QrSignature = { signedAt: number; signature: string };

/** refreshQrToken 결과. signature가 있으면 QR은 TTV2 */
export type QrRefresh = { token: string; expiresAt: number; signature?: QrSignature };

/** pending: 체인에 기록 중 / done: 기록 끝 / blocked: 서버 지갑 가스 부족으로 대기 */
export type TicketChain = {
  status: 'pending' | 'done' | 'blocked';
  tokenId?: string;
  lastTx?: string;
};

/** 발급 현황 표용 */
export type TicketRow = Ticket & { ownerName: string; ownerStudentId: string };

/** 입장권 기록 타임라인 (온체인 기록은 11/4 이후 실제 tx로 교체) */
export type TicketHistoryItem = {
  type: 'issued' | 'reassigned' | 'used';
  at: number;
  detail: string;
  txHash: string;
};

/** 입장권 취소 결과. reassigned: 대기자에게 넘어감 / released: 대기자가 없어 다시 발급 가능 / used: 이미 사용돼 취소 불가 */
export type CancelResult = 'reassigned' | 'released' | 'used';

/** 취소·재배정 기록 (관리자) */
export type Reassignment = {
  id: string;
  ticketId: string;
  eventId: string;
  nftTokenId: string;
  fromUid?: string;
  fromName: string;
  toName?: string; // released면 없음
  mode: ReassignMode;
  outcome: 'reassigned' | 'released';
  createdAt: number;
};

/** 대기 명단 한 줄. 행사 담당자가 구글 시트(이름·학번, 대기 순서대로)로 등록한다. 메일은 보여주지 않는다 */
export type WaitlistEntry = {
  studentId: string;
  name: string;
  order: number;
  /** waiting: 대기 중 / assigned: 배정됨 / 그 밖(추첨 당첨 등)은 처리됨 */
  status: string;
};

/** 대기 명단 화면용. summary: 시트 요약 (아직 안 올렸으면 null) */
export type WaitlistView = { summary: RosterSummary | null; entries: WaitlistEntry[]; serviceAccountEmail: string };

/** mismatch: 2단계 검표에서 스태프가 "달라요"를 눌렀다 */
export type ScanResult = 'ok' | 'expired' | 'used' | 'invalid' | 'mismatch';

export type ScanLog = {
  id: string;
  eventId: string;
  ticketId?: string;
  userName?: string;
  userPhotoUrl?: string;
  studentId?: string;
  staffUid?: string;
  staffName?: string;
  result: ScanResult;
  at: number;
};

/**
 * wrong_event: 다른 학교 행사의 입장권. 기록에는 invalid로 남는다
 * signature_invalid: 서명이 없거나 이 기기 키와 맞지 않는 QR
 * needs_confirm: 2단계 검표. 아직 아무도 입장 처리되지 않았고 스태프의 답을 기다린다 (user, ticketId 있음)
 * no_pending: confirmEntry에서 확인 대기가 없거나 시간이 지남
 */
export type VerifyOutcome = ScanResult | 'wrong_event' | 'signature_invalid' | 'needs_confirm' | 'no_pending';

export type VerifyResult = {
  result: VerifyOutcome;
  user?: Pick<User, 'name' | 'studentId' | 'photoUrl'>;
  nftTokenId?: string;
  usedAt?: number;
  ticketId?: string;
};

/** confirmEntry 결과 */
export type ConfirmResult = { result: 'ok' | 'mismatch' | 'used' | 'no_pending' | 'invalid' };

export type EventStats = {
  enteredCount: number;
  capacity: number;
  rejectedCount: number;
  recent: ScanLog[];
};

export type StaffStats = { enteredCount: number; capacity: number; myCount: number };

/** 명단 한 줄. 행사 명단은 메일 없이 이름·학번만 (행사 담당자는 메일을 보지 않는다) */
export type RosterEntry = { email?: string; name: string; studentId: string };

/** 재학생 명단(학교)·행사 명단(행사) 요약 */
export type RosterSummary = { sheetUrl: string; importedAt: number; count: number };

/** 명단 화면용. entries는 앞부분만 (미리보기). serviceAccountEmail: 시트를 공유할 계정 */
export type RosterView = { summary: RosterSummary | null; entries: RosterEntry[]; serviceAccountEmail: string };

/** NOT_IN_STUDENT_ROSTER·NAME_MISMATCH: 행사 명단 줄이 주최 학교 재학생 명단과 맞지 않음 */
export type RosterSkipReason =
  | 'MISSING_FIELD'
  | 'BAD_STUDENT_ID'
  | 'BAD_DOMAIN'
  | 'DUPLICATE_STUDENT_ID'
  | 'DUPLICATE_EMAIL'
  | 'NOT_IN_STUDENT_ROSTER'
  | 'NAME_MISMATCH';

/** 시트 불러오기 결과. skipped: 쓰지 못한 줄 (시트의 줄 번호) */
export type RosterImport = { summary: RosterSummary; skipped: { row: number; reason: RosterSkipReason }[] };

/** 가입 화면의 학교 고르기 (재학생 명단을 불러온 학교) */
export type OpenSchool = { id: string; name: string; domain: string };

/** 가입할 때 입력한 값. 메일 링크를 열면 이 값으로 재학생 명단 대조를 한다 */
export type SignupInfo = { schoolId: string; name: string; studentId: string };

/** 메일을 보내기 전 명단 확인 결과 */
export type PrecheckResult = { schoolId: string; schoolName: string };

/** 스페이스 만들기·수정 */
export type SchoolInput = { name: string; domain: string; brandColor: string };

/** 행사 등록. schoolIds[0]이 주최 학교, 나머지는 함께하는 학교 (고연전) */
export type EventInput = {
  schoolIds: string[];
  name: string;
  date: string; // ISO (+09:00)
  place: string;
  capacity: number;
  faceValue: number;
  requireRoster: boolean;
};

// ---------- 운영진 콘솔 (/ops) ----------

export type OpsRosterKind = 'school' | 'event';

/** 운영진이 보는 명단 한 줄. 학교 명단은 가입 여부(claimed), 행사 명단은 재학생 명단과 맞는지(match)와 그 학생 메일 */
export type OpsRosterRow = {
  name: string;
  studentId: string;
  email?: string;
  claimed?: boolean;
  match?: 'OK' | 'NOT_IN_STUDENT_ROSTER' | 'NAME_MISMATCH';
};

/** editable: 행사 명단은 행사 담당자가 시트로 한 번 불러온 뒤에만 고칠 수 있다 (재학생 명단은 항상 true) */
export type OpsRoster = { rows: OpsRosterRow[]; summary: RosterSummary | null; schoolId?: string; editable: boolean };

/** 명단 고치기. upserts는 학번 기준으로 추가·덮어쓰기, deletes는 지울 학번, replace면 upserts에 없는 줄을 모두 지운다 */
export type OpsRosterEdit = {
  upserts: { name: string; studentId: string; email?: string }[];
  deletes: string[];
  replace?: boolean;
};

export type OpsEditResult = {
  saved: number;
  deleted: number;
  skipped: { index: number; reason: RosterSkipReason }[];
  summary: RosterSummary;
};

/** 운영진 기기 관리용 학생 (가입한 학생) */
export type OpsStudent = {
  uid: string;
  name: string;
  studentId: string;
  email: string;
  deviceRegistered: boolean;
  resetRequested: boolean;
};

/** 행사 담당자 계정. pending: 아직 로그인 전 (처음 구글 로그인할 때 적용) */
export type OpsEventAdmin = { email: string; name: string; schoolId: string; pending: boolean };

export type DeviceResetRequest = {
  id: string;
  uid: string;
  userName: string;
  studentId: string;
  deviceName: string;
  requestedAt: number;
  status: 'pending' | 'done';
};

/** 로그인 실패 사유. UI 문구는 화면에서 정한다. */
export class ApiError extends Error {
  readonly code:
    | 'not_school_account'
    | 'sold_out'
    | 'not_found'
    | 'unauthenticated'
    | 'not_in_roster'
    | 'invalid_state'
    | 'wrong_role' // 학생이 아닌 계정(스태프·학생회)으로 입장권을 받으려 함
    | 'device_blocked' // 다른 기기에 등록된 계정
    | 'cancelled_before' // 이 행사 입장권을 취소한 적이 있음
    | 'email_mismatch' // 회원가입·학번 로그인: 그 학번 줄의 메일이 입력한 메일과 다름
    | 'not_registered' // 아직 가입(명단 대조·사진)을 마치지 않은 학생, 또는 명단에서 빠진 학생
    | 'student_id_taken' // 회원가입: 그 학번으로 이미 가입한 계정이 있음
    | 'domain_taken' // 스페이스: 다른 학교가 쓰는 메일 도메인
    | 'sheet_bad_url' // 구글 시트 주소가 아님
    | 'sheet_not_shared' // 서비스 계정에 공유되지 않은 시트
    | 'sheet_not_found'
    | 'sheet_api_disabled' // 프로젝트에서 Sheets API가 꺼져 있음
    | 'sheet_missing_columns' // 첫 줄에 필요한 열(이름·학번, 재학생 명단은 이메일까지)이 없음
    | 'wrong_password' // 운영진 로그인: 아이디나 비밀번호가 다름
    | 'too_many_attempts' // 운영진 로그인: 잠시 막힘
    | 'chain_unavailable' // 체인(RPC)을 읽지 못함. 다시 시도
    | 'unknown';
  constructor(code: ApiError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** 추첨 행사에서 내 상태 (getMyLottery). 대기 인원·순번·확률은 오지 않는다. 낙첨 상태는 없다(다음 회차를 기다림) */
export type LotteryState = 'none' | 'waiting' | 'won' | 'claimed' | 'expired' | 'closed';
export type MyLottery = {
  state: LotteryState;
  nextAnnounceAt: number | null; // 다음 발표 시각 (공개 고정 시각)
  offer: { ticketId: string; expiresAt: number } | null; // 당첨: 이 시각까지 claimTicket
  /** 가장 최근에 들어간 회차의 내 응모 정보. verifyMyDraw에 그대로 넘긴다 */
  receipt: { eventId: string; round: number; uid: string; salt: string; proof: string[]; root: string; tokenIds: string[] } | null;
};
export type ClaimResult = 'claimed' | 'no_offer' | 'expired';
export type RunDrawResult =
  | { ok: true; round: number; tickets: number; entries: number }
  | { ok: false; reason: 'not_lottery' | 'no_tickets' | 'no_entries' | 'round_open' };
