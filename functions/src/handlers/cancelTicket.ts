import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CancelTicketResponse } from '../api';
import { enqueueChainOps } from '../chain/outbox';
import { REASON } from '../chain/ids';
import { candidateOrder, isDomainAllowed } from '../domain/ticket';
import { db } from '../firebase';
import { lotteryClosed, poolTicket } from '../lottery/rounds';
import { eventFromSnap, qrTokenRef, readDocId, requireAuth, ticketFromSnap } from './boundary';
import { callableOptions } from './callableOptions';

const unitRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const cancelTicket = onCall<unknown, Promise<CancelTicketResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx): Promise<CancelTicketResponse> => {
    const ticketSnap = await tx.get(ticketRef);
    const ticket = ticketFromSnap(ticketSnap);
    if (!ticket) throw new HttpsError('not-found', 'Ticket not found.');
    if (ticket.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'Not your ticket.');
    if (ticket.status === 'used') return { ok: false, reason: 'TICKET_USED' };

    const eventRef = db.doc(`events/${ticket.eventId}`);
    const eventSnap = await tx.get(eventRef);
    const event = eventFromSnap(eventSnap)!;
    // After the draw closes no round would ever take a pooled ticket, so it is released as below instead.
    const lotteryOpen = event.reassignMode === 'lottery' && !(await lotteryClosed(tx, db, ticket.eventId, eventSnap.data()!, Date.now()));
    if (lotteryOpen) {
      // The ticket waits for the next draw (lottery/rounds.ts). Nothing on chain yet: the token stays where it
      // is until a winner claims it, so the cancel time and the eventual holder are not linked on chain.
      const fromName = ((await tx.get(db.doc(`users/${caller.uid}`))).get('name') as string | undefined) ?? '';
      const reassignmentRef = db.collection('reassignments').doc();
      tx.create(reassignmentRef, {
        ticketId,
        eventId: ticket.eventId,
        nftNumber: ticket.nftNumber,
        fromUid: caller.uid,
        fromName,
        toUid: null,
        toName: null,
        mode: 'lottery',
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.delete(qrTokenRef(ticketId));
      poolTicket(tx, ticketRef, reassignmentRef.id);
      return { ok: true, outcome: 'POOLED' };
    }
    const waitlist = eventRef.collection('waitlist');
    const waiting = (await tx.get(waitlist.where('status', '==', 'waiting'))).docs.map((d) => ({
      email: d.id,
      order: d.get('order') as number,
    }));

    const fromName = ((await tx.get(db.doc(`users/${caller.uid}`))).get('name') as string | undefined) ?? '';
    let recipient: { uid: string; email: string; name: string } | null = null;
    // A lottery event past its close gives nobody the ticket here: it is released like the pool at the close.
    for (const entry of event.reassignMode === 'lottery' ? [] : candidateOrder(event.reassignMode, waiting, unitRandom)) {
      if (!isDomainAllowed(event, entry.email)) continue;
      const account = (await tx.get(db.collection('users').where('email', '==', entry.email).limit(1))).docs[0];
      if (!account) continue;
      const held = await tx.get(
        db.collection('tickets').where('eventId', '==', ticket.eventId).where('ownerUid', '==', account.id).limit(1),
      );
      if (!held.empty) continue;
      recipient = { uid: account.id, email: entry.email, name: (account.get('name') as string | undefined) ?? '' };
      break;
    }

    // eventId and fromUid let issueTicket refuse a student who cancelled. The names and number are for the admin list.
    const reassignmentRef = db.collection('reassignments').doc();
    tx.create(reassignmentRef, {
      ticketId,
      eventId: ticket.eventId,
      nftNumber: ticket.nftNumber,
      fromUid: caller.uid,
      fromName,
      toUid: recipient?.uid ?? null,
      toName: recipient?.name ?? null,
      mode: event.reassignMode,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.delete(qrTokenRef(ticketId));
    const chainOp = recipient
      ? ({
          kind: 'reassign',
          toUid: recipient.uid,
          reason: event.reassignMode === 'random' ? REASON.CANCEL_RANDOM : REASON.CANCEL_QUEUE,
          reassignmentId: reassignmentRef.id,
        } as const)
      : ({ kind: 'release', reason: REASON.CANCEL_RELEASED, reassignmentId: reassignmentRef.id } as const);
    const { chainSeq } = enqueueChainOps(tx, ticketRef, ticketSnap.data()!, [chainOp]);
    const chain = { chainSeq, 'chain.status': 'pending' };
    if (recipient) {
      tx.update(ticketRef, { ownerUid: recipient.uid, qrToken: null, qrExpiresAt: null, ...chain });
      tx.update(waitlist.doc(recipient.email), { status: 'assigned', assignedTicketId: ticketId });
      return { ok: true, outcome: 'REASSIGNED' };
    }
    tx.update(ticketRef, { status: 'cancelled', ownerUid: null, qrToken: null, qrExpiresAt: null, ...chain });
    tx.update(eventRef, { issuedCount: FieldValue.increment(-1) });
    return { ok: true, outcome: 'RELEASED' };
  });
});
