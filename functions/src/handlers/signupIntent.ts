import { Timestamp } from 'firebase-admin/firestore';
import { SIGNUP_INTENT_TTL_MS } from '../api';
import { db } from '../firebase';

// What precheckStudent saw pass for an email: which school roster row the student means to claim. Kept on the server
// so the email link can be opened in any browser. Only ids are stored; name and email come from the roster row.
export const signupIntentRef = (email: string) => db.doc(`signupIntents/${email}`);

export interface SignupIntent {
  schoolId: string;
  studentId: string;
}

export function newSignupIntent(intent: SignupIntent, nowMs: number) {
  return { ...intent, expiresAt: Timestamp.fromMillis(nowMs + SIGNUP_INTENT_TTL_MS) };
}

export function liveSignupIntent(data: FirebaseFirestore.DocumentData | undefined, nowMs: number): SignupIntent | null {
  const schoolId: unknown = data?.schoolId;
  const studentId: unknown = data?.studentId;
  const expiresAt: unknown = data?.expiresAt;
  if (typeof schoolId !== 'string' || typeof studentId !== 'string') return null;
  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= nowMs) return null;
  return { schoolId, studentId };
}
