import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { ROSTER_PREVIEW, type GetRosterResponse, type ImportRosterResponse, type RosterSummary, type SheetReason } from '../api';
import { matchEventRow, parseEventRosterRows, parseRosterRows, parseSheetId, type EventRosterRow, type RosterRow } from '../domain/roster';
import { emailDomain } from '../domain/ticket';
import { db } from '../firebase';
import { readSheetValues, serviceAccountEmail } from '../sheets/readSheet';

// Where a roster lives: rows in a subcollection no client can read, and a summary field on the parent document.
export interface RosterPlace {
  parent: DocumentReference;
  rows: CollectionReference;
  summaryField: 'studentRoster' | 'roster';
}

type StoredRow = RosterRow | EventRosterRow;

const sheetError = (reason: SheetReason, message: string) => new HttpsError('failed-precondition', message, { reason });

async function sheetValues(sheetUrl: string) {
  const sheetId = parseSheetId(sheetUrl);
  if (!sheetId) throw sheetError('BAD_SHEET_URL', 'Not a Google Sheets URL.');
  return readSheetValues(sheetId);
}

// Replaces every row with these (keyed by student id). Rows are merged, so fields the functions add (claimedBy) stay
// on rows that remain.
async function replaceRows(place: RosterPlace, rows: StoredRow[], sheetUrl: string): Promise<RosterSummary> {
  const keep = new Set(rows.map((r) => r.studentId));
  const writer = db.bulkWriter();
  for (const old of await place.rows.listDocuments()) {
    if (!keep.has(old.id)) void writer.delete(old);
  }
  for (const row of rows) void writer.set(place.rows.doc(row.studentId), row, { merge: true });
  await writer.close();
  return writeSummary(place, rows.length, sheetUrl);
}

export async function writeSummary(place: RosterPlace, count: number, sheetUrl?: string): Promise<RosterSummary> {
  const kept = sheetUrl ?? ((await place.parent.get()).get(place.summaryField)?.sheetUrl as string | undefined) ?? '';
  const summary: RosterSummary = { sheetUrl: kept.trim(), importedAtMs: Date.now(), count };
  await place.parent.update({
    [place.summaryField]: { sheetUrl: summary.sheetUrl, importedAt: FieldValue.serverTimestamp(), count: summary.count },
  });
  return summary;
}

export async function importStudentRows(place: RosterPlace, sheetUrl: string, allowedDomains: string[]): Promise<ImportRosterResponse> {
  const parsed = parseRosterRows(await sheetValues(sheetUrl), allowedDomains);
  if (!parsed.ok) throw sheetError('MISSING_COLUMNS', 'The first row needs 이름, 학번 and 이메일 columns.');
  const summary = await replaceRows(place, parsed.rows, sheetUrl);
  return { ok: true, summary, skipped: parsed.skipped };
}

// Event rosters hold names and student ids. A row is kept only when the host school's roster has the same student id
// with the same name; the student's email stays in the school roster.
export async function importEventRows(place: RosterPlace, sheetUrl: string, schoolId: string): Promise<ImportRosterResponse> {
  const parsed = parseEventRosterRows(await sheetValues(sheetUrl));
  if (!parsed.ok) throw sheetError('MISSING_COLUMNS', 'The first row needs 이름 and 학번 columns.');
  const school = await schoolRowsFor(schoolId, parsed.rows.map((r) => r.studentId));
  const skipped = [...parsed.skipped];
  const rows: EventRosterRow[] = [];
  parsed.rows.forEach((row, i) => {
    const match = matchEventRow(row, school.get(row.studentId) ?? null);
    if (match === 'OK') rows.push(row);
    else skipped.push({ row: parsed.sheetRows[i], reason: match });
  });
  skipped.sort((a, b) => a.row - b.row);
  const summary = await replaceRows(place, rows, sheetUrl);
  return { ok: true, summary, skipped };
}

// The host school's roster rows of these student ids.
export async function schoolRowsFor(schoolId: string, studentIds: string[]): Promise<Map<string, RosterRow & { claimedBy?: string }>> {
  const refs = [...new Set(studentIds)].map((id) => db.doc(`schools/${schoolId}/roster/${id}`));
  const found = new Map<string, RosterRow & { claimedBy?: string }>();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    for (const s of snaps) if (s.exists) found.set(s.id, s.data() as RosterRow & { claimedBy?: string });
  }
  return found;
}

export async function readRoster(place: RosterPlace, withEmail: boolean): Promise<GetRosterResponse> {
  const [parent, rows, email] = await Promise.all([
    place.parent.get(),
    place.rows.orderBy('studentId').limit(ROSTER_PREVIEW).get(),
    serviceAccountEmail(),
  ]);
  const s = parent.get(place.summaryField);
  const summary: RosterSummary | null = s
    ? { sheetUrl: s.sheetUrl ?? '', importedAtMs: s.importedAt?.toMillis?.() ?? 0, count: s.count ?? 0 }
    : null;
  const entries = rows.docs.map((d) => ({
    name: d.get('name'),
    studentId: d.get('studentId'),
    ...(withEmail ? { email: d.get('email') } : {}),
  }));
  return { summary, entries, serviceAccountEmail: email };
}

export const studentRosterPlace = (schoolId: string): RosterPlace => ({
  parent: db.doc(`schools/${schoolId}`),
  rows: db.collection(`schools/${schoolId}/roster`),
  summaryField: 'studentRoster',
});

export const eventRosterPlace = (eventId: string): RosterPlace => ({
  parent: db.doc(`events/${eventId}`),
  rows: db.collection(`events/${eventId}/roster`),
  summaryField: 'roster',
});

// The school whose mail domains include this email's domain. Sign-in finds the school this way, so a domain
// belongs to one school (upsertSchool keeps it so).
export async function schoolForEmail(email: string, tx?: Transaction): Promise<DocumentSnapshot | null> {
  const q = db.collection('schools').where('domains', 'array-contains', emailDomain(email)).limit(1);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs[0] ?? null;
}
