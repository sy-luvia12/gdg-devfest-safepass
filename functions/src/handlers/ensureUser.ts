import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { EnsureUserResponse, UserProfile } from '../api';
import { db } from '../firebase';
import { requireAuth } from './boundary';
import { callableOptions } from './callableOptions';

export const ensureUser = onCall<unknown, Promise<EnsureUserResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const userRef = db.doc(`users/${caller.uid}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) {
      const d = existing.data()!;
      // Every sign-in checks the roster again: a student who left the roster (graduated, on leave) signs up again.
      if (d.role === 'student' && d.rosterVerified && d.schoolId && d.studentId) {
        const row = await tx.get(db.doc(`schools/${d.schoolId}/roster/${d.studentId}`));
        if (!row.exists || row.get('claimedBy') !== caller.uid) {
          tx.update(userRef, { rosterVerified: false });
          return profileOf(caller.uid, { ...d, rosterVerified: false });
        }
      }
      return profileOf(caller.uid, d);
    }

    // A seeded role (staff, admin) goes only to an address the sign-in provider has verified: with email/password
    // sign-in on, anyone can register an address they do not own.
    const seed = caller.emailVerified && caller.email && !caller.email.includes('/') ? await tx.get(db.doc(`seedProfiles/${caller.email}`)) : null;
    const s = seed?.data();
    const profile: UserProfile = {
      uid: caller.uid,
      email: caller.email,
      name: s?.name ?? caller.name,
      studentId: s?.studentId ?? '',
      photoUrl: s?.photoUrl ?? caller.picture,
      role: s?.role ?? 'student',
      ...(s?.adminSchoolId ? { adminSchoolId: s.adminSchoolId } : {}),
      ...(s?.staffSchoolId ? { staffSchoolId: s.staffSchoolId } : {}),
      // Only an admin with no school can be the operator
      ...(s?.operator === true && s.role === 'admin' && !s.adminSchoolId ? { operator: true } : {}),
    };
    const { uid: _uid, ...fields } = profile;
    tx.set(userRef, { ...fields, createdAt: FieldValue.serverTimestamp() });
    return profile;
  });
});

export function profileOf(uid: string, d: DocumentData): UserProfile {
  return {
    uid,
    name: d.name,
    studentId: d.studentId,
    email: d.email,
    photoUrl: d.photoUrl ?? null,
    role: d.role,
    ...(d.adminSchoolId ? { adminSchoolId: d.adminSchoolId } : {}),
    ...(d.staffSchoolId ? { staffSchoolId: d.staffSchoolId } : {}),
    ...(d.schoolId ? { schoolId: d.schoolId } : {}),
    ...(d.rosterVerified ? { rosterVerified: true } : {}),
    ...(d.photoSubmitted ? { photoSubmitted: true } : {}),
    ...(d.operator === true ? { operator: true } : {}),
  };
}
