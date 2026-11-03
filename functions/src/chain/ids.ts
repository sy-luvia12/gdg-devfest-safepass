import { keccak256, toUtf8Bytes } from 'ethers';

// On-chain identifiers derived from Firestore ids (contracts/README.md). Deterministic, so a retried
// mint of the same ticket reverts on chain instead of issuing a second token.
export const eventKeyOf = (eventId: string): string => keccak256(toUtf8Bytes(eventId));

// uint256 does not fit a JS number, so token ids travel as decimal strings (docs/api.md 8).
export const tokenIdOf = (ticketId: string): string => BigInt(keccak256(toUtf8Bytes(ticketId))).toString();

// Reason codes, the same values as the constants in FestivalTicket.sol.
export const REASON = { CANCEL_QUEUE: 1, CANCEL_RANDOM: 2, CANCEL_RELEASED: 3, ADMIN_REVOKE: 4 } as const;
export type Reason = (typeof REASON)[keyof typeof REASON];
