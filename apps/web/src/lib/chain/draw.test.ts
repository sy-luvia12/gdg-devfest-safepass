import { describe, expect, it } from 'vitest';
import deployed from '../../../../../contracts/deployments/draw-demo.baseSepolia.json';
import vectors from '../../../../../contracts/test/vectors/draw.json';
import demo from './demo-draw.json';
import { checkMyDraw, commitmentOf, leafOf, recomputeWinners, scoreOf, ticketsHashOf, verifyProof } from './draw';
import { DEMO_DRAW } from './live';
import type { ChainDraw } from './types';

const onChain: ChainDraw = { commitment: demo.commitment, seedBlock: String(demo.seedBlock), seed: demo.seed, commitTx: demo.commitTx, seedTx: demo.seedTx };

describe('browser draw check reproduces the server vectors (contracts/test/vectors/draw.json)', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const { input, expected } = c;
      expect(ticketsHashOf(input.tokenIds)).toBe(expected.ticketsHash);
      expect(commitmentOf(expected.eventKey, input.round, expected.root, expected.ticketsHash)).toBe(expected.commitment);
      input.entries.forEach((e, i) => {
        const want = expected.perEntry[i];
        expect(leafOf(expected.eventKey, input.round, e.uid, e.salt)).toBe(want.leaf);
        expect(verifyProof(want.leaf, want.proof, expected.root)).toBe(true);
        expect(scoreOf(input.seed, want.leaf).toString()).toBe(want.score);
      });
      expect(recomputeWinners({ seed: input.seed, leaves: [...expected.leaves].reverse(), tokenIds: input.tokenIds })).toEqual(expected.winners);
    });
  }
});

describe('S7 check on the Base Sepolia demo round', () => {
  it('the bundled copy equals contracts/deployments/draw-demo.baseSepolia.json', () => {
    expect(demo).toEqual(deployed);
  });

  it('passes for every demo entrant against the on-chain commitment and seed', () => {
    for (const entry of DEMO_DRAW.entries) {
      const r = checkMyDraw(entry, onChain);
      expect(r).toMatchObject({ included: true, commitmentMatches: true, seeded: true, ok: true });
      expect(r.myScore).toBe(demo.entries.find((e) => e.uid === entry.uid)!.score);
    }
    expect(recomputeWinners({ seed: demo.seed, leaves: DEMO_DRAW.leaves, tokenIds: DEMO_DRAW.tokenIds })).toEqual(demo.winners);
  });

  it('fails when the salt, the proof, the ticket set or the chain value does not match', () => {
    const e = DEMO_DRAW.entries[0];
    expect(checkMyDraw({ ...e, salt: DEMO_DRAW.entries[1].salt }, onChain).included).toBe(false);
    expect(checkMyDraw({ ...e, proof: DEMO_DRAW.entries[1].proof }, onChain).included).toBe(false);
    expect(checkMyDraw({ ...e, tokenIds: [e.tokenIds[0]] }, onChain).commitmentMatches).toBe(false);
    expect(checkMyDraw(e, { ...onChain, commitment: `0x${'1'.repeat(64)}` }).ok).toBe(false);
    const notCommitted = checkMyDraw(e, null);
    expect(notCommitted).toMatchObject({ commitmentMatches: false, ok: false });
    const notSeeded = checkMyDraw(e, { ...onChain, seed: null });
    expect(notSeeded).toMatchObject({ included: true, commitmentMatches: true, seeded: false, myScore: null, ok: false });
  });
});
