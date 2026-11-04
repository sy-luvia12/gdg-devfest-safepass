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
export const subscribeMyTicket: typeof mock.subscribeMyTicket = real ? fb.subscribeMyTicket : mock.subscribeMyTicket;
export const refreshQrToken: typeof mock.refreshQrToken = real ? fb.refreshQrToken : mock.refreshQrToken;
export const formatQrPayload: typeof fb.formatQrPayload = real ? fb.formatQrPayload : mock.formatQrPayload;
export const getTicketHistory: typeof mock.getTicketHistory = real ? empty([]) : mock.getTicketHistory;

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
export const updateReassignMode: typeof mock.updateReassignMode = real ? fb.updateReassignMode : mock.updateReassignMode;
export const listTickets: typeof mock.listTickets = real ? fb.listTickets : mock.listTickets;
export const listStaff: typeof mock.listStaff = real ? fb.listStaff : mock.listStaff;
export const addStaff: typeof mock.addStaff = real ? fb.addStaff : mock.addStaff;
export const removeStaff: typeof mock.removeStaff = real ? fb.removeStaff : mock.removeStaff;
