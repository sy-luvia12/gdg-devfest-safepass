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
      student/            # 로그인, 온보딩, 축제, 입장권, 양도        ← 프론트
      staff/              # 검표, 내 검표 기록                        ← 프론트
      admin/              # 관리자 메뉴 9개                           ← 프론트
    lib/
      firebase.ts         # Firebase 초기화                   ← 백엔드
      api.ts              # 데이터 함수 (아래 계약)            ← 백엔드
      mock.ts             # 백엔드 완성 전 가짜 데이터          ← 누구나
    types.ts              # 공통 타입                          ← 백엔드
functions/                # Cloud Functions                    ← 백엔드
  src/tickets/            #   발급, 양도
  src/entry/              #   QR 토큰, 검표
firestore.rules           #                                    ← 백엔드
firebase.json             #                                    ← 백엔드
```
- 11/4 이후 `contracts/`(Hardhat), `functions/src/chain|auth|sheets|privacy`가 추가된다.
- **요청받은 폴더 밖의 파일은 수정하지 않는다.** 남의 소유 파일을 바꿔야 하면 수정하지 말고 "어떤 변경이 필요한지"를 작업 요약에 적는다.
- 전체 코드 포맷 변경, 대규모 리팩터링, 파일 이름 일괄 변경 금지.
- 작업은 작게 나누고, 한 번에 한 화면/한 기능만 다룬다.

## 만들 것 (우선순위 순)
1. 학교 계정 로그인
2. 입장권 발급 (1인 1매)
3. 내 입장권: 30초마다 바뀌는 QR + 사진·이름·학번
4. 검표: QR 스캔 → 사진 대조 → 입장 처리, 사용됨/만료 QR 거부
5. 관리자: 입장 인원 실시간 표시 (정원 대비)
6. (여유 있을 때만) 정가 양도: 정가 초과 가격이면 거부

양도는 1~5가 모두 연결된 다음에만 손댄다. 새벽에 기능 추가 금지.
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
| `/event` | 축제 상세 · 입장권 발급 | 학생 |
| `/ticket` | 내 입장권 (QR), 보내는 중인 양도 | 학생 |
| `/ticket/transfer` | 정가 양도 요청 | 학생 |
| `/ticket/history` | 발급·양도·입장 기록 | 학생 |
| `/transfers/:transferId` | 받은 양도 확인·수락·거절 | 학생 |
| `/me` | 내 정보·설정·로그아웃 | 모든 역할 |
| `/staff/scan` | 검표 (2단계: 사진 대조 후 입장 처리) | staff, admin |
| `/staff/history` | 내 검표 기록 | staff, admin |
| `/admin` | 실시간 현황 | admin |
| `/admin/entries` | 입장 기록 (필터·검색·CSV) | admin |
| `/admin/tickets` | 발급 현황 | admin |
| `/admin/transfers` | 양도 기록 (웃돈 차단 수) | admin |
| `/admin/approvals` | 재학생 승인 | admin |
| `/admin/devices` | 기기 초기화 요청 | admin |
| `/admin/staff` | 스태프 관리 | admin |
| `/admin/roster` | 명단 연동 (구글 시트) | admin |
| `/admin/settings` | 행사 정보 · 입장 규칙 · 보관 기간 · 테마 | admin |

- 로그인 후 이동: 학생은 아래 "학생 관문"을 먼저 거치고, 입장권이 있으면 `/ticket`, 없으면 `/event` / staff는 `/staff/scan` / admin은 `/admin`
- **학생 관문** (`studentGatePath`): 승인 전(`none`·`rejected`) → `/onboarding`, 승인 대기 → `/onboarding/pending`, 기기 막힘 → `/device`. 통과 전에는 다른 학생 화면에 들어갈 수 없다.
- 권한이 없는 경로에 들어오면 자기 역할의 첫 화면으로 보낸다.
- 관리자 화면은 노트북에서 왼쪽 세로 메뉴, 폰에서는 위쪽 가로 스크롤 메뉴 (`app/AdminLayout.tsx`).

## 데이터 모델 (Firestore)
전체 정의는 `apps/web/src/types.ts`가 기준이다. 주요 구조만 적는다.
```ts
type Role = 'student' | 'staff' | 'admin';
type School = { id; name; domain; brandColor; currentEventId };      // 학교당 행사 1개 (프로토타입)
type EventTheme = { source: 'school' | 'event'; colors: string[] };   // 학교 상징색 / 포스터 색

type User = {
  uid; schoolId; name; studentId; email; photoUrl; role;
  verifyStatus: 'none' | 'pending' | 'approved' | 'rejected';  // 재학생 승인
  rejectReason?; idCardUrl?; submittedAt?;
  deviceStatus: 'registered' | 'blocked'; deviceName?;        // 기기 등록
};

type Event = {
  id; schoolId; name; date; place; capacity; faceValue;
  enteredCount;          // 관리자 화면은 이 카운터 하나를 구독한다
  issuedCount;           // 남은 수량 = capacity - issuedCount
  allowedDomains: string[];
  theme: EventTheme;
  settings: { requireRoster: boolean; twoStepCheck: boolean };
  dataRetentionDays: number;   // 행사 후 개인정보 보관 기간 (기본 7)
};

type Ticket = { id; eventId; ownerUid; nftTokenId; status: 'issued' | 'used'; qrToken; qrExpiresAt; issuedAt; usedAt? };

type Transfer = {
  id; ticketId; eventId; fromUid; toEmail; price;
  result: 'pending' | 'success' | 'rejected' | 'declined' | 'cancelled';
  reason?: 'over_face_value' | 'not_student' | 'already_has_ticket';
  createdAt; resolvedAt?;
};

type ScanLog = {
  id; eventId; ticketId?; userName?; userPhotoUrl?; studentId?; staffUid?;
  result: 'ok' | 'expired' | 'used' | 'invalid' | 'mismatch';   // mismatch: 2단계 검표 얼굴 불일치
  at;
};

type DeviceResetRequest = { id; uid; userName; studentId; deviceName; requestedAt; status: 'pending' | 'done' };
type RosterEntry = { email; name; studentId };
```

## 데이터 함수 계약 (`lib/api.ts`)
프론트는 `lib/api.ts`만 import 한다. 지금은 `lib/mock.ts`를 그대로 내보내고, Firebase 구현이 준비되면 이 파일만 바꾼다.

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
issueTicket(eventId): Promise<Ticket>               // 도메인·명단(requireRoster)·1인 1매·정원 확인
getMyTicket(eventId): Promise<Ticket | null>
refreshQrToken(ticketId): Promise<{ token; expiresAt }>
getTicketHistory(ticketId): Promise<TicketHistoryItem[]>   // 발급·양도·입장 (txHash는 표시용)

// 양도: 요청(pending) → 받는 사람 수락(success)
transferTicket(ticketId, toEmail, price): Promise<Transfer>  // 규칙 위반이면 rejected + reason
getMyTransfers(): Promise<{ incoming: TransferView[]; outgoing: TransferView[] }>
getTransfer(transferId): Promise<TransferView>
acceptTransfer(transferId): Promise<Ticket>
declineTransfer(transferId) / cancelTransfer(transferId): Promise<void>

// 검표
verifyEntry(qrPayload): Promise<VerifyResult>       // twoStepCheck면 ok + needsConfirm (아직 입장 처리 전)
confirmEntry(ticketId, match): Promise<{ result: 'ok' | 'mismatch' | 'used' }>
subscribeStaffStats(eventId, cb): () => void        // 전체 입장 수, 내가 처리한 수
getMyScanHistory(): Promise<ScanLog[]>

// 관리자
subscribeEventStats(eventId, cb): () => void        // { enteredCount, capacity, rejectedCount, recent }
listEntries(eventId): Promise<ScanLog[]>
listTransfers(eventId): Promise<TransferView[]>
listTickets(eventId): Promise<TicketRow[]>
getRoster(eventId) / importRoster(eventId, sheetUrl)
listStaff() / addStaff(email) / removeStaff(uid)
```

- 실패는 `types.ts`의 `ApiError`(`code`: `not_school_account` / `sold_out` / `not_found` / `unauthenticated` / `not_in_roster` / `invalid_state` / `unknown`)로 던진다. 화면 문구는 프론트가 정한다.
- 양도 규칙 위반은 throw가 아니라 `Transfer.result = 'rejected'` + `reason`으로 돌려준다.
- 지난 QR 토큰은 서버가 기억해 두고, 그 토큰으로 찍으면 `invalid`가 아니라 `expired`를 돌려준다 (캡처 QR 데모).

### mock 데이터
- localStorage에 저장하고 탭끼리 동기화한다. 로그인은 탭마다 따로라서 탭 3개(학생/검표/관리자)로 데모할 수 있다. 로그인 화면의 "데모 계정" 패널로 계정을 바꾼다 (`VITE_DEMO_PANEL=off`면 숨김).
- 가상의 학교 3곳: 한빛대(빨강, 무료), 푸른대(파랑, 정가 5,000원), 초록대(초록, 정원의 93%가 찬 행사).
- 학교마다 데모 계정 6개: 학생, 학생(입장권 보유), 첫 로그인 학생, 기기 바꾼 학생, 스태프, 학생회. 그 밖에 승인 대기 학생 2명, 기기 초기화 요청 1건, 웃돈 차단 양도 2건이 들어 있다.
- 검표는 스태프가 속한 학교 행사의 입장권만 통과시킨다. 다른 학교 QR은 `invalid`.

### 학교·행사 테마
- 로그인 화면은 항상 SafePass 기본 보라 테마. 로그인한 뒤부터 학교·행사 테마를 쓴다.
- 우선순위: 행사 디자인(포스터 색) > 학교 상징색 > 기본. 관리자 "행사 설정"에서 바꾼다. 포스터 이미지는 브라우저에서 대표색 3개만 뽑고 업로드·저장하지 않는다.
- 색 생성 규칙은 `DESIGN.md` 2.1장. 컴포넌트에서 테마 색 hex를 직접 쓰지 않는다.

### 로그인 규칙
- 구글 로그인만으로는 개인 Gmail도 들어온다. 이메일 도메인이 `allowedDomains`에 없으면 "학교 계정으로만 이용할 수 있어요" 에러.
- 학교 메일이 Google Workspace가 아닌 학교는 이후 이메일 링크 로그인으로 보완한다(이번 범위 아님).

### QR · 검표 규칙
- QR 내용: `safepass:{ticketId}:{qrToken}`
- 유효시간 30초. 만료 5초 전쯤 자동으로 `refreshQrToken` 호출
- 검표 통과 조건: 토큰 일치 + `status === 'issued'` + 미만료
- **2단계 검표**(`settings.twoStepCheck`, 기본 켜짐): 통과하면 사진을 먼저 보여주고, 스태프가 "같아요"를 눌러야 `confirmEntry`로 `status = 'used'`, `enteredCount + 1`. "달라요"는 `mismatch`로 기록
- 같은 QR을 다시 찍으면 `used`, 시간 지난 QR은 `expired`, 형식이 다르거나 없는 티켓은 `invalid`
- 거부된 스캔도 `ScanLog`에 기록한다 (관리자 "거부된 시도")

### 양도 규칙
- `price > event.faceValue` 이면 `rejected` (`over_face_value`)
- 받는 사람이 같은 학교 재학생이 아니면 `rejected` (`not_student`), 같은 행사 입장권이 이미 있으면 `rejected` (`already_has_ticket`)
- 통과하면 `pending`. 받는 사람이 수락하면 `ownerUid`를 바꾸고 새 QR 토큰 발급 (실제는 컨트랙트 `buy`로 대금과 함께 이동)
- 수락 전에는 보낸 사람이 취소, 받는 사람이 거절할 수 있다

### 보안 규칙 최소선
- `users`, `tickets`: 본인 것만 읽기. 쓰기는 모두 함수만 한다.
- 검표·관리자 화면과 해당 함수는 `users.role`로 막는다. 학생증 사진은 같은 학교 admin만 본다.
- `events`: 로그인 사용자 읽기 가능 (관리자 실시간 구독).

## 이번 프로토타입에서 실제로 연동하지 않는 것 (화면만 있음)
- 블록체인/NFT → `NFT #0012`와 표시용 기록(tx hash)만. 발표에서 "테스트넷 연동은 다음 단계"로 설명
- 기기 서명 QR → 서버 토큰 30초 교체로 대체. 기기 확인 화면은 mock 상태로만 동작하고, **같은 계정으로 다른 폰에 로그인하면 실제로는 QR이 뜬다** (데모에서 이 장면은 빼기)
- 사진·학생증 업로드 → 브라우저에서 줄인 이미지를 mock에만 저장
- 구글 시트 명단 연동 → 예시 명단 생성
- reCAPTCHA, App Check, Gemini, 결제

## 데모 시나리오 (프로토타입)
1. 학교 계정 로그인 → 입장권 발급
2. 캡처한 QR 스캔 → 만료로 거부
3. 다른 사람 계정 QR → 2단계 검표에서 "달라요" → 얼굴 불일치로 거부
4. 본인 QR → "같아요" → 입장 성공, 노트북의 관리자 화면 인원 즉시 증가
5. 같은 QR 다시 스캔 → 사용됨으로 거부
6. 웃돈 양도 시도 → 거절 / 정가 양도 → 받는 학생이 수락
7. (보여줄 여유가 있으면) 관리자 메뉴: 양도 기록의 "웃돈 거래 차단", 재학생 승인, 행사 테마

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
