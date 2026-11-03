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

    event EventCreated(bytes32 indexed eventKey, uint32 capacity);
    event Issued(uint256 indexed tokenId, bytes32 indexed eventKey, address to);
    event Reassigned(uint256 indexed tokenId, address from, address to, uint8 reason);
    event Released(uint256 indexed tokenId, uint8 reason);
    event Used(uint256 indexed tokenId);

    error EventExists(bytes32 eventKey);
    error UnknownEvent(bytes32 eventKey);
    error InvalidCapacity();
    error CapacityReached(bytes32 eventKey);
    error TicketUsed(uint256 tokenId);
    error InvalidReason(uint8 reason);
    error TransferNotAllowed();

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
