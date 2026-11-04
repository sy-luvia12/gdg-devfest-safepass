import { readFileSync } from 'node:fs';
import { id as hashText } from 'ethers';
import { describe, expect, it } from 'vitest';
import { eventKeyOf, tokenIdOf } from '../src/chain/ids';
import {
  buildSnapshot,
  commitmentOf,
  drawWinners,
  leafOf,
  merkleProof,
  merkleRoot,
  newSalt,
  scoreOf,
  ticketsHashOf,
  verifyProof,
} from '../src/lottery/draw';
import { buildVectors, VECTORS_PATH } from '../scripts/draw-vectors';

const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, salt: hashText(`s${i}`) }));
const tickets = (n: number) => Array.from({ length: n }, (_, i) => tokenIdOf(`t${i}`));
const SEED = hashText('seed');

describe('lottery vectors', () => {
  it('the committed vector file matches this implementation (regenerate with scripts/draw-vectors.ts --write)', () => {
    expect(JSON.parse(readFileSync(VECTORS_PATH, 'utf8'))).toEqual(JSON.parse(JSON.stringify(buildVectors())));
  });
});

describe('snapshot', () => {
  it('every entry proves its membership against the root, and only its own leaf does', () => {
    const snap = buildSnapshot({ eventId: 'ev', round: 1, entries: entries(9), tokenIds: tickets(2) });
    for (const leaf of snap.leaves) expect(verifyProof(leaf, merkleProof(snap.leaves, leaf), snap.root)).toBe(true);
    const outsider = leafOf(snap.eventKey, 1, 'stranger', hashText('x'));
    expect(verifyProof(outsider, merkleProof(snap.leaves, snap.leaves[0]), snap.root)).toBe(false);
    expect(() => merkleProof(snap.leaves, outsider)).toThrow(RangeError);
  });

  it('is independent of input order', () => {
    const a = buildSnapshot({ eventId: 'ev', round: 3, entries: entries(5), tokenIds: tickets(3) });
    const b = buildSnapshot({ eventId: 'ev', round: 3, entries: entries(5).reverse(), tokenIds: tickets(3).reverse() });
    expect(b).toEqual(a);
  });

  it('binds the event, the round and the ticket set into the commitment', () => {
    const base = { entries: entries(4), tokenIds: tickets(2) };
    const c = buildSnapshot({ eventId: 'ev', round: 1, ...base }).commitment;
    expect(buildSnapshot({ eventId: 'ev2', round: 1, ...base }).commitment).not.toBe(c);
    expect(buildSnapshot({ eventId: 'ev', round: 2, ...base }).commitment).not.toBe(c);
    expect(buildSnapshot({ eventId: 'ev', round: 1, entries: base.entries, tokenIds: tickets(3) }).commitment).not.toBe(c);
    const snap = buildSnapshot({ eventId: 'ev', round: 1, ...base });
    expect(commitmentOf(snap.eventKey, 1, snap.root, ticketsHashOf(base.tokenIds))).toBe(c);
  });

  it('the salt hides the uid: same uid, different salt, different leaf', () => {
    const key = eventKeyOf('ev');
    expect(leafOf(key, 1, 'u', newSalt())).not.toBe(leafOf(key, 1, 'u', newSalt()));
    expect(newSalt()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('refuses empty, duplicate and malformed input', () => {
    expect(() => buildSnapshot({ eventId: 'ev', round: 1, entries: [], tokenIds: tickets(1) })).toThrow(RangeError);
    expect(() => buildSnapshot({ eventId: 'ev', round: 1, entries: entries(1), tokenIds: [] })).toThrow(RangeError);
    const dup = [entries(1)[0], { uid: 'u0', salt: hashText('other') }];
    expect(() => buildSnapshot({ eventId: 'ev', round: 1, entries: dup, tokenIds: tickets(1) })).toThrow(RangeError);
    expect(() => buildSnapshot({ eventId: 'ev', round: 1, entries: entries(1), tokenIds: [tickets(1)[0], tickets(1)[0]] })).toThrow(RangeError);
    expect(() => leafOf(eventKeyOf('ev'), 1, 'u', '0x1234')).toThrow(TypeError);
    expect(() => leafOf(eventKeyOf('ev'), -1, 'u', hashText('s'))).toThrow(RangeError);
    expect(() => leafOf(eventKeyOf('ev'), 2 ** 32, 'u', hashText('s'))).toThrow(RangeError);
  });

  it('a single leaf is its own root with an empty proof', () => {
    const leaf = leafOf(eventKeyOf('ev'), 0, 'solo', hashText('s'));
    expect(merkleRoot([leaf])).toBe(leaf);
    expect(merkleProof([leaf], leaf)).toEqual([]);
  });
});

describe('winners', () => {
  it('takes the lowest scores, one ticket each in ascending token order', () => {
    const snap = buildSnapshot({ eventId: 'ev', round: 1, entries: entries(10), tokenIds: tickets(3) });
    const winners = drawWinners({ seed: SEED, leaves: snap.leaves, tokenIds: snap.tokenIds });
    const scores = snap.leaves.map((l) => scoreOf(SEED, l)).sort((a, b) => (a < b ? -1 : 1));
    expect(winners.map((w) => BigInt(w.score))).toEqual(scores.slice(0, 3));
    expect(winners.map((w) => w.tokenId)).toEqual(snap.tokenIds);
  });

  it('gives everyone a ticket when there are more tickets than entries', () => {
    const snap = buildSnapshot({ eventId: 'ev', round: 1, entries: entries(2), tokenIds: tickets(5) });
    const winners = drawWinners({ seed: SEED, leaves: snap.leaves, tokenIds: snap.tokenIds });
    expect(winners).toHaveLength(2);
    expect(new Set(winners.map((w) => w.leaf))).toEqual(new Set(snap.leaves));
  });

  it('changes with the seed and refuses an unseeded round', () => {
    const snap = buildSnapshot({ eventId: 'ev', round: 1, entries: entries(20), tokenIds: tickets(1) });
    const pick = (seed: string) => drawWinners({ seed, leaves: snap.leaves, tokenIds: snap.tokenIds })[0].leaf;
    const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => pick(hashText(s))));
    expect(picks.size).toBeGreaterThan(1);
    expect(() => drawWinners({ seed: `0x${'0'.repeat(64)}`, leaves: snap.leaves, tokenIds: snap.tokenIds })).toThrow(RangeError);
  });
});

describe('published demo round (contracts/deployments/draw-demo.baseSepolia.json)', () => {
  const demo = JSON.parse(
    readFileSync(new URL('../../contracts/deployments/draw-demo.baseSepolia.json', import.meta.url), 'utf8'),
  );

  it('recomputes to the commitment and winners it published', () => {
    const snap = buildSnapshot({ eventId: demo.eventId, round: demo.round, entries: demo.entries, tokenIds: demo.tokenIds });
    expect(snap.commitment).toBe(demo.commitment);
    expect(snap.leaves).toEqual(demo.leaves);
    expect(drawWinners({ seed: demo.seed, leaves: snap.leaves, tokenIds: snap.tokenIds })).toEqual(demo.winners);
    for (const e of demo.entries) expect(verifyProof(e.leaf, e.proof, snap.root)).toBe(true);
  });
});
