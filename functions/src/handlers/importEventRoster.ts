import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ImportRosterResponse } from '../api';
import { db } from '../firebase';
import { hostOf, readDocId, readString, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { eventRosterPlace, importEventRows } from './rosterStore';

// Reads an event's roster (winners, sign-ups: 이름 and 학번) into events/{id}/roster. Rows are checked against the
// host school's student roster. issueTicket checks the roster when requireRoster is on.
export const importEventRoster = onCall<unknown, Promise<ImportRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const sheetUrl = readString(request.data, 'sheetUrl');
  const host = await db.runTransaction(async (tx) => {
    const event = await tx.get(db.doc(`events/${eventId}`));
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    const schoolId = hostOf(event.get('schoolIds'));
    await requireSchoolAdmin(tx, caller.uid, schoolId);
    return schoolId;
  });
  return importEventRows(eventRosterPlace(eventId), sheetUrl, host);
});
