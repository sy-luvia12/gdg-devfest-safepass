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
  'function entries(bytes32 eventKey, bytes32 entryId) view returns (uint64 seedBlock, uint16 winBps, uint8 result)',
  'function entryStats(bytes32 eventKey) view returns (uint32 settled, uint32 won)',
  'function actionCount(bytes32 eventKey, uint8 kind) view returns (uint32)',
  'event EntryOpened(bytes32 indexed eventKey, bytes32 indexed entryId, uint16 winBps, uint64 seedBlock)',
  'event EntrySettled(bytes32 indexed eventKey, bytes32 indexed entryId, bytes32 seed, uint16 score, bool won)',
  'event ActionRecorded(bytes32 indexed eventKey, uint8 indexed kind, bytes32 ref)',
]);

export const CHAIN_EVENTS = FESTIVAL_TICKET_READ_ABI.filter((x) => x.type === 'event');

// Reason codes, the same values as the constants in FestivalTicket.sol and functions/src/chain/ids.ts.
export const REASON = { CANCEL_QUEUE: 1, CANCEL_RANDOM: 2, CANCEL_RELEASED: 3, ADMIN_REVOKE: 4 } as const;

// Operator actions that move no ticket (FestivalTicket.recordAction).
export const ACTION = { LOST_REISSUE: 1, REFUND: 2, MANUAL_ENTRY: 3 } as const;
