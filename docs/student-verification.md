# 학적 명단 기반 재학생 자동 인증

이번 변경은 `CLAUDE.md`, `docs/architecture.md` 2.3절, `docs/api.md` 6절에 설명된 수동 승인 절차를 대체한다. 기존 4단계 온보딩과 동의, 본인 사진, 학생증 사진 등록은 유지한다.

## 동작 방식과 변경 파일

- `apps/web/src/lib/fixtures/studentRegistry.json`: 기존 데모 학교 3곳의 학생 계정과 정확히 일치하는 가상 학적 명단이다. 실제 학생 정보가 아니다.
- `functions/src/domain/studentRegistry.ts`: `schoolId`, `studentId`, `name`, `email`을 비교한다. 네 항목이 같은 행에서 모두 일치해야 한다. 앞뒤 공백과 유니코드 NFC를 정규화하고, 이메일은 대소문자를 구분하지 않는다. 학번은 앞자리 0을 보존하는 문자열로 처리한다.
- `apps/web/src/lib/mock.ts`: `submitVerification(photo, idCard, identity?)`가 즉시 `approved` 또는 `rejected` 상태의 사용자를 반환한다. 정보 수정 후 재시도할 수 있다. 이미 승인된 사용자와 등록 사진은 유지하며, 미인증 학생의 입장권 발급은 거부한다. 기존 대기 요청을 관리자가 mock에서 승인할 때도 명단 일치가 필요하다.
- `apps/web/src/lib/api.ts`, `firebaseApi.ts`: mock과 Firebase에서 같은 API 진입점을 사용한다. Firebase 어댑터는 모든 학생을 승인된 것으로 간주하던 처리를 없애고 실제 서버 상태를 읽는다.
- `apps/web/src/pages/student/OnboardingPage.tsx`: 기존 화면에 이름·학번 수정, 인증 성공 후 축제 이동, 한국어 오류 안내를 추가한다. 학교 이메일과 학교는 사용자가 임의로 지정할 수 없다.
- `apps/web/src/components/StateView.tsx`: 기존 디자인 토큰을 사용하는 체크 아이콘 성공 상태를 추가한다.
- `apps/web/src/app/config.ts`, `apps/web/src/pages/student/PendingPage.tsx`: 기존 승인 대기 사용자와 이전 대기 화면 주소를 자동 인증 재신청 화면으로 연결한다.
- `apps/web/src/pages/admin/ApprovalsPage.tsx`: 기존 대기 요청용 화면임을 안내한다. 신규 인증은 이 화면의 수동 승인을 거치지 않는다.
- `functions/src/handlers/submitVerification.ts`, `ensureUser.ts`, `issueTicket.ts`, `functions/src/api.ts`, `functions/src/index.ts`: callable 계약, 인증 상태 저장, 서버 측 승인, 신규 입장권 발급 전 승인 확인을 구현한다.
- `functions/src/sheets/studentRegistry.ts`: Application Default Credentials(ADC)와 읽기 전용 범위로 비공개 Google Sheets를 조회한다. 제한 시간은 10초다. 설정·네트워크 오류는 기존 인증 상태를 변경하지 않는다. 전체 명단을 브라우저에 반환하지 않는다.
- `functions/package.json`, `package-lock.json`: `google-auth-library` 직접 의존성과 검증 테스트 명령을 추가한다.
- `functions/test/verification*.test.ts`, `vitest.verification.config.mts`: mock 흐름과 백엔드 인증 경계를 검사한다. `test/integration.test.ts`의 기존 입장권 시나리오는 테스트 학생을 서버에서 이미 승인된 사용자로 명시한다.
- `README.md`: 이 문서의 링크를 추가한다. `docs/onboarding-pr.md`: 팀 검토용 PR 제목·본문 초안과 공유 절차를 제공한다.

## 로컬 테스트

```sh
npm --prefix apps/web ci
npm --prefix functions ci
npm --prefix apps/web run dev:mock
```

로그인 화면에서 **데모 계정 → 한빛대학교 → 첫 로그인 송하윤**을 선택한다. 이름은 `송하윤`, 학번은 `20260031`, 이메일은 `hayun@hanbit.ac.kr`이다. 필수 항목에 동의하고 가상의 테스트 사진 2장을 등록한 뒤 **재학생 확인하기**를 누른다. 인증 성공 후 **축제 보러 가기 → 입장권 받기**로 진행한다.

불일치 테스트는 제출 전에 이름 또는 학번을 변경한다. 오류 안내가 표시되고 입장권 화면에 접근할 수 없어야 한다. 이는 **명단과 입력 정보가 일치하지 않는다는 뜻**이며, 실제 비재학생임을 확정하는 결과는 아니다. **이전** 버튼으로 돌아가 정보를 수정하고 재시도한다.

처음부터 다시 확인하려면 다른 학교의 **첫 로그인** 계정을 선택하거나 데모 패널에서 로컬 데모 데이터를 초기화한다. 초기화하면 기존 로컬 테스트 기록도 사라진다. 이미 승인된 계정은 재신청으로 정보·사진을 바꾸지 않는다. 별도 탭에서 **학생·입장권 있음**과 **스태프** 계정을 사용하면 기존 QR 검표도 확인할 수 있다.

```sh
npm --prefix functions run test:verification
npm --prefix functions test
npm --prefix functions run build
npm --prefix apps/web run build
npm --prefix apps/web run lint
# Firebase CLI와 JDK 21 이상이 설치된 환경에서 추가 실행:
npm --prefix functions run test:int
```

신규 자동 테스트는 학교 3곳의 명단 일치, 잘못된 정보, 명단에 없는 학생, 수정 후 재시도, 기존 승인 유지, 이전 대기 요청, 입장권 발급, 스태프 검표, 승인 상태 조작, 외부 서비스 오류, 학생증 사진 분리 저장을 검사한다. 백엔드 테스트는 Sheets와 Firestore를 테스트 대역으로 교체하므로 실제 Google 연결 성공을 보장하지 않는다.

## Google Sheets 설정 — 아직 실제 연결 안 됨

현재 로컬 테스트에는 JSON 파일만 사용한다. 실제 Google Sheet를 생성하거나 Cloud 설정을 변경하지 않았고 배포도 하지 않았다. 서버 연동 코드는 준비되어 있지만, 설정이 없으면 기술 오류로 요청을 거부하며 임의로 승인하지 않는다.

1. 기존 Firebase/Google Cloud 프로젝트에서 **Google Sheets API**를 활성화한다.
2. 비공개 스프레드시트를 만들고 탭 이름을 `Students`로 지정한다. A–D열 순서는 `schoolId`, `studentId`, `name`, `email`이며, 첫 행은 헤더다. 학번 열은 일반 텍스트로 지정한다. `schoolId`는 Firestore의 `schools/{id}` 문서 ID와 같아야 한다. 해당 학교 문서의 `domains`를 설정하고, 하나의 도메인은 정확히 한 학교에 속하도록 한다.

   | schoolId | studentId | name | email |
   | --- | --- | --- | --- |
   | hanbit | 20260031 | 송하윤 | hayun@hanbit.ac.kr |

   위 예시는 가상 데이터다. 실제 테스트 프로젝트의 학교 ID·도메인과 맞춰야 한다.

3. Functions **런타임 서비스 계정**에 해당 스프레드시트의 **뷰어** 권한만 부여한다. 공개 링크나 Drive 쓰기 권한은 필요 없다. 다른 개인정보가 섞이지 않은 학적 명단 전용 스프레드시트를 사용한다.
4. 서버 환경 변수를 설정한다. 예를 들어 Git에서 제외된 `functions/.env.<project-id>`에 다음 값을 둔다.

   ```dotenv
   STUDENT_REGISTRY_SHEET_ID=<스프레드시트 URL에 있는 ID>
   STUDENT_REGISTRY_RANGE=Students!A2:D
   ```

5. Google Cloud에서는 Functions 런타임 신원을 ADC로 사용하므로 보통 서비스 계정 키 파일을 다운로드할 필요가 없다. 로컬에서 실제 시트를 테스트하려면 Sheets 읽기 범위가 있는 ADC를 설정하거나, 저장소 밖의 서비스 계정 파일을 `GOOGLE_APPLICATION_CREDENTIALS`로 지정한다. 자격 증명은 `VITE_*`, 프론트엔드 코드, Git에 넣지 않는다.
6. 백엔드·프론트엔드를 함께 검증하고 별도 승인 후 배포한다. 기존 프로젝트 문서상 Cloud Functions 운영에는 Blaze 요금제가 필요하다. 이번 작업에서 요금제를 변경하거나 유료 서비스를 신청하지 않았다.

API 참고: [spreadsheets.values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get). 요청 범위는 `https://www.googleapis.com/auth/spreadsheets.readonly`다.

## 백엔드 협의 사항과 한계

- 기존 기획의 수동 사진 대조를 학적 명단 비교로 대체했다. 이 비교는 등록 정보의 일치를 확인하며 **얼굴 동일성이나 학생증 이미지의 진위를 판별하지 않는다**. 입구의 육안 확인용 본인 사진과 학생증 사진은 유지한다. OCR·얼굴 인식은 추가하지 않았다.
- 기존 백엔드에는 사진 업로드와 승인 상태가 구현되지 않았다. 현재 callable은 기존 화면에서 축소한 JPEG Data URL을 이미지당 최대 350,000자까지 받는다. 본인 사진은 기존 검표 흐름을 위해 사용자 프로필에, 학생증 사진은 클라이언트 읽기가 차단된 `verificationPhotos/{uid}`에 별도로 저장한다. Firestore·Storage 권한은 확대하지 않았다. 운영 전에는 백엔드 팀에서 Storage, 단기 서명 URL, 이미지 검증을 보완해야 한다. 기존 관리자 화면에는 이 비공개 학생증 이미지를 표시하는 연결이 아직 없다.
- 화면에서 안내하는 행사 종료 7일 후 자동 삭제 작업은 아직 구현되지 않았다. 신규 `verificationPhotos`도 삭제 대상에 포함해야 한다. 실제 개인정보를 사용하기 전에 삭제 처리와 개인정보 안내를 맞춰야 한다.
- 서버에 **명시적으로 `approved`가 저장된 사용자**는 기존 승인을 유지한다. 상태가 없던 Firebase 사용자는 종전에 브라우저에서만 승인된 것으로 처리되었으며, 이제 온보딩을 거친다. 확인된 기존 사용자를 유지하려면 검토된 서버 측 마이그레이션이 필요하다. 모든 기존 계정을 일괄 승인하면 안 된다.
- 기존 행사별 mock `requireRoster`와 관리자 **명단 연동** 화면은 별도의 행사 대상자 필터다. 이 화면으로 신규 학교별 학적 명단을 설정하는 것은 아니다. 관리 화면 통합은 백엔드 팀과 협의해야 한다.
- 이미 승인된 사용자를 지속적으로 재검증하지 않는다. 신규 제출 때마다 서버에서 시트 전체를 읽으므로 대규모 운영에서는 인덱스·가져오기 방식, API 할당량, 남용 방지를 추가 검토해야 한다.
- 기존 취소표 대기자 재배정은 변경하지 않았다. 운영 전에는 수신자의 인증 상태도 재배정 경로에서 확인하도록 백엔드 팀과 협의해야 한다.
- 블록체인 계약, 배포, Git 원격 설정은 변경하지 않았다.

## 구현 시 검증 결과

- TypeScript를 포함한 웹 빌드: 통과. 기존 번들 크기 경고가 있다.
- Functions 빌드: 통과.
- 기존 백엔드 단위 테스트: 48개 통과.
- 신규 인증 테스트: 19개 통과.
- 웹 lint: 종료 코드 0. 기존 React 경고 20개가 있다.
- 에뮬레이터 통합 테스트: 실행을 시도했으나 Firebase CLI가 없어 완료하지 못했다. Java Runtime/JDK도 설치되어 있지 않다.
- 자동 브라우저 확인은 사진 등록 단계까지 진행했다. 파일 선택창에 접근하지 못해 전체 업로드·화면 이동 테스트는 완료하지 못했다. 입장권 접근과 스태프 검표는 API·라우팅 수준의 자동 테스트로 확인했다.
- 이후 사용자가 로컬에서 직접 동작을 확인했다. 실제 Google Sheets와 배포 환경에서의 검증은 아직 필요하다.
