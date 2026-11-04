import type { DrawReceipt } from '../src/api';
import { eventKeyOf } from '../src/chain/ids';
import { commitmentOf, leafOf, ticketsHashOf, verifyProof } from '../src/lottery/draw';

/** What the student's "직접 검증하기" checks before the show: membership and the committed value. */
export function checkReceipt(r: DrawReceipt, commitment: string): boolean {
  const key = eventKeyOf(r.eventId);
  const leaf = leafOf(key, r.round, r.uid, r.salt);
  return verifyProof(leaf, r.proof, r.root) && commitmentOf(key, r.round, r.root, ticketsHashOf(r.tokenIds)) === commitment;
}
