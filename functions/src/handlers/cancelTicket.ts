import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CancelTicketResponse } from '../api';
import { candidateOrder, isDomainAllowed } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, readDocId, requireAuth, ticketFromSnap } from './boundary';

const unitRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const cancelTicket = onCall<unknown, Promise<CancelTicketResponse>>(async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx): Promise<CancelTicketResponse> => {
    const ticket = ticketFromSnap(await tx.get(ticketRef));
    if (!ticket) throw new HttpsError('not-found', 'Ticket not found.');
    if (ticket.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'Not your ticket.');
    if (ticket.status === 'used') return { ok: false, reason: 'TICKET_USED' };

    const eventRef = db.doc(`events/${ticket.eventId}`);
    const event = eventFromSnap(await tx.get(eventRef))!;
    const waitlist = eventRef.collection('waitlist');
    const waiting = (await tx.get(waitlist.where('status', '==', 'waiting'))).docs.map((d) => ({
      email: d.id,
      order: d.get('order') as number,
    }));

    let recipient: { uid: string; email: string } | null = null;
    for (const entry of candidateOrder(event.reassignMode, waiting, unitRandom)) {
      if (!isDomainAllowed(event, entry.email)) continue;
      const account = (await tx.get(db.collection('users').where('email', '==', entry.email).limit(1))).docs[0];
      if (!account) continue;
      const held = await tx.get(
        db.collection('tickets').where('eventId', '==', ticket.eventId).where('ownerUid', '==', account.id).limit(1),
      );
      if (!held.empty) continue;
      recipient = { uid: account.id, email: entry.email };
      break;
    }

    tx.create(db.collection('reassignments').doc(), {
      ticketId,
      fromUid: caller.uid,
      toUid: recipient?.uid ?? null,
      mode: event.reassignMode,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (recipient) {
      tx.update(ticketRef, { ownerUid: recipient.uid, qrToken: null, qrExpiresAt: null });
      tx.update(waitlist.doc(recipient.email), { status: 'assigned', assignedTicketId: ticketId });
      return { ok: true, outcome: 'REASSIGNED' };
    }
    tx.update(ticketRef, { status: 'cancelled', ownerUid: null, qrToken: null, qrExpiresAt: null });
    tx.update(eventRef, { issuedCount: FieldValue.increment(-1) });
    return { ok: true, outcome: 'RELEASED' };
  });
});
