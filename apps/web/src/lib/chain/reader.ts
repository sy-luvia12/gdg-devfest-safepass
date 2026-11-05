import type { Address, Hex } from 'viem';
import { ACTION, CHAIN_EVENTS, FESTIVAL_TICKET_READ_ABI, REASON } from './abi';
import { eventKeyOf, tokenIdOf } from './ids';
import type { ChainDraw, ChainEntry, ChainEventStatus, ChainTicketStep } from './types';

// Reads FestivalTicket straight from the chain, without Firebase. Fetches every contract log from the deploy
// block once, then only new blocks. Fine for a demo-sized contract; a large deployment needs an indexer.

type DecodedLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
};

/** The parts of a viem PublicClient the reader uses (a fake one in tests). */
export interface ChainClientLike {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: { address: Address; events: typeof CHAIN_EVENTS; fromBlock: bigint; toBlock: bigint; strict: true }): Promise<DecodedLog[]>;
  readContract(args: { address: Address; abi: typeof FESTIVAL_TICKET_READ_ABI; functionName: string; args: readonly unknown[] }): Promise<unknown>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint; hash?: Hex | null }>;
}

export interface ChainReaderOptions {
  client: ChainClientLike;
  contract: Address;
  fromBlock: bigint;
  explorer: string;
  chunk?: bigint; // blocks per getLogs call (public RPCs cap the range)
}

const ZERO = `0x${'0'.repeat(64)}`;

export function createChainReader(o: ChainReaderOptions) {
  const chunk = o.chunk ?? 50_000n;
  const logs: DecodedLog[] = [];
  let next = o.fromBlock;
  let inFlight: Promise<DecodedLog[]> | null = null;
  const times = new Map<bigint, number>();

  async function sync(): Promise<DecodedLog[]> {
    const head = await o.client.getBlockNumber();
    while (next <= head) {
      const to = next + chunk - 1n < head ? next + chunk - 1n : head;
      const part = await o.client.getLogs({ address: o.contract, events: CHAIN_EVENTS, fromBlock: next, toBlock: to, strict: true });
      logs.push(...part);
      next = to + 1n;
    }
    return logs;
  }
  const allLogs = () => (inFlight ??= sync().finally(() => (inFlight = null)));
  const asOf = () => (next - 1n).toString();
  const sameToken = (tokenId: string) => (l: DecodedLog) => String(l.args.tokenId) === tokenId;

  async function timeOf(block: bigint): Promise<number> {
    const known = times.get(block);
    if (known !== undefined) return known;
    const at = Number((await o.client.getBlock({ blockNumber: block })).timestamp) * 1000;
    times.set(block, at);
    return at;
  }

  async function eventStatus(eventId: string): Promise<ChainEventStatus> {
    const key = eventKeyOf(eventId);
    const read = (functionName: string, args: readonly unknown[]) =>
      o.client.readContract({ address: o.contract, abi: FESTIVAL_TICKET_READ_ABI, functionName, args });
    const [info, all, stats, lost, refund, manual] = await Promise.all([
      read('eventInfo', [key]),
      allLogs(),
      read('entryStats', [key]),
      read('actionCount', [key, ACTION.LOST_REISSUE]),
      read('actionCount', [key, ACTION.REFUND]),
      read('actionCount', [key, ACTION.MANUAL_ENTRY]),
    ]);
    const [settled, won] = stats as [number, number];
    const [capacity, active, exists] = info as [number, number, boolean];
    const tokens = new Set(all.filter((l) => l.eventName === 'Issued' && l.args.eventKey === key).map((l) => String(l.args.tokenId)));
    const mine = all.filter((l) => tokens.has(String(l.args.tokenId)));
    const count = (name: string, reason?: number) =>
      mine.filter((l) => l.eventName === name && (reason === undefined || Number(l.args.reason) === reason)).length;
    return {
      exists,
      capacity: Number(capacity),
      active: Number(active),
      withinCapacity: Number(active) <= Number(capacity),
      issued: tokens.size,
      used: count('Used'),
      reassigned: { queue: count('Reassigned', REASON.CANCEL_QUEUE), lottery: count('Reassigned', REASON.CANCEL_RANDOM) },
      released: { noWaiter: count('Released', REASON.CANCEL_RELEASED), adminRevoke: count('Released', REASON.ADMIN_REVOKE) },
      drawRounds: new Set(all.filter((l) => l.eventName === 'DrawCommitted' && l.args.eventKey === key).map((l) => Number(l.args.round))).size,
      entries: { settled: Number(settled), won: Number(won) },
      actions: { lostReissue: Number(lost), refund: Number(refund), manualEntry: Number(manual) },
      asOfBlock: asOf(),
      contractUrl: `${o.explorer}/address/${o.contract}`,
    };
  }

  async function ticketHistory(ticketId: string): Promise<ChainTicketStep[]> {
    const tokenId = tokenIdOf(ticketId);
    const kinds: Record<string, ChainTicketStep['kind']> = { Issued: 'issued', Reassigned: 'reassigned', Released: 'released', Used: 'used' };
    const mine = (await allLogs())
      .filter((l) => l.eventName in kinds && sameToken(tokenId)(l))
      .sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0));
    return Promise.all(
      mine.map(async (l) => ({
        kind: kinds[l.eventName],
        ...(l.args.reason !== undefined ? { reason: Number(l.args.reason) } : {}),
        ...(l.eventName === 'Reassigned' ? { from: String(l.args.from) } : {}),
        ...(l.args.to !== undefined ? { to: String(l.args.to) } : {}),
        txHash: l.transactionHash ?? '',
        blockNumber: String(l.blockNumber ?? ''),
        at: l.blockNumber === null ? 0 : await timeOf(l.blockNumber),
        txUrl: `${o.explorer}/tx/${l.transactionHash}`,
      })),
    );
  }

  async function draw(eventId: string, round: number): Promise<ChainDraw | null> {
    const key = eventKeyOf(eventId);
    const [stored, all] = await Promise.all([
      o.client.readContract({ address: o.contract, abi: FESTIVAL_TICKET_READ_ABI, functionName: 'draws', args: [key, round] }),
      allLogs(),
    ]);
    const [commitment, seedBlock, seed] = stored as [Hex, bigint, Hex];
    if (commitment === ZERO) return null;
    const of = (name: string) =>
      all.filter((l) => l.eventName === name && l.args.eventKey === key && Number(l.args.round) === round).at(-1)?.transactionHash ?? null;
    return { commitment, seedBlock: seedBlock.toString(), seed: seed === ZERO ? null : seed, commitTx: of('DrawCommitted'), seedTx: of('DrawSeeded') };
  }

  /** One instant-draw entry: what the contract stored, and the seed and score from its EntrySettled event. */
  async function entry(eventId: string, entryId: string): Promise<ChainEntry | null> {
    const key = eventKeyOf(eventId);
    const [stored, all] = await Promise.all([
      o.client.readContract({ address: o.contract, abi: FESTIVAL_TICKET_READ_ABI, functionName: 'entries', args: [key, entryId] }),
      allLogs(),
    ]);
    const [seedBlock, winBps, result] = stored as [bigint, number, number];
    if (seedBlock === 0n) return null;
    const mine = (name: string) => all.filter((l) => l.eventName === name && l.args.eventKey === key && String(l.args.entryId).toLowerCase() === entryId.toLowerCase()).at(-1);
    const settled = mine('EntrySettled');
    return {
      seedBlock: Number(seedBlock),
      winBps: Number(winBps),
      result: Number(result) as 0 | 1 | 2,
      seed: settled ? String(settled.args.seed) : null,
      score: settled ? Number(settled.args.score) : null,
      openTx: mine('EntryOpened')?.transactionHash ?? null,
      settleTx: settled?.transactionHash ?? null,
    };
  }

  /** The block hash the seed must equal, read straight from the chain. */
  async function blockHash(block: number): Promise<string | null> {
    return (await o.client.getBlock({ blockNumber: BigInt(block) })).hash ?? null;
  }

  const txUrl = (hash: string) => `${o.explorer}/tx/${hash}`;
  const blockUrl = (block: number) => `${o.explorer}/block/${block}`;

  return { eventStatus, ticketHistory, draw, entry, blockHash, txUrl, blockUrl };
}

export type ChainReader = ReturnType<typeof createChainReader>;
