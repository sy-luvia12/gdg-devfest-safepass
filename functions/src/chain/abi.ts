// The part of FestivalTicket (contracts/contracts/FestivalTicket.sol) that the server calls.
export const FESTIVAL_TICKET_ABI = [
  'function createEvent(bytes32 eventKey, uint32 capacity)',
  'function eventInfo(bytes32 eventKey) view returns (uint32 capacity, uint32 active, bool exists)',
  'function mint(address to, uint256 tokenId, bytes32 eventKey)',
  'function reassign(uint256 tokenId, address to, uint8 reason)',
  'function release(uint256 tokenId, uint8 reason)',
  'function markUsed(uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isUsed(uint256 tokenId) view returns (bool)',
  'function eventOf(uint256 tokenId) view returns (bytes32)',
  'function commitDraw(bytes32 eventKey, uint32 round, bytes32 commitment)',
  'function seedDraw(bytes32 eventKey, uint32 round) returns (bytes32 seed)',
  'function draws(bytes32 eventKey, uint32 round) view returns (bytes32 commitment, uint64 seedBlock, bytes32 seed)',
  'event DrawCommitted(bytes32 indexed eventKey, uint32 indexed round, bytes32 commitment, uint64 seedBlock)',
  'error ERC721NonexistentToken(uint256 tokenId)',
] as const;
