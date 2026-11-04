import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  OPS_EDIT_MAX,
  type OpsEditRosterResponse,
  type OpsListRosterResponse,
  type OpsListStudentsResponse,
  type OpsRosterKind,
  type OpsRosterRow,
  type OpsStudent,
  type RosterSkipReason,
  type RosterSummary,
} from '../api';
import { eventRowProblem, matchEventRow, studentRowProblem, type EventRosterRow, type RosterRow } from '../domain/roster';
import { db } from '../firebase';
import { hostOf, readDocId, requireAuth, requireOperator } from './boundary';
import { callableOptions } from './callableOptions';
import { eventRosterPlace, schoolRowsFor, studentRosterPlace, writeSummary, type RosterPlace } from './rosterStore';

// The operator console edits the rosters stored in Firestore directly, so the team can fix demo data without
// touching a Google Sheet or the Firebase console. Every function here is for the operator account only.

const LIST_MAX = 5000;

function readKind(data: unknown): OpsRosterKind {
  const kind = (data as { kind?: unknown } | null)?.kind;
  if (kind !== 'school' && kind !== 'event') throw new HttpsError('invalid-argument', "kind must be 'school' or 'event'.");
  return kind;
}

// The roster place and, for an event, its host school. Throws not-found for a missing school or event.
async function placeOf(
  kind: OpsRosterKind,
  id: string,
): Promise<{ place: RosterPlace; schoolId: string; domains: string[]; sheetImported: boolean }> {
  if (kind === 'school') {
    const school = await db.doc(`schools/${id}`).get();
    if (!school.exists) throw new HttpsError('not-found', 'School not found.');
    return {
      place: studentRosterPlace(id),
      schoolId: id,
      domains: (school.get('domains') as string[] | undefined) ?? [],
      sheetImported: true,
    };
  }
  const event = await db.doc(`events/${id}`).get();
  if (!event.exists) throw new HttpsError('not-found', 'Event not found.');
  // The event admin loads the event roster from a sheet at least once (importEventRoster sets roster.sheetUrl)
  const sheetImported = !!(event.get('roster') as { sheetUrl?: string } | undefined)?.sheetUrl;
  return { place: eventRosterPlace(id), schoolId: hostOf(event.get('schoolIds')), domains: [], sheetImported };
}

function summaryOf(v: unknown): RosterSummary | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as { sheetUrl?: string; importedAt?: { toMillis?: () => number }; count?: number };
  return { sheetUrl: s.sheetUrl ?? '', importedAtMs: s.importedAt?.toMillis?.() ?? 0, count: s.count ?? 0 };
}

export const opsListRoster = onCall<unknown, Promise<OpsListRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const kind = readKind(request.data);
  const id = readDocId(request.data, 'id');
  await db.runTransaction((tx) => requireOperator(tx, caller.uid));
  const { place, schoolId, sheetImported } = await placeOf(kind, id);
  const [parent, snap] = await Promise.all([place.parent.get(), place.rows.orderBy('studentId').limit(LIST_MAX).get()]);
  const summary = summaryOf(parent.get(place.summaryField));

  if (kind === 'school') {
    const rows: OpsRosterRow[] = snap.docs.map((d) => ({
      name: d.get('name') ?? '',
      studentId: d.get('studentId') ?? d.id,
      email: d.get('email') ?? '',
      claimed: !!d.get('claimedBy'),
    }));
    return { rows, summary, editable: true };
  }
  const school = await schoolRowsFor(schoolId, snap.docs.map((d) => d.id));
  const rows: OpsRosterRow[] = snap.docs.map((d) => {
    const row: EventRosterRow = { name: d.get('name') ?? '', studentId: d.get('studentId') ?? d.id };
    const match = school.get(row.studentId);
    return { ...row, ...(match?.email ? { email: match.email } : {}), match: matchEventRow(row, match ?? null) };
  });
  return { rows, summary, schoolId, editable: sheetImported };
});

interface UpsertInput {
  name: string;
  studentId: string;
  email: string;
}

function readUpserts(data: unknown): UpsertInput[] {
  const value = (data as { upserts?: unknown } | null)?.upserts;
  if (!Array.isArray(value) || value.length > OPS_EDIT_MAX) {
    throw new HttpsError('invalid-argument', `upserts must be a list of at most ${OPS_EDIT_MAX} rows.`);
  }
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return value.map((v) => {
    const r = (v ?? {}) as Record<string, unknown>;
    return { name: text(r.name), studentId: text(r.studentId), email: text(r.email).toLowerCase() };
  });
}

function readDeletes(data: unknown): string[] {
  const value = (data as { deletes?: unknown } | null)?.deletes ?? [];
  if (!Array.isArray(value) || value.length > OPS_EDIT_MAX || !value.every((v) => typeof v === 'string')) {
    throw new HttpsError('invalid-argument', `deletes must be a list of at most ${OPS_EDIT_MAX} student ids.`);
  }
  return value as string[];
}

export const opsEditRoster = onCall<unknown, Promise<OpsEditRosterResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const kind = readKind(request.data);
  const id = readDocId(request.data, 'id');
  const upserts = readUpserts(request.data);
  const deletes = readDeletes(request.data);
  const replace = (request.data as { replace?: unknown }).replace === true;
  await db.runTransaction((tx) => requireOperator(tx, caller.uid));
  const { place, domains, sheetImported } = await placeOf(kind, id);
  // An event roster starts from the event admin's sheet; the console only fixes it afterwards.
  if (!sheetImported) {
    throw new HttpsError('failed-precondition', 'The event admin has not loaded a roster sheet yet.', { reason: 'NO_SHEET_IMPORT' });
  }

  // Check every row first; a later row with the same student id or email wins over an earlier one.
  const skipped: { index: number; reason: RosterSkipReason }[] = [];
  const byId = new Map<string, RosterRow | EventRosterRow>();
  upserts.forEach((input, index) => {
    if (!input.name && !input.studentId && !input.email) return;
    const row: RosterRow | EventRosterRow =
      kind === 'school' ? input : { name: input.name, studentId: input.studentId };
    const problem = kind === 'school' ? studentRowProblem(row as RosterRow, domains) : eventRowProblem(row);
    if (problem) return skipped.push({ index, reason: problem });
    byId.set(row.studentId, row);
  });
  if (kind === 'school') {
    const seen = new Map<string, string>();
    for (const row of byId.values()) {
      const email = (row as RosterRow).email;
      const other = seen.get(email);
      if (other) {
        byId.delete(other);
        skipped.push({ index: upserts.findIndex((u) => u.studentId === other), reason: 'DUPLICATE_EMAIL' });
      }
      seen.set(email, row.studentId);
    }
  }

  const keep = new Set(byId.keys());
  const toDelete = new Set(deletes.filter((d) => !keep.has(d)));
  if (replace) for (const ref of await place.rows.listDocuments()) if (!keep.has(ref.id)) toDelete.add(ref.id);

  const writer = db.bulkWriter();
  for (const studentId of toDelete) {
    if (/^[A-Za-z0-9-]{1,32}$/.test(studentId)) void writer.delete(place.rows.doc(studentId));
  }
  // merge keeps claimedBy on school rows a student already signed up with
  for (const row of byId.values()) void writer.set(place.rows.doc(row.studentId), row, { merge: true });
  await writer.close();

  const count = (await place.rows.count().get()).data().count;
  const summary = await writeSummary(place, count);
  return { ok: true, saved: byId.size, deleted: toDelete.size, skipped, summary };
});

export const opsListStudents = onCall<unknown, Promise<OpsListStudentsResponse>>(callableOptions, async (request) => {
  const caller = requireAuth(request);
  const schoolId = readDocId(request.data, 'schoolId');
  await db.runTransaction((tx) => requireOperator(tx, caller.uid));
  const users = await db.collection('users').where('schoolId', '==', schoolId).limit(LIST_MAX).get();
  const students = users.docs.filter((d) => d.get('role') === 'student');
  const refs = students.flatMap((d) => [db.doc(`devices/${d.id}`), db.doc(`deviceResets/${d.id}`)]);
  const found = new Map<string, boolean>();
  for (let i = 0; i < refs.length; i += 300) {
    for (const s of await db.getAll(...refs.slice(i, i + 300))) {
      found.set(s.ref.path, s.exists && (s.ref.parent.id === 'devices' || s.get('status') === 'pending'));
    }
  }
  const list: OpsStudent[] = students
    .map((d) => ({
      uid: d.id,
      name: d.get('name') ?? '',
      studentId: d.get('studentId') ?? '',
      email: d.get('email') ?? '',
      deviceRegistered: found.get(`devices/${d.id}`) === true,
      resetRequested: found.get(`deviceResets/${d.id}`) === true,
    }))
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
  return { students: list };
});
