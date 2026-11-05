import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { hexlify, randomBytes } from 'ethers';
import type { EntryDrawResponse, EntryDrawView, IssueReason, ListEntryDrawsResponse } from '../api';
import { eventKeyOf } from '../chain/ids';
import { entryIdOf, studentRefOf, winBpsOf } from '../domain/entryDraw';
import { emailDomain } from '../domain/ticket';
import { db } from '../firebase';
import { eventFromSnap, hostOf, readDocId, requireAuth, requireRole, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { schoolForEmail } from './rosterStore';

// Instant entry draw (events.instantDraw). Opening a draw event enters the student once; the chain decides the result
// (FestivalTicket.openEntry, then settleEntry SEED_DELAY blocks later, run by processChainOp).
// entryDraws/{eventId}_{studentId} has no client rule, so only these callables show a student their own entry.
// One entry per student id and event, ever: removing and re-adding a student to the roster does not draw again.

export const entryDrawRef = (eventId: string, studentId: string) => db.doc(`entryDraws/${eventId}_${studentId}`);
// The salt makes it unique, so an entry made again after the operator cleared a student gets its own op.
export const entryOpId = (eventId: string, studentId: string, salt: string) => `entry-${eventId}_${studentId}_${salt.slice(2, 10)}`;

const millis = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : 0);

export function entryView(d: DocumentData): EntryDrawView {
  return {
    eventId: d.eventId,
    status: d.status === 'won' || d.status === 'lost' ? d.status : 'pending',
    winBps: d.winBps,
    studentRef: d.studentRef,
    salt: d.salt,
    entryId: d.entryId,
    seedBlock: typeof d.seedBlock === 'number' ? d.seedBlock : null,
    seed: d.seed ?? null,
    score: typeof d.score === 'number' ? d.score : null,
    openTx: d.openTx ?? null,
    settleTx: d.settleTx ?? null,
    createdAt: millis(d.createdAt),
  };
}

/** Enters the caller in an instant-draw event, or returns the entry they already have. */
export const enterDraw = onCall<unknown, Promise<EntryDrawResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');

  return db.runTransaction(async (tx): Promise<EntryDrawResponse> => {
    const student = await requireRole(tx, caller.uid, ['student'], 'ROLE');
    const event = eventFromSnap(await tx.get(db.doc(`events/${eventId}`)));
    if (!event) throw new HttpsError('not-found', 'Event not found.');
    if (!event.instantDraw) throw new HttpsError('failed-precondition', 'This event has no draw.');
    if (!caller.emailVerified || !event.allowedDomains.includes(emailDomain(caller.email))) {
      const reason: IssueReason = 'DOMAIN';
      throw new HttpsError('permission-denied', 'This school domain cannot join this event.', { reason });
    }
    const school = await schoolForEmail(caller.email, tx);
    if (school?.get('studentRoster') && !(student.rosterVerified && student.photoSubmitted && student.idCardSubmitted)) {
      const reason: IssueReason = 'NOT_REGISTERED';
      throw new HttpsError('failed-precondition', 'Finish sign-up first.', { reason });
    }
    const studentId = typeof student.studentId === 'string' ? student.studentId : '';
    const schoolId = (student.schoolId as string | undefined) ?? school?.id ?? '';
    if (!studentId || !schoolId) throw new HttpsError('failed-precondition', 'No student id on this account.');

    const ref = entryDrawRef(eventId, studentId);
    const existing = await tx.get(ref);
    if (existing.exists) return { entry: entryView(existing.data()!) };

    // Expected applicants: the event's pool, else the school's student roster size.
    const rosterCount = (school?.get('studentRoster.count') as number | undefined) ?? 0;
    const winBps = winBpsOf(event.capacity, event.drawPool || rosterCount);
    const studentRef = studentRefOf(schoolId, studentId);
    const salt = hexlify(randomBytes(32));
    const entryId = entryIdOf(eventKeyOf(eventId), studentRef, salt);
    const doc = {
      eventId,
      schoolId,
      studentId,
      uid: caller.uid,
      studentRef,
      salt,
      entryId,
      winBps,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.create(ref, doc);
    tx.create(db.doc(`chainOps/${entryOpId(eventId, studentId, salt)}`), {
      kind: 'openEntry',
      eventId,
      entryDocId: ref.id,
      // processChainOp orders ticket ops by seq; an entry op has a single step.
      seq: 1,
      status: 'pending',
      attempts: 0,
      txHash: null,
      error: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { entry: entryView({ ...doc, createdAt: null }) };
  });
});

/** The caller's own entry for an event, or null. */
export const getMyEntryDraw = onCall<unknown, Promise<EntryDrawResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const studentId = (await db.doc(`users/${caller.uid}`).get()).get('studentId');
  if (typeof studentId !== 'string' || !studentId) return { entry: null };
  const snap = await entryDrawRef(eventId, studentId).get();
  if (!snap.exists || snap.get('uid') !== caller.uid) return { entry: null };
  return { entry: entryView(snap.data()!) };
});

const ADMIN_LIST_MAX = 500;

/** The event's entries for its school admin: who entered, and what the chain decided. Newest first. */
export const listEntryDraws = onCall<unknown, Promise<ListEntryDrawsResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const eventSnap = await db.doc(`events/${eventId}`).get();
  const event = eventFromSnap(eventSnap);
  if (!event) throw new HttpsError('not-found', 'Event not found.');
  await db.runTransaction((tx) => requireSchoolAdmin(tx, caller.uid, hostOf(eventSnap.get('schoolIds'))));

  const docs = (await db.collection('entryDraws').where('eventId', '==', eventId).get()).docs;
  const uids = [...new Set(docs.map((d) => d.get('uid') as string).filter(Boolean))];
  const names = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 300) {
    for (const u of await db.getAll(...uids.slice(i, i + 300).map((uid) => db.doc(`users/${uid}`)))) names.set(u.id, (u.get('name') as string) ?? '');
  }
  const entries = docs
    .map((d) => {
      const v = entryView(d.data());
      return { name: names.get(d.get('uid')) || '알 수 없음', studentId: d.get('studentId') ?? '', status: v.status, score: v.score, winBps: v.winBps, createdAt: v.createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const count = (s: string) => entries.filter((e) => e.status === s).length;
  // Same rate enterDraw gives a new entry: the event's pool, else the host school's student roster size.
  const rosterCount = ((await db.doc(`schools/${hostOf(eventSnap.get('schoolIds'))}`).get()).get('studentRoster.count') as number | undefined) ?? 0;
  return {
    capacity: event.capacity,
    drawPool: event.drawPool,
    winBps: winBpsOf(event.capacity, event.drawPool || rosterCount),
    counts: { total: entries.length, pending: count('pending'), won: count('won'), lost: count('lost') },
    entries: entries.slice(0, ADMIN_LIST_MAX),
  };
});
