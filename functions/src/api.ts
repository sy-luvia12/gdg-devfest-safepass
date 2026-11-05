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
  /** Set on staff added by a school admin: they check tickets at that school's events only. */
  staffSchoolId?: string;
  /** Set once verifyStudentRoster matched this account to its school roster row. */
  schoolId?: string;
  rosterVerified?: boolean;
  /** Set once the student sent a face photo with submitProfilePhoto. Sign-up is complete with both flags. */
  photoSubmitted?: boolean;
  /** The SafePass operator account (an admin without adminSchoolId). Only it can call the ops* functions. */
  operator?: boolean;
}

export type EnsureUserResponse = UserProfile;

export interface IssueTicketRequest {
  eventId: string;
}
export interface IssueTicketResponse {
  ticketId: string;
  nftNumber: string;
}
// details.reason on issueTicket errors.
// failed-precondition CANCELLED_BEFORE: this student cancelled a ticket for the event and the event does not set
// allowReissueAfterCancel. permission-denied ROLE: the caller is not a student. permission-denied DOMAIN: the mail
// domain (or an unverified mail) cannot join this event. failed-precondition NOT_IN_ROSTER: the event sets
// requireRoster and the student's email is not on its roster. failed-precondition NOT_REGISTERED: the student's
// school has a roster and the student has not finished sign-up (roster check and face photo).
export const ISSUE_REASONS = ['CANCELLED_BEFORE', 'ROLE', 'DOMAIN', 'NOT_IN_ROSTER', 'NOT_REGISTERED'] as const;
export type IssueReason = (typeof ISSUE_REASONS)[number];

// lottery: a cancelled ticket waits in a pool and goes to a waitlist entry drawn at a fixed announcement time
// (docs/api.md 14장). The draw is committed on chain before its seed exists, so nobody can pick the winner.
export const REASSIGN_MODES = ['queue', 'random', 'lottery'] as const;
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

// mismatch: two-step check, the scanner compared the face and pressed "different" (confirmEntry match false).
export const SCAN_RESULTS = ['ok', 'expired', 'used', 'invalid', 'mismatch'] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];

// Signed QR (events with requireDevice). The phone signs `TTV2:{ticketId}:{token}:{signedAt}` with its device key
// (same algorithm as DeviceProof: ECDSA P-256, SHA-256, IEEE P1363, base64url) and shows
// `TTV2:{ticketId}:{token}:{signedAt}:{signature}`. refreshQrToken still returns the unsigned TTV1 payload; the
// client builds the TTV2 payload from its token. An event without requireDevice accepts TTV1 and TTV2.
//
// WRONG_EVENT: the ticket belongs to another event than the one the scanner is checking.
// SIGNATURE_INVALID: the event requires a signed QR and this one is unsigned, signed by another key, or too old.
export const VERIFY_ENTRY_REASONS = [
  'INVALID_FORMAT',
  'NOT_FOUND',
  'WRONG_EVENT',
  'TOKEN_MISMATCH',
  'EXPIRED',
  'USED',
  'SIGNATURE_INVALID',
] as const;
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
      /** Two-step check (events.twoStepCheck): nobody is admitted yet. The scanner shows the photo and then calls
       * confirmEntry within CONFIRM_WINDOW_MS. enteredCount is the count before this ticket. */
      needsConfirm?: true;
    }
  | { ok: false; reason: VerifyEntryReason };

// How long a verified ticket waits for the scanner's answer, in ms.
export const CONFIRM_WINDOW_MS = 60_000;

// match true admits the ticket (same transaction as the one-step verifyEntry). match false records a `mismatch`
// scan and leaves the ticket issued. Only the staff member who verified it can confirm.
// NO_PENDING_CHECK: no verifyEntry with needsConfirm for this ticket by this caller, or it is older than the window.
export const CONFIRM_ENTRY_REASONS = ['MISMATCH', 'USED', 'NOT_FOUND', 'NO_PENDING_CHECK'] as const;
export type ConfirmEntryReason = (typeof CONFIRM_ENTRY_REASONS)[number];

export interface ConfirmEntryRequest {
  ticketId: string;
  match: boolean;
}
export type ConfirmEntryResponse =
  | { ok: true; ticketId: string; enteredCount: number; capacity: number }
  | { ok: false; reason: ConfirmEntryReason };

export const CANCEL_REASONS = ['TICKET_USED'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export interface CancelTicketRequest {
  ticketId: string;
}
// REASSIGNED: the ticket went to someone on the waitlist. RELEASED: nobody could take it, so it is issuable again.
// POOLED (lottery events): the ticket waits for the next draw. The canceller is not told where it goes.
export type CancelTicketResponse = { ok: true; outcome: 'REASSIGNED' | 'RELEASED' | 'POOLED' } | { ok: false; reason: CancelReason };

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

// Admin only. Replays chain ops that are not on chain yet (chain was off, or the minter ran out of gas).
export interface RetryChainOpsResponse {
  ok: true;
  done: number;
  blocked: number;
  failed: number;
}

// On-chain record of a ticket, written by processChainOp (docs/api.md 8장). Absent until the first op is queued.
export interface TicketChainState {
  status: 'pending' | 'done' | 'blocked';
  tokenId?: string;
  mintTx?: string;
  lastTx?: string;
  contractOwner?: string | null;
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
// NOT_IN_STUDENT_ROSTER and NAME_MISMATCH are event roster rows that do not match the host school's student roster.
export type RosterSkipReason =
  | 'MISSING_FIELD'
  | 'BAD_STUDENT_ID'
  | 'BAD_DOMAIN'
  | 'DUPLICATE_STUDENT_ID'
  | 'DUPLICATE_EMAIL'
  | 'NOT_IN_STUDENT_ROSTER'
  | 'NAME_MISMATCH';
export interface ImportRosterResponse {
  ok: true;
  summary: RosterSummary;
  skipped: { row: number; reason: RosterSkipReason }[];
}
// summary is null before the first import. entries holds the first ROSTER_PREVIEW rows, sorted by student id.
// Event roster entries have no email: event admins see names and student ids only.
export interface GetRosterResponse {
  summary: RosterSummary | null;
  entries: (Omit<RosterEntry, 'email'> & { email?: string })[];
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

// Waitlist (대기 명단): the event admin loads a sheet of 이름·학번 in waiting order. Rows that match the host school's
// roster become events/{id}/waitlist/{email}; cancelTicket (queue/random) and the lottery draw from it.
export interface ImportWaitlistRequest {
  eventId: string;
  sheetUrl: string;
}
export interface GetWaitlistRequest {
  eventId: string;
}
// No emails: the event admin sees names and student ids only. status is 'waiting' or a settled state.
export interface WaitlistRow {
  order: number;
  name: string;
  studentId: string;
  status: string;
}
export interface GetWaitlistResponse {
  summary: RosterSummary | null;
  entries: WaitlistRow[];
  serviceAccountEmail: string;
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
// lottery changes only the fields it names; the rest keeps the stored value or the default (docs/api.md 14장).
export type LotteryPatch = Partial<Omit<LotterySettings, 'finalPhase'>> & { finalPhase?: Partial<LotterySettings['finalPhase']> };
export type UpdateEventRequest = { eventId: string; lottery?: LotteryPatch } & Partial<Omit<EventFields, 'schoolIds'>>;
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

// ---------- Student sign-up and sign-in by email link (no sign-in needed for these two) ----------

// Schools whose student roster is loaded, for the sign-up school picker.
export interface OpenSchool {
  id: string;
  name: string;
  domain: string;
}
export interface ListOpenSchoolsResponse {
  schools: OpenSchool[];
}

// Checked before the email link is sent. With name it is a sign-up check (row free to claim); without name it is a
// sign-in by student id (row already claimed). The school is found from the email domain.
// NO_SCHOOL: the domain belongs to no school with a roster. A wrong name answers NOT_IN_ROSTER, so the check does not
// tell which student ids exist.
export const PRECHECK_REASONS = ['NO_SCHOOL', 'NOT_IN_ROSTER', 'EMAIL_MISMATCH', 'STUDENT_ID_TAKEN', 'NOT_REGISTERED'] as const;
export type PrecheckReason = (typeof PRECHECK_REASONS)[number];
export interface PrecheckStudentRequest {
  email: string;
  studentId: string;
  name?: string;
}
export type PrecheckStudentResponse =
  | { ok: true; schoolId: string; schoolName: string }
  | { ok: false; reason: PrecheckReason };

// The last sign-up step, after verifyStudentRoster. A JPEG data URL of at most PROFILE_PHOTO_MAX_BYTES, shown to the
// ticket checker next to the QR.
export const PROFILE_PHOTO_MAX_BYTES = 300_000;
export interface SubmitProfilePhotoRequest {
  photoDataUrl: string;
}
export interface SubmitProfilePhotoResponse {
  ok: true;
  profile: UserProfile;
}

// ---------- Operator console (ops*). Only the operator account (users.operator) can call these ----------

export type OpsRosterKind = 'school' | 'event';
export interface OpsListRosterRequest {
  kind: OpsRosterKind;
  /** schoolId for 'school', eventId for 'event' */
  id: string;
}
// School rows carry the email and whether a student signed up with the row. Event rows carry the host school's
// roster email of the same student id and whether the row matches it.
export interface OpsRosterRow {
  name: string;
  studentId: string;
  email?: string;
  claimed?: boolean;
  match?: 'OK' | 'NOT_IN_STUDENT_ROSTER' | 'NAME_MISMATCH';
}
export interface OpsListRosterResponse {
  rows: OpsRosterRow[];
  summary: RosterSummary | null;
  /** The event's host school, for 'event' */
  schoolId?: string;
  /** false for an event roster the event admin has not loaded from a sheet yet: opsEditRoster refuses it */
  editable: boolean;
}
export const OPS_EDIT_MAX = 3000;
export interface OpsEditRosterRequest {
  kind: OpsRosterKind;
  id: string;
  /** Rows to add or overwrite, keyed by studentId. Event rows ignore email. */
  upserts: { name: string; studentId: string; email?: string }[];
  /** Student ids to remove */
  deletes: string[];
  /** Remove every row not in upserts (paste a whole sheet) */
  replace?: boolean;
}
export interface OpsEditRosterResponse {
  ok: true;
  saved: number;
  deleted: number;
  /** index into upserts */
  skipped: { index: number; reason: RosterSkipReason }[];
  summary: RosterSummary;
}
export interface OpsListStudentsRequest {
  schoolId: string;
}
export interface OpsStudent {
  uid: string;
  name: string;
  studentId: string;
  email: string;
  /** A device key is registered (devices/{uid}) */
  deviceRegistered: boolean;
  /** The student asked for a reset (deviceResets/{uid} pending) */
  resetRequested: boolean;
}
export interface OpsListStudentsResponse {
  students: OpsStudent[];
}

// Event admins (행사 담당자) are admin accounts with adminSchoolId, usually a team member's own Gmail. The operator
// assigns them by email. Someone who has not signed in yet gets it on the first Google sign-in (seedProfiles).
export interface OpsEventAdmin {
  email: string;
  name: string;
  schoolId: string;
  /** ACTIVE: signed in already. PENDING_SIGNUP: applies on the first sign-in */
  status: 'ACTIVE' | 'PENDING_SIGNUP';
}
export interface OpsListEventAdminsResponse {
  admins: OpsEventAdmin[];
}
export interface OpsSetEventAdminRequest {
  email: string;
  /** The school this account manages events for. null removes the event admin role. */
  schoolId: string | null;
}
export interface OpsSetEventAdminResponse {
  ok: true;
  status: 'UPDATED' | 'PENDING_SIGNUP' | 'REMOVED';
}

// Cancelled-ticket lottery (reassignMode 'lottery'). Times are Asia/Seoul wall clock "HH:MM".
export interface LotteryPhase {
  announceTimes: string[];
  minDrawGapHours: number;
}
export interface LotterySettings extends LotteryPhase {
  // From this many hours before the event start, finalPhase replaces the times and the gap.
  finalPhase: LotteryPhase & { startsBeforeHours: number };
  claimWindowMinutes: number;
  drawCloseBeforeStartHours: number;
}

export interface RunDrawNowRequest {
  eventId: string;
}
// Demo and operations: snapshot now, commit on chain, announce as soon as the seed is stored.
export type RunDrawNowResponse =
  | { ok: true; round: number; tickets: number; entries: number }
  | { ok: false; reason: 'NOT_LOTTERY' | 'NO_TICKETS' | 'NO_ENTRIES' | 'ROUND_OPEN' };

export interface GetMyLotteryRequest {
  eventId: string;
}
// The student's own entry. Waitlist size, order and odds are never returned.
export interface DrawReceipt {
  eventId: string;
  round: number;
  uid: string;
  salt: string;
  proof: string[];
  root: string;
  tokenIds: string[];
}
export type GetMyLotteryResponse = {
  state: 'NONE' | 'WAITING' | 'WON' | 'CLAIMED' | 'EXPIRED' | 'CLOSED';
  nextAnnounceAt: number | null;
  offer: { ticketId: string; expiresAt: number } | null;
  receipt: DrawReceipt | null; // the latest round this student was in
};

export interface ClaimTicketRequest {
  eventId: string;
}
export type ClaimTicketResponse =
  | { ok: true; ticketId: string }
  | { ok: false; reason: 'NO_OFFER' | 'EXPIRED' };

// Callable name -> [request, response]. Function names are the keys.
export interface Callables {
  ensureUser: [void, EnsureUserResponse];
  issueTicket: [IssueTicketRequest, IssueTicketResponse];
  refreshQrToken: [RefreshQrTokenRequest, RefreshQrTokenResponse];
  verifyEntry: [VerifyEntryRequest, VerifyEntryResponse];
  confirmEntry: [ConfirmEntryRequest, ConfirmEntryResponse];
  cancelTicket: [CancelTicketRequest, CancelTicketResponse];
  registerDevice: [RegisterDeviceRequest, RegisterDeviceResponse];
  resetDevice: [ResetDeviceRequest, ResetDeviceResponse];
  setReassignMode: [SetReassignModeRequest, SetReassignModeResponse];
  setAllowReissue: [SetAllowReissueRequest, SetAllowReissueResponse];
  requestDeviceReset: [void, RequestDeviceResetResponse];
  setStaff: [SetStaffRequest, SetStaffResponse];
  retryChainOps: [void, RetryChainOpsResponse];
  upsertSchool: [UpsertSchoolRequest, UpsertSchoolResponse];
  importStudentRoster: [ImportStudentRosterRequest, ImportRosterResponse];
  getStudentRoster: [GetStudentRosterRequest, GetRosterResponse];
  createEvent: [CreateEventRequest, CreateEventResponse];
  updateEvent: [UpdateEventRequest, UpdateEventResponse];
  importEventRoster: [ImportEventRosterRequest, ImportRosterResponse];
  getEventRoster: [GetEventRosterRequest, GetRosterResponse];
  verifyStudentRoster: [VerifyStudentRosterRequest, VerifyStudentRosterResponse];
  listOpenSchools: [void, ListOpenSchoolsResponse];
  precheckStudent: [PrecheckStudentRequest, PrecheckStudentResponse];
  submitProfilePhoto: [SubmitProfilePhotoRequest, SubmitProfilePhotoResponse];
  importWaitlist: [ImportWaitlistRequest, ImportRosterResponse];
  getWaitlist: [GetWaitlistRequest, GetWaitlistResponse];
  opsListRoster: [OpsListRosterRequest, OpsListRosterResponse];
  opsEditRoster: [OpsEditRosterRequest, OpsEditRosterResponse];
  opsListStudents: [OpsListStudentsRequest, OpsListStudentsResponse];
  opsListEventAdmins: [void, OpsListEventAdminsResponse];
  opsSetEventAdmin: [OpsSetEventAdminRequest, OpsSetEventAdminResponse];
  runDrawNow: [RunDrawNowRequest, RunDrawNowResponse];
  getMyLottery: [GetMyLotteryRequest, GetMyLotteryResponse];
  claimTicket: [ClaimTicketRequest, ClaimTicketResponse];
}
