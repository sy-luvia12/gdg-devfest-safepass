import { FieldValue, type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import type { ScanResult } from '../api';
import { enqueueChainOps } from '../chain/outbox';
import { db } from '../firebase';
import { qrTokenRef } from './boundary';

export interface Holder {
  name: string;
  studentId: string;
  photoUrl: string | null;
}

export function holderOf(owner: DocumentData | null): Holder {
  return { name: owner?.name ?? '', studentId: owner?.studentId ?? '', photoUrl: owner?.photoUrl ?? null };
}

export const entryCheckRef = (ticketId: string) => db.doc(`entryChecks/${ticketId}`);

export interface ScanRecord {
  eventId: string | null;
  ticketId: string | null;
  owner: DocumentData | null;
  staffUid: string;
  staffName: string;
  result: ScanResult;
}

export function recordScan(tx: Transaction, scan: ScanRecord): void {
  tx.create(db.collection('scanLogs').doc(), {
    eventId: scan.eventId,
    ticketId: scan.ticketId,
    studentName: scan.owner?.name ?? null,
    studentId: scan.owner?.studentId ?? null,
    staffUid: scan.staffUid,
    staffName: scan.staffName,
    result: scan.result,
    scannedAt: FieldValue.serverTimestamp(),
  });
}

// Marks the ticket used, counts the entry and queues the on-chain markUsed. Returns the count after this entry.
export function admitTicket(
  tx: Transaction,
  ticketRef: DocumentReference,
  ticketData: DocumentData,
  eventRef: DocumentReference,
  enteredBefore: number,
): number {
  const { chainSeq } = enqueueChainOps(tx, ticketRef, ticketData, [{ kind: 'markUsed' }]);
  tx.update(ticketRef, {
    chainSeq,
    'chain.status': 'pending',
    status: 'used',
    usedAt: FieldValue.serverTimestamp(),
    qrToken: null,
    qrExpiresAt: null,
  });
  tx.update(eventRef, { enteredCount: FieldValue.increment(1) });
  tx.delete(qrTokenRef(ticketRef.id));
  return enteredBefore + 1;
}
