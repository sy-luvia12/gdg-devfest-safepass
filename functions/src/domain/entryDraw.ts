import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers';

// Instant entry draw: one student, one event (FestivalTicket.openEntry / settleEntry).
// The browser check (apps/web/src/lib/chain/entry.ts) uses the same formulas.
//
//   studentRef = keccak256(utf8("{schoolId}:{studentId}"))
//   entryId    = keccak256(abi.encode(bytes32 eventKey, bytes32 studentRef, bytes32 salt))
//   score      = uint256(keccak256(abi.encode(bytes32 seed, bytes32 entryId))) % 10000   (seed = blockhash(seedBlock))
//   won        = score < winBps, while the event still has fewer winners than its capacity (the contract decides)
//   winBps     = min(10000, floor(capacity * 10000 / pool)), pool = expected number of students (the whole school)

const abi = AbiCoder.defaultAbiCoder();
export const BPS = 10_000;

export const studentRefOf = (schoolId: string, studentId: string): string => keccak256(toUtf8Bytes(`${schoolId}:${studentId}`));

export const entryIdOf = (eventKey: string, studentRef: string, salt: string): string =>
  keccak256(abi.encode(['bytes32', 'bytes32', 'bytes32'], [eventKey, studentRef, salt]));

export const scoreOf = (seed: string, entryId: string): number =>
  Number(BigInt(keccak256(abi.encode(['bytes32', 'bytes32'], [seed, entryId]))) % BigInt(BPS));

/** More students per ticket makes a win less likely. With no pool known, or fewer students than tickets, everyone wins. */
export function winBpsOf(capacity: number, pool: number): number {
  if (!(capacity > 0)) return 0;
  if (!(pool > capacity)) return BPS;
  return Math.max(1, Math.floor((capacity * BPS) / pool));
}
