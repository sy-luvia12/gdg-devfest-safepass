// 데모 모드: 로그인 화면에서 정해 둔 학번·메일을 넣으면 이 브라우저만 mock 백엔드(lib/mock.ts)로 돈다.
// 메일 인증 없이 바로 들어오고, 데이터는 이 브라우저(localStorage)에만 남는다. 서버·체인에는 아무것도 가지 않는다.
// 학교 4곳(고려대·연세대·성균관대·KAIST)마다 데모 계정이 하나씩 있고, 계정마다 그 학교의 가짜 데이터를 본다.
// 학생 화면만 보여준다. 데모는 그 탭에서만 켜지고(sessionStorage), 나가기·로그아웃하면 실제 메인 화면으로 돌아간다.

const DEMO_KEY = 'campass-demo';
/** 데모 모드에서 mock이 쓰는 상태. 개발용 mock 데이터(safepass-mock-*)와 섞이지 않게 따로 둔다 */
export const DEMO_STATE_KEY = 'campass-demo-state-v2';
/** mock.ts의 로그인 세션 키 (탭마다 따로) */
export const MOCK_SESSION_KEY = 'safepass-mock-session';
const MOCK_ENTRIES_KEY = 'safepass-mock-entry-draws';

/** 데모 계정 학번. 네 학교 모두 같고, 메일 도메인으로 학교를 고른다 */
export const DEMO_STUDENT_ID = '2027000000';

/** 데모 계정은 학교 마스코트다. 사진은 public/mock/demo/{schoolId}.jpg */
export const DEMO_LOGINS = [
  { schoolId: 'korea', email: 'demo@korea.ac.kr', name: '호이' },
  { schoolId: 'yonsei', email: 'demo@yonsei.ac.kr', name: '연수리' },
  { schoolId: 'skku', email: 'demo@skku.edu', name: '명륜이율전이' },
  { schoolId: 'kaist', email: 'demo@kaist.ac.kr', name: '넙죽이' },
].map((d) => ({ ...d, uid: `${d.schoolId}-s1`, photoUrl: `/mock/demo/${d.schoolId}.jpg` }));

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

/** 로그인 입력이 데모 계정이면 그 계정 */
export function findDemoLogin(studentId: string, email: string) {
  if (studentId.trim() !== DEMO_STUDENT_ID) return null;
  const normalized = email.trim().toLowerCase();
  return DEMO_LOGINS.find((d) => d.email === normalized) ?? null;
}

/** 데모 모드로 바꾸고 그 계정으로 로그인한 채 새로 연다 (api.ts가 처음 불릴 때 mock을 고르게) */
export function enterDemo(uid: string) {
  try {
    // 전에 남은 데모 데이터 없이 새로 시작한다
    for (const key of [DEMO_STATE_KEY, MOCK_ENTRIES_KEY]) localStorage.removeItem(key);
    sessionStorage.setItem(DEMO_KEY, '1');
    sessionStorage.setItem(MOCK_SESSION_KEY, uid);
  } catch {
    return;
  }
  window.location.replace('/events');
}

/** 데모 데이터를 지우고 실제 서비스 로그인 화면으로 돌아간다 */
export function exitDemo() {
  try {
    for (const key of [DEMO_STATE_KEY, MOCK_ENTRIES_KEY]) localStorage.removeItem(key);
    sessionStorage.removeItem(DEMO_KEY);
    sessionStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
  window.location.replace('/');
}
