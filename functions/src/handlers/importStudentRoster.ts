import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ImportRosterResponse } from '../api';
import { db } from '../firebase';
import { readDocId, readString, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { importRoster, studentRosterPlace } from './rosterStore';

// Reads the school's student sheet into schools/{id}/roster. Sign-up is checked against these rows.
export const importStudentRoster = onCall<unknown, Promise<ImportRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolId = readDocId(request.data, 'schoolId');
  const sheetUrl = readString(request.data, 'sheetUrl');
  const domains = await db.runTransaction(async (tx) => {
    await requireSchoolAdmin(tx, caller.uid, schoolId);
    const school = await tx.get(db.doc(`schools/${schoolId}`));
    if (!school.exists) throw new HttpsError('not-found', 'Open the school space first.');
    return (school.get('domains') as string[] | undefined) ?? [];
  });
  return importRoster(studentRosterPlace(schoolId), sheetUrl, domains);
});
