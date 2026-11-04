import type { RosterEntry, RosterSkipReason } from '../api';
import { emailDomain } from './ticket';

// A roster row as stored under schools/{id}/roster/{studentId} and events/{id}/roster/{email}.
export type RosterRow = RosterEntry;

export interface SkippedRow {
  // 1-based sheet row number, so the council can find it in the sheet.
  row: number;
  reason: RosterSkipReason;
}

export type RosterParse =
  | { ok: true; rows: RosterRow[]; skipped: SkippedRow[] }
  | { ok: false; reason: 'MISSING_COLUMNS' };

const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/;

export function parseSheetId(url: string): string | null {
  return SHEET_URL.exec(url.trim())?.[1] ?? null;
}

// Header words the council is likely to type. The columns are found by name, so their order does not matter.
const HEADERS: Record<keyof RosterRow, RegExp> = {
  name: /^(이름|성명|name)$/i,
  studentId: /^(학번|student\s*id)$/i,
  email: /^(학교\s*)?(이메일|메일|e-?mail)$/i,
};

// The student id is the roster document id, so it must be a safe path segment.
const STUDENT_ID = /^[A-Za-z0-9-]{1,32}$/;
export const isStudentId = (value: string) => STUDENT_ID.test(value);

export const normalizeName = (name: string) => name.replace(/\s+/g, '');

// The first row is the header. Rows that cannot be used are skipped with a reason instead of failing the import.
export function parseRosterRows(values: readonly (readonly unknown[])[], allowedDomains: readonly string[]): RosterParse {
  const header = (values[0] ?? []).map((v) => String(v ?? '').trim());
  const col = (key: keyof RosterRow) => header.findIndex((h) => HEADERS[key].test(h));
  const at = { name: col('name'), studentId: col('studentId'), email: col('email') };
  if (at.name < 0 || at.studentId < 0 || at.email < 0) return { ok: false, reason: 'MISSING_COLUMNS' };

  const rows: RosterRow[] = [];
  const skipped: SkippedRow[] = [];
  const ids = new Set<string>();
  const emails = new Set<string>();
  values.slice(1).forEach((cells, i) => {
    const cell = (c: number) => String(cells.at(c) ?? '').trim();
    const row = { name: cell(at.name), studentId: cell(at.studentId), email: cell(at.email).toLowerCase() };
    const sheetRow = i + 2;
    if (!row.name && !row.studentId && !row.email) return;
    if (!row.name || !row.studentId || !row.email) return skipped.push({ row: sheetRow, reason: 'MISSING_FIELD' });
    if (!STUDENT_ID.test(row.studentId)) return skipped.push({ row: sheetRow, reason: 'BAD_STUDENT_ID' });
    if (!allowedDomains.includes(emailDomain(row.email))) return skipped.push({ row: sheetRow, reason: 'BAD_DOMAIN' });
    if (ids.has(row.studentId)) return skipped.push({ row: sheetRow, reason: 'DUPLICATE_STUDENT_ID' });
    if (emails.has(row.email)) return skipped.push({ row: sheetRow, reason: 'DUPLICATE_EMAIL' });
    ids.add(row.studentId);
    emails.add(row.email);
    rows.push(row);
  });
  return { ok: true, rows, skipped };
}

export type StudentMatch = 'OK' | 'NAME_MISMATCH' | 'EMAIL_MISMATCH';

// Sign-up check against the school roster row found by student id: the typed name and the signed-in email must both match.
export function matchStudent(row: RosterRow, name: string, email: string): StudentMatch {
  if (normalizeName(row.name) !== normalizeName(name)) return 'NAME_MISMATCH';
  if (row.email.toLowerCase() !== email.trim().toLowerCase()) return 'EMAIL_MISMATCH';
  return 'OK';
}
