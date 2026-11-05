import { encodeAbiParameters, keccak256, stringToBytes, type Hex } from 'viem';
import { eventKeyOf } from './ids';
import type { ChainEntry, EntryCheck } from './types';

// Instant entry draw, recomputed in the browser. Same formulas as functions/src/domain/entryDraw.ts and
// FestivalTicket.settleEntry:
//   studentRef = keccak256(utf8("{schoolId}:{studentId}"))
//   entryId    = keccak256(abi.encode(bytes32 eventKey, bytes32 studentRef, bytes32 salt))
//   score      = uint256(keccak256(abi.encode(bytes32 seed, bytes32 entryId))) % 10000, seed = blockhash(seedBlock)
//   won        = score < winBps while the event has fewer winners than its capacity

export const BPS = 10_000;
const B32 = [{ type: 'bytes32' }, { type: 'bytes32' }] as const;

export const studentRefOf = (schoolId: string, studentId: string): Hex => keccak256(stringToBytes(`${schoolId}:${studentId}`));

export const entryIdOf = (eventId: string, studentRef: string, salt: string): Hex =>
  keccak256(encodeAbiParameters([...B32, { type: 'bytes32' }], [eventKeyOf(eventId), studentRef as Hex, salt as Hex]));

export const scoreOf = (seed: string, entryId: string): number =>
  Number(BigInt(keccak256(encodeAbiParameters(B32, [seed as Hex, entryId as Hex]))) % BigInt(BPS));

export { formatRate } from './rate';

/**
 * Checks the student's entry against the chain with nothing but public data and the student's own salt.
 * blockHash is the hash of the entry's seed block, read from the chain by the caller.
 */
export function checkEntry(
  mine: { eventId: string; studentRef: string; salt: string; entryId: string; winBps: number },
  chain: ChainEntry | null,
  blockHash: string | null,
): EntryCheck {
  const rebuilt = entryIdOf(mine.eventId, mine.studentRef, mine.salt);
  const entryIdMatches = rebuilt.toLowerCase() === mine.entryId.toLowerCase();
  const onChain = !!chain && chain.result !== 0 && !!chain.seed;
  const rateMatches = !!chain && chain.winBps === mine.winBps;
  const seedMatches = onChain && !!blockHash && blockHash.toLowerCase() === chain!.seed!.toLowerCase();
  const score = onChain ? scoreOf(chain!.seed!, rebuilt) : null;
  const scoreMatches = score !== null && score === chain!.score;
  const won = onChain ? chain!.result === 1 : null;
  const inRange = score !== null && !!chain && score < chain.winBps;
  // The contract turns an in-range score into a loss once the event has as many winners as its capacity.
  const capacityFull = won === false && inRange;
  const resultMatches = won !== null && (won === inRange || capacityFull);
  return {
    entryIdMatches,
    onChain,
    rateMatches,
    seedMatches,
    score,
    scoreMatches,
    won,
    resultMatches,
    capacityFull,
    ok: entryIdMatches && onChain && rateMatches && seedMatches && scoreMatches && resultMatches,
  };
}
