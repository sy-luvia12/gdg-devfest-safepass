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
    await requireRole(tx, caller.uid, ['admin']);
    const account = (await tx.get(db.collection('users').where('email', '==', email).limit(1))).docs[0];
    if (account) {
      if (account.get('role') === 'admin') throw new HttpsError('failed-precondition', 'An admin account cannot be changed.');
      tx.update(account.ref, { role });
      return { ok: true, status: 'UPDATED' };
    }
    tx.set(db.doc(`seedProfiles/${email}`), { role }, { merge: true });
    return { ok: true, status: staff ? 'PENDING_SIGNUP' : 'UPDATED' };
  });
});
