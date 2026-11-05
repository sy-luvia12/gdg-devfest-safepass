import { onCall } from 'firebase-functions/v2/https';
import type { ClaimTicketResponse } from '../api';
import { db } from '../firebase';
import { claimOffer } from '../lottery/rounds';
import { readDocId, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';

// A lottery winner accepts the offered ticket within the claim window.
export const claimTicket = onCall<unknown, Promise<ClaimTicketResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const email = ((await db.doc(`users/${caller.uid}`).get()).get('email') as string | undefined) ?? caller.email;
  return claimOffer(db, eventId, caller.uid, email, Date.now());
});
