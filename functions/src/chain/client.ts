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
}

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
  };
}

function toChainError(e: unknown): ChainError {
  if (e instanceof ChainError) return e;
  // geth-style nodes give INSUFFICIENT_FUNDS; Hardhat and some RPC gateways only say it in the message.
  const message = e instanceof Error ? e.message : String(e);
  if (isError(e, 'INSUFFICIENT_FUNDS') || /insufficient funds|enough funds/i.test(message)) {
    return new ChainError('INSUFFICIENT_FUNDS', 'minter wallet has no gas');
  }
  return new ChainError('TX_FAILED', message);
}
