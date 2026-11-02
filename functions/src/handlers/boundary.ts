import type { DocumentData, DocumentSnapshot, Timestamp, Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Role } from '../api';
import type { FestivalEvent, Ticket } from '../domain/ticket';
import { db } from '../firebase';

export interface Caller {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export function requireAuth(request: CallableRequest<unknown>): Caller {
  const token = request.auth?.token;
  if (!request.auth || !token) throw new HttpsError('unauthenticated', 'Sign in first.');
  return {
    uid: request.auth.uid,
    email: (token.email ?? '').toLowerCase(),
    emailVerified: token.email_verified === true,
    name: typeof token.name === 'string' ? token.name : '',
    picture: typeof token.picture === 'string' ? token.picture : null,
  };
}

export async function requireRole(tx: Transaction, uid: string, allowed: readonly Role[]): Promise<void> {
  const snap = await tx.get(db.doc(`users/${uid}`));
  if (!snap.exists) throw new HttpsError('not-found', 'User profile missing. Call ensureUser first.');
  if (!allowed.includes(snap.get('role'))) throw new HttpsError('permission-denied', 'Role not allowed.');
}

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) throw new HttpsError('invalid-argument', 'Request body must be an object.');
  return data as Record<string, unknown>;
}

export function readString(data: unknown, field: string): string {
  const value = record(data)[field];
  if (typeof value !== 'string' || value.length === 0) throw new HttpsError('invalid-argument', `${field} must be a non-empty string.`);
  return value;
}

export function readDocId(data: unknown, field: string): string {
  const value = readString(data, field);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', `${field} is not a valid id.`);
  return value;
}

export function readPrice(data: unknown): number {
  const value = record(data).price;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpsError('invalid-argument', 'price must be a non-negative integer.');
  }
  return value;
}

const ms = (t: Timestamp) => t.toMillis();

export function ticketFromSnap(snap: DocumentSnapshot<DocumentData>): Ticket | null {
  const d = snap.data();
  if (!d) return null;
  const base = { id: snap.id, eventId: d.eventId, ownerUid: d.ownerUid, nftNumber: d.nftNumber };
  if (d.status === 'used') return { ...base, status: 'used', usedAtMs: ms(d.usedAt) };
  const qr = d.qrToken && d.qrExpiresAt ? { token: d.qrToken, expiresAtMs: ms(d.qrExpiresAt) } : null;
  return { ...base, status: 'issued', qr };
}

export function eventFromSnap(snap: DocumentSnapshot<DocumentData>): FestivalEvent | null {
  const d = snap.data();
  if (!d) return null;
  return {
    id: snap.id,
    name: d.name,
    capacity: d.capacity,
    faceValue: d.faceValue,
    allowedDomains: d.allowedDomains,
    issuedCount: d.issuedCount,
    enteredCount: d.enteredCount,
  };
}
