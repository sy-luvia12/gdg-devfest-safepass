import { FieldValue, type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { db } from '../firebase';
import { keccak256, toUtf8Bytes } from 'ethers';
import type { Action, Reason } from './ids';

// Outbox for the chain (docs/api.md 8장). A handler writes the ticket change and the chain work in one
// Firestore transaction. processChainOp then sends the work to the chain, one op at a time, in order.
// Firestore stays the source of truth: a slow or failing chain never blocks issue, entry or cancel.

export type ChainOpInput =
  | { kind: 'mint'; toUid: string }
  | { kind: 'reassign'; toUid: string; reason: Reason; reassignmentId: string }
  | { kind: 'release'; reason: Reason; reassignmentId: string }
  | { kind: 'markUsed' };

export type ChainOpStatus = 'pending' | 'done' | 'blocked';

export type ChainOpDoc = ChainOpInput & {
  ticketId: string;
  eventId: string;
  seq: number;
  status: ChainOpStatus;
  attempts: number;
  txHash: string | null;
  error: string | null;
};

export const chainOpId = (ticketId: string, seq: number) => `${ticketId}-${seq}`;
export const chainOpRef = (ticketId: string, seq: number) => db.doc(`chainOps/${chainOpId(ticketId, seq)}`);

/**
 * Queues chain ops for one ticket inside the caller's transaction. Ops get consecutive numbers per
 * ticket, and processChainOp runs op n only after op n-1 is done. A ticket issued before the chain
 * existed has no mint yet, so its first later op is preceded by a mint to the owner it had then.
 * Returns the fields the caller must write to the ticket in the same transaction.
 */
export function enqueueChainOps(
  tx: Transaction,
  ticketRef: DocumentReference,
  ticket: DocumentData,
  ops: ChainOpInput[],
): { chainSeq: number } {
  let seq = typeof ticket.chainSeq === 'number' ? ticket.chainSeq : 0;
  const queue = seq === 0 && ops[0]?.kind !== 'mint' ? [{ kind: 'mint', toUid: ticket.ownerUid } as const, ...ops] : ops;
  for (const op of queue) {
    seq += 1;
    tx.create(chainOpRef(ticketRef.id, seq), {
      ...op,
      ticketId: ticketRef.id,
      eventId: ticket.eventId,
      seq,
      status: 'pending',
      attempts: 0,
      txHash: null,
      error: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { chainSeq: seq };
}

/**
 * Queues one operator action record (FestivalTicket.recordAction) inside the caller's transaction. It moves no ticket,
 * so it is not part of a ticket's op sequence. ref is a hash of the op id: no personal data, and a retry can find
 * the record it already made.
 */
export function enqueueAction(tx: Transaction, eventId: string, action: Action, note: string): void {
  const ref = db.collection('chainOps').doc();
  tx.create(ref, {
    kind: 'recordAction',
    eventId,
    action,
    ref: keccak256(toUtf8Bytes(`action:${ref.id}`)),
    note,
    seq: 1,
    status: 'pending',
    attempts: 0,
    txHash: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
