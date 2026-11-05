import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { VerifyStudentReason, VerifyStudentRosterResponse } from '../api';
import { cleanField, isStudentId, matchStudent } from '../domain/roster';
import { db } from '../firebase';
import { readDocId, readOptional, readString, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';
import { profileOf } from './ensureUser';
import { liveSignupIntent, signupIntentRef } from './signupIntent';

// Sign-up check against the school roster. The signed-in email proves the mailbox, and it must be the email on the
// roster row. The row then belongs to this account only.
// The student is named either by the request (school, name, student id) or, with no fields, by what precheckStudent
// saved for this email, which lets the email link be opened in any browser.
export const verifyStudentRoster = onCall<unknown, Promise<VerifyStudentRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const given = {
    schoolId: readOptional(request.data, 'schoolId', readDocId),
    name: readOptional(request.data, 'name', readString)?.trim(),
    studentId: readOptional(request.data, 'studentId', readString),
  };
  const fromRequest = Object.values(given).some((v) => v !== undefined);
  if (fromRequest && Object.values(given).some((v) => v === undefined)) {
    throw new HttpsError('invalid-argument', 'schoolId, name and studentId go together.');
  }
  if (!caller.emailVerified) throw new HttpsError('permission-denied', 'The sign-in email is not verified.');
  const reject = (reason: VerifyStudentReason): VerifyStudentRosterResponse => ({ ok: false, reason });

  return db.runTransaction(async (tx): Promise<VerifyStudentRosterResponse> => {
    const userRef = db.doc(`users/${caller.uid}`);
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError('not-found', 'User profile missing. Call ensureUser first.');

    let claim: { schoolId: string; studentId: string; name: string | null };
    const intentRef = !caller.email || caller.email.includes('/') ? null : signupIntentRef(caller.email);
    if (fromRequest) {
      claim = { schoolId: given.schoolId!, studentId: cleanField(given.studentId!), name: given.name! };
    } else {
      // Already through the roster check (a returning student opening a sign-in link): nothing left to check.
      if (user.get('rosterVerified') === true) return { ok: true, profile: profileOf(caller.uid, user.data()!) };
      const intent = intentRef ? liveSignupIntent((await tx.get(intentRef)).data(), Date.now()) : null;
      if (!intent) return reject('NO_SIGNUP');
      claim = { ...intent, name: null };
    }
    const { schoolId, studentId } = claim;

    // A student id that is not a valid document id cannot be on the roster either.
    const rowRef = isStudentId(studentId) ? db.doc(`schools/${schoolId}/roster/${studentId}`) : null;
    const row = rowRef ? await tx.get(rowRef) : null;
    if (!rowRef || !row?.exists) return reject('NOT_IN_ROSTER');

    // A wrong name answers like a missing row, so the check does not tell which student ids exist. A saved sign-up
    // already passed the name check in precheckStudent, so only the email is compared here.
    const match = matchStudent({ name: row.get('name'), studentId, email: row.get('email') }, claim.name ?? row.get('name'), caller.email);
    if (match === 'NAME_MISMATCH') return reject('NOT_IN_ROSTER');
    if (match === 'EMAIL_MISMATCH') return reject('EMAIL_MISMATCH');
    const claimedBy = row.get('claimedBy');
    if (claimedBy && claimedBy !== caller.uid) return reject('STUDENT_ID_TAKEN');

    const fields = { schoolId, name: row.get('name') as string, studentId, rosterVerified: true };
    tx.update(rowRef, { claimedBy: caller.uid });
    tx.update(userRef, fields);
    if (intentRef) tx.delete(intentRef);
    return { ok: true, profile: profileOf(caller.uid, { ...user.data(), ...fields }) };
  });
});
