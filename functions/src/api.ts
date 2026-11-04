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
// domain (or an unverified mail) cannot join this event.
export const ISSUE_REASONS = ['CANCELLED_BEFORE', 'ROLE', 'DOMAIN'] as const;
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
  retryChainOps: [void, RetryChainOpsResponse];
}
