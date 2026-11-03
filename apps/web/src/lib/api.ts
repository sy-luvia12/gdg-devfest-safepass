// 데이터 함수 (백엔드 소유). 프론트는 이 파일만 import 한다.
// .env.local에 Firebase 설정이 있으면 백엔드(firebaseApi.ts)에, 없거나 VITE_BACKEND=mock이면 mock.ts에 연결한다.
// 백엔드에 아직 없는 기능은 실제 연결에서 빈 결과를 돌려주거나 invalid_state로 거절한다 (화면은 "다음 단계" 표시).
import { ApiError } from '@/types';
import { firebaseConfigured } from './firebase';
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
export const getEvent: typeof mock.getEvent = real ? fb.getEvent : mock.getEvent;
export const updateEventTheme: typeof mock.updateEventTheme = real ? notYet : mock.updateEventTheme;
export const updateEventSettings: typeof mock.updateEventSettings = real ? notYet : mock.updateEventSettings;
/** 테스트용: 취소 후 재발급 허용 (백엔드 setAllowReissue) */
export const updateAllowReissue: typeof mock.updateAllowReissue = real ? fb.updateAllowReissue : mock.updateAllowReissue;

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
export const refreshQrToken: typeof mock.refreshQrToken = real ? fb.refreshQrToken : mock.refreshQrToken;
export const formatQrPayload: typeof mock.formatQrPayload = real ? fb.formatQrPayload : mock.formatQrPayload;
export const getTicketHistory: typeof mock.getTicketHistory = real ? empty([]) : mock.getTicketHistory;

// 입장권 취소 → 대기 명단 재배정 (양도 대체)
export const cancelTicket: typeof mock.cancelTicket = real ? fb.cancelTicket : mock.cancelTicket;

// 검표
export const verifyEntry: typeof mock.verifyEntry = real ? fb.verifyEntry : mock.verifyEntry;
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
export const updateReassignMode: typeof mock.updateReassignMode = real ? fb.updateReassignMode : mock.updateReassignMode;
export const listTickets: typeof mock.listTickets = real ? empty([]) : mock.listTickets;
export const getRoster: typeof mock.getRoster = real ? empty(null) : mock.getRoster;
export const importRoster: typeof mock.importRoster = real ? notYet : mock.importRoster;
export const listStaff: typeof mock.listStaff = real ? empty([]) : mock.listStaff;
export const addStaff: typeof mock.addStaff = real ? notYet : mock.addStaff;
export const removeStaff: typeof mock.removeStaff = real ? notYet : mock.removeStaff;
