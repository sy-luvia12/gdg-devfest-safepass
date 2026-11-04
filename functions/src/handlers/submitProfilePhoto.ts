import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { PROFILE_PHOTO_MAX_BYTES, type SubmitProfilePhotoResponse } from '../api';
import { isProfilePhoto } from '../domain/roster';
import { db } from '../firebase';
import { readString, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';
import { profileOf } from './ensureUser';

// Last sign-up step: the face photo the checker compares at the gate. Only after the roster check passed.
export const submitProfilePhoto = onCall<unknown, Promise<SubmitProfilePhotoResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const photoDataUrl = readString(request.data, 'photoDataUrl');
  if (!isProfilePhoto(photoDataUrl, PROFILE_PHOTO_MAX_BYTES)) {
    throw new HttpsError('invalid-argument', `photoDataUrl must be a JPEG data URL of at most ${PROFILE_PHOTO_MAX_BYTES} bytes.`);
  }

  return db.runTransaction(async (tx): Promise<SubmitProfilePhotoResponse> => {
    const ref = db.doc(`users/${caller.uid}`);
    const user = await tx.get(ref);
    if (!user.exists) throw new HttpsError('not-found', 'User profile missing. Call ensureUser first.');
    if (user.get('role') !== 'student' || !user.get('rosterVerified')) {
      throw new HttpsError('failed-precondition', 'Finish the roster check first.');
    }
    const fields = { photoUrl: photoDataUrl, photoSubmitted: true };
    tx.update(ref, fields);
    return { ok: true, profile: profileOf(caller.uid, { ...user.data(), ...fields }) };
  });
});
