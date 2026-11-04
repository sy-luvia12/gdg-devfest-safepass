import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deviceFailure, parseDeviceKey, PROOF_WINDOW_MS, qrSignatureIsValid, qrSignatureMessage, refreshProofMessage } from '../src/domain/device';
import { parseQrPayload, type SignedQr } from '../src/domain/ticket';

const NOW = 1_700_000_000_000;

function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    jwk: publicKey.export({ format: 'jwk' }),
    key: parseDeviceKey(publicKey.export({ format: 'jwk' }))!,
    signQr: (ticketId: string, token: string, signedAt: number): SignedQr => ({
      version: 2,
      ticketId,
      token,
      signedAt,
      signature: sign('sha256', Buffer.from(qrSignatureMessage(ticketId, token, signedAt)), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url'),
    }),
    proof: (ticketId: string, signedAt: number) => ({
      signedAt,
      signature: sign('sha256', Buffer.from(refreshProofMessage(ticketId, signedAt)), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url'),
    }),
  };
}

describe('parseDeviceKey', () => {
  it('accepts an EC P-256 public key and keeps only its public fields', () => {
    const { jwk, key } = newDevice();
    expect(key).toEqual({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
    const withPrivate = parseDeviceKey({ ...jwk, d: 'secret' });
    expect(withPrivate).not.toHaveProperty('d');
  });

  it.each([
    ['null', null],
    ['a string', 'key'],
    ['an RSA key', { kty: 'RSA', n: 'abc', e: 'AQAB' }],
    ['another curve', { kty: 'EC', crv: 'P-384', x: 'abc', y: 'abc' }],
    ['a point that is not on the curve', { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' }],
    ['non-base64url coordinates', { kty: 'EC', crv: 'P-256', x: '!!', y: '??' }],
  ])('rejects %s', (_name, raw) => {
    expect(parseDeviceKey(raw)).toBeNull();
  });
});

describe('deviceFailure', () => {
  const device = newDevice();

  it('passes a fresh proof from the registered device', () => {
    expect(deviceFailure(device.key, 't1', device.proof('t1', NOW), NOW)).toBeNull();
    expect(deviceFailure(device.key, 't1', device.proof('t1', NOW - PROOF_WINDOW_MS), NOW)).toBeNull();
  });

  it('reports a missing registration before looking at the proof', () => {
    expect(deviceFailure(null, 't1', device.proof('t1', NOW), NOW)).toBe('DEVICE_NOT_REGISTERED');
  });

  it('rejects a missing, stale, or future proof', () => {
    expect(deviceFailure(device.key, 't1', null, NOW)).toBe('DEVICE_PROOF_INVALID');
    expect(deviceFailure(device.key, 't1', device.proof('t1', NOW - PROOF_WINDOW_MS - 1), NOW)).toBe('DEVICE_PROOF_INVALID');
    expect(deviceFailure(device.key, 't1', device.proof('t1', NOW + PROOF_WINDOW_MS + 1), NOW)).toBe('DEVICE_PROOF_INVALID');
  });

  it('rejects a proof for another ticket, from another device, or tampered with', () => {
    expect(deviceFailure(device.key, 't1', device.proof('t2', NOW), NOW)).toBe('DEVICE_PROOF_INVALID');
    expect(deviceFailure(device.key, 't1', newDevice().proof('t1', NOW), NOW)).toBe('DEVICE_PROOF_INVALID');
    const good = device.proof('t1', NOW);
    const flipped = { ...good, signature: (good.signature[0] === 'A' ? 'B' : 'A') + good.signature.slice(1) };
    expect(deviceFailure(device.key, 't1', flipped, NOW)).toBe('DEVICE_PROOF_INVALID');
    expect(deviceFailure(device.key, 't1', { signedAt: NOW, signature: 'not a signature' }, NOW)).toBe('DEVICE_PROOF_INVALID');
    expect(deviceFailure(device.key, 't1', { signedAt: Number.NaN, signature: good.signature }, NOW)).toBe('DEVICE_PROOF_INVALID');
  });
});

describe('signed QR', () => {
  const device = newDevice();

  it('signs exactly TTV2:{ticketId}:{token}:{signedAt}', () => {
    expect(qrSignatureMessage('t1', 'tok', NOW)).toBe(`TTV2:t1:tok:${NOW}`);
  });

  it('accepts a fresh signature from the registered key, also through the parser', () => {
    const qr = device.signQr('t1', 'tok', NOW);
    expect(qrSignatureIsValid(device.key, qr, NOW)).toBe(true);
    expect(qrSignatureIsValid(device.key, device.signQr('t1', 'tok', NOW - PROOF_WINDOW_MS), NOW)).toBe(true);
    const parsed = parseQrPayload(`TTV2:t1:tok:${NOW}:${qr.signature}`);
    expect(parsed).toEqual(qr);
    expect(qrSignatureIsValid(device.key, parsed as SignedQr, NOW)).toBe(true);
  });

  it('rejects a signature from another key', () => {
    expect(qrSignatureIsValid(device.key, newDevice().signQr('t1', 'tok', NOW), NOW)).toBe(false);
  });

  it('rejects a tampered token, ticket or signing time', () => {
    const qr = device.signQr('t1', 'tok', NOW);
    expect(qrSignatureIsValid(device.key, { ...qr, token: 'other' }, NOW)).toBe(false);
    expect(qrSignatureIsValid(device.key, { ...qr, ticketId: 't2' }, NOW)).toBe(false);
    expect(qrSignatureIsValid(device.key, { ...qr, signedAt: NOW + 1 }, NOW)).toBe(false);
  });

  it('rejects a stale or future signing time even with a valid signature', () => {
    expect(qrSignatureIsValid(device.key, device.signQr('t1', 'tok', NOW - PROOF_WINDOW_MS - 1), NOW)).toBe(false);
    expect(qrSignatureIsValid(device.key, device.signQr('t1', 'tok', NOW + PROOF_WINDOW_MS + 1), NOW)).toBe(false);
  });

  it('rejects a refresh proof replayed as a QR signature', () => {
    const proof = device.proof('t1', NOW);
    const qr: SignedQr = { version: 2, ticketId: 't1', token: 'tok', signedAt: NOW, signature: proof.signature };
    expect(qrSignatureIsValid(device.key, qr, NOW)).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    const qr = device.signQr('t1', 'tok', NOW);
    expect(qrSignatureIsValid(device.key, { ...qr, signature: 'AAAA' }, NOW)).toBe(false);
  });
});
