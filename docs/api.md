# API 초안

기준 문서는 [프로토타입 개발 계획 (내일 제출)](https://app.notion.com/p/40c623493b2d8005bc95c6cc349709a8)과 [기술 설계 · 이후 개발 계획](architecture.md)이다. **[P]**는 프로토타입(11/3), **[2.x]**는 기술 설계의 다음 단계 항목이다.

## 0. 공통 규칙

- **호출 방식**: 모든 API는 Cloud Functions 2세대 callable(`onCall`)이다. 프론트는 `httpsCallable(functions, '이름')`으로 부른다.
- **리전**: `asia-northeast3`(서울)
- **인증**: 모든 함수는 로그인을 요구한다. 로그인하지 않았으면 `unauthenticated`를 반환한다.
- **시간**: 응답의 시각은 모두 ms 단위 epoch 숫자다. Firestore에는 `Timestamp`로 저장한다.
- **거부와 오류 구분**:
  - 예상된 거부(웃돈 양도, 만료 QR 등)는 정상 응답 `{ ok: false, reason }`으로 돌려준다. 프론트는 `reason`에 따라 안내 문구를 보여 준다.
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

### `transfers/{transferId}`
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| ticketId | string | |
| fromUid | string | |
| toUid | string \| null | 받는 사람을 못 찾으면 null |
| price | number | 입력한 가격 |
| result | `'success' \| 'rejected'` | |
| reason | string \| null | 거부 사유 (`transferTicket`의 reason과 같은 값) |
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

### 2.5 `transferTicket`
여유 있을 때만 만든다(기획자 계획 ⑥). 프로토타입에는 대금 이동이 없다.

- **호출자**: 입장권 주인
- **요청**: `{ ticketId: string; toEmail: string; price: number }`
- **응답**: `{ ok: true } | { ok: false; reason: 'OVER_FACE_VALUE' | 'RECIPIENT_NOT_FOUND' | 'RECIPIENT_NOT_ALLOWED' | 'RECIPIENT_HAS_TICKET' | 'TICKET_USED' }`
- **처리** (트랜잭션)
  1. 주인이 아니면 `permission-denied`, price가 0 이상의 정수가 아니면 `invalid-argument`
  2. `price > faceValue`면 `OVER_FACE_VALUE`
  3. 받는 사람이 `users`에 없으면 `RECIPIENT_NOT_FOUND`, 도메인이 허용되지 않으면 `RECIPIENT_NOT_ALLOWED`, 이미 입장권이 있으면 `RECIPIENT_HAS_TICKET`
  4. 입장권 status가 `used`면 `TICKET_USED`
  5. 통과하면 `ownerUid`를 바꾸고 QR 토큰을 지운다.
  6. 성공이든 거부든 `transfers`에 한 건 기록한다.

## 3. 클라이언트 직접 읽기 [P]

함수 없이 Firestore SDK로 읽거나 구독한다.

| 화면 | 쿼리 | 방식 |
| --- | --- | --- |
| 내 입장권 | `tickets` where `ownerUid == uid` | `onSnapshot` |
| 내 정보 | `users/{uid}` | `getDoc` |
| 관리자 실시간 현황 | `events/{eventId}`의 `enteredCount / capacity` | `onSnapshot` |
| 양도 내역 (선택) | `transfers` where `fromUid == uid` | `getDocs` |

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
    match /transfers/{id} {
      allow read: if signedIn() && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid);
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

## 6. 다음 단계 변경 사항 [2.x]

프로토타입 API를 유지하면서 아래를 추가하거나 바꾼다.

| 단계 | 함수 | 호출자 | 요약 |
| --- | --- | --- | --- |
| 2.1 | `issueTicket` 변경 | student | 발급 후 사용자 지갑으로 `mint`. `tickets`에 tokenId, mintTx 추가. 체인 실패 시 Firestore 발급은 유지하고 재시도 |
| 2.1 | `listTicket` | 주인 | `{ ticketId, price }`. 컨트랙트 `list`. 정가 초과는 온체인 revert → `OVER_FACE_VALUE` |
| 2.1 | `cancelListing` | 주인 | `{ ticketId }`. 컨트랙트 `cancelList` |
| 2.1 | `buyTicket` | student | `{ ticketId }`. 구매자 지갑으로 `buy`. 성공 시 주인 변경, `transfers`에 txHash |
| 2.1 | `transferTicket` 제거 | | `listTicket`과 `buyTicket`으로 대체 |
| 2.2 | `registerDevice` | 본인 | `{ publicKeyJwk }`. 이미 등록돼 있으면 `already-exists` |
| 2.2 | `resetDevice` | admin | `{ uid }`. 기기 등록 초기화 |
| 2.2 | `refreshQrToken` 제거 | | 클라이언트가 기기 키로 직접 서명해 QR 생성 |
| 2.2 | `verifyEntry` 변경 | staff | 서명, ts 30초, nonce를 검증하고 정보만 반환. 사용됨 처리는 하지 않음 |
| 2.2 | `confirmEntry` | staff | `{ ticketId, approved }`. 얼굴 대조 승인 시 사용됨 처리, `enteredCount+1`, `markUsed` |
| 2.3 | `confirmSchoolEmail` | 본인 | 연결된 학교 메일을 확인해 `users.schoolEmail` 저장 |
| 2.3 | `submitOnboarding` | 본인 | 사진 2장은 Storage에 직접 업로드하고, 경로를 제출하면 `verifyStatus=pending` |
| 2.3 | `approveUser` | admin | `{ uid, approved }`. 학생증 대조 결과 |
| 2.3 | `issueTicket` 변경 | | `verifyStatus == approved` 확인. 도메인과 1인 1매를 `schoolEmail` 기준으로 검사 |
| 2.4 | 전체 | | callable 옵션에 `enforceAppCheck: true` |
| 2.5 | `importRoster` | admin | `{ eventId, sheetUrl }` |
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
| `OVER_FACE_VALUE` | 정가보다 비싸게 양도할 수 없어요 |
| `RECIPIENT_NOT_FOUND` | 가입하지 않은 사용자예요 |
| `RECIPIENT_NOT_ALLOWED` | 이 행사에 참여할 수 없는 학교예요 |
| `RECIPIENT_HAS_TICKET` | 받는 사람이 이미 입장권을 가지고 있어요 |
| `TICKET_USED` | 이미 사용된 입장권이에요 |

## 8. 체인 모듈 약속 [2.1]

백엔드의 다른 코드는 `functions/src/chain/`의 아래 함수만 부르고, uid만 넘긴다. 지갑 키와 가스 충전은 체인 모듈 안에서 처리한다.

```ts
createWallet(uid: string): Promise<{ address: string }>
mintTicket(p: { toUid: string; eventId: string; faceValue: number }): Promise<{ tokenId: string; txHash: string }>
listTicket(p: { ownerUid: string; tokenId: string; price: number }): Promise<{ txHash: string }>
cancelListing(p: { ownerUid: string; tokenId: string }): Promise<{ txHash: string }>
buyTicket(p: { buyerUid: string; tokenId: string }): Promise<{ txHash: string }>
markUsed(tokenId: string): Promise<{ txHash: string }>
```

- **오류**: 실패하면 `ChainError`를 던진다. 코드는 `OVER_FACE_VALUE`, `NOT_LISTED`, `INSUFFICIENT_FUNDS`, `TX_FAILED` 중 하나다.
- **tokenId**: uint256은 JS 숫자 범위를 넘을 수 있어 문자열로 주고받는다.
- **지갑**: 개인키는 Secret Manager의 마스터 키로 암호화해 `walletKeys/{uid}`에 저장한다. 이 컬렉션은 체인 모듈만 읽는다.
- **가스와 대금**: `buyTicket` 전에 펀딩 지갑이 구매자 지갑에 대금과 가스를 충전한다.

| 동작 | 순서 | 이유 |
| --- | --- | --- |
| `mintTicket`, `markUsed` | Firestore 먼저, 체인은 나중에 재시도 | 체인이 느리거나 실패해도 발급·검표가 멈추지 않게 |
| `listTicket`, `buyTicket` | 체인 성공 후 Firestore 반영 | 정가 규칙을 컨트랙트가 보장하므로 체인 결과가 기준 |

정해야 할 것:
- 원 ↔ 테스트 코인 환산 비율: Firestore의 정가는 원 단위이고 온체인 대금은 POL이다. 데모용 고정 비율을 정한다 (예: 10,000원 = 0.01 POL).
- eventId의 온체인 표현: Firestore 문서 ID(문자열)를 `keccak256`으로 바꾼 `bytes32` 사용 추천
