import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { UpdateEventResponse } from '../api';
import { db } from '../firebase';
import {
  hostOf,
  readBoolean,
  readCount,
  readDocId,
  readEventDate,
  readOptional,
  readString,
  requireAuth,
  requireSchoolAdmin,
} from './boundary';

// Edits an event's details. The schools taking part are fixed once the event exists.
export const updateEvent = onCall<unknown, Promise<UpdateEventResponse>>(async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const text = (field: string) => readOptional(request.data, field, readString)?.trim();
  const changes = Object.fromEntries(
    Object.entries({
      name: text('name'),
      place: text('place'),
      date: readOptional(request.data, 'date', readEventDate),
      capacity: readOptional(request.data, 'capacity', readCount),
      faceValue: readOptional(request.data, 'faceValue', readCount),
      requireRoster: readOptional(request.data, 'requireRoster', readBoolean),
    }).filter(([, v]) => v !== undefined),
  );

  return db.runTransaction(async (tx): Promise<UpdateEventResponse> => {
    const ref = db.doc(`events/${eventId}`);
    const event = await tx.get(ref);
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
    const capacity = changes.capacity as number | undefined;
    if (capacity !== undefined && capacity < Math.max(1, event.get('issuedCount') ?? 0)) {
      throw new HttpsError('failed-precondition', 'capacity cannot go below the tickets already issued.');
    }
    if (Object.keys(changes).length > 0) tx.update(ref, changes);
    return { ok: true };
  });
});
