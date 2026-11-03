import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
if (!process.env.FIRESTORE_EMULATOR_HOST && projectId === 'demo-ttv') {
  throw new Error('FIRESTORE_EMULATOR_HOST is not set. Start the emulator first.');
}

initializeApp({ projectId });
const db = getFirestore();

// Same values as the demo event entered by hand in the console.
const event = {
  name: '입실렌티',
  place: '녹지운동장',
  date: Timestamp.fromDate(new Date('2026-11-06T18:00:00+09:00')),
  capacity: 10_000,
  faceValue: 0,
  allowedDomains: ['korea.ac.kr'],
  issuedCount: 0,
  enteredCount: 0,
  reassignMode: 'queue',
  requireDevice: false,
  // Test event: a student who cancelled may take a ticket again. Real events keep this false.
  allowReissueAfterCancel: true,
};

// A profile only applies before the first sign-in. Add test accounts here first.
const profiles = [{ email: 'tigerex91@gmail.com', name: '관리자', studentId: '', role: 'admin' }];

// Only fills fields that are absent, so running this against a live project never overwrites counters or edited values.
async function fillMissing(ref: DocumentReference, fields: Record<string, unknown>): Promise<number> {
  const snap = await ref.get();
  const missing = Object.entries(fields).filter(([key]) => snap.get(key) === undefined);
  if (missing.length > 0) await ref.set(Object.fromEntries(missing), { merge: true });
  return missing.length;
}

async function main() {
  const filled = await fillMissing(db.doc('events/demo-festival'), event);
  for (const { email, ...profile } of profiles) {
    await fillMissing(db.doc(`seedProfiles/${email}`), profile);
  }
  console.log(`events/demo-festival: filled ${filled} missing fields. seedProfiles: ${profiles.length} checked in ${projectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
