// 공통 타입 (백엔드 소유). 계약은 CLAUDE.md "데이터 모델" 기준.

export type Role = 'student' | 'staff' | 'admin';

export type School = {
  id: string;
  name: string; // 예: "한빛대학교"
  domain: string; // 학교 이메일 도메인
  brandColor: string; // 학교 상징색 hex. 테마 기본 시드
  currentEventId: string; // 처음 보여줄 행사. 학교의 행사 목록은 listEvents(schoolId)
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
  issuedAt: number;
  usedAt?: number;
  /** 온체인 기록 (functions TicketChainState). 체인 연동 전 입장권과 mock에는 없다 */
  chain?: TicketChain;
};

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

/** 대기 명단 (학생회가 구글 시트로 등록, 프로토타입은 시드) */
export type WaitlistEntry = {
  email: string;
  name: string;
  order: number;
  status: 'waiting' | 'assigned';
};

export type ScanResult = 'ok' | 'expired' | 'used' | 'invalid';

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

/** wrong_event: 다른 학교 행사의 입장권. 기록에는 invalid로 남는다 */
export type VerifyResult = {
  result: ScanResult | 'wrong_event';
  user?: Pick<User, 'name' | 'studentId' | 'photoUrl'>;
  nftTokenId?: string;
  usedAt?: number;
  ticketId?: string;
};

export type EventStats = {
  enteredCount: number;
  capacity: number;
  rejectedCount: number;
  recent: ScanLog[];
};

export type StaffStats = { enteredCount: number; capacity: number; myCount: number };

export type RosterEntry = { email: string; name: string; studentId: string };

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
    | 'device_blocked' // 다른 기기에 등록된 계정
    | 'cancelled_before' // 이 행사 입장권을 취소한 적이 있음
    | 'unknown';
  constructor(code: ApiError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
