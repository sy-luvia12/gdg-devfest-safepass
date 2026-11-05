// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";

/// @title SafePass festival ticket
/// @notice One NFT per ticket. Only the server minter moves tickets, so students cannot trade them.
/// Every operator move is an event with a reason code, so a move cannot be hidden.
/// The contract has no proxy and no setter for capacity: the rules are fixed once deployed.
/// ERC-5192: every ticket is locked for its whole life, so wallets and explorers show it as
/// non-transferable. Only the minter's reassign (with a reason code) moves a ticket.
contract FestivalTicket is ERC721, AccessControl, IERC5192 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Reason codes for reassign and release. Kept in sync with functions/src/chain/reasons.ts.
    uint8 public constant REASON_CANCEL_QUEUE = 1; // cancelled, given to the next on the waitlist
    uint8 public constant REASON_CANCEL_RANDOM = 2; // cancelled, given to a random waitlist entry
    uint8 public constant REASON_CANCEL_RELEASED = 3; // cancelled, nobody eligible, back to the pool
    uint8 public constant REASON_ADMIN_REVOKE = 4; // taken back by the council (e.g. misuse)

    struct EventInfo {
        uint32 capacity;
        uint32 active; // minted and not released
        bool exists;
    }

    mapping(bytes32 eventKey => EventInfo) private _events;
    mapping(uint256 tokenId => bytes32 eventKey) public eventOf;
    mapping(uint256 tokenId => bool) public isUsed;

    /// @notice Commit-reveal for the cancelled-ticket lottery.
    /// The server takes a private snapshot of the waitlist and the freed tickets at a secret draw time,
    /// commits its hash here, and the winners follow from a block hash that did not exist at commit time.
    /// Neither the server nor anyone else can pick the seed after seeing the snapshot.
    struct Draw {
        bytes32 commitment; // keccak256 of the snapshot (format in functions/src/lottery)
        uint64 seedBlock; // block whose hash becomes the seed
        bytes32 seed; // 0 until seedDraw stores blockhash(seedBlock)
    }

    /// Blocks between a commit and its seed block. Base and Polygon PoS each make about one block every 2 s.
    uint64 public constant SEED_DELAY = 5;

    mapping(bytes32 eventKey => mapping(uint32 round => Draw)) public draws;

    /// @notice Operator actions that move no ticket but must stay visible per event. A count per kind is kept
    /// so the public board reads them without scanning logs. Revocation stays `release`/`reassign` with reason 4.
    uint8 public constant ACTION_LOST_REISSUE = 1; // lost phone or account, ticket issued again
    uint8 public constant ACTION_REFUND = 2; // paid ticket refunded
    uint8 public constant ACTION_MANUAL_ENTRY = 3; // let in by a face-to-face check without a valid QR

    mapping(bytes32 eventKey => mapping(uint8 kind => uint32)) public actionCount;

    /// @notice Instant entry draw: one student, one event. The server opens an entry with its win rate, and the
    /// contract itself decides the result from a block hash that did not exist when the entry was opened.
    /// entryId is a salted hash of the student, so the chain holds no personal data.
    /// result: 0 open, 1 won, 2 lost. Winners never exceed the event capacity.
    uint16 public constant BPS = 10_000;

    struct Entry {
        uint64 seedBlock;
        uint16 winBps; // win rate in 1/10000, fixed when the entry opens
        uint8 result;
    }

    struct EntryStats {
        uint32 settled;
        uint32 won;
    }

    mapping(bytes32 eventKey => mapping(bytes32 entryId => Entry)) public entries;
    mapping(bytes32 eventKey => EntryStats) public entryStats;

    event EventCreated(bytes32 indexed eventKey, uint32 capacity);
    event Issued(uint256 indexed tokenId, bytes32 indexed eventKey, address to);
    event Reassigned(uint256 indexed tokenId, address from, address to, uint8 reason);
    event Released(uint256 indexed tokenId, uint8 reason);
    event Used(uint256 indexed tokenId);
    event DrawCommitted(bytes32 indexed eventKey, uint32 indexed round, bytes32 commitment, uint64 seedBlock);
    event DrawSeeded(bytes32 indexed eventKey, uint32 indexed round, bytes32 seed);
    event ActionRecorded(bytes32 indexed eventKey, uint8 indexed kind, bytes32 ref);
    event EntryOpened(bytes32 indexed eventKey, bytes32 indexed entryId, uint16 winBps, uint64 seedBlock);
    event EntrySettled(bytes32 indexed eventKey, bytes32 indexed entryId, bytes32 seed, uint16 score, bool won);

    error EventExists(bytes32 eventKey);
    error UnknownEvent(bytes32 eventKey);
    error InvalidCapacity();
    error CapacityReached(bytes32 eventKey);
    error TicketUsed(uint256 tokenId);
    error InvalidReason(uint8 reason);
    error TransferNotAllowed();
    error DrawAlreadyCommitted(bytes32 eventKey, uint32 round);
    error DrawNotCommitted(bytes32 eventKey, uint32 round);
    error DrawAlreadySeeded(bytes32 eventKey, uint32 round);
    error SeedNotReady(uint64 seedBlock);
    error SeedExpired(uint64 seedBlock);
    error EmptyCommitment();
    error InvalidAction(uint8 kind);
    error InvalidWinRate(uint16 winBps);
    error EmptyEntry();
    error EntryAlreadyOpen(bytes32 entryId);
    error EntryNotOpen(bytes32 entryId);
    error EntryAlreadySettled(bytes32 entryId);

    constructor(address admin, address minter) ERC721("SafePass Festival Ticket", "SPASS") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    function createEvent(bytes32 eventKey, uint32 capacity) external onlyRole(MINTER_ROLE) {
        if (_events[eventKey].exists) revert EventExists(eventKey);
        if (capacity == 0) revert InvalidCapacity();
        _events[eventKey] = EventInfo({capacity: capacity, active: 0, exists: true});
        emit EventCreated(eventKey, capacity);
    }

    function eventInfo(bytes32 eventKey) external view returns (uint32 capacity, uint32 active, bool exists) {
        EventInfo memory e = _events[eventKey];
        return (e.capacity, e.active, e.exists);
    }

    /// @dev tokenId is derived from the ticket id off-chain, so minting the same ticket twice reverts.
    function mint(address to, uint256 tokenId, bytes32 eventKey) external onlyRole(MINTER_ROLE) {
        EventInfo storage e = _events[eventKey];
        if (!e.exists) revert UnknownEvent(eventKey);
        if (e.active >= e.capacity) revert CapacityReached(eventKey);
        e.active += 1;
        eventOf[tokenId] = eventKey;
        _mint(to, tokenId);
        emit Locked(tokenId);
        emit Issued(tokenId, eventKey, to);
    }

    function reassign(uint256 tokenId, address to, uint8 reason) external onlyRole(MINTER_ROLE) {
        if (reason != REASON_CANCEL_QUEUE && reason != REASON_CANCEL_RANDOM && reason != REASON_ADMIN_REVOKE) {
            revert InvalidReason(reason);
        }
        if (isUsed[tokenId]) revert TicketUsed(tokenId);
        address from = _requireOwned(tokenId);
        _transfer(from, to, tokenId);
        emit Reassigned(tokenId, from, to, reason);
    }

    function release(uint256 tokenId, uint8 reason) external onlyRole(MINTER_ROLE) {
        if (reason != REASON_CANCEL_RELEASED && reason != REASON_ADMIN_REVOKE) revert InvalidReason(reason);
        if (isUsed[tokenId]) revert TicketUsed(tokenId);
        _requireOwned(tokenId);
        _events[eventOf[tokenId]].active -= 1;
        _burn(tokenId);
        emit Released(tokenId, reason);
    }

    function markUsed(uint256 tokenId) external onlyRole(MINTER_ROLE) {
        _requireOwned(tokenId);
        if (isUsed[tokenId]) revert TicketUsed(tokenId);
        isUsed[tokenId] = true;
        emit Used(tokenId);
    }

    /// @notice Commits a lottery round's snapshot hash. The seed block is fixed SEED_DELAY blocks ahead.
    /// A round can be committed again only when its seed block hash expired unseeded (older than
    /// 256 blocks); the second DrawCommitted event stays on-chain, so a retry is always visible.
    function commitDraw(bytes32 eventKey, uint32 round, bytes32 commitment) external onlyRole(MINTER_ROLE) {
        if (!_events[eventKey].exists) revert UnknownEvent(eventKey);
        if (commitment == bytes32(0)) revert EmptyCommitment();
        Draw storage d = draws[eventKey][round];
        if (d.seed != bytes32(0)) revert DrawAlreadySeeded(eventKey, round);
        if (d.commitment != bytes32(0) && block.number <= d.seedBlock + 256) {
            revert DrawAlreadyCommitted(eventKey, round);
        }
        uint64 seedBlock = uint64(block.number) + SEED_DELAY;
        d.commitment = commitment;
        d.seedBlock = seedBlock;
        emit DrawCommitted(eventKey, round, commitment, seedBlock);
    }

    /// @notice Stores the seed once the seed block exists. Anyone may call it.
    /// The EVM keeps only the last 256 block hashes, so this must run within about 8 minutes on Base or Polygon.
    function seedDraw(bytes32 eventKey, uint32 round) external returns (bytes32 seed) {
        Draw storage d = draws[eventKey][round];
        if (d.commitment == bytes32(0)) revert DrawNotCommitted(eventKey, round);
        if (d.seed != bytes32(0)) revert DrawAlreadySeeded(eventKey, round);
        if (block.number <= d.seedBlock) revert SeedNotReady(d.seedBlock);
        seed = blockhash(d.seedBlock);
        if (seed == bytes32(0)) revert SeedExpired(d.seedBlock);
        d.seed = seed;
        emit DrawSeeded(eventKey, round, seed);
    }

    /// @notice Records an operator action for an event. ref is a hash of the case (e.g. the ticket id), never personal data.
    function recordAction(bytes32 eventKey, uint8 kind, bytes32 ref) external onlyRole(MINTER_ROLE) {
        if (!_events[eventKey].exists) revert UnknownEvent(eventKey);
        if (kind != ACTION_LOST_REISSUE && kind != ACTION_REFUND && kind != ACTION_MANUAL_ENTRY) revert InvalidAction(kind);
        actionCount[eventKey][kind] += 1;
        emit ActionRecorded(eventKey, kind, ref);
    }

    /// @notice Opens one student's entry. The seed block is fixed SEED_DELAY blocks ahead.
    /// An entry can be opened again only when its seed block hash expired unsettled; the second EntryOpened
    /// event stays on-chain, so a retry is always visible. A settled entry can never be drawn again.
    function openEntry(bytes32 eventKey, bytes32 entryId, uint16 winBps) external onlyRole(MINTER_ROLE) {
        if (!_events[eventKey].exists) revert UnknownEvent(eventKey);
        if (entryId == bytes32(0)) revert EmptyEntry();
        if (winBps > BPS) revert InvalidWinRate(winBps);
        Entry storage e = entries[eventKey][entryId];
        if (e.result != 0) revert EntryAlreadySettled(entryId);
        if (e.seedBlock != 0 && block.number <= e.seedBlock + 256) revert EntryAlreadyOpen(entryId);
        uint64 seedBlock = uint64(block.number) + SEED_DELAY;
        e.seedBlock = seedBlock;
        e.winBps = winBps;
        emit EntryOpened(eventKey, entryId, winBps, seedBlock);
    }

    /// @notice Settles an entry once its seed block exists. Anyone may call it.
    /// score = uint256(keccak256(abi.encode(seed, entryId))) % 10000; won when score < winBps and the event
    /// still has fewer winners than its capacity.
    function settleEntry(bytes32 eventKey, bytes32 entryId) external returns (bool won) {
        Entry storage e = entries[eventKey][entryId];
        if (e.seedBlock == 0) revert EntryNotOpen(entryId);
        if (e.result != 0) revert EntryAlreadySettled(entryId);
        if (block.number <= e.seedBlock) revert SeedNotReady(e.seedBlock);
        bytes32 seed = blockhash(e.seedBlock);
        if (seed == bytes32(0)) revert SeedExpired(e.seedBlock);
        uint16 score = uint16(uint256(keccak256(abi.encode(seed, entryId))) % BPS);
        EntryStats storage st = entryStats[eventKey];
        won = score < e.winBps && st.won < _events[eventKey].capacity;
        e.result = won ? 1 : 2;
        st.settled += 1;
        if (won) st.won += 1;
        emit EntrySettled(eventKey, entryId, seed, score, won);
    }

    /// @notice Public lookup for anyone holding a ticket id: never reverts.
    /// @return status 0 never issued, 1 active (issued, not used), 2 used at the gate, 3 released (burned)
    /// @return owner current holder, or address(0) when not active or used
    /// @return eventKey the event the ticket was issued for, or 0 when never issued
    function ticketStatus(uint256 tokenId) external view returns (uint8 status, address owner, bytes32 eventKey) {
        eventKey = eventOf[tokenId];
        owner = _ownerOf(tokenId);
        if (owner != address(0)) return (isUsed[tokenId] ? 2 : 1, owner, eventKey);
        return (eventKey == bytes32(0) ? 0 : 3, address(0), eventKey);
    }

    /// @inheritdoc IERC5192
    /// @dev Always true for an existing ticket; reverts for one that does not exist.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @dev Every mint, transfer and burn passes here. Only the minter may move a ticket.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (!hasRole(MINTER_ROLE, _msgSender())) revert TransferNotAllowed();
        return super._update(to, tokenId, auth);
    }

    /// @dev Approvals would only suggest a trade path that _update refuses, so they are disabled.
    function approve(address, uint256) public pure override {
        revert TransferNotAllowed();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert TransferNotAllowed();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}
