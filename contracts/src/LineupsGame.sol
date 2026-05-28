// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FanovoToken} from "./FanovoToken.sol";
import {PlayerHook} from "./PlayerHook.sol";
import {PlayerToken} from "./PlayerToken.sol";
import {Pausable} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/Pausable.sol";
import {SafeCast} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/math/SafeCast.sol";

/// @title LineupsGame
/// @notice Fantasy-style prediction game where users lock FANOVO, pick players, and compete for pool
/// @dev Each round: users lock FANOVO + pick 3 player tokens (Captain 2x, Best 1x, Rookie 1x)
///      Score = sum of player price changes during round window. Captain gets 2x multiplier.
///      Pool is split pro-rata among top scorers after settlement.
contract LineupsGame is Pausable {
    using SafeCast for uint256;

    // ─── Types ───────────────────────────────────────────────────────────────────

    struct Lineup {
        address captainPlayer;
        address bestPlayer;
        address rookiePlayer;
        bool entered;
        bool claimed;
        uint256 score;
    }

    struct Round {
        string name;
        uint256 entryFee;           // FANOVO to lock per entry
        uint256 startTime;          // When scoring starts
        uint256 endTime;            // When scoring ends
        uint256 lockTime;           // Deadline to submit lineup
        uint256 pool;               // Total FANOVO in pool
        uint256 entries;            // Number of entries
        bool settled;               // Whether scores are finalized
        bool active;                // Whether round is accepting entries
        uint256 totalScore;         // Sum of all scores (for pro-rata)
        uint256 settledCount;       // How many entrants scored (for batch settlement)
    }

    // ─── State ───────────────────────────────────────────────────────────────────

    address public immutable owner;
    FanovoToken public immutable fanovo;
    PlayerHook public immutable playerHook;

    Round[] public rounds;
    // roundId => user => Lineup
    mapping(uint256 => mapping(address => Lineup)) public lineups;
    // roundId => user list (for iteration during settlement)
    mapping(uint256 => address[]) public roundEntrants;

    // Snapshot prices at round start/end for scoring
    // roundId => playerAddress => startPrice
    mapping(uint256 => mapping(address => uint256)) public startPrices;
    mapping(uint256 => mapping(address => uint256)) public endPrices;

    uint256 private _locked = 1;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event RoundCreated(uint256 indexed roundId, string name, uint256 entryFee, uint256 lockTime, uint256 startTime, uint256 endTime);
    event LineupSubmitted(uint256 indexed roundId, address indexed user);
    event RoundSettled(uint256 indexed roundId, uint256 totalScore, uint256 pool);
    event RewardClaimed(uint256 indexed roundId, address indexed user, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error OnlyOwner();
    error Reentrancy();
    error RoundNotActive();
    error RoundNotSettled();
    error AlreadyEntered();
    error AlreadyClaimed();
    error LockTimeExpired();
    error InvalidRound();
    error NoScore();
    error ZeroAddress();
    error InvalidPlayer();
    error DuplicatePlayer();
    error WrongRole();
    error MixedCountries();
    error RoundAlreadyStarted();

    // ─── Modifiers ───────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────────

    constructor(FanovoToken _fanovo, PlayerHook _playerHook) {
        owner = msg.sender;
        fanovo = _fanovo;
        playerHook = _playerHook;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────────

    /// @notice Create a new round
    function createRound(
        string calldata name,
        uint256 entryFee,
        uint256 lockTime,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner returns (uint256 roundId) {
        roundId = rounds.length;
        rounds.push(Round({
            name: name,
            entryFee: entryFee,
            startTime: startTime,
            endTime: endTime,
            lockTime: lockTime,
            pool: 0,
            entries: 0,
            settled: false,
            active: true,
            totalScore: 0,
            settledCount: 0
        }));
        emit RoundCreated(roundId, name, entryFee, lockTime, startTime, endTime);
    }

    /// @notice Snapshot start prices for a round (called at round start)
    /// @param roundId The round to snapshot
    /// @param players Array of player token addresses to snapshot
    function snapshotStartPrices(uint256 roundId, address[] calldata players) external onlyOwner {
        if (roundId >= rounds.length) revert InvalidRound();
        for (uint256 i = 0; i < players.length; i++) {
            startPrices[roundId][players[i]] = playerHook.currentPrice(players[i]);
        }
    }

    /// @notice Snapshot end prices for a round (call before settleRoundBatch)
    function snapshotEndPrices(uint256 roundId, address[] calldata players) external onlyOwner {
        if (roundId >= rounds.length) revert InvalidRound();
        for (uint256 i = 0; i < players.length; i++) {
            endPrices[roundId][players[i]] = playerHook.currentPrice(players[i]);
        }
    }

    /// @notice Settle a round in batches — calculate scores for entrants
    /// @param roundId The round to settle
    /// @param batchSize Number of entrants to process in this call (0 = process all remaining)
    function settleRoundBatch(uint256 roundId, uint256 batchSize) external onlyOwner {
        if (roundId >= rounds.length) revert InvalidRound();
        Round storage round = rounds[roundId];
        if (round.settled) revert RoundNotActive();

        address[] storage entrants = roundEntrants[roundId];
        uint256 totalEntrants = entrants.length;
        uint256 start = round.settledCount;
        if (start >= totalEntrants) {
            // All done
            round.settled = true;
            round.active = false;
            emit RoundSettled(roundId, round.totalScore, round.pool);
            return;
        }

        uint256 end = batchSize == 0 ? totalEntrants : start + batchSize;
        if (end > totalEntrants) end = totalEntrants;

        uint256 totalScore = round.totalScore;
        for (uint256 i = start; i < end; i++) {
            address user = entrants[i];
            Lineup storage lineup = lineups[roundId][user];
            uint256 score = _calculateScore(roundId, lineup);
            lineup.score = score;
            totalScore += score;
        }

        round.totalScore = totalScore;
        round.settledCount = end;

        if (end >= totalEntrants) {
            round.settled = true;
            round.active = false;
            emit RoundSettled(roundId, totalScore, round.pool);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── User Actions ────────────────────────────────────────────────────────────

    /// @notice Submit a lineup for a round
    /// @param roundId The round to enter
    /// @param captainPlayer Address of captain player token (2x multiplier)
    /// @param bestPlayer Address of best player token (1x)
    /// @param rookiePlayer Address of rookie player token (1x)
    function submitLineup(
        uint256 roundId,
        address captainPlayer,
        address bestPlayer,
        address rookiePlayer
    ) external nonReentrant whenNotPaused {
        if (roundId >= rounds.length) revert InvalidRound();
        Round storage round = rounds[roundId];
        if (!round.active) revert RoundNotActive();
        if (block.timestamp > round.lockTime) revert LockTimeExpired();
        if (block.timestamp >= round.startTime) revert RoundAlreadyStarted();

        Lineup storage lineup = lineups[roundId][msg.sender];
        if (lineup.entered) revert AlreadyEntered();

        // Validate players
        if (captainPlayer == address(0) || bestPlayer == address(0) || rookiePlayer == address(0)) revert ZeroAddress();
        if (captainPlayer == bestPlayer || captainPlayer == rookiePlayer || bestPlayer == rookiePlayer) revert DuplicatePlayer();

        // Validate each is a registered PlayerToken with correct role
        if (PlayerToken(captainPlayer).hook() != address(playerHook)) revert InvalidPlayer();
        if (PlayerToken(bestPlayer).hook() != address(playerHook)) revert InvalidPlayer();
        if (PlayerToken(rookiePlayer).hook() != address(playerHook)) revert InvalidPlayer();

        if (PlayerToken(captainPlayer).role() != 0) revert WrongRole();
        if (PlayerToken(bestPlayer).role() != 1) revert WrongRole();
        if (PlayerToken(rookiePlayer).role() != 2) revert WrongRole();

        // Validate all from same country
        address country = PlayerToken(captainPlayer).country();
        if (PlayerToken(bestPlayer).country() != country) revert MixedCountries();
        if (PlayerToken(rookiePlayer).country() != country) revert MixedCountries();

        // Lock entry fee
        bool success = fanovo.transferFrom(msg.sender, address(this), round.entryFee);
        require(success, "Transfer failed");

        // Record lineup
        lineup.captainPlayer = captainPlayer;
        lineup.bestPlayer = bestPlayer;
        lineup.rookiePlayer = rookiePlayer;
        lineup.entered = true;

        round.pool += round.entryFee;
        round.entries++;
        roundEntrants[roundId].push(msg.sender);

        emit LineupSubmitted(roundId, msg.sender);
    }

    /// @notice Claim reward after round is settled
    function claimReward(uint256 roundId) external nonReentrant {
        if (roundId >= rounds.length) revert InvalidRound();
        Round storage round = rounds[roundId];
        if (!round.settled) revert RoundNotSettled();

        Lineup storage lineup = lineups[roundId][msg.sender];
        if (!lineup.entered) revert InvalidRound();
        if (lineup.claimed) revert AlreadyClaimed();
        if (lineup.score == 0) revert NoScore();

        lineup.claimed = true;

        // Pro-rata share of pool
        uint256 reward = (round.pool * lineup.score) / round.totalScore;

        bool success = fanovo.transfer(msg.sender, reward);
        require(success, "Transfer failed");

        emit RewardClaimed(roundId, msg.sender, reward);
    }

    /// @notice Sweep unclaimed rewards from a settled round to owner
    function sweepUnclaimed(uint256 roundId, address to) external onlyOwner {
        if (roundId >= rounds.length) revert InvalidRound();
        Round storage round = rounds[roundId];
        if (!round.settled) revert RoundNotSettled();
        if (to == address(0)) revert ZeroAddress();

        uint256 unclaimed = 0;
        address[] storage entrants = roundEntrants[roundId];
        for (uint256 i = 0; i < entrants.length; i++) {
            address user = entrants[i];
            Lineup storage lineup = lineups[roundId][user];
            if (lineup.entered && !lineup.claimed && lineup.score > 0) {
                uint256 reward = (round.pool * lineup.score) / round.totalScore;
                unclaimed += reward;
                lineup.claimed = true;
            }
        }

        if (unclaimed > 0) {
            bool success = fanovo.transfer(to, unclaimed);
            require(success, "Transfer failed");
        }
    }

    // ─── View Functions ──────────────────────────────────────────────────────────

    function getRoundCount() external view returns (uint256) {
        return rounds.length;
    }

    function getUserLineup(uint256 roundId, address user) external view returns (Lineup memory) {
        return lineups[roundId][user];
    }

    function getRoundEntrants(uint256 roundId) external view returns (uint256) {
        return roundEntrants[roundId].length;
    }

    function getUserReward(uint256 roundId, address user) external view returns (uint256) {
        Round storage round = rounds[roundId];
        if (!round.settled || round.totalScore == 0) return 0;
        Lineup storage lineup = lineups[roundId][user];
        if (!lineup.entered || lineup.score == 0) return 0;
        return (round.pool * lineup.score) / round.totalScore;
    }

    // ─── Internal ────────────────────────────────────────────────────────────────

    /// @dev Calculate score for a lineup based on price changes
    ///      Captain gets 2x multiplier, Best and Rookie get 1x
    ///      Negative changes count as 0 (floor at 0)
    function _calculateScore(uint256 roundId, Lineup storage lineup) internal view returns (uint256) {
        uint256 score = 0;

        // Captain (2x multiplier)
        uint256 captainStart = startPrices[roundId][lineup.captainPlayer];
        uint256 captainEnd = endPrices[roundId][lineup.captainPlayer];
        if (captainEnd > captainStart) {
            score += (captainEnd - captainStart) * 2;
        }

        // Best (1x)
        uint256 bestStart = startPrices[roundId][lineup.bestPlayer];
        uint256 bestEnd = endPrices[roundId][lineup.bestPlayer];
        if (bestEnd > bestStart) {
            score += (bestEnd - bestStart);
        }

        // Rookie (1x)
        uint256 rookieStart = startPrices[roundId][lineup.rookiePlayer];
        uint256 rookieEnd = endPrices[roundId][lineup.rookiePlayer];
        if (rookieEnd > rookieStart) {
            score += (rookieEnd - rookieStart);
        }

        return score;
    }
}
