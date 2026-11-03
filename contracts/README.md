# contracts

SafePass 입장권 컨트랙트 `FestivalTicket` (ERC-721, OpenZeppelin 5.6.1, Hardhat 2).

## 표준
- ERC-721 + **ERC-5192 (Minimal Soulbound NFTs, Final)**.
  - 모든 입장권은 `locked() == true`이고, 발급 때 `Locked` 이벤트가 나간다.
  - `supportsInterface(0xb45a3c0e) == true`라서 지갑·익스플로러가 양도 불가 토큰으로 인식한다.
  - 표준이 막는 것은 ERC-721 전송 함수다. 운영자의 `reassign`은 별도 함수이고, 사유 코드 이벤트가 남는다.

## 규칙 (배포 후 바꿀 수 없음)
- 서버 발급 지갑(MINTER_ROLE)만 입장권을 발급·이동·소각한다. 학생 간 `transferFrom`, `approve`는 모두 revert.
- 행사 정원은 `createEvent(eventKey, capacity)` 때 고정되고, 활성 입장권 수가 정원을 넘을 수 없다.
- 재배정(`reassign`)과 회수(`release`)는 사유 코드를 이벤트로 남긴다: 1 대기 순서, 2 무작위, 3 대기자 없음, 4 운영진 회수.
- 입장 처리(`markUsed`)된 입장권은 더 이상 옮기거나 소각할 수 없다.
- 프록시가 없어 업그레이드할 수 없다.

## 식별자
- `eventKey = keccak256(utf8(eventId))` (Firestore 행사 문서 ID)
- `tokenId = uint256(keccak256(utf8(ticketId)))` (Firestore 입장권 문서 ID). 같은 입장권을 두 번 발급하면 revert되므로 재시도가 안전하다.

## 명령
```bash
npm --prefix contracts ci
npm --prefix contracts test               # 컨트랙트 테스트
npm --prefix contracts run node           # 로컬 체인 (chainId 31337, http://127.0.0.1:8545)
npm --prefix contracts run deploy:local   # 로컬 배포 → deployments/localhost.json (커밋 안 함)
AMOY_RPC_URL=... MINTER_PRIVATE_KEY=... npm --prefix contracts run deploy:amoy   # → deployments/amoy.json
```
키는 환경 변수로만 넘기고 커밋하지 않는다. 백엔드가 부르는 체인 모듈 약속은 `docs/api.md` 8장.
