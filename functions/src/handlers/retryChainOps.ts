import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RetryChainOpsResponse } from '../api';
import { CHAIN_SECRETS, chainFromParams } from '../chain/config';
import { processChainOp, WaitingForPrevious } from '../chain/process';
import { db } from '../firebase';
import { requireAuth } from './boundary';
import { callableOptions } from './callableOptions';

// Admin replay of chain ops that are not done: ops queued while the chain was off, and ops parked
// as blocked when the minter ran out of gas. Ops run oldest first so each ticket's order holds.
export const retryChainOps = onCall<unknown, Promise<RetryChainOpsResponse>>(
  { ...callableOptions, secrets: CHAIN_SECRETS, timeoutSeconds: 540 },
  async (request) => {
    const caller = requireAuth(request);
    const role = (await db.doc(`users/${caller.uid}`).get()).get('role');
    if (role !== 'admin') throw new HttpsError('permission-denied', 'Role not allowed.');
    const deps = { db, ...chainFromParams() };
    if (!deps.client) throw new HttpsError('failed-precondition', 'The chain is not configured.');

    const open = await db.collection('chainOps').where('status', 'in', ['pending', 'blocked']).get();
    const ops = open.docs.sort((a, b) => a.get('seq') - b.get('seq') || a.createTime.toMillis() - b.createTime.toMillis());
    const counts = { done: 0, blocked: 0, failed: 0 };
    for (const op of ops) {
      if (op.get('status') === 'blocked') await op.ref.update({ status: 'pending' });
      try {
        const outcome = await processChainOp(deps, op.id);
        if (outcome === 'done' || outcome === 'skipped') counts.done += 1;
        else if (outcome === 'blocked') counts.blocked += 1;
      } catch (e) {
        if (!(e instanceof WaitingForPrevious)) counts.failed += 1;
      }
    }
    return { ok: true, ...counts };
  },
);
