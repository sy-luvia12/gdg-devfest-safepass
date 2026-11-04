// Client-facing contract for the callables in docs/api.md section 2.
// apps/web imports these types, so this file must stay free of runtime dependencies.

export const ROLES = ['student', 'staff', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface UserProfile {
  uid: string;
  name: string;
  studentId: string;
  email: string;
  photoUrl: string | null;
  role: Role;
  /** Set on admin accounts that manage one school. Absent on SafePass team admins, who manage every school. */
  adminSchoolId?: string;
  /** Set once verifyStudentRoster matched this account to its school roster row. */
  schoolId?: string;
  rosterVerified?: boolean;
}

export type EnsureUserResponse = UserProfile;

export interface IssueTicketRequest {
  eventId: string;
}
export interface IssueTicketResponse {
  ticketId: string;
  nftNumber: string;
}
// failed-precondition with details.reason. CANCELLED_BEFORE: this student cancelled a ticket for the event and
// the event does not set allowReissueAfterCancel.
// NOT_IN_ROSTER: the event sets requireRoster and the student's email is not on its roster.
export const ISSUE_REASONS = ['CANCELLED_BEFORE', 'NOT_IN_ROSTER'] as const;
export type IssueReason = (typeof ISSUE_REASONS)[number];

export const REASSIGN_MODES = ['queue', 'random'] as const;
export type ReassignMode = (typeof REASSIGN_MODES)[number];

// Device binding. The phone keeps a non-extractable ECDSA P-256 key and signs
// `TTV1-REFRESH:{ticketId}:{signedAt}` (SHA-256, IEEE P1363, base64url) to prove it is the registered device.
export interface DeviceProof {
  signedAt: number;
  signature: string;
}
export interface DeviceKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}
export const DEVICE_REASONS = ['DEVICE_NOT_REGISTERED', 'DEVICE_PROOF_INVALID'] as const;
export type DeviceReason = (typeof DEVICE_REASONS)[number];

export interface RefreshQrTokenRequest {
  ticketId: string;
  // Required only when the event sets requireDevice. The error is failed-precondition with details.reason a DeviceReason.
  deviceProof?: DeviceProof;
}
export interface RefreshQrTokenResponse {
  qrPayload: string;
  expiresAt: number;
}

export const SCAN_RESULTS = ['ok', 'expired', 'used', 'invalid'] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];

// WRONG_EVENT: the ticket belongs to another event than the one the scanner is checking.
export const VERIFY_ENTRY_REASONS = ['INVALID_FORMAT', 'NOT_FOUND', 'WRONG_EVENT', 'TOKEN_MISMATCH', 'EXPIRED', 'USED'] as const;
export type VerifyEntryReason = (typeof VERIFY_ENTRY_REASONS)[number];

export interface VerifyEntryRequest {
  qrPayload: string;
  /** The event the scanner is checking. Omitted means any event (older clients). */
  eventId?: string;
}
export type VerifyEntryResponse =
  | {
      ok: true;
      ticketId: string;
      holder: { name: string; studentId: string; photoUrl: string | null };
      enteredCount: number;
      capacity: number;
    }
  | { ok: false; reason: VerifyEntryReason };

export const CANCEL_REASONS = ['TICKET_USED'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export interface CancelTicketRequest {
  ticketId: string;
}
// REASSIGNED: the ticket went to someone on the waitlist. RELEASED: nobody could take it, so it is issuable again.
export type CancelTicketResponse = { ok: true; outcome: 'REASSIGNED' | 'RELEASED' } | { ok: false; reason: CancelReason };

export interface RegisterDeviceRequest {
  publicKeyJwk: DeviceKey;
}
export interface RegisterDeviceResponse {
  ok: true;
}

export interface ResetDeviceRequest {
  uid: string;
}
export interface ResetDeviceResponse {
  ok: true;
}

export interface SetReassignModeRequest {
  eventId: string;
  mode: ReassignMode;
}
export interface SetReassignModeResponse {
  ok: true;
}

export interface SetAllowReissueRequest {
  eventId: string;
  allow: boolean;
}
export interface SetAllowReissueResponse {
  ok: true;
}

// The student asks the council to reset their device. Stored in deviceResets/{uid}; resetDevice marks it done.
export interface RequestDeviceResetResponse {
  ok: true;
}

// Admin only. Grants (staff: true) or removes the staff role by email.
// PENDING_SIGNUP: the person has not signed in yet; the role applies on their first sign-in.
export interface SetStaffRequest {
  email: string;
  staff: boolean;
}
export interface SetStaffResponse {
  ok: true;
  status: 'UPDATED' | 'PENDING_SIGNUP';
}

// ---------- School spaces, rosters and events (admin) ----------
// An admin with adminSchoolId manages only that school. A team admin (no adminSchoolId) manages every school.

// failed-precondition with details.reason when a roster sheet cannot be read.
export const SHEET_REASONS = ['BAD_SHEET_URL', 'SHEET_NOT_SHARED', 'SHEET_NOT_FOUND', 'SHEETS_API_DISABLED', 'MISSING_COLUMNS'] as const;
export type SheetReason = (typeof SHEET_REASONS)[number];

export interface UpsertSchoolRequest {
  schoolId: string;
  name: string;
  domains: string[];
  brandColor: string;
}
export interface UpsertSchoolResponse {
  ok: true;
  created: boolean;
}

export interface RosterEntry {
  name: string;
  studentId: string;
  email: string;
}
export interface RosterSummary {
  sheetUrl: string;
  importedAtMs: number;
  count: number;
}
export type RosterSkipReason = 'MISSING_FIELD' | 'BAD_STUDENT_ID' | 'BAD_DOMAIN' | 'DUPLICATE_STUDENT_ID' | 'DUPLICATE_EMAIL';
export interface ImportRosterResponse {
  ok: true;
  summary: RosterSummary;
  skipped: { row: number; reason: RosterSkipReason }[];
}
// summary is null before the first import. entries holds the first ROSTER_PREVIEW rows, sorted by student id.
export interface GetRosterResponse {
  summary: RosterSummary | null;
  entries: RosterEntry[];
  serviceAccountEmail: string;
}
export const ROSTER_PREVIEW = 200;

export interface ImportStudentRosterRequest {
  schoolId: string;
  sheetUrl: string;
}
export interface GetStudentRosterRequest {
  schoolId: string;
}
export interface ImportEventRosterRequest {
  eventId: string;
  sheetUrl: string;
}
export interface GetEventRosterRequest {
  eventId: string;
}

// schoolIds[0] hosts the event and its admin creates it. allowedDomains come from the schools' domains.
export interface EventFields {
  schoolIds: string[];
  name: string;
  /** ISO 8601 with offset, e.g. 2026-11-06T18:00:00+09:00 */
  date: string;
  place: string;
  capacity: number;
  faceValue: number;
  requireRoster: boolean;
}
export type CreateEventRequest = EventFields;
export interface CreateEventResponse {
  ok: true;
  eventId: string;
}
// schoolIds cannot change after creation. capacity cannot go below issuedCount.
export type UpdateEventRequest = { eventId: string } & Partial<Omit<EventFields, 'schoolIds'>>;
export interface UpdateEventResponse {
  ok: true;
}

// Sign-up check, called by the signed-in student. The row is found by student id; the name must match it and the
// signed-in (Google-verified) email must be the row's email. A student id can back only one account.
export const VERIFY_STUDENT_REASONS = ['NOT_IN_ROSTER', 'EMAIL_MISMATCH', 'STUDENT_ID_TAKEN'] as const;
export type VerifyStudentReason = (typeof VERIFY_STUDENT_REASONS)[number];
export interface VerifyStudentRosterRequest {
  schoolId: string;
  name: string;
  studentId: string;
}
export type VerifyStudentRosterResponse = { ok: true; profile: UserProfile } | { ok: false; reason: VerifyStudentReason };

// Callable name -> [request, response]. Function names are the keys.
export interface Callables {
  ensureUser: [void, EnsureUserResponse];
  issueTicket: [IssueTicketRequest, IssueTicketResponse];
  refreshQrToken: [RefreshQrTokenRequest, RefreshQrTokenResponse];
  verifyEntry: [VerifyEntryRequest, VerifyEntryResponse];
  cancelTicket: [CancelTicketRequest, CancelTicketResponse];
  registerDevice: [RegisterDeviceRequest, RegisterDeviceResponse];
  resetDevice: [ResetDeviceRequest, ResetDeviceResponse];
  setReassignMode: [SetReassignModeRequest, SetReassignModeResponse];
  setAllowReissue: [SetAllowReissueRequest, SetAllowReissueResponse];
  requestDeviceReset: [void, RequestDeviceResetResponse];
  setStaff: [SetStaffRequest, SetStaffResponse];
  upsertSchool: [UpsertSchoolRequest, UpsertSchoolResponse];
  importStudentRoster: [ImportStudentRosterRequest, ImportRosterResponse];
  getStudentRoster: [GetStudentRosterRequest, GetRosterResponse];
  createEvent: [CreateEventRequest, CreateEventResponse];
  updateEvent: [UpdateEventRequest, UpdateEventResponse];
  importEventRoster: [ImportEventRosterRequest, ImportRosterResponse];
  getEventRoster: [GetEventRosterRequest, GetRosterResponse];
  verifyStudentRoster: [VerifyStudentRosterRequest, VerifyStudentRosterResponse];
}
