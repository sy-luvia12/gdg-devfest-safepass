import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';

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
  // Demo events: a student who cancelled may take a ticket again. Real events keep this false.
  allowReissueAfterCancel: true,
};

// The 고연전 games are one series that both schools take part in. Each game has its own tickets.
const koyon = {
  schoolIds: ['korea', 'yonsei'],
  allowedDomains: ['korea.ac.kr', 'yonsei.ac.kr'],
  seriesName: { korea: '고연전', yonsei: '연고전' },
};

// Dates, places and capacities are demo values. The 고연전 venues are placeholders to confirm.
const events: Record<string, Record<string, unknown>> = {
  // The first demo event, entered by hand in the console. Its id stays as it is.
  'demo-festival': {
    ...base,
    name: '입실렌티',
    schoolIds: ['korea'],
    allowedDomains: ['korea.ac.kr'],
    place: '녹지운동장',
    date: at('2026-11-06T18:00:00+09:00'),
    capacity: 10_000,
  },
  'koyon-basketball': { ...base, ...koyon, name: '농구', place: '잠실학생체육관', date: at('2026-11-13T11:00:00+09:00'), capacity: 5_000 },
  'koyon-icehockey': { ...base, ...koyon, name: '아이스하키', place: '목동아이스링크', date: at('2026-11-13T15:00:00+09:00'), capacity: 3_000 },
  'koyon-football': { ...base, ...koyon, name: '축구·럭비', place: '잠실종합운동장 주경기장', date: at('2026-11-14T13:00:00+09:00'), capacity: 20_000 },
  'yonsei-akaraka': {
    ...base,
    name: '아카라카',
    schoolIds: ['yonsei'],
    allowedDomains: ['yonsei.ac.kr'],
    place: '노천극장',
    date: at('2026-11-20T18:00:00+09:00'),
    capacity: 12_000,
  },
  'skku-daedongje': {
    ...base,
    name: '대동제',
    schoolIds: ['skku'],
    allowedDomains: ['g.skku.edu'],
    place: '금잔디광장',
    date: at('2026-11-21T18:00:00+09:00'),
    capacity: 8_000,
  },
  'kaist-taeul': {
    ...base,
    name: '태울석림제',
    schoolIds: ['kaist'],
    allowedDomains: ['kaist.ac.kr'],
    place: '대운동장',
    date: at('2026-11-27T18:00:00+09:00'),
    capacity: 5_000,
  },
};

// A profile only applies before the first sign-in. Add test accounts here first.
// An admin with adminSchoolId manages only that school (e.g. { ..., role: 'admin', adminSchoolId: 'korea' }).
// An admin without it is a SafePass team account that manages every school and can open new school spaces.
const profiles = [{ email: 'tigerex91@gmail.com', name: '관리자', studentId: '', role: 'admin' }];

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
  for (const { email, ...profile } of profiles) {
    await fillMissing(db.doc(`seedProfiles/${email}`), profile);
  }
  console.log(`seedProfiles: ${profiles.length} checked in ${projectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
