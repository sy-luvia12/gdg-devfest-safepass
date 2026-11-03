import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RefreshQrTokenResponse } from '../api';
import { deviceFailure, parseDeviceKey } from '../domain/device';
import { formatQrPayload, QR_TTL_MS } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, qrTokenRef, readDeviceProof, readDocId, requireAuth, ticketFromSnap } from './boundary';

export const refreshQrToken = onCall<unknown, Promise<RefreshQrTokenResponse>>(async (request) => {
  const caller = requireAuth(request);
  const ticketId = readDocId(request.data, 'ticketId');
  const proof = readDeviceProof(request.data);
  const ticketRef = db.doc(`tickets/${ticketId}`);

  return db.runTransaction(async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    const ticket = ticketFromSnap(ticketSnap);
    if (!ticket) throw new HttpsError('not-found', 'Ticket not found.');
    if (ticket.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'Not your ticket.');
    if (ticket.status === 'used') throw new HttpsError('failed-precondition', 'Ticket already used.');

    const event = eventFromSnap(await tx.get(db.doc(`events/${ticket.eventId}`)))!;
    if (event.requireDevice) {
      const device = parseDeviceKey((await tx.get(db.doc(`devices/${caller.uid}`))).get('publicKeyJwk'));
      const reason = deviceFailure(device, ticketId, proof, Date.now());
      if (reason) throw new HttpsError('failed-precondition', reason, { reason });
    }

    const token = randomBytes(16).toString('base64url');
    const expiresAt = Date.now() + QR_TTL_MS;
    tx.set(qrTokenRef(ticketId), { token, expiresAt: Timestamp.fromMillis(expiresAt) });
    // Tickets issued before qrTokens existed may still carry a readable token.
    if (ticketSnap.get('qrToken')) tx.update(ticketRef, { qrToken: null, qrExpiresAt: null });
    return { qrPayload: formatQrPayload(ticketId, token), expiresAt };
  });
});
