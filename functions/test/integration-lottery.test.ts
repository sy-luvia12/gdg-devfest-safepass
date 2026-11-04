import { deleteApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { FieldValue, getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, doc as clientDoc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { id as hashText } from 'ethers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Callables } from '../src/api';
import { applySeed, drawRef, planRef, tickEvent } from '../src/lottery/rounds';
import { checkReceipt } from './lottery-receipt';

// Cancelled-ticket lottery through the deployed callables (emulator). The chain is off here, so the seed that
// processChainOp would store is handed to applySeed directly; test:chain covers the on-chain half.

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
const EVENT = 'lottery-festival';
const admin = initAdmin({ projectId: PROJECT }, 'lottery-admin');
const db = adminFirestore(admin);
const apps: FirebaseApp[] = [];

type Client = { [K in keyof Callables]: (req: Callables[K][0]) => Promise<Callables[K][1]> } & { fs: Firestore };

async function signIn(email: string): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, `lottery-${email}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] });
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  const call = <K extends keyof Callables>(name: K) => async (req: Callables[K][0]) =>
    (await httpsCallable<Callables[K][0], Callables[K][1]>(functions, name)(req)).data;
  // 'then' must stay undefined, or awaiting the client would call a function named then.
  return new Proxy({ fs } as Client, { get: (t, k) => (k === 'then' || typeof k !== 'string' ? undefined : k in t ? t[k as 'fs'] : call(k as keyof Callables)) });
}

const SELLER = 'seller@korea.ac.kr';
const SELLER2 = 'seller2@korea.ac.kr';
const W = ['w1@korea.ac.kr', 'w2@korea.ac.kr', 'w3@korea.ac.kr', 'w4@korea.ac.kr'];
const GHOST = 'ghost@korea.ac.kr'; // on the waitlist, never signed in
const ADMIN = 'lottery-admin@korea.ac.kr';
const START = Date.parse('2026-11-20T18:00:00+09:00');

let seller: Client, seller2: Client, chief: Client;
const waiters: Client[] = [];
const waitlistDoc = async (email: string) => (await db.doc(`events/${EVENT}/waitlist/${email}`).get()).data();
const seed = (s: string) => ({ seed: hashText(s), seedBlock: 1, commitTx: null, seedTx: null });

beforeAll(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await db.doc(`events/${EVENT}`).set({
    name: 'Lottery Festival',
    schoolIds: ['korea'],
    date: Timestamp.fromMillis(START),
    capacity: 2,
    faceValue: 0,
    allowedDomains: ['korea.ac.kr'],
    issuedCount: 0,
    nftSeq: 0,
    enteredCount: 0,
    reassignMode: 'lottery',
  });
  await db.doc(`seedProfiles/${ADMIN}`).set({ name: 'Admin', studentId: '', photoUrl: null, role: 'admin' });
  [seller, seller2, chief] = await Promise.all([SELLER, SELLER2, ADMIN].map(signIn));
  waiters.push(...(await Promise.all(W.map(signIn))));
  await Promise.all([seller, seller2, chief, ...waiters].map((c) => c.ensureUser()));
  await Promise.all(
    [...W, GHOST].map((email, i) => db.doc(`events/${EVENT}/waitlist/${email}`).set({ order: i + 1, status: 'waiting', assignedTicketId: null })),
  );
});

afterAll(async () => {
  await Promise.all(apps.map(deleteClientApp));
  await deleteApp(admin);
});

describe('lottery event', () => {
  let t1: string, t2: string;

  it('a cancel puts the ticket in the pool and tells the seller nothing more', async () => {
    t1 = (await seller.issueTicket({ eventId: EVENT })).ticketId;
    t2 = (await seller2.issueTicket({ eventId: EVENT })).ticketId;
    expect(await seller.cancelTicket({ ticketId: t1 })).toEqual({ ok: true, outcome: 'POOLED' });
    expect((await db.doc(`tickets/${t1}`).get()).data()).toMatchObject({ status: 'pooled', ownerUid: null, drawRound: null });
    expect((await db.doc(`events/${EVENT}`).get()).get('issuedCount')).toBe(2); // still taken: it goes to the draw
    // The seller cannot read the ticket any more, and nobody reads the secret plan or draws.
    expect(await getDoc(clientDoc(seller.fs, 'tickets', t1)).then(() => 'read', (e) => e.code)).toBe('permission-denied');
    expect(await getDoc(clientDoc(chief.fs, 'lotteryPlans', EVENT)).then(() => 'read', (e) => e.code)).toBe('permission-denied');
    expect(await seller.getMyLottery({ eventId: EVENT })).toMatchObject({ state: 'NONE', receipt: null });
    expect(await waiters[0].getMyLottery({ eventId: EVENT })).toMatchObject({ state: 'WAITING', offer: null, receipt: null });
  });

  it('runDrawNow is admin only and refuses a second open round', async () => {
    expect(await waiters[0].runDrawNow({ eventId: EVENT }).then(() => 'resolved', (e) => e.code)).toBe('functions/permission-denied');
    const r = await chief.runDrawNow({ eventId: EVENT });
    expect(r).toEqual({ ok: true, round: 1, tickets: 1, entries: 4 }); // the never-signed-in ghost is left out
    expect(await chief.runDrawNow({ eventId: EVENT })).toEqual({ ok: false, reason: 'ROUND_OPEN' });
    expect((await db.doc(`chainOps/draw-${EVENT}-1`).get()).data()).toMatchObject({ kind: 'commitDraw', round: 1, status: 'pending' });
    const draw = (await drawRef(db, EVENT, 1).get()).data()!;
    expect(draw.entries.map((e: { email: string }) => e.email).sort()).toEqual([...W].sort());
  });

  let winner: number;
  it('the seed decides the winner; the announcement makes one offer and gives every entrant a receipt', async () => {
    await applySeed(db, EVENT, 1, seed('round-1'), Date.now());
    const draw = (await drawRef(db, EVENT, 1).get()).data()!;
    expect(draw.status).toBe('announced');
    const winnerEmail = draw.winners[0].email as string;
    winner = W.indexOf(winnerEmail);
    expect((await db.doc(`tickets/${t1}`).get()).data()).toMatchObject({ status: 'offered', offer: { email: winnerEmail, round: 1 } });

    const mine = await waiters[winner].getMyLottery({ eventId: EVENT });
    expect(mine.state).toBe('WON');
    expect(mine.offer?.ticketId).toBe(t1);
    expect(mine.offer!.expiresAt - Date.now()).toBeGreaterThan(59 * 60_000);
    for (const [i, c] of waiters.entries()) {
      const r = await c.getMyLottery({ eventId: EVENT });
      if (i !== winner) expect(r.state).toBe('WAITING'); // losing is not a state: they wait for the next round
      expect(checkReceipt(r.receipt!, draw.commitment)).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(/entries|order|"count"/);
    }
  });

  it('only the winner can claim; the ticket becomes theirs and a chain reassign (reason 2) is queued', async () => {
    const other = waiters[(winner + 1) % W.length];
    expect(await other.claimTicket({ eventId: EVENT })).toEqual({ ok: false, reason: 'NO_OFFER' });
    expect(await waiters[winner].claimTicket({ eventId: EVENT })).toEqual({ ok: true, ticketId: t1 });
    const ticket = (await db.doc(`tickets/${t1}`).get()).data()!;
    expect(ticket).toMatchObject({ status: 'issued', offer: null, 'chain': { status: 'pending' } });
    const ops = await db.collection('chainOps').where('ticketId', '==', t1).get();
    expect(ops.docs.map((d) => d.data()).find((o) => o.kind === 'reassign')).toMatchObject({ reason: 2 });
    expect(await waiters[winner].getMyLottery({ eventId: EVENT })).toMatchObject({ state: 'CLAIMED' });
    expect((await waiters[winner].claimTicket({ eventId: EVENT })).ok).toBe(false);
    const record = (await db.collection('reassignments').where('ticketId', '==', t1).get()).docs[0].data();
    expect(record).toMatchObject({ mode: 'lottery', toName: expect.any(String) });
    expect(record.toUid).not.toBeNull();
  });

  it('an unclaimed offer expires: the entry leaves the waitlist and the ticket goes back to the pool', async () => {
    expect(await seller2.cancelTicket({ ticketId: t2 })).toEqual({ ok: true, outcome: 'POOLED' });
    expect((await chief.runDrawNow({ eventId: EVENT })).ok).toBe(true);
    await applySeed(db, EVENT, 2, seed('round-2'), Date.now());
    const w = (await drawRef(db, EVENT, 2).get()).data()!.winners[0].email as string;
    expect(W[winner]).not.toBe(w); // the claimed winner holds a ticket and was not in round 2
    await db.doc(`events/${EVENT}/waitlist/${w}`).update({ offerExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await db.doc(`tickets/${t2}`).update({ 'offer.expiresAt': Timestamp.fromMillis(Date.now() - 1000) });
    expect(await waiters[W.indexOf(w)].claimTicket({ eventId: EVENT })).toEqual({ ok: false, reason: 'EXPIRED' });
    await tickEvent(db, EVENT, Date.now(), () => 0.5);
    expect(await waitlistDoc(w)).toMatchObject({ status: 'expired' });
    expect((await db.doc(`tickets/${t2}`).get()).data()).toMatchObject({ status: 'pooled', drawRound: null, offer: null });
    expect(await waiters[W.indexOf(w)].getMyLottery({ eventId: EVENT })).toMatchObject({ state: 'EXPIRED' });
  });

  it('the schedule plans a secret draw, snapshots, commits 10 min ahead and announces at the fixed time', async () => {
    const day = Date.parse('2026-11-10T00:00:00+09:00');
    await planRef(db, EVENT).set({ status: 'announced', lastAnnounceAtMs: day - 12 * 3_600_000 }, { merge: true });
    expect(await tickEvent(db, EVENT, day + 1000, () => 0)).toEqual(['planned']);
    const plan = (await planRef(db, EVENT).get()).data()!;
    expect(plan.announceAtMs).toBe(Date.parse('2026-11-10T12:00:00+09:00'));
    expect(plan.drawAtMs).toBe(day + 1000); // gap already passed, so any time from now
    const r3 = (plan.round as number) + 1;
    expect(await tickEvent(db, EVENT, plan.drawAtMs, () => 0)).toEqual(['snapshot']);
    expect(await tickEvent(db, EVENT, plan.announceAtMs - 11 * 60_000, () => 0)).toEqual([]);
    expect(await tickEvent(db, EVENT, plan.announceAtMs - 10 * 60_000, () => 0)).toEqual(['commit']);
    await applySeed(db, EVENT, r3, seed('round-3'), plan.announceAtMs - 9 * 60_000);
    expect((await drawRef(db, EVENT, r3).get()).get('status')).toBe('seeded'); // not announced before its time
    expect(await tickEvent(db, EVENT, plan.announceAtMs - 60_000, () => 0)).toEqual([]);
    expect(await tickEvent(db, EVENT, plan.announceAtMs, () => 0)).toEqual(['announced']);
  });

  it('a winner who got a ticket another way since the draw cannot claim a second one', async () => {
    const round = (await planRef(db, EVENT).get()).get('round') as number;
    const w = ((await drawRef(db, EVENT, round).get()).get('winners') as { email: string; uid: string; ticketId: string }[])[0];
    const extra = db.collection('tickets').doc();
    await extra.set({ eventId: EVENT, ownerUid: w.uid, status: 'issued', nftNumber: '#9999' });
    expect(await waiters[W.indexOf(w.email)].claimTicket({ eventId: EVENT })).toEqual({ ok: false, reason: 'NO_OFFER' });
    expect((await db.doc(`tickets/${w.ticketId}`).get()).data()).toMatchObject({ status: 'pooled', offer: null, drawRound: null });
    expect(await waitlistDoc(w.email)).toMatchObject({ status: 'withdrawn' });
    await extra.delete();
  });

  it('closes 3 h before the start: pooled tickets are released and issuable again', async () => {
    const winners = (await drawRef(db, EVENT, (await planRef(db, EVENT).get()).get('round')).get()).get('winners') as { email: string }[];
    // Let the round-3 offer lapse so a ticket is pooled at the close.
    for (const w of winners) {
      await db.doc(`events/${EVENT}/waitlist/${w.email}`).update({ offerExpiresAt: Timestamp.fromMillis(0) });
    }
    const did = await tickEvent(db, EVENT, START - 3 * 3_600_000, () => 0);
    expect(did).toContain('closed');
    expect((await db.doc(`tickets/${t2}`).get()).get('status')).toBe('cancelled');
    expect((await db.doc(`events/${EVENT}`).get()).get('issuedCount')).toBe(1);
    const ops = await db.collection('chainOps').where('ticketId', '==', t2).get();
    expect(ops.docs.map((d) => d.data()).find((o) => o.kind === 'release')).toMatchObject({ reason: 3 });
    expect(await tickEvent(db, EVENT, START - 3_600_000, () => 0)).toEqual([]);
  });

  it('after the close, a cancel releases the ticket instead of pooling it', async () => {
    const holder = waiters[winner];
    const before = (await db.doc(`events/${EVENT}`).get()).get('issuedCount') as number;
    expect(await holder.cancelTicket({ ticketId: t1 })).toEqual({ ok: true, outcome: 'RELEASED' });
    expect((await db.doc(`tickets/${t1}`).get()).get('status')).toBe('cancelled');
    expect((await db.doc(`events/${EVENT}`).get()).get('issuedCount')).toBe(before - 1);
  });

  it('after the close, an offer that lapses later is released on the next tick', async () => {
    const ref = db.collection('tickets').doc();
    await ref.set({ eventId: EVENT, status: 'pooled', ownerUid: null, drawRound: null, nftNumber: '#0099' });
    await db.doc(`events/${EVENT}`).update({ issuedCount: FieldValue.increment(1) });
    expect(await tickEvent(db, EVENT, START - 3_600_000, () => 0)).toEqual(['closed']);
    expect((await ref.get()).get('status')).toBe('cancelled');
  });
});
