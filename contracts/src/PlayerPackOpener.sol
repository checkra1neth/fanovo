// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {PlayerHook} from "./PlayerHook.sol";
import {PlayerToken} from "./PlayerToken.sol";
import {PlayerFactory} from "./PlayerFactory.sol";

/// @title PlayerPackOpener
/// @notice Opens player packs using commit-reveal scheme (no VRF)
/// @dev Two-step process: commit → wait DELAY_BLOCKS → reveal
///      Randomness derived from blockhash(revealBlock) which is unpredictable at commit time
contract PlayerPackOpener is ReentrancyGuard {

    uint256 public constant PACK_PRICE = 1e18;
    uint8 public constant MIN_PACK_SIZE = 1;
    uint8 public constant MAX_PACK_SIZE = 100;
    uint8 public constant DELAY_BLOCKS = 10;
    uint8 public constant MAX_REROLL_ATTEMPTS = 48;
    uint256 public constant CLAIM_TIMEOUT = 24 hours;

    PlayerHook public immutable hook;
    PlayerFactory public immutable factory;

    struct Commit {
        uint8 countryIndex;
        uint8 count;
        uint256 revealBlock;
        uint256 timestamp;
        bool revealed;
        bool exists;
    }

    mapping(address => mapping(uint8 => Commit)) public commits;
    mapping(address => mapping(uint8 => uint256)) public packsOpenedBy;
    mapping(uint8 => uint16) public committedPacksByCountry;
    uint256 private _nonce;

    event PlayerPackCommitted(
        address indexed user,
        uint8 indexed countryIndex,
        uint8 count,
        uint256 revealBlock
    );
    event PlayerPackRevealed(
        address indexed user,
        address indexed player,
        uint8 countryIndex,
        uint8 role
    );
    event PlayerPacksClaimed(address indexed user, uint8 count, uint8 indexed countryIndex);
    event CommitRecovered(address indexed user, uint8 indexed countryIndex, uint8 count);

    error InvalidSize();
    error InvalidCountryIndex();
    error CountryCapReached();
    error CommitNotFound();
    error AlreadyCommitted();
    error TooEarly();
    error AlreadyRevealed();
    error NoMintableRole();
    error TransferFailed();
    error PlayerOpenerZeroAddress();
    error TimeoutNotReached();

    constructor(PlayerHook hook_, PlayerFactory factory_) {
        if (address(hook_) == address(0) || address(factory_) == address(0)) revert PlayerOpenerZeroAddress();
        hook = hook_;
        factory = factory_;
    }

    /// @notice Commit to opening player packs for a country
    /// @dev User transfers CountryTokens and waits DELAY_BLOCKS before revealing
    function commitPlayerPacks(uint8 countryIndex, uint8 count) external nonReentrant {
        if (commits[msg.sender][countryIndex].exists) revert AlreadyCommitted();
        if (count < MIN_PACK_SIZE || count > MAX_PACK_SIZE) {
            revert InvalidSize();
        }
        if (countryIndex >= 48) revert InvalidCountryIndex();

        uint16 newCommitted = committedPacksByCountry[countryIndex] + count;
        if (newCommitted > 450) revert CountryCapReached();
        committedPacksByCountry[countryIndex] = newCommitted;

        // Get country token from hook
        address countryToken = _getCountryToken(countryIndex);

        packsOpenedBy[msg.sender][countryIndex] += count;

        // Transfer country tokens from user
        bool success = IERC20(countryToken).transferFrom(
            msg.sender,
            address(this),
            uint256(count) * PACK_PRICE
        );
        if (!success) revert TransferFailed();

        // Approve hook to spend country tokens
        IERC20(countryToken).approve(address(hook), uint256(count) * PACK_PRICE);

        uint256 revealBlock = block.number + DELAY_BLOCKS;
        commits[msg.sender][countryIndex] = Commit({
            countryIndex: countryIndex,
            count: count,
            revealBlock: revealBlock,
            timestamp: block.timestamp,
            revealed: false,
            exists: true
        });

        emit PlayerPackCommitted(msg.sender, countryIndex, count, revealBlock);
    }

    /// @notice Reveal committed packs and mint random players
    /// @dev Can only be called after revealBlock has passed.
    ///      Clears the commit slot on success so the user may commit again for this country.
    function revealPlayerPacks(uint8 countryIndex) external nonReentrant {
        Commit memory comm = commits[msg.sender][countryIndex];
        if (!comm.exists) revert CommitNotFound();
        if (comm.revealed) revert AlreadyRevealed();
        if (block.number < comm.revealBlock) revert TooEarly();

        // Clear commit slot — user can commit again for this country after reveal
        delete commits[msg.sender][countryIndex];

        uint8 count = comm.count;

        // Generate randomness from blockhash at revealBlock
        // If revealBlock is too old (256+ blocks ago), use current blockhash
        bytes32 blockHash;
        if (block.number - comm.revealBlock < 256) {
            blockHash = blockhash(comm.revealBlock);
        } else {
            blockHash = blockhash(block.number - 1);
        }

        bytes32 entropy = blockHash;
        if (entropy == bytes32(0)) {
            entropy = keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce++));
        }
        uint256 seed = uint256(keccak256(abi.encodePacked(
            entropy,
            msg.sender,
            _nonce++,
            countryIndex
        )));

        for (uint8 i = 0; i < count; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address player = _pickRole(countryIndex, r);
            hook.packMint(msg.sender, player);
            emit PlayerPackRevealed(msg.sender, player, countryIndex, PlayerToken(player).role());
        }

        emit PlayerPacksClaimed(msg.sender, count, countryIndex);
    }

    /// @notice Recover a stuck commit after timeout
    function recoverStuckCommit(uint8 countryIndex) external nonReentrant {
        Commit storage comm = commits[msg.sender][countryIndex];
        if (!comm.exists) revert CommitNotFound();
        if (comm.revealed) revert AlreadyRevealed();
        if (block.timestamp < comm.timestamp + CLAIM_TIMEOUT) {
            revert TimeoutNotReached();
        }

        uint8 count = comm.count;
        delete commits[msg.sender][countryIndex];
        packsOpenedBy[msg.sender][countryIndex] -= count;
        committedPacksByCountry[countryIndex] -= count;

        address countryToken = _getCountryToken(countryIndex);
        bool success = IERC20(countryToken).transfer(
            msg.sender,
            uint256(count) * PACK_PRICE
        );
        if (!success) revert TransferFailed();

        emit CommitRecovered(msg.sender, countryIndex, count);
    }

    /// @notice Pick a random player role, rerolling if cap reached
    function _pickRole(uint8 countryIndex, uint256 seed) internal view returns (address) {
        uint256 r = seed;
        for (uint8 attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt++) {
            uint8 role = uint8(r % 3);
            address player = _getPlayerByRole(countryIndex, role);
            if (player != address(0) && _canPackMint(player)) {
                return player;
            }
            r = uint256(keccak256(abi.encode(r, attempt)));
        }
        revert NoMintableRole();
    }

    /// @notice Check if a player can still receive pack mints
    function _canPackMint(address player) internal view returns (bool) {
        (uint128 realCountry, uint128 circulating) = hook.getPlayerReserves(player);
        uint8 role = PlayerToken(player).role();
        uint16 limit = hook.roleCap(role);
        uint16 packsMinted = uint16(circulating / 1e18);
        return packsMinted < limit;
    }

    /// @notice Get player address by country and role via factory
    function _getPlayerByRole(uint8 countryIndex, uint8 role) internal view returns (address) {
        return address(factory.byCountry(countryIndex, role));
    }

    /// @notice Get country token address via factory
    function _getCountryToken(uint8 countryIndex) internal view returns (address) {
        address player = address(factory.byCountry(countryIndex, 0));
        if (player != address(0)) {
            return PlayerToken(player).country();
        }
        return address(0);
    }

    /// @notice View function: packs remaining for a country
    function packsRemainingForCountry(uint8 countryIndex) external view returns (uint16) {
        return 450 - committedPacksByCountry[countryIndex];
    }

    /// @notice View function: total packs opened by user for a country
    function packsOpenedByUser(address user, uint8 countryIndex) external view returns (uint256) {
        return packsOpenedBy[user][countryIndex];
    }

    /// @notice View function: check if user has a pending commit
    function hasPendingCommit(address user, uint8 countryIndex) external view returns (bool) {
        Commit storage comm = commits[user][countryIndex];
        return comm.exists && !comm.revealed;
    }

    /// @notice View function: get commit details
    function getCommit(address user, uint8 countryIndex) external view returns (
        uint8 count,
        uint256 revealBlock,
        uint256 timestamp,
        bool revealed,
        bool exists
    ) {
        Commit storage comm = commits[user][countryIndex];
        return (comm.count, comm.revealBlock, comm.timestamp, comm.revealed, comm.exists);
    }
}
