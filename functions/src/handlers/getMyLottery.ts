import { onCall } from 'firebase-functions/v2/https';
import type { GetMyLotteryResponse } from '../api';
import { db } from '../firebase';
import { myLottery } from '../lottery/rounds';
import { readDocId, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';

// The caller's own lottery state and latest draw receipt (salt and Merkle proof for "직접 검증하기").
// Waitlist size, order, odds and the secret draw time are never returned.
export const getMyLottery = onCall<unknown, Promise<GetMyLotteryResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const email = ((await db.doc(`users/${caller.uid}`).get()).get('email') as string | undefined) ?? caller.email;
  const r = await myLottery(db, eventId, email, Date.now());
  // A receipt is only ever the caller's own: the waitlist key is their email, and the uid inside must match.
  return r.receipt && r.receipt.uid !== caller.uid ? { ...r, receipt: null } : r;
});
