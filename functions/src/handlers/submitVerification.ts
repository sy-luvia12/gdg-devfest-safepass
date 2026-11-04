import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { UserProfile } from '../api';
import { db } from '../firebase';
import { lookupStudent } from '../sheets/studentRegistry';
import { readString, requireAuth, requireRole } from './boundary';
import { profileOf } from './ensureUser';

function image(data: unknown, field: string): string {
  const value = readString(data, field);
  // ImagePicker emits reduced JPEGs. Bound Firestore document and request sizes.
  if (value.length > 350_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'A JPEG photo under 350 KB is required.');
  }
  return value;
}

export const submitVerification = onCall<unknown, Promise<UserProfile>>(async (request) => {
  const caller = requireAuth(request);
  if (!caller.emailVerified) throw new HttpsError('permission-denied', 'Verified school email required.');
  const ref = db.doc(`users/${caller.uid}`);
  const existing = await db.runTransaction((tx) => requireRole(tx, caller.uid, ['student']));
  if (existing.verifyStatus === 'approved') return profileOf(caller.uid, existing);
  const name = readString(request.data, 'name').trim();
  const studentId = readString(request.data, 'studentId').trim();
  if (!name || name.length > 100 || !studentId || studentId.length > 40) {
    throw new HttpsError('invalid-argument', 'Invalid student identity.');
  }
  const photoUrl = image(request.data, 'photo');
  const idCard = image(request.data, 'idCard');
  // The caller cannot choose school, email, role or verification outcome.
  const domain = caller.email.split('@')[1] ?? '';
  const schools = await db.collection('schools').where('domains', 'array-contains', domain).limit(2).get();
  if (schools.size !== 1) throw new HttpsError('permission-denied', 'School domain is not uniquely configured.');
  const schoolId = schools.docs[0].id;
  const matched = await lookupStudent({ schoolId, studentId, name, email: caller.email });
  return db.runTransaction(async (tx) => {
    const user = await requireRole(tx, caller.uid, ['student']);
    if (user.verifyStatus === 'approved') return profileOf(caller.uid, user);
    const update = {
      schoolId, name, studentId, email: caller.email, photoUrl,
      verifyStatus: matched ? 'approved' : 'rejected',
      rejectReason: matched ? null : '학적 명단과 일치하지 않아요. 이름·학번·학교 계정을 확인하고 학교 담당자에게 문의해 주세요.',
      submittedAt: FieldValue.serverTimestamp(),
    };
    tx.update(ref, update);
    // ID photos must never be returned in the user profile or staff scan response.
    // No client read/write rules exist for this collection.
    tx.set(db.doc(`verificationPhotos/${caller.uid}`), { idCard, submittedAt: FieldValue.serverTimestamp() });
    return profileOf(caller.uid, { ...user, ...update });
  });
});
