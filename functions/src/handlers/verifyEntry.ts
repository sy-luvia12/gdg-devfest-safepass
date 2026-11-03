import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { VerifyEntryReason, VerifyEntryResponse } from '../api';
import { decideEntry, parseQrPayload, scanResultFor } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, qrTokenRef, readDocId, readString, requireAuth, requireRole, ticketFromSnap } from './boundary';

export const verifyEntry = onCall<unknown, Promise<VerifyEntryResponse>>(async (request) => {
  const caller = requireAuth(request);
  const raw = readString(request.data, 'qrPayload');
  const data = request.data as { eventId?: unknown } | null;
  const expectedEventId = data?.eventId === undefined ? null : readDocId(request.data, 'eventId');

  return db.runTransaction(async (tx): Promise<VerifyEntryResponse> => {
    const staff = await requireRole(tx, caller.uid, ['staff', 'admin']);
    const qr = parseQrPayload(raw);
    const ticket = qr
      ? ticketFromSnap(await tx.get(db.doc(`tickets/${qr.ticketId}`)), await tx.get(qrTokenRef(qr.ticketId)))
      : null;
    // A ticket for another school's event is refused before anything else, so it never counts as entered here.
    const decision: ReturnType<typeof decideEntry> | { ok: false; reason: VerifyEntryReason } = !qr
      ? { ok: false, reason: 'INVALID_FORMAT' }
      : ticket && expectedEventId && ticket.eventId !== expectedEventId
        ? { ok: false, reason: 'WRONG_EVENT' }
        : decideEntry(ticket, qr.token, Date.now());
    // Another school's student stays out of this event's scan log.
    const otherEvent = !decision.ok && decision.reason === 'WRONG_EVENT';
    const owner = ticket && !otherEvent ? ((await tx.get(db.doc(`users/${ticket.ownerUid}`))).data() ?? null) : null;
    const eventRef = decision.ok ? db.doc(`events/${decision.ticket.eventId}`) : null;
    const event = eventRef ? eventFromSnap(await tx.get(eventRef))! : null;

    // Logged under the scanner's event so that event's admin sees the refused attempt.
    tx.create(db.collection('scanLogs').doc(), {
      eventId: expectedEventId ?? ticket?.eventId ?? null,
      ticketId: otherEvent ? null : (ticket?.id ?? null),
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
