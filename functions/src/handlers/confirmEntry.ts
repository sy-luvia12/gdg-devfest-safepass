import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ConfirmEntryResponse } from '../api';
import { db } from '../firebase';
import { eventFromSnap, readDocId, requireAuth, requireRole, ticketFromSnap } from './boundary';
import { callableOptions } from './callableOptions';
import { admitTicket, entryCheckRef, recordScan } from './entry';

export const confirmEntry = onCall<unknown, Promise<ConfirmEntryResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const match = (request.data as { match?: unknown }).match;
  if (typeof match !== 'boolean') throw new HttpsError('invalid-argument', 'match must be a boolean.');
  const ticketRef = db.doc(`tickets/${ticketId}`);
  const checkRef = entryCheckRef(ticketId);

  return db.runTransaction(async (tx): Promise<ConfirmEntryResponse> => {
    const staff = await requireRole(tx, caller.uid, ['staff', 'admin']);
    const check = await tx.get(checkRef);
    const ticketSnap = await tx.get(ticketRef);
    const ticket = ticketFromSnap(ticketSnap);
    const asked =
      check.exists && check.get('staffUid') === caller.uid && check.get('expiresAt').toMillis() > Date.now();
    if (!asked) return { ok: false, reason: 'NO_PENDING_CHECK' };
    if (!ticket) {
      tx.delete(checkRef);
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (ticket.status === 'used') {
      tx.delete(checkRef);
      return { ok: false, reason: 'USED' };
    }
    // A ticket reassigned since the scan belongs to someone whose photo was not compared.
    if (check.get('ownerUid') !== ticket.ownerUid) return { ok: false, reason: 'NO_PENDING_CHECK' };

    const owner = (await tx.get(db.doc(`users/${ticket.ownerUid}`))).data() ?? null;
    const eventRef = db.doc(`events/${ticket.eventId}`);
    const event = eventFromSnap(await tx.get(eventRef))!;
    const scan = { eventId: ticket.eventId, ticketId, owner, staffUid: caller.uid, staffName: staff.name ?? '' };

    tx.delete(checkRef);
    if (!match) {
      recordScan(tx, { ...scan, result: 'mismatch' });
      return { ok: false, reason: 'MISMATCH' };
    }
    recordScan(tx, { ...scan, result: 'ok' });
    const enteredCount = admitTicket(tx, ticketRef, ticketSnap.data()!, eventRef, event.enteredCount);
    return { ok: true, ticketId, enteredCount, capacity: event.capacity };
  });
});
