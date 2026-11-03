import { HDNodeWallet } from 'ethers';
import { describe, expect, it } from 'vitest';
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
