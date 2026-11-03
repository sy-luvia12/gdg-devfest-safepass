import { onCall } from 'firebase-functions/v2/https';
import type { ResetDeviceResponse } from '../api';
import { db } from '../firebase';
import { readDocId, requireAuth, requireRole } from './boundary';

export const resetDevice = onCall<unknown, Promise<ResetDeviceResponse>>(async (request) => {
  const caller = requireAuth(request);
  const uid = readDocId(request.data, 'uid');

  return db.runTransaction(async (tx): Promise<ResetDeviceResponse> => {
    await requireRole(tx, caller.uid, ['admin']);
    tx.delete(db.doc(`devices/${uid}`));
    return { ok: true };
  });
});
