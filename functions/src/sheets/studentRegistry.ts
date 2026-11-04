import { GoogleAuth } from 'google-auth-library';
import { HttpsError } from 'firebase-functions/v2/https';
import { matchesStudent, type StudentIdentity } from '../domain/studentRegistry';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });

/** Server-only ADC credentials; no sheet contents or Google errors reach the caller. */
export async function lookupStudent(identity: StudentIdentity): Promise<boolean> {
  const sheetId = process.env.STUDENT_REGISTRY_SHEET_ID;
  const range = process.env.STUDENT_REGISTRY_RANGE || 'Students!A2:D';
  if (!sheetId) throw new HttpsError('failed-precondition', 'Student registry is not configured.');
  try {
    const client = await auth.getClient();
    const { data } = await client.request<{ values?: unknown[][] }>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`,
      timeout: 10_000,
    });
    const entries: StudentIdentity[] = (data.values ?? []).flatMap((row) => {
      if (row.length < 4 || !row.slice(0, 4).every((cell) => typeof cell === 'string')) return [];
      const [schoolId, studentId, name, email] = row as string[];
      return [{ schoolId, studentId, name, email }];
    });
    return matchesStudent(identity, entries);
  } catch {
    throw new HttpsError('unavailable', 'Student registry is temporarily unavailable.');
  }
}
