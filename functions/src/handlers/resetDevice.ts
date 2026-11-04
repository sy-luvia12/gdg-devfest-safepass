import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { ResetDeviceResponse } from '../api';
import { db } from '../firebase';
import { readDocId, requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';

export const resetDevice = onCall<unknown, Promise<ResetDeviceResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const uid = readDocId(request.data, 'uid');

  return db.runTransaction(async (tx): Promise<ResetDeviceResponse> => {
    await requireRole(tx, caller.uid, ['admin']);
    const request = db.doc(`deviceResets/${uid}`);
    const pending = (await tx.get(request)).exists;
    tx.delete(db.doc(`devices/${uid}`));
    if (pending) tx.update(request, { status: 'done', resolvedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
});
