/** Shared identity comparison; no credentials or registry data live here. */
export interface StudentIdentity {
  schoolId: string;
  studentId: string;
  name: string;
  email: string;
}

export function matchesStudent(identity: StudentIdentity, entries: readonly StudentIdentity[]): boolean {
  const text = (s: string) => s.normalize('NFC').trim();
  return [identity.schoolId, identity.studentId, identity.name, identity.email].every((v) => typeof v === 'string' && text(v).length > 0) &&
    entries.some((entry) => text(entry.schoolId) === text(identity.schoolId) &&
      text(entry.studentId) === text(identity.studentId) && text(entry.name) === text(identity.name) &&
      text(entry.email).toLowerCase() === text(identity.email).toLowerCase());
}
