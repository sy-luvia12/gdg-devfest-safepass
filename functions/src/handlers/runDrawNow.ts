import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RunDrawNowResponse } from '../api';
import { db } from '../firebase';
import { snapshotRound } from '../lottery/rounds';
import { hostOf, readDocId, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';

// Demo and operations: draws a lottery round right now instead of at the planned secret time. The round is
// committed on chain at once and announced as soon as processChainOp stores the seed (about 10 s).
export const runDrawNow = onCall<unknown, Promise<RunDrawNowResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const event = await db.doc(`events/${eventId}`).get();
  if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
  await db.runTransaction((tx) => requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds'))));
  const now = Date.now();
  return snapshotRound(db, eventId, { nowMs: now, announceAtMs: now, announceOnSeed: true, commitNow: true });
});
