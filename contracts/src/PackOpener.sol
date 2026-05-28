// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {WorldCupHook} from "./WorldCupHook.sol";
import {CountryFactory} from "./CountryFactory.sol";
import {CountryToken} from "./CountryToken.sol";

/// @title PackOpener
/// @notice Opens country packs using commit-reveal scheme (no VRF)
/// @dev Two-step process: commit → wait DELAY_BLOCKS → reveal
///      Randomness derived from blockhash(revealBlock) which is unpredictable at commit time
///      Supports batch opening from 1 to 100 packs per commit
contract PackOpener is ReentrancyGuard {

    uint256 public constant PACK_PRICE = 1e18;
    uint8 public constant MIN_PACK_SIZE = 1;
    uint8 public constant MAX_PACK_SIZE = 100;
    uint8 public constant DELAY_BLOCKS = 10;
    uint8 public constant MAX_REROLL_ATTEMPTS = 48;
    uint256 public constant CLAIM_TIMEOUT = 24 hours;
    uint256 public constant MAX_PACKS = 48_000;

    IERC20 public immutable fanovo;
    WorldCupHook public immutable hook;
    CountryFactory public immutable factory;

    uint256 public totalPacksOpened;
    mapping(address => uint256) public packsOpenedBy;

    struct Commit {
        uint8 count;
        uint256 revealBlock;
        uint256 timestamp;
        bool revealed;
        bool exists;
    }

    mapping(address => Commit) public commits;
    uint256 private _nonce;

    event PackCommitted(
        address indexed user,
        uint8 count,
        uint256 revealBlock
    );
    event PackRevealed(
        address indexed user,
        address indexed country,
        uint256 indexed packNum
    );
    event PacksClaimed(address indexed user, uint8 count);
    event CommitRecovered(address indexed user, uint8 count);
    event Phase2Triggered(uint256 timestamp);

    error InvalidSize();
    error PacksAlreadyClosed();
    error ExceedsMaxPacks();
    error CommitNotFound();
    error AlreadyCommitted();
    error TooEarly();
    error AlreadyRevealed();
    error NoMintableCountry();
    error TransferFailed();
    error TimeoutNotReached();
    error PackOpenerZeroAddress();

    constructor(
        IERC20 fanovo_,
        WorldCupHook hook_,
        CountryFactory factory_
    ) {
        if (
            address(fanovo_) == address(0)
                || address(hook_) == address(0)
                || address(factory_) == address(0)
        ) revert PackOpenerZeroAddress();

        fanovo = fanovo_;
        hook = hook_;
        factory = factory_;

        fanovo_.approve(address(hook_), type(uint256).max);
    }

    /// @notice Commit to opening packs
    /// @dev User transfers FANOVO and waits DELAY_BLOCKS before revealing
    /// @param count Number of packs to open (1-100)
    function commit(uint8 count) external nonReentrant {
        if (commits[msg.sender].exists) revert AlreadyCommitted();
        if (isClosed()) revert PacksAlreadyClosed();
        if (count < MIN_PACK_SIZE || count > MAX_PACK_SIZE) {
            revert InvalidSize();
        }

        uint256 newTotal = totalPacksOpened + count;
        if (newTotal > MAX_PACKS) revert ExceedsMaxPacks();

        totalPacksOpened = newTotal;
        packsOpenedBy[msg.sender] += count;

        bool success = fanovo.transferFrom(msg.sender, address(this), uint256(count) * PACK_PRICE);
        if (!success) revert TransferFailed();

        uint256 revealBlock = block.number + DELAY_BLOCKS;
        commits[msg.sender] = Commit({
            count: count,
            revealBlock: revealBlock,
            timestamp: block.timestamp,
            revealed: false,
            exists: true
        });

        emit PackCommitted(msg.sender, count, revealBlock);
    }

    /// @notice Reveal packs and mint country tokens
    /// @dev Must be called after DELAY_BLOCKS from commit.
    ///      Clears the commit slot on success so the user may commit again.
    function reveal() external nonReentrant {
        Commit memory c = commits[msg.sender];
        if (!c.exists) revert CommitNotFound();
        if (c.revealed) revert AlreadyRevealed();
        if (block.number < c.revealBlock) revert TooEarly();

        // Clear commit slot — user can open new packs after a successful reveal
        delete commits[msg.sender];

        uint8 count = c.count;
        uint256 numCountries = factory.countriesLength();

        // Use blockhash for randomness (unpredictable at commit time)
        bytes32 blockHash = blockhash(c.revealBlock);
        if (blockHash == bytes32(0)) {
            // If blockhash is not available (too old), use current block hash + nonce
            blockHash = keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce++));
        }

        for (uint8 i = 0; i < count; i++) {
            uint256 seed = uint256(keccak256(abi.encode(blockHash, msg.sender, i)));
            address country = _pickCountry(seed, numCountries);
            hook.packMint(msg.sender, country);
            emit PackRevealed(msg.sender, country, totalPacksOpened - count + i + 1);
        }

        emit PacksClaimed(msg.sender, count);

        if (totalPacksOpened >= MAX_PACKS && !hook.phase2Active()) {
            hook.activatePhase2();
            emit Phase2Triggered(block.timestamp);
        }
    }

    /// @notice Recover a stuck commit after timeout
    /// @dev Can be called after CLAIM_TIMEOUT if reveal was not executed
    function recoverStuckCommit() external nonReentrant {
        Commit memory c = commits[msg.sender];
        if (!c.exists) revert CommitNotFound();
        if (c.revealed) revert AlreadyRevealed();
        if (block.timestamp < c.timestamp + CLAIM_TIMEOUT) revert TimeoutNotReached();

        delete commits[msg.sender];
        totalPacksOpened -= c.count;
        packsOpenedBy[msg.sender] -= c.count;

        bool success = fanovo.transfer(msg.sender, uint256(c.count) * PACK_PRICE);
        if (!success) revert TransferFailed();

        emit CommitRecovered(msg.sender, c.count);
    }

    function _pickCountry(uint256 seed, uint256 numCountries)
        internal
        view
        returns (address)
    {
        uint256 r = seed;
        for (uint8 attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt++) {
            uint256 idx = r % numCountries;
            CountryToken token = factory.countries(idx);
            if (hook.canPackMint(address(token))) {
                return address(token);
            }
            r = uint256(keccak256(abi.encode(r, attempt)));
        }
        revert NoMintableCountry();
    }

    function packsRemaining() external view returns (uint256) {
        return MAX_PACKS - totalPacksOpened;
    }

    function isClosed() public view returns (bool) {
        return totalPacksOpened >= MAX_PACKS || hook.phase2Active();
    }
}
