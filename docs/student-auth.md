# 학생 가입·로그인 연결 안내 (화면 담당용)

학생은 **학교 이메일 링크**로 가입·로그인한다(비밀번호 없음). 행사 담당자·스태프는 기존 Google 로그인(`signInWithSchoolAccount`), SafePass 운영진은 `/ops/login`의 별도 계정을 사용한다.
학생 화면은 `@/lib/api`의 기존 함수만 사용한다. `/signup`·`/signin`·`/auth/finish`·`/onboarding`에 연결되어 있으며, 새 JSON 명단이나 별도 인증 시스템을 사용하지 않는다.

## 흐름
```
가입    학교 고르기 → 이름·학번·학교 메일 → precheckStudent → sendSignInLink(메일, 가입 정보) → "메일을 확인해 주세요"
        메일 링크 → /auth/finish → completeSignInLink → (명단 대조까지 끝남) → /onboarding
        /onboarding: 본인 사진·수집 동의 → submitProfilePhoto → 가입 완료 → 축제·입장권 화면
로그인  학번·학교 메일 → precheckStudent → sendSignInLink(메일) → 메일 링크 → /auth/finish → 기존 입장권 또는 축제 화면
발급    가입을 마친 학생만. 행사가 "명단에 있는 학생만 발급"이면 그 행사 명단에 있어야 받는다 (issueTicket)
```

## 함수
| 함수 | 언제 | 성공 | 실패 (`ApiError.code`) |
|---|---|---|---|
| `listOpenSchools()` | 가입 화면 학교 고르기 (로그인 전) | `{ id, name, domain }[]` | `unknown` |
| `precheckStudent({ email, studentId, name })` | 가입: 메일 보내기 전 | `{ schoolId, schoolName }` | `not_school_account` 명단 있는 학교 메일 아님 · `not_in_roster` 명단에 없음(이름 틀림 포함) · `email_mismatch` 그 학번의 메일이 아님 · `student_id_taken` 이미 가입된 학번 |
| `precheckStudent({ email, studentId })` | 학번 로그인: 메일 보내기 전 | 위와 같음 | 위와 같음 + `not_registered` 아직 가입 안 함 |
| `sendSignInLink(email, signup?)` | 메일 보내기. 가입이면 `signup = { schoolId, name, studentId }` | 없음 | `unknown` |
| `isSignInLink(location.href)` | `/auth/finish`에서 이 주소가 링크인지 | `boolean` | |
| `pendingSignInEmail()` | `/auth/finish`에서 보낸 메일 주소 (같은 브라우저면 있음) | `string \| null` | |
| `completeSignInLink(location.href, email?)` | `/auth/finish`. 다른 기기에서 열어 `pendingSignInEmail()`이 null이면 메일을 입력받아 넘긴다 | `User` | `not_registered` 가입 안 한 메일로 로그인 · 가입 중이면 `not_in_roster` / `email_mismatch` / `student_id_taken` · `invalid_state` 메일을 모름·링크 만료 |
| `submitProfilePhoto(photoDataUrl)` | 온보딩 마지막. `ImagePicker`의 JPEG data URL (300KB 이하) | `User` (`verifyStatus: 'approved'`) | `invalid_state` 명단 대조 전 · `unknown` |

- 로그인 상태는 `AuthProvider`가 새로고침 때 `getCurrentUser()`로 다시 읽는다. `completeSignInLink`·`submitProfilePhoto` 뒤에는 `refreshUser()`를 불러 상태를 맞춘다.
- 가입 중(사진 전) 학생은 `verifyStatus: 'none'` → 기존 관문(`studentGatePath`)이 `/onboarding`으로 보낸다.
- 로그인할 때마다 서버가 명단을 다시 본다. 명단에서 빠진 학생(졸업·휴학)은 `getCurrentUser()`가 null(로그아웃 상태)이 된다.
- 학생증 사진·학생회 승인 대기(`submitVerification`, `/onboarding/pending`)는 이 흐름에서 쓰지 않는다.
- 회원가입 화면은 `listOpenSchools()`가 반환한 학교만 표시한다. Google 로그인 경로는 기존 API 동작을 유지한다.

## 구현된 라우트
| 경로 | 화면 |
|---|---|
| `/` | 첫 화면: `로그인`, `회원가입 하러가기`, 기존 Google 로그인과 운영진 콘솔 링크 |
| `/signup` | 가입 (학교 → 이름·학번·메일) |
| `/signin` | 로그인 (학번·학교 이메일 필수) |
| `/auth/finish` | 메일 링크 처리 (비로그인 라우트) |
| `/onboarding` | 본인 사진·수집 동의와 가입 완료 |
| `/ops/login` | 기존 운영진 아이디·비밀번호 로그인 |

## mock에서 해 보기
- mock은 메일을 보내지 않는다. `sendSignInLink` 뒤에 `mockSignInLinkFor(email)`(`@/lib/mock`, mock 전용)로 받은 주소를 열면 메일의 링크를 누른 것과 같다. mock일 때만 "데모: 메일 링크 열기" 버튼을 보여 주면 된다 (`USE_MOCK`).
- 가입해 볼 수 있는 명단 줄 (한빛대): 윤지호 `20242000` `member1@hanbit.ac.kr`, 강예린 `20242011` `member2@hanbit.ac.kr` … (`member1`~`member10`). 이미 계정이 있는 학생(김하늘 등)의 학번은 `student_id_taken`.
- 학번 로그인: 김하늘 `20231234` `haneul@hanbit.ac.kr`.

## 실제 연결 전에 (콘솔)
- Firebase 콘솔 → Authentication → 로그인 방법 → **이메일/비밀번호** 사용 + **이메일 링크(비밀번호 없는 로그인)** 사용
- 승인된 도메인에 배포 주소 확인
- 함수 배포: `listOpenSchools`, `precheckStudent`, `submitProfilePhoto`, `ensureUser`, `issueTicket`, `verifyStudentRoster`


## 프론트엔드 구현과 로컬 확인

- 첫 화면의 `로그인`은 `/signin`, `회원가입 하러가기`는 `/signup`으로 이동한다. `/register`는 `/signup`으로 연결한다.
- 가입: 학교 카드 선택 → 이름·학번·학교 이메일 입력 및 `precheckStudent` → 메일 확인(2/3) → 링크 콜백 → 얼굴 사진과 동의(3/3) → 완료. API가 메일도 필요로 하므로 메일 주소는 첫 정보 입력 단계에서 받는다.
- 로그인: 학번·이메일 입력 → 사전 확인 → 메일 링크 → 기존 계정·입장권. 이 화면에서 학번은 필수이며 숫자인지만 확인하고 길이는 고정하지 않는다. API는 학번 없는 로그인도 지원하지만 현재 화면에서는 사용하지 않는다.
- 가입 링크를 확인하면 이미 로그인된 상태이므로 가입 직후 두 번째 인증 메일을 요청하지 않는다. 로그인 세션이 유지된 동안에도 새 메일을 요구하지 않는다.
- 메일 콜백은 자동 처리한다. React StrictMode에서 링크를 중복 소비하지 않고, 완료 후 `refreshUser()`로 사용자와 학교·행사 범위를 함께 갱신한다. 잘못된 링크와 누락된 이메일은 안내 화면으로 보낸다.
- 이미지 영역은 모바일 카메라, 별도 `이미지 업로드 (테스트용)`은 노트북 파일 선택용이다. 입력은 10MB 이하, 서버로 보내는 결과는 300KB 이하 JPEG로 변환한다. 학생증 사진은 현재 백엔드 계약에 따라 사용하지 않는다.
- 이메일 입력은 Google 메일로 제한하지 않는다. 실제 허용 여부는 서버의 학교 도메인 설정과 명단에 등록된 이메일로 결정한다. Naver·Outlook 주소를 입력할 수 있다는 것이 모든 학교에서 해당 주소를 허용한다는 뜻은 아니다.
- 기기·브라우저 확인은 기존 `profileToUser` → `withDevice`의 기기 키 등록과 `/device` 관문을 사용한다. 별도 지문 인증은 추가하지 않는다. 기존 어댑터는 기기 키 처리 오류 시 기본 사용자 상태를 반환하므로, 엄격한 기기 거부 정책과 실제 다른 브라우저 검증은 백엔드 담당자가 함께 확인해야 한다.
- 행사 담당자·스태프용 Google 로그인, `/ops/login` 링크와 기존 데모 계정 바로 로그인을 유지한다. 데모 계정 패널 및 바로 로그인은 mock 전용이다.

저장소 루트에서:

```sh
npm --prefix apps/web ci
npm --prefix apps/web run dev:mock
npm --prefix apps/web test
VITE_BACKEND=mock npm --prefix apps/web run build
npm --prefix apps/web run lint
```

기존 `npm test`(Vitest)로 프론트 단위 테스트를 함께 실행한다. 이 화면 연결 작업에서는 새 라이브러리를 추가하지 않았다.

성공 가입 테스트: 한빛대학교 → 윤지호 / 20242000 / member1@hanbit.ac.kr → `데모: 메일 링크 열기` → 테스트 얼굴 이미지와 동의 → 완료 → 축제·입장권. 이미 가입한 뒤에는 같은 정보로 재가입하지 않고 `/signin`에서 로그인한다. 초기화는 로그인 화면의 데모 계정 패널에 있다.

실제 연결은 `.env.example`을 참고해 팀 Firebase 웹 설정을 `.env.local`에 넣고 `npm --prefix apps/web run dev`로 실행한다. mock 플래그를 지정하지 않는다. Firebase Auth 이메일 링크 활성화, Authorized domains(로컬 호스트 포함), callable 배포·호출 권한, Sheets API 및 명단 가져오기는 담당자 확인이 필요하다. 프론트 구현·mock 성공은 실제 메일 수신이나 실서버 연결 성공을 의미하지 않는다. 운영 빌드에 설정이 없으면 기존 Vite 검사에 의해 실패하며, mock으로 조용히 배포되지 않는다.

연결이 확인되기 전까지 실제 학생 정보나 개인 사진 대신 가상 테스트 데이터를 사용한다.

### 확인 결과와 테스트 범위

- 자동 검사: 일반 빌드·mock 빌드, TypeScript 검사, `npm test`, lint. 검사 결과는 PR에 기록한다.
- 브라우저 mock 확인: 잘못된 학번·다른 학생 이메일 거절, 가입 링크 후 사진 단계, 잘못된 파일 거절, 얼굴 사진 등록과 완료, 신규 입장권 발급, 재로그인 후 같은 입장권 유지, 미가입 로그인 거절, 이전 기기 차단, 스태프 로그인, 이미 사용한 링크·잘못된 콜백 안내.
- 실제 연결은 요청자가 운영진 콘솔에 테스트 학생을 등록한 뒤 수신 가능한 학교 이메일로 가입 흐름을 수동 테스트하여 정상 동작을 확인했다고 보고했다. 개인정보·테스트 주소·비밀번호는 이 문서에 기록하지 않는다.
- 초기 점검에서 학교 목록이 비어 있었던 것은 당시 데이터 상태이며 현재 연결 불가를 뜻하지 않는다. 다른 환경에서는 학교 명단, Firebase 제공자, 허용 도메인과 함수 배포 상태를 별도로 확인한다.
- 실제 다른 기기·브라우저의 서명 검증과 Firebase 발송 제한은 이번 확인 범위에 포함하지 않는다.

## 축제 정보 카드 표시

`EventPage.tsx`의 기존 정보만 다듬었다. 학교별 그라데이션, 바깥 크기·4:3 비율·둥근 모서리·그림자·여백, 글꼴, 데이터 연결은 유지한다. 학교 표시는 반투명 배지, 축제명은 굵은 반응형 제목, 기존 날짜·장소 행은 같은 크기의 아이콘 영역으로 표시한다. 사용자가 제공한 달력·위치 SVG를 사용하며 다른 화면의 아이콘은 바꾸지 않는다. 분홍·초록 테마와 긴 한국어 문구를 모바일 320·360·390px 및 데스크톱에서 확인했다.
