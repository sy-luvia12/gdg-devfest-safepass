import { describe, expect, it } from 'vitest';
import {
  decideEntry,
  candidateOrder,
  emailDomain,
  isDomainAllowed,
  formatNftNumber,
  formatQrPayload,
  parseQrPayload,
  scanResultFor,
  type Ticket,
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

describe('candidateOrder', () => {
  const entries = [
    { email: 'c@korea.ac.kr', order: 3 },
    { email: 'a@korea.ac.kr', order: 1 },
    { email: 'b@korea.ac.kr', order: 2 },
  ];
  const emails = (list: { email: string }[]) => list.map((e) => e.email);

  it('queue mode sorts by order and leaves the input untouched', () => {
    const copy = [...entries];
    expect(emails(candidateOrder('queue', entries, () => 0.5))).toEqual(['a@korea.ac.kr', 'b@korea.ac.kr', 'c@korea.ac.kr']);
    expect(entries).toEqual(copy);
  });

  it('random mode follows the rng, so the same draw gives the same order', () => {
    expect(emails(candidateOrder('random', entries, () => 0))).toEqual(['a@korea.ac.kr', 'b@korea.ac.kr', 'c@korea.ac.kr']);
    expect(emails(candidateOrder('random', entries, () => 0.999))).toEqual(emails(entries));
  });

  it('random mode returns every entry exactly once', () => {
    const shuffled = candidateOrder('random', entries, Math.random);
    expect(emails(shuffled).sort()).toEqual(emails(entries).sort());
  });

  it('an empty waitlist stays empty in both modes', () => {
    expect(candidateOrder('queue', [], Math.random)).toEqual([]);
    expect(candidateOrder('random', [], Math.random)).toEqual([]);
  });
});

describe('isDomainAllowed', () => {
  const event = { allowedDomains: ['korea.ac.kr'] };

  it('accepts a listed domain regardless of case', () => {
    expect(isDomainAllowed(event, 'Kim@Korea.AC.KR')).toBe(true);
  });

  it('rejects a personal gmail and a look-alike suffix', () => {
    expect(isDomainAllowed(event, 'kim@gmail.com')).toBe(false);
    expect(isDomainAllowed(event, 'kim@evilkorea.ac.kr')).toBe(false);
  });
});

describe('scanResultFor', () => {
  it('labels every verifyEntry rejection for the scan log', () => {
    expect(scanResultFor('USED')).toBe('used');
    expect(scanResultFor('EXPIRED')).toBe('expired');
    expect(scanResultFor('TOKEN_MISMATCH')).toBe('expired');
    expect(scanResultFor('INVALID_FORMAT')).toBe('invalid');
    expect(scanResultFor('NOT_FOUND')).toBe('invalid');
    expect(scanResultFor('WRONG_EVENT')).toBe('invalid');
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
