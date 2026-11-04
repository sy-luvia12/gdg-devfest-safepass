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

// Each school runs its own events. 고연전 (고려대) and 연고전 (연세대) are the same games, but each school issues
// and checks its own tickets, so they are two events. Every event issues only to students on its event roster.
const event = (schoolId: string, fields: Record<string, unknown>) => ({
  ...base,
  schoolIds: [schoolId],
  allowedDomains: schools[schoolId].domains,
  requireRoster: true,
  ...fields,
});

// Dates, places and capacities are demo values.
const events: Record<string, Record<string, unknown>> = {
  // The first demo event, entered by hand in the console. Its id stays as it is.
  'demo-festival': event('korea', { name: '입실렌티', place: '녹지운동장', date: at('2026-11-06T18:00:00+09:00'), capacity: 10_000 }),
  'korea-koyon': event('korea', { name: '고연전', place: '잠실종합운동장', date: at('2026-11-13T11:00:00+09:00'), capacity: 20_000 }),
  'korea-seoktap': event('korea', { name: '석탑대동제', place: '민주광장', date: at('2026-11-20T18:00:00+09:00'), capacity: 8_000 }),
  'yonsei-akaraka': event('yonsei', { name: '아카라카', place: '노천극장', date: at('2026-11-20T18:00:00+09:00'), capacity: 12_000 }),
  'yonsei-yonko': event('yonsei', { name: '연고전', place: '잠실종합운동장', date: at('2026-11-13T11:00:00+09:00'), capacity: 20_000 }),
  'skku-daedongje': event('skku', { name: '대동제', place: '금잔디광장', date: at('2026-11-21T18:00:00+09:00'), capacity: 8_000 }),
  'kaist-taeul': event('kaist', { name: '태울석림제', place: '대운동장', date: at('2026-11-27T18:00:00+09:00'), capacity: 5_000 }),
};

// Events an earlier seed made. Listed so a run warns about them; SEED_PRUNE=1 deletes them.
const retiredEvents = ['test-reassign', 'koyon-basketball', 'koyon-icehockey', 'koyon-football'];

// Demo student rosters: made-up students with clearly fake addresses. The team adds its real school accounts in the
// operator console (/ops), so nothing here needs to change for a rehearsal.
const FAMILY = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIVEN = ['하늘', '도윤', '서연', '민준', '지우', '하윤', '예린', '현우', '소율', '지안', '태윤', '유나', '다온', '민재', '지민', '서준'];
const ROSTER_SIZE = 30;
function demoRoster(schoolId: string, domain: string) {
  return Array.from({ length: ROSTER_SIZE }, (_, i) => ({
    name: `${FAMILY[(i * 7 + schoolId.length) % FAMILY.length]}${GIVEN[(i * 5 + schoolId.length) % GIVEN.length]}`,
    studentId: `2024${String(i + 1).padStart(6, '0')}`,
    email: `safepass.demo${String(i + 1).padStart(2, '0')}@${domain}`,
  }));
}
// An event roster takes the first two thirds of its school's demo roster, so the rest show "not on the roster".
const eventRosterOf = (rows: { name: string; studentId: string }[]) =>
  rows.slice(0, Math.ceil((rows.length * 2) / 3)).map(({ name, studentId }) => ({ name, studentId }));

// The operator account (/ops): signs in with an id and password, no Google. OPS_PASSWORD creates or updates it.
const OPS_ID = process.env.OPS_ID ?? 'ops';
const OPS_EMAIL = `${OPS_ID}@ops.safepass.app`;

// A profile only applies before the first sign-in. Add test accounts here first.
// An admin with adminSchoolId manages only that school (e.g. { ..., role: 'admin', adminSchoolId: 'korea' }).
// An admin without it is a SafePass team account that manages every school and can open new school spaces.
// Replace the demo-* addresses with the team's real school accounts before the rehearsal.
// Event admins (행사 담당자) are admins with adminSchoolId. Students sign up against the student roster, so they need
// no profile here.
const profiles = [
  { email: OPS_EMAIL, name: '어둠의 운영진', studentId: '', role: 'admin', operator: true },
  { email: 'tigerex91@gmail.com', name: '관리자', studentId: '', role: 'admin' },
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

  // Rosters are written only when there is none yet, so edits made in /ops are never overwritten.
  const rosters: Record<string, { name: string; studentId: string; email: string }[]> = {};
  for (const [id, fields] of Object.entries(schools)) {
    rosters[id] = demoRoster(id, (fields.domains as string[])[0]);
    const ref = db.doc(`schools/${id}`);
    if ((await ref.get()).get('studentRoster')) {
      console.log(`schools/${id}/roster: kept (edit it in /ops)`);
      continue;
    }
    const writer = db.bulkWriter();
    for (const row of rosters[id]) void writer.set(db.doc(`schools/${id}/roster/${row.studentId}`), row);
    await writer.close();
    await ref.update({ studentRoster: { sheetUrl: '', importedAt: FieldValue.serverTimestamp(), count: rosters[id].length } });
    console.log(`schools/${id}/roster: ${rosters[id].length} demo students`);
  }
  for (const [id, fields] of Object.entries(events)) {
    const ref = db.doc(`events/${id}`);
    if ((await ref.get()).get('roster')) {
      console.log(`events/${id}/roster: kept (edit it in /ops)`);
      continue;
    }
    const rows = eventRosterOf(rosters[(fields.schoolIds as string[])[0]]);
    const writer = db.bulkWriter();
    for (const row of rows) void writer.set(db.doc(`events/${id}/roster/${row.studentId}`), row);
    await writer.close();
    await ref.update({ roster: { sheetUrl: '', importedAt: FieldValue.serverTimestamp(), count: rows.length } });
    console.log(`events/${id}/roster: ${rows.length} students`);
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
      await db.recursiveDelete(ref);
      console.log(`events/${id}: deleted (retired)`);
    } else {
      console.log(`events/${id}: retired event still exists (run with SEED_PRUNE=1 to delete it and its rosters)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
