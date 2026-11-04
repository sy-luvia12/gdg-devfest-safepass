import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CreateEventResponse } from '../api';
import { db } from '../firebase';
import {
  DOC_ID,
  readBoolean,
  readCount,
  readEventDate,
  readString,
  readStringList,
  requireAuth,
  requireSchoolAdmin,
} from './boundary';
import { callableOptions } from './callableOptions';

// The host school's admin registers an event. Students of every listed school can take its tickets.
export const createEvent = onCall<unknown, Promise<CreateEventResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolIds = [...new Set(readStringList(request.data, 'schoolIds'))];
  if (!schoolIds.every((id) => DOC_ID.test(id))) throw new HttpsError('invalid-argument', 'schoolIds are not valid ids.');
  const fields = {
    name: readString(request.data, 'name').trim(),
    date: readEventDate(request.data),
    place: readString(request.data, 'place').trim(),
    capacity: readCount(request.data, 'capacity'),
    faceValue: readCount(request.data, 'faceValue'),
    requireRoster: readBoolean(request.data, 'requireRoster'),
  };
  if (fields.capacity === 0) throw new HttpsError('invalid-argument', 'capacity must be at least 1.');

  return db.runTransaction(async (tx): Promise<CreateEventResponse> => {
    await requireSchoolAdmin(tx, caller.uid, schoolIds[0]);
    const schools = await Promise.all(schoolIds.map((id) => tx.get(db.doc(`schools/${id}`))));
    if (schools.some((s) => !s.exists)) throw new HttpsError('not-found', 'Every school needs a space first.');
    const allowedDomains = schools.flatMap((s) => (s.get('domains') as string[] | undefined) ?? []);
    const ref = db.collection('events').doc();
    // Counters and defaults match the seeded events, so every other function reads a created event the same way.
    tx.create(ref, {
      ...fields,
      schoolIds,
      allowedDomains,
      issuedCount: 0,
      nftSeq: 0,
      enteredCount: 0,
      reassignMode: 'queue',
      requireDevice: false,
      allowReissueAfterCancel: false,
    });
    return { ok: true, eventId: ref.id };
  });
});
