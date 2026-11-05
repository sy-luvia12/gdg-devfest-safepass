import { Contract, isError, JsonRpcProvider, Wallet, type ContractTransactionResponse } from 'ethers';
import { FESTIVAL_TICKET_ABI } from './abi';
import { eventKeyOf, tokenIdOf, type Reason } from './ids';

// SEED_EXPIRED: a lottery round's seed block hash is gone (over 256 blocks); the round is void, never re-committed.
export type ChainErrorCode = 'INSUFFICIENT_FUNDS' | 'TX_FAILED' | 'SEED_EXPIRED';

export class ChainError extends Error {
  constructor(
    readonly code: ChainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

/** txHash is null when the chain already had the result, so the step was skipped (a safe retry). */
export interface ChainResult {
  txHash: string | null;
}

export interface ChainClient {
  ensureEvent(eventId: string, capacity: number): Promise<ChainResult>;
  mint(p: { ticketId: string; eventId: string; to: string }): Promise<ChainResult & { tokenId: string }>;
  reassign(p: { ticketId: string; to: string; reason: Reason }): Promise<ChainResult>;
  release(p: { ticketId: string; reason: Reason }): Promise<ChainResult>;
  markUsed(ticketId: string): Promise<ChainResult>;
  /** Commits a lottery round (when not already committed), waits for its seed block and stores the seed. Safe to repeat. */
  drawRound(p: { eventId: string; round: number; commitment: string }): Promise<DrawRoundResult>;
  /** Opens a student's entry (when not already open), waits for its seed block and settles it. Safe to repeat. */
  drawEntry(p: { eventId: string; entryId: string; winBps: number }): Promise<DrawEntryResult>;
}

export interface DrawEntryResult {
  won: boolean;
  seed: string;
  score: number;
  seedBlock: number;
  openTx: string | null;
  settleTx: string | null;
}

export interface DrawRoundResult {
  seed: string;
  seedBlock: number;
  commitTx: string | null;
  seedTx: string | null;
}

const ZERO_HASH = `0x${'0'.repeat(64)}`;
const BLOCKHASH_WINDOW = 256;

export interface ChainConfig {
  rpcUrl: string;
  contractAddress: string;
  minterPrivateKey: string;
}

export function createChainClient(cfg: ChainConfig): ChainClient {
  // cacheTimeout -1: ethers otherwise reuses an identical RPC answer for 250 ms, so two transactions sent
  // back to back read the same nonce and the second fails with "nonce too low".
  const provider = new JsonRpcProvider(cfg.rpcUrl, undefined, { cacheTimeout: -1 });
  const signer = new Wallet(cfg.minterPrivateKey, provider);
  const ticket = new Contract(cfg.contractAddress, FESTIVAL_TICKET_ABI, signer);

  // Each step checks the chain first. A retry after a lost receipt then finds the work done.
  const ownerOf = async (tokenId: string): Promise<string | null> => {
    try {
      return (await ticket.ownerOf(tokenId)) as string;
    } catch (e) {
      if (isError(e, 'CALL_EXCEPTION') && e.revert?.name === 'ERC721NonexistentToken') return null;
      throw toChainError(e);
    }
  };

  const send = async (call: () => Promise<ContractTransactionResponse>): Promise<string> => {
    try {
      const tx = await call();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new ChainError('TX_FAILED', `transaction ${tx.hash} failed`);
      return tx.hash;
    } catch (e) {
      throw toChainError(e);
    }
  };

  return {
    async ensureEvent(eventId, capacity) {
      const key = eventKeyOf(eventId);
      const [, , exists] = (await ticket.eventInfo(key)) as [bigint, bigint, boolean];
      if (exists) return { txHash: null };
      return { txHash: await send(() => ticket.createEvent(key, capacity)) };
    },
    async mint({ ticketId, eventId, to }) {
      const tokenId = tokenIdOf(ticketId);
      if (await ownerOf(tokenId)) return { tokenId, txHash: null };
      return { tokenId, txHash: await send(() => ticket.mint(to, tokenId, eventKeyOf(eventId))) };
    },
    async reassign({ ticketId, to, reason }) {
      const tokenId = tokenIdOf(ticketId);
      const owner = await ownerOf(tokenId);
      if (owner && owner.toLowerCase() === to.toLowerCase()) return { txHash: null };
      return { txHash: await send(() => ticket.reassign(tokenId, to, reason)) };
    },
    async release({ ticketId, reason }) {
      const tokenId = tokenIdOf(ticketId);
      if (!(await ownerOf(tokenId))) return { txHash: null };
      return { txHash: await send(() => ticket.release(tokenId, reason)) };
    },
    async markUsed(ticketId) {
      const tokenId = tokenIdOf(ticketId);
      if ((await ticket.isUsed(tokenId)) as boolean) return { txHash: null };
      return { txHash: await send(() => ticket.markUsed(tokenId)) };
    },
    async drawRound({ eventId, round, commitment }) {
      const key = eventKeyOf(eventId);
      const read = async () => {
        const [c, b, s] = (await ticket.draws(key, round)) as [string, bigint, string];
        return { commitment: c, seedBlock: Number(b), seed: s };
      };
      let d = await read();
      let commitTx: string | null = null;
      let seedTx: string | null = null;
      if (d.seed !== ZERO_HASH) {
        if (d.commitment !== commitment) throw new ChainError('TX_FAILED', `round ${round} is seeded with another commitment`);
        return { seed: d.seed, seedBlock: d.seedBlock, commitTx, seedTx };
      }
      if (d.commitment === ZERO_HASH) {
        commitTx = await send(() => ticket.commitDraw(key, round, commitment));
        d = await read();
      } else if (d.commitment !== commitment) {
        throw new ChainError('TX_FAILED', `round ${round} is committed with another commitment`);
      } else if ((await provider.getBlockNumber()) > d.seedBlock + BLOCKHASH_WINDOW) {
        // Never re-commit: that would be a second seed for the same round.
        throw new ChainError('SEED_EXPIRED', `round ${round} missed its seed window`);
      }
      // SEED_DELAY is 5 blocks (about 10 s on Base Sepolia). Polling stays well inside a function timeout.
      for (let i = 0; i < 120 && (await provider.getBlockNumber()) <= d.seedBlock; i++) await new Promise((r) => setTimeout(r, 1000));
      seedTx = await send(() => ticket.seedDraw(key, round));
      d = await read();
      return { seed: d.seed, seedBlock: d.seedBlock, commitTx, seedTx };
    },
    async drawEntry({ eventId, entryId, winBps }) {
      const key = eventKeyOf(eventId);
      let openTx: string | null = null;
      const read = async () => {
        const [b, bps, result] = (await ticket.entries(key, entryId)) as [bigint, bigint, bigint];
        return { seedBlock: Number(b), winBps: Number(bps), result: Number(result) };
      };
      // The settled result, read back from the EntrySettled event (the contract keeps only won/lost).
      const settled = async (seedBlock: number, settleTx: string | null): Promise<DrawEntryResult> => {
        const logs = await ticket.queryFilter(ticket.filters.EntrySettled(key, entryId), seedBlock);
        const log = logs.at(-1) as { args: { seed: string; score: bigint; won: boolean }; transactionHash: string } | undefined;
        if (!log) throw new ChainError('TX_FAILED', 'entry settled but its EntrySettled event was not found');
        return { won: log.args.won, seed: log.args.seed, score: Number(log.args.score), seedBlock, openTx, settleTx: settleTx ?? log.transactionHash };
      };
      let e = await read();
      if (e.result !== 0) return settled(e.seedBlock, null);
      const expired = e.seedBlock !== 0 && (await provider.getBlockNumber()) > e.seedBlock + BLOCKHASH_WINDOW;
      if (e.seedBlock === 0 || expired) {
        // A reopen after an expired seed leaves a second EntryOpened event, so a retry is always visible.
        openTx = await send(() => ticket.openEntry(key, entryId, winBps));
        e = await read();
      } else if (e.winBps !== winBps) {
        throw new ChainError('TX_FAILED', 'entry is open with another win rate');
      }
      for (let i = 0; i < 120 && (await provider.getBlockNumber()) <= e.seedBlock; i++) await new Promise((r) => setTimeout(r, 1000));
      const settleTx = await send(() => ticket.settleEntry(key, entryId));
      return settled(e.seedBlock, settleTx);
    },
  };
}

// RPC URLs carry the provider API key (e.g. Alchemy's /v2/<key>), and ethers puts the request URL in
// its messages. Chain errors are stored in chainOps and logged, so every URL is cut out first.
export function redact(message: string): string {
  return message.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, '[url]').slice(0, 500);
}

export function toChainError(e: unknown): ChainError {
  if (e instanceof ChainError) return e;
  const full = e instanceof Error ? e.message : String(e);
  // geth-style nodes give INSUFFICIENT_FUNDS; Hardhat and some RPC gateways only say it in the message.
  if (isError(e, 'INSUFFICIENT_FUNDS') || /insufficient funds|enough funds/i.test(full)) {
    return new ChainError('INSUFFICIENT_FUNDS', 'minter wallet has no gas');
  }
  // ethers' shortMessage leaves out the request and response payloads.
  const short = (e as { shortMessage?: unknown })?.shortMessage;
  const code = (e as { code?: unknown })?.code;
  const message = typeof short === 'string' ? `${typeof code === 'string' ? `${code}: ` : ''}${short}` : full;
  return new ChainError('TX_FAILED', redact(message));
}
