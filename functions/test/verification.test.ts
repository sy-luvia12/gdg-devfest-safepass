import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as mock from '../../apps/web/src/lib/mock';
import { studentGatePath, homePathFor } from '../../apps/web/src/app/config';
import { matchesStudent } from '../src/domain/studentRegistry';
import registry from '../../apps/web/src/lib/fixtures/studentRegistry.json';

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
}
const photo = 'data:image/jpeg;base64,YQ==';
async function login(uid = 'hanbit-new') {
  sessionStorage.setItem('safepass-mock-selected', uid);
  return mock.signInWithSchoolAccount();
}
async function instantly<T>(promise: Promise<T>) {
  return promise;
}
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
});

describe('student registry onboarding', () => {
  it.each(['hanbit', 'pureun', 'chorok'])('approves the exact existing %s new student, unlocks festival and issues ticket', async (school) => {
    const user = await login(`${school}-new`);
    expect(studentGatePath(user)).toBe('/onboarding');
    const result = await instantly(mock.submitVerification(photo, photo));
    expect(result.verifyStatus).toBe('approved');
    expect(result.photoUrl).toBe(photo);
    expect(result.idCardUrl).toBe(photo);
    expect(studentGatePath(result)).toBeNull();
    const [event] = await mock.listEvents(school);
    const ticket = await instantly(mock.issueTicket(event.id));
    expect(ticket.ownerUid).toBe(user.uid);
    expect(await mock.getMyTicket(event.id)).toEqual(ticket);
  });
  it('rejects a missing entry and blocks ticket issuance', async () => {
    await login();
    const result = await instantly(mock.submitVerification(photo, photo, { name: '명단에없는학생', studentId: '99999999' }));
    expect(result.verifyStatus).toBe('rejected');
    expect(result.rejectReason).toContain('학적 명단');
    expect(studentGatePath(result)).toBe('/onboarding');
    const [event] = await mock.listEvents('hanbit');
    const attempt = expect(mock.issueTicket(event.id)).rejects.toMatchObject({ code: 'not_in_roster' });
    await instantly(attempt);
  });
  it.each(['name', 'studentId', 'email', 'schoolId'] as const)('does not approve incorrect %s', (field) => {
    expect(matchesStudent({ ...registry[2], [field]: 'incorrect' }, registry)).toBe(false);
  });
  it('allows retry with corrected information', async () => {
    await login();
    expect((await instantly(mock.submitVerification(photo, photo, { name: '오류', studentId: '20260031' }))).verifyStatus).toBe('rejected');
    expect((await instantly(mock.submitVerification(photo, photo, registry[2]))).verifyStatus).toBe('approved');
  });
  it('keeps approved accounts and registered photos unchanged', async () => {
    const user = await login('hanbit-s1');
    expect(user.verifyStatus).toBe('approved');
    expect(await instantly(mock.submitVerification(photo, photo))).toEqual(user);
    expect(studentGatePath(user)).toBeNull();
  });
  it('routes old pending applications to automatic resubmission', async () => {
    const user = await login('hanbit-ap1');
    expect(studentGatePath(user)).toBe('/onboarding');
    expect((await instantly(mock.submitVerification(photo, photo))).verifyStatus).toBe('approved');
  });
  it('staff scans an existing student ticket and remains outside onboarding', async () => {
    await login('hanbit-s2');
    const [event] = await mock.listEvents('hanbit');
    const ticket = (await mock.getMyTicket(event.id))!;
    const qr = await instantly(mock.refreshQrToken(ticket.id));
    const staff = await login('hanbit-staff');
    expect(studentGatePath(staff)).toBeNull();
    expect(homePathFor(staff.role)).toBe('/staff/scan');
    const result = await instantly(mock.verifyEntry(mock.formatQrPayload(ticket.id, qr.token), event.id));
    expect(result.result).toBe('ok');
  });
});
