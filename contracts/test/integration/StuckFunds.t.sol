// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {LineupsGame} from "../../src/LineupsGame.sol";
import {PredictionMarketHub} from "../../src/PredictionMarketHub.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @title StuckFunds — proof tests for the design risks 3a/3b.
/// @notice These tests DOCUMENT actual on-chain behavior. They assert what the
///         contracts do TODAY, including any funds that become unrecoverable.
///         If a future fix makes funds recoverable, these tests will flip and
///         must be updated — that's intentional (they pin current behavior).
contract StuckFundsIntegrationTest is IntegrationBase {
    LineupsGame internal game;
    PredictionMarketHub internal hub;
    address internal treasury = makeAddr("treasury");

    function setUp() public override {
        super.setUp();
        game = new LineupsGame(fanovo, playerHook);
        hub = new PredictionMarketHub(address(countryFactory), address(fanovo), address(this), treasury);
    }

    // ════════════════════════════════════════════════════════════════════════
    // RISK 3a: Lineups pool is stuck if ALL entrants score zero.
    //   claimReward reverts NoScore when score==0; sweepUnclaimed only sweeps
    //   score>0. So with an all-zero round, the entry fees can never leave.
    // ════════════════════════════════════════════════════════════════════════

    function test_Risk3a_LineupsPoolStuck_WhenAllScoresZero() public {
        uint8 countryIdx = 0;
        (PlayerToken captain, PlayerToken best, PlayerToken rookie) = playerFactory.playersOfCountry(countryIdx);

        uint256 entryFee = 10 ether;
        _fundFanovo(alice, entryFee);
        _fundFanovo(bob, entryFee);

        uint256 lockTime = block.timestamp + 1 hours;
        uint256 startTime = lockTime;
        uint256 endTime = startTime + 1 hours;
        uint256 roundId = game.createRound("Zero", entryFee, lockTime, startTime, endTime);

        // Two players enter -> pool = 2 * entryFee.
        vm.startPrank(alice);
        fanovo.approve(address(game), entryFee);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        vm.startPrank(bob);
        fanovo.approve(address(game), entryFee);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        uint256 pool = 2 * entryFee;
        assertEq(fanovo.balanceOf(address(game)), pool, "pool funded");

        // Snapshot start == end (no trading) -> every score is 0.
        address[] memory players = new address[](3);
        players[0] = address(captain);
        players[1] = address(best);
        players[2] = address(rookie);
        game.snapshotStartPrices(roundId, players);

        vm.warp(endTime + 1);
        game.snapshotEndPrices(roundId, players);
        game.settleRoundBatch(roundId, 0);

        // Scores are zero for everyone.
        assertEq(game.getUserLineup(roundId, alice).score, 0, "alice score 0");
        assertEq(game.getUserLineup(roundId, bob).score, 0, "bob score 0");

        // Nobody can claim (NoScore).
        vm.prank(alice);
        vm.expectRevert(LineupsGame.NoScore.selector);
        game.claimReward(roundId);

        // sweepUnclaimed only moves score>0 entries -> sweeps NOTHING here.
        game.sweepUnclaimed(roundId, address(this));

        // PROOF: the whole pool is still trapped in the contract.
        assertEq(fanovo.balanceOf(address(game)), pool, "RISK 3a CONFIRMED: pool is stuck");
    }

    // ════════════════════════════════════════════════════════════════════════
    // RISK 3b: Prediction pool's 80% winner share is stuck if NOBODY staked the
    //   winning side. Losers revert NotAWinner; there is no winner to claim.
    // ════════════════════════════════════════════════════════════════════════

    function test_Risk3b_PredictWinnerShareStuck_WhenNoWinners() public {
        uint8 idxA = 0;
        uint8 idxB = 1;
        CountryToken countryB = countryFactory.countries(idxB);

        // bob stakes B, alice stakes DRAW (FANOVO). NOBODY stakes A.
        _packMintCountry(bob, countryB, 100);
        _fundFanovo(alice, 100 ether);

        uint64 closes = uint64(block.timestamp + 1 days);
        uint256 matchId = hub.createMatch(idxA, idxB, closes, uint64(closes + 1 days), "A vs B");

        uint8 sideB = hub.SIDE_B();
        uint8 sideDraw = hub.SIDE_DRAW();

        vm.startPrank(bob);
        countryB.approve(address(hub), 20 ether);
        hub.stake(matchId, sideB, 20 ether);
        vm.stopPrank();

        vm.startPrank(alice);
        fanovo.approve(address(hub), 30 ether);
        hub.stake(matchId, sideDraw, 30 ether);
        vm.stopPrank();

        // Settle A_WINS — but nobody staked A.
        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(matchId, PredictionMarketHub.Outcome.A_WINS);

        // Loser pools: B (20 countryB) and DRAW (30 FANOVO).
        // settle() burned 5% + sent 15% to treasury of EACH loser pool.
        // The remaining 80% is reserved for A-winners — but there are none.
        uint256 expectedStuckB = 20 ether * 8000 / 10_000; // 16 countryB
        uint256 expectedStuckFanovo = 30 ether * 8000 / 10_000; // 24 FANOVO

        // Losers cannot claim.
        vm.prank(bob);
        vm.expectRevert(PredictionMarketHub.NotAWinner.selector);
        hub.claim(matchId);

        vm.prank(alice);
        vm.expectRevert(PredictionMarketHub.NotAWinner.selector);
        hub.claim(matchId);

        // PROOF: the 80% winner share of each loser pool is trapped in the hub.
        assertEq(countryB.balanceOf(address(hub)), expectedStuckB, "RISK 3b CONFIRMED: countryB winner-share stuck");
        assertEq(fanovo.balanceOf(address(hub)), expectedStuckFanovo, "RISK 3b CONFIRMED: FANOVO winner-share stuck");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTRAST: when there IS a winner, the same pool fully distributes (sanity).
    // ════════════════════════════════════════════════════════════════════════

    function test_Risk3b_Contrast_PoolClears_WhenWinnerExists() public {
        uint8 idxA = 0;
        uint8 idxB = 1;
        CountryToken countryA = countryFactory.countries(idxA);
        CountryToken countryB = countryFactory.countries(idxB);

        _packMintCountry(alice, countryA, 100);
        _packMintCountry(bob, countryB, 100);

        uint64 closes = uint64(block.timestamp + 1 days);
        uint256 matchId = hub.createMatch(idxA, idxB, closes, uint64(closes + 1 days), "A vs B");

        uint8 sideA = hub.SIDE_A();
        uint8 sideB = hub.SIDE_B();

        vm.startPrank(alice);
        countryA.approve(address(hub), 20 ether);
        hub.stake(matchId, sideA, 20 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        countryB.approve(address(hub), 20 ether);
        hub.stake(matchId, sideB, 20 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(matchId, PredictionMarketHub.Outcome.A_WINS);

        vm.prank(alice);
        hub.claim(matchId);

        // Sole winner reclaimed her A stake; the 80% loser share (countryB) is fully paid out.
        assertEq(countryB.balanceOf(address(hub)), 0, "all countryB winner-share distributed");
        assertEq(countryA.balanceOf(address(hub)), 0, "winner stake A fully returned");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _packMintCountry(address to, CountryToken c, uint256 count) internal {
        _fundFanovo(address(packOpener), count * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < count; i++) {
            wcHook.packMint(to, address(c));
        }
        vm.stopPrank();
    }
}
