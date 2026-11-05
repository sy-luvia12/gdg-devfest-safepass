import { deleteApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Callables } from '../src/api';
import { eventKeyOf } from '../src/chain/ids';
import { entryIdOf, studentRefOf } from '../src/domain/entryDraw';

// Instant entry draw against the emulator, with the chain off: entries stay pending (their chain op waits for
// retryChainOps), so the test settles them by hand the way processChainOp would.
// Ids are prefixed (drw-*, *.drw.test) so this file shares the emulator with the other integration files.

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
const admin = initAdmin({ projectId: PROJECT }, 'integration-draw-admin');
const db = adminFirestore(admin);
const apps: FirebaseApp[] = [];

type Call = <K extends keyof Callables>(name: K, req: Callables[K][0]) => Promise<Callables[K][1]>;
interface Client {
  call: Call;
  uid: string;
}

async function login(email: string): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, email);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] });
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const call: Call = async (name, req) => (await httpsCallable<typeof req, Callables[typeof name][1]>(functions, name)(req)).data;
  await call('ensureUser', undefined);
  return { call, uid: user.uid };
}

const reasonOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { details?: { reason?: string } }) => e.details?.reason);
const codeOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { code?: string }) => e.code);

const SCHOOL = 'drw-school';
const EV_DRAW = 'drw-draw-event';
const EV_OPEN = 'drw-open-event';

const seedEvent = (id: string, fields: Record<string, unknown>) =>
  db.doc(`events/${id}`).set({
    name: id,
    date: Timestamp.fromDate(new Date('2026-11-13T13:00:00+09:00')),
    capacity: 5_000,
    faceValue: 0,
    issuedCount: 0,
    nftSeq: 0,
    enteredCount: 0,
    reassignMode: 'queue',
    schoolIds: [SCHOOL],
    allowedDomains: ['drw.test'],
    ...fields,
  });
const seedStudent = (email: string, studentId: string) =>
  db.doc(`seedProfiles/${email}`).set({ name: email.split('@')[0], studentId, photoUrl: null, role: 'student' });

beforeAll(async () => {
  // No student roster: seeded profiles stand in for signed-up students (the old sign-in path).
  await db.doc(`schools/${SCHOOL}`).set({ name: 'Draw Univ', domains: ['drw.test'], brandColor: '#445566' });
  // Requiring the roster too shows that a draw event ignores it: winning is what counts.
  await seedEvent(EV_DRAW, { instantDraw: true, drawPool: 20_000, requireRoster: true });
  await seedEvent(EV_OPEN, {});
  await seedStudent('ann@drw.test', 'D001');
  await seedStudent('ben@drw.test', 'D002');
  await seedStudent('cy@drw.test', 'D003');
});

afterAll(async () => {
  await Promise.all(apps.map(deleteClientApp));
  await deleteApp(admin);
});

describe('instant entry draw', () => {
  it('enters once with the rate capacity / pool, queues one chain op, and never draws again', async () => {
    const ann = await login('ann@drw.test');
    expect((await ann.call('myRosterStatus', { eventIds: [EV_DRAW, EV_OPEN] })).status).toEqual({ [EV_DRAW]: 'draw_open', [EV_OPEN]: 'open' });
    expect((await ann.call('getMyEntryDraw', { eventId: EV_DRAW })).entry).toBeNull();

    const { entry } = await ann.call('enterDraw', { eventId: EV_DRAW });
    // 5,000 tickets for 20,000 students
    expect(entry).toMatchObject({ eventId: EV_DRAW, status: 'pending', winBps: 2500, seed: null, score: null });
    expect(entry!.studentRef).toBe(studentRefOf(SCHOOL, 'D001'));
    expect(entry!.entryId).toBe(entryIdOf(eventKeyOf(EV_DRAW), entry!.studentRef, entry!.salt));

    const op = await db.doc(`chainOps/entry-${EV_DRAW}_D001`).get();
    expect(op.data()).toMatchObject({ kind: 'openEntry', eventId: EV_DRAW, entryDocId: `${EV_DRAW}_D001`, status: 'pending' });

    const again = await ann.call('enterDraw', { eventId: EV_DRAW });
    expect(again.entry!.entryId).toBe(entry!.entryId);
    expect(again.entry!.salt).toBe(entry!.salt);
    expect((await ann.call('myRosterStatus', { eventIds: [EV_DRAW] })).status[EV_DRAW]).toBe('draw_pending');
    expect(await reasonOf(ann.call('issueTicket', { eventId: EV_DRAW }))).toBe('DRAW_NOT_WON');
  });

  it('issues only to a winner; a loser stays out', async () => {
    const ben = await login('ben@drw.test');
    const cy = await login('cy@drw.test');
    await ben.call('enterDraw', { eventId: EV_DRAW });
    await cy.call('enterDraw', { eventId: EV_DRAW });
    const settled = { seedBlock: 100, seed: `0x${'ab'.repeat(32)}`, settleTx: `0x${'cd'.repeat(32)}` };
    await db.doc(`entryDraws/${EV_DRAW}_D002`).update({ status: 'won', score: 42, ...settled });
    await db.doc(`entryDraws/${EV_DRAW}_D003`).update({ status: 'lost', score: 9_000, ...settled });

    expect((await ben.call('getMyEntryDraw', { eventId: EV_DRAW })).entry).toMatchObject({ status: 'won', score: 42, seedBlock: 100 });
    expect((await ben.call('myRosterStatus', { eventIds: [EV_DRAW] })).status[EV_DRAW]).toBe('draw_won');
    expect((await cy.call('myRosterStatus', { eventIds: [EV_DRAW] })).status[EV_DRAW]).toBe('draw_lost');

    expect((await ben.call('issueTicket', { eventId: EV_DRAW })).ticketId).toBeTruthy();
    expect(await reasonOf(cy.call('issueTicket', { eventId: EV_DRAW }))).toBe('DRAW_NOT_WON');
    // Entering again does not give a loser a second chance
    expect((await cy.call('enterDraw', { eventId: EV_DRAW })).entry!.status).toBe('lost');
  });

  it('refuses an event without a draw, and anyone but a student', async () => {
    const ann = await login('ann@drw.test');
    expect(await codeOf(ann.call('enterDraw', { eventId: EV_OPEN }))).toBe('functions/failed-precondition');
    await db.doc('seedProfiles/staff@drw.test').set({ name: 'Staff', studentId: '', role: 'staff', staffSchoolId: SCHOOL });
    const staff = await login('staff@drw.test');
    expect(await reasonOf(staff.call('enterDraw', { eventId: EV_DRAW }))).toBe('ROLE');
  });
});

describe('operator interventions on chain', () => {
  it('revokes an unused ticket with reason 4, frees the seat and keeps the student from taking another', async () => {
    await db.doc('seedProfiles/admin@drw.test').set({ name: 'Admin', studentId: '', role: 'admin', adminSchoolId: SCHOOL });
    await db.doc('seedProfiles/other-admin@drw.test').set({ name: 'Other', studentId: '', role: 'admin', adminSchoolId: 'drw-other' });
    await seedStudent('dee@drw.test', 'D004');
    const dee = await login('dee@drw.test');
    const admin = await login('admin@drw.test');
    const other = await login('other-admin@drw.test');
    const { ticketId } = await dee.call('issueTicket', { eventId: EV_OPEN });
    const issued = (await db.doc(`events/${EV_OPEN}`).get()).get('issuedCount');

    expect(await codeOf(other.call('revokeTicket', { ticketId }))).toBe('functions/permission-denied');
    expect(await codeOf(dee.call('revokeTicket', { ticketId }))).toBe('functions/permission-denied');
    expect(await admin.call('revokeTicket', { ticketId })).toEqual({ ok: true });

    const ticket = (await db.doc(`tickets/${ticketId}`).get()).data()!;
    expect(ticket).toMatchObject({ status: 'cancelled', ownerUid: null, qrToken: null });
    expect((await db.doc(`events/${EV_OPEN}`).get()).get('issuedCount')).toBe(issued - 1);
    const ops = await db.collection('chainOps').where('ticketId', '==', ticketId).get();
    expect(ops.docs.map((d) => d.get('kind')).sort()).toEqual(['mint', 'release']);
    expect(ops.docs.find((d) => d.get('kind') === 'release')!.get('reason')).toBe(4);
    const record = await db.collection('reassignments').where('ticketId', '==', ticketId).get();
    expect(record.docs[0].data()).toMatchObject({ mode: 'revoke', fromUid: dee.uid, toUid: null });

    expect(await reasonOf(dee.call('issueTicket', { eventId: EV_OPEN }))).toBe('CANCELLED_BEFORE');
    expect(await admin.call('revokeTicket', { ticketId })).toEqual({ ok: false, reason: 'NOT_ISSUED' });
  });

  it('refuses to revoke a used ticket', async () => {
    await seedStudent('eve@drw.test', 'D005');
    const eve = await login('eve@drw.test');
    const admin = await login('admin@drw.test');
    const { ticketId } = await eve.call('issueTicket', { eventId: EV_OPEN });
    await db.doc(`tickets/${ticketId}`).update({ status: 'used' });
    expect(await admin.call('revokeTicket', { ticketId })).toEqual({ ok: false, reason: 'TICKET_USED' });
  });

  it('records a lost-phone reissue for each live ticket when a bound device is reset', async () => {
    await seedStudent('fay@drw.test', 'D006');
    const fay = await login('fay@drw.test');
    const admin = await login('admin@drw.test');
    await db.doc(`users/${fay.uid}`).update({ schoolId: SCHOOL });
    const { ticketId } = await fay.call('issueTicket', { eventId: EV_OPEN });
    const actions = () => db.collection('chainOps').where('kind', '==', 'recordAction').where('eventId', '==', EV_OPEN).get();
    const before = (await actions()).size;

    // No device bound yet: nothing to reissue
    await admin.call('resetDevice', { uid: fay.uid });
    expect((await actions()).size).toBe(before);

    await db.doc(`devices/${fay.uid}`).set({ publicKeyJwk: { kty: 'EC' } });
    await admin.call('resetDevice', { uid: fay.uid });
    const after = await actions();
    expect(after.size).toBe(before + 1);
    const op = after.docs.find((d) => String(d.get('note')).includes(ticketId))!;
    expect(op.data()).toMatchObject({ action: 1, status: 'pending' });
    expect(op.get('ref')).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await db.doc(`devices/${fay.uid}`).get()).exists).toBe(false);
  });
});
