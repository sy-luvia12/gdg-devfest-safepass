import { AbiCoder, keccak256, randomBytes, hexlify, toUtf8Bytes } from 'ethers';
import { eventKeyOf } from '../chain/ids';

// Cancelled-ticket lottery: the snapshot format behind FestivalTicket.commitDraw and the winner rule.
// The browser check (apps/web/src/lib/chain/draw.ts) reimplements this byte for byte; both are pinned by
// contracts/test/vectors/draw.json, so any change here must regenerate the vectors (scripts/draw-vectors.ts).
//
//   leaf        = keccak256(abi.encode(bytes32 eventKey, uint32 round, bytes32 keccak256(uid), bytes32 salt))
//   root        = Merkle root over the leaves sorted ascending, pairs hashed sorted (OpenZeppelin MerkleProof)
//   ticketsHash = keccak256(abi.encode(uint256[] tokenIds ascending))
//   commitment  = keccak256(abi.encode(bytes32 eventKey, uint32 round, bytes32 root, bytes32 ticketsHash))
//   score       = uint256(keccak256(abi.encode(bytes32 seed, bytes32 leaf)))   seed = blockhash from seedDraw
//   winners     = leaves by (score, leaf) ascending, the first k = min(tickets, entries);
//                 the j-th winner gets tokenIds[j]

const abi = AbiCoder.defaultAbiCoder();
const BYTES32 = /^0x[0-9a-f]{64}$/;

export interface DrawEntry {
  uid: string;
  salt: string; // 0x + 64 lowercase hex, random per entry, shown only to its owner
}

export interface Snapshot {
  eventKey: string;
  round: number;
  leaves: string[]; // ascending
  root: string;
  tokenIds: string[]; // decimal strings, ascending
  ticketsHash: string;
  commitment: string;
}

export interface Winner {
  leaf: string;
  tokenId: string;
  score: string; // decimal
}

const asBytes32 = (name: string, v: string): string => {
  const lower = v.toLowerCase();
  if (!BYTES32.test(lower)) throw new TypeError(`${name} must be 0x followed by 64 hex characters.`);
  return lower;
};

const checkRound = (round: number) => {
  if (!Number.isInteger(round) || round < 0 || round > 0xffffffff) throw new RangeError('round must be a uint32.');
};

const byValue = (a: string, b: string) => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

export const newSalt = (): string => hexlify(randomBytes(32));

export function leafOf(eventKey: string, round: number, uid: string, salt: string): string {
  checkRound(round);
  if (!uid) throw new TypeError('uid must not be empty.');
  return keccak256(
    abi.encode(
      ['bytes32', 'uint32', 'bytes32', 'bytes32'],
      [asBytes32('eventKey', eventKey), round, keccak256(toUtf8Bytes(uid)), asBytes32('salt', salt)],
    ),
  );
}

const hashPair = (a: string, b: string): string =>
  keccak256(byValue(a, b) <= 0 ? `${a}${b.slice(2)}` : `${b}${a.slice(2)}`);

function layers(sortedLeaves: string[]): string[][] {
  const out = [sortedLeaves];
  while (out[out.length - 1].length > 1) {
    const prev = out[out.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    out.push(next);
  }
  return out;
}

function sortLeaves(leaves: string[]): string[] {
  if (leaves.length === 0) throw new RangeError('A draw needs at least one entry.');
  const sorted = leaves.map((l) => asBytes32('leaf', l)).sort(byValue);
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) throw new RangeError('Duplicate leaf.');
  return sorted;
}

export const merkleRoot = (leaves: string[]): string => {
  const all = layers(sortLeaves(leaves));
  return all[all.length - 1][0];
};

export function merkleProof(leaves: string[], leaf: string): string[] {
  const all = layers(sortLeaves(leaves));
  let index = all[0].indexOf(asBytes32('leaf', leaf));
  if (index < 0) throw new RangeError('Leaf is not in the snapshot.');
  const proof: string[] = [];
  for (let level = 0; level < all.length - 1; level++) {
    const sibling = index ^ 1;
    if (sibling < all[level].length) proof.push(all[level][sibling]);
    index >>= 1;
  }
  return proof;
}

export const verifyProof = (leaf: string, proof: string[], root: string): boolean =>
  proof.reduce((acc, p) => hashPair(acc, asBytes32('proof', p)), asBytes32('leaf', leaf)) === asBytes32('root', root);

function sortTokenIds(tokenIds: string[]): string[] {
  if (tokenIds.length === 0) throw new RangeError('A draw needs at least one ticket.');
  const sorted = tokenIds.map((t) => BigInt(t)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) throw new RangeError('Duplicate token id.');
  return sorted.map(String);
}

export const ticketsHashOf = (tokenIds: string[]): string =>
  keccak256(abi.encode(['uint256[]'], [sortTokenIds(tokenIds)]));

export function commitmentOf(eventKey: string, round: number, root: string, ticketsHash: string): string {
  checkRound(round);
  return keccak256(
    abi.encode(
      ['bytes32', 'uint32', 'bytes32', 'bytes32'],
      [asBytes32('eventKey', eventKey), round, asBytes32('root', root), asBytes32('ticketsHash', ticketsHash)],
    ),
  );
}

export function buildSnapshot(p: { eventId: string; round: number; entries: DrawEntry[]; tokenIds: string[] }): Snapshot {
  const eventKey = eventKeyOf(p.eventId);
  const uids = new Set(p.entries.map((e) => e.uid));
  if (uids.size !== p.entries.length) throw new RangeError('One entry per uid.');
  const leaves = sortLeaves(p.entries.map((e) => leafOf(eventKey, p.round, e.uid, e.salt)));
  const tokenIds = sortTokenIds(p.tokenIds);
  const root = merkleRoot(leaves);
  const ticketsHash = ticketsHashOf(tokenIds);
  return { eventKey, round: p.round, leaves, root, tokenIds, ticketsHash, commitment: commitmentOf(eventKey, p.round, root, ticketsHash) };
}

export const scoreOf = (seed: string, leaf: string): bigint =>
  BigInt(keccak256(abi.encode(['bytes32', 'bytes32'], [asBytes32('seed', seed), asBytes32('leaf', leaf)])));

export function drawWinners(p: { seed: string; leaves: string[]; tokenIds: string[] }): Winner[] {
  if (/^0x0{64}$/.test(p.seed)) throw new RangeError('The round has no seed yet.');
  const tokenIds = sortTokenIds(p.tokenIds);
  const ranked = sortLeaves(p.leaves)
    .map((leaf) => ({ leaf, score: scoreOf(p.seed, leaf) }))
    .sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : byValue(a.leaf, b.leaf)));
  return ranked.slice(0, tokenIds.length).map((r, j) => ({ leaf: r.leaf, tokenId: tokenIds[j], score: r.score.toString() }));
}
