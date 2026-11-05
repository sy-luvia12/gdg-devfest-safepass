# CLAUDE.md — SafePass 프로토타입

이 파일은 이 저장소에서 작업하는 AI 코딩 도구(Claude Code 등)를 위한 지침이다. 작업 전에 반드시 읽고 따른다.
기준 문서(노션): `최종 기획 (수정안)` → `프로토타입 개발 계획 (내일 제출)` → `기술 설계 · 이후 개발 계획`. 이 파일과 노션이 다르면 노션의 최신 내용을 따르고, 이 파일을 고친다.

## 프로젝트 한 줄 요약
대학 축제의 암표와 학생증 대여를 막는 **재학생 인증 입장권** 웹앱. 학교 계정으로 1인 1매를 발급하고, 30초마다 바뀌는 QR과 본인 사진으로 검표한다.

- 피치: "학생증은 빌려줄 수 있어도, 내 계정과 내 얼굴은 빌려줄 수 없다"
- 고객: 총학생회·축제기획단 (B2B) / 사용자: 재학생 (무료)
- 해커톤: 2026 DevFest (Google 기술 활용 웹 서비스)
- 제출물: **배포된 URL** (프로토타입, 11/3 제출). 완성도보다 **핵심 흐름 하나가 끊기지 않는 것**이 우선
- 팀: 백엔드 1명 / 디자인+프론트 1명 / PM 업무는 병행

## 앱 형태
- **React 웹앱 하나**로 학생·검표·관리자 화면을 모두 만든다. 네이티브 앱이나 관리자용 별도 앱은 만들지 않는다.
- 화면 묶음과 기기 기준:

| 묶음 | 쓰는 사람 | 기기 기준 레이아웃 |
|---|---|---|
| 학생 | 재학생 | 폰 (모바일 우선) |
| 검표 | 입구 스태프 | 폰 (카메라 사용, 모바일 우선) |
| 관리자 | 학생회 운영진 | **노트북·태블릿에서도 넓게** (반응형) |

- 학생·검표 화면은 폰 기준으로 만들고, 넓은 화면에서는 내용 영역만 가운데 정렬한다(폰 프레임으로 가두지 않는다).
- 관리자 화면은 데스크톱에서 넓은 레이아웃(그리드)으로 보여준다. 자세한 규칙은 `DESIGN.md` 4.1장.

## 기술 스택
### 프론트 (확정)
- React 18 + Vite + TypeScript
- Tailwind CSS (토큰은 `DESIGN.md` 9장 설정 사용)
- React Router
- QR 생성: `qrcode.react` / QR 스캔: `html5-qrcode`
- 아이콘: `lucide-react` / 폰트: Pretendard

### 백엔드 (노션 기술 설계 기준, 백엔드 담당이 진행)
- Firebase: Auth(구글 로그인), Firestore, Cloud Functions, Hosting
- Cloud Functions는 **Blaze 요금제**에서만 배포된다. 프로젝트 만들 때 같이 전환한다.
- 프론트는 백엔드 구현을 몰라도 된다. **`lib/api.ts`의 함수만 호출**하고, 백엔드 완성 전에는 `lib/mock.ts`로 개발한다.

새 라이브러리를 추가하기 전에 꼭 필요한지 먼저 확인하고, 추가했다면 팀에 알릴 수 있도록 작업 요약에 적는다.

## 디자인
- 모든 UI는 **`DESIGN.md`를 따른다.** 색상·간격·모서리·컴포넌트 규칙을 임의로 바꾸지 않는다.
- 흰 배경, 화면당 그라데이션 포인트 1개, 주 버튼 1개.
- 텍스트는 한국어. 이모지 금지, 아이콘은 lucide 라인 아이콘.
- 무료 행사가 기본이므로 화면 문구는 "구매"가 아니라 "받기·발급"을 쓴다.

## 폴더 구조와 담당 (충돌 방지 규칙)
```
apps/web/                 # 웹앱 (프론트)
  src/
    app/                  # 라우터, 레이아웃(관리자 메뉴 포함), 권한 가드, 테마  ← 프론트
    components/           # 공통 UI (Button, Card, TicketCard, ResponsiveTable, ...) ← 프론트
    pages/
      public/             # 서비스 소개, 이용약관, 개인정보 처리방침   ← 프론트
      common/             # 내 정보 (모든 역할)                      ← 프론트
      student/            # 로그인, 온보딩, 축제 목록·상세, 입장권, 취소     ← 프론트
      staff/              # 검표, 내 검표 기록                        ← 프론트
      admin/              # 관리자 메뉴 9개                           ← 프론트
    lib/
      firebase.ts         # Firebase 초기화                   ← 백엔드
      api.ts              # 데이터 함수 (아래 계약)            ← 백엔드
      mock.ts             # 백엔드 완성 전 가짜 데이터          ← 누구나
    types.ts              # 공통 타입                          ← 백엔드
functions/                # Cloud Functions                    ← 백엔드
  src/handlers/           #   callable 함수 (발급, 취소·재배정, QR 토큰, 검표, 기기, 스태프 등)
  src/domain/             #   순수 규칙 (재배정 후보 순서, 기기 서명, 번호 형식)
  src/sheets/             #   구글 시트 읽기 (서비스 계정, 재학생·행사 명단)
  src/chain/              #   체인 아웃박스·클라이언트 (NFT 기록)
  seed.ts                 #   학교·행사·테스트 계정 시드
contracts/                # FestivalTicket.sol (Hardhat, Base Sepolia)  ← 블록체인
firestore.rules           #                                    ← 백엔드
firebase.json             #                                    ← 백엔드
```
- 11/4 이후 `functions/src/auth|sheets|privacy`(학교 메일 인증, 명단 시트, 개인정보 파기)가 추가된다. `contracts/`와 `functions/src/chain`은 이미 들어와 있다.
- **요청받은 폴더 밖의 파일은 수정하지 않는다.** 남의 소유 파일을 바꿔야 하면 수정하지 말고 "어떤 변경이 필요한지"를 작업 요약에 적는다.
- 전체 코드 포맷 변경, 대규모 리팩터링, 파일 이름 일괄 변경 금지.
- 작업은 작게 나누고, 한 번에 한 화면/한 기능만 다룬다.

## 만들 것 (우선순위 순)
1. 학교 계정 로그인
2. 입장권 발급 (1인 1매)
3. 내 입장권: 30초마다 바뀌는 QR + 사진·이름·학번
4. 검표: QR 스캔 → 사진 대조 → 입장 처리, 사용됨/만료 QR 거부
5. 관리자: 입장 인원 실시간 표시 (정원 대비)
6. 입장권 취소 → 대기 명단 재배정 (정가 양도를 대체했다. 개인 간 거래 없음)

양도 기능은 없다. 다시 만들지 않는다. 취소표는 운영 규칙(`queue` 대기 순서 / `random` 무작위)대로 대기자에게 넘어간다. 새벽에 기능 추가 금지.
화면은 11/4 이후 기능(재학생 승인, 기기 등록, 명단 연동 등)까지 mock으로 미리 만들어 두었다. 실제 연동 전인 화면에는 `NextStepNote`로 "다음 단계"를 표시한다.

## 라우트
| 경로 | 화면 | 접근 |
|---|---|---|
| `/` | 로그인 | 비로그인 |
| `/about` | 서비스 소개 (학생회·심사위원용) | 누구나 |
| `/terms`, `/privacy` | 이용약관, 개인정보 처리방침 | 누구나 |
| `/onboarding` | 첫 로그인: 동의 → 본인 사진 → 학생증 → 승인 요청 | 학생 |
| `/onboarding/pending` | 학생회 승인 대기 | 학생 |
| `/device` | 다른 기기에 이미 등록됨 → 초기화 요청 | 학생 |
| `/events` | 학교가 참여하는 축제 목록 (2개 이상일 때) | 학생 |
| `/event` | 축제 상세 · 입장권 발급 | 학생 |
| `/ticket` | 내 입장권 (QR), 취소 | 학생 |
| `/ticket/history` | 발급·재배정·입장 기록 | 학생 |
| `/me` | 내 정보·설정·로그아웃 | 모든 역할 |
| `/staff/scan` | 검표 (2단계: 사진 대조 후 입장 처리) | staff, admin |
| `/staff/history` | 내 검표 기록 | staff, admin |
| `/admin` | 실시간 현황 | admin |
| `/admin/entries` | 입장 기록 (필터·검색·CSV) | admin |
| `/admin/tickets` | 발급 현황 | admin |
| `/admin/reassignments` | 취소·재배정 기록, 대기 명단(시트 등록, 이름·학번만), 재배정 방식 | admin |
| `/admin/devices` | 기기 초기화 요청 | 팀 admin (행사 담당자에게는 숨김) |
| `/admin/staff` | 스태프 관리 | admin |
| `/admin/setup` | 스페이스 만들기: 학교 정보 → 재학생 시트 | 팀 admin |
| `/admin/students` | 재학생 명단 (학교 전체, 회원가입 대조용) | 팀 admin |
| `/admin/events`, `/admin/events/new` | 행사 목록 · 행사 등록 | admin |
| `/admin/roster` | 행사 명단 (당첨자·참가자 시트, 이름·학번만) | admin |
| `/admin/settings` | 행사 정보 · 입장 규칙 · 보관 기간 · 테마 | admin |
| `/ops/login` | 운영진 로그인 (아이디·비밀번호) | 누구나 |
| `/ops` | 운영진 콘솔 개요: 학교별 재학생 명단·행사 명단 수 | 운영진 |
| `/ops/schools/:schoolId` | 재학생 명단 편집 (추가·수정·삭제, 붙여넣기, CSV) | 운영진 |
| `/ops/events/:eventId` | 행사 명단 편집, 재학생 명단 대조 결과 | 운영진 |
| `/ops/admins` | 행사 담당자 지정: 팀원 구글 계정(개인 Gmail 가능) → 학교 | 운영진 |
| `/ops/devices` | 학교별 학생 기기 초기화 | 운영진 |

- 로그인 후 이동: 학생은 아래 "학생 관문"을 먼저 거치고, 입장권이 있으면 `/ticket`, 없으면 `/event` / staff는 `/staff/scan` / admin은 `/admin`
- **학생 관문** (`studentGatePath`): 승인 전(`none`·`rejected`) → `/onboarding`, 승인 대기 → `/onboarding/pending`, 기기 막힘 → `/device`. 통과 전에는 다른 학생 화면에 들어갈 수 없다.
- 권한이 없는 경로에 들어오면 자기 역할의 첫 화면으로 보낸다.
- 관리자 화면은 노트북에서 왼쪽 세로 메뉴, 폰에서는 위쪽 가로 스크롤 메뉴 (`app/AdminLayout.tsx`).
- 운영진 콘솔은 검정 테마의 별도 틀(`app/OpsLayout.tsx`, `components/ops/`). 운영진이 아니면 `/ops/login`으로 보낸다. 로그인 화면 아래 "운영진" 링크로 들어간다.

## 역할 (담당자)
| 역할 | 하는 일 | 구현 |
|---|---|---|
| 학교 담당자 (행정실 등) | 학교 등록, 재학생 명단(이름·학번·메일) 등록, 기기 초기화 요청 처리 | **설명만 한다.** 화면은 만들지 않고, 이 일은 운영진 콘솔이 대신한다 |
| 행사 담당자 (`admin` + `adminSchoolId`) | 행사 등록, 행사 대상 명단(이름·학번) 등록, 발급·출입 관리. 자기 학교 행사만 본다 | 관리자 화면 `/admin` (학교 메뉴는 행사 목록·스태프 관리만) |
| 운영진 (`admin` + `operator`, 학교 없음) | 모든 학교의 재학생 명단·행사 명단을 바로 고치고 기기를 초기화한다. 데모·테스트 관리용 | 운영진 콘솔 `/ops` |
- 행사 담당자 계정은 운영진이 콘솔(`/ops/admins`)에서 구글 계정(개인 Gmail 가능)과 학교로 지정한다. 재학생 명단과 상관없이 구글 로그인으로 들어온다. 지정되지 않은 Gmail은 학생으로 보고 막는다.
- 행사 담당자는 학생 메일을 보지 않는다. 행사 명단은 이름·학번만 받고, 서버가 같은 학교의 재학생 명단과 대조한다.
- 두 학교가 함께하는 경기(고연전/연고전)도 학교마다 따로 행사를 만들어 각자 발급·검표한다.
- 재학생 승인(사진·학생증을 보고 승인)은 없앴다. 재학생 명단 대조 가입이 대신한다.

## 데이터 모델 (Firestore)
전체 정의는 `apps/web/src/types.ts`가 기준이다. 주요 구조만 적는다.
```ts
type Role = 'student' | 'staff' | 'admin';
type School = { id; name; domain; brandColor; currentEventId };      // 학교당 행사 여러 개 (listEvents). 고연전처럼 두 학교가 함께하는 행사는 schoolIds에 둘 다
type EventTheme = { source: 'school' | 'event'; colors: string[] };   // 학교 상징색 / 포스터 색

type User = {
  uid; schoolId; name; studentId; email; photoUrl; role;
  verifyStatus: 'none' | 'pending' | 'approved' | 'rejected';  // 재학생 승인
  rejectReason?; idCardUrl?; submittedAt?;
  deviceStatus: 'registered' | 'blocked'; deviceName?;        // 기기 등록
};

type Event = {
  id; schoolId; schoolIds: string[]; seriesName?; name; date; place; capacity; faceValue;
  enteredCount;          // 관리자 화면은 이 카운터 하나를 구독한다
  issuedCount;           // 남은 수량 = capacity - issuedCount (취소하면 줄어든다)
  allowedDomains: string[];
  theme: EventTheme;
  settings: { requireRoster: boolean };
  reassignMode: 'queue' | 'random';       // 취소표 재배정 방식. 운영진이 행사별로 정한다
  allowReissueAfterCancel: boolean;       // 테스트 행사만 true. 실제 행사는 false (취소하면 다시 못 받음)
  dataRetentionDays: number;   // 행사 후 개인정보 보관 기간 (기본 7)
};

type Ticket = {
  id; eventId; ownerUid; nftTokenId; status: 'issued' | 'used'; qrToken; qrExpiresAt; issuedAt; usedAt?;
  chain?: { status: 'pending' | 'done' | 'blocked'; tokenId?; lastTx? };   // 온체인 기록
};
// 서버에는 취소된 표(status 'cancelled')가 있지만 없는 표로 취급되어 화면 타입에는 나오지 않는다.

type Reassignment = { id; ticketId; eventId; nftTokenId; fromName; toName?; mode; outcome: 'reassigned' | 'released'; createdAt };
type WaitlistEntry = { email; name; order; status: 'waiting' | 'assigned' };

type ScanLog = {
  id; eventId; ticketId?; userName?; userPhotoUrl?; studentId?; staffUid?;
  result: 'ok' | 'expired' | 'used' | 'invalid' | 'mismatch';   // mismatch: 2단계 검표에서 "달라요"
  at;
};

type DeviceResetRequest = { id; uid; userName; studentId; deviceName; requestedAt; status: 'pending' | 'done' };
type RosterEntry = { email; name; studentId };
```

## 데이터 함수 계약 (`lib/api.ts`)
프론트는 `lib/api.ts`만 import 한다. `.env.local`에 Firebase 설정이 있으면 `lib/firebaseApi.ts`(실제 백엔드)에, `VITE_BACKEND=mock`이면 `lib/mock.ts`에 연결한다. 백엔드에 아직 없는 기능은 실제 연결에서 빈 결과나 `invalid_state`를 돌려준다.

```ts
// 로그인 · 학교 · 행사
signInWithSchoolAccount(): Promise<User>            // 학교 도메인이 아니면 ApiError('not_school_account')
signOut(): Promise<void>
getCurrentUser(): Promise<User | null>              // 새로고침 후 복원 (Firebase는 onAuthStateChanged)
getSchool(schoolId): Promise<School>
getEvent(eventId): Promise<Event>
updateEventTheme(eventId, theme): Promise<Event>    // admin
updateEventSettings(eventId, settings): Promise<Event>  // admin

// 재학생 승인 · 기기
submitVerification(photo, idCard): Promise<User>    // → verifyStatus 'pending'
listPendingVerifications(): Promise<User[]>         // admin, 같은 학교
reviewVerification(uid, approve, reason?): Promise<void>
requestDeviceReset(): Promise<DeviceResetRequest>
getMyDeviceReset(): Promise<DeviceResetRequest | null>
listDeviceResets(): Promise<DeviceResetRequest[]>   // admin
resolveDeviceReset(id): Promise<void>               // admin → deviceStatus 'registered'

// 입장권
issueTicket(eventId): Promise<Ticket>               // 도메인·1인 1매·정원·취소 이력 확인. 학생만
getMyTicket(eventId): Promise<Ticket | null>
subscribeMyTicket(eventId, cb, onError?): () => void   // 실시간. 재배정·입장·취소가 새로고침 없이 반영
refreshQrToken(ticketId): Promise<{ token; expiresAt }> // 25초마다. 기기 서명을 붙인다
getTicketHistory(ticketId): Promise<TicketHistoryItem[]>   // 발급·재배정·입장. 실제 연결은 체인에서 직접 읽는다 (docs/api.md 13장)

// 취소 (양도 대체): 대기 명단 재배정
cancelTicket(ticketId): Promise<'reassigned' | 'released' | 'used'>

// 검표: 스캔하면 바로 입장 처리된다 (통과 시 사진·이름·학번을 크게 보여 스태프가 눈으로 대조)
verifyEntry(qrPayload, eventId?): Promise<VerifyResult>   // 다른 행사 입장권이면 'wrong_event', 서명 문제면 'signature_invalid', 2단계 검표 행사면 'needs_confirm'(아직 입장 전)
confirmEntry(ticketId, match): Promise<ConfirmResult>     // 'ok' | 'mismatch' | 'used' | 'no_pending' | 'invalid'
subscribeStaffStats(eventId, cb): () => void        // 전체 입장 수, 내가 처리한 수
getMyScanHistory(): Promise<ScanLog[]>

// 관리자
subscribeEventStats(eventId, cb): () => void        // { enteredCount, capacity, rejectedCount, recent }
listEntries(eventId): Promise<ScanLog[]>
listReassignments(eventId): Promise<Reassignment[]>   // 취소·재배정 기록
getWaitlist(eventId): Promise<WaitlistView>          // 서버 getWaitlist. 이름·학번·순서·상태만 (메일 없음)
importWaitlist(eventId, sheetUrl): Promise<RosterImport>   // 대기 명단 시트(이름·학번, 대기 순서). 재학생 명단과 맞는 학생만
updateReassignMode(eventId, mode) / updateAllowReissue(eventId, allow)   // admin
listTickets(eventId): Promise<TicketRow[]>
upsertSchool(schoolId, { name, domain, brandColor })                 // 스페이스 만들기 (학교 관리자는 자기 학교만)
getStudentRoster(schoolId) / importStudentRoster(schoolId, sheetUrl) // 재학생 명단
createEvent(input) / updateEvent(eventId, patch)                     // 행사 등록 (주최 학교 관리자)
getEventRoster(eventId) / importEventRoster(eventId, sheetUrl)       // 행사 명단
verifyStudentRoster(schoolId, name, studentId): Promise<User>        // 회원가입: 학번 줄의 이름·메일 대조
listStaff() / addStaff(email) / removeStaff(uid)   // 서버 setStaff. 로그인 전이면 첫 로그인 때 적용

// 운영진 콘솔 (operator 계정만. 서버 opsListRoster / opsEditRoster / opsListStudents)
signInAsOperator(id, password): Promise<User>       // 아이디 → {id}@ops.safepass.app 이메일·비밀번호 계정. 틀리면 'wrong_password'
opsListRoster(kind: 'school' | 'event', id): Promise<OpsRoster>   // 학교: 메일·가입 여부 / 행사: 재학생 명단 대조(match)와 메일
opsEditRoster(kind, id, { upserts, deletes, replace? }): Promise<OpsEditResult>   // 학번 기준 추가·덮어쓰기·삭제. 행사 명단은 시트를 한 번 불러온 뒤에만
opsListStudents(schoolId): Promise<OpsStudent[]>    // 가입한 학생과 기기 등록·초기화 요청 여부
opsResetDevice(uid): Promise<void>                  // resetDevice
opsListEventAdmins(): Promise<OpsEventAdmin[]>       // 행사 담당자 (로그인 전이면 pending)
opsSetEventAdmin(email, schoolId | null): Promise<void>   // 지정·해제. 로그인 전이면 seedProfiles에 두고 첫 구글 로그인 때 적용. 팀 관리자·운영진은 못 바꿈

// 체인 직접 읽기 (Firebase 안 거침, "체인 기록" 배지). docs/api.md 13장
getChainEventStatus(eventId): Promise<ChainEventStatus>   // S8 공개 현황판: 정원·활성·발급·입장·재배정·회수
getChainDraw(eventId, round): Promise<ChainDraw | null>   // 추첨 회차 커밋·시드
verifyMyDraw(entry): Promise<DrawCheck>                   // S7 직접 검증 (DEMO_DRAW.entries로 시연)

// 취소표 추첨 (reassignMode 'lottery' 행사만). docs/api.md 14장
getMyLottery(eventId): Promise<MyLottery>                 // 대기 중 / 당첨(기한) / 수락 완료 / 기한 지남 / 마감. receipt → verifyMyDraw
claimTicket(eventId): Promise<ClaimResult>                // 'claimed' | 'no_offer' | 'expired'
runDrawNow(eventId): Promise<RunDrawResult>               // admin "지금 추첨" (데모)
```

- 실패는 `types.ts`의 `ApiError`(`code`: `not_school_account` / `sold_out` / `not_found` / `unauthenticated` / `not_in_roster` / `invalid_state` / `device_blocked` / `cancelled_before` / `wrong_role` / `unknown`)로 던진다. 서버 `permission-denied`는 `details.reason`이 `ROLE`이면 `wrong_role`, 아니면 `not_school_account`다. 화면 문구는 프론트가 정한다.
- 예상된 거부(만료 QR, 이미 사용된 표, 사용된 표의 취소)는 throw가 아니라 결과값으로 돌려준다.
- 지난 QR 토큰은 서버가 기억해 두고, 그 토큰으로 찍으면 `invalid`가 아니라 `expired`를 돌려준다 (캡처 QR 데모).

### mock 데이터
- localStorage에 저장하고 탭끼리 동기화한다. 로그인은 탭마다 따로라서 탭 3개(학생/검표/관리자)로 데모할 수 있다. 로그인 화면의 "데모 계정" 패널로 계정을 바꾼다 (`VITE_DEMO_PANEL=off`면 숨김).
- 가상의 학교 3곳: 한빛대(빨강, 무료), 푸른대(파랑, 정가 5,000원), 초록대(초록, 정원의 93%가 찬 행사).
- 학교마다 데모 계정 6개: 학생, 학생(입장권 보유), 첫 로그인 학생, 기기 바꾼 학생, 스태프, 학생회. 그 밖에 승인 대기 학생 2명, 기기 초기화 요청 1건, 재배정 기록과 대기 명단이 들어 있다.
- 검표는 스태프가 속한 학교 행사의 입장권만 통과시킨다. 다른 학교 QR은 `invalid`.

### 학교·행사 테마
- 로그인 화면은 항상 SafePass 기본 보라 테마. 로그인한 뒤부터 학교·행사 테마를 쓴다.
- 우선순위: 행사 디자인(포스터 색) > 학교 상징색 > 기본. 관리자 "행사 설정"에서 바꾼다. 포스터 이미지는 브라우저에서 대표색 3개만 뽑고 업로드·저장하지 않는다.
- 색 생성 규칙은 `DESIGN.md` 2.1장. 컴포넌트에서 테마 색 hex를 직접 쓰지 않는다.

### 로그인 규칙
- **학생**: 학교 메일 링크(Firebase 이메일 링크, 비밀번호 없음). 가입 = 학교·이름·학번 → `precheckStudent` → 메일 링크 → `completeSignInLink`(명단 대조) → 본인 사진 `submitProfilePhoto`. 로그인 = 메일(+학번) → 메일 링크. 화면 연결은 `docs/student-auth.md`.
- **운영진(스태프·학생회)**: 구글 로그인(`signInWithSchoolAccount`).
- 재학생 명단을 불러온 학교는 가입을 마친 학생만 들어오고 발급받는다(`not_registered`). 명단이 없는 학교는 예전처럼 구글 로그인으로 들어온다.
- 로그인할 때마다 서버가 명단을 다시 본다. 명단에서 빠진 학생은 다시 가입해야 한다.

### QR · 검표 규칙
- QR 내용: `TTV1:{ticketId}:{qrToken}`(mock도 같은 형식). 기기 키가 있으면 폰이 `TTV2:{ticketId}:{qrToken}:{signedAt}:{signature}`로 서명해 보여 준다(`docs/api.md` 12장). 검표 화면은 스캔한 문자열을 해석하지 않고 그대로 `verifyEntry`에 넘긴다.
- 토큰은 클라이언트가 읽을 수 없는 `qrTokens/{ticketId}`에 있다. 유효시간 30초, 화면은 25초마다 `refreshQrToken`을 호출한다.
- 검표 통과 조건: 토큰 일치 + `status === 'issued'` + 미만료 + 검표 화면이 고른 행사와 같은 행사
- 기본은 통과하면 그 자리에서 입장 처리된다(`status = 'used'`, `enteredCount + 1`). 스태프는 화면의 사진·이름·학번을 얼굴과 눈으로 대조한다.
- **2단계 검표**(`events.twoStepCheck`, 기본 꺼짐): 켜진 행사는 `verifyEntry`가 `needsConfirm`과 사진을 돌려주고, 스태프가 "같아요"(`confirmEntry(ticketId, true)`)를 눌러야 입장 처리된다. "달라요"는 `mismatch`로 기록하고 입장권은 그대로 둔다. 확인 대기는 60초.
- **서명 QR**: `requireDevice`가 켜진 행사는 서명 없는 QR(TTV1)을 `SIGNATURE_INVALID`로 거부한다.
- 같은 QR을 다시 찍으면 `used`, 시간 지난·교체된 QR은 `expired`, 형식이 다르거나 없는 입장권은 `invalid`
- 거부된 스캔도 `ScanLog`에 기록한다 (관리자 "거부된 시도")

### 취소 · 재배정 규칙
- 대기 명단은 행사 담당자가 구글 시트(이름·학번, 위에서부터 대기 순서)로 등록한다. 서버가 재학생 명단과 대조해 `events/{id}/waitlist/{email}`로 저장한다. 다시 불러오면 대기 중인 줄은 시트대로 바뀌고, 이미 배정·당첨 처리된 줄은 그대로 남는다. 대기 명단은 클라이언트가 직접 읽지 못한다(문서 id가 메일).
- 행사 명단 행사(`requireRoster`)에서도 대기 명단에 있는 학생은 재배정·추첨으로 입장권을 받을 수 있다.
- 주인이 취소하면 `reassignMode`에 따라 대기 명단에서 후보를 고른다. `queue`는 `order`가 작은 순서, `random`은 무작위.
- 후보 조건: 이미 로그인해 `users`에 같은 메일이 있고, 도메인이 `allowedDomains`에 있고, 이 행사 입장권이 없다. 못 맞추면 건너뛴다.
- 후보가 있으면 `ownerUid`를 바꾸고 QR을 지운다(`reassigned`). 없으면 취소 상태로 두고 수량을 돌려준다(`released`). 받은 사람은 취소한 사람에게 알려주지 않는다.
- 이미 사용된 표는 취소할 수 없다(`used`).
- 취소한 사람은 `allowReissueAfterCancel`이 꺼진 행사에서 다시 받을 수 없다(`cancelled_before`).
- 새 주인은 `subscribeMyTicket` 구독으로 입장권이 나타난다.

### 보안 규칙 최소선
- `users`, `tickets`: 본인 것만 읽기. 쓰기는 모두 함수만 한다.
- 검표·관리자 화면과 해당 함수는 `users.role`로 막는다. 학생증 사진은 같은 학교 admin만 본다.
- `events`: 로그인 사용자 읽기 가능 (관리자 실시간 구독).

## 구현 상태 (실제 연동 vs 화면만)
- 블록체인/NFT: 컨트랙트(`contracts/`, Base Sepolia)와 아웃박스(`functions/src/chain`)가 있다. 체인이 꺼져 있어도 발급·검표·취소는 동작하고 `chain.status`가 `pending`으로 남는다.
- 기기 묶기: 학생은 로그인 때 `registerDevice`로 기기 키를 등록하고, 이미 다른 기기가 등록돼 있으면 `/device`로 막힌다(`requireDevice`와 무관하게 항상). 시크릿 창이나 다른 브라우저도 새 기기로 본다. 초기화는 관리자 `resetDevice`(또는 `devices/{uid}` 삭제). QR 갱신 요청의 서명 확인과 검표의 서명 QR(TTV2) 강제는 `events.requireDevice`가 켜진 행사에서만 일어난다(시드 기본 꺼짐).
- 2단계 검표와 App Check: 구현되어 있지만 둘 다 꺼져 있다(`events.twoStepCheck`, `ENFORCE_APP_CHECK`와 `VITE_APPCHECK_SITE_KEY`). 켜는 순서는 `docs/api.md` 12장.
- 관리자 권한: 스페이스·명단·행사 등록 함수는 학교 단위(`adminSchoolId`)로 막는다. 그 밖의 관리자·스태프 함수와 보안 규칙은 아직 전역 `role`이다(이후 과제).
- 아직 화면과 mock뿐: 테마·검표 설정 저장, 개인정보 파기
- 하지 않는 것: reCAPTCHA, App Check, Gemini, 결제, 개인 간 양도
- 배포 빌드는 Firebase 설정(`.env.local`)이 없으면 실패한다. mock 빌드는 `VITE_BACKEND=mock`을 명시한다.

## 데모 시나리오 (프로토타입)
1. 학교 계정 로그인 → 입장권 발급
2. 캡처한 QR 스캔 → 만료로 거부
3. 본인 QR 스캔 → 입장 성공, 사진·이름·학번 대조, 노트북의 관리자 화면 인원 즉시 증가
4. 같은 QR 다시 스캔 → 사용됨으로 거부
5. 입장권 취소 → 대기 명단의 다음 학생에게 재배정 (그 학생 폰에 입장권이 바로 나타남). 취소한 학생은 다시 못 받음
6. (보여줄 여유가 있으면) 관리자 메뉴: 취소·재배정 기록, 재배정 방식 변경, 행사 명단, 행사 테마

폰 두 대(학생용, 검표용) + 노트북(관리자 화면)으로 리허설한다.

## 개발 규칙
- TypeScript strict. `any` 지양.
- 컴포넌트는 함수형 + hooks. 화면 하나 = `pages/.../XxxPage.tsx` 하나.
- 모든 화면에 **로딩 / 빈 상태 / 에러 상태**를 넣는다 (간단해도 됨).
- 비밀키·API 키를 코드에 하드코딩하지 않는다. Firebase 설정은 `.env`(`VITE_` 접두사)로.
- 개인정보(사진, 학번)는 콘솔에 찍지 않는다.
- 카메라 스캔은 https에서만 동작한다. 일찍 Firebase Hosting에 한 번 배포해서 폰으로 테스트한다.

## 실행 & 배포
```bash
cd apps/web
npm install
npm run dev          # 로컬 개발
npm run build
firebase deploy --only hosting   # 저장소 루트에서
```

## 작업을 마칠 때
- 무엇을 바꿨는지, 어떤 파일을 건드렸는지, 남의 소유 파일에 필요한 변경 요청이 있는지 짧게 요약한다.

## 명단 (학교 스페이스 · 행사)
- 행사 담당자(`users.adminSchoolId`)는 자기 학교만 다룬다. 값이 없는 admin은 SafePass 팀 계정 (모든 학교, 새 스페이스). 그중 `operator`가 있는 계정이 운영진.
- **재학생 명단**(`schools/{id}/roster/{studentId}`, 이름·학번·메일): 회원가입 대조. 학번으로 줄을 찾고 이름 + 로그인 메일이 그 줄과 같아야 한다. 학번 하나에 계정 하나(`claimedBy`). 데모에서는 시드가 넣고 운영진 콘솔에서 고친다.
- **행사 명단**(`events/{id}/roster/{studentId}`, 이름·학번): `requireRoster` 행사는 학생의 학번 줄이 있고 이름이 같아야 발급 (`not_in_roster`). 시트로 불러오면 주최 학교 재학생 명단과 학번·이름이 맞는 줄만 들어간다(안 맞으면 `NOT_IN_STUDENT_ROSTER`·`NAME_MISMATCH`로 건너뜀). 행사 담당자 화면에는 메일이 나오지 않는다.
- 시트는 관리자가 Cloud Functions 서비스 계정에 뷰어로 공유하고, 함수가 읽어 Firestore에 복사한다. 명단 하위 컬렉션은 클라이언트가 읽지 못한다. 재학생 시트 첫 줄은 `이름`·`학번`·`이메일`, 행사 시트는 `이름`·`학번`.
- 배포 전 GCP 콘솔에서 **Google Sheets API 사용 설정**이 필요하다.

## 데모 데이터 (시드)와 운영진 계정
- `functions/seed.ts`: 학교 4곳(고려대·연세대·성균관대·KAIST)과 행사.
  - 고려대: 입실렌티, **고연전**(야구·농구·아이스하키·축구·럭비 경기 4개), 석탑대동제 / 연세대: 아카라카, **연고전**(같은 경기 4개) / 성균관대: 대동제 / KAIST: 태울석림제.
  - 고연전·연고전은 학교마다 따로 만든 경기 행사 4개를 묶음 이름(`seriesName`)으로 묶는다. 학생 행사 목록에서 묶음 제목 아래에 모여 보인다. 경기마다 입장권·정원·명단·검표가 따로다.
  - 행사 명단 행사(`requireRoster` 켬): 입실렌티, 아카라카, 고연전·연고전의 농구·아이스하키. 행사 담당자가 시트로 올린 명단의 학생만 받는다.
  - 모든 재학생 행사(`requireRoster` 끔): 고연전·연고전의 야구·축구·럭비, 석탑대동제, 성균관대 대동제, KAIST 태울석림제.
  - 둘 다 행사 담당자가 "행사 설정"에서 바꿀 수 있다.
- 학생은 넣지 않는다. 학교마다 빈 재학생 명단으로 시작하고, 팀원이 운영진 콘솔에서 자기 학교 계정을 넣는다. 이미 있는 명단은 건드리지 않는다.
- 운영진 콘솔에서 재학생 명단은 언제든 고칠 수 있다. 행사 명단은 **행사 담당자가 시트로 한 번 불러온 뒤에만** 고칠 수 있다(그 전에는 `NO_SHEET_IMPORT`로 거부, 콘솔은 읽기만).
- 운영진 계정: `OPS_PASSWORD=... npm --prefix functions run seed`로 만들거나 비밀번호를 바꾼다(아이디 기본 `ops`, `OPS_ID`로 변경). 비밀번호는 코드에 두지 않는다. 처음 한 번 Firebase 콘솔에서 **Authentication → 이메일/비밀번호 로그인 사용**이 필요하다.
- 예전 시드의 행사(`test-reassign`, 두 학교 공동 `koyon-*`, 경기 구분 없던 `korea-koyon`·`yonsei-yonko`)는 시드가 경고만 하고, `SEED_PRUNE=1`일 때 그 행사의 명단·입장권·검표 기록·재배정 기록까지 지운다.
- mock 운영진: 아이디 `ops` / 비밀번호 `ops` (화면에는 표시하지 않는다).
- 확인: `npm --prefix functions run test:seed` (에뮬레이터에서 시드 → 운영진 로그인 → 명단 조회). 에뮬레이터는 Java 21 이상이 필요하다.
