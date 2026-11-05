import { Timestamp, type DocumentData, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { REASSIGN_MODES, type DeviceKey, type DeviceProof, type IssueReason, type ReassignMode, type Role } from '../api';
import { parseDeviceKey } from '../domain/device';
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

export async function requireRole(
  tx: Transaction,
  uid: string,
  allowed: readonly Role[],
  reason?: IssueReason,
): Promise<DocumentData> {
  const snap = await tx.get(db.doc(`users/${uid}`));
  if (!snap.exists) throw new HttpsError('not-found', 'User profile missing. Call ensureUser first.');
  if (!allowed.includes(snap.get('role'))) {
    throw new HttpsError('permission-denied', 'Role not allowed.', reason ? { reason } : undefined);
  }
  return snap.data()!;
}

// Admin of this school: a school admin (adminSchoolId) for that school only, a team admin (no adminSchoolId) for any.
export async function requireSchoolAdmin(tx: Transaction, uid: string, schoolId: string): Promise<DocumentData> {
  const user = await requireRole(tx, uid, ['admin']);
  if (user.adminSchoolId && user.adminSchoolId !== schoolId) {
    throw new HttpsError('permission-denied', 'This admin manages another school.');
  }
  return user;
}

// The SafePass operator: an admin with no school and the operator flag (from its seed profile).
export async function requireOperator(tx: Transaction, uid: string): Promise<DocumentData> {
  const user = await requireRole(tx, uid, ['admin']);
  if (user.operator !== true || user.adminSchoolId) throw new HttpsError('permission-denied', 'Operator only.');
  return user;
}

// The school an operator works for: adminSchoolId for an admin, staffSchoolId for staff. Undefined means a
// SafePass team account (or staff added before schools were scoped), which may work at every school.
export function operatorSchoolId(user: DocumentData): string | undefined {
  return (user.role === 'admin' ? user.adminSchoolId : user.staffSchoolId) || undefined;
}

// Staff and school admins only work at events their school takes part in.
export async function requireEventSchool(tx: Transaction, user: DocumentData, eventId: string): Promise<void> {
  const school = operatorSchoolId(user);
  if (!school) return;
  const schoolIds = (await tx.get(db.doc(`events/${eventId}`))).get('schoolIds');
  if (!Array.isArray(schoolIds) || !schoolIds.includes(school)) {
    throw new HttpsError('permission-denied', 'This event belongs to another school.');
  }
}

// The first school in an event's schoolIds hosts it, and that school's admin manages the event.
export function hostOf(schoolIds: unknown): string {
  return Array.isArray(schoolIds) && typeof schoolIds[0] === 'string' ? schoolIds[0] : '';
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

export const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function readDocId(data: unknown, field: string): string {
  const value = readString(data, field);
  if (!DOC_ID.test(value)) throw new HttpsError('invalid-argument', `${field} is not a valid id.`);
  return value;
}

export function readOptional<T>(data: unknown, field: string, read: (data: unknown, field: string) => T): T | undefined {
  return record(data)[field] === undefined ? undefined : read(data, field);
}

export function readCount(data: unknown, field: string): number {
  const value = record(data)[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new HttpsError('invalid-argument', `${field} must be a whole number from 0 to 1000000.`);
  }
  return value;
}

export function readBoolean(data: unknown, field: string): boolean {
  const value = record(data)[field];
  if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `${field} must be a boolean.`);
  return value;
}

export function readEventDate(data: unknown, field = 'date'): Timestamp {
  const ms = Date.parse(readString(data, field));
  if (Number.isNaN(ms)) throw new HttpsError('invalid-argument', `${field} must be an ISO 8601 date.`);
  return Timestamp.fromMillis(ms);
}

export function readStringList(data: unknown, field: string): string[] {
  const value = record(data)[field];
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new HttpsError('invalid-argument', `${field} must be a non-empty list of strings.`);
  }
  return value as string[];
}

export function readReassignMode(data: unknown): ReassignMode {
  const value = record(data).mode;
  if (!REASSIGN_MODES.includes(value as ReassignMode)) {
    throw new HttpsError('invalid-argument', `mode must be one of ${REASSIGN_MODES.join(', ')}.`);
  }
  return value as ReassignMode;
}

export function readDeviceKey(data: unknown): DeviceKey {
  const key = parseDeviceKey(record(data).publicKeyJwk);
  if (!key) throw new HttpsError('invalid-argument', 'publicKeyJwk must be an EC P-256 public key.');
  return key;
}

export function readDeviceProof(data: unknown): DeviceProof | null {
  const proof = record(data).deviceProof;
  // The Firebase JS SDK turns an undefined field into null on the wire, so both mean "no proof".
  if (proof === undefined || proof === null) return null;
  const { signedAt, signature } = (typeof proof === 'object' && proof !== null ? proof : {}) as Record<string, unknown>;
  if (typeof signedAt !== 'number' || typeof signature !== 'string') {
    throw new HttpsError('invalid-argument', 'deviceProof must be { signedAt: number, signature: string }.');
  }
  return { signedAt, signature };
}

const ms = (t: Timestamp) => t.toMillis();

// The live QR token sits in qrTokens/{ticketId}, which no client can read, so the owner cannot copy it
// from the ticket document on another phone. Only callers that check a token pass the qr snapshot.
export const qrTokenRef = (ticketId: string) => db.doc(`qrTokens/${ticketId}`);

export function ticketFromSnap(snap: DocumentSnapshot<DocumentData>, qrSnap?: DocumentSnapshot<DocumentData>): Ticket | null {
  const d = snap.data();
  if (!d) return null;
  // A cancelled ticket has no owner and no QR, so every caller treats it as missing. So does a ticket that waits
  // in the lottery pool (pooled) or for a winner to claim it (offered).
  if (d.status === 'cancelled' || d.status === 'pooled' || d.status === 'offered') return null;
  const base = { id: snap.id, eventId: d.eventId, ownerUid: d.ownerUid, nftNumber: d.nftNumber };
  if (d.status === 'used') return { ...base, status: 'used', usedAtMs: ms(d.usedAt) };
  const q = qrSnap?.data();
  const qr = q?.token && q.expiresAt ? { token: q.token as string, expiresAtMs: ms(q.expiresAt) } : null;
  return { ...base, status: 'issued', qr };
}

export function eventFromSnap(snap: DocumentSnapshot<DocumentData>): FestivalEvent | null {
  const d = snap.data();
  if (!d) return null;
  return {
    id: snap.id,
    name: d.name,
    // Event documents can be created by hand in the console, so absent counters read as zero.
    capacity: d.capacity ?? 0,
    faceValue: d.faceValue ?? 0,
    allowedDomains: d.allowedDomains ?? [],
    issuedCount: d.issuedCount ?? 0,
    nftSeq: d.nftSeq ?? d.issuedCount ?? 0,
    enteredCount: d.enteredCount ?? 0,
    reassignMode: d.reassignMode === 'random' || d.reassignMode === 'lottery' ? d.reassignMode : 'queue',
    requireDevice: d.requireDevice === true,
    requireRoster: d.requireRoster === true,
    allowReissueAfterCancel: d.allowReissueAfterCancel === true,
    twoStepCheck: d.twoStepCheck === true,
  };
}
