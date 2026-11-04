# 학생 가입·로그인 연결 안내 (화면 담당용)

학생은 **학교 메일 링크**로 가입·로그인한다(비밀번호 없음). 운영진(스태프·학생회)은 지금처럼 구글 로그인(`signInWithSchoolAccount`)을 쓴다.
화면은 `@/lib/api`의 함수만 부르면 된다. 백엔드·mock은 준비돼 있고, 학생 화면은 아직 만들지 않았다.

## 흐름
```
가입    학교 고르기 → 이름·학번·학교 메일 → precheckStudent → sendSignInLink(메일, 가입 정보) → "메일을 확인해 주세요"
        메일 링크 → /auth/finish → completeSignInLink → (명단 대조까지 끝남) → /onboarding
        /onboarding: 동의 → 본인 사진 → submitProfilePhoto → 가입 완료 → /events
로그인  학교 메일 (+ 학번) → (학번을 넣었으면 precheckStudent) → sendSignInLink(메일) → 메일 링크 → /auth/finish → 홈
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
- 재학생 명단을 아직 불러오지 않은 학교는 예전처럼 구글 로그인으로 들어온다 (데모 보호).

## 라우트 제안
| 경로 | 화면 |
|---|---|
| `/` | 첫 화면: "학교 메일로 로그인", "처음이에요 · 가입하기", 작은 "운영진 로그인(Google)" |
| `/signup` | 가입 (학교 → 이름·학번·메일) |
| `/signin` | 로그인 (메일, 학번 선택) |
| `/auth/finish` | 메일 링크 처리 (비로그인 라우트) |
| `/onboarding` | 동의 → 본인 사진 |

## mock에서 해 보기
- mock은 메일을 보내지 않는다. `sendSignInLink` 뒤에 `mockSignInLinkFor(email)`(`@/lib/mock`, mock 전용)로 받은 주소를 열면 메일의 링크를 누른 것과 같다. mock일 때만 "데모: 메일 링크 열기" 버튼을 보여 주면 된다 (`USE_MOCK`).
- 가입해 볼 수 있는 명단 줄 (한빛대): 윤지호 `20242000` `member1@hanbit.ac.kr`, 강예린 `20242011` `member2@hanbit.ac.kr` … (`member1`~`member10`). 이미 계정이 있는 학생(김하늘 등)의 학번은 `student_id_taken`.
- 학번 로그인: 김하늘 `20231234` `haneul@hanbit.ac.kr`.

## 실제 연결 전에 (콘솔)
- Firebase 콘솔 → Authentication → 로그인 방법 → **이메일/비밀번호** 사용 + **이메일 링크(비밀번호 없는 로그인)** 사용
- 승인된 도메인에 배포 주소 확인
- 함수 배포: `listOpenSchools`, `precheckStudent`, `submitProfilePhoto`, `ensureUser`, `issueTicket`, `verifyStudentRoster`
