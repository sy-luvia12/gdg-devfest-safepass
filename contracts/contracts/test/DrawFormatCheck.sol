// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Test only, never deployed. Recomputes the lottery snapshot format (functions/src/lottery/draw.ts)
/// with Solidity's own abi.encode and OpenZeppelin's MerkleProof, so the off-chain format is checked against
/// an independent implementation.
contract DrawFormatCheck {
    function leaf(bytes32 eventKey, uint32 round, string calldata uid, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(eventKey, round, keccak256(bytes(uid)), salt));
    }

    function ticketsHash(uint256[] calldata tokenIds) external pure returns (bytes32) {
        return keccak256(abi.encode(tokenIds));
    }

    function commitment(bytes32 eventKey, uint32 round, bytes32 root, bytes32 tickets) external pure returns (bytes32) {
        return keccak256(abi.encode(eventKey, round, root, tickets));
    }

    function score(bytes32 seed, bytes32 entryLeaf) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, entryLeaf)));
    }

    function included(bytes32[] calldata proof, bytes32 root, bytes32 entryLeaf) external pure returns (bool) {
        return MerkleProof.verifyCalldata(proof, root, entryLeaf);
    }
}
