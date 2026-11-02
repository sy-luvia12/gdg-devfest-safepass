import { describe, expect, it } from 'vitest';
import {
  decideEntry,
  decideTransfer,
  emailDomain,
  formatNftNumber,
  formatQrPayload,
  parseQrPayload,
  type Ticket,
  type TransferFacts,
} from '../src/domain/ticket';

const NOW = 1_700_000_000_000;
const base = { id: 't1', eventId: 'demo-festival', ownerUid: 'alice', nftNumber: '#0001' };
const issued = (qr: { token: string; expiresAtMs: number } | null): Ticket => ({ ...base, status: 'issued', qr });
const used: Ticket = { ...base, status: 'used', usedAtMs: NOW - 1000 };

describe('parseQrPayload', () => {
  it('reads ticketId and token from a TTV1 payload', () => {
    expect(parseQrPayload('TTV1:abc123:tok_-9')).toEqual({ ticketId: 'abc123', token: 'tok_-9' });
  });

  it('round-trips what formatQrPayload produces', () => {
    expect(parseQrPayload(formatQrPayload('XyZ', 'AAAA-_'))).toEqual({ ticketId: 'XyZ', token: 'AAAA-_' });
  });

  it.each([
    '',
    'TTV1:abc',
    'TTV2:abc:tok',
    'TTV1::tok',
    'TTV1:abc:',
    'TTV1:abc:tok:extra',
    'TTV1:a/b:tok',
    'https://example.com',
  ])('rejects %j', (raw) => {
    expect(parseQrPayload(raw)).toBeNull();
  });
});

describe('decideEntry', () => {
  const fresh = issued({ token: 'good', expiresAtMs: NOW + 10_000 });

  it('admits a ticket with the current, unexpired token', () => {
    expect(decideEntry(fresh, 'good', NOW)).toEqual({ ok: true, ticket: fresh });
  });

  it('rejects a missing ticket as NOT_FOUND', () => {
    expect(decideEntry(null, 'good', NOW)).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('reports USED before checking the token', () => {
    expect(decideEntry(used, 'anything', NOW)).toEqual({ ok: false, reason: 'USED' });
  });

  it('rejects a replaced token as TOKEN_MISMATCH', () => {
    expect(decideEntry(fresh, 'old', NOW)).toEqual({ ok: false, reason: 'TOKEN_MISMATCH' });
  });

  it('rejects any token when none has been issued', () => {
    expect(decideEntry(issued(null), 'good', NOW)).toEqual({ ok: false, reason: 'TOKEN_MISMATCH' });
  });

  it('reports TOKEN_MISMATCH before EXPIRED', () => {
    const stale = issued({ token: 'good', expiresAtMs: NOW - 1 });
    expect(decideEntry(stale, 'old', NOW)).toEqual({ ok: false, reason: 'TOKEN_MISMATCH' });
  });

  it('rejects the right token after its expiry as EXPIRED', () => {
    const stale = issued({ token: 'good', expiresAtMs: NOW - 1 });
    expect(decideEntry(stale, 'good', NOW)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('still admits at the exact expiry instant', () => {
    const edge = issued({ token: 'good', expiresAtMs: NOW });
    expect(decideEntry(edge, 'good', NOW)).toEqual({ ok: true, ticket: edge });
  });
});

describe('decideTransfer', () => {
  const ok: TransferFacts = {
    ticket: issued(null),
    event: { faceValue: 10_000, allowedDomains: ['korea.ac.kr'] },
    price: 10_000,
    recipient: { email: 'bob@korea.ac.kr', hasTicket: false },
  };

  it('allows a transfer at face value to an allowed recipient without a ticket', () => {
    expect(decideTransfer(ok)).toEqual({ ok: true });
  });

  it('allows a free transfer', () => {
    expect(decideTransfer({ ...ok, price: 0 })).toEqual({ ok: true });
  });

  it('rejects a price above face value', () => {
    expect(decideTransfer({ ...ok, price: 10_001 })).toEqual({ ok: false, reason: 'OVER_FACE_VALUE' });
  });

  it('rejects an unknown recipient', () => {
    expect(decideTransfer({ ...ok, recipient: null })).toEqual({ ok: false, reason: 'RECIPIENT_NOT_FOUND' });
  });

  it('rejects a recipient outside allowedDomains', () => {
    const recipient = { email: 'bob@gmail.com', hasTicket: false };
    expect(decideTransfer({ ...ok, recipient })).toEqual({ ok: false, reason: 'RECIPIENT_NOT_ALLOWED' });
  });

  it('rejects a recipient who already holds a ticket', () => {
    const recipient = { email: 'bob@korea.ac.kr', hasTicket: true };
    expect(decideTransfer({ ...ok, recipient })).toEqual({ ok: false, reason: 'RECIPIENT_HAS_TICKET' });
  });

  it('rejects a used ticket', () => {
    expect(decideTransfer({ ...ok, ticket: used })).toEqual({ ok: false, reason: 'TICKET_USED' });
  });

  it('applies rules in api.md order when several fail', () => {
    const everythingWrong: TransferFacts = { ...ok, ticket: used, price: 99_999, recipient: null };
    expect(decideTransfer(everythingWrong)).toEqual({ ok: false, reason: 'OVER_FACE_VALUE' });
    expect(decideTransfer({ ...everythingWrong, price: 0 })).toEqual({ ok: false, reason: 'RECIPIENT_NOT_FOUND' });
    const gmailHolder = { email: 'bob@gmail.com', hasTicket: true };
    expect(decideTransfer({ ...everythingWrong, price: 0, recipient: gmailHolder })).toEqual({
      ok: false,
      reason: 'RECIPIENT_NOT_ALLOWED',
    });
  });
});

describe('emailDomain', () => {
  it('returns the lowercased domain', () => {
    expect(emailDomain('Kim@Korea.AC.KR')).toBe('korea.ac.kr');
  });

  it('returns an empty string without an @', () => {
    expect(emailDomain('not-an-email')).toBe('');
  });
});

describe('formatNftNumber', () => {
  it('pads to four digits', () => {
    expect(formatNftNumber(1)).toBe('#0001');
    expect(formatNftNumber(12)).toBe('#0012');
    expect(formatNftNumber(1234)).toBe('#1234');
  });

  it('does not truncate past four digits', () => {
    expect(formatNftNumber(12345)).toBe('#12345');
  });
});
