import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { PrecheckStudentResponse } from '../api';
import { decidePrecheck, isStudentId } from '../domain/roster';
import { db } from '../firebase';
import { readOptional, readString } from './boundary';
import { callableOptions } from './callableOptions';
import { schoolForEmail } from './rosterStore';

// Checked before the email link is sent, so a link only goes to an address on the school roster. Open to visitors
// who are not signed in; it answers yes or no and never returns roster data.
export const precheckStudent = onCall<unknown, Promise<PrecheckStudentResponse>>(callableOptions, async (request) => {
  const email = readString(request.data, 'email').trim().toLowerCase();
  const studentId = readString(request.data, 'studentId').trim();
  const name = readOptional(request.data, 'name', readString)?.trim();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) throw new HttpsError('invalid-argument', 'email is not valid.');

  const school = await schoolForEmail(email);
  if (!school?.get('studentRoster')) return { ok: false, reason: 'NO_SCHOOL' };
  const row = isStudentId(studentId) ? await db.doc(`schools/${school.id}/roster/${studentId}`).get() : null;
  const found = row?.exists
    ? { name: row.get('name'), studentId, email: row.get('email'), claimedBy: row.get('claimedBy') }
    : null;
  const decision = decidePrecheck(found, { email, name });
  if (decision !== 'OK') return { ok: false, reason: decision };
  return { ok: true, schoolId: school.id, schoolName: school.get('name') ?? '' };
});
