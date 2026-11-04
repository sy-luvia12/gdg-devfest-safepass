import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { CHAIN_SECRETS, chainFromParams } from '../chain/config';
import { processChainOp as process } from '../chain/process';
import { db } from '../firebase';

// One instance handling one op at a time: the single minter wallet then never races its own nonce.
// A thrown error makes Functions retry the event with backoff (chain hiccups, an op waiting for the one before it).
export const processChainOp = onDocumentCreated(
  { document: 'chainOps/{opId}', retry: true, maxInstances: 1, concurrency: 1, secrets: CHAIN_SECRETS },
  async (event) => {
    const outcome = await process({ db, ...chainFromParams() }, event.params.opId);
    logger.info('chain op', { opId: event.params.opId, outcome });
  },
);
