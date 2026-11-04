import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { VerifyStudentReason, VerifyStudentRosterResponse } from '../api';
import { isStudentId, matchStudent } from '../domain/roster';
import { db } from '../firebase';
import { readDocId, readString, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';
import { profileOf } from './ensureUser';

// Sign-up check against the school roster. The student types name and student id; the signed-in Google account
// proves the email, which must be the one on that row. The row then belongs to this account only.
export const verifyStudentRoster = onCall<unknown, Promise<VerifyStudentRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolId = readDocId(request.data, 'schoolId');
  const name = readString(request.data, 'name').trim();
  const studentId = readString(request.data, 'studentId').trim();
  if (!caller.emailVerified) throw new HttpsError('permission-denied', 'The sign-in email is not verified.');
  const reject = (reason: VerifyStudentReason): VerifyStudentRosterResponse => ({ ok: false, reason });

  return db.runTransaction(async (tx): Promise<VerifyStudentRosterResponse> => {
    const userRef = db.doc(`users/${caller.uid}`);
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError('not-found', 'User profile missing. Call ensureUser first.');
    // A student id that is not a valid document id cannot be on the roster either.
    const rowRef = isStudentId(studentId) ? db.doc(`schools/${schoolId}/roster/${studentId}`) : null;
    const row = rowRef ? await tx.get(rowRef) : null;
    if (!rowRef || !row?.exists) return reject('NOT_IN_ROSTER');

    // A wrong name answers like a missing row, so the check does not tell which student ids exist.
    const match = matchStudent({ name: row.get('name'), studentId, email: row.get('email') }, name, caller.email);
    if (match === 'NAME_MISMATCH') return reject('NOT_IN_ROSTER');
    if (match === 'EMAIL_MISMATCH') return reject('EMAIL_MISMATCH');
    const claimedBy = row.get('claimedBy');
    if (claimedBy && claimedBy !== caller.uid) return reject('STUDENT_ID_TAKEN');

    const fields = { schoolId, name: row.get('name') as string, studentId, rosterVerified: true };
    tx.update(rowRef, { claimedBy: caller.uid });
    tx.update(userRef, fields);
    return { ok: true, profile: profileOf(caller.uid, { ...user.data(), ...fields }) };
  });
});
