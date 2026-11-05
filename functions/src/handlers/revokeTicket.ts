import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RevokeTicketResponse } from '../api';
import { REASON } from '../chain/ids';
import { enqueueChainOps } from '../chain/outbox';
import { db } from '../firebase';
import { qrTokenRef, readDocId, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';

// 운영진 회수: the hosting school's admin (or the operator) takes back an unused ticket. The token is burned on chain
// with reason 4, which the public board shows as 부정 적발 회수, so a council cannot quietly pull tickets.
// The reassignment record (mode 'revoke') keeps the student from taking a ticket for this event again.
export const revokeTicket = onCall<unknown, Promise<RevokeTicketResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx): Promise<RevokeTicketResponse> => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Ticket not found.');
    const ticket = snap.data()!;
    const eventRef = db.doc(`events/${ticket.eventId}`);
    const hostSchool = ((await tx.get(eventRef)).get('schoolIds') as string[] | undefined)?.[0] ?? '';
    await requireSchoolAdmin(tx, caller.uid, hostSchool);
    if (ticket.status === 'used') return { ok: false, reason: 'TICKET_USED' };
    if (ticket.status !== 'issued' || !ticket.ownerUid) return { ok: false, reason: 'NOT_ISSUED' };

    const fromName = ((await tx.get(db.doc(`users/${ticket.ownerUid}`))).get('name') as string | undefined) ?? '';
    const reassignmentRef = db.collection('reassignments').doc();
    tx.create(reassignmentRef, {
      ticketId,
      eventId: ticket.eventId,
      nftNumber: ticket.nftNumber ?? null,
      fromUid: ticket.ownerUid,
      fromName,
      toUid: null,
      toName: null,
      mode: 'revoke',
      revokedBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.delete(qrTokenRef(ticketId));
    const { chainSeq } = enqueueChainOps(tx, ticketRef, ticket, [
      { kind: 'release', reason: REASON.ADMIN_REVOKE, reassignmentId: reassignmentRef.id },
    ]);
    tx.update(ticketRef, { status: 'cancelled', ownerUid: null, qrToken: null, qrExpiresAt: null, chainSeq, 'chain.status': 'pending' });
    tx.update(eventRef, { issuedCount: FieldValue.increment(-1) });
    return { ok: true };
  });
});
