import { describe, expect, it } from 'vitest';
import { checkEntry, entryIdOf, formatRate, scoreOf, studentRefOf } from './entry';
import type { ChainEntry } from './types';

// Values computed by the server (functions/src/domain/entryDraw.ts, ethers). The browser must agree byte for byte.
const EVENT = 'korea-koyon-basketball';
const SALT = `0x${'11'.repeat(32)}`;
const SEED = `0x${'ab'.repeat(32)}`;
const REF = '0xa2566b0b4a0f80d0ed97d544dc8b432ffb69a5fa3e44bae48a9915735497bcaf';
const ID = '0x7545ed99a0c5ca8c8a10741df4f5516a014b96e1bbfb208562fe2bb466aff219';
const SCORE = 3553;

const mine = (winBps: number) => ({ eventId: EVENT, studentRef: REF, salt: SALT, entryId: ID, winBps });
const onChain = (p: Partial<ChainEntry>): ChainEntry => ({
  seedBlock: 100,
  winBps: 5000,
  result: 1,
  seed: SEED,
  score: SCORE,
  openTx: null,
  settleTx: null,
  ...p,
});

describe('instant draw formulas', () => {
  it('match the server', () => {
    expect(studentRefOf('korea', '2024123456')).toBe(REF);
    expect(entryIdOf(EVENT, REF, SALT)).toBe(ID);
    expect(scoreOf(SEED, ID)).toBe(SCORE);
  });

  it('formats the rate', () => {
    expect(formatRate(2500)).toBe('25%');
    expect(formatRate(6315)).toBe('63%');
    expect(formatRate(30)).toBe('0.3%');
    expect(formatRate(10_000)).toBe('100%');
  });
});

describe('checkEntry', () => {
  it('passes when everything recomputes', () => {
    const c = checkEntry(mine(5000), onChain({}), SEED);
    expect(c).toMatchObject({ ok: true, score: SCORE, won: true, capacityFull: false });
  });

  it('accepts an in-range loss only as a full event', () => {
    expect(checkEntry(mine(5000), onChain({ result: 2 }), SEED)).toMatchObject({ ok: true, capacityFull: true, won: false });
    // Out of range and marked won: the chain answer contradicts the formula
    expect(checkEntry(mine(3000), onChain({ winBps: 3000, result: 1 }), SEED).ok).toBe(false);
  });

  it('catches a different seed, a changed rate, a wrong salt or no result yet', () => {
    expect(checkEntry(mine(5000), onChain({}), `0x${'cd'.repeat(32)}`)).toMatchObject({ ok: false, seedMatches: false });
    expect(checkEntry(mine(4000), onChain({}), SEED)).toMatchObject({ ok: false, rateMatches: false });
    expect(checkEntry({ ...mine(5000), salt: `0x${'22'.repeat(32)}` }, onChain({}), SEED)).toMatchObject({ ok: false, entryIdMatches: false });
    expect(checkEntry(mine(5000), onChain({ result: 0, seed: null, score: null }), null)).toMatchObject({ ok: false, onChain: false });
    expect(checkEntry(mine(5000), null, null).ok).toBe(false);
  });
});
