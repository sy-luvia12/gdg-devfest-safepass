import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { GetRosterResponse } from '../api';
import { db } from '../firebase';
import { hostOf, readDocId, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { eventRosterPlace, readRoster } from './rosterStore';

export const getEventRoster = onCall<unknown, Promise<GetRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  await db.runTransaction(async (tx) => {
    const event = await tx.get(db.doc(`events/${eventId}`));
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
  });
  return readRoster(eventRosterPlace(eventId), false);
});
