import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { role: 'student', verifyStatus: 'none', email: 'hayun@hanbit.ac.kr', name: '송하윤', studentId: '20260031' } as Record<string, unknown>,
  update: vi.fn(), set: vi.fn(), sheet: vi.fn(),
}));
vi.mock('../src/firebase', () => ({ db: {
  doc: (path: string) => ({ path }),
  collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [{ id: 'hanbit' }] }) }) }) }),
  runTransaction: async (fn: (tx: unknown) => unknown) => fn({
    get: async () => ({ exists: true, data: () => state.user, get: (key: string) => state.user[key] }),
    update: state.update, set: state.set,
  }),
} }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class {
  async getClient() { return { request: state.sheet }; }
} }));
import { submitVerification } from '../src/handlers/submitVerification';
import { lookupStudent } from '../src/sheets/studentRegistry';

const identity = { schoolId: 'hanbit', studentId: '20260031', name: '송하윤', email: 'hayun@hanbit.ac.kr' };
const photo = 'data:image/jpeg;base64,YQ==';
function request(overrides = {}) {
  return {
    auth: { uid: 'student-1', token: { email: identity.email, email_verified: true } },
    data: { photo, idCard: photo, name: identity.name, studentId: identity.studentId, verifyStatus: 'approved', schoolId: 'forged', ...overrides },
  } as unknown as Parameters<typeof submitVerification.run>[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { role: 'student', verifyStatus: 'none', email: identity.email };
  process.env.STUDENT_REGISTRY_SHEET_ID = 'fictional-test-sheet';
  state.sheet.mockResolvedValue({ data: { values: [[identity.schoolId, identity.studentId, identity.name, identity.email]] } });
});

describe('server verification boundary', () => {
  it('approves only a server registry match and keeps the ID photo private', async () => {
    const result = await submitVerification.run(request());
    expect(result.verifyStatus).toBe('approved');
    expect(result.schoolId).toBe('hanbit');
    expect(result).not.toHaveProperty('idCard');
    expect(state.set).toHaveBeenCalledWith({ path: 'verificationPhotos/student-1' }, expect.objectContaining({ idCard: photo }));
  });
  it('ignores forged approved status on a nonmatch', async () => {
    const result = await submitVerification.run(request({ studentId: 'wrong' }));
    expect(result.verifyStatus).toBe('rejected');
  });
  it('does not turn service failures into rejection or approval', async () => {
    state.sheet.mockRejectedValue(new Error('private upstream detail'));
    await expect(submitVerification.run(request())).rejects.toMatchObject({ code: 'unavailable' });
    expect(state.update).not.toHaveBeenCalled();
  });
  it('fails closed when configuration is absent', async () => {
    delete process.env.STUDENT_REGISTRY_SHEET_ID;
    await expect(lookupStudent(identity)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.sheet).not.toHaveBeenCalled();
  });
  it('keeps previously approved users without consulting the registry or replacing photos', async () => {
    state.user.verifyStatus = 'approved';
    expect((await submitVerification.run(request())).verifyStatus).toBe('approved');
    expect(state.sheet).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
  it('rejects staff attempts to use student verification', async () => {
    state.user.role = 'staff';
    await expect(submitVerification.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('rejects malformed photos before lookup', async () => {
    await expect(submitVerification.run(request({ photo: 'https://external/image' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.sheet).not.toHaveBeenCalled();
  });
});
