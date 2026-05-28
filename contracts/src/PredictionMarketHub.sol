// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Pausable} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/Pausable.sol";

import {CountryFactory} from "./CountryFactory.sol";
import {CountryToken} from "./CountryToken.sol";

/// @title PredictionMarketHub
/// @notice Match staking market — users stake CountryTokens or FANOVO on match outcomes
contract PredictionMarketHub is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum Outcome { UNSET, A_WINS, B_WINS, DRAW, CANCELLED }

    uint8 public constant SIDE_A = 0;
    uint8 public constant SIDE_B = 1;
    uint8 public constant SIDE_DRAW = 2;

    struct MatchInfo {
        uint8 countryIndexA;
        uint8 countryIndexB;
        uint64 stakingClosesAt;
        uint64 settlementDeadline;
        Outcome outcome;
        uint128 totalA;
        uint128 totalB;
        uint128 totalD;
        bool settled;
        bool exists;
        string label;
    }

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint16 public constant FEE_BURN_BPS = 500;
    uint16 public constant FEE_TREASURY_BPS = 1500;
    uint16 public constant FEE_WINNERS_BPS = 8000;
    uint16 public constant BPS_DENOM = 10_000;

    uint64 public constant MIN_STAKE_WINDOW = 5 minutes;
    uint64 public constant MAX_STAKE_WINDOW = 90 days;
    uint64 public constant MIN_SETTLEMENT_DELAY = 5 minutes;
    uint64 public constant MAX_SETTLEMENT_DELAY = 14 days;

    CountryFactory public immutable countryFactory;
    IERC20 public immutable fanovo;

    address public treasury;

    mapping(uint256 => MatchInfo) public matches;
    mapping(uint256 => mapping(address => uint128)) public stakesA;
    mapping(uint256 => mapping(address => uint128)) public stakesB;
    mapping(uint256 => mapping(address => uint128)) public stakesD;
    mapping(uint256 => mapping(address => bool)) public claimed;

    uint256 public nextMatchId;

    event MatchCreated(
        uint256 indexed matchId,
        uint8 indexed countryIndexA,
        uint8 indexed countryIndexB,
        uint64 stakingClosesAt,
        uint64 settlementDeadline,
        string label
    );
    event Staked(uint256 indexed matchId, address indexed user, uint8 side, uint256 amount);
    event MatchSettled(
        uint256 indexed matchId,
        Outcome outcome,
        uint256 totalA,
        uint256 totalB,
        uint256 totalD
    );
    event FeesDistributed(
        uint256 indexed matchId,
        address indexed loserToken,
        uint256 burned,
        uint256 treasuryShare
    );
    event Claimed(
        uint256 indexed matchId,
        address indexed user,
        uint256 stakeReturned,
        address prizeToken1,
        uint256 prizeAmount1,
        address prizeToken2,
        uint256 prizeAmount2
    );
    event TreasuryUpdated(address indexed previous, address indexed next);

    error MatchNotFound();
    error StakingClosed();
    error StakingOpen();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();
    error NotAWinner();
    error InvalidSide();
    error ZeroAmount();
    error SameCountry();
    error InvalidCountryIndex();
    error InvalidOutcome();
    error InvalidWindow();
    error ZeroAddress();

    constructor(
        address countryFactory_,
        address fanovo_,
        address initialOwner,
        address treasury_
    ) Ownable(initialOwner) {
        if (countryFactory_ == address(0)) revert ZeroAddress();
        if (fanovo_ == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();
        if (treasury_ == address(0)) revert ZeroAddress();
        countryFactory = CountryFactory(countryFactory_);
        fanovo = IERC20(fanovo_);
        treasury = treasury_;
        emit TreasuryUpdated(address(0), treasury_);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address prev = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(prev, newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function createMatch(
        uint8 countryIndexA,
        uint8 countryIndexB,
        uint64 stakingClosesAt,
        uint64 settlementDeadline,
        string calldata label
    ) public onlyOwner returns (uint256 matchId) {
        if (countryIndexA == countryIndexB) revert SameCountry();
        if (countryIndexA >= 48 || countryIndexB >= 48) revert InvalidCountryIndex();
        if (stakingClosesAt <= block.timestamp + MIN_STAKE_WINDOW) revert InvalidWindow();
        if (stakingClosesAt > block.timestamp + MAX_STAKE_WINDOW) revert InvalidWindow();
        if (settlementDeadline < stakingClosesAt + MIN_SETTLEMENT_DELAY) revert InvalidWindow();
        if (settlementDeadline > stakingClosesAt + MAX_SETTLEMENT_DELAY) revert InvalidWindow();

        matchId = nextMatchId++;
        matches[matchId] = MatchInfo({
            countryIndexA: countryIndexA,
            countryIndexB: countryIndexB,
            stakingClosesAt: stakingClosesAt,
            settlementDeadline: settlementDeadline,
            outcome: Outcome.UNSET,
            totalA: 0,
            totalB: 0,
            totalD: 0,
            settled: false,
            exists: true,
            label: label
        });

        emit MatchCreated(
            matchId,
            countryIndexA,
            countryIndexB,
            stakingClosesAt,
            settlementDeadline,
            label
        );
    }

    struct NewMatch {
        uint8 countryIndexA;
        uint8 countryIndexB;
        uint64 stakingClosesAt;
        uint64 settlementDeadline;
        string label;
    }

    function createMatches(NewMatch[] calldata newMatches) external onlyOwner {
        uint256 n = newMatches.length;
        for (uint256 i = 0; i < n; i++) {
            createMatch(
                newMatches[i].countryIndexA,
                newMatches[i].countryIndexB,
                newMatches[i].stakingClosesAt,
                newMatches[i].settlementDeadline,
                newMatches[i].label
            );
        }
    }

    function stake(uint256 matchId, uint8 side, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        MatchInfo storage m = matches[matchId];
        if (!m.exists) revert MatchNotFound();
        if (m.settled) revert AlreadySettled();
        if (block.timestamp >= m.stakingClosesAt) revert StakingClosed();
        if (amount == 0) revert ZeroAmount();
        if (side > SIDE_DRAW) revert InvalidSide();

        if (side == SIDE_A) {
            CountryToken country = countryFactory.countries(m.countryIndexA);
            IERC20(address(country)).safeTransferFrom(msg.sender, address(this), amount);
            stakesA[matchId][msg.sender] += uint128(amount);
            m.totalA += uint128(amount);
        } else if (side == SIDE_B) {
            CountryToken country = countryFactory.countries(m.countryIndexB);
            IERC20(address(country)).safeTransferFrom(msg.sender, address(this), amount);
            stakesB[matchId][msg.sender] += uint128(amount);
            m.totalB += uint128(amount);
        } else {
            fanovo.safeTransferFrom(msg.sender, address(this), amount);
            stakesD[matchId][msg.sender] += uint128(amount);
            m.totalD += uint128(amount);
        }

        emit Staked(matchId, msg.sender, side, amount);
    }

    function settle(uint256 matchId, Outcome outcome) external onlyOwner nonReentrant {
        MatchInfo storage m = matches[matchId];
        if (!m.exists) revert MatchNotFound();
        if (m.settled) revert AlreadySettled();
        if (block.timestamp < m.stakingClosesAt) revert StakingOpen();
        if (outcome == Outcome.UNSET) revert InvalidOutcome();

        m.outcome = outcome;
        m.settled = true;

        emit MatchSettled(
            matchId,
            outcome,
            uint256(m.totalA),
            uint256(m.totalB),
            uint256(m.totalD)
        );

        if (outcome == Outcome.CANCELLED) return;

        if (outcome == Outcome.A_WINS) {
            _distributeFeesFromPool(matchId, _tokenForCountryIndex(m.countryIndexB), uint256(m.totalB));
            _distributeFeesFromPool(matchId, address(fanovo), uint256(m.totalD));
        } else if (outcome == Outcome.B_WINS) {
            _distributeFeesFromPool(matchId, _tokenForCountryIndex(m.countryIndexA), uint256(m.totalA));
            _distributeFeesFromPool(matchId, address(fanovo), uint256(m.totalD));
        } else if (outcome == Outcome.DRAW) {
            _distributeFeesFromPool(matchId, _tokenForCountryIndex(m.countryIndexA), uint256(m.totalA));
            _distributeFeesFromPool(matchId, _tokenForCountryIndex(m.countryIndexB), uint256(m.totalB));
        }
    }

    function _tokenForCountryIndex(uint8 countryIndex) internal view returns (address) {
        return address(countryFactory.countries(countryIndex));
    }

    function _distributeFeesFromPool(uint256 matchId, address token, uint256 loserPool) internal {
        if (loserPool == 0) return;

        uint256 burnAmount = (loserPool * FEE_BURN_BPS) / BPS_DENOM;
        uint256 treasuryAmount = (loserPool * FEE_TREASURY_BPS) / BPS_DENOM;

        if (burnAmount > 0) {
            IERC20(token).safeTransfer(DEAD_ADDRESS, burnAmount);
        }
        if (treasuryAmount > 0) {
            IERC20(token).safeTransfer(treasury, treasuryAmount);
        }

        emit FeesDistributed(matchId, token, burnAmount, treasuryAmount);
    }

    function claim(uint256 matchId) external nonReentrant {
        MatchInfo storage m = matches[matchId];
        if (!m.exists) revert MatchNotFound();
        if (!m.settled) revert NotSettled();
        if (claimed[matchId][msg.sender]) revert AlreadyClaimed();
        claimed[matchId][msg.sender] = true;

        if (m.outcome == Outcome.CANCELLED) {
            _refund(matchId, m.countryIndexA, m.countryIndexB);
        } else {
            _payout(matchId, m);
        }
    }

    function _refund(uint256 matchId, uint8 idxA, uint8 idxB) internal {
        uint256 sA = stakesA[matchId][msg.sender];
        uint256 sB = stakesB[matchId][msg.sender];
        uint256 sD = stakesD[matchId][msg.sender];
        if (sA == 0 && sB == 0 && sD == 0) revert NotAWinner();

        if (sA > 0) IERC20(_tokenForCountryIndex(idxA)).safeTransfer(msg.sender, sA);
        if (sB > 0) IERC20(_tokenForCountryIndex(idxB)).safeTransfer(msg.sender, sB);
        if (sD > 0) fanovo.safeTransfer(msg.sender, sD);

        emit Claimed(matchId, msg.sender, sA + sB + sD, address(0), 0, address(0), 0);
    }

    function _payout(uint256 matchId, MatchInfo storage m) internal {
        uint256 winnerStake;
        uint256 totalWinner;
        address winnerToken;

        if (m.outcome == Outcome.A_WINS) {
            winnerStake = stakesA[matchId][msg.sender];
            totalWinner = uint256(m.totalA);
            winnerToken = _tokenForCountryIndex(m.countryIndexA);
        } else if (m.outcome == Outcome.B_WINS) {
            winnerStake = stakesB[matchId][msg.sender];
            totalWinner = uint256(m.totalB);
            winnerToken = _tokenForCountryIndex(m.countryIndexB);
        } else {
            winnerStake = stakesD[matchId][msg.sender];
            totalWinner = uint256(m.totalD);
            winnerToken = address(fanovo);
        }

        if (winnerStake == 0) revert NotAWinner();

        IERC20(winnerToken).safeTransfer(msg.sender, winnerStake);

        _payLoserShare(matchId, m, winnerStake, totalWinner);
    }

    function _payLoserShare(
        uint256 matchId,
        MatchInfo storage m,
        uint256 winnerStake,
        uint256 totalWinner
    ) internal {
        (address t1, uint256 p1, address t2, uint256 p2) = _loserPools(m);

        uint256 prize1 = _computeShare(p1, winnerStake, totalWinner);
        uint256 prize2 = _computeShare(p2, winnerStake, totalWinner);

        if (prize1 > 0) IERC20(t1).safeTransfer(msg.sender, prize1);
        if (prize2 > 0) IERC20(t2).safeTransfer(msg.sender, prize2);

        emit Claimed(matchId, msg.sender, winnerStake, t1, prize1, t2, prize2);
    }

    function _computeShare(uint256 loserPool, uint256 winnerStake, uint256 totalWinnerSide)
        internal
        pure
        returns (uint256)
    {
        if (loserPool == 0 || totalWinnerSide == 0) return 0;
        uint256 winnersPool = (loserPool * FEE_WINNERS_BPS) / BPS_DENOM;
        return (winnersPool * winnerStake) / totalWinnerSide;
    }

    function cancelMatch(uint256 matchId) external onlyOwner nonReentrant {
        MatchInfo storage m = matches[matchId];
        if (!m.exists) revert MatchNotFound();
        if (m.settled) revert AlreadySettled();

        m.outcome = Outcome.CANCELLED;
        m.settled = true;

        emit MatchSettled(
            matchId,
            Outcome.CANCELLED,
            uint256(m.totalA),
            uint256(m.totalB),
            uint256(m.totalD)
        );
    }

    function getMatch(uint256 matchId)
        external
        view
        returns (MatchInfo memory)
    {
        MatchInfo storage m = matches[matchId];
        if (!m.exists) revert MatchNotFound();
        return m;
    }

    function userStakes(uint256 matchId, address user)
        external
        view
        returns (uint256 a, uint256 b, uint256 d, bool hasClaimed)
    {
        a = stakesA[matchId][user];
        b = stakesB[matchId][user];
        d = stakesD[matchId][user];
        hasClaimed = claimed[matchId][user];
    }

    function quoteWinnings(uint256 matchId, address user)
        external
        view
        returns (
            uint256 stakeReturn,
            address prizeToken1,
            uint256 prizeAmount1,
            address prizeToken2,
            uint256 prizeAmount2
        )
    {
        MatchInfo storage m = matches[matchId];
        if (!m.exists || !m.settled) return (0, address(0), 0, address(0), 0);
        if (claimed[matchId][user]) return (0, address(0), 0, address(0), 0);

        if (m.outcome == Outcome.CANCELLED) {
            uint256 refund = stakesA[matchId][user]
                + stakesB[matchId][user]
                + stakesD[matchId][user];
            return (refund, address(0), 0, address(0), 0);
        }

        (uint256 winnerStake, uint256 totalWinner) = _winnerStakeAndTotal(matchId, m, user);
        if (winnerStake == 0) return (0, address(0), 0, address(0), 0);

        (address t1, uint256 p1, address t2, uint256 p2) = _loserPools(m);
        return (
            winnerStake,
            t1,
            _computeShare(p1, winnerStake, totalWinner),
            t2,
            _computeShare(p2, winnerStake, totalWinner)
        );
    }

    function _winnerStakeAndTotal(uint256 matchId, MatchInfo storage m, address user)
        internal
        view
        returns (uint256 winnerStake, uint256 totalWinner)
    {
        if (m.outcome == Outcome.A_WINS) {
            return (stakesA[matchId][user], uint256(m.totalA));
        } else if (m.outcome == Outcome.B_WINS) {
            return (stakesB[matchId][user], uint256(m.totalB));
        } else {
            return (stakesD[matchId][user], uint256(m.totalD));
        }
    }

    function _loserPools(MatchInfo storage m)
        internal
        view
        returns (address t1, uint256 p1, address t2, uint256 p2)
    {
        if (m.outcome == Outcome.A_WINS) {
            t1 = _tokenForCountryIndex(m.countryIndexB);
            p1 = uint256(m.totalB);
            t2 = address(fanovo);
            p2 = uint256(m.totalD);
        } else if (m.outcome == Outcome.B_WINS) {
            t1 = _tokenForCountryIndex(m.countryIndexA);
            p1 = uint256(m.totalA);
            t2 = address(fanovo);
            p2 = uint256(m.totalD);
        } else {
            t1 = _tokenForCountryIndex(m.countryIndexA);
            p1 = uint256(m.totalA);
            t2 = _tokenForCountryIndex(m.countryIndexB);
            p2 = uint256(m.totalB);
        }
    }
}
