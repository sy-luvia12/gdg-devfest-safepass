import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
if (!process.env.FIRESTORE_EMULATOR_HOST && projectId === 'demo-ttv') {
  throw new Error('FIRESTORE_EMULATOR_HOST is not set. Start the emulator first.');
}

initializeApp({ projectId });
const db = getFirestore();

// Schools. A student belongs to the school whose domains include their email domain.
// brandColor is the school color the app uses as its theme. KU and SKKU are from the schools' UI pages, Yonsei and KAIST are close approximations.
const schools: Record<string, Record<string, unknown>> = {
  korea: { name: '고려대학교', brandColor: '#8B0029', domains: ['korea.ac.kr'] },
  yonsei: { name: '연세대학교', brandColor: '#003876', domains: ['yonsei.ac.kr'] },
  skku: { name: '성균관대학교', brandColor: '#8DC63F', domains: ['g.skku.edu'] },
  kaist: { name: 'KAIST', brandColor: '#004191', domains: ['kaist.ac.kr'] },
};

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

// Fields every event starts with. Counters start at zero and stay as they are on later runs.
const base = {
  faceValue: 0,
  issuedCount: 0,
  enteredCount: 0,
  reassignMode: 'queue',
  requireDevice: false,
  // Staff compare the holder's photo and confirm before admitting. Off until the council turns it on.
  twoStepCheck: false,
  // Real events: a student who cancels cannot take a ticket again. Only the test event below sets true.
  allowReissueAfterCancel: false,
};

// Each school runs its own events. 고연전 (고려대) and 연고전 (연세대) are the same five sports on four tickets
// (야구, 농구, 아이스하키, 축구·럭비 at the main stadium), but each school issues and checks its own tickets, so each
// school has its own four game events grouped under its series name.
// Who can take a ticket: 'draw' events issue only to students who won the instant draw (see above). 'all' events
// issue to every student who signed up against the school roster.
// Expected applicants for a draw event: the school's undergraduates. The win rate is capacity / pool, so a bigger
// school or a smaller venue makes a ticket harder to win. Approximate (2025): 고려대 21,772 (namu.wiki), KAIST 4,009
// (unisquads); 연세대 신촌 and 성균관대 are estimates without a published figure we could find.
const enrolled: Record<string, number> = { korea: 21_700, yonsei: 19_000, skku: 18_000, kaist: 4_000 };

// 'draw' events: opening the event enters the student in an instant draw on chain (instantDraw), and only winners
// take a ticket. They used to be 'roster' events that waited for the event admin's sheet.
const event = (schoolId: string, who: 'draw' | 'all', fields: Record<string, unknown>) => ({
  ...base,
  schoolIds: [schoolId],
  allowedDomains: schools[schoolId].domains,
  requireRoster: false,
  instantDraw: who === 'draw',
  ...(who === 'draw' ? { drawPool: enrolled[schoolId] } : {}),
  ...fields,
});

// 고연전/연고전 games. 야구 and the main stadium are open to every student; 농구 and 아이스하키 are draw events. Ids are {school}-koyon-{game}. Places and capacities are demo values to confirm.
function games(schoolId: 'korea' | 'yonsei', series: string): Record<string, Record<string, unknown>> {
  const list: [string, string, 'draw' | 'all', string, string, number][] = [
    // Each school gets about half the venue: 잠실야구장 ~23,750, 잠실학생체육관 7,500, 목동아이스링크 5,000 seats,
    // 잠실 주경기장 ~69,950.
    ['baseball', '야구', 'all', '잠실야구장', '2026-11-13T11:00:00+09:00', 11_000],
    ['basketball', '농구', 'draw', '잠실학생체육관', '2026-11-13T13:00:00+09:00', 3_500],
    ['icehockey', '아이스하키', 'draw', '목동아이스링크', '2026-11-13T15:00:00+09:00', 2_500],
    ['football', '축구·럭비', 'all', '잠실종합운동장 주경기장', '2026-11-14T13:00:00+09:00', 30_000],
  ];
  return Object.fromEntries(
    list.map(([key, name, who, place, date, capacity]) => [
      `${schoolId}-koyon-${key}`,
      event(schoolId, who, { name, seriesName: { [schoolId]: series }, place, date: at(date), capacity }),
    ]),
  );
}

// Dates, places and capacities are demo values.
const events: Record<string, Record<string, unknown>> = {
  // The first demo event, entered by hand in the console. Its id stays as it is.
  // 입실렌티: about 20,000 students in 2025. 아카라카: 11,200 student tickets in 2022 (연세춘추).
  'demo-festival': event('korea', 'draw', { name: '입실렌티', place: '녹지운동장', date: at('2026-11-06T18:00:00+09:00'), capacity: 20_000 }),
  ...games('korea', '고연전'),
  'korea-seoktap': event('korea', 'all', { name: '석탑대동제', place: '민주광장', date: at('2026-11-20T18:00:00+09:00'), capacity: 8_000 }),
  'yonsei-akaraka': event('yonsei', 'draw', { name: '아카라카', place: '노천극장', date: at('2026-11-20T18:00:00+09:00'), capacity: 11_200 }),
  ...games('yonsei', '연고전'),
  'skku-daedongje': event('skku', 'all', { name: '대동제', place: '금잔디광장', date: at('2026-11-21T18:00:00+09:00'), capacity: 8_000 }),
  'kaist-taeul': event('kaist', 'all', { name: '태울석림제', place: '대운동장', date: at('2026-11-27T18:00:00+09:00'), capacity: 5_000 }),
};

// Events an earlier seed made. Listed so a run warns about them; SEED_PRUNE=1 deletes them with their tickets.
// koyon-* were 고연전 games shared by both schools; korea-koyon / yonsei-yonko were one event for the whole series.
const retiredEvents = ['test-reassign', 'koyon-basketball', 'koyon-icehockey', 'koyon-football', 'korea-koyon', 'yonsei-yonko'];

// The operator account (/ops): signs in with an id and password, no Google. OPS_PASSWORD creates or updates it.
const OPS_ID = process.env.OPS_ID ?? 'ops';
const OPS_EMAIL = `${OPS_ID}@ops.safepass.app`;

// A profile only applies before the first sign-in (and only to a verified email).
// Admins are the operator (operator: true, no school) or event admins of one school (adminSchoolId), which the
// operator assigns in /ops. There is no school-less team admin any more. Students sign up against the student
// roster, so they need no profile here.
const profiles = [
  { email: OPS_EMAIL, name: '어둠의 운영진', studentId: '', role: 'admin', operator: true },
  { email: 'demo-staff@korea.ac.kr', name: '검표 스태프', studentId: '', role: 'staff', staffSchoolId: 'korea' },
];

// Only fills fields that are absent, so running this against a live project never overwrites counters or edited values.
async function fillMissing(ref: DocumentReference, fields: Record<string, unknown>): Promise<number> {
  const snap = await ref.get();
  const missing = Object.entries(fields).filter(([key]) => snap.get(key) === undefined);
  if (missing.length > 0) await ref.set(Object.fromEntries(missing), { merge: true });
  return missing.length;
}

async function main() {
  for (const [id, fields] of Object.entries(schools)) {
    const filled = await fillMissing(db.doc(`schools/${id}`), fields);
    console.log(`schools/${id}: filled ${filled} missing fields`);
  }
  for (const [id, fields] of Object.entries(events)) {
    const filled = await fillMissing(db.doc(`events/${id}`), fields);
    console.log(`events/${id}: filled ${filled} missing fields`);
  }

  // No students are seeded. Each school starts with an empty student roster, so sign-up checks it from the start;
  // team members add their own school accounts in the operator console (/ops). Event rosters come from the event
  // admin's sheet. An existing roster is never touched.
  for (const id of Object.keys(schools)) {
    const ref = db.doc(`schools/${id}`);
    if ((await ref.get()).get('studentRoster')) continue;
    await ref.update({ studentRoster: { sheetUrl: '', importedAt: FieldValue.serverTimestamp(), count: 0 } });
    console.log(`schools/${id}: empty student roster (add students in /ops)`);
  }

  for (const { email, ...profile } of profiles) {
    await fillMissing(db.doc(`seedProfiles/${email}`), profile);
  }
  console.log(`seedProfiles: ${profiles.length} checked in ${projectId}`);

  const password = process.env.OPS_PASSWORD;
  if (password) {
    if (password.length < 8) throw new Error('OPS_PASSWORD must be at least 8 characters.');
    const auth = getAuth();
    const existing = await auth.getUserByEmail(OPS_EMAIL).catch(() => null);
    if (existing) await auth.updateUser(existing.uid, { password });
    else await auth.createUser({ email: OPS_EMAIL, password, emailVerified: true, displayName: '어둠의 운영진' });
    console.log(`operator: ${existing ? 'password updated' : 'created'} (id ${OPS_ID})`);
  } else {
    console.log('operator: skipped (set OPS_PASSWORD to create the /ops account or change its password)');
  }

  for (const id of retiredEvents) {
    const ref = db.doc(`events/${id}`);
    if (!(await ref.get()).exists) continue;
    if (process.env.SEED_PRUNE === '1') {
      console.log(`events/${id}: deleted (retired), with ${await pruneEvent(id)} tickets, scans and reassignments`);
    } else {
      console.log(`events/${id}: retired event still exists (run with SEED_PRUNE=1 to delete it, its rosters and its tickets)`);
    }
  }
}

// Deletes an event with its rosters and waitlist, and the documents that point at it: tickets (and their QR tokens),
// scan logs and reassignments. Chain records stay on chain; their pending ops are dropped with the ticket.
async function pruneEvent(id: string): Promise<number> {
  const linked = await Promise.all(
    ['tickets', 'scanLogs', 'reassignments', 'chainOps'].map((c) => db.collection(c).where('eventId', '==', id).get()),
  );
  const writer = db.bulkWriter();
  let count = 0;
  for (const snap of linked) {
    for (const d of snap.docs) {
      void writer.delete(d.ref);
      if (d.ref.parent.id === 'tickets') void writer.delete(db.doc(`qrTokens/${d.id}`));
      count += 1;
    }
  }
  await writer.close();
  await db.recursiveDelete(db.doc(`events/${id}`));
  return count;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
