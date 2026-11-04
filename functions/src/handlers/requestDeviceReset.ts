import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { RequestDeviceResetResponse } from '../api';
import { db } from '../firebase';
import { requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';

// A student who changed phones asks the council for a reset. Asking again refreshes the request time.
export const requestDeviceReset = onCall<unknown, Promise<RequestDeviceResetResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);

  return db.runTransaction(async (tx): Promise<RequestDeviceResetResponse> => {
    const user = await requireRole(tx, caller.uid, ['student']);
    tx.set(db.doc(`deviceResets/${caller.uid}`), {
      uid: caller.uid,
      name: user.name ?? '',
      studentId: user.studentId ?? '',
      email: user.email ?? caller.email,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
      resolvedAt: null,
    });
    return { ok: true };
  });
});
