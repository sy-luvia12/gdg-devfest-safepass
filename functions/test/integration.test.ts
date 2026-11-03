import { generateKeyPairSync, sign } from 'node:crypto';
import { deleteApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc as clientDoc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Callables, DeviceKey } from '../src/api';
import { refreshProofMessage } from '../src/domain/device';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
const EVENT = 'demo-festival';
const admin = initAdmin({ projectId: PROJECT }, 'integration-admin');
const db = adminFirestore(admin);
const apps: FirebaseApp[] = [];

type Client = { [K in keyof Callables]: (req: Callables[K][0]) => Promise<Callables[K][1]> } & { fs: Firestore };

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
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  const call = <K extends keyof Callables>(name: K) => async (req: Callables[K][0]) =>
    (await httpsCallable<Callables[K][0], Callables[K][1]>(functions, name)(req)).data;
  return {
    ensureUser: call('ensureUser'),
    issueTicket: call('issueTicket'),
    refreshQrToken: call('refreshQrToken'),
    verifyEntry: call('verifyEntry'),
    cancelTicket: call('cancelTicket'),
    registerDevice: call('registerDevice'),
    resetDevice: call('resetDevice'),
    setReassignMode: call('setReassignMode'),
    setAllowReissue: call('setAllowReissue'),
    setStaff: call('setStaff'),
    requestDeviceReset: call('requestDeviceReset'),
    fs,
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
const DAVE = 'dave@korea.ac.kr';
const ERIN = 'erin@yonsei.ac.kr';
const GHOST = 'ghost@korea.ac.kr';
const CHIEF = 'chief@korea.ac.kr';
const FRANK = 'frank@korea.ac.kr';
const OUTSIDER = 'outsider@gmail.com';

let alice: Client, bob: Client, carol: Client, dave: Client, erin: Client, staff: Client, outsider: Client, chief: Client, frank: Client;

beforeAll(async () => {
  await clearEmulators();
  await db.doc(`events/${EVENT}`).set({
    name: 'Demo Festival',
    date: Timestamp.fromDate(new Date('2026-11-06T18:00:00+09:00')),
    capacity: 50,
    faceValue: 10_000,
    allowedDomains: ['korea.ac.kr', 'yonsei.ac.kr', 'skku.edu'],
    issuedCount: 0,
    nftSeq: 0,
    enteredCount: 0,
    reassignMode: 'queue',
  });
  await db.doc(`seedProfiles/${ALICE}`).set({ name: 'Alice Kim', studentId: '2024000001', photoUrl: 'https://example.com/a.png', role: 'student' });
  await db.doc(`seedProfiles/${STAFF}`).set({ name: 'Gate Staff', studentId: '', photoUrl: null, role: 'staff' });
  await db.doc(`seedProfiles/${CHIEF}`).set({ name: 'Chief Admin', studentId: '', photoUrl: null, role: 'admin' });
  [alice, bob, carol, dave, erin, staff, outsider, chief, frank] = await Promise.all(
    [ALICE, BOB, CAROL, DAVE, ERIN, STAFF, OUTSIDER, CHIEF, FRANK].map(signIn),
  );
  await chief.ensureUser();
});

afterAll(async () => {
  await Promise.all(apps.map(deleteClientApp));
  await deleteApp(admin);
});

const codeOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { code?: string }) => e.code);
const reasonOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: { details?: { reason?: string } }) => e.details?.reason,
  );

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
    expect((await db.doc(`qrTokens/${aliceTicket}`).get()).exists).toBe(false);
  });

  it('the live QR token is kept out of the ticket document and no client can read it', async () => {
    await dave.ensureUser();
    const ticketId = (await dave.issueTicket({ eventId: EVENT })).ticketId;
    await dave.refreshQrToken({ ticketId });
    const ticket = (await getDoc(clientDoc(dave.fs, 'tickets', ticketId))).data()!;
    expect(ticket.qrToken).toBeNull();
    expect((await db.doc(`qrTokens/${ticketId}`).get()).get('token')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await codeOf(getDoc(clientDoc(dave.fs, 'qrTokens', ticketId)))).toBe('permission-denied');
    expect(await codeOf(getDoc(clientDoc(chief.fs, 'qrTokens', ticketId)))).toBe('permission-denied');
    // Give the seat back so the counts below stay as they were. Allowed because dave never cancelled.
    await db.doc(`tickets/${ticketId}`).delete();
    await db.doc(`qrTokens/${ticketId}`).delete();
    await db.doc(`events/${EVENT}`).update({ issuedCount: 1, nftSeq: 1 });
  });

  it('a used ticket cannot get a new QR', async () => {
    expect(await codeOf(alice.refreshQrToken({ ticketId: aliceTicket }))).toBe('functions/failed-precondition');
  });

  it('a replaced QR is TOKEN_MISMATCH and an expired one is EXPIRED', async () => {
    bobTicket = (await bob.issueTicket({ eventId: EVENT })).ticketId;
    const old = await bob.refreshQrToken({ ticketId: bobTicket });
    const current = await bob.refreshQrToken({ ticketId: bobTicket });
    expect(await staff.verifyEntry({ qrPayload: old.qrPayload })).toEqual({ ok: false, reason: 'TOKEN_MISMATCH' });

    await db.doc(`qrTokens/${bobTicket}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await staff.verifyEntry({ qrPayload: current.qrPayload })).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(await staff.verifyEntry({ qrPayload: 'not a ticket' })).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
    expect(await staff.verifyEntry({ qrPayload: 'TTV1:nope:abc' })).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('a scanner checking another event refuses the QR, keeps it unused and logs it under its own event', async () => {
    const { qrPayload } = await bob.refreshQrToken({ ticketId: bobTicket });
    expect(await staff.verifyEntry({ qrPayload, eventId: 'other-festival' })).toEqual({ ok: false, reason: 'WRONG_EVENT' });
    expect((await db.doc(`tickets/${bobTicket}`).get()).get('status')).toBe('issued');
    const logs = await db.collection('scanLogs').where('eventId', '==', 'other-festival').get();
    expect(logs.docs.map((d) => d.data())).toEqual([
      expect.objectContaining({ result: 'invalid', ticketId: null, studentName: null }),
    ]);
    await Promise.all(logs.docs.map((d) => d.ref.delete()));
  });

  it('a student calling verifyEntry is permission-denied', async () => {
    const { qrPayload } = await bob.refreshQrToken({ ticketId: bobTicket });
    expect(await codeOf(bob.verifyEntry({ qrPayload }))).toBe('functions/permission-denied');
  });

  it('every scan is logged with its result, and a call rejected for its role logs nothing', async () => {
    const logs = (await db.collection('scanLogs').get()).docs.map((d) => d.data());
    const count = (result: string) => logs.filter((l) => l.result === result).length;
    expect({ ok: count('ok'), used: count('used'), expired: count('expired'), invalid: count('invalid') }).toEqual({
      ok: 1,
      used: 1,
      expired: 2,
      invalid: 2,
    });
    expect(logs).toHaveLength(6);
    expect(logs.find((l) => l.result === 'ok')).toMatchObject({
      eventId: EVENT,
      ticketId: aliceTicket,
      studentName: 'Alice Kim',
      studentId: '2024000001',
      staffUid: await uidOf(STAFF),
      staffName: 'Gate Staff',
    });
    expect(logs.filter((l) => l.ticketId === null && l.studentName === null)).toHaveLength(2);
    expect(logs.every((l) => l.scannedAt)).toBe(true);
  });

  const onWaitlist = (email: string, order: number) =>
    db.doc(`events/${EVENT}/waitlist/${email}`).set({ order, status: 'waiting', assignedTicketId: null });
  const waitlistDoc = async (email: string) => (await db.doc(`events/${EVENT}/waitlist/${email}`).get()).data();

  it('a used ticket cannot be cancelled and a non-owner is permission-denied', async () => {
    expect(await alice.cancelTicket({ ticketId: aliceTicket })).toEqual({ ok: false, reason: 'TICKET_USED' });
    expect(await codeOf(carol.cancelTicket({ ticketId: bobTicket }))).toBe('functions/permission-denied');
  });

  it('queue mode skips a waitlisted person without an account and gives the ticket to the next in line', async () => {
    await onWaitlist(GHOST, 1);
    await onWaitlist(CAROL, 2);
    expect(await bob.cancelTicket({ ticketId: bobTicket })).toEqual({ ok: true, outcome: 'REASSIGNED' });

    const carolUid = await uidOf(CAROL);
    const stored = (await db.doc(`tickets/${bobTicket}`).get()).data()!;
    expect(stored.ownerUid).toBe(carolUid);
    expect((await db.doc(`qrTokens/${bobTicket}`).get()).exists).toBe(false);
    expect(await waitlistDoc(CAROL)).toMatchObject({ status: 'assigned', assignedTicketId: bobTicket });
    expect(await waitlistDoc(GHOST)).toMatchObject({ status: 'waiting' });
    const log = await db.collection('reassignments').where('ticketId', '==', bobTicket).get();
    expect(log.docs.map((d) => d.data())).toMatchObject([
      { eventId: EVENT, nftNumber: '#0002', fromUid: await uidOf(BOB), fromName: 'bob', toUid: carolUid, toName: 'carol', mode: 'queue' },
    ]);
    expect(await codeOf(bob.refreshQrToken({ ticketId: bobTicket }))).toBe('functions/permission-denied');
    expect((await carol.refreshQrToken({ ticketId: bobTicket })).qrPayload).toMatch(/^TTV1:/);
  });

  it('with nobody eligible the ticket is released and its number is not reused', async () => {
    expect(await carol.cancelTicket({ ticketId: bobTicket })).toEqual({ ok: true, outcome: 'RELEASED' });
    expect((await db.doc(`tickets/${bobTicket}`).get()).data()).toMatchObject({ status: 'cancelled', ownerUid: null });
    expect((await db.doc(`events/${EVENT}`).get()).get('issuedCount')).toBe(1);
    expect(await codeOf(carol.refreshQrToken({ ticketId: bobTicket }))).toBe('functions/not-found');
    const log = await db.collection('reassignments').where('ticketId', '==', bobTicket).get();
    expect(log.docs.map((d) => d.get('toUid')).sort()).toEqual([null, await uidOf(CAROL)].sort());

    expect(await reasonOf(carol.issueTicket({ eventId: EVENT }))).toBe('CANCELLED_BEFORE');
    expect(await codeOf(bob.issueTicket({ eventId: EVENT }))).toBe('functions/failed-precondition');
  });

  it('a test event can let a student who cancelled take a ticket again', async () => {
    expect(await codeOf(carol.setAllowReissue({ eventId: EVENT, allow: true }))).toBe('functions/permission-denied');
    expect(await codeOf(chief.setAllowReissue({ eventId: EVENT, allow: 'yes' as never }))).toBe('functions/invalid-argument');
    expect(await chief.setAllowReissue({ eventId: EVENT, allow: true })).toEqual({ ok: true });
    expect((await carol.issueTicket({ eventId: EVENT })).nftNumber).toBe('#0003');
  });

  it('random mode picks one eligible waitlisted student and leaves the other waiting', async () => {
    await db.doc(`events/${EVENT}`).update({ reassignMode: 'random' });
    await dave.ensureUser();
    await erin.ensureUser();
    await onWaitlist(DAVE, 3);
    await onWaitlist(ERIN, 4);
    const carolTicket = (await db.collection('tickets').where('ownerUid', '==', await uidOf(CAROL)).get()).docs[0].id;

    expect(await carol.cancelTicket({ ticketId: carolTicket })).toEqual({ ok: true, outcome: 'REASSIGNED' });

    const owner = (await db.doc(`tickets/${carolTicket}`).get()).get('ownerUid');
    expect([await uidOf(DAVE), await uidOf(ERIN)]).toContain(owner);
    const statuses = [DAVE, ERIN].map(async (e) => (await waitlistDoc(e))!.status);
    expect((await Promise.all(statuses)).sort()).toEqual(['assigned', 'waiting']);
    const log = await db.collection('reassignments').where('ticketId', '==', carolTicket).get();
    expect(log.docs.map((d) => d.get('mode'))).toEqual(['random']);
  });

  it('every ticket change queues its chain op in order, in the same transaction (docs/api.md 8)', async () => {
    const opsOf = async (ticketId: string) =>
      (await db.collection('chainOps').where('ticketId', '==', ticketId).get()).docs
        .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
        .sort((a, b) => (a.seq as number) - (b.seq as number));

    // Issued, then admitted.
    expect((await opsOf(aliceTicket)).map((o) => [o.id, o.kind, o.status])).toEqual([
      [`${aliceTicket}-1`, 'mint', 'pending'],
      [`${aliceTicket}-2`, 'markUsed', 'pending'],
    ]);
    expect((await db.doc(`tickets/${aliceTicket}`).get()).data()).toMatchObject({ chainSeq: 2, chain: { status: 'pending' } });

    // Issued, reassigned to the waitlist in queue mode, then released with nobody eligible.
    const bobOps = await opsOf(bobTicket);
    const reassignments = await db.collection('reassignments').where('ticketId', '==', bobTicket).get();
    const idFor = (toUid: string | null) => reassignments.docs.find((d) => d.get('toUid') === toUid)!.id;
    expect(bobOps).toMatchObject([
      { kind: 'mint', toUid: await uidOf(BOB), seq: 1 },
      { kind: 'reassign', toUid: await uidOf(CAROL), reason: 1, reassignmentId: idFor(await uidOf(CAROL)), seq: 2 },
      { kind: 'release', reason: 3, reassignmentId: idFor(null), seq: 3 },
    ]);
    // The chain is off in this emulator run, so nothing reached the chain and the ops wait.
    expect(bobOps.every((o) => o.status === 'pending' && o.txHash === null)).toBe(true);
  });

  it('a ticket issued before the chain existed gets its mint queued ahead of its next op', async () => {
    const ref = db.collection('tickets').doc();
    await ref.set({ eventId: EVENT, ownerUid: await uidOf(DAVE), nftNumber: '#0999', status: 'issued', qrToken: null, qrExpiresAt: null });
    expect((await dave.cancelTicket({ ticketId: ref.id })).ok).toBe(true);
    const ops = (await db.collection('chainOps').where('ticketId', '==', ref.id).get()).docs.map((d) => d.data());
    const [first, second, ...rest] = ops.sort((a, b) => a.seq - b.seq);
    expect(first).toMatchObject({ seq: 1, kind: 'mint', toUid: await uidOf(DAVE) });
    expect(second).toMatchObject({ seq: 2, kind: expect.stringMatching(/^(reassign|release)$/) });
    expect(rest).toEqual([]);
  });
});

describe('hand-made event documents', () => {
  it('an event without counters still issues #0001 and creates them', async () => {
    await db.doc('events/bare-event').set({ name: 'Bare', capacity: 5, allowedDomains: ['korea.ac.kr'] });
    expect((await alice.issueTicket({ eventId: 'bare-event' })).nftNumber).toBe('#0001');
    expect((await db.doc('events/bare-event').get()).data()).toMatchObject({ issuedCount: 1, nftSeq: 1 });
  });
});

describe('admin features and security rules', () => {
  it('admin reads scanLogs, reassignments and the waitlist; a student cannot', async () => {
    expect(await codeOf(getDocs(collection(chief.fs, 'scanLogs')))).toBe('resolved');
    expect(await codeOf(getDocs(collection(chief.fs, 'reassignments')))).toBe('resolved');
    expect(await codeOf(getDocs(collection(chief.fs, 'events', EVENT, 'waitlist')))).toBe('resolved');
    expect((await getDocs(collection(chief.fs, 'scanLogs'))).size).toBe(6);

    expect(await codeOf(getDocs(collection(bob.fs, 'scanLogs')))).toBe('permission-denied');
    expect(await codeOf(getDocs(collection(bob.fs, 'reassignments')))).toBe('permission-denied');
    expect(await codeOf(getDocs(collection(bob.fs, 'events', EVENT, 'waitlist')))).toBe('permission-denied');
    expect(await codeOf(getDocs(collection(staff.fs, 'scanLogs')))).toBe('permission-denied');
  });

  it('staff reads only the scans they made', async () => {
    const mine = query(collection(staff.fs, 'scanLogs'), where('staffUid', '==', await uidOf(STAFF)));
    expect((await getDocs(mine)).size).toBe(6);
    const others = query(collection(staff.fs, 'scanLogs'), where('staffUid', '==', await uidOf(CHIEF)));
    expect(await codeOf(getDocs(others))).toBe('permission-denied');
  });

  it('no client can write, not even an admin', async () => {
    expect(await codeOf(setDoc(clientDoc(chief.fs, 'events', EVENT), { name: 'hacked' }))).toBe('permission-denied');
    expect(await codeOf(setDoc(clientDoc(chief.fs, 'scanLogs', 'x'), { result: 'ok' }))).toBe('permission-denied');
  });

  it('admin sets the reassign mode; others and bad input are rejected', async () => {
    expect(await chief.setReassignMode({ eventId: EVENT, mode: 'queue' })).toEqual({ ok: true });
    expect((await db.doc(`events/${EVENT}`).get()).get('reassignMode')).toBe('queue');
    expect(await codeOf(carol.setReassignMode({ eventId: EVENT, mode: 'random' }))).toBe('functions/permission-denied');
    expect(await codeOf(chief.setReassignMode({ eventId: EVENT, mode: 'fifo' as 'queue' }))).toBe('functions/invalid-argument');
    expect(await codeOf(chief.setReassignMode({ eventId: 'nope', mode: 'random' }))).toBe('functions/not-found');
  });
});

describe('device binding', () => {
  const DEVICE_EVENT = 'device-event';
  const newDevice = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
      key: publicKey.export({ format: 'jwk' }) as unknown as DeviceKey,
      proof: (ticketId: string, signedAt = Date.now()) => ({
        signedAt,
        signature: sign('sha256', Buffer.from(refreshProofMessage(ticketId, signedAt)), {
          key: privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url'),
      }),
    };
  };
  let ticketId: string;

  it('registerDevice stores one key per account, rejects bad keys, and only an admin can reset', async () => {
    await db.doc(`events/${DEVICE_EVENT}`).set({
      name: 'Device Event',
      capacity: 5,
      faceValue: 0,
      allowedDomains: ['korea.ac.kr'],
      issuedCount: 0,
      nftSeq: 0,
      enteredCount: 0,
      requireDevice: true,
    });
    await frank.ensureUser();
    ticketId = (await frank.issueTicket({ eventId: DEVICE_EVENT })).ticketId;

    const first = newDevice();
    expect(await frank.registerDevice({ publicKeyJwk: first.key })).toEqual({ ok: true });
    expect(await codeOf(frank.registerDevice({ publicKeyJwk: newDevice().key }))).toBe('functions/already-exists');
    expect(await codeOf(erin.registerDevice({ publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' } }))).toBe(
      'functions/invalid-argument',
    );
    expect(await codeOf(frank.resetDevice({ uid: await uidOf(FRANK) }))).toBe('functions/permission-denied');
    expect(await chief.resetDevice({ uid: await uidOf(FRANK) })).toEqual({ ok: true });
    expect(await chief.resetDevice({ uid: await uidOf(FRANK) })).toEqual({ ok: true });
  });

  it('refreshQrToken demands a proof from the registered device when the event requires one', async () => {
    expect(await reasonOf(frank.refreshQrToken({ ticketId }))).toBe('DEVICE_NOT_REGISTERED');

    const device = newDevice();
    await frank.registerDevice({ publicKeyJwk: device.key });
    expect(await reasonOf(frank.refreshQrToken({ ticketId }))).toBe('DEVICE_PROOF_INVALID');
    expect((await frank.refreshQrToken({ ticketId, deviceProof: device.proof(ticketId) })).qrPayload).toMatch(/^TTV1:/);

    expect(await reasonOf(frank.refreshQrToken({ ticketId, deviceProof: newDevice().proof(ticketId) }))).toBe('DEVICE_PROOF_INVALID');
    expect(await reasonOf(frank.refreshQrToken({ ticketId, deviceProof: device.proof(ticketId, Date.now() - 120_000) }))).toBe(
      'DEVICE_PROOF_INVALID',
    );
    expect(await reasonOf(frank.refreshQrToken({ ticketId, deviceProof: device.proof('other-ticket') }))).toBe('DEVICE_PROOF_INVALID');
    expect(await codeOf(frank.refreshQrToken({ ticketId, deviceProof: { signedAt: 'now' } as never }))).toBe('functions/invalid-argument');
  });

  it('after an admin reset the old phone is rejected and a new phone can register', async () => {
    const old = newDevice();
    await chief.resetDevice({ uid: await uidOf(FRANK) });
    await frank.registerDevice({ publicKeyJwk: old.key });
    await chief.resetDevice({ uid: await uidOf(FRANK) });
    expect(await reasonOf(frank.refreshQrToken({ ticketId, deviceProof: old.proof(ticketId) }))).toBe('DEVICE_NOT_REGISTERED');

    const fresh = newDevice();
    await frank.registerDevice({ publicKeyJwk: fresh.key });
    expect((await frank.refreshQrToken({ ticketId, deviceProof: fresh.proof(ticketId) })).expiresAt).toBeGreaterThan(Date.now());
  });

  it('a student asks for a reset, sees only their own request, and the admin reset closes it', async () => {
    expect(await frank.requestDeviceReset()).toEqual({ ok: true });
    expect(await codeOf(staff.requestDeviceReset())).toBe('functions/permission-denied');
    const frankUid = await uidOf(FRANK);
    expect((await getDoc(clientDoc(frank.fs, 'deviceResets', frankUid))).data()).toMatchObject({
      uid: frankUid,
      email: FRANK,
      status: 'pending',
    });
    expect(await codeOf(getDoc(clientDoc(bob.fs, 'deviceResets', frankUid)))).toBe('permission-denied');
    expect((await getDocs(collection(chief.fs, 'deviceResets'))).size).toBe(1);

    await chief.resetDevice({ uid: frankUid });
    expect((await db.doc(`deviceResets/${frankUid}`).get()).get('status')).toBe('done');
  });

  it('an event that does not require a device still refreshes without a proof', async () => {
    await db.doc(`events/${DEVICE_EVENT}`).update({ requireDevice: false });
    expect((await frank.refreshQrToken({ ticketId })).qrPayload).toMatch(/^TTV1:/);
  });
});

describe('staff management', () => {
  it('an admin makes a signed-in student staff and back, and only an admin can', async () => {
    expect(await chief.setStaff({ email: ERIN.toUpperCase(), staff: true })).toEqual({ ok: true, status: 'UPDATED' });
    expect((await db.doc(`users/${await uidOf(ERIN)}`).get()).get('role')).toBe('staff');
    expect(await chief.setStaff({ email: ERIN, staff: false })).toEqual({ ok: true, status: 'UPDATED' });
    expect((await db.doc(`users/${await uidOf(ERIN)}`).get()).get('role')).toBe('student');
    expect(await codeOf(staff.setStaff({ email: ERIN, staff: true }))).toBe('functions/permission-denied');
    expect(await codeOf(chief.setStaff({ email: CHIEF, staff: false }))).toBe('functions/failed-precondition');
  });

  it('someone who has not signed in yet becomes staff on their first sign-in', async () => {
    expect(await chief.setStaff({ email: 'gate2@gmail.com', staff: true })).toEqual({ ok: true, status: 'PENDING_SIGNUP' });
    expect((await db.doc('seedProfiles/gate2@gmail.com').get()).get('role')).toBe('staff');
  });
});

async function uidOf(email: string): Promise<string> {
  return (await db.collection('users').where('email', '==', email).get()).docs[0].id;
}
