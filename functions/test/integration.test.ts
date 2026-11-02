import { deleteApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Callables } from '../src/api';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
const EVENT = 'demo-festival';
const admin = initAdmin({ projectId: PROJECT }, 'integration-admin');
const db = adminFirestore(admin);
const apps: FirebaseApp[] = [];

type Client = { [K in keyof Callables]: (req: Callables[K][0]) => Promise<Callables[K][1]> };

async function signIn(email: string): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, email);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  // The Auth emulator accepts an unsigned Google ID token, which gives the user a verified email like real Google sign-in.
  const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] });
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const call = <K extends keyof Callables>(name: K) => async (req: Callables[K][0]) =>
    (await httpsCallable<Callables[K][0], Callables[K][1]>(functions, name)(req)).data;
  return {
    ensureUser: call('ensureUser'),
    issueTicket: call('issueTicket'),
    refreshQrToken: call('refreshQrToken'),
    verifyEntry: call('verifyEntry'),
    transferTicket: call('transferTicket'),
  };
}

async function clearEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

const ALICE = 'alice@korea.ac.kr';
const BOB = 'bob@yonsei.ac.kr';
const CAROL = 'carol@skku.edu';
const STAFF = 'staff@korea.ac.kr';
const OUTSIDER = 'outsider@gmail.com';

let alice: Client, bob: Client, carol: Client, staff: Client, outsider: Client;

beforeAll(async () => {
  await clearEmulators();
  await db.doc(`events/${EVENT}`).set({
    name: 'Demo Festival',
    date: Timestamp.fromDate(new Date('2026-11-06T18:00:00+09:00')),
    capacity: 50,
    faceValue: 10_000,
    allowedDomains: ['korea.ac.kr', 'yonsei.ac.kr', 'skku.edu'],
    issuedCount: 0,
    enteredCount: 0,
  });
  await db.doc(`seedProfiles/${ALICE}`).set({ name: 'Alice Kim', studentId: '2024000001', photoUrl: 'https://example.com/a.png', role: 'student' });
  await db.doc(`seedProfiles/${STAFF}`).set({ name: 'Gate Staff', studentId: '', photoUrl: null, role: 'staff' });
  [alice, bob, carol, staff, outsider] = await Promise.all([ALICE, BOB, CAROL, STAFF, OUTSIDER].map(signIn));
});

afterAll(async () => {
  await Promise.all(apps.map(deleteClientApp));
  await deleteApp(admin);
});

const codeOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { code?: string }) => e.code);

describe('prototype demo scenario', () => {
  let aliceTicket: string;
  let bobTicket: string;

  it('ensureUser copies the seed profile, including role', async () => {
    const profile = await alice.ensureUser();
    expect(profile).toMatchObject({ name: 'Alice Kim', studentId: '2024000001', email: ALICE, role: 'student' });
    expect(await staff.ensureUser()).toMatchObject({ role: 'staff', name: 'Gate Staff' });
    expect(await bob.ensureUser()).toMatchObject({ role: 'student', studentId: '', email: BOB });
    await carol.ensureUser();
    await outsider.ensureUser();
    expect(await alice.ensureUser()).toEqual(profile);
  });

  it('issueTicket issues #0001 to a school-domain student', async () => {
    const res = await alice.issueTicket({ eventId: EVENT });
    expect(res.nftNumber).toBe('#0001');
    aliceTicket = res.ticketId;
    const stored = (await db.doc(`tickets/${aliceTicket}`).get()).data();
    expect(stored).toMatchObject({ eventId: EVENT, status: 'issued', nftNumber: '#0001' });
  });

  it('a second issueTicket for the same event is already-exists', async () => {
    expect(await codeOf(alice.issueTicket({ eventId: EVENT }))).toBe('functions/already-exists');
  });

  it('an outsider gmail account is permission-denied', async () => {
    expect(await codeOf(outsider.issueTicket({ eventId: EVENT }))).toBe('functions/permission-denied');
  });

  it('staff admits a fresh QR and sees holder info and enteredCount 1', async () => {
    const { qrPayload, expiresAt } = await alice.refreshQrToken({ ticketId: aliceTicket });
    expect(qrPayload).toMatch(new RegExp(`^TTV1:${aliceTicket}:[A-Za-z0-9_-]{22}$`));
    expect(expiresAt).toBeGreaterThan(Date.now());
    const res = await staff.verifyEntry({ qrPayload });
    expect(res).toEqual({
      ok: true,
      ticketId: aliceTicket,
      holder: { name: 'Alice Kim', studentId: '2024000001', photoUrl: 'https://example.com/a.png' },
      enteredCount: 1,
      capacity: 50,
    });
    expect(await staff.verifyEntry({ qrPayload })).toEqual({ ok: false, reason: 'USED' });
    expect((await db.doc(`events/${EVENT}`).get()).get('enteredCount')).toBe(1);
  });

  it('a used ticket cannot get a new QR', async () => {
    expect(await codeOf(alice.refreshQrToken({ ticketId: aliceTicket }))).toBe('functions/failed-precondition');
  });

  it('a replaced QR is TOKEN_MISMATCH and an expired one is EXPIRED', async () => {
    bobTicket = (await bob.issueTicket({ eventId: EVENT })).ticketId;
    const old = await bob.refreshQrToken({ ticketId: bobTicket });
    const current = await bob.refreshQrToken({ ticketId: bobTicket });
    expect(await staff.verifyEntry({ qrPayload: old.qrPayload })).toEqual({ ok: false, reason: 'TOKEN_MISMATCH' });

    await db.doc(`tickets/${bobTicket}`).update({ qrExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await staff.verifyEntry({ qrPayload: current.qrPayload })).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(await staff.verifyEntry({ qrPayload: 'not a ticket' })).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
    expect(await staff.verifyEntry({ qrPayload: 'TTV1:nope:abc' })).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('a student calling verifyEntry is permission-denied', async () => {
    const { qrPayload } = await bob.refreshQrToken({ ticketId: bobTicket });
    expect(await codeOf(bob.verifyEntry({ qrPayload }))).toBe('functions/permission-denied');
  });

  it('a transfer above face value is rejected and still recorded', async () => {
    expect(await bob.transferTicket({ ticketId: bobTicket, toEmail: CAROL, price: 20_000 })).toEqual({
      ok: false,
      reason: 'OVER_FACE_VALUE',
    });
    const log = await db.collection('transfers').where('ticketId', '==', bobTicket).get();
    expect(log.docs.map((d) => d.data())).toMatchObject([{ result: 'rejected', reason: 'OVER_FACE_VALUE', price: 20_000 }]);
    expect((await db.doc(`tickets/${bobTicket}`).get()).get('ownerUid')).not.toBe(await uidOf(CAROL));
  });

  it('a non-owner cannot transfer and a bad price is invalid-argument', async () => {
    expect(await codeOf(carol.transferTicket({ ticketId: bobTicket, toEmail: CAROL, price: 0 }))).toBe('functions/permission-denied');
    expect(await codeOf(bob.transferTicket({ ticketId: bobTicket, toEmail: CAROL, price: 1.5 }))).toBe('functions/invalid-argument');
  });

  it('a valid transfer moves ownership and clears the QR', async () => {
    expect(await bob.transferTicket({ ticketId: bobTicket, toEmail: CAROL, price: 10_000 })).toEqual({ ok: true });
    const stored = (await db.doc(`tickets/${bobTicket}`).get()).data()!;
    expect(stored.ownerUid).toBe(await uidOf(CAROL));
    expect(stored.qrToken).toBeNull();
    const results = (await db.collection('transfers').where('ticketId', '==', bobTicket).get()).docs.map((d) => d.get('result'));
    expect(results.sort()).toEqual(['rejected', 'success']);
    expect(await codeOf(bob.refreshQrToken({ ticketId: bobTicket }))).toBe('functions/permission-denied');
    expect((await carol.refreshQrToken({ ticketId: bobTicket })).qrPayload).toMatch(/^TTV1:/);
  });
});

async function uidOf(email: string): Promise<string> {
  return (await db.collection('users').where('email', '==', email).get()).docs[0].id;
}
