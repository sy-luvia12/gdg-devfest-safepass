import { GoogleAuth } from 'google-auth-library';
import { HttpsError } from 'firebase-functions/v2/https';
import type { SheetReason } from '../api';

// The functions' own service account reads the sheet. The council shares the sheet with this account as a viewer,
// so no key file or OAuth consent is involved.
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });

const fail = (reason: SheetReason, message: string) => new HttpsError('failed-precondition', message, { reason });

// The email the council shares its sheet with. Empty when it cannot be found (local emulator without credentials).
export async function serviceAccountEmail(): Promise<string> {
  try {
    return (await auth.getCredentials()).client_email ?? '';
  } catch {
    return '';
  }
}

// All cells of the first sheet, as text. A range without a sheet name means the first visible sheet.
export async function readSheetValues(sheetId: string): Promise<string[][]> {
  const token = await auth.getAccessToken().catch(() => null);
  if (!token) throw fail('SHEET_NOT_SHARED', 'No credentials to read Google Sheets.');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) {
    // The same 403 comes back when the Sheets API is not enabled in the project, which needs a different fix.
    if ((await res.text()).includes('SERVICE_DISABLED')) throw fail('SHEETS_API_DISABLED', 'Enable the Google Sheets API.');
    throw fail('SHEET_NOT_SHARED', 'The sheet is not shared with the service account.');
  }
  if (res.status === 404) throw fail('SHEET_NOT_FOUND', 'The sheet does not exist.');
  if (!res.ok) throw new HttpsError('unavailable', `Sheets API answered ${res.status}.`);
  const body = (await res.json()) as { values?: string[][] };
  return body.values ?? [];
}
