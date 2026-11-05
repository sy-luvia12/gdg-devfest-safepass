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
