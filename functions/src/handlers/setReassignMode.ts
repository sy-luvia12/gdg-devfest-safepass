import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetReassignModeResponse } from '../api';
import { db } from '../firebase';
import { hostOf, readDocId, readReassignMode, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';

export const setReassignMode = onCall<unknown, Promise<SetReassignModeResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const mode = readReassignMode(request.data);
  const eventRef = db.doc(`events/${eventId}`);

  return db.runTransaction(async (tx): Promise<SetReassignModeResponse> => {
    const event = await tx.get(eventRef);
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
    tx.update(eventRef, { reassignMode: mode });
    return { ok: true };
  });
});
