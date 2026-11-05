import { concatHex, encodeAbiParameters, hexToBigInt, keccak256, stringToBytes, type Hex } from 'viem';
import { eventKeyOf } from './ids';
import type { ChainDraw, DrawCheck, MyDrawEntry } from './types';

// Browser twin of functions/src/lottery/draw.ts (format in contracts/README.md "취소표 추첨 형식").
// Both must reproduce contracts/test/vectors/draw.json; keep them in step.

const BYTES32 = /^0x[0-9a-f]{64}$/;
const ZERO = `0x${'0'.repeat(64)}`;

const b32 = (name: string, v: string): Hex => {
  const lower = v.toLowerCase();
  if (!BYTES32.test(lower)) throw new TypeError(`${name} must be 0x followed by 64 hex characters.`);
  return lower as Hex;
};
const checkRound = (round: number) => {
  if (!Number.isInteger(round) || round < 0 || round > 0xffffffff) throw new RangeError('round must be a uint32.');
};
const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
const byValue = (a: string, b: string) => cmp(BigInt(a), BigInt(b));

export function leafOf(eventKey: string, round: number, uid: string, salt: string): Hex {
  checkRound(round);
  if (!uid) throw new TypeError('uid must not be empty.');
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint32' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [b32('eventKey', eventKey), round, keccak256(stringToBytes(uid)), b32('salt', salt)],
    ),
  );
}

const hashPair = (a: Hex, b: Hex): Hex => keccak256(byValue(a, b) <= 0 ? concatHex([a, b]) : concatHex([b, a]));

export const verifyProof = (leaf: string, proof: string[], root: string): boolean =>
  proof.reduce<Hex>((acc, p) => hashPair(acc, b32('proof', p)), b32('leaf', leaf)) === b32('root', root);

function sortedTokenIds(tokenIds: string[]): bigint[] {
  if (tokenIds.length === 0) throw new RangeError('A draw needs at least one ticket.');
  const sorted = tokenIds.map((t) => BigInt(t)).sort(cmp);
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) throw new RangeError('Duplicate token id.');
  return sorted;
}

export const ticketsHashOf = (tokenIds: string[]): Hex =>
  keccak256(encodeAbiParameters([{ type: 'uint256[]' }], [sortedTokenIds(tokenIds)]));

export function commitmentOf(eventKey: string, round: number, root: string, ticketsHash: string): Hex {
  checkRound(round);
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint32' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [b32('eventKey', eventKey), round, b32('root', root), b32('ticketsHash', ticketsHash)],
    ),
  );
}

export const scoreOf = (seed: string, leaf: string): bigint =>
  hexToBigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [b32('seed', seed), b32('leaf', leaf)])));

/** 공연 후 전체 leaf 목록이 공개되면 당첨자 전체를 다시 계산한다 */
export function recomputeWinners(p: { seed: string; leaves: string[]; tokenIds: string[] }) {
  if (p.seed.toLowerCase() === ZERO) throw new RangeError('The round has no seed yet.');
  const tokenIds = sortedTokenIds(p.tokenIds);
  const leaves = p.leaves.map((l) => b32('leaf', l)).sort(byValue);
  for (let i = 1; i < leaves.length; i++) if (leaves[i] === leaves[i - 1]) throw new RangeError('Duplicate leaf.');
  return leaves
    .map((leaf) => ({ leaf, score: scoreOf(p.seed, leaf) }))
    .sort((a, b) => cmp(a.score, b.score) || byValue(a.leaf, b.leaf))
    .slice(0, tokenIds.length)
    .map((r, j) => ({ leaf: r.leaf, tokenId: tokenIds[j].toString(), score: r.score.toString() }));
}

/**
 * 공연 전 "직접 검증하기": 내 응모가 스냅샷에 있고, 스냅샷이 체인에 올린 값과 같고, 시드가 체인에 있는지.
 * 대기 인원과 다른 응모자는 쓰지 않는다.
 */
export function checkMyDraw(entry: MyDrawEntry, onChain: ChainDraw | null): DrawCheck {
  const eventKey = eventKeyOf(entry.eventId);
  const leaf = leafOf(eventKey, entry.round, entry.uid, entry.salt);
  const included = verifyProof(leaf, entry.proof, entry.root);
  const commitmentMatches =
    !!onChain && commitmentOf(eventKey, entry.round, entry.root, ticketsHashOf(entry.tokenIds)) === onChain.commitment.toLowerCase();
  const seed = onChain?.seed ?? null;
  return {
    leaf,
    included,
    commitmentMatches,
    seeded: seed !== null,
    seed,
    myScore: seed ? scoreOf(seed, leaf).toString() : null,
    ok: included && commitmentMatches && seed !== null,
  };
}
