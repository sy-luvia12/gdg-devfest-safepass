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
| `permission-denied` | 역할(role) 부족, 남의 입장권, 허용되지 않은 학교 도메인 |
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
| issuedCount | number | 발급 수 (NFT 번호 생성에도 사용) |
| enteredCount | number | 입장 수 (관리자 화면 실시간 표시) |
| reassignMode | `'queue' \| 'random'` | 취소표 재배정 방식. 운영측이 행사별로 한 번 정한다 (프로토타입은 시드 데이터). `queue`는 대기 순서대로, `random`은 대기 명단에서 무작위 |

### `tickets/{ticketId}`
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| eventId | string | |
| ownerUid | string | 현재 주인 |
| nftNumber | string | 표시용 번호. 예: `#0012` |
| status | `'issued' \| 'used'` | |
| qrToken | string \| null | 현재 유효한 QR 토큰 |
| qrExpiresAt | Timestamp \| null | 토큰 만료 시각 |
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
  2. 로그인 메일 도메인이 `allowedDomains`에 없으면 `permission-denied`
  3. 같은 행사에 `ownerUid == uid`인 입장권이 있으면 `already-exists`
  4. `issuedCount >= capacity`이면 `resource-exhausted`
  5. `issuedCount + 1`로 `nftNumber`를 만들고 `tickets` 문서를 생성한다. status는 `issued`다.

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
- **요청**: `{ qrPayload: string }`
- **응답**
  ```ts
  | { ok: true; ticketId: string; holder: { name: string; studentId: string; photoUrl: string | null }; enteredCount: number; capacity: number }
  | { ok: false; reason: 'INVALID_FORMAT' | 'NOT_FOUND' | 'TOKEN_MISMATCH' | 'EXPIRED' | 'USED' }
  ```
- **처리** (트랜잭션)
  1. 형식이 `TTV1:…:…`가 아니면 `INVALID_FORMAT`, 입장권이 없으면 `NOT_FOUND`
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
| 내 입장권 | `tickets` where `ownerUid == uid` | `onSnapshot` |
| 내 정보 | `users/{uid}` | `getDoc` |
| 관리자 실시간 현황 | `events/{eventId}`의 `enteredCount / capacity` | `onSnapshot` |

QR 토큰은 `refreshQrToken` 응답으로만 받는다. 입장권 문서에도 `qrToken`이 있지만 화면은 응답값을 쓴다.

## 4. 보안 규칙 초안 [P]

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

- `events/demo-festival`: 가상 축제 1개. `allowedDomains`에 팀원 학교 도메인, `capacity`는 데모용 소수(예: 50)
- `seedProfiles/{email}`: 테스트 학생 3~4명(PM 준비). 검표용 staff 1명, 관리자 admin 1명
- `events/demo-festival.reassignMode`: 데모용 방식 하나. 두 방식을 다 보여 주려면 값을 바꿔 두 번 시연한다.
- `events/demo-festival/waitlist/{email}`: 대기 명단 2~3명. 발급받지 않은 테스트 학생 계정으로 넣는다.

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
| `TICKET_USED` | 이미 사용된 입장권은 취소할 수 없어요 |

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
| eventId, ticketId | 읽을 수 없는 QR이면 null |
| studentName, studentId | 입장권 주인. 알 수 없으면 null |
| staffUid, staffName | 검표한 사람 |
| result | `ok`, `expired`(`EXPIRED`, `TOKEN_MISMATCH`), `used`, `invalid`(`INVALID_FORMAT`, `NOT_FOUND`) |
| scannedAt | 서버 시각 |

### 함수
| 함수 | 호출자 | 요청 → 응답 |
| --- | --- | --- |
| `setReassignMode` | admin | `{ eventId, mode: 'queue' \| 'random' }` → `{ ok: true }` |
| `registerDevice` | 본인 | `{ publicKeyJwk }` (EC P-256 공개키) → `{ ok: true }`. 이미 있으면 `already-exists` |
| `resetDevice` | admin | `{ uid }` → `{ ok: true }`. 없어도 성공 |

### 기기 확인 (`refreshQrToken`)
- `events.requireDevice`가 `true`인 행사만 확인한다. 기본은 꺼져 있어서 기기 등록이 없는 프론트도 동작한다.
- 요청에 `deviceProof: { signedAt, signature }`를 넣는다. 서명 대상은 `TTV1-REFRESH:{ticketId}:{signedAt}`, ECDSA P-256 SHA-256, IEEE P1363, base64url이다. `signedAt`은 서버 시각과 60초 안이어야 한다.
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
