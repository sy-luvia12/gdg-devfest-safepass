import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ImportRosterResponse } from '../api';
import { db } from '../firebase';
import { hostOf, readDocId, readString, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { eventRosterPlace, importRoster } from './rosterStore';

// Reads an event's roster (winners, sign-ups) into events/{id}/roster. issueTicket checks it when requireRoster is on.
export const importEventRoster = onCall<unknown, Promise<ImportRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const sheetUrl = readString(request.data, 'sheetUrl');
  const domains = await db.runTransaction(async (tx) => {
    const event = await tx.get(db.doc(`events/${eventId}`));
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
    return (event.get('allowedDomains') as string[] | undefined) ?? [];
  });
  return importRoster(eventRosterPlace(eventId), sheetUrl, domains);
});
