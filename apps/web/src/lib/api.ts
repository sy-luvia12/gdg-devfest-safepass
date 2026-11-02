// 데이터 함수 (백엔드 소유). 프론트는 이 파일만 import 한다.
// 지금은 mock 구현을 그대로 내보낸다. Firebase 구현이 준비되면 이 파일만 교체한다.
export {
  // 로그인 · 학교 · 행사
  signInWithSchoolAccount,
  signOut,
  getCurrentUser,
  getSchool,
  getEvent,
  updateEventTheme,
  updateEventSettings,
  // 재학생 승인 · 기기
  submitVerification,
  listPendingVerifications,
  reviewVerification,
  requestDeviceReset,
  getMyDeviceReset,
  listDeviceResets,
  resolveDeviceReset,
  // 입장권
  issueTicket,
  getMyTicket,
  refreshQrToken,
  getTicketHistory,
  // 양도
  transferTicket,
  getMyTransfers,
  getTransfer,
  acceptTransfer,
  declineTransfer,
  cancelTransfer,
  // 검표
  verifyEntry,
  confirmEntry,
  subscribeStaffStats,
  getMyScanHistory,
  // 관리자
  subscribeEventStats,
  listEntries,
  listTransfers,
  listTickets,
  getRoster,
  importRoster,
  listStaff,
  addStaff,
  removeStaff,
} from './mock';
