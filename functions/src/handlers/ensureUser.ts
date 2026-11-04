import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { EnsureUserResponse, UserProfile } from '../api';
import { db } from '../firebase';
import { requireAuth } from './boundary';

export const ensureUser = onCall<unknown, Promise<EnsureUserResponse>>(async (request) => {
  const caller = requireAuth(request);
  const userRef = db.doc(`users/${caller.uid}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) return profileOf(caller.uid, existing.data()!);

    const seed = caller.email && !caller.email.includes('/') ? await tx.get(db.doc(`seedProfiles/${caller.email}`)) : null;
    const s = seed?.data();
    const profile: UserProfile = {
      uid: caller.uid,
      email: caller.email,
      name: s?.name ?? caller.name,
      studentId: s?.studentId ?? '',
      photoUrl: s?.photoUrl ?? caller.picture,
      role: s?.role ?? 'student',
      verifyStatus: s?.verifyStatus === 'approved' ? 'approved' : 'none',
    };
    const { uid: _uid, ...fields } = profile;
    tx.set(userRef, { ...fields, createdAt: FieldValue.serverTimestamp() });
    return profile;
  });
});

export function profileOf(uid: string, d: DocumentData): UserProfile {
  return {
    uid, name: d.name, studentId: d.studentId, email: d.email, photoUrl: d.photoUrl ?? null, role: d.role,
    verifyStatus: d.verifyStatus ?? 'none', rejectReason: d.rejectReason ?? undefined, schoolId: d.schoolId,
  };
}
