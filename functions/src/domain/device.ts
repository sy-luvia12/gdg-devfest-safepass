import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { DeviceKey, DeviceProof, DeviceReason } from '../api';
import { QR_PREFIX_V2, type SignedQr } from './ticket';

export const PROOF_WINDOW_MS = 60_000;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// Spreading gives Node's JsonWebKey type the index signature that the DeviceKey interface lacks.
function toKeyObject(key: DeviceKey): KeyObject {
  return createPublicKey({ key: { ...key }, format: 'jwk' });
}

export function parseDeviceKey(raw: unknown): DeviceKey | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kty, crv, x, y } = raw as Record<string, unknown>;
  if (kty !== 'EC' || crv !== 'P-256' || typeof x !== 'string' || typeof y !== 'string') return null;
  if (!BASE64URL.test(x) || !BASE64URL.test(y)) return null;
  const key: DeviceKey = { kty, crv, x, y };
  try {
    toKeyObject(key);
  } catch {
    return null;
  }
  return key;
}

export function refreshProofMessage(ticketId: string, signedAtMs: number): string {
  return `TTV1-REFRESH:${ticketId}:${signedAtMs}`;
}

function signatureIsValid(key: DeviceKey, message: string, signedAt: number, signature: string, nowMs: number): boolean {
  if (!Number.isFinite(signedAt) || Math.abs(nowMs - signedAt) > PROOF_WINDOW_MS) return false;
  try {
    return verify(
      'sha256',
      Buffer.from(message),
      { key: toKeyObject(key), dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

function proofIsValid(key: DeviceKey, ticketId: string, proof: DeviceProof, nowMs: number): boolean {
  return signatureIsValid(key, refreshProofMessage(ticketId, proof.signedAt), proof.signedAt, proof.signature, nowMs);
}

export function qrSignatureMessage(ticketId: string, token: string, signedAtMs: number): string {
  return `${QR_PREFIX_V2}:${ticketId}:${token}:${signedAtMs}`;
}

export function qrSignatureIsValid(key: DeviceKey, qr: SignedQr, nowMs: number): boolean {
  const message = qrSignatureMessage(qr.ticketId, qr.token, qr.signedAt);
  return signatureIsValid(key, message, qr.signedAt, qr.signature, nowMs);
}

export function deviceFailure(
  device: DeviceKey | null,
  ticketId: string,
  proof: DeviceProof | null,
  nowMs: number,
): DeviceReason | null {
  if (!device) return 'DEVICE_NOT_REGISTERED';
  if (!proof || !proofIsValid(device, ticketId, proof, nowMs)) return 'DEVICE_PROOF_INVALID';
  return null;
}
