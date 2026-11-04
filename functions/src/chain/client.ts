import { Contract, isError, JsonRpcProvider, Wallet, type ContractTransactionResponse } from 'ethers';
import { FESTIVAL_TICKET_ABI } from './abi';
import { eventKeyOf, tokenIdOf, type Reason } from './ids';

export type ChainErrorCode = 'INSUFFICIENT_FUNDS' | 'TX_FAILED';

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
      const head = await provider.getBlockNumber();
      const expired = d.commitment !== ZERO_HASH && head > d.seedBlock + BLOCKHASH_WINDOW;
      if (d.commitment === ZERO_HASH || expired) {
        commitTx = await send(() => ticket.commitDraw(key, round, commitment));
        d = await read();
      } else if (d.commitment !== commitment) {
        throw new ChainError('TX_FAILED', `round ${round} is committed with another commitment`);
      }
      // SEED_DELAY is 5 blocks (about 10 s on Base Sepolia). Polling stays well inside a function timeout.
      for (let i = 0; i < 120 && (await provider.getBlockNumber()) <= d.seedBlock; i++) await new Promise((r) => setTimeout(r, 1000));
      seedTx = await send(() => ticket.seedDraw(key, round));
      d = await read();
      return { seed: d.seed, seedBlock: d.seedBlock, commitTx, seedTx };
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
