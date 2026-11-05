import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { SetStaffResponse } from '../api';
import { db } from '../firebase';
import { readString, requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';
import { schoolForEmail } from './rosterStore';

// An admin grants or removes the staff role by email. Someone who has not signed in yet gets it from
// seedProfiles on their first sign-in. Admin accounts are never changed here.
export const setStaff = onCall<unknown, Promise<SetStaffResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const email = readString(request.data, 'email').trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) throw new HttpsError('invalid-argument', 'email is not valid.');
  // Operator accounts (seed.ts) are never staff, even before their first sign-in
  if (email.endsWith('@ops.safepass.app')) throw new HttpsError('failed-precondition', 'An operator account cannot be changed.');
  const staff = (request.data as { staff?: unknown } | null)?.staff;
  if (typeof staff !== 'boolean') throw new HttpsError('invalid-argument', 'staff must be a boolean.');
  const role = staff ? 'staff' : 'student';

  return db.runTransaction(async (tx): Promise<SetStaffResponse> => {
    const admin = await requireRole(tx, caller.uid, ['admin']);
    // Staff added by a school admin work for that school only (operatorSchoolId). A team admin adds unscoped staff.
    const school: string | undefined = admin.adminSchoolId || undefined;
    const fields = staff ? { role, staffSchoolId: school ?? FieldValue.delete() } : { role, staffSchoolId: FieldValue.delete() };
    const account = (await tx.get(db.collection('users').where('email', '==', email).limit(1))).docs[0];
    const seedRef = db.doc(`seedProfiles/${email}`);
    const seed = account ? null : await tx.get(seedRef);
    if (account?.get('role') === 'admin') throw new HttpsError('failed-precondition', 'An admin account cannot be changed.');
    if (school) {
      // A school admin changes accounts of its own school only. Unscoped team staff (and team-added pending
      // staff) are left to team admins; everyone else is placed by staff school, school, or email domain.
      const teamStaff = account ? account.get('role') === 'staff' && !account.get('staffSchoolId') : seed?.get('role') === 'staff' && !seed.get('staffSchoolId');
      const known = account ? account.get('staffSchoolId') || account.get('schoolId') : seed?.get('staffSchoolId');
      const theirs = known || (await schoolForEmail(email, tx))?.id;
      if (teamStaff || theirs !== school) throw new HttpsError('permission-denied', 'This account does not belong to your school.');
    }
    if (account) {
      tx.update(account.ref, fields);
      return { ok: true, status: 'UPDATED' };
    }
    tx.set(db.doc(`seedProfiles/${email}`), fields, { merge: true });
    return { ok: true, status: staff ? 'PENDING_SIGNUP' : 'UPDATED' };
  });
});
