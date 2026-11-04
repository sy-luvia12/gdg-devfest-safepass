import { createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CHAIN_CONTRACT } from '@/app/config';
import { ApiError, type TicketHistoryItem } from '@/types';
import demo from './demo-draw.json';
import { checkMyDraw } from './draw';
import { createChainReader, type ChainClientLike, type ChainReader } from './reader';
import type { ChainDraw, ChainEventStatus, DrawCheck, MyDrawEntry } from './types';

// The deployed contract and where its logs start (contracts/deployments/baseSepolia.json, deploy tx block).
const BASE_SEPOLIA_CONTRACT = '0x577aDF622034aBE56a4dE0792EDBFCe1d1c6A5fE';
const BASE_SEPOLIA_DEPLOY_BLOCK = 54203696n;
const RPC = import.meta.env.VITE_CHAIN_RPC || 'https://base-sepolia-rpc.publicnode.com';
const FROM_BLOCK = import.meta.env.VITE_CHAIN_FROM_BLOCK ? BigInt(import.meta.env.VITE_CHAIN_FROM_BLOCK) : BASE_SEPOLIA_DEPLOY_BLOCK;
// The reader builds explorer links itself, so it does not inherit the Amoy default of VITE_CHAIN_EXPLORER.
const EXPLORER = import.meta.env.VITE_CHAIN_EXPLORER || 'https://base-sepolia.blockscout.com';

let reader: ChainReader | null = null;
const live = (): ChainReader =>
  (reader ??= createChainReader({
    client: createPublicClient({ chain: baseSepolia, transport: http(RPC) }) as unknown as ChainClientLike,
    contract: (CHAIN_CONTRACT || BASE_SEPOLIA_CONTRACT) as Address,
    fromBlock: FROM_BLOCK,
    explorer: EXPLORER,
  }));

async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('chain_unavailable');
  }
}

export const getChainEventStatus = (eventId: string): Promise<ChainEventStatus> => guard(() => live().eventStatus(eventId));
export const getChainDraw = (eventId: string, round: number): Promise<ChainDraw | null> => guard(() => live().draw(eventId, round));
export const verifyMyDraw = async (entry: MyDrawEntry): Promise<DrawCheck> =>
  checkMyDraw(entry, await getChainDraw(entry.eventId, entry.round));

const REASON_TEXT: Record<number, string> = { 1: '대기 순서로 배정', 2: '추첨으로 배정', 3: '대기자 없음', 4: '운영진 회수' };

/** 내 입장권 기록 (S9). 체인 기록만 쓴다. 회수(released)는 현재 주인 화면에 나오지 않는다 */
export async function getChainTicketHistory(ticketId: string): Promise<TicketHistoryItem[]> {
  const steps = await guard(() => live().ticketHistory(ticketId));
  return steps
    .filter((s) => s.kind !== 'released')
    .map((s) => ({
      type: s.kind as TicketHistoryItem['type'],
      at: s.at,
      detail: s.kind === 'issued' ? '입장권 발급 (체인 기록)' : s.kind === 'used' ? '입장 확인 (체인 기록)' : `취소표 ${REASON_TEXT[s.reason ?? 0] ?? '배정'}`,
      txHash: s.txHash,
    }));
}

/** S7 데모용 회차: Base Sepolia에서 실제로 돌린 회차, 가짜 응모자 10명 (contracts/deployments/draw-demo.baseSepolia.json) */
export const DEMO_DRAW = {
  eventId: demo.eventId,
  round: demo.round,
  commitTx: demo.commitTx,
  seedTx: demo.seedTx,
  entries: demo.entries.map(
    (e): MyDrawEntry => ({ eventId: demo.eventId, round: demo.round, uid: e.uid, salt: e.salt, proof: e.proof, root: demo.root, tokenIds: demo.tokenIds }),
  ),
  winners: demo.winners,
  leaves: demo.leaves,
  tokenIds: demo.tokenIds,
};
