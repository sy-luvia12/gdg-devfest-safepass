import type { PrecheckReason, RosterEntry, RosterSkipReason } from '../api';
import { emailDomain } from './ticket';

// A school roster row as stored under schools/{id}/roster/{studentId}.
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

// Why a student roster row cannot be stored, or null when it can. Shared by the sheet import and the operator console.
export function studentRowProblem(row: RosterRow, allowedDomains: readonly string[]): RosterSkipReason | null {
  if (!row.name || !row.studentId || !row.email) return 'MISSING_FIELD';
  if (!STUDENT_ID.test(row.studentId)) return 'BAD_STUDENT_ID';
  if (!allowedDomains.includes(emailDomain(row.email))) return 'BAD_DOMAIN';
  return null;
}

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
    const problem = studentRowProblem(row, allowedDomains);
    if (problem) return skipped.push({ row: sheetRow, reason: problem });
    if (ids.has(row.studentId)) return skipped.push({ row: sheetRow, reason: 'DUPLICATE_STUDENT_ID' });
    if (emails.has(row.email)) return skipped.push({ row: sheetRow, reason: 'DUPLICATE_EMAIL' });
    ids.add(row.studentId);
    emails.add(row.email);
    rows.push(row);
  });
  return { ok: true, rows, skipped };
}

// An event roster row: the event admin knows names and student ids, never emails. Stored under
// events/{id}/roster/{studentId}; the email comes from the school roster when needed.
export type EventRosterRow = { name: string; studentId: string };

export type EventRosterParse =
  // sheetRows[i] is the 1-based sheet row of rows[i], for reporting rows the school roster does not match.
  | { ok: true; rows: EventRosterRow[]; sheetRows: number[]; skipped: SkippedRow[] }
  | { ok: false; reason: 'MISSING_COLUMNS' };

export function eventRowProblem(row: EventRosterRow): RosterSkipReason | null {
  if (!row.name || !row.studentId) return 'MISSING_FIELD';
  if (!STUDENT_ID.test(row.studentId)) return 'BAD_STUDENT_ID';
  return null;
}

// Event roster sheets need 이름 and 학번. An email column, if present, is ignored.
export function parseEventRosterRows(values: readonly (readonly unknown[])[]): EventRosterParse {
  const header = (values[0] ?? []).map((v) => String(v ?? '').trim());
  const at = { name: header.findIndex((h) => HEADERS.name.test(h)), studentId: header.findIndex((h) => HEADERS.studentId.test(h)) };
  if (at.name < 0 || at.studentId < 0) return { ok: false, reason: 'MISSING_COLUMNS' };

  const rows: EventRosterRow[] = [];
  const sheetRows: number[] = [];
  const skipped: SkippedRow[] = [];
  const ids = new Set<string>();
  values.slice(1).forEach((cells, i) => {
    const cell = (c: number) => String(cells.at(c) ?? '').trim();
    const row = { name: cell(at.name), studentId: cell(at.studentId) };
    const sheetRow = i + 2;
    if (!row.name && !row.studentId) return;
    const problem = eventRowProblem(row);
    if (problem) return skipped.push({ row: sheetRow, reason: problem });
    if (ids.has(row.studentId)) return skipped.push({ row: sheetRow, reason: 'DUPLICATE_STUDENT_ID' });
    ids.add(row.studentId);
    rows.push(row);
    sheetRows.push(sheetRow);
  });
  return { ok: true, rows, sheetRows, skipped };
}

// An event roster row against the host school's roster row of the same student id (null if absent).
export type EventRowMatch = 'OK' | 'NOT_IN_STUDENT_ROSTER' | 'NAME_MISMATCH';
export function matchEventRow(row: EventRosterRow, schoolRow: { name: string } | null): EventRowMatch {
  if (!schoolRow) return 'NOT_IN_STUDENT_ROSTER';
  return normalizeName(schoolRow.name) === normalizeName(row.name) ? 'OK' : 'NAME_MISMATCH';
}

export type StudentMatch = 'OK' | 'NAME_MISMATCH' | 'EMAIL_MISMATCH';

// Sign-up check against the school roster row found by student id: the typed name and the signed-in email must both match.
export function matchStudent(row: RosterRow, name: string, email: string): StudentMatch {
  if (normalizeName(row.name) !== normalizeName(name)) return 'NAME_MISMATCH';
  if (row.email.toLowerCase() !== email.trim().toLowerCase()) return 'EMAIL_MISMATCH';
  return 'OK';
}

// The check before an email link is sent. row is the school roster row of the typed student id (null if absent).
// With name it is a sign-up (the row must be free), without name a sign-in by student id (the row must be claimed).
export function decidePrecheck(
  row: (RosterRow & { claimedBy?: string }) | null,
  input: { email: string; name?: string },
): 'OK' | Exclude<PrecheckReason, 'NO_SCHOOL'> {
  if (!row) return 'NOT_IN_ROSTER';
  if (input.name !== undefined) {
    const match = matchStudent(row, input.name, input.email);
    if (match === 'NAME_MISMATCH') return 'NOT_IN_ROSTER';
    if (match === 'EMAIL_MISMATCH') return 'EMAIL_MISMATCH';
    return row.claimedBy ? 'STUDENT_ID_TAKEN' : 'OK';
  }
  // Without a name nothing proves who is asking, so another email answers like a missing row: the call is open to
  // visitors and must not tell which student ids are on the roster or which email belongs to which id.
  if (row.email.toLowerCase() !== input.email.trim().toLowerCase()) return 'NOT_IN_ROSTER';
  return row.claimedBy ? 'OK' : 'NOT_REGISTERED';
}

// A face photo as the sign-up form sends it: a base64 JPEG data URL within the size limit.
export function isProfilePhoto(value: string, maxBytes: number): boolean {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  return !!m && Math.floor((m[1].length * 3) / 4) <= maxBytes;
}

// ---------- Waitlist (대기 명단) ----------

// A waitlist sheet lists names and student ids in waiting order, like an event roster. Each row matching the host
// school's roster becomes events/{id}/waitlist/{email}, the shape cancelTicket and the lottery read.
export interface ExistingWaiter {
  email: string;
  status: string;
}
export interface WaitlistPlan {
  /** Rows to write in waiting order (order is 1-based among kept rows) */
  upserts: { email: string; name: string; studentId: string; order: number }[];
  /** Waiting entries the new sheet no longer lists */
  deletes: string[];
  skipped: SkippedRow[];
}

// Entries past 'waiting' (assigned, offered, claimed, ...) are history and stay as they are: the sheet does not
// move or remove them, and a sheet row for such a student keeps its old entry.
export function planWaitlist(
  parsed: { rows: EventRosterRow[]; sheetRows: number[] },
  schoolRows: Map<string, { name: string; email: string }>,
  existing: ExistingWaiter[],
): WaitlistPlan {
  const settled = new Set(existing.filter((e) => e.status !== 'waiting').map((e) => e.email));
  const skipped: SkippedRow[] = [];
  const upserts: WaitlistPlan['upserts'] = [];
  const listed = new Set<string>();
  parsed.rows.forEach((row, i) => {
    const school = schoolRows.get(row.studentId) ?? null;
    const match = matchEventRow(row, school);
    if (match !== 'OK') return skipped.push({ row: parsed.sheetRows[i], reason: match });
    const email = school!.email.toLowerCase();
    listed.add(email);
    if (settled.has(email)) return;
    upserts.push({ email, name: row.name, studentId: row.studentId, order: upserts.length + 1 });
  });
  const deletes = existing.filter((e) => e.status === 'waiting' && !listed.has(e.email)).map((e) => e.email);
  return { upserts, deletes, skipped };
}
