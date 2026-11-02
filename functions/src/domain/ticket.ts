import type { TransferReason, VerifyEntryReason } from '../api';

export interface QrToken {
  token: string;
  expiresAtMs: number;
}

interface TicketBase {
  id: string;
  eventId: string;
  ownerUid: string;
  nftNumber: string;
}

export type Ticket =
  | (TicketBase & { status: 'issued'; qr: QrToken | null })
  | (TicketBase & { status: 'used'; usedAtMs: number });

export type IssuedTicket = Extract<Ticket, { status: 'issued' }>;

export interface FestivalEvent {
  id: string;
  name: string;
  capacity: number;
  faceValue: number;
  allowedDomains: string[];
  issuedCount: number;
  enteredCount: number;
}

export const QR_PREFIX = 'TTV1';
export const QR_TTL_MS = 30_000;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function formatQrPayload(ticketId: string, token: string): string {
  return `${QR_PREFIX}:${ticketId}:${token}`;
}

export function parseQrPayload(raw: string): { ticketId: string; token: string } | null {
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [prefix, ticketId, token] = parts;
  if (prefix !== QR_PREFIX || !ID_PATTERN.test(ticketId) || !ID_PATTERN.test(token)) return null;
  return { ticketId, token };
}

export type Decision<R> = { ok: true } | { ok: false; reason: R };

type EntryRejection = Exclude<VerifyEntryReason, 'INVALID_FORMAT'>;

// Order is the priority from docs/api.md 2.4: the first matching rule wins.
const entryRules: ReadonlyArray<[EntryRejection, (t: Ticket | null, token: string, nowMs: number) => boolean]> = [
  ['NOT_FOUND', (t) => t === null],
  ['USED', (t) => t?.status === 'used'],
  ['TOKEN_MISMATCH', (t, token) => t?.status === 'issued' && t.qr?.token !== token],
  ['EXPIRED', (t, _token, nowMs) => t?.status === 'issued' && t.qr !== null && nowMs > t.qr.expiresAtMs],
];

export function decideEntry(
  ticket: Ticket | null,
  token: string,
  nowMs: number,
): { ok: true; ticket: IssuedTicket } | { ok: false; reason: EntryRejection } {
  const hit = entryRules.find(([, rejects]) => rejects(ticket, token, nowMs));
  // No rule matched, so NOT_FOUND and USED did not either: the ticket exists and is issued.
  return hit ? { ok: false, reason: hit[0] } : { ok: true, ticket: ticket as IssuedTicket };
}

export interface TransferFacts {
  ticket: Ticket;
  event: Pick<FestivalEvent, 'faceValue' | 'allowedDomains'>;
  price: number;
  recipient: { email: string; hasTicket: boolean } | null;
}

// Order is the priority from docs/api.md 2.5: the first matching rule wins.
const transferRules: ReadonlyArray<[TransferReason, (f: TransferFacts) => boolean]> = [
  ['OVER_FACE_VALUE', (f) => f.price > f.event.faceValue],
  ['RECIPIENT_NOT_FOUND', (f) => f.recipient === null],
  ['RECIPIENT_NOT_ALLOWED', (f) => f.recipient !== null && !f.event.allowedDomains.includes(emailDomain(f.recipient.email))],
  ['RECIPIENT_HAS_TICKET', (f) => f.recipient?.hasTicket === true],
  ['TICKET_USED', (f) => f.ticket.status === 'used'],
];

export function decideTransfer(facts: TransferFacts): Decision<TransferReason> {
  const hit = transferRules.find(([, rejects]) => rejects(facts));
  return hit ? { ok: false, reason: hit[0] } : { ok: true };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

export function formatNftNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}
