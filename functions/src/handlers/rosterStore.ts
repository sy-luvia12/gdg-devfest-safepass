import { FieldValue, type CollectionReference, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { ROSTER_PREVIEW, type GetRosterResponse, type ImportRosterResponse, type RosterSummary, type SheetReason } from '../api';
import { parseRosterRows, parseSheetId, type RosterRow } from '../domain/roster';
import { db } from '../firebase';
import { readSheetValues, serviceAccountEmail } from '../sheets/readSheet';

// Where a roster lives: rows in a subcollection no client can read, and a summary field on the parent document.
export interface RosterPlace {
  parent: DocumentReference;
  rows: CollectionReference;
  summaryField: 'studentRoster' | 'roster';
  keyOf: (row: RosterRow) => string;
}

const sheetError = (reason: SheetReason, message: string) => new HttpsError('failed-precondition', message, { reason });

// Replaces the roster with the sheet's rows. Rows are merged, so fields the functions add (claimedBy) stay on rows that remain.
export async function importRoster(place: RosterPlace, sheetUrl: string, allowedDomains: string[]): Promise<ImportRosterResponse> {
  const sheetId = parseSheetId(sheetUrl);
  if (!sheetId) throw sheetError('BAD_SHEET_URL', 'Not a Google Sheets URL.');
  const parsed = parseRosterRows(await readSheetValues(sheetId), allowedDomains);
  if (!parsed.ok) throw sheetError('MISSING_COLUMNS', 'The first row needs 이름, 학번 and 이메일 columns.');

  const keep = new Set(parsed.rows.map(place.keyOf));
  const writer = db.bulkWriter();
  for (const old of await place.rows.listDocuments()) {
    if (!keep.has(old.id)) void writer.delete(old);
  }
  for (const row of parsed.rows) void writer.set(place.rows.doc(place.keyOf(row)), row, { merge: true });
  await writer.close();

  const summary: RosterSummary = { sheetUrl: sheetUrl.trim(), importedAtMs: Date.now(), count: parsed.rows.length };
  await place.parent.update({
    [place.summaryField]: { sheetUrl: summary.sheetUrl, importedAt: FieldValue.serverTimestamp(), count: summary.count },
  });
  return { ok: true, summary, skipped: parsed.skipped };
}

export async function readRoster(place: RosterPlace): Promise<GetRosterResponse> {
  const [parent, rows, email] = await Promise.all([
    place.parent.get(),
    place.rows.orderBy('studentId').limit(ROSTER_PREVIEW).get(),
    serviceAccountEmail(),
  ]);
  const s = parent.get(place.summaryField);
  const summary: RosterSummary | null = s
    ? { sheetUrl: s.sheetUrl ?? '', importedAtMs: s.importedAt?.toMillis?.() ?? 0, count: s.count ?? 0 }
    : null;
  const entries = rows.docs.map((d) => ({ name: d.get('name'), studentId: d.get('studentId'), email: d.get('email') }));
  return { summary, entries, serviceAccountEmail: email };
}

export const studentRosterPlace = (schoolId: string): RosterPlace => ({
  parent: db.doc(`schools/${schoolId}`),
  rows: db.collection(`schools/${schoolId}/roster`),
  summaryField: 'studentRoster',
  keyOf: (r) => r.studentId,
});

export const eventRosterPlace = (eventId: string): RosterPlace => ({
  parent: db.doc(`events/${eventId}`),
  rows: db.collection(`events/${eventId}/roster`),
  summaryField: 'roster',
  keyOf: (r) => r.email,
});
