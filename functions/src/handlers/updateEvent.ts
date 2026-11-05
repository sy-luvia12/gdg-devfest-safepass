import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { LotteryPatch, UpdateEventResponse } from '../api';
import { lotterySettingsOf, lotterySettingsProblems } from '../domain/lottery';
import { db } from '../firebase';
import {
  hostOf,
  readBoolean,
  readCount,
  readDocId,
  readEventDate,
  readOptional,
  readString,
  requireAuth,
  requireSchoolAdmin,
} from './boundary';
import { callableOptions } from './callableOptions';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numberOrUndefined = (v: unknown) => (v === undefined || (typeof v === 'number' && Number.isFinite(v)) ? v : null);
const timesOrUndefined = (v: unknown) => (v === undefined || (Array.isArray(v) && v.every((t) => typeof t === 'string')) ? v : null);

// The lottery schedule fields an admin may change, checked for shape here and for rules by lotterySettingsProblems.
function readLotteryPatch(data: unknown): LotteryPatch | undefined {
  const raw = (data as { lottery?: unknown } | null)?.lottery;
  if (raw === undefined) return undefined;
  const bad = () => new HttpsError('invalid-argument', 'lottery has a field of the wrong type.');
  if (!isObject(raw) || (raw.finalPhase !== undefined && !isObject(raw.finalPhase))) throw bad();
  const fp = (raw.finalPhase ?? {}) as Record<string, unknown>;
  const fields = {
    announceTimes: timesOrUndefined(raw.announceTimes),
    minDrawGapHours: numberOrUndefined(raw.minDrawGapHours),
    claimWindowMinutes: numberOrUndefined(raw.claimWindowMinutes),
    drawCloseBeforeStartHours: numberOrUndefined(raw.drawCloseBeforeStartHours),
  };
  const finalFields = {
    startsBeforeHours: numberOrUndefined(fp.startsBeforeHours),
    announceTimes: timesOrUndefined(fp.announceTimes),
    minDrawGapHours: numberOrUndefined(fp.minDrawGapHours),
  };
  if ([...Object.values(fields), ...Object.values(finalFields)].includes(null as never)) throw bad();
  const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return { ...defined(fields), ...(raw.finalPhase !== undefined ? { finalPhase: defined(finalFields) } : {}) } as LotteryPatch;
}

// Edits an event's details. The schools taking part are fixed once the event exists.
export const updateEvent = onCall<unknown, Promise<UpdateEventResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const text = (field: string) => readOptional(request.data, field, readString)?.trim();
  const changes = Object.fromEntries(
    Object.entries({
      name: text('name'),
      place: text('place'),
      date: readOptional(request.data, 'date', readEventDate),
      capacity: readOptional(request.data, 'capacity', readCount),
      faceValue: readOptional(request.data, 'faceValue', readCount),
      requireRoster: readOptional(request.data, 'requireRoster', readBoolean),
    }).filter(([, v]) => v !== undefined),
  );

  const lotteryPatch = readLotteryPatch(request.data);

  return db.runTransaction(async (tx): Promise<UpdateEventResponse> => {
    const ref = db.doc(`events/${eventId}`);
    const event = await tx.get(ref);
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    await requireSchoolAdmin(tx, caller.uid, hostOf(event.get('schoolIds')));
    const capacity = changes.capacity as number | undefined;
    if (capacity !== undefined && capacity < Math.max(1, event.get('issuedCount') ?? 0)) {
      throw new HttpsError('failed-precondition', 'capacity cannot go below the tickets already issued.');
    }
    let lottery: unknown;
    if (lotteryPatch) {
      const stored = lotterySettingsOf(event.get('lottery'));
      lottery = lotterySettingsOf({ ...stored, ...lotteryPatch, finalPhase: { ...stored.finalPhase, ...(lotteryPatch.finalPhase ?? {}) } });
      const problems = lotterySettingsProblems(lottery as ReturnType<typeof lotterySettingsOf>);
      if (problems.length > 0) throw new HttpsError('invalid-argument', problems.join(' / '));
    }
    const update = { ...changes, ...(lottery ? { lottery } : {}) };
    if (Object.keys(update).length > 0) tx.update(ref, update);
    return { ok: true };
  });
});
