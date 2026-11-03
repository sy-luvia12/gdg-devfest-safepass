import { HDNodeWallet } from 'ethers';
import { describe, expect, it } from 'vitest';
import { ChainError, redact, toChainError } from '../src/chain/client';
import { eventKeyOf, tokenIdOf } from '../src/chain/ids';
import { deriveAddress } from '../src/chain/wallets';

// A fixed test phrase (the standard Hardhat test mnemonic). Never used for real funds.
const PHRASE = 'test test test test test test test test test test test junk';

describe('chain ids', () => {
  it('derives the same keys as the contract README: keccak256 of the Firestore id', () => {
    expect(eventKeyOf('demo-festival')).toMatch(/^0x[0-9a-f]{64}$/);
    expect(eventKeyOf('demo-festival')).toBe(eventKeyOf('demo-festival'));
    expect(eventKeyOf('demo-festival')).not.toBe(eventKeyOf('koyon-football'));
  });

  it('token ids are decimal strings that can exceed the JS number range', () => {
    const id = tokenIdOf('abc');
    expect(id).toMatch(/^\d+$/);
    expect(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(tokenIdOf('abc')).toBe(id);
  });
});

describe('student wallets', () => {
  it('derives one stable address per index, matching the standard BIP-44 path', () => {
    const expected = HDNodeWallet.fromPhrase(PHRASE, undefined, "m/44'/60'/0'/0/3").address;
    expect(deriveAddress(PHRASE, 3)).toBe(expected);
    expect(deriveAddress(PHRASE, 3)).not.toBe(deriveAddress(PHRASE, 4));
  });

  it('refuses indexes outside the non-hardened range', () => {
    expect(() => deriveAddress(PHRASE, -1)).toThrow(RangeError);
    expect(() => deriveAddress(PHRASE, 2 ** 31)).toThrow(RangeError);
    expect(() => deriveAddress(PHRASE, 1.5)).toThrow(RangeError);
  });
});

describe('chain error redaction', () => {
  const KEY_URL = 'https://polygon-amoy.g.alchemy.com/v2/SECRET_API_KEY_123';

  it('cuts every URL out of a message, so the RPC API key never reaches chainOps or logs', () => {
    const out = redact(`request failed (requestUrl="${KEY_URL}", other=wss://x.example/abc)`);
    expect(out).not.toContain('SECRET_API_KEY_123');
    expect(out).not.toContain('alchemy.com');
    expect(out).toContain('[url]');
  });

  it('keeps transaction hashes, which are public and needed to debug', () => {
    const hash = `0x${'ab'.repeat(32)}`;
    expect(redact(`transaction ${hash} failed`)).toContain(hash);
  });

  it('turns an ethers error into a short TX_FAILED without the URL', () => {
    const e = Object.assign(new Error(`could not detect network (url=${KEY_URL})`), {
      code: 'NETWORK_ERROR',
      shortMessage: 'could not detect network',
    });
    const c = toChainError(e);
    expect(c).toBeInstanceOf(ChainError);
    expect(c.code).toBe('TX_FAILED');
    expect(c.message).toBe('NETWORK_ERROR: could not detect network');
    expect(toChainError(new Error(`boom ${KEY_URL}`)).message).toBe('boom [url]');
  });

  it('maps a funds error by code or by message', () => {
    expect(toChainError(new Error("Sender doesn't have enough funds to send tx")).code).toBe('INSUFFICIENT_FUNDS');
  });
});
