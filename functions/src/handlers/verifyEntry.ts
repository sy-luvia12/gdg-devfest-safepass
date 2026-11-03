import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { VerifyEntryResponse } from '../api';
import { decideEntry, parseQrPayload } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, readString, requireAuth, requireRole, ticketFromSnap } from './boundary';

export const verifyEntry = onCall<unknown, Promise<VerifyEntryResponse>>(async (request) => {
  const caller = requireAuth(request);
  const raw = readString(request.data, 'qrPayload');

  return db.runTransaction(async (tx): Promise<VerifyEntryResponse> => {
    await requireRole(tx, caller.uid, ['staff', 'admin']);
    const qr = parseQrPayload(raw);
    if (!qr) return { ok: false, reason: 'INVALID_FORMAT' };

    const ticketRef = db.doc(`tickets/${qr.ticketId}`);
    const ticket = ticketFromSnap(await tx.get(ticketRef));
    const decision = decideEntry(ticket, qr.token, Date.now());
    if (!decision.ok) return decision;
    const admitted = decision.ticket;

    const eventRef = db.doc(`events/${admitted.eventId}`);
    const [eventSnap, ownerSnap] = await Promise.all([tx.get(eventRef), tx.get(db.doc(`users/${admitted.ownerUid}`))]);
    const event = eventFromSnap(eventSnap)!;
    const owner = ownerSnap.data() ?? {};

    tx.update(ticketRef, {
      status: 'used',
      usedAt: FieldValue.serverTimestamp(),
      qrToken: null,
      qrExpiresAt: null,
    });
    tx.update(eventRef, { enteredCount: FieldValue.increment(1) });

    return {
      ok: true,
      ticketId: admitted.id,
      holder: { name: owner.name ?? '', studentId: owner.studentId ?? '', photoUrl: owner.photoUrl ?? null },
      enteredCount: event.enteredCount + 1,
      capacity: event.capacity,
    };
  });
});
