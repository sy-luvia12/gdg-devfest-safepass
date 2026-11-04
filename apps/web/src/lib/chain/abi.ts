import { parseAbi } from 'viem';

// Read-only part of FestivalTicket (contracts/contracts/FestivalTicket.sol) that the browser uses.
export const FESTIVAL_TICKET_READ_ABI = parseAbi([
  'function eventInfo(bytes32 eventKey) view returns (uint32 capacity, uint32 active, bool exists)',
  'function ticketStatus(uint256 tokenId) view returns (uint8 status, address owner, bytes32 eventKey)',
  'function draws(bytes32 eventKey, uint32 round) view returns (bytes32 commitment, uint64 seedBlock, bytes32 seed)',
  'event Issued(uint256 indexed tokenId, bytes32 indexed eventKey, address to)',
  'event Reassigned(uint256 indexed tokenId, address from, address to, uint8 reason)',
  'event Released(uint256 indexed tokenId, uint8 reason)',
  'event Used(uint256 indexed tokenId)',
  'event DrawCommitted(bytes32 indexed eventKey, uint32 indexed round, bytes32 commitment, uint64 seedBlock)',
  'event DrawSeeded(bytes32 indexed eventKey, uint32 indexed round, bytes32 seed)',
]);

export const CHAIN_EVENTS = FESTIVAL_TICKET_READ_ABI.filter((x) => x.type === 'event');

// Reason codes, the same values as the constants in FestivalTicket.sol and functions/src/chain/ids.ts.
export const REASON = { CANCEL_QUEUE: 1, CANCEL_RANDOM: 2, CANCEL_RELEASED: 3, ADMIN_REVOKE: 4 } as const;
