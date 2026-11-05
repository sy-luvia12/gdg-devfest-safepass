import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ChainError, redact, type ChainClient } from './client';
import { applySeed, voidRound } from '../lottery/rounds';
import { chainOpId, type ChainOpDoc } from './outbox';
import { deriveAddress } from './wallets';

export interface ChainDeps {
  db: Firestore;
  /** null while the chain is not configured: ops stay pending and can be replayed later. */
  client: ChainClient | null;
  mnemonic: string | null;
}

export type ProcessOutcome = 'done' | 'skipped' | 'blocked' | 'disabled';

/** Thrown so the trigger retries later: the op before this one has not reached the chain yet. */
export class WaitingForPrevious extends Error {}

/** The student's address. The index is given out once per user from a counter and kept on the user. */
export async function walletAddressFor(db: Firestore, mnemonic: string, uid: string): Promise<string> {
  return db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const user = await tx.get(userRef);
    const known = user.get('walletAddress');
    if (typeof known === 'string') return known;
    const counterRef = db.doc('counters/wallets');
    const index = ((await tx.get(counterRef)).get('next') as number | undefined) ?? 0;
    const address = deriveAddress(mnemonic, index);
    tx.set(counterRef, { next: index + 1 }, { merge: true });
    tx.set(userRef, { walletIndex: index, walletAddress: address }, { merge: true });
    return address;
  });
}

export async function processChainOp(deps: ChainDeps, opId: string): Promise<ProcessOutcome> {
  const { db, client, mnemonic } = deps;
  const opRef = db.doc(`chainOps/${opId}`);
  const snap = await opRef.get();
  const op = snap.data() as ChainOpDoc | undefined;
  if (!op || op.status === 'done') return 'skipped';
  if (!client || !mnemonic) return 'disabled';
  if ((op as { kind: string }).kind === 'commitDraw') return processDrawOp(deps, client, opRef, snap.data() as DrawOpDoc);
  if ((op as { kind: string }).kind === 'openEntry') return processEntryOp(deps, client, opRef, snap.data() as EntryOpDoc);
  if (op.seq > 1) {
    const prev = await db.doc(`chainOps/${chainOpId(op.ticketId, op.seq - 1)}`).get();
    if (prev.get('status') !== 'done') throw new WaitingForPrevious(`${opId} waits for op ${op.seq - 1}`);
  }

  const ticketRef = db.doc(`tickets/${op.ticketId}`);
  try {
    let txHash: string | null;
    const ticketUpdate: Record<string, unknown> = {};
    switch (op.kind) {
      case 'mint': {
        const capacity = ((await db.doc(`events/${op.eventId}`).get()).get('capacity') as number | undefined) ?? 0;
        await client.ensureEvent(op.eventId, capacity);
        const to = await walletAddressFor(db, mnemonic, op.toUid);
        const r = await client.mint({ ticketId: op.ticketId, eventId: op.eventId, to });
        txHash = r.txHash;
        ticketUpdate['chain.tokenId'] = r.tokenId;
        ticketUpdate['chain.contractOwner'] = to;
        if (r.txHash) ticketUpdate['chain.mintTx'] = r.txHash;
        break;
      }
      case 'reassign': {
        const to = await walletAddressFor(db, mnemonic, op.toUid);
        txHash = (await client.reassign({ ticketId: op.ticketId, to, reason: op.reason })).txHash;
        ticketUpdate['chain.contractOwner'] = to;
        break;
      }
      case 'release':
        txHash = (await client.release({ ticketId: op.ticketId, reason: op.reason })).txHash;
        ticketUpdate['chain.contractOwner'] = null;
        break;
      case 'markUsed':
        txHash = (await client.markUsed(op.ticketId)).txHash;
        break;
    }

    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ticketRef)).get('chainSeq') === op.seq;
      tx.update(opRef, { status: 'done', txHash, error: null, doneAt: FieldValue.serverTimestamp() });
      tx.update(ticketRef, {
        ...ticketUpdate,
        ...(txHash ? { 'chain.lastTx': txHash } : {}),
        'chain.status': latest ? 'done' : 'pending',
      });
      if ((op.kind === 'reassign' || op.kind === 'release') && txHash) {
        tx.update(db.doc(`reassignments/${op.reassignmentId}`), { txHash });
      }
    });
    return 'done';
  } catch (e) {
    if (e instanceof ChainError && e.code === 'INSUFFICIENT_FUNDS') {
      // Retrying cannot help until someone funds the minter, so the op parks until retryChainOps.
      await opRef.update({ status: 'blocked', error: e.code, attempts: FieldValue.increment(1) });
      await ticketRef.update({ 'chain.status': 'blocked' });
      return 'blocked';
    }
    await opRef.update({ error: redact(e instanceof Error ? e.message : String(e)), attempts: FieldValue.increment(1) });
    throw e;
  }
}

interface DrawOpDoc {
  kind: 'commitDraw';
  eventId: string;
  round: number;
  commitment: string;
}

/** A lottery round: commit, seed, then the winners are worked out in Firestore (lottery/rounds.ts). */
async function processDrawOp(
  deps: ChainDeps,
  client: ChainClient,
  opRef: FirebaseFirestore.DocumentReference,
  op: DrawOpDoc,
): Promise<ProcessOutcome> {
  try {
    const capacity = ((await deps.db.doc(`events/${op.eventId}`).get()).get('capacity') as number | undefined) ?? 0;
    await client.ensureEvent(op.eventId, capacity);
    const r = await client.drawRound({ eventId: op.eventId, round: op.round, commitment: op.commitment });
    await applySeed(deps.db, op.eventId, op.round, r, Date.now());
    await opRef.update({ status: 'done', txHash: r.seedTx ?? r.commitTx, error: null, doneAt: FieldValue.serverTimestamp() });
    return 'done';
  } catch (e) {
    if (e instanceof ChainError && e.code === 'INSUFFICIENT_FUNDS') {
      await opRef.update({ status: 'blocked', error: e.code, attempts: FieldValue.increment(1) });
      return 'blocked';
    }
    if (e instanceof ChainError && e.code === 'SEED_EXPIRED') {
      await voidRound(deps.db, op.eventId, op.round);
      await opRef.update({ status: 'done', error: e.code, doneAt: FieldValue.serverTimestamp() });
      return 'done';
    }
    await opRef.update({ error: redact(e instanceof Error ? e.message : String(e)), attempts: FieldValue.increment(1) });
    throw e;
  }
}

interface EntryOpDoc {
  kind: 'openEntry';
  eventId: string;
  entryDocId: string;
}

/** An instant entry draw: open, wait for the seed block, settle. The contract decides won or lost. */
async function processEntryOp(
  deps: ChainDeps,
  client: ChainClient,
  opRef: FirebaseFirestore.DocumentReference,
  op: EntryOpDoc,
): Promise<ProcessOutcome> {
  const entryRef = deps.db.doc(`entryDraws/${op.entryDocId}`);
  try {
    const entry = (await entryRef.get()).data();
    if (!entry) {
      await opRef.update({ status: 'done', error: 'ENTRY_MISSING', doneAt: FieldValue.serverTimestamp() });
      return 'skipped';
    }
    const capacity = ((await deps.db.doc(`events/${op.eventId}`).get()).get('capacity') as number | undefined) ?? 0;
    await client.ensureEvent(op.eventId, capacity);
    const r = await client.drawEntry({ eventId: op.eventId, entryId: entry.entryId, winBps: entry.winBps });
    await deps.db.runTransaction(async (tx) => {
      tx.update(entryRef, {
        status: r.won ? 'won' : 'lost',
        seedBlock: r.seedBlock,
        seed: r.seed,
        score: r.score,
        ...(r.openTx ? { openTx: r.openTx } : {}),
        settleTx: r.settleTx,
        settledAt: FieldValue.serverTimestamp(),
      });
      tx.update(opRef, { status: 'done', txHash: r.settleTx ?? r.openTx, error: null, doneAt: FieldValue.serverTimestamp() });
    });
    return 'done';
  } catch (e) {
    if (e instanceof ChainError && e.code === 'INSUFFICIENT_FUNDS') {
      await opRef.update({ status: 'blocked', error: e.code, attempts: FieldValue.increment(1) });
      return 'blocked';
    }
    await opRef.update({ error: redact(e instanceof Error ? e.message : String(e)), attempts: FieldValue.increment(1) });
    throw e;
  }
}
