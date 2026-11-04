import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { IssueReason, IssueTicketResponse } from '../api';
import { emailDomain, formatNftNumber } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, readDocId, requireAuth, requireRole } from './boundary';

export const issueTicket = onCall<unknown, Promise<IssueTicketResponse>>(async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');

  return db.runTransaction(async (tx) => {
    await requireRole(tx, caller.uid, ['student']);
    const eventRef = db.doc(`events/${eventId}`);
    const event = eventFromSnap(await tx.get(eventRef));
    if (!event) throw new HttpsError('not-found', 'Event not found.');
    if (!caller.emailVerified || !event.allowedDomains.includes(emailDomain(caller.email))) {
      throw new HttpsError('permission-denied', 'This school domain cannot join this event.');
    }
    const owned = await tx.get(
      db.collection('tickets').where('eventId', '==', eventId).where('ownerUid', '==', caller.uid).limit(1),
    );
    if (!owned.empty) throw new HttpsError('already-exists', 'Already holding a ticket for this event.');
    if (!event.allowReissueAfterCancel) {
      const cancelled = await tx.get(
        db.collection('reassignments').where('fromUid', '==', caller.uid).where('eventId', '==', eventId).limit(1),
      );
      if (!cancelled.empty) {
        const reason: IssueReason = 'CANCELLED_BEFORE';
        throw new HttpsError('failed-precondition', 'A cancelled ticket cannot be taken again.', { reason });
      }
    }
    if (event.requireRoster && !(await tx.get(db.doc(`events/${eventId}/roster/${caller.email}`))).exists) {
      const reason: IssueReason = 'NOT_IN_ROSTER';
      throw new HttpsError('failed-precondition', 'Not on this event roster.', { reason });
    }
    if (event.issuedCount >= event.capacity) throw new HttpsError('resource-exhausted', 'Event is full.');

    const nftNumber = formatNftNumber(event.nftSeq + 1);
    const ticketRef = db.collection('tickets').doc();
    tx.update(eventRef, { issuedCount: FieldValue.increment(1), nftSeq: FieldValue.increment(1) });
    tx.create(ticketRef, {
      eventId,
      ownerUid: caller.uid,
      nftNumber,
      status: 'issued',
      qrToken: null,
      qrExpiresAt: null,
      issuedAt: FieldValue.serverTimestamp(),
      usedAt: null,
    });
    return { ticketId: ticketRef.id, nftNumber };
  });
});
