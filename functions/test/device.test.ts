import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deviceFailure, parseDeviceKey, PROOF_WINDOW_MS, refreshProofMessage } from '../src/domain/device';

const NOW = 1_700_000_000_000;

function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    jwk: publicKey.export({ format: 'jwk' }),
    key: parseDeviceKey(publicKey.export({ format: 'jwk' }))!,
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
