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

    event EventCreated(bytes32 indexed eventKey, uint32 capacity);
    event Issued(uint256 indexed tokenId, bytes32 indexed eventKey, address to);
    event Reassigned(uint256 indexed tokenId, address from, address to, uint8 reason);
    event Released(uint256 indexed tokenId, uint8 reason);
    event Used(uint256 indexed tokenId);
    event DrawCommitted(bytes32 indexed eventKey, uint32 indexed round, bytes32 commitment, uint64 seedBlock);
    event DrawSeeded(bytes32 indexed eventKey, uint32 indexed round, bytes32 seed);

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
