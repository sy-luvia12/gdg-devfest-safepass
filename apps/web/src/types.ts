// 공통 타입 (백엔드 소유). 계약은 CLAUDE.md "데이터 모델" 기준.

export type Role = 'student' | 'staff' | 'admin';

export type School = {
  id: string;
  name: string; // 예: "한빛대학교"
  domain: string; // 학교 이메일 도메인
  brandColor: string; // 학교 상징색 hex. 테마 기본 시드
  currentEventId: string; // 프로토타입은 학교당 행사 1개
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
  twoStepCheck: boolean; // 검표 2단계: 사진 대조 후 스태프가 승인해야 입장 처리
};

export type Event = {
  id: string;
  schoolId: string;
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
};

/** 발급 현황 표용 */
export type TicketRow = Ticket & { ownerName: string; ownerStudentId: string };

/** 입장권 기록 타임라인 (온체인 기록은 11/4 이후 실제 tx로 교체) */
export type TicketHistoryItem = {
  type: 'issued' | 'transfer_out' | 'transfer_in' | 'used';
  at: number;
  detail: string;
  txHash: string;
};

export type TransferReason = 'over_face_value' | 'not_student' | 'already_has_ticket';

/** 양도는 보낸 쪽 요청(pending) → 받는 쪽 수락(success)으로 끝난다 (기술 설계 2.1 list/buy) */
export type Transfer = {
  id: string;
  ticketId: string;
  eventId: string;
  fromUid: string;
  toEmail: string;
  price: number;
  result: 'pending' | 'success' | 'rejected' | 'declined' | 'cancelled';
  reason?: TransferReason;
  createdAt: number;
  resolvedAt?: number;
};

/** 화면 표시용으로 이름·NFT 번호를 붙인 양도 */
export type TransferView = Transfer & {
  fromName: string;
  toName?: string;
  eventName: string;
  nftTokenId: string;
};

export type ScanResult = 'ok' | 'expired' | 'used' | 'invalid' | 'mismatch';

export type ScanLog = {
  id: string;
  eventId: string;
  ticketId?: string;
  userName?: string;
  userPhotoUrl?: string;
  studentId?: string;
  staffUid?: string;
  result: ScanResult; // mismatch: 2단계 검표에서 얼굴 불일치
  at: number;
};

export type VerifyResult = {
  result: Exclude<ScanResult, 'mismatch'>;
  user?: Pick<User, 'name' | 'studentId' | 'photoUrl'>;
  nftTokenId?: string;
  usedAt?: number;
  ticketId?: string;
  /** true면 아직 입장 처리 전. 스태프가 confirmEntry로 확정한다 */
  needsConfirm?: boolean;
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
    | 'unknown';
  constructor(code: ApiError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
