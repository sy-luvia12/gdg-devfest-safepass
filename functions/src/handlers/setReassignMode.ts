import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetReassignModeResponse } from '../api';
import { db } from '../firebase';
import { readDocId, readReassignMode, requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';

export const setReassignMode = onCall<unknown, Promise<SetReassignModeResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const mode = readReassignMode(request.data);
  const eventRef = db.doc(`events/${eventId}`);

  return db.runTransaction(async (tx): Promise<SetReassignModeResponse> => {
    await requireRole(tx, caller.uid, ['admin']);
    if (!(await tx.get(eventRef)).exists) throw new HttpsError('not-found', 'Event not found.');
    tx.update(eventRef, { reassignMode: mode });
    return { ok: true };
  });
});
