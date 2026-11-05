import { deleteApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { FieldValue, getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Callables } from '../src/api';

// Every id and address here is prefixed (sch-*, *.test) so this file shares the emulator with integration.test.ts.
// That file wipes the emulator in its beforeAll, so test:int runs files one after another.
const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-ttv';
const admin = initAdmin({ projectId: PROJECT }, 'integration-school-admin');
const db = adminFirestore(admin);
const apps: FirebaseApp[] = [];

type Call = <K extends keyof Callables>(name: K, req: Callables[K][0]) => Promise<Callables[K][1]>;
interface Client {
  call: Call;
  uid: string | null;
}

function connect(app: FirebaseApp): Call {
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return async (name, req) => (await httpsCallable<typeof req, Callables[typeof name][1]>(functions, name)(req)).data;
}

async function visitor(): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, 'sch-visitor');
  apps.push(app);
  return { call: connect(app), uid: null };
}

// The Auth emulator accepts an unsigned Google ID token, which gives the user a verified email like real Google sign-in.
const sessions = new Map<string, Promise<Client>>();
const login = (email: string): Promise<Client> => {
  let session = sessions.get(email);
  if (!session) sessions.set(email, (session = signIn(email)));
  return session;
};

async function signIn(email: string): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, email);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] });
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  const client = { call: connect(app), uid: user.uid };
  await client.call('ensureUser', undefined);
  return client;
}

const codeOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { code?: string }) => e.code);
const reasonOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: { details?: { reason?: string } }) => e.details?.reason,
  );

const A = 'sch-a';
const B = 'sch-b';
const C = 'sch-c';
const EV_A = 'sch-a-event';
const EV_B = 'sch-b-event';
const EV_ROSTER = 'sch-c-roster-event';
const EV_OPEN = 'sch-c-open-event';
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const seedEvent = (id: string, fields: Record<string, unknown>) =>
  db.doc(`events/${id}`).set({
    name: id,
    date: Timestamp.fromDate(new Date('2026-11-06T18:00:00+09:00')),
    capacity: 20,
    faceValue: 0,
    issuedCount: 0,
    nftSeq: 0,
    enteredCount: 0,
    reassignMode: 'queue',
    ...fields,
  });

const seedProfile = (email: string, fields: Record<string, unknown>) =>
  db.doc(`seedProfiles/${email}`).set({ name: email.split('@')[0], studentId: '', photoUrl: null, role: 'student', ...fields });

const seedRosterRow = (schoolId: string, row: { studentId: string; name: string; email: string; claimedBy?: string }) =>
  db.doc(`schools/${schoolId}/roster/${row.studentId}`).set(row);

const summary = { sheetUrl: 'https://docs.google.com/spreadsheets/d/seeded', count: 1 };

beforeAll(async () => {
  await db.doc(`schools/${A}`).set({ name: 'Alpha Univ', domains: ['sch-a.test'], brandColor: '#112233', studentRoster: summary });
  await db.doc(`schools/${B}`).set({ name: 'Beta Univ', domains: ['sch-b.test'], brandColor: '#223344', studentRoster: summary });
  await db.doc(`schools/${C}`).set({ name: 'Gamma Univ', domains: ['sch-c.test'], brandColor: '#334455' });

  await seedEvent(EV_A, { schoolIds: [A], allowedDomains: ['sch-a.test', 'sch-c.test'] });
  await seedEvent(EV_B, { schoolIds: [B], allowedDomains: ['sch-c.test'] });
  await seedEvent(EV_OPEN, { schoolIds: [C], allowedDomains: ['sch-c.test'] });
  await seedEvent(EV_ROSTER, { schoolIds: [C], allowedDomains: ['sch-c.test'], requireRoster: true });

  await seedProfile('admin@sch-a.test', { role: 'admin', adminSchoolId: A });
  await seedProfile('admin@sch-b.test', { role: 'admin', adminSchoolId: B });
  await seedProfile('team@sch-team.test', { role: 'admin' });
  await seedProfile('staff@sch-a.test', { role: 'staff', staffSchoolId: A });
  await seedProfile('staff@sch-b.test', { role: 'staff', staffSchoolId: B });
  await seedProfile('staff@sch-free.test', { role: 'staff' });
});

afterAll(async () => {
  await Promise.all(apps.map(deleteClientApp));
  await deleteApp(admin);
});

describe('school scoping', () => {
  it('a school admin changes reassign mode and re-issue only on events its school hosts', async () => {
    const adminA = await login('admin@sch-a.test');
    expect(await codeOf(adminA.call('setReassignMode', { eventId: EV_B, mode: 'random' }))).toBe('functions/permission-denied');
    expect(await codeOf(adminA.call('setAllowReissue', { eventId: EV_B, allow: true }))).toBe('functions/permission-denied');
    expect((await db.doc(`events/${EV_B}`).get()).data()).toMatchObject({ reassignMode: 'queue' });
    expect((await db.doc(`events/${EV_B}`).get()).get('allowReissueAfterCancel')).toBeUndefined();

    expect(await adminA.call('setReassignMode', { eventId: EV_A, mode: 'random' })).toEqual({ ok: true });
    expect(await adminA.call('setAllowReissue', { eventId: EV_A, allow: true })).toEqual({ ok: true });
    expect((await db.doc(`events/${EV_A}`).get()).data()).toMatchObject({ reassignMode: 'random', allowReissueAfterCancel: true });
    await db.doc(`events/${EV_A}`).update({ reassignMode: 'queue', allowReissueAfterCancel: false });
  });

  it('a school admin resets devices of its own students only, by stored school or by mail domain', async () => {
    const adminA = await login('admin@sch-a.test');
    const byDomainA = await login('dev1@sch-a.test');
    const byDomainB = await login('dev2@sch-b.test');
    const storedB = await login('dev3@sch-a.test');
    await db.doc(`users/${storedB.uid}`).update({ schoolId: B });
    for (const s of [byDomainA, byDomainB, storedB]) await db.doc(`devices/${s.uid}`).set({ publicKeyJwk: { kty: 'EC' } });

    expect(await codeOf(adminA.call('resetDevice', { uid: byDomainB.uid! }))).toBe('functions/permission-denied');
    // The stored schoolId wins over the mail domain.
    expect(await codeOf(adminA.call('resetDevice', { uid: storedB.uid! }))).toBe('functions/permission-denied');
    expect((await db.doc(`devices/${byDomainB.uid}`).get()).exists).toBe(true);
    expect((await db.doc(`devices/${storedB.uid}`).get()).exists).toBe(true);

    expect(await adminA.call('resetDevice', { uid: byDomainA.uid! })).toEqual({ ok: true });
    expect((await db.doc(`devices/${byDomainA.uid}`).get()).exists).toBe(false);
  });

  it('setStaff stamps the admin school, refuses another school staff member, and a team admin adds unscoped staff', async () => {
    const adminA = await login('admin@sch-a.test');
    const team = await login('team@sch-team.test');
    const hire = await login('hire@sch-a.test');
    const staffB = await login('staff@sch-b.test');

    expect(await adminA.call('setStaff', { email: 'hire@sch-a.test', staff: true })).toEqual({ ok: true, status: 'UPDATED' });
    expect((await db.doc(`users/${hire.uid}`).get()).data()).toMatchObject({ role: 'staff', staffSchoolId: A });
    expect(await adminA.call('setStaff', { email: 'later@sch-a.test', staff: true })).toEqual({ ok: true, status: 'PENDING_SIGNUP' });
    expect((await db.doc('seedProfiles/later@sch-a.test').get()).data()).toMatchObject({ role: 'staff', staffSchoolId: A });

    expect(await codeOf(adminA.call('setStaff', { email: 'staff@sch-b.test', staff: true }))).toBe('functions/permission-denied');
    expect(await codeOf(adminA.call('setStaff', { email: 'staff@sch-b.test', staff: false }))).toBe('functions/permission-denied');
    expect((await db.doc(`users/${staffB.uid}`).get()).data()).toMatchObject({ role: 'staff', staffSchoolId: B });

    const walkIn = await login('walkin@sch-team.test');
    expect(await team.call('setStaff', { email: 'walkin@sch-team.test', staff: true })).toEqual({ ok: true, status: 'UPDATED' });
    const stored = (await db.doc(`users/${walkIn.uid}`).get()).data()!;
    expect(stored.role).toBe('staff');
    expect(stored).not.toHaveProperty('staffSchoolId');
  });

  it('a school admin cannot change another school student, unscoped team staff, or a pending address of another school (#28)', async () => {
    const adminA = await login('admin@sch-a.test');
    const studentB = await login('pupil@sch-b.test');
    await login('walkin@sch-team.test');

    expect(await codeOf(adminA.call('setStaff', { email: 'pupil@sch-b.test', staff: true }))).toBe('functions/permission-denied');
    expect((await db.doc(`users/${studentB.uid}`).get()).get('role')).toBe('student');
    expect(await codeOf(adminA.call('setStaff', { email: 'walkin@sch-team.test', staff: false }))).toBe('functions/permission-denied');
    expect(await codeOf(adminA.call('setStaff', { email: 'newcomer@sch-b.test', staff: true }))).toBe('functions/permission-denied');
    expect((await db.doc('seedProfiles/newcomer@sch-b.test').get()).exists).toBe(false);
  });

  it('a seeded role goes only to a verified email (#28 hardening)', async () => {
    await db.doc('seedProfiles/boss@sch-a.test').set({ role: 'admin', adminSchoolId: A, name: 'Boss' });
    const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, 'sch-unverified');
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const email = 'boss@sch-a.test';
    const idToken = JSON.stringify({ sub: 'unverified-boss', email, email_verified: false, name: 'x' });
    const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    const profile = await connect(app)('ensureUser', undefined);
    expect(profile.role).toBe('student');
    expect((await db.doc(`users/${user.uid}`).get()).get('role')).toBe('student');
  });

  it('school staff cannot scan a ticket of an event their school is not part of; unscoped staff still can', async () => {
    const holderB = await login('holder-b@sch-c.test');
    const holderA = await login('holder-a@sch-c.test');
    const staffA = await login('staff@sch-a.test');
    const staffFree = await login('staff@sch-free.test');
    const ticketB = (await holderB.call('issueTicket', { eventId: EV_B })).ticketId;
    const ticketA = (await holderA.call('issueTicket', { eventId: EV_A })).ticketId;
    const qrB = (await holderB.call('refreshQrToken', { ticketId: ticketB })).qrPayload;
    const qrA = (await holderA.call('refreshQrToken', { ticketId: ticketA })).qrPayload;

    expect(await codeOf(staffA.call('verifyEntry', { qrPayload: qrB }))).toBe('functions/permission-denied');
    expect(await codeOf(staffA.call('verifyEntry', { qrPayload: qrA, eventId: EV_B }))).toBe('functions/permission-denied');
    expect((await db.doc(`tickets/${ticketB}`).get()).get('status')).toBe('issued');
    expect((await db.doc(`events/${EV_B}`).get()).get('enteredCount')).toBe(0);
    expect((await db.doc(`events/${EV_A}`).get()).get('enteredCount')).toBe(0);
    expect((await db.collection('scanLogs').where('ticketId', 'in', [ticketA, ticketB]).get()).empty).toBe(true);

    expect(await staffA.call('verifyEntry', { qrPayload: qrA })).toMatchObject({ ok: true, ticketId: ticketA, enteredCount: 1 });
    expect(await staffFree.call('verifyEntry', { qrPayload: qrB })).toMatchObject({ ok: true, ticketId: ticketB, enteredCount: 1 });
  });

  it('upsertSchool is limited to the admin school, and a mail domain belongs to one school', async () => {
    const adminA = await login('admin@sch-a.test');
    const team = await login('team@sch-team.test');
    const edit = (schoolId: string, domains: string[]) => ({ schoolId, name: 'Edited', domains, brandColor: '#abcdef' });

    expect(await codeOf(adminA.call('upsertSchool', edit(B, ['sch-b.test'])))).toBe('functions/permission-denied');
    expect(await codeOf(adminA.call('upsertSchool', edit('sch-other', ['sch-other.test'])))).toBe('functions/permission-denied');
    expect((await db.doc(`schools/${B}`).get()).get('name')).toBe('Beta Univ');

    expect(await codeOf(adminA.call('upsertSchool', edit(A, ['sch-a.test', 'sch-b.test'])))).toBe('functions/already-exists');
    expect(await codeOf(team.call('upsertSchool', edit('sch-new', ['sch-c.test'])))).toBe('functions/already-exists');
    expect((await db.doc(`schools/${A}`).get()).get('domains')).toEqual(['sch-a.test']);
    expect((await db.doc('schools/sch-new').get()).exists).toBe(false);

    expect(await adminA.call('upsertSchool', { ...edit(A, ['sch-a.test']), name: 'Alpha Univ' })).toEqual({ ok: true, created: false });
    expect((await db.doc(`schools/${A}`).get()).data()).toMatchObject({ studentRoster: summary, brandColor: '#abcdef' });
    expect(await team.call('upsertSchool', edit('sch-new', ['sch-new.test']))).toEqual({ ok: true, created: true });
  });

  it('updateEvent saves lottery settings: partial changes merge with the stored ones, bad rules are refused, other hosts are refused', async () => {
    const adminA = await login('admin@sch-a.test');
    const adminB = await login('admin@sch-b.test');

    expect(await adminA.call('updateEvent', { eventId: EV_A, lottery: { claimWindowMinutes: 30, finalPhase: { announceTimes: ['11:00'] } } })).toEqual({ ok: true });
    const first = (await db.doc(`events/${EV_A}`).get()).get('lottery');
    expect(first).toMatchObject({ claimWindowMinutes: 30, announceTimes: ['12:00'], finalPhase: { announceTimes: ['11:00'], startsBeforeHours: 72 } });

    await adminA.call('updateEvent', { eventId: EV_A, lottery: { announceTimes: ['13:00'] } });
    expect((await db.doc(`events/${EV_A}`).get()).get('lottery')).toMatchObject({ claimWindowMinutes: 30, announceTimes: ['13:00'] });

    expect(await codeOf(adminA.call('updateEvent', { eventId: EV_A, lottery: { announceTimes: ['25:99'] } }))).toBe('functions/invalid-argument');
    expect(await codeOf(adminA.call('updateEvent', { eventId: EV_A, lottery: { claimWindowMinutes: 'soon' as unknown as number } }))).toBe('functions/invalid-argument');
    expect((await db.doc(`events/${EV_A}`).get()).get('lottery')).toMatchObject({ announceTimes: ['13:00'] });
    expect(await codeOf(adminB.call('updateEvent', { eventId: EV_A, lottery: { claimWindowMinutes: 10 } }))).toBe('functions/permission-denied');
  });

  it('createEvent sets safe defaults for the host admin, and refuses other hosts and unknown schools', async () => {
    const adminA = await login('admin@sch-a.test');
    const adminB = await login('admin@sch-b.test');
    const team = await login('team@sch-team.test');
    const fields = { name: 'Spring Fest', date: '2026-11-06T18:00:00+09:00', place: 'Main field', capacity: 30, faceValue: 5000, requireRoster: false };

    const { eventId } = await adminA.call('createEvent', { ...fields, schoolIds: [A, C] });
    expect((await db.doc(`events/${eventId}`).get()).data()).toMatchObject({
      name: 'Spring Fest',
      schoolIds: [A, C],
      allowedDomains: ['sch-a.test', 'sch-c.test'],
      capacity: 30,
      faceValue: 5000,
      issuedCount: 0,
      nftSeq: 0,
      enteredCount: 0,
      reassignMode: 'queue',
      requireDevice: false,
      allowReissueAfterCancel: false,
      requireRoster: false,
    });

    const before = (await db.collection('events').get()).size;
    expect(await codeOf(adminB.call('createEvent', { ...fields, schoolIds: [A] }))).toBe('functions/permission-denied');
    expect(await codeOf(adminB.call('createEvent', { ...fields, schoolIds: [A, B] }))).toBe('functions/permission-denied');
    expect(await codeOf(adminA.call('createEvent', { ...fields, schoolIds: [A, 'sch-nope'] }))).toBe('functions/not-found');
    expect(await codeOf(team.call('createEvent', { ...fields, schoolIds: ['sch-nope'] }))).toBe('functions/not-found');
    expect((await db.collection('events').get()).size).toBe(before);
  });

  it('roster imports check the admin school before reading the sheet, and a bad sheet URL fails without the network', async () => {
    const adminA = await login('admin@sch-a.test');
    const adminB = await login('admin@sch-b.test');
    const bad = 'https://example.com/not-a-sheet';

    expect(await codeOf(adminB.call('importStudentRoster', { schoolId: A, sheetUrl: bad }))).toBe('functions/permission-denied');
    expect(await codeOf(adminB.call('importEventRoster', { eventId: EV_A, sheetUrl: bad }))).toBe('functions/permission-denied');
    expect(await codeOf(adminB.call('getStudentRoster', { schoolId: A }))).toBe('functions/permission-denied');
    expect(await codeOf(adminB.call('getEventRoster', { eventId: EV_A }))).toBe('functions/permission-denied');

    expect(await codeOf(adminA.call('importStudentRoster', { schoolId: A, sheetUrl: bad }))).toBe('functions/failed-precondition');
    expect(await codeOf(adminA.call('importEventRoster', { eventId: EV_A, sheetUrl: bad }))).toBe('functions/failed-precondition');
    expect(await reasonOf(adminA.call('importStudentRoster', { schoolId: A, sheetUrl: bad }))).toBe('BAD_SHEET_URL');
    expect(await reasonOf(adminA.call('importEventRoster', { eventId: EV_A, sheetUrl: bad }))).toBe('BAD_SHEET_URL');
    expect((await db.doc(`schools/${A}`).get()).get('studentRoster')).toEqual(summary);
  });
});

describe('student sign-up and tickets', () => {
  it('precheckStudent answers visitors, never tells which ids exist, and listOpenSchools shows roster schools only', async () => {
    const guest = await visitor();
    await seedRosterRow(A, { studentId: '2024001', name: 'Ann Lee', email: 'ann@sch-a.test' });
    await seedRosterRow(A, { studentId: '2024002', name: 'Ben Park', email: 'ben@sch-a.test', claimedBy: 'someone' });

    expect(await guest.call('precheckStudent', { email: 'x@nowhere.test', studentId: '2024001' })).toEqual({ ok: false, reason: 'NO_SCHOOL' });
    expect(await guest.call('precheckStudent', { email: 'x@sch-c.test', studentId: '2024001', name: 'Ann Lee' })).toEqual({
      ok: false,
      reason: 'NO_SCHOOL',
    });

    const missingId = await guest.call('precheckStudent', { email: 'ann@sch-a.test', studentId: '2099999' });
    const otherEmail = await guest.call('precheckStudent', { email: 'mallory@sch-a.test', studentId: '2024001' });
    const claimedOtherEmail = await guest.call('precheckStudent', { email: 'mallory@sch-a.test', studentId: '2024002' });
    expect(missingId).toEqual({ ok: false, reason: 'NOT_IN_ROSTER' });
    expect(otherEmail).toEqual(missingId);
    expect(claimedOtherEmail).toEqual(missingId);

    expect(await guest.call('precheckStudent', { email: 'ann@sch-a.test', studentId: '2024001', name: 'Ann Lee' })).toEqual({
      ok: true,
      schoolId: A,
      schoolName: 'Alpha Univ',
    });
    expect(await guest.call('precheckStudent', { email: 'ann@sch-a.test', studentId: '2024001', name: 'Wrong Name' })).toEqual({
      ok: false,
      reason: 'NOT_IN_ROSTER',
    });
    expect(await guest.call('precheckStudent', { email: 'mallory@sch-a.test', studentId: '2024001', name: 'Ann Lee' })).toEqual({
      ok: false,
      reason: 'EMAIL_MISMATCH',
    });
    expect(await guest.call('precheckStudent', { email: 'ben@sch-a.test', studentId: '2024002', name: 'Ben Park' })).toEqual({
      ok: false,
      reason: 'STUDENT_ID_TAKEN',
    });
    // Without a name this is a sign-in by student id: a free row has not signed up yet, a claimed row may sign in.
    expect(await guest.call('precheckStudent', { email: 'ann@sch-a.test', studentId: '2024001' })).toEqual({ ok: false, reason: 'NOT_REGISTERED' });
    expect(await guest.call('precheckStudent', { email: 'ben@sch-a.test', studentId: '2024002' })).toEqual({
      ok: true,
      schoolId: A,
      schoolName: 'Alpha Univ',
    });

    const ids = (await guest.call('listOpenSchools', undefined)).schools.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([A, B]));
    expect(ids).not.toContain(C);
    expect(ids).not.toContain('sch-new');
  });

  it('sign-up needs the roster check, then a JPEG face photo, before a roster school issues a ticket', async () => {
    const student = await login('signup1@sch-a.test');
    await seedRosterRow(A, { studentId: '2024101', name: 'Cho Han', email: 'signup1@sch-a.test' });
    await seedRosterRow(A, { studentId: '2024102', name: 'Dan Oh', email: 'dan@sch-a.test' });
    await seedRosterRow(A, { studentId: '2024103', name: 'Eve Yu', email: 'signup2@sch-a.test', claimedBy: 'an-earlier-account' });
    const stranger = await login('signup2@sch-a.test');
    const verify = (c: Client, studentId: string, name: string) => c.call('verifyStudentRoster', { schoolId: A, studentId, name });

    expect(await reasonOf(student.call('issueTicket', { eventId: EV_A }))).toBe('NOT_REGISTERED');
    expect(await codeOf(student.call('issueTicket', { eventId: EV_A }))).toBe('functions/failed-precondition');
    expect(await codeOf(student.call('submitProfilePhoto', { photoDataUrl: TINY_JPEG }))).toBe('functions/failed-precondition');

    expect(await verify(student, '2024101', 'Someone Else')).toEqual({ ok: false, reason: 'NOT_IN_ROSTER' });
    expect(await verify(student, '2099999', 'Cho Han')).toEqual({ ok: false, reason: 'NOT_IN_ROSTER' });
    expect(await verify(student, '2024102', 'Dan Oh')).toEqual({ ok: false, reason: 'EMAIL_MISMATCH' });
    // The row belongs to an earlier account with the same mailbox, so a new account cannot take it.
    expect(await verify(stranger, '2024103', 'Eve Yu')).toEqual({ ok: false, reason: 'STUDENT_ID_TAKEN' });
    expect((await db.doc(`schools/${A}/roster/2024101`).get()).get('claimedBy')).toBeUndefined();

    const ok = await verify(student, '2024101', 'Cho Han');
    expect(ok).toMatchObject({ ok: true, profile: { schoolId: A, studentId: '2024101', name: 'Cho Han', rosterVerified: true } });
    expect((await db.doc(`schools/${A}/roster/2024101`).get()).get('claimedBy')).toBe(student.uid);
    expect(await reasonOf(student.call('issueTicket', { eventId: EV_A }))).toBe('NOT_REGISTERED');

    expect(await codeOf(student.call('submitProfilePhoto', { photoDataUrl: 'data:image/png;base64,AAAA' }))).toBe('functions/invalid-argument');
    const oversized = `data:image/jpeg;base64,${'A'.repeat(500_000)}`;
    expect(await codeOf(student.call('submitProfilePhoto', { photoDataUrl: oversized }))).toBe('functions/invalid-argument');
    expect((await db.doc(`users/${student.uid}`).get()).get('photoSubmitted')).toBeUndefined();

    const photo = await student.call('submitProfilePhoto', { photoDataUrl: TINY_JPEG });
    expect(photo.profile).toMatchObject({ rosterVerified: true, photoSubmitted: true, photoUrl: TINY_JPEG });
    const ticket = await student.call('issueTicket', { eventId: EV_A });
    expect(ticket.nftNumber).toMatch(/^#\d{4}$/);
    expect((await db.doc(`tickets/${ticket.ticketId}`).get()).get('ownerUid')).toBe(student.uid);
  });

  it('ensureUser re-checks the roster, so a removed or re-claimed row blocks tickets until the student signs up again', async () => {
    const removed = await login('recheck1@sch-a.test');
    const reclaimed = await login('recheck2@sch-a.test');
    await seedRosterRow(A, { studentId: '2024201', name: 'Fay Kang', email: 'recheck1@sch-a.test' });
    await seedRosterRow(A, { studentId: '2024202', name: 'Gus Min', email: 'recheck2@sch-a.test' });
    const finishSignUp = async (c: Client, studentId: string, name: string) => {
      await c.call('verifyStudentRoster', { schoolId: A, studentId, name });
      await c.call('submitProfilePhoto', { photoDataUrl: TINY_JPEG });
    };
    await finishSignUp(removed, '2024201', 'Fay Kang');
    await finishSignUp(reclaimed, '2024202', 'Gus Min');
    expect(await removed.call('ensureUser', undefined)).toMatchObject({ rosterVerified: true, photoSubmitted: true });

    await db.doc(`schools/${A}/roster/2024201`).delete();
    await db.doc(`schools/${A}/roster/2024202`).update({ claimedBy: 'a-different-account' });
    for (const c of [removed, reclaimed]) {
      expect(await c.call('ensureUser', undefined)).not.toHaveProperty('rosterVerified');
      expect(await reasonOf(c.call('issueTicket', { eventId: EV_A }))).toBe('NOT_REGISTERED');
    }

    await seedRosterRow(A, { studentId: '2024201', name: 'Fay Kang', email: 'recheck1@sch-a.test' });
    expect(await removed.call('verifyStudentRoster', { schoolId: A, studentId: '2024201', name: 'Fay Kang' })).toMatchObject({ ok: true });
    expect((await removed.call('issueTicket', { eventId: EV_A })).ticketId).toBeTruthy();
  });

  it('a school without a student roster keeps the old sign-in: a seeded student with no sign-up flags gets a ticket', async () => {
    await seedProfile('legacy@sch-c.test', { name: 'Legacy Student', studentId: '2020000001', photoUrl: 'https://example.com/l.png' });
    const legacy = await login('legacy@sch-c.test');
    const profile = await legacy.call('ensureUser', undefined);
    expect(profile).toMatchObject({ role: 'student', studentId: '2020000001' });
    expect(profile).not.toHaveProperty('rosterVerified');
    expect(profile).not.toHaveProperty('photoSubmitted');
    expect((await db.doc(`schools/${C}`).get()).get('studentRoster')).toBeUndefined();

    const ticket = await legacy.call('issueTicket', { eventId: EV_OPEN });
    expect((await db.doc(`tickets/${ticket.ticketId}`).get()).data()).toMatchObject({ eventId: EV_OPEN, status: 'issued' });
  });

  it('an event that requires its own roster only issues to emails on it', async () => {
    const student = await login('listed@sch-c.test');
    expect(await codeOf(student.call('issueTicket', { eventId: EV_ROSTER }))).toBe('functions/failed-precondition');
    expect(await reasonOf(student.call('issueTicket', { eventId: EV_ROSTER }))).toBe('NOT_IN_ROSTER');
    expect((await db.doc(`events/${EV_ROSTER}`).get()).get('issuedCount')).toBe(0);

    await db.doc(`events/${EV_ROSTER}/roster/listed@sch-c.test`).set({ name: 'Listed', studentId: '1', email: 'listed@sch-c.test', addedAt: FieldValue.serverTimestamp() });
    const ticket = await student.call('issueTicket', { eventId: EV_ROSTER });
    expect(ticket.nftNumber).toBe('#0001');
  });
});
