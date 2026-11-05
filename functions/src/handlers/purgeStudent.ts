import { FieldValue } from 'firebase-admin/firestore';
import { REASON } from '../chain/ids';
import { enqueueChainOps } from '../chain/outbox';
import { db } from '../firebase';
import { qrTokenRef } from './boundary';

// When the operator deletes a student from a school roster, the student's records go too, so the same person can be
// added again and start over (sign-up, photos, tickets, draws). Firestore records are removed or detached:
//   tickets      an unused ticket is released (on chain: reason 3, back to the pool) and its seat comes back; a used
//                one is detached from the student and the entry count goes down (a used token stays on chain)
//   scanLogs     the scans of those tickets
//   reassignments  records the student cancelled from or received, so they can take a ticket again
//   entryDraws   instant-draw entries, so they can enter again. The settled entry stays on chain: a second entry for
//                the same event is visible there as a second EntryOpened.
//   devices, deviceResets, idCards, signup flags on users/{uid}
// The chain keeps its history; nothing here rewrites it.

export interface PurgeResult {
  tickets: number;
  entries: number;
}

export async function purgeStudent(schoolId: string, studentId: string, uid: string | null): Promise<PurgeResult> {
  let tickets = 0;
  const ticketIds: string[] = [];
  if (uid) {
    const owned = await db.collection('tickets').where('ownerUid', '==', uid).get();
    for (const t of owned.docs) {
      const done = await db.runTransaction(async (tx) => {
        const snap = await tx.get(t.ref);
        const d = snap.data();
        if (!d || d.ownerUid !== uid || (d.status !== 'issued' && d.status !== 'used')) return false;
        const eventRef = db.doc(`events/${d.eventId}`);
        const used = d.status === 'used';
        const chain = used
          ? {}
          : (() => {
              const { chainSeq } = enqueueChainOps(tx, t.ref, d, [{ kind: 'release', reason: REASON.CANCEL_RELEASED, reassignmentId: '' }]);
              return { chainSeq, 'chain.status': 'pending' };
            })();
        tx.update(t.ref, { status: 'cancelled', ownerUid: null, qrToken: null, qrExpiresAt: null, purgedAt: FieldValue.serverTimestamp(), ...chain });
        tx.update(eventRef, { issuedCount: FieldValue.increment(-1), ...(used ? { enteredCount: FieldValue.increment(-1) } : {}) });
        tx.delete(qrTokenRef(t.id));
        return true;
      });
      if (done) {
        tickets += 1;
        ticketIds.push(t.id);
      }
    }
  }

  const writer = db.bulkWriter();
  for (let i = 0; i < ticketIds.length; i += 30) {
    const logs = await db.collection('scanLogs').where('ticketId', 'in', ticketIds.slice(i, i + 30)).get();
    for (const l of logs.docs) void writer.delete(l.ref);
  }
  if (uid) {
    for (const field of ['fromUid', 'toUid']) {
      for (const r of (await db.collection('reassignments').where(field, '==', uid).get()).docs) void writer.delete(r.ref);
    }
    for (const path of [`devices/${uid}`, `deviceResets/${uid}`, `idCards/${uid}`]) void writer.delete(db.doc(path));
    const user = db.doc(`users/${uid}`);
    if ((await user.get()).exists) {
      void writer.update(user, {
        rosterVerified: FieldValue.delete(),
        photoSubmitted: FieldValue.delete(),
        idCardSubmitted: FieldValue.delete(),
        photoUrl: FieldValue.delete(),
      });
    }
  }
  const entries = (await db.collection('entryDraws').where('studentId', '==', studentId).get()).docs.filter(
    (d) => d.get('schoolId') === schoolId,
  );
  for (const e of entries) void writer.delete(e.ref);
  await writer.close();
  return { tickets, entries: entries.length };
}
