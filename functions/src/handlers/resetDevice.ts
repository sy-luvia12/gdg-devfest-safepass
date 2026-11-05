import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ResetDeviceResponse } from '../api';
import { ACTION } from '../chain/ids';
import { enqueueAction } from '../chain/outbox';
import { db } from '../firebase';
import { isOperator, readDocId, requireAuth, requireRole } from './boundary';
import { callableOptions } from './callableOptions';
import { schoolForEmail } from './rosterStore';

export const resetDevice = onCall<unknown, Promise<ResetDeviceResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const uid = readDocId(request.data, 'uid');

  return db.runTransaction(async (tx): Promise<ResetDeviceResponse> => {
    const admin = await requireRole(tx, caller.uid, ['admin']);
    // An event admin resets devices of its own school's students only; the operator any; an unassigned admin none.
    if (!isOperator(admin)) {
      if (!admin.adminSchoolId) throw new HttpsError('permission-denied', 'No school assigned to this admin yet.');
      const target = await tx.get(db.doc(`users/${uid}`));
      const school = target.get('schoolId') || (await schoolForEmail(target.get('email') ?? '', tx))?.id;
      if (school !== admin.adminSchoolId) throw new HttpsError('permission-denied', 'This student belongs to another school.');
    }
    const request = db.doc(`deviceResets/${uid}`);
    const pending = (await tx.get(request)).exists;
    const device = await tx.get(db.doc(`devices/${uid}`));
    // Resetting a bound device moves the student's live tickets to whatever device signs in next: a lost-phone
    // reissue. Each one is recorded on chain for its event, so the board shows how often the council did it.
    if (device.exists) {
      const live = await tx.get(db.collection('tickets').where('ownerUid', '==', uid).where('status', '==', 'issued'));
      for (const t of live.docs) enqueueAction(tx, t.get('eventId') as string, ACTION.LOST_REISSUE, `resetDevice ${t.id}`);
    }
    tx.delete(db.doc(`devices/${uid}`));
    if (pending) tx.update(request, { status: 'done', resolvedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
});
