import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
if (!process.env.FIRESTORE_EMULATOR_HOST && projectId === 'demo-ttv') {
  throw new Error('FIRESTORE_EMULATOR_HOST is not set. Start the emulator first.');
}

initializeApp({ projectId });
const db = getFirestore();

const profiles = [
  { email: 'student1@example.ac.kr', name: '테스트 학생 1', studentId: '2024000001', role: 'student' },
  { email: 'student2@example.ac.kr', name: '테스트 학생 2', studentId: '2024000002', role: 'student' },
  { email: 'student3@example.ac.kr', name: '테스트 학생 3', studentId: '2024000003', role: 'student' },
  { email: 'staff@example.ac.kr', name: '검표 스태프', studentId: '', role: 'staff' },
  { email: 'admin@example.ac.kr', name: '관리자', studentId: '', role: 'admin' },
];

// Placeholder waitlist. The student council registers the real one from a Google Sheet.
const waitlist = ['waitlist1@korea.ac.kr', 'waitlist2@yonsei.ac.kr'];

async function main() {
  await db.doc('events/demo-festival').set({
    name: '데모 축제',
    date: Timestamp.fromDate(new Date('2026-11-06T18:00:00+09:00')),
    capacity: 50,
    faceValue: 10_000,
    allowedDomains: ['korea.ac.kr', 'yonsei.ac.kr', 'skku.edu', 'kaist.ac.kr'],
    issuedCount: 0,
    nftSeq: 0,
    enteredCount: 0,
    reassignMode: 'queue',
  });

  for (const [i, email] of waitlist.entries()) {
    await db.doc(`events/demo-festival/waitlist/${email}`).set({ order: i + 1, status: 'waiting', assignedTicketId: null });
  }

  for (const { email, ...p } of profiles) {
    await db.doc(`seedProfiles/${email}`).set({ ...p, photoUrl: null });
  }

  console.log(`seeded events/demo-festival, ${waitlist.length} waitlist entries and ${profiles.length} seedProfiles in ${projectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
