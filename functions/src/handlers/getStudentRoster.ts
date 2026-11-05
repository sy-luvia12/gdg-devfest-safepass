import { onCall } from 'firebase-functions/v2/https';
import type { GetRosterResponse } from '../api';
import { db } from '../firebase';
import { readDocId, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { readRoster, studentRosterPlace } from './rosterStore';

export const getStudentRoster = onCall<unknown, Promise<GetRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolId = readDocId(request.data, 'schoolId');
  await db.runTransaction((tx) => requireSchoolAdmin(tx, caller.uid, schoolId));
  return readRoster(studentRosterPlace(schoolId), true);
});
