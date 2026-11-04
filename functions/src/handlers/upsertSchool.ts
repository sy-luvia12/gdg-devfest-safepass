import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { UpsertSchoolResponse } from '../api';
import { db } from '../firebase';
import { readDocId, readString, readStringList, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

// Opens a school space or edits its name, mail domains and color. A school admin can only do this for its own school.
export const upsertSchool = onCall<unknown, Promise<UpsertSchoolResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolId = readDocId(request.data, 'schoolId');
  const name = readString(request.data, 'name').trim();
  const domains = readStringList(request.data, 'domains').map((d) => d.trim().toLowerCase());
  const brandColor = readString(request.data, 'brandColor');
  if (!domains.every((d) => DOMAIN.test(d))) throw new HttpsError('invalid-argument', 'domains must be mail domains.');
  if (!COLOR.test(brandColor)) throw new HttpsError('invalid-argument', 'brandColor must be #RRGGBB.');

  return db.runTransaction(async (tx): Promise<UpsertSchoolResponse> => {
    await requireSchoolAdmin(tx, caller.uid, schoolId);
    const ref = db.doc(`schools/${schoolId}`);
    const existing = await tx.get(ref);
    // A domain belongs to one school, because sign-in finds the school by the mail domain.
    for (const domain of domains) {
      const taken = await tx.get(db.collection('schools').where('domains', 'array-contains', domain).limit(1));
      if (taken.docs[0] && taken.docs[0].id !== schoolId) {
        throw new HttpsError('already-exists', `${domain} already belongs to another school.`);
      }
    }
    tx.set(ref, { name, domains, brandColor }, { merge: true });
    return { ok: true, created: !existing.exists };
  });
});
