// Test vectors for the cancelled-ticket lottery (src/lottery/draw.ts). The browser check in
// apps/web/src/lib/chain/draw.ts must reproduce every value in contracts/test/vectors/draw.json.
// Usage: npx tsx scripts/draw-vectors.ts --write   (rewrites the file; test/lottery.test.ts fails if it is stale)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { id as hashText } from 'ethers';
import { tokenIdOf } from '../src/chain/ids';
import { buildSnapshot, drawWinners, leafOf, merkleProof, scoreOf } from '../src/lottery/draw';

export const VECTORS_PATH = join(__dirname, '..', '..', 'contracts', 'test', 'vectors', 'draw.json');

const CASES = [
  { name: 'seven entries, three tickets', eventId: 'vector-festival', round: 1, entries: 7, tickets: ['a', 'b', 'c'], seed: 'seed-1' },
  { name: 'more tickets than entries', eventId: 'vector-festival', round: 2, entries: 2, tickets: ['d', 'e', 'f'], seed: 'seed-2' },
  { name: 'one entry, one ticket', eventId: 'other-festival', round: 0, entries: 1, tickets: ['g'], seed: 'seed-3' },
];

export function buildVectors() {
  return {
    format: 'see functions/src/lottery/draw.ts',
    cases: CASES.map((c) => {
      const entries = Array.from({ length: c.entries }, (_, i) => ({ uid: `student-${i}`, salt: hashText(`${c.name}/salt-${i}`) }));
      const tokenIds = c.tickets.map((t) => tokenIdOf(`ticket-${t}`));
      const seed = hashText(c.seed);
      const snap = buildSnapshot({ eventId: c.eventId, round: c.round, entries, tokenIds });
      return {
        name: c.name,
        input: { eventId: c.eventId, round: c.round, entries, tokenIds, seed },
        expected: {
          eventKey: snap.eventKey,
          leaves: snap.leaves,
          root: snap.root,
          tokenIds: snap.tokenIds,
          ticketsHash: snap.ticketsHash,
          commitment: snap.commitment,
          perEntry: entries.map((e) => {
            const leaf = leafOf(snap.eventKey, c.round, e.uid, e.salt);
            return { uid: e.uid, leaf, proof: merkleProof(snap.leaves, leaf), score: scoreOf(seed, leaf).toString() };
          }),
          winners: drawWinners({ seed, leaves: snap.leaves, tokenIds }),
        },
      };
    }),
  };
}

if (process.argv.includes('--write')) {
  writeFileSync(VECTORS_PATH, `${JSON.stringify(buildVectors(), null, 2)}\n`);
  console.log(`wrote ${VECTORS_PATH}`);
}
