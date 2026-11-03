import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetAllowReissueResponse } from '../api';
import { db } from '../firebase';
import { readDocId, requireAuth, requireRole } from './boundary';

// Test events only: lets a student who cancelled take a ticket again. Real events keep it off.
export const setAllowReissue = onCall<unknown, Promise<SetAllowReissueResponse>>(async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const allow = (request.data as { allow?: unknown } | null)?.allow;
  if (typeof allow !== 'boolean') throw new HttpsError('invalid-argument', 'allow must be a boolean.');
  const eventRef = db.doc(`events/${eventId}`);

  return db.runTransaction(async (tx): Promise<SetAllowReissueResponse> => {
    await requireRole(tx, caller.uid, ['admin']);
    if (!(await tx.get(eventRef)).exists) throw new HttpsError('not-found', 'Event not found.');
    tx.update(eventRef, { allowReissueAfterCancel: allow });
    return { ok: true };
  });
});
