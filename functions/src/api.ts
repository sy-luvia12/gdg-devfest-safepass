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

export interface RefreshQrTokenRequest {
  ticketId: string;
}
export interface RefreshQrTokenResponse {
  qrPayload: string;
  expiresAt: number;
}

export const VERIFY_ENTRY_REASONS = ['INVALID_FORMAT', 'NOT_FOUND', 'TOKEN_MISMATCH', 'EXPIRED', 'USED'] as const;
export type VerifyEntryReason = (typeof VERIFY_ENTRY_REASONS)[number];

export interface VerifyEntryRequest {
  qrPayload: string;
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

// Callable name -> [request, response]. Function names are the keys.
export interface Callables {
  ensureUser: [void, EnsureUserResponse];
  issueTicket: [IssueTicketRequest, IssueTicketResponse];
  refreshQrToken: [RefreshQrTokenRequest, RefreshQrTokenResponse];
  verifyEntry: [VerifyEntryRequest, VerifyEntryResponse];
  cancelTicket: [CancelTicketRequest, CancelTicketResponse];
}
