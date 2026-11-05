import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { MyRosterStatusResponse, RosterStatus } from '../api';
import { isStudentId, normalizeName } from '../domain/roster';
import { db } from '../firebase';
import { DOC_ID, requireAuth } from './boundary';
import { callableOptions } from './callableOptions';
import { entryDrawRef } from './entryDraw';

const MAX_EVENTS = 50;

// For the student's event list and event page: may this student take a ticket at each event, as far as the event
// roster goes? The server compares the event roster with the student's own row, so no client reads a roster.
// issueTicket checks the same rule again when the student takes a ticket.
export const myRosterStatus = onCall<unknown, Promise<MyRosterStatusResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const ids = (request.data as { eventIds?: unknown } | null)?.eventIds;
  if (!Array.isArray(ids) || ids.length > MAX_EVENTS || !ids.every((id) => typeof id === 'string' && DOC_ID.test(id))) {
    throw new HttpsError('invalid-argument', `eventIds must be a list of at most ${MAX_EVENTS} event ids.`);
  }
  const eventIds = [...new Set(ids as string[])];
  const user = (await db.doc(`users/${caller.uid}`).get()).data() ?? {};
  const studentId = typeof user.studentId === 'string' && isStudentId(user.studentId) ? user.studentId : '';

  const status: Record<string, RosterStatus> = {};
  if (eventIds.length === 0) return { status };
  const events = await db.getAll(...eventIds.map((id) => db.doc(`events/${id}`)));
  const rosterOnly = events.filter((e) => e.exists && e.get('instantDraw') !== true && e.get('requireRoster') === true && e.get('roster'));
  const rows = studentId && rosterOnly.length
    ? await db.getAll(...rosterOnly.map((e) => db.doc(`events/${e.id}/roster/${studentId}`)))
    : [];
  const rowOf = new Map(rows.map((r, i) => [rosterOnly[i].id, r]));
  // Draw events answer with the student's own entry instead of a roster row.
  const drawEvents = events.filter((e) => e.exists && e.get('instantDraw') === true);
  const entries = studentId && drawEvents.length ? await db.getAll(...drawEvents.map((e) => entryDrawRef(e.id, studentId))) : [];
  const entryOf = new Map(entries.map((d, i) => [drawEvents[i].id, d]));
  for (const e of events) {
    if (!e.exists) continue;
    if (e.get('instantDraw') === true) {
      const entry = entryOf.get(e.id);
      const s = entry?.exists && entry.get('uid') === caller.uid ? entry.get('status') : null;
      status[e.id] = s === 'won' ? 'draw_won' : s === 'lost' ? 'draw_lost' : s ? 'draw_pending' : 'draw_open';
    } else if (e.get('requireRoster') !== true) status[e.id] = 'open';
    else if (!e.get('roster')) status[e.id] = 'no_roster';
    else {
      const row = rowOf.get(e.id);
      const same = !!row?.exists && normalizeName(String(row.get('name') ?? '')) === normalizeName(String(user.name ?? ''));
      status[e.id] = same ? 'on_roster' : 'not_on_roster';
    }
  }
  return { status };
});
