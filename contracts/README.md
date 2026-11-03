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
```

## Amoy 배포 런북
키는 저장소 밖 JSON 파일(`{"address","privateKey"}`, 권한 600)에 두고 `MINTER_KEY_FILE`로 경로만 넘긴다. `scripts/amoy.sh`가 키를 환경 변수로만 옮기므로 명령줄, 셸 기록, 출력, `bash -x` trace 어디에도 키가 찍히지 않는다. RPC 기본값은 `https://polygon-amoy-bor-rpc.publicnode.com`이고 `AMOY_RPC_URL`로 바꿀 수 있다.

```bash
export MINTER_KEY_FILE=/path/outside/repo/minter.json
contracts/scripts/amoy.sh preflight   # 읽기 전용: 잔고, 가스 가격, 배포비, 감당 가능한 티켓 수. 배포비가 모자라면 exit 1
contracts/scripts/amoy.sh deploy      # preflight 통과 후 배포 → deployments/amoy.json (커밋한다)
contracts/scripts/amoy.sh verify      # 소스 검증. 기본은 Sourcify(키 불필요), ETHERSCAN_API_KEY가 있으면 Polygonscan도
```

가스 예산(`scripts/budget.js`, Hardhat에서 측정한 가스 단위):

| 작업 | 가스 | 30 gwei일 때 POL |
|---|---|---|
| 배포 | 1,671,939 | 0.0502 |
| createEvent | 48,572 | 0.0015 |
| mint | 102,881 | 0.0031 |
| markUsed | 49,649 | 0.0015 |
| reassign | 62,001 | 0.0019 |
| release | 41,419 | 0.0012 |

티켓 1장(발급+입장)은 약 0.0046 POL이다. 0.1 POL이면 배포와 행사 1개 생성 후 약 10장을 처리한다. `test/budget.test.js`가 가스를 다시 재서 5% 넘게 달라지면 실패하므로, 컨트랙트를 고치면 표와 `GAS` 상수를 같이 고친다.

키는 커밋하지 않는다. 백엔드가 부르는 체인 모듈 약속은 `docs/api.md` 8장.
