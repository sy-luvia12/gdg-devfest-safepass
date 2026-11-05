import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { GetWaitlistResponse, ImportRosterResponse, RosterSummary, WaitlistRow } from '../api';
import { db } from '../firebase';
import { serviceAccountEmail } from '../sheets/readSheet';
import { hostOf, readDocId, readString, requireAuth, requireSchoolAdmin } from './boundary';
import { callableOptions } from './callableOptions';
import { importWaitlistRows } from './rosterStore';

// The host school's event admin. Returns the host school id.
async function requireEventAdmin(uid: string, eventId: string): Promise<string> {
  return db.runTransaction(async (tx) => {
    const event = await tx.get(db.doc(`events/${eventId}`));
    if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
    const schoolId = hostOf(event.get('schoolIds'));
    await requireSchoolAdmin(tx, uid, schoolId);
    return schoolId;
  });
}

// Loads the waitlist sheet (이름·학번 in waiting order). See importWaitlistRows.
export const importWaitlist = onCall<unknown, Promise<ImportRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  const sheetUrl = readString(request.data, 'sheetUrl');
  const schoolId = await requireEventAdmin(caller.uid, eventId);
  return importWaitlistRows(eventId, sheetUrl, schoolId);
});

// The waitlist for the event admin, in waiting order, without emails.
export const getWaitlist = onCall<unknown, Promise<GetWaitlistResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const eventId = readDocId(request.data, 'eventId');
  await requireEventAdmin(caller.uid, eventId);
  const [event, rows, email] = await Promise.all([
    db.doc(`events/${eventId}`).get(),
    db.collection(`events/${eventId}/waitlist`).get(),
    serviceAccountEmail(),
  ]);
  const s = event.get('waitlist');
  const summary: RosterSummary | null = s
    ? { sheetUrl: s.sheetUrl ?? '', importedAtMs: s.importedAt?.toMillis?.() ?? 0, count: s.count ?? 0 }
    : null;
  const entries: WaitlistRow[] = rows.docs
    .map((d) => ({
      order: (d.get('order') as number | undefined) ?? 0,
      name: (d.get('name') as string | undefined) ?? '',
      studentId: (d.get('studentId') as string | undefined) ?? '',
      status: String(d.get('status') ?? 'waiting'),
    }))
    .sort((a, b) => a.order - b.order);
  return { summary, entries, serviceAccountEmail: email };
});
