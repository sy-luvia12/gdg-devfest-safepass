# API 초안

기준 문서는 [프로토타입 개발 계획 (내일 제출)](https://app.notion.com/p/40c623493b2d8005bc95c6cc349709a8)과 [기술 설계 · 이후 개발 계획](architecture.md)이다. **[P]**는 프로토타입(11/3), **[2.x]**는 기술 설계의 다음 단계 항목이다.

## 0. 공통 규칙

- **호출 방식**: 모든 API는 Cloud Functions 2세대 callable(`onCall`)이다. 프론트는 `httpsCallable(functions, '이름')`으로 부른다.
- **리전**: `asia-northeast3`(서울)
- **인증**: 모든 함수는 로그인을 요구한다. 로그인하지 않았으면 `unauthenticated`를 반환한다.
- **시간**: 응답의 시각은 모두 ms 단위 epoch 숫자다. Firestore에는 `Timestamp`로 저장한다.
- **거부와 오류 구분**:
  - 예상된 거부(만료 QR, 이미 사용된 입장권 등)는 정상 응답 `{ ok: false, reason }`으로 돌려준다. 프론트는 `reason`에 따라 안내 문구를 보여 준다.
  - 잘못된 호출은 `HttpsError`로 던진다. 인증 없음, 권한 없음, 형식 오류, 대상 없음이 해당한다.
- **쓰기 권한**: Firestore 쓰기는 함수만 한다. 클라이언트는 아래 3장의 읽기·구독만 한다.

### 오류 코드

| HttpsError 코드 | 의미 |
| --- | --- |
| `unauthenticated` | 로그인 안 함 |
| `permission-denied` | 역할(role) 부족, 남의 입장권, 허용되지 않은 학교 도메인. `issueTicket`은 `details.reason`으로 `ROLE`(학생이 아님)과 `DOMAIN`(도메인 불허·미인증 메일)을 구분한다 |
| `invalid-argument` | 요청 형식 오류 |
| `not-found` | 행사, 입장권, 사용자 없음 |
| `already-exists` | 이미 이 행사 입장권이 있음 (1인 1매) |
| `resource-exhausted` | 정원 마감 |
| `failed-precondition` | 상태가 맞지 않음 (예: 사용된 입장권으로 QR 요청) |

## 1. 데이터 구조 [P]

기획자 계획의 데이터 구조에 기술 설계 1.2의 필드를 더했다.

### `users/{uid}`
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| name | string | 이름 |
| studentId | string | 학번 |
| email | string | 로그인 메일 |
| photoUrl | string | 사진 URL (프로토타입은 시드 데이터) |
| role | `'student' \| 'staff' \| 'admin'` | 화면·함수 접근 권한 |
| createdAt | Timestamp | |

### `events/{eventId}`
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| name | string | 축제 이름 |
| date | Timestamp | 행사 날짜 |
| capacity | number | 정원 |
| faceValue | number | 정가(원) |
| allowedDomains | string[] | 발급 가능한 학교 도메인 |
| issuedCount | number | 발급 수 (남은 수량 = `capacity - issuedCount`). 취소로 줄어든다 |
| nftSeq | number | NFT 번호 생성용 증가 카운터. 줄지 않아 번호가 겹치지 않는다. 없으면 `issuedCount`를 쓴다 |
| requireDevice | boolean | `true`면 `refreshQrToken`이 기기 서명을 확인한다 (9장). 시드 기본값은 `false` |
| allowReissueAfterCancel | boolean | `true`면 취소한 사람도 다시 받을 수 있다 (10장). 시드에서는 `test-reassign`만 켠다 |
| enteredCount | number | 입장 수 (관리자 화면 실시간 표시) |
| reassignMode | `'queue' \| 'random'` | 취소표 재배정 방식. 운영측이 행사별로 한 번 정한다 (프로토타입은 시드 데이터). `queue`는 대기 순서대로, `random`은 대기 명단에서 무작위 |
| schoolIds | string[] | 참여 학교 (`schools` 문서 id). 학생 화면의 축제 목록과 관리자 학교 선택에 쓴다. 고연전은 `['korea', 'yonsei']` |
| seriesName | map? | 묶음 이름을 학교별로 (예: `{ korea: '고연전', yonsei: '연고전' }`). 이때 `name`은 경기 이름 |
| place | string | 장소 |

### `schools/{schoolId}`
학교 이름과 상징색. 로그인한 사람은 누구나 읽는다. 쓰기는 시드(`functions/seed.ts`)만.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| name | string | 학교 이름 |
| brandColor | string | 상징색 hex. 앱 테마 기본색 |
| domains | string[] | 학교 메일 도메인. 학생의 학교를 정한다 |

### `tickets/{ticketId}`
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| eventId | string | |
| ownerUid | string | 현재 주인 |
| nftNumber | string | 표시용 번호. 예: `#0012` |
| status | `'issued' \| 'used' \| 'cancelled'` | `cancelled`는 받을 대기자가 없어 취소된 표. 주인이 없고 모든 함수가 없는 표로 취급한다 |
| qrToken, qrExpiresAt | null | 항상 null. 실제 토큰은 `qrTokens/{ticketId}`에 있다 (10장) |
| chain | map | 온체인 기록 상태 (11장) |
| issuedAt | Timestamp | |
| usedAt | Timestamp \| null | |

### `events/{eventId}/waitlist/{email}`
학생회가 구글 시트로 등록한다. 클라이언트는 읽지 못한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| name | string | |
| studentId | string | |
| order | number | 시트의 행 순서. `queue` 방식의 순번 |
| status | `'waiting' \| 'assigned'` | |
| assignedTicketId | string \| null | 배정된 입장권 |

### `reassignments/{id}`
취소표 재배정 이력. 클라이언트는 읽지 못한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| ticketId | string | |
| fromUid | string | 취소한 사람 |
| toUid | string \| null | 받은 사람. 대기자가 없어 다시 발급 가능 상태로 돌아가면 null |
| mode | `'queue' \| 'random'` | 배정 당시 방식 |
| createdAt | Timestamp | |

### `seedProfiles/{email}` (프로토타입 전용)
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| name, studentId, photoUrl, role | | 기획자 계획의 '미리 넣어둔 테스트 학생 데이터'. 첫 로그인 때 `users`로 복사한다 |

## 2. 함수 [P]

### 2.1 `ensureUser`
로그인 직후 한 번 호출한다. `users/{uid}`가 없으면 만든다.

- **호출자**: 로그인한 누구나
- **요청**: 없음
- **응답**
  ```ts
  { uid: string; name: string; studentId: string; email: string; photoUrl: string | null; role: 'student' | 'staff' | 'admin' }
  ```
- **처리**
  1. `users/{uid}`가 있으면 그대로 반환한다.
  2. 없으면 `seedProfiles/{email}`을 찾아 `users/{uid}`로 복사한다.
  3. 시드가 없으면 role `student`, 이름은 구글 표시 이름, 학번은 빈 값으로 만든다.

### 2.2 `issueTicket`
- **호출자**: student
- **요청**: `{ eventId: string }`
- **응답**: `{ ticketId: string; nftNumber: string }`
- **처리** (트랜잭션)
  1. 행사가 없으면 `not-found`
  1-1. 호출자가 student가 아니면 `permission-denied`, `details.reason: 'ROLE'`
  2. 로그인 메일이 인증되지 않았거나 도메인이 `allowedDomains`에 없으면 `permission-denied`, `details.reason: 'DOMAIN'`
  3. 같은 행사에 `ownerUid == uid`인 입장권이 있으면 `already-exists`
  3-1. 이 행사에서 취소한 적이 있고 `allowReissueAfterCancel`이 꺼져 있으면 `failed-precondition`, `details.reason: 'CANCELLED_BEFORE'` (10장)
  4. `issuedCount >= capacity`이면 `resource-exhausted`
  5. `nftSeq + 1`로 `nftNumber`를 만들고 `tickets` 문서를 생성한다. status는 `issued`다.

### 2.3 `refreshQrToken`
내 입장권 화면이 25초마다 호출한다. 만료 직전 공백을 없애려고 30초보다 짧게 잡는다.

- **호출자**: 입장권 주인
- **요청**: `{ ticketId: string }`
- **응답**: `{ qrPayload: string; expiresAt: number }`
- **처리**
  1. 주인이 아니면 `permission-denied`, status가 `used`면 `failed-precondition`
  2. 랜덤 토큰(16바이트, base64url)을 만들고 만료를 지금+30초로 저장한다. 이전 토큰은 즉시 무효가 된다.
  3. `qrPayload`는 `TTV1:{ticketId}:{qrToken}` 형식이다. 프론트는 이 문자열을 그대로 QR로 그린다.

### 2.4 `verifyEntry`
- **호출자**: staff, admin
- **요청**: `{ qrPayload: string; eventId?: string }` (`eventId`: 검표 화면이 보고 있는 행사. 없으면 행사를 확인하지 않는다)
- **응답**
  ```ts
  | { ok: true; ticketId: string; holder: { name: string; studentId: string; photoUrl: string | null }; enteredCount: number; capacity: number }
  | { ok: false; reason: 'INVALID_FORMAT' | 'NOT_FOUND' | 'WRONG_EVENT' | 'TOKEN_MISMATCH' | 'EXPIRED' | 'USED' }
  ```
- **처리** (트랜잭션)
  1. 형식이 `TTV1:…:…`가 아니면 `INVALID_FORMAT`, 입장권이 없으면 `NOT_FOUND`
  1-1. `eventId`를 보냈는데 다른 행사 입장권이면 `WRONG_EVENT`. 입장 처리하지 않고, 기록에는 그 학생 정보를 남기지 않는다
  2. status가 `used`면 `USED` (같은 QR 재스캔)
  3. 토큰이 다르면 `TOKEN_MISMATCH` (이미 교체된 예전 QR)
  4. 만료 시각이 지났으면 `EXPIRED` (캡처한 QR)
  5. 통과하면 status를 `used`로 바꾸고 `usedAt`을 기록한다. `qrToken`은 지우고 `events.enteredCount`를 1 올린다.
  6. 주인의 이름, 학번, 사진을 반환한다. 스태프는 이 정보로 얼굴을 대조한다.

캡처본은 30초 안에 다시 교체되므로 실제로는 3번(`TOKEN_MISMATCH`)이나 4번(`EXPIRED`)에서 걸린다. 프론트는 두 사유를 모두 "만료된 QR"로 안내하면 된다.

### 2.5 `cancelTicket`
기존 양도(`transferTicket`)를 대체한다. 취소표는 개인 간 거래 없이 운영 규칙대로 대기 명단에 재배정된다. 여유 있을 때만 만든다(기획자 계획 ⑥ 자리).

- **호출자**: 입장권 주인
- **요청**: `{ ticketId: string }`
- **응답**: `{ ok: true; outcome: 'REASSIGNED' | 'RELEASED' } | { ok: false; reason: 'TICKET_USED' }`
  - `REASSIGNED`: 대기자에게 넘어갔다. 받은 사람의 신원은 취소한 사람에게 알려 주지 않는다.
  - `RELEASED`: 받을 수 있는 대기자가 없어 입장권이 취소 상태가 되고 다시 발급 가능한 수량으로 돌아갔다.
- **처리** (트랜잭션)
  1. 주인이 아니면 `permission-denied`, 입장권이 없으면 `not-found`, status가 `used`면 `TICKET_USED`
  2. `events.reassignMode`에 따라 `waitlist`에서 `status == 'waiting'`인 후보를 고른다. `queue`는 `order`가 가장 작은 사람, `random`은 무작위 한 명이다.
  3. 후보는 다음 조건을 모두 만족해야 한다. 만족하지 못하면 이번 배정에서만 건너뛰고 `waiting`으로 남긴다.
     - 이미 로그인해서 `users`에 같은 메일이 있다.
     - 메일 도메인이 `allowedDomains`에 있다.
     - 이 행사의 입장권을 아직 갖고 있지 않다.
  4. 후보가 있으면 `ownerUid`를 그 사람으로 바꾸고 QR 토큰을 지운다. `waitlist`는 `assigned`로, `reassignments`에 한 건 기록한다.
  5. 후보가 없으면 입장권을 취소 상태로 두고 `issuedCount`를 1 줄인다. 번호 중복을 피하려고 `nftNumber`는 별도 증가 카운터로 만든다. `reassignments`에는 `toUid: null`로 기록한다.
- 새 주인은 별도 알림 없이, 내 입장권 화면의 실시간 구독(`ownerUid == uid`)으로 입장권이 나타난다.

### 2.6 대기 명단 등록
- 프로토타입: 시드 스크립트가 `waitlist`를 직접 넣는다.
- 이후 [2.5]: 학생회가 구글 시트로 등록하는 `importWaitlist`를 만든다. 아래 6장 참고.

## 3. 클라이언트 직접 읽기 [P]

함수 없이 Firestore SDK로 읽거나 구독한다.

| 화면 | 쿼리 | 방식 |
| --- | --- | --- |
| 내 입장권 | `tickets` where `ownerUid == uid` and `eventId == 지금 행사` | `onSnapshot` (`subscribeMyTicket`). 재배정·입장·취소가 새로고침 없이 반영된다 |
| 내 정보 | `users/{uid}` | `getDoc` |
| 관리자 실시간 현황 | `events/{eventId}`의 `enteredCount / capacity` | `onSnapshot` |

QR 토큰은 `refreshQrToken` 응답으로만 받는다. 입장권 문서의 `qrToken`은 null이다. 구독이 문서를 다시 보내도 화면은 이미 받은 QR을 유지한다.

## 4. 보안 규칙 [P]

기준은 저장소의 `firestore.rules`다. 아래는 처음 초안이고, 9장과 10장에서 `scanLogs`, `deviceResets`, `reassignments`, `waitlist`, `schools` 규칙이 더해졌다. `qrTokens`, `devices`는 규칙이 없어 클라이언트가 읽을 수 없다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function role() { return get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role; }

    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || role() == 'admin');
    }
    match /tickets/{ticketId} {
      allow read: if signedIn() && (resource.data.ownerUid == request.auth.uid || role() == 'admin');
    }
    match /events/{eventId} {
      allow read: if signedIn();
    }
    match /{document=**} {
      allow write: if false;   // 쓰기는 함수(Admin SDK)만
    }
  }
}
```

## 5. 시드 데이터 [P]

시드 스크립트(`functions/seed.ts`)는 비어 있는 필드만 채우고 기존 값은 덮어쓰지 않는다. 이미 배포된 행사의 값은 콘솔이나 `setAllowReissue` 같은 함수로 바꾼다.

- `schools`: 고려대, 연세대, 성균관대, KAIST
- `events`: 입실렌티(`demo-festival`), 고연전 3경기, 아카라카, 대동제, 태울석림제는 `allowReissueAfterCancel: false`다. 재배정 리허설용 `test-reassign`(고려대, 정원 20)만 `true`다.
- `seedProfiles/{email}`: 관리자 1명, 스태프 1명(`demo-staff@…`), 테스트 학생 3명(`demo-student1~3@…`). `demo-*` 주소는 자리표시자이므로 리허설 전에 팀원의 실제 학교 계정으로 바꾼다.
- `events/test-reassign/waitlist/{email}`: `demo-student2`, `demo-student3`이 순서 1, 2. 대기자는 미리 한 번 로그인해 `users`에 메일이 있어야 후보가 된다.
- `reassignMode`는 `queue`가 기본이다. `random`을 보여 주려면 `setReassignMode`로 바꿔 두 번 시연한다.

## 6. 다음 단계 변경 사항 [2.x]

프로토타입 API를 유지하면서 아래를 추가하거나 바꾼다.

| 단계 | 함수 | 호출자 | 요약 |
| --- | --- | --- | --- |
| 2.1 | `issueTicket` 변경 | student | 발급 후 사용자 지갑으로 `mint`. `tickets`에 tokenId, mintTx 추가. 체인 실패 시 Firestore 발급은 유지하고 재시도 |
| 2.1 | `cancelTicket` 변경 | 주인 | Firestore에서 재배정한 뒤 체인 모듈 `reassignTicket`으로 NFT 주인을 옮긴다. 서버 발급 지갑이 호출하므로 사용자 지갑 서명이 필요 없다. 체인 실패 시 Firestore 결과는 유지하고 재시도 |
| 2.3 | `confirmSchoolEmail` | 본인 | 연결된 학교 메일을 확인해 `users.schoolEmail` 저장 |
| 2.3 | `submitOnboarding` | 본인 | 사진 2장은 Storage에 직접 업로드하고, 경로를 제출하면 `verifyStatus=pending` |
| 2.3 | `approveUser` | admin | `{ uid, approved }`. 학생증 대조 결과 |
| 2.3 | `issueTicket` 변경 | | `verifyStatus == approved` 확인. 도메인과 1인 1매를 `schoolEmail` 기준으로 검사 |
| 2.4 | 전체 | | callable 옵션에 `enforceAppCheck: true` |
| 2.5 | `importRoster` | admin | `{ eventId, sheetUrl }` |
| 2.5 | `importWaitlist` | admin | `{ eventId, sheetUrl }`. 시트 행 순서대로 `waitlist`에 저장하고 `order`를 매긴다. 같은 메일이 이미 있으면 갱신한다 |
| 2.5 | `exportEntries` | admin | `{ eventId }` → `{ sheetUrl }` |
| 2.6 | `purgeEventData` | 예약 함수 | 하루 한 번. 종료 7일 지난 행사의 개인 데이터 삭제 |

## 7. 프론트와 맞출 것

- 함수 이름과 요청·응답 형태: 이 문서 2장
- `reason` 값별 안내 문구 (아래 예시)
- QR 갱신 주기 25초, QR 문자열 형식 `TTV1:{ticketId}:{qrToken}`
- 역할별 화면 진입 조건: `ensureUser` 응답의 `role`

| reason | 문구 예시 |
| --- | --- |
| `TOKEN_MISMATCH`, `EXPIRED` | 만료된 QR이에요. 화면의 최신 QR을 보여 주세요 |
| `USED` | 이미 입장한 입장권이에요 |
| `INVALID_FORMAT`, `NOT_FOUND` | 인식할 수 없는 QR이에요 |
| `WRONG_EVENT` | 다른 행사 입장권이에요 |
| `TICKET_USED` | 이미 사용된 입장권은 취소할 수 없어요 |

`issueTicket`의 `permission-denied`는 `details.reason`으로 문구를 나눈다.

| details.reason | 문구 예시 |
| --- | --- |
| `ROLE` | 학생 계정으로만 받을 수 있어요 (스태프·학생회에는 받기 버튼을 막는다) |
| `DOMAIN` | 학교 계정으로만 이용할 수 있어요 |
| `CANCELLED_BEFORE` | 이 축제 입장권을 취소한 적이 있어서 다시 받을 수 없어요 |

| outcome | 문구 예시 |
| --- | --- |
| `REASSIGNED` | 취소했어요. 입장권이 대기자에게 넘어갔어요 |
| `RELEASED` | 취소했어요. 대기자가 없어 다시 발급 가능한 표로 돌아갔어요 |

## 8. 체인 모듈 약속 [2.1]

백엔드의 다른 코드는 `functions/src/chain/`의 아래 함수만 부르고, uid만 넘긴다. 지갑 키와 가스 충전은 체인 모듈 안에서 처리한다.

```ts
createWallet(uid: string): Promise<{ address: string }>
mintTicket(p: { toUid: string; eventId: string; faceValue: number }): Promise<{ tokenId: string; txHash: string }>
reassignTicket(p: { tokenId: string; toUid: string }): Promise<{ txHash: string }>
releaseTicket(tokenId: string): Promise<{ txHash: string }>
markUsed(tokenId: string): Promise<{ txHash: string }>
```

- `reassignTicket`은 취소표를 대기자에게 옮긴다. `releaseTicket`은 대기자가 없을 때 취소 상태로 표시한다.
- **오류**: 실패하면 `ChainError`를 던진다. 코드는 `INSUFFICIENT_FUNDS`, `TX_FAILED` 중 하나다.
- **tokenId**: uint256은 JS 숫자 범위를 넘을 수 있어 문자열로 주고받는다.
- **지갑**: 개인키는 Secret Manager의 마스터 키로 암호화해 `walletKeys/{uid}`에 저장한다. 이 컬렉션은 체인 모듈만 읽는다.
- **가스**: 발급, 재배정, 입장 처리는 모두 서버 발급 지갑이 보낸다. 대금이 없고 사용자 지갑 서명도 필요 없어서, 사용자 지갑에 가스를 충전할 필요가 없다.

| 동작 | 순서 | 이유 |
| --- | --- | --- |
| `mintTicket`, `reassignTicket`, `releaseTicket`, `markUsed` | Firestore 먼저, 체인은 나중에 재시도 | 재배정 규칙은 서버가 판단하므로 Firestore가 기준이고, 체인이 느리거나 실패해도 발급·검표·취소가 멈추지 않게 |

정해야 할 것:
- eventId의 온체인 표현: Firestore 문서 ID(문자열)를 `keccak256`으로 바꾼 `bytes32` 사용 추천

## 9. 검표 로그, 기기 묶기, 재배정 방식 [P]

### `scanLogs/{id}`
`verifyEntry`가 통과·거부 모두 한 건씩 기록한다. 관리자만 읽는다.

| 필드 | 설명 |
| --- | --- |
| eventId, ticketId | eventId는 검표 화면의 행사(보냈을 때), 아니면 입장권의 행사. 읽을 수 없는 QR이면 null. `WRONG_EVENT`면 ticketId는 null |
| studentName, studentId | 입장권 주인. 알 수 없으면 null |
| staffUid, staffName | 검표한 사람 |
| result | `ok`, `expired`(`EXPIRED`, `TOKEN_MISMATCH`), `used`, `invalid`(`INVALID_FORMAT`, `NOT_FOUND`, `WRONG_EVENT`) |
| scannedAt | 서버 시각 |

### 함수
| 함수 | 호출자 | 요청 → 응답 |
| --- | --- | --- |
| `setReassignMode` | admin | `{ eventId, mode: 'queue' \| 'random' }` → `{ ok: true }` |
| `registerDevice` | 본인 | `{ publicKeyJwk }` (EC P-256 공개키) → `{ ok: true }`. 이미 있으면 `already-exists` |
| `resetDevice` | admin | `{ uid }` → `{ ok: true }`. 없어도 성공 |
| `setStaff` | admin | `{ email, staff: boolean }` → `{ ok: true, status: 'UPDATED' \| 'PENDING_SIGNUP' }`. 메일의 계정에 `staff`/`student` 역할을 준다. 아직 로그인하지 않았으면 `seedProfiles`에 넣어 첫 로그인 때 적용한다(`PENDING_SIGNUP`). admin 계정은 바꾸지 못한다(`failed-precondition`) |

### 기기 확인 (`refreshQrToken`)
- `events.requireDevice`가 `true`인 행사만 확인한다. 기본은 꺼져 있어서 기기 등록이 없는 프론트도 동작한다.
- 요청에 `deviceProof: { signedAt, signature }`를 넣는다. 기기 키 생성이나 서명이 실패하면(WebCrypto가 없는 http 주소 등) 프론트는 이 필드를 빼고 보내고, 서버는 `undefined`와 `null`을 모두 "증명 없음"으로 본다. 서명 대상은 `TTV1-REFRESH:{ticketId}:{signedAt}`, ECDSA P-256 SHA-256, IEEE P1363, base64url이다. `signedAt`은 서버 시각과 60초 안이어야 한다.
- 실패하면 `failed-precondition`이고 `details.reason`이 `DEVICE_NOT_REGISTERED` 또는 `DEVICE_PROOF_INVALID`다.

### 보안 규칙 추가
관리자만 `scanLogs`, `reassignments`, `events/{id}/waitlist`를 읽는다. 쓰기는 여전히 함수만 한다.

### 이벤트 문서 기본값
콘솔에서 만든 문서에 없는 카운터는 0으로 읽는다. `nftSeq`가 없으면 `issuedCount`를 쓴다. 시드 스크립트는 비어 있는 필드만 채우고 기존 값은 덮어쓰지 않는다.

## 10. 취소 후 재발급 금지, QR 토큰 보관, 기기 초기화 요청 [P]

처리 방침은 노션 "요청 처리 방침" 페이지를 따른다.

### 취소 후 재발급 금지 (`issueTicket`)
- `reassignments`에 `fromUid == 나`, `eventId == 행사` 기록이 있으면 `failed-precondition`, `details.reason`은 `CANCELLED_BEFORE`다.
- `events.allowReissueAfterCancel`이 `true`인 행사는 다시 받을 수 있다. 테스트 행사만 켠다.
- 이 변경 전에 만든 `reassignments`에는 `eventId`가 없어서 재발급 금지에 걸리지 않는다.

### `reassignments/{id}` 추가 필드
`eventId`, `nftNumber`, `fromName`, `toName`(재배정되지 않았으면 null)을 같이 저장한다.

### QR 토큰 보관
- `refreshQrToken`은 토큰을 `qrTokens/{ticketId}`(`token`, `expiresAt`)에 쓴다. 입장권 문서의 `qrToken`, `qrExpiresAt`은 null로 둔다.
- `qrTokens`는 어떤 클라이언트도 읽을 수 없다. `verifyEntry`만 읽고, 입장 처리·취소 때 지운다.

### `deviceResets/{uid}`
학생의 기기 초기화 요청. `uid`, `name`, `studentId`, `email`, `status`(`pending`/`done`), `requestedAt`, `resolvedAt`. `resetDevice`가 `done`으로 바꾼다.

### 함수
| 함수 | 호출자 | 요청 → 응답 |
| --- | --- | --- |
| `setAllowReissue` | admin | `{ eventId, allow: boolean }` → `{ ok: true }` |
| `requestDeviceReset` | student | 없음 → `{ ok: true }`. 다시 요청하면 요청 시각을 갱신한다 |

### 보안 규칙 추가
- `scanLogs`: 관리자, 또는 `staffUid`가 본인인 기록. 스태프는 `where('staffUid', '==', uid)` 쿼리로만 읽는다.
- `deviceResets`: 관리자, 또는 본인 문서.

## 11. 체인 연동 구현 [2.1]

8장의 약속을 아래처럼 구현했다(`functions/src/chain/`, 컨트랙트는 `contracts/README.md`).

### 흐름 (아웃박스)
- `issueTicket`, `cancelTicket`, `verifyEntry`는 Firestore 트랜잭션 안에서 입장권 변경과 함께 `chainOps/{ticketId}-{seq}`를 만든다. kind는 `mint`, `reassign`, `release`, `markUsed`다.
- 입장권 문서에는 `chainSeq`(마지막 op 번호)와 `chain`이 생긴다.
  - `chain`의 필드: `status`(`pending`/`done`/`blocked`), `tokenId`, `mintTx`, `lastTx`, `contractOwner`
  - 타입: `TicketChainState`
- `processChainOp`(Firestore 트리거)가 op를 한 번에 하나씩 체인에 보낸다(`maxInstances: 1`, `concurrency: 1`, `retry: true`).
  - 같은 입장권의 op n은 op n-1이 `done`이 된 뒤에만 실행된다.
  - 체인에 이미 반영된 결과는 건너뛴다. 그래서 재시도해도 안전하다.
- 체인 이전에 발급된 입장권은 다음 op 앞에 그때 주인으로 `mint`를 먼저 넣는다.
- `reassign`과 `release`의 txHash는 `reassignments/{id}.txHash`에도 기록한다.
- 사유 코드: 1 대기 순서, 2 무작위, 3 대기자 없음, 4 운영진 회수

### 실패
- minter 가스가 부족하면 op는 `blocked`가 되고 재시도하지 않는다. 입장권 `chain.status`도 `blocked`가 된다.
- 그 밖의 오류는 예외를 던져 Functions가 백오프로 재시도한다.
- `chainOps.error`와 로그에 남는 체인 오류 메시지에서는 URL을 모두 지운다(RPC API 키 보호).
- 체인 설정이 비어 있으면 op는 `pending`으로 남는다. 이때도 발급·검표·취소는 그대로 동작한다.
- `retryChainOps`(admin): `pending`·`blocked` op를 오래된 순서로 다시 처리한다. 응답은 `{ ok, done, blocked, failed }`다.

### 학생 주소
- 니모닉 하나에서 `m/44'/60'/0'/0/{index}`로 파생한다.
- `users`에는 `walletIndex`와 `walletAddress`만 둔다. 개인키는 저장하지 않는다.
- index는 `counters/wallets`에서 한 번만 배정한다.

### 설정 (Functions params)
| 이름 | 종류 | 값 |
| --- | --- | --- |
| `CHAIN_CONTRACT_ADDRESS` | string | `contracts/deployments/baseSepolia.json`의 address. 비어 있으면 체인 꺼짐 |
| `CHAIN_RPC_URL` | secret | Base Sepolia RPC URL(공개 기본값 `https://base-sepolia-rpc.publicnode.com`). Alchemy·Infura URL에는 API 키가 들어 있어 비밀값으로 둔다 |
| `CHAIN_MINTER_KEY` | secret | minter 개인키 |
| `CHAIN_WALLET_MNEMONIC` | secret | 학생 주소 파생용 니모닉 |

### 켜는 순서 (go-live)
비밀값은 저장소 밖 파일에만 두고 명령줄에 직접 쓰지 않는다.
1. 컨트랙트 배포와 소스 검증: `contracts/README.md`의 테스트넷 배포 런북(기본 Base Sepolia, chainId 84532). 결과 `contracts/deployments/baseSepolia.json`을 커밋한다.
2. 사전 점검(읽기 전용, 거래 없음):
   ```bash
   MINTER_KEY_FILE=... MNEMONIC_FILE=... npx --prefix functions tsx functions/scripts/chain-preflight.ts
   ```
   RPC 체인 ID, 컨트랙트 존재, ERC-5192, minter의 MINTER_ROLE, 가스 잔고(처리 가능한 티켓 수), 니모닉 형식을 확인한다. 하나라도 실패하면 exit 1. 출력에는 주소와 잔고만 나오고 키, 니모닉, RPC URL은 나오지 않는다.
3. Secret 등록(팀 확인 후): `firebase functions:secrets:set CHAIN_RPC_URL`, `CHAIN_MINTER_KEY`, `CHAIN_WALLET_MNEMONIC`. 값은 프롬프트에 붙여 넣거나 `--data-file`로 넘긴다.
4. `functions/.env.ttv-festival-pass`에 `CHAIN_CONTRACT_ADDRESS=<baseSepolia.json의 address>`를 넣는다(공개값).
5. functions 재배포(팀 확인 후): `firebase deploy --only functions`.
6. 웹: `apps/web/.env.local`에 `VITE_CHAIN_CONTRACT`, `VITE_CHAIN_EXPLORER=https://sepolia.basescan.org`을 넣고 빌드·배포한다.
7. 확인: 입장권 1장을 발급해 `chain.status`가 `done`이 되고 Basescan 링크가 열리는지 본다. 체인을 켜기 전에 쌓인 op는 `retryChainOps`로 처리한다.

되돌리기: `CHAIN_CONTRACT_ADDRESS`를 비우고 재배포하면 체인이 꺼진다. 발급·검표·취소는 그대로 동작하고 op는 `pending`으로 쌓인다.

### 테스트
- `npm --prefix functions test`: 식별자·주소 파생 단위 테스트
- `npm --prefix functions run test:int`: 체인이 꺼진 상태에서 op가 순서대로 쌓이는지 확인
- `npm --prefix functions run test:chain`: Hardhat 로컬 노드 + Firestore 에뮬레이터. 재시도 안전성, 순서, 가스 부족 시 `blocked`, go-live 사전 점검의 성공·실패 경우와 비밀값 비노출을 확인
