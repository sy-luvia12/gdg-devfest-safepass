// 데이터 함수 (백엔드 소유). 프론트는 이 파일만 import 한다.
// .env.local에 Firebase 설정이 있으면 백엔드(firebaseApi.ts)에, 없거나 VITE_BACKEND=mock이면 mock.ts에 연결한다.
// 백엔드에 아직 없는 기능은 실제 연결에서 빈 결과를 돌려주거나 invalid_state로 거절한다 (화면은 "다음 단계" 표시).
import { ApiError } from '@/types';
import { firebaseConfigured } from './firebase';
import * as chain from './chain/live';
import * as fb from './firebaseApi';
import * as mock from './mock';

export const USE_MOCK = import.meta.env.VITE_BACKEND === 'mock' || !firebaseConfigured;
const real = !USE_MOCK;

const empty =
  <T>(value: T) =>
  async () =>
    value;
const notYet = async (): Promise<never> => {
  throw new ApiError('invalid_state');
};

// 로그인 · 학교 · 행사
export const signInWithSchoolAccount: typeof mock.signInWithSchoolAccount = real
  ? fb.signInWithSchoolAccount
  : mock.signInWithSchoolAccount;
export const signOut: typeof mock.signOut = real ? fb.signOut : mock.signOut;
export const getCurrentUser: typeof mock.getCurrentUser = real ? fb.getCurrentUser : mock.getCurrentUser;
export const getSchool: typeof mock.getSchool = real ? fb.getSchool : mock.getSchool;
export const listSchools: typeof mock.listSchools = real ? fb.listSchools : mock.listSchools;
export const listEvents: typeof mock.listEvents = real ? fb.listEvents : mock.listEvents;
export const getEvent: typeof mock.getEvent = real ? fb.getEvent : mock.getEvent;
export const updateEventTheme: typeof mock.updateEventTheme = real ? notYet : mock.updateEventTheme;
export const updateEventSettings: typeof mock.updateEventSettings = real ? fb.updateEventSettings : mock.updateEventSettings;
/** 테스트용: 취소 후 재발급 허용 (백엔드 setAllowReissue) */
export const updateAllowReissue: typeof mock.updateAllowReissue = real ? fb.updateAllowReissue : mock.updateAllowReissue;

// 스페이스 · 명단 · 행사 등록 (관리자). 명단은 구글 시트를 서버가 읽는다
export const upsertSchool: typeof mock.upsertSchool = real ? fb.upsertSchool : mock.upsertSchool;
export const getStudentRoster: typeof mock.getStudentRoster = real ? fb.getStudentRoster : mock.getStudentRoster;
export const importStudentRoster: typeof mock.importStudentRoster = real
  ? fb.importStudentRoster
  : mock.importStudentRoster;
export const getEventRoster: typeof mock.getEventRoster = real ? fb.getEventRoster : mock.getEventRoster;
export const importEventRoster: typeof mock.importEventRoster = real ? fb.importEventRoster : mock.importEventRoster;
export const createEvent: typeof mock.createEvent = real ? fb.createEvent : mock.createEvent;
export const updateEvent: typeof mock.updateEvent = real ? fb.updateEvent : mock.updateEvent;
/** 회원가입: 재학생 명단 대조 (로그인 담당 화면이 호출) */
export const verifyStudentRoster: typeof mock.verifyStudentRoster = real
  ? fb.verifyStudentRoster
  : mock.verifyStudentRoster;

// 학생 가입·로그인: 메일 링크 (docs/student-auth.md). 운영진은 signInWithSchoolAccount(구글)
export const listOpenSchools: typeof mock.listOpenSchools = real ? fb.listOpenSchools : mock.listOpenSchools;
export const precheckStudent: typeof mock.precheckStudent = real ? fb.precheckStudent : mock.precheckStudent;
export const sendSignInLink: typeof mock.sendSignInLink = real ? fb.sendSignInLink : mock.sendSignInLink;
export const isSignInLink: typeof mock.isSignInLink = real ? fb.isSignInLink : mock.isSignInLink;
export const pendingSignInEmail: typeof mock.pendingSignInEmail = real ? fb.pendingSignInEmail : mock.pendingSignInEmail;
export const completeSignInLink: typeof mock.completeSignInLink = real ? fb.completeSignInLink : mock.completeSignInLink;
export const submitProfilePhoto: typeof mock.submitProfilePhoto = real ? fb.submitProfilePhoto : mock.submitProfilePhoto;

// 운영진 콘솔 (/ops). 아이디·비밀번호로 들어오는 SafePass 운영진만 쓴다. 명단은 서버에 저장된 것을 바로 고친다
export const signInAsOperator: typeof mock.signInAsOperator = real ? fb.signInAsOperator : mock.signInAsOperator;
export const opsListRoster: typeof mock.opsListRoster = real ? fb.opsListRoster : mock.opsListRoster;
export const opsEditRoster: typeof mock.opsEditRoster = real ? fb.opsEditRoster : mock.opsEditRoster;
export const opsListStudents: typeof mock.opsListStudents = real ? fb.opsListStudents : mock.opsListStudents;
export const opsResetDevice: typeof mock.opsResetDevice = real ? fb.opsResetDevice : mock.opsResetDevice;
export const opsListEventAdmins: typeof mock.opsListEventAdmins = real ? fb.opsListEventAdmins : mock.opsListEventAdmins;
export const opsSetEventAdmin: typeof mock.opsSetEventAdmin = real ? fb.opsSetEventAdmin : mock.opsSetEventAdmin;

// 재학생 승인 · 기기 (백엔드 다음 단계 2.2, 2.3)
export const submitVerification: typeof mock.submitVerification = real ? notYet : mock.submitVerification;
export const listPendingVerifications: typeof mock.listPendingVerifications = real
  ? empty([])
  : mock.listPendingVerifications;
export const reviewVerification: typeof mock.reviewVerification = real ? notYet : mock.reviewVerification;
export const requestDeviceReset: typeof mock.requestDeviceReset = real ? fb.requestDeviceReset : mock.requestDeviceReset;
export const getMyDeviceReset: typeof mock.getMyDeviceReset = real ? fb.getMyDeviceReset : mock.getMyDeviceReset;
export const listDeviceResets: typeof mock.listDeviceResets = real ? fb.listDeviceResets : mock.listDeviceResets;
export const resolveDeviceReset: typeof mock.resolveDeviceReset = real ? fb.resolveDeviceReset : mock.resolveDeviceReset;
/** 관리자가 학생 이메일로 기기 등록을 지운다 (백엔드 resetDevice) */
export const resetDeviceByEmail: typeof mock.resetDeviceByEmail = real ? fb.resetDeviceByEmail : mock.resetDeviceByEmail;

// 입장권
export const issueTicket: typeof mock.issueTicket = real ? fb.issueTicket : mock.issueTicket;
export const getMyTicket: typeof mock.getMyTicket = real ? fb.getMyTicket : mock.getMyTicket;
export const myRosterStatus: typeof mock.myRosterStatus = real ? fb.myRosterStatus : mock.myRosterStatus;
export const subscribeMyTicket: typeof mock.subscribeMyTicket = real ? fb.subscribeMyTicket : mock.subscribeMyTicket;
export const refreshQrToken: typeof mock.refreshQrToken = real ? fb.refreshQrToken : mock.refreshQrToken;
export const formatQrPayload: typeof fb.formatQrPayload = real ? fb.formatQrPayload : mock.formatQrPayload;
export const getTicketHistory: typeof mock.getTicketHistory = real ? chain.getChainTicketHistory : mock.getTicketHistory;

// 입장권 취소 → 대기 명단 재배정 (양도 대체)
export const cancelTicket: typeof mock.cancelTicket = real ? fb.cancelTicket : mock.cancelTicket;

// 검표
export const verifyEntry: typeof mock.verifyEntry = real ? fb.verifyEntry : mock.verifyEntry;
export const confirmEntry: typeof mock.confirmEntry = real ? fb.confirmEntry : mock.confirmEntry;
export const subscribeStaffStats: typeof mock.subscribeStaffStats = real
  ? fb.subscribeStaffStats
  : mock.subscribeStaffStats;
export const getMyScanHistory: typeof mock.getMyScanHistory = real ? fb.getMyScanHistory : mock.getMyScanHistory;

// 관리자
export const subscribeEventStats: typeof mock.subscribeEventStats = real
  ? fb.subscribeEventStats
  : mock.subscribeEventStats;
export const listEntries: typeof mock.listEntries = real ? fb.listEntries : mock.listEntries;
export const listReassignments: typeof mock.listReassignments = real ? fb.listReassignments : mock.listReassignments;
export const getWaitlist: typeof mock.getWaitlist = real ? fb.getWaitlist : mock.getWaitlist;
/** 대기 명단 시트 불러오기 (행사 담당자) */
export const importWaitlist: typeof mock.importWaitlist = real ? fb.importWaitlist : mock.importWaitlist;
export const updateReassignMode: typeof mock.updateReassignMode = real ? fb.updateReassignMode : mock.updateReassignMode;
export const listTickets: typeof mock.listTickets = real ? fb.listTickets : mock.listTickets;
export const listStaff: typeof mock.listStaff = real ? fb.listStaff : mock.listStaff;
export const addStaff: typeof mock.addStaff = real ? fb.addStaff : mock.addStaff;
export const removeStaff: typeof mock.removeStaff = real ? fb.removeStaff : mock.removeStaff;

// 체인 직접 읽기 (Firebase를 거치지 않음). 화면에는 "체인 기록" 배지를 붙이고 서버 기록과 섞지 않는다
/** S8 공개 현황판: 정원·활성·발급·입장·재배정·회수 건수 */
export const getChainEventStatus: typeof mock.getChainEventStatus = real ? chain.getChainEventStatus : mock.getChainEventStatus;
/** 추첨 회차의 체인 기록 (commitment, 시드). 커밋 전이면 null */
export const getChainDraw: typeof mock.getChainDraw = real ? chain.getChainDraw : mock.getChainDraw;
/** S7 "직접 검증하기": 내 응모가 스냅샷에 있고 체인의 커밋·시드와 맞는지 */
export const verifyMyDraw: typeof mock.verifyMyDraw = real ? chain.verifyMyDraw : mock.verifyMyDraw;
/** S7 데모 회차 (Base Sepolia 실제 회차, 가짜 응모자 10명). 응모자 하나를 골라 verifyMyDraw에 넘긴다 */
export const DEMO_DRAW = chain.DEMO_DRAW;
export type { ChainDraw, ChainEventStatus, DrawCheck, MyDrawEntry } from './chain/types';

// 취소표 추첨 (추첨 행사만, docs/api.md 14장). 상태: 추첨 대기 중 / 당첨(수락 대기, 기한) / 수락 완료 / 수락 기한 지남 / 추첨 마감
// 즉석 추첨 (instantDraw 행사). 행사 화면을 열면 응모되고, 체인이 정한 당첨자만 입장권을 받는다
export const enterDraw: typeof mock.enterDraw = real ? fb.enterDraw : mock.enterDraw;
export const getMyEntryDraw: typeof mock.getMyEntryDraw = real ? fb.getMyEntryDraw : mock.getMyEntryDraw;
/** "다시 검증하기": 체인의 응모·시드를 읽어 폰에서 다시 계산 */
export const verifyMyEntry: typeof mock.verifyMyEntry = real ? chain.verifyMyEntry : mock.verifyMyEntry;
export type { EntryCheck, EntryVerification } from './chain/types';
export { formatRate } from './chain/entry';

export const getMyLottery: typeof mock.getMyLottery = real ? fb.getMyLottery : mock.getMyLottery;
export const claimTicket: typeof mock.claimTicket = real ? fb.claimTicket : mock.claimTicket;
/** 관리자 "지금 추첨" */
export const runDrawNow: typeof mock.runDrawNow = real ? fb.runDrawNow : mock.runDrawNow;
