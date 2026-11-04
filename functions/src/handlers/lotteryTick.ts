import { randomInt } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../firebase';
import { tickEvent } from '../lottery/rounds';

const unitRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

// Runs the lottery schedule for every event with reassignMode 'lottery': plan the secret draw time, snapshot,
// commit before the announcement, announce, expire unclaimed offers, close before the event.
export const lotteryTick = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const events = await db.collection('events').where('reassignMode', '==', 'lottery').get();
  for (const e of events.docs) {
    try {
      const did = await tickEvent(db, e.id, Date.now(), unitRandom);
      if (did.length) logger.info('lottery', { eventId: e.id, did });
    } catch (err) {
      logger.error('lottery tick failed', { eventId: e.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
});
