import type { ReassignMode, ScanResult, VerifyEntryReason } from '../api';

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
  // Only ever grows, so ticket numbers stay unique when a cancelled ticket lowers issuedCount.
  nftSeq: number;
  enteredCount: number;
  reassignMode: ReassignMode;
  requireDevice: boolean;
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

// Admin-facing label for a verifyEntry outcome. The token mismatch is shown as expired, like the scanner screen does.
const scanResults: Record<VerifyEntryReason, ScanResult> = {
  INVALID_FORMAT: 'invalid',
  NOT_FOUND: 'invalid',
  TOKEN_MISMATCH: 'expired',
  EXPIRED: 'expired',
  USED: 'used',
};

export function scanResultFor(reason: VerifyEntryReason): ScanResult {
  return scanResults[reason];
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

export interface WaitlistEntry {
  email: string;
  order: number;
}

// The order in which waitlist entries are tried for a cancelled ticket. The first eligible entry wins,
// so a shuffle gives every eligible entry the same chance.
export function candidateOrder(mode: ReassignMode, waiting: readonly WaitlistEntry[], rng: () => number): WaitlistEntry[] {
  const entries = [...waiting];
  if (mode === 'queue') return entries.sort((a, b) => a.order - b.order);
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
}

export function isDomainAllowed(event: Pick<FestivalEvent, 'allowedDomains'>, email: string): boolean {
  return event.allowedDomains.includes(emailDomain(email));
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

export function formatNftNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}
