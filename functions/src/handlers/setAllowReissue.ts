import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetAllowReissueResponse } from '../api';
import { db } from '../firebase';
import { hostOf, readDocId, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';

// Test events only: lets a student who cancelled take a ticket again. Real events keep it off.
export const setAllowReissue = onCall<unknown, Promise<SetAllowReissueResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const allow = (request.data as { allow?: unknown } | null)?.allow;
  if (typeof allow !== 'boolean') throw new HttpsError('invalid-argument', 'allow must be a boolean.');
  const eventRef = db.doc(`events/${eventId}`);

  return db.runTransaction(async (tx): Promise<SetAllowReissueResponse> => {
    const event = await tx.get(eventRef);
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
    tx.update(eventRef, { allowReissueAfterCancel: allow });
    return { ok: true };
  });
});
