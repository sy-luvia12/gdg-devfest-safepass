import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { VerifyEntryResponse } from '../api';
import { decideEntry, parseQrPayload, scanResultFor } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, qrTokenRef, readString, requireAuth, requireRole, ticketFromSnap } from './boundary';

export const verifyEntry = onCall<unknown, Promise<VerifyEntryResponse>>(async (request) => {
  const caller = requireAuth(request);
  const raw = readString(request.data, 'qrPayload');

  return db.runTransaction(async (tx): Promise<VerifyEntryResponse> => {
    const staff = await requireRole(tx, caller.uid, ['staff', 'admin']);
    const qr = parseQrPayload(raw);
    const ticket = qr
      ? ticketFromSnap(await tx.get(db.doc(`tickets/${qr.ticketId}`)), await tx.get(qrTokenRef(qr.ticketId)))
      : null;
    const decision = qr ? decideEntry(ticket, qr.token, Date.now()) : ({ ok: false, reason: 'INVALID_FORMAT' } as const);
    const owner = ticket ? ((await tx.get(db.doc(`users/${ticket.ownerUid}`))).data() ?? null) : null;
    const eventRef = decision.ok ? db.doc(`events/${decision.ticket.eventId}`) : null;
    const event = eventRef ? eventFromSnap(await tx.get(eventRef))! : null;

    tx.create(db.collection('scanLogs').doc(), {
      eventId: ticket?.eventId ?? null,
      ticketId: ticket?.id ?? null,
      studentName: owner?.name ?? null,
      studentId: owner?.studentId ?? null,
      staffUid: caller.uid,
      staffName: staff.name ?? '',
      result: decision.ok ? 'ok' : scanResultFor(decision.reason),
      scannedAt: FieldValue.serverTimestamp(),
    });
    if (!decision.ok) return decision;

    tx.update(db.doc(`tickets/${decision.ticket.id}`), {
      status: 'used',
      usedAt: FieldValue.serverTimestamp(),
      qrToken: null,
      qrExpiresAt: null,
    });
    tx.update(eventRef!, { enteredCount: FieldValue.increment(1) });
    tx.delete(qrTokenRef(decision.ticket.id));

    return {
      ok: true,
      ticketId: decision.ticket.id,
      holder: { name: owner?.name ?? '', studentId: owner?.studentId ?? '', photoUrl: owner?.photoUrl ?? null },
      enteredCount: event!.enteredCount + 1,
      capacity: event!.capacity,
    };
  });
});
