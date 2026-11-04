import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetStaffResponse } from '../api';
import { db } from '../firebase';
import { readString, requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';

// An admin grants or removes the staff role by email. Someone who has not signed in yet gets it from
// seedProfiles on their first sign-in. Admin accounts are never changed here.
export const setStaff = onCall<unknown, Promise<SetStaffResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const email = readString(request.data, 'email').trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) throw new HttpsError('invalid-argument', 'email is not valid.');
  const staff = (request.data as { staff?: unknown } | null)?.staff;
  if (typeof staff !== 'boolean') throw new HttpsError('invalid-argument', 'staff must be a boolean.');
  const role = staff ? 'staff' : 'student';

  return db.runTransaction(async (tx): Promise<SetStaffResponse> => {
    const admin = await requireRole(tx, caller.uid, ['admin']);
    // Staff added by a school admin work for that school only (operatorSchoolId). A team admin adds unscoped staff.
    const school: string | undefined = admin.adminSchoolId || undefined;
    const fields = staff ? { role, staffSchoolId: school ?? FieldValue.delete() } : { role, staffSchoolId: FieldValue.delete() };
    const account = (await tx.get(db.collection('users').where('email', '==', email).limit(1))).docs[0];
    if (account) {
      if (account.get('role') === 'admin') throw new HttpsError('failed-precondition', 'An admin account cannot be changed.');
      const theirs = account.get('staffSchoolId');
      if (school && account.get('role') === 'staff' && theirs && theirs !== school) {
        throw new HttpsError('permission-denied', 'This staff member works for another school.');
      }
      tx.update(account.ref, fields);
      return { ok: true, status: 'UPDATED' };
    }
    tx.set(db.doc(`seedProfiles/${email}`), fields, { merge: true });
    return { ok: true, status: staff ? 'PENDING_SIGNUP' : 'UPDATED' };
  });
});
