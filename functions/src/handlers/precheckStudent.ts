import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { PrecheckStudentResponse } from '../api';
import { cleanField, decidePrecheck, isStudentId } from '../domain/roster';
import { db } from '../firebase';
import { readOptional, readString } from './boundary';
import { callableOptions } from './callableOptions';
import { schoolForEmail } from './rosterStore';
import { newSignupIntent, signupIntentRef } from './signupIntent';

// Checked before the email link is sent, so a link only goes to an address on the school roster. Open to visitors
// who are not signed in; it answers yes or no and never returns roster data.
export const precheckStudent = onCall<unknown, Promise<PrecheckStudentResponse>>(callableOptions, async (request) => {
  const email = cleanField(readString(request.data, 'email')).toLowerCase();
  const studentId = cleanField(readString(request.data, 'studentId'));
  const name = readOptional(request.data, 'name', readString)?.normalize('NFC').trim();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) throw new HttpsError('invalid-argument', 'email is not valid.');

  const school = await schoolForEmail(email);
  if (!school?.get('studentRoster')) return { ok: false, reason: 'NO_SCHOOL' };
  const row = isStudentId(studentId) ? await db.doc(`schools/${school.id}/roster/${studentId}`).get() : null;
  const found = row?.exists
    ? { name: row.get('name'), studentId, email: row.get('email'), claimedBy: row.get('claimedBy') }
    : null;
  const decision = decidePrecheck(found, { email, name });
  // Which part of a failed check differs, without the values themselves.
  if (decision !== 'OK') {
    console.log('precheck failed', decision, {
      idValid: isStudentId(studentId), idLen: studentId.length, rowFound: !!row?.exists, nameLen: name?.length,
      nameSame: found ? cleanField(String(found.name)) === cleanField(name ?? '') : null,
      emailSame: found ? String(found.email).toLowerCase() === email : null, claimed: !!found?.claimedBy,
    });
  }
  if (decision !== 'OK') return { ok: false, reason: decision };
  // A sign-up that passed is remembered per email, so the link finishes it in whichever browser opens it.
  if (name !== undefined) await signupIntentRef(email).set(newSignupIntent({ schoolId: school.id, studentId }, Date.now()));
  return { ok: true, schoolId: school.id, schoolName: school.get('name') ?? '' };
});
