import { describe, expect, it } from 'vitest';
import demo from './demo-draw.json';
import { DEMO_DRAW, getChainDraw, getChainEventStatus, verifyMyDraw } from './live';

// Reads the real Base Sepolia contract. Run with VITE_CHAIN_LIVE=1 npm test (needs network).
describe.runIf(import.meta.env.VITE_CHAIN_LIVE === '1')('live Base Sepolia', () => {
  it('finds the demo round, and every demo entrant verifies against it', async () => {
    const d = await getChainDraw(demo.eventId, demo.round);
    expect(d).toEqual({ commitment: demo.commitment, seedBlock: String(demo.seedBlock), seed: demo.seed, commitTx: demo.commitTx, seedTx: demo.seedTx });
    for (const e of DEMO_DRAW.entries) expect((await verifyMyDraw(e)).ok).toBe(true);
  }, 60_000);

  it('reads the demo event straight from the contract', async () => {
    const s = await getChainEventStatus(demo.eventId);
    expect(s).toMatchObject({ exists: true, capacity: 100, active: 0, issued: 0, drawRounds: 1, withinCapacity: true });
  }, 60_000);
});
