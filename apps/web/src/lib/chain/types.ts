/** 체인에서 직접 읽은 행사 현황 (S8 공개 현황판). 서버 기록과 섞지 않는다 */
export type ChainEventStatus = {
  exists: boolean;
  capacity: number;
  active: number; // 발급되고 회수되지 않은 표 (컨트랙트가 정원 이하로 강제)
  withinCapacity: boolean;
  issued: number;
  used: number;
  reassigned: { queue: number; lottery: number };
  released: { noWaiter: number; adminRevoke: number };
  drawRounds: number;
  /** 즉석 추첨: 결과가 난 응모 수와 당첨 수 (컨트랙트 entryStats) */
  entries: { settled: number; won: number };
  /** 입장권을 옮기지 않는 운영진 개입 (컨트랙트 actionCount) */
  actions: { lostReissue: number; refund: number; manualEntry: number };
  asOfBlock: string;
  contractUrl: string;
};

/** 입장권 하나의 체인 기록 한 줄 */
export type ChainTicketStep = {
  kind: 'issued' | 'reassigned' | 'released' | 'used';
  reason?: number; // 1 대기 순서, 2 추첨, 3 대기자 없음, 4 운영진 회수
  from?: string;
  to?: string;
  txHash: string;
  blockNumber: string;
  at: number; // ms
  txUrl: string;
};

/** 추첨 회차의 체인 기록 */
export type ChainDraw = {
  commitment: string;
  seedBlock: string;
  seed: string | null; // seedDraw 전이면 null
  commitTx: string | null;
  seedTx: string | null;
};

/** 학생이 받는 자기 응모 정보 (salt는 본인만) */
export type MyDrawEntry = {
  eventId: string;
  round: number;
  uid: string;
  salt: string;
  proof: string[];
  root: string;
  tokenIds: string[];
};

/** 공연 전 검증 결과: 대기 인원은 드러나지 않는다 */
export type DrawCheck = {
  leaf: string;
  included: boolean; // 내 응모가 스냅샷에 들어 있다
  commitmentMatches: boolean; // 스냅샷이 체인에 올린 값과 같다
  seeded: boolean;
  seed: string | null;
  myScore: string | null; // 낮을수록 먼저 당첨
  ok: boolean;
};

/** 즉석 추첨 응모 하나의 체인 기록. result 0 결과 전, 1 당첨, 2 낙첨 */
export type ChainEntry = {
  seedBlock: number;
  winBps: number;
  result: 0 | 1 | 2;
  seed: string | null; // EntrySettled의 시드 (= seedBlock의 블록 해시)
  score: number | null;
  openTx: string | null;
  settleTx: string | null;
};

/** "다시 검증하기": 내 폰에서 다시 계산한 결과 */
export type EntryCheck = {
  entryIdMatches: boolean; // (행사, 학생, salt)로 다시 만든 응모 번호가 체인의 응모와 같다
  onChain: boolean; // 체인에 응모가 있고 결과가 났다
  rateMatches: boolean; // 체인에 고정된 당첨 확률이 안내받은 확률과 같다
  seedMatches: boolean; // 시드가 그 블록의 해시와 같다
  score: number | null; // 다시 계산한 점수
  scoreMatches: boolean;
  won: boolean | null; // 체인이 정한 결과
  resultMatches: boolean; // 다시 계산한 결과(점수 < 확률)가 체인 결과와 같다 (정원이 찬 뒤의 낙첨은 예외로 표시)
  capacityFull: boolean; // 점수는 당첨 범위인데 정원이 차서 낙첨
  ok: boolean;
};

/** verifyMyEntry 결과: 체인 기록, 다시 계산한 결과, 익스플로러 링크 */
export type EntryVerification = {
  chain: ChainEntry | null;
  check: EntryCheck;
  links: { open: string | null; settle: string | null; block: string | null };
};
