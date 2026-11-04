import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { DrawReceipt, GetMyLotteryResponse } from '../api';
import { enqueueChainOps } from '../chain/outbox';
import { REASON, tokenIdOf } from '../chain/ids';
import { claimDeadline, COMMIT_LEAD_MS, drawCloseAt, lotterySettingsOf, nextAnnouncement, pickDrawTime } from '../domain/lottery';
import { isDomainAllowed } from '../domain/ticket';
import { buildSnapshot, drawWinners, leafOf, merkleProof, newSalt } from './draw';

// Cancelled-ticket lottery for events with reassignMode 'lottery' (docs/api.md 14장).
//
//   cancel      ticket -> status 'pooled' (no owner, no QR). The token stays on chain with the old owner for now.
//   snapshot    at a secret time: eligible waitlist entries + pooled tickets, salts, Merkle root, commitment.
//   commit      COMMIT_LEAD_MS before the announcement: chainOps 'commitDraw'. processChainOp commits, waits
//               SEED_DELAY blocks, stores the seed and calls applySeed, which works out the winners.
//   announce    at the fixed public time: winners get an offer, everything else goes back to the pool.
//   claim       within claimWindowMinutes: the ticket becomes the winner's, chain reassign (reason 2).
//   expire      an unclaimed offer drops the entry from the waitlist; the ticket returns to the pool.
//   close       drawCloseBeforeStartHours before the start: pooled tickets are released (reason 3).
//
// Secret state lives in lotteryPlans/{eventId} and lotteryDraws/{eventId}_{round}; no client can read either
// (firestore.rules has no match for them). Students learn only their own state through getMyLottery.

export type PlanStatus = 'planned' | 'snapshot' | 'committing' | 'seeded' | 'announced' | 'skipped' | 'closed';

interface DrawEntryDoc {
  email: string;
  uid: string;
  salt: string;
  leaf: string;
}
export interface DrawDoc {
  eventId: string;
  round: number;
  status: 'snapshot' | 'committing' | 'seeded' | 'announced';
  announceAtMs: number;
  announceOnSeed: boolean;
  entries: DrawEntryDoc[];
  ticketIds: string[];
  leaves: string[];
  root: string;
  tokenIds: string[];
  commitment: string;
  seed?: string;
  winners?: { email: string; uid: string; ticketId: string; leaf: string }[];
}

export const planRef = (db: Firestore, eventId: string) => db.doc(`lotteryPlans/${eventId}`);
export const drawRef = (db: Firestore, eventId: string, round: number) => db.doc(`lotteryDraws/${eventId}_${round}`);
export const drawOpId = (eventId: string, round: number) => `draw-${eventId}-${round}`;

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);

/** True once no more rounds will be drawn: the plan is closed or the close time has passed. */
export async function lotteryClosed(tx: Transaction, db: Firestore, eventId: string, eventData: FirebaseFirestore.DocumentData, nowMs: number) {
  if ((await tx.get(planRef(db, eventId))).get('status') === 'closed') return true;
  const startMs = ms(eventData.date);
  return startMs !== null && nowMs >= drawCloseAt(lotterySettingsOf(eventData.lottery), startMs);
}

/** cancelTicket for a lottery event: the ticket waits in the pool. Written inside the caller's transaction. */
export function poolTicket(tx: Transaction, ticketRef: DocumentReference, reassignmentId: string) {
  tx.update(ticketRef, { status: 'pooled', ownerUid: null, qrToken: null, qrExpiresAt: null, drawRound: null, offer: null, reassignmentId });
}

async function eligibleEntries(db: Firestore, tx: Transaction, eventId: string) {
  const eventSnap = await tx.get(db.doc(`events/${eventId}`));
  const event = { allowedDomains: (eventSnap.get('allowedDomains') as string[] | undefined) ?? [], reassignMode: eventSnap.get('reassignMode') as string };
  const waiting = await tx.get(db.collection(`events/${eventId}/waitlist`).where('status', '==', 'waiting'));
  const out: { email: string; uid: string }[] = [];
  for (const w of waiting.docs) {
    const email = w.id;
    if (!isDomainAllowed(event, email)) continue;
    const account = (await tx.get(db.collection('users').where('email', '==', email).limit(1))).docs[0];
    if (!account) continue;
    const held = await tx.get(db.collection('tickets').where('eventId', '==', eventId).where('ownerUid', '==', account.id).limit(1));
    if (!held.empty) continue;
    out.push({ email, uid: account.id });
  }
  return { event, eventSnap, entries: out };
}

export type SnapshotResult =
  | { ok: true; round: number; tickets: number; entries: number }
  | { ok: false; reason: 'NOT_LOTTERY' | 'NO_TICKETS' | 'NO_ENTRIES' | 'ROUND_OPEN' };

/** Freezes this round's entrants and tickets. The result stays secret until applySeed and announceRound. */
export async function snapshotRound(
  db: Firestore,
  eventId: string,
  p: { nowMs: number; announceAtMs: number; announceOnSeed: boolean; commitNow: boolean },
): Promise<SnapshotResult> {
  return db.runTransaction(async (tx): Promise<SnapshotResult> => {
    const plan = await tx.get(planRef(db, eventId));
    const status = plan.get('status') as PlanStatus | undefined;
    if (status === 'snapshot' || status === 'committing' || status === 'seeded') return { ok: false, reason: 'ROUND_OPEN' };
    const pooled = await tx.get(
      db.collection('tickets').where('eventId', '==', eventId).where('status', '==', 'pooled').where('drawRound', '==', null),
    );
    const { event, entries } = await eligibleEntries(db, tx, eventId);
    if (event.reassignMode !== 'lottery') return { ok: false, reason: 'NOT_LOTTERY' };
    if (pooled.empty) return { ok: false, reason: 'NO_TICKETS' };
    if (entries.length === 0) return { ok: false, reason: 'NO_ENTRIES' };

    const round = ((plan.get('round') as number | undefined) ?? 0) + 1;
    const withSalt = entries.map((e) => ({ ...e, salt: newSalt() }));
    const ticketIds = pooled.docs.map((d) => d.id);
    const snap = buildSnapshot({ eventId, round, entries: withSalt, tokenIds: ticketIds.map(tokenIdOf) });
    const draw: DrawDoc = {
      eventId,
      round,
      status: p.commitNow ? 'committing' : 'snapshot',
      announceAtMs: p.announceAtMs,
      announceOnSeed: p.announceOnSeed,
      entries: withSalt.map((e) => ({ ...e, leaf: leafOf(snap.eventKey, round, e.uid, e.salt) })),
      ticketIds,
      leaves: snap.leaves,
      root: snap.root,
      tokenIds: snap.tokenIds,
      commitment: snap.commitment,
    };
    tx.set(drawRef(db, eventId, round), { ...draw, snapshotAt: Timestamp.fromMillis(p.nowMs) });
    for (const d of pooled.docs) tx.update(d.ref, { drawRound: round });
    tx.set(planRef(db, eventId), { eventId, round, status: p.commitNow ? 'committing' : 'snapshot', announceAtMs: p.announceAtMs }, { merge: true });
    if (p.commitNow) createCommitOp(tx, db, eventId, round, snap.commitment);
    return { ok: true, round, tickets: ticketIds.length, entries: entries.length };
  });
}

function createCommitOp(tx: Transaction, db: Firestore, eventId: string, round: number, commitment: string) {
  tx.create(db.doc(`chainOps/${drawOpId(eventId, round)}`), {
    kind: 'commitDraw',
    eventId,
    round,
    commitment,
    status: 'pending',
    attempts: 0,
    txHash: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Queues the on-chain commit of a snapshotted round. */
export async function commitRound(db: Firestore, eventId: string, round: number): Promise<void> {
  await db.runTransaction(async (tx) => {
    const draw = (await tx.get(drawRef(db, eventId, round))).data() as DrawDoc | undefined;
    if (!draw || draw.status !== 'snapshot') return;
    tx.update(drawRef(db, eventId, round), { status: 'committing' });
    tx.update(planRef(db, eventId), { status: 'committing' });
    createCommitOp(tx, db, eventId, round, draw.commitment);
  });
}

/** Called once the seed is on chain: works out the winners. Announces at once for runDrawNow rounds. */
export async function applySeed(
  db: Firestore,
  eventId: string,
  round: number,
  chain: { seed: string; seedBlock: number; commitTx: string | null; seedTx: string | null },
  nowMs: number,
): Promise<void> {
  const announceNow = await db.runTransaction(async (tx) => {
    const ref = drawRef(db, eventId, round);
    const draw = (await tx.get(ref)).data() as DrawDoc | undefined;
    if (!draw || draw.status !== 'committing') return false;
    const byLeaf = new Map(draw.entries.map((e) => [e.leaf, e]));
    const ticketByToken = new Map(draw.ticketIds.map((id) => [tokenIdOf(id), id]));
    const winners = drawWinners({ seed: chain.seed, leaves: draw.leaves, tokenIds: draw.tokenIds }).map((w) => {
      const e = byLeaf.get(w.leaf)!;
      return { email: e.email, uid: e.uid, ticketId: ticketByToken.get(w.tokenId)!, leaf: w.leaf };
    });
    tx.update(ref, { status: 'seeded', seed: chain.seed, seedBlock: chain.seedBlock, commitTx: chain.commitTx, seedTx: chain.seedTx, winners });
    tx.update(planRef(db, eventId), { status: 'seeded' });
    return draw.announceOnSeed;
  });
  if (announceNow) await announceRound(db, eventId, round, nowMs);
}

/** The public announcement: offers to the winners, receipts to every entrant, the rest back to the pool. */
export async function announceRound(db: Firestore, eventId: string, round: number, nowMs: number): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const ref = drawRef(db, eventId, round);
    const draw = (await tx.get(ref)).data() as DrawDoc | undefined;
    if (!draw || draw.status !== 'seeded' || !draw.winners) return false;
    const event = (await tx.get(db.doc(`events/${eventId}`))).data() ?? {};
    const expiresAt = Timestamp.fromMillis(claimDeadline(lotterySettingsOf(event.lottery), nowMs));
    const tickets = await Promise.all(draw.ticketIds.map((id) => tx.get(db.doc(`tickets/${id}`))));
    const waitlist = await Promise.all(draw.entries.map((e) => tx.get(db.doc(`events/${eventId}/waitlist/${e.email}`))));
    const holders = new Set<string>();
    for (const w of draw.winners) {
      const held = await tx.get(db.collection('tickets').where('eventId', '==', eventId).where('ownerUid', '==', w.uid).limit(1));
      if (!held.empty) holders.add(w.uid);
    }

    const offered = new Set<string>();
    for (const w of draw.winners) {
      const ticket = tickets.find((t) => t.id === w.ticketId);
      const entry = waitlist.find((x) => x.id === w.email);
      // Someone who took a ticket another way since the snapshot no longer waits; the ticket goes back.
      if (ticket?.get('status') !== 'pooled' || entry?.get('status') !== 'waiting' || holders.has(w.uid)) continue;
      tx.update(ticket.ref, { status: 'offered', offer: { uid: w.uid, email: w.email, round, expiresAt } });
      tx.update(entry.ref, { status: 'offered', offerTicketId: w.ticketId, offerExpiresAt: expiresAt });
      offered.add(w.ticketId);
    }
    for (const t of tickets) if (t.get('status') === 'pooled' && !offered.has(t.id)) tx.update(t.ref, { drawRound: null });
    for (const e of draw.entries) {
      const receipt: DrawReceipt = {
        eventId,
        round,
        uid: e.uid,
        salt: e.salt,
        proof: merkleProof(draw.leaves, e.leaf),
        root: draw.root,
        tokenIds: draw.tokenIds,
      };
      const doc = waitlist.find((x) => x.id === e.email);
      if (doc?.exists) tx.update(doc.ref, { lastReceipt: receipt });
    }
    tx.update(ref, { status: 'announced', announcedAt: Timestamp.fromMillis(nowMs) });
    tx.update(planRef(db, eventId), { status: 'announced', lastAnnounceAtMs: nowMs });
    return true;
  });
}

export type ClaimResult = { ok: true; ticketId: string } | { ok: false; reason: 'NO_OFFER' | 'EXPIRED' };

/** The winner takes the offered ticket. Firestore first; the chain reassign (reason 2) follows. */
export async function claimOffer(db: Firestore, eventId: string, uid: string, email: string, nowMs: number): Promise<ClaimResult> {
  return db.runTransaction(async (tx): Promise<ClaimResult> => {
    const entryRef = db.doc(`events/${eventId}/waitlist/${email}`);
    const entry = await tx.get(entryRef);
    if (entry.get('status') !== 'offered') return { ok: false, reason: 'NO_OFFER' };
    const ticketId = entry.get('offerTicketId') as string;
    const ticketRef = db.doc(`tickets/${ticketId}`);
    const ticket = await tx.get(ticketRef);
    if (ticket.get('status') !== 'offered' || ticket.get('offer.uid') !== uid) return { ok: false, reason: 'NO_OFFER' };
    if ((ms(ticket.get('offer.expiresAt')) ?? 0) < nowMs) return { ok: false, reason: 'EXPIRED' };
    // One ticket per student: someone who got a ticket another way since the draw gives the offer back.
    const held = await tx.get(db.collection('tickets').where('eventId', '==', eventId).where('ownerUid', '==', uid).limit(1));
    if (!held.empty) {
      tx.update(ticketRef, { status: 'pooled', offer: null, drawRound: null });
      tx.update(entryRef, { status: 'withdrawn', offerTicketId: null, offerExpiresAt: null });
      return { ok: false, reason: 'NO_OFFER' };
    }

    const reassignmentId = ticket.get('reassignmentId') as string | undefined;
    const name = ((await tx.get(db.doc(`users/${uid}`))).get('name') as string | undefined) ?? '';
    const { chainSeq } = enqueueChainOps(tx, ticketRef, ticket.data()!, [
      { kind: 'reassign', toUid: uid, reason: REASON.CANCEL_RANDOM, reassignmentId: reassignmentId ?? '' },
    ]);
    tx.update(ticketRef, { status: 'issued', ownerUid: uid, offer: null, drawRound: null, chainSeq, 'chain.status': 'pending' });
    tx.update(entryRef, { status: 'assigned', assignedTicketId: ticketId, offerTicketId: null, offerExpiresAt: null });
    if (reassignmentId) {
      tx.update(db.doc(`reassignments/${reassignmentId}`), { toUid: uid, toName: name, claimedAt: Timestamp.fromMillis(nowMs) });
    }
    return { ok: true, ticketId };
  });
}

/** Unclaimed offers past their deadline: the entry leaves the waitlist, the ticket returns to the pool. */
export async function expireOffers(db: Firestore, eventId: string, nowMs: number): Promise<number> {
  const due = await db
    .collection(`events/${eventId}/waitlist`)
    .where('status', '==', 'offered')
    .where('offerExpiresAt', '<', Timestamp.fromMillis(nowMs))
    .get();
  for (const d of due.docs) {
    await db.runTransaction(async (tx) => {
      const entry = await tx.get(d.ref);
      if (entry.get('status') !== 'offered') return;
      const ticketRef = db.doc(`tickets/${entry.get('offerTicketId')}`);
      const ticket = await tx.get(ticketRef);
      tx.update(d.ref, { status: 'expired', offerTicketId: null });
      if (ticket.get('status') === 'offered') tx.update(ticketRef, { status: 'pooled', offer: null, drawRound: null });
    });
  }
  return due.size;
}

/** After the draw closes, pooled tickets are released on chain (reason 3) and become issuable again. */
export async function closeLottery(db: Firestore, eventId: string): Promise<number> {
  const pooled = await db.collection('tickets').where('eventId', '==', eventId).where('status', '==', 'pooled').get();
  for (const d of pooled.docs) {
    await db.runTransaction(async (tx) => {
      const ticket = await tx.get(d.ref);
      if (ticket.get('status') !== 'pooled') return;
      const { chainSeq } = enqueueChainOps(tx, d.ref, ticket.data()!, [
        { kind: 'release', reason: REASON.CANCEL_RELEASED, reassignmentId: (ticket.get('reassignmentId') as string | undefined) ?? '' },
      ]);
      tx.update(d.ref, { status: 'cancelled', drawRound: null, chainSeq, 'chain.status': 'pending' });
      tx.update(db.doc(`events/${eventId}`), { issuedCount: FieldValue.increment(-1) });
    });
  }
  await planRef(db, eventId).set({ status: 'closed' }, { merge: true });
  return pooled.size;
}

/** The student's own lottery state. Never the waitlist size, order, odds or the secret draw time. */
export async function myLottery(db: Firestore, eventId: string, email: string, nowMs: number): Promise<GetMyLotteryResponse> {
  const [entry, plan] = await Promise.all([db.doc(`events/${eventId}/waitlist/${email}`).get(), planRef(db, eventId).get()]);
  const planStatus = plan.get('status') as PlanStatus | undefined;
  const announceAtMs = plan.get('announceAtMs') as number | undefined;
  const nextAnnounceAt =
    planStatus && planStatus !== 'announced' && planStatus !== 'closed' && planStatus !== 'skipped' && announceAtMs && announceAtMs > nowMs
      ? announceAtMs
      : null;
  const receipt = (entry.get('lastReceipt') as DrawReceipt | undefined) ?? null;
  const base = { nextAnnounceAt, offer: null, receipt };
  if (!entry.exists) return { ...base, state: 'NONE', receipt: null };
  const status = entry.get('status') as string;
  if (status === 'assigned') return { ...base, state: 'CLAIMED' };
  if (status === 'expired') return { ...base, state: 'EXPIRED' };
  if (status === 'offered') {
    const expiresAt = ms(entry.get('offerExpiresAt')) ?? 0;
    if (expiresAt < nowMs) return { ...base, state: 'EXPIRED' };
    return { ...base, state: 'WON', offer: { ticketId: entry.get('offerTicketId') as string, expiresAt } };
  }
  if (planStatus === 'closed') return { ...base, state: 'CLOSED' };
  return { ...base, state: 'WAITING' };
}

/**
 * One pass of the schedule for one lottery event (lotteryTick runs it every few minutes).
 * Returns what it did, for logs and tests.
 */
export async function tickEvent(db: Firestore, eventId: string, nowMs: number, rng: () => number): Promise<string[]> {
  const did: string[] = [];
  const eventSnap = await db.doc(`events/${eventId}`).get();
  const event = eventSnap.data();
  if (!event || event.reassignMode !== 'lottery') return did;
  const settings = lotterySettingsOf(event.lottery);
  const startMs = ms(event.date);
  if (startMs === null) return did;

  if ((await expireOffers(db, eventId, nowMs)) > 0) did.push('expired');
  const plan = (await planRef(db, eventId).get()).data() ?? {};
  const status = plan.status as PlanStatus | undefined;
  if (status === 'closed') {
    // An offer that lapses after the close sends its ticket back to the pool; release it too.
    if ((await closeLottery(db, eventId)) > 0) did.push('closed');
    return did;
  }
  if (nowMs >= drawCloseAt(settings, startMs) && status !== 'committing' && status !== 'seeded' && status !== 'snapshot') {
    await closeLottery(db, eventId);
    did.push('closed');
    return did;
  }

  if (status === undefined || status === 'announced' || status === 'skipped') {
    const announceAtMs = nextAnnouncement(settings, nowMs, startMs);
    if (announceAtMs === null) return did;
    const drawAtMs = pickDrawTime(settings, (plan.lastAnnounceAtMs as number | undefined) ?? null, announceAtMs, startMs, nowMs, rng);
    await planRef(db, eventId).set(
      { eventId, status: drawAtMs === null ? 'skipped' : 'planned', announceAtMs, drawAtMs, ...(drawAtMs === null ? { lastAnnounceAtMs: announceAtMs } : {}) },
      { merge: true },
    );
    did.push(drawAtMs === null ? 'skipped' : 'planned');
    return did;
  }
  if (status === 'planned' && nowMs >= (plan.drawAtMs as number)) {
    const r = await snapshotRound(db, eventId, { nowMs, announceAtMs: plan.announceAtMs as number, announceOnSeed: false, commitNow: false });
    if (!r.ok) {
      // Nothing to draw this time: the slot passes, the next announcement gets planned.
      await planRef(db, eventId).set({ status: 'skipped', lastAnnounceAtMs: plan.announceAtMs }, { merge: true });
      did.push(`skipped:${r.reason}`);
    } else did.push('snapshot');
    return did;
  }
  if (status === 'snapshot' && nowMs >= (plan.announceAtMs as number) - COMMIT_LEAD_MS) {
    await commitRound(db, eventId, plan.round as number);
    did.push('commit');
    return did;
  }
  if (status === 'seeded' && nowMs >= (plan.announceAtMs as number)) {
    if (await announceRound(db, eventId, plan.round as number, nowMs)) did.push('announced');
  }
  return did;
}
