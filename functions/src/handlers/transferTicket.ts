import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { TransferTicketResponse } from '../api';
import { decideTransfer } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, readDocId, readPrice, readString, requireAuth, ticketFromSnap } from './boundary';

export const transferTicket = onCall<unknown, Promise<TransferTicketResponse>>(async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const toEmail = readString(request.data, 'toEmail').trim().toLowerCase();
  const price = readPrice(request.data);
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx): Promise<TransferTicketResponse> => {
    const ticket = ticketFromSnap(await tx.get(ticketRef));
    if (!ticket) throw new HttpsError('not-found', 'Ticket not found.');
    if (ticket.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'Not your ticket.');
    const event = eventFromSnap(await tx.get(db.doc(`events/${ticket.eventId}`)))!;

    const found = (await tx.get(db.collection('users').where('email', '==', toEmail).limit(1))).docs[0];
    let recipient: { uid: string; email: string; hasTicket: boolean } | null = null;
    if (found) {
      const held = await tx.get(
        db.collection('tickets').where('eventId', '==', ticket.eventId).where('ownerUid', '==', found.id).limit(1),
      );
      recipient = { uid: found.id, email: found.get('email'), hasTicket: !held.empty };
    }

    const decision = decideTransfer({ ticket, event, price, recipient });

    tx.create(db.collection('transfers').doc(), {
      ticketId,
      fromUid: caller.uid,
      toUid: recipient?.uid ?? null,
      price,
      result: decision.ok ? 'success' : 'rejected',
      reason: decision.ok ? null : decision.reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (decision.ok) {
      tx.update(ticketRef, { ownerUid: recipient!.uid, qrToken: null, qrExpiresAt: null });
    }
    return decision;
  });
});
