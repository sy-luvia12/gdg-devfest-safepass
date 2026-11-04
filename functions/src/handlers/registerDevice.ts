import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RegisterDeviceResponse } from '../api';
import { db } from '../firebase';
import { readDeviceKey, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';

export const registerDevice = onCall<unknown, Promise<RegisterDeviceResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const key = readDeviceKey(request.data);
  const ref = db.doc(`devices/${caller.uid}`);

  return db.runTransaction(async (tx): Promise<RegisterDeviceResponse> => {
    if ((await tx.get(ref)).exists) throw new HttpsError('already-exists', 'A device is already registered. Ask an admin to reset it.');
    tx.create(ref, { publicKeyJwk: key, registeredAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
});
