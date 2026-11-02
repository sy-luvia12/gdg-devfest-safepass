import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RefreshQrTokenResponse } from '../api';
import { formatQrPayload, QR_TTL_MS } from '../domain/ticket';
import { db } from '../firebase';
import { readDocId, requireAuth, ticketFromSnap } from './boundary';

export const refreshQrToken = onCall<unknown, Promise<RefreshQrTokenResponse>>(async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx) => {
    const ticket = ticketFromSnap(await tx.get(ticketRef));
    if (!ticket) throw new HttpsError('not-found', 'Ticket not found.');
    if (ticket.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'Not your ticket.');
    if (ticket.status === 'used') throw new HttpsError('failed-precondition', 'Ticket already used.');

    const token = randomBytes(16).toString('base64url');
    const expiresAt = Date.now() + QR_TTL_MS;
    tx.update(ticketRef, { qrToken: token, qrExpiresAt: Timestamp.fromMillis(expiresAt) });
    return { qrPayload: formatQrPayload(ticketId, token), expiresAt };
  });
});
