import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { CONFIRM_WINDOW_MS, type VerifyEntryReason, type VerifyEntryResponse } from '../api';
import { parseDeviceKey, qrSignatureIsValid } from '../domain/device';
import { decideEntry, parseQrPayload, scanResultFor, type FestivalEvent, type QrPayload } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, qrTokenRef, readDocId, readString, requireAuth, requireEventSchool, requireRole, ticketFromSnap } from './boundary';
import { callableOptions } from './callableOptions';
import { admitTicket, entryCheckRef, holderOf, recordScan } from './entry';

// What a scan that passed every check leads to.
type Verdict = { kind: 'admit' } | { kind: 'awaitConfirm' };

function passedVerdict(event: FestivalEvent): Verdict {
  return event.twoStepCheck ? { kind: 'awaitConfirm' } : { kind: 'admit' };
}

// The server-issued token is single use (deleted on entry), so a signed QR needs no nonce store.
function signatureAllowed(qr: QrPayload, event: FestivalEvent, deviceKeyRaw: unknown, nowMs: number): boolean {
  if (qr.version === 1) return !event.requireDevice;
  const key = parseDeviceKey(deviceKeyRaw);
  return key !== null && qrSignatureIsValid(key, qr, nowMs);
}

export const verifyEntry = onCall<unknown, Promise<VerifyEntryResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const raw = readString(request.data, 'qrPayload');
  const data = request.data as { eventId?: unknown } | null;
  const expectedEventId = data?.eventId === undefined ? null : readDocId(request.data, 'eventId');

  return db.runTransaction(async (tx): Promise<VerifyEntryResponse> => {
    const staff = await requireRole(tx, caller.uid, ['staff', 'admin']);
    const nowMs = Date.now();
    const qr = parseQrPayload(raw);
    const ticketSnap = qr ? await tx.get(db.doc(`tickets/${qr.ticketId}`)) : null;
    const ticket = qr && ticketSnap ? ticketFromSnap(ticketSnap, await tx.get(qrTokenRef(qr.ticketId))) : null;
    // Staff check only their own school's events: the event the scanner chose, or the ticket's event on older clients.
    const checkedEventId = expectedEventId ?? ticket?.eventId;
    if (checkedEventId) await requireEventSchool(tx, staff, checkedEventId);
    // A ticket for another school's event is refused before anything else, so it never counts as entered here.
    const decision: ReturnType<typeof decideEntry> | { ok: false; reason: VerifyEntryReason } = !qr
      ? { ok: false, reason: 'INVALID_FORMAT' }
      : ticket && expectedEventId && ticket.eventId !== expectedEventId
        ? { ok: false, reason: 'WRONG_EVENT' }
        : decideEntry(ticket, qr.token, nowMs);
    // Another school's student stays out of this event's scan log.
    const otherEvent = !decision.ok && decision.reason === 'WRONG_EVENT';
    const owner = ticket && !otherEvent ? ((await tx.get(db.doc(`users/${ticket.ownerUid}`))).data() ?? null) : null;
    const eventRef = decision.ok ? db.doc(`events/${decision.ticket.eventId}`) : null;
    const event = eventRef ? eventFromSnap(await tx.get(eventRef))! : null;

    // Logged under the scanner's event so that event's admin sees the refused attempt.
    const scan = {
      eventId: expectedEventId ?? ticket?.eventId ?? null,
      ticketId: otherEvent ? null : (ticket?.id ?? null),
      owner,
      staffUid: caller.uid,
      staffName: staff.name ?? '',
    };
    const reject = (reason: VerifyEntryReason): VerifyEntryResponse => {
      recordScan(tx, { ...scan, result: scanResultFor(reason) });
      return { ok: false, reason };
    };
    if (!decision.ok) return reject(decision.reason);

    // The signature is checked last: a QR that fails an earlier rule keeps that rule's reason, and the holder is
    // only ever returned for a QR that passed everything.
    const deviceKeyRaw = qr!.version === 2 ? (await tx.get(db.doc(`devices/${decision.ticket.ownerUid}`))).get('publicKeyJwk') : null;
    const verdict = signatureAllowed(qr!, event!, deviceKeyRaw, nowMs) ? passedVerdict(event!) : null;
    if (!verdict) return reject('SIGNATURE_INVALID');

    const base = { ok: true as const, ticketId: decision.ticket.id, holder: holderOf(owner), capacity: event!.capacity };
    if (verdict.kind === 'awaitConfirm') {
      tx.set(entryCheckRef(decision.ticket.id), {
        ticketId: decision.ticket.id,
        eventId: decision.ticket.eventId,
        ownerUid: decision.ticket.ownerUid,
        staffUid: caller.uid,
        checkedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(nowMs + CONFIRM_WINDOW_MS),
      });
      return { ...base, enteredCount: event!.enteredCount, needsConfirm: true };
    }

    recordScan(tx, { ...scan, result: 'ok' });
    const enteredCount = admitTicket(tx, db.doc(`tickets/${decision.ticket.id}`), ticketSnap!.data()!, eventRef!, event!.enteredCount);
    return { ...base, enteredCount };
  });
});
