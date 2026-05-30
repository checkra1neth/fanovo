// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {LineupsGame} from "../../src/LineupsGame.sol";
import {PredictionMarketHub} from "../../src/PredictionMarketHub.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @title MultiWinner — pool distribution among MULTIPLE winners (the real-world case).
/// @notice Verifies pro-rata math for prediction market and lineups game with
///         several winners, asserting exact amounts (not just > 0).
contract MultiWinnerIntegrationTest is IntegrationBase {
    PredictionMarketHub internal hub;
    LineupsGame internal game;
    address internal treasury = makeAddr("treasury");

    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    function setUp() public override {
        super.setUp();
        hub = new PredictionMarketHub(address(countryFactory), address(fanovo), address(this), treasury);
        game = new LineupsGame(fanovo, playerHook);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PREDICTION MARKET — two winners on side A split the loser pool pro-rata.
    // ════════════════════════════════════════════════════════════════════════

    function test_Predict_TwoWinners_SplitLoserPoolProRata() public {
        uint8 idxA = 0;
        uint8 idxB = 1;
        CountryToken countryA = countryFactory.countries(idxA);
        CountryToken countryB = countryFactory.countries(idxB);

        // Winners on A: alice (30), bob (10)  -> totalA = 40
        // Loser on B: carol (50)              -> totalB = 50
        _packMintCountry(alice, countryA, 100);
        _packMintCountry(bob, countryA, 100);
        _packMintCountry(carol, countryB, 100);

        uint64 closes = uint64(block.timestamp + 1 days);
        uint256 matchId = hub.createMatch(idxA, idxB, closes, uint64(closes + 1 days), "A vs B");

        uint8 sideA = hub.SIDE_A();
        uint8 sideB = hub.SIDE_B();

        _stake(alice, countryA, matchId, sideA, 30 ether);
        _stake(bob, countryA, matchId, sideA, 10 ether);
        _stake(carol, countryB, matchId, sideB, 50 ether);

        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(matchId, PredictionMarketHub.Outcome.A_WINS);

        // Loser pool B = 50. Winners' share = 80% = 40 countryB.
        uint256 winnersPoolB = 50 ether * 8000 / 10_000; // 40
        uint256 totalA = 40 ether;

        // Expected payouts (countryB) pro-rata to A-stake:
        uint256 aliceShare = winnersPoolB * 30 ether / totalA; // 30 countryB
        uint256 bobShare = winnersPoolB * 10 ether / totalA; // 10 countryB

        // alice claims: gets her 30 A back + aliceShare of B.
        uint256 aliceAbefore = countryA.balanceOf(alice);
        uint256 aliceBbefore = countryB.balanceOf(alice);
        vm.prank(alice);
        hub.claim(matchId);
        assertEq(countryA.balanceOf(alice) - aliceAbefore, 30 ether, "alice A stake returned");
        assertEq(countryB.balanceOf(alice) - aliceBbefore, aliceShare, "alice B share pro-rata");

        // bob claims: gets his 10 A back + bobShare of B.
        uint256 bobAbefore = countryA.balanceOf(bob);
        uint256 bobBbefore = countryB.balanceOf(bob);
        vm.prank(bob);
        hub.claim(matchId);
        assertEq(countryA.balanceOf(bob) - bobAbefore, 10 ether, "bob A stake returned");
        assertEq(countryB.balanceOf(bob) - bobBbefore, bobShare, "bob B share pro-rata");

        // alice got 3x bob's winnings (staked 3x more).
        assertEq(aliceShare, bobShare * 3, "alice won 3x bob");

        // After both winners claimed, only treasury/burn remainder logic leaves
        // the hub holding ~0 of the winner share (dust from integer division).
        assertLe(countryB.balanceOf(address(hub)), 2, "winner pool fully distributed (<=dust)");
    }

    function test_Predict_quoteWinnings_MatchesActualClaim() public {
        uint8 idxA = 0;
        uint8 idxB = 1;
        CountryToken countryA = countryFactory.countries(idxA);
        CountryToken countryB = countryFactory.countries(idxB);

        _packMintCountry(alice, countryA, 100);
        _packMintCountry(bob, countryA, 100);
        _packMintCountry(carol, countryB, 100);

        uint64 closes = uint64(block.timestamp + 1 days);
        uint256 matchId = hub.createMatch(idxA, idxB, closes, uint64(closes + 1 days), "A vs B");

        _stake(alice, countryA, matchId, hub.SIDE_A(), 25 ether);
        _stake(bob, countryA, matchId, hub.SIDE_A(), 15 ether);
        _stake(carol, countryB, matchId, hub.SIDE_B(), 60 ether);

        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(matchId, PredictionMarketHub.Outcome.A_WINS);

        // quoteWinnings must equal what alice actually receives.
        (uint256 stakeRet,, uint256 prize1,,) = hub.quoteWinnings(matchId, alice);

        uint256 aBefore = countryA.balanceOf(alice);
        uint256 bBefore = countryB.balanceOf(alice);
        vm.prank(alice);
        hub.claim(matchId);

        assertEq(countryA.balanceOf(alice) - aBefore, stakeRet, "quote stake == actual");
        assertEq(countryB.balanceOf(alice) - bBefore, prize1, "quote prize == actual");
    }

    // ════════════════════════════════════════════════════════════════════════
    // LINEUPS — multiple entrants split the pool pro-rata to score (captain 2x).
    // ════════════════════════════════════════════════════════════════════════

    function test_Lineups_TwoEntrants_SplitPoolProRataToScore() public {
        uint8 countryIdx = 0;
        CountryToken country = countryFactory.countries(countryIdx);
        (PlayerToken captain, PlayerToken best, PlayerToken rookie) = playerFactory.playersOfCountry(countryIdx);

        // Activate player trading for country 0.
        _seedCountryTokens(address(playerPackOpener), 1_500 ether);
        _seedCountryTokens(bob, 3_000 ether);
        _openAllPlayerPacks(country, captain, best, rookie);

        uint256 entryFee = 10 ether;
        _fundFanovo(alice, entryFee);
        _fundFanovo(carol, entryFee);

        uint256 lockTime = block.timestamp + 1 hours;
        uint256 startTime = lockTime;
        uint256 endTime = startTime + 1 hours;
        uint256 roundId = game.createRound("Multi", entryFee, lockTime, startTime, endTime);

        // Both alice and carol pick the SAME lineup -> identical scores -> 50/50 split.
        vm.startPrank(alice);
        fanovo.approve(address(game), entryFee);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        vm.startPrank(carol);
        fanovo.approve(address(game), entryFee);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        uint256 pool = 2 * entryFee;

        // Snapshot start, then move all 3 players' prices up via trading.
        address[] memory players = new address[](3);
        players[0] = address(captain);
        players[1] = address(best);
        players[2] = address(rookie);
        game.snapshotStartPrices(roundId, players);

        vm.startPrank(bob);
        country.approve(address(playerRouter), 900 ether);
        playerRouter.buy(address(captain), 300 ether, 0);
        playerRouter.buy(address(best), 300 ether, 0);
        playerRouter.buy(address(rookie), 300 ether, 0);
        vm.stopPrank();

        vm.warp(endTime + 1);
        game.snapshotEndPrices(roundId, players);
        game.settleRoundBatch(roundId, 0);

        uint256 aliceScore = game.getUserLineup(roundId, alice).score;
        uint256 carolScore = game.getUserLineup(roundId, carol).score;
        assertEq(aliceScore, carolScore, "identical lineups -> identical score");
        assertGt(aliceScore, 0, "scores positive");

        // Each should get half the pool (pro-rata, equal scores).
        uint256 aliceBefore = fanovo.balanceOf(alice);
        vm.prank(alice);
        game.claimReward(roundId);
        assertEq(fanovo.balanceOf(alice) - aliceBefore, pool / 2, "alice gets half");

        uint256 carolBefore = fanovo.balanceOf(carol);
        vm.prank(carol);
        game.claimReward(roundId);
        assertEq(fanovo.balanceOf(carol) - carolBefore, pool / 2, "carol gets half");

        // Pool fully distributed.
        assertLe(fanovo.balanceOf(address(game)), 1, "pool drained (<=dust)");
    }

    function test_Lineups_CaptainMultiplier_HigherScore() public {
        uint8 countryIdx = 0;
        CountryToken country = countryFactory.countries(countryIdx);
        (PlayerToken captain, PlayerToken best, PlayerToken rookie) = playerFactory.playersOfCountry(countryIdx);

        _seedCountryTokens(address(playerPackOpener), 1_500 ether);
        _seedCountryTokens(bob, 3_000 ether);
        _openAllPlayerPacks(country, captain, best, rookie);

        uint256 entryFee = 10 ether;
        _fundFanovo(alice, entryFee);
        _fundFanovo(carol, entryFee);

        uint256 lockTime = block.timestamp + 1 hours;
        uint256 startTime = lockTime;
        uint256 endTime = startTime + 1 hours;
        uint256 roundId = game.createRound("Cap", entryFee, lockTime, startTime, endTime);

        // alice: captain slot = the player whose price will move.
        // carol: same player but in the ROOKIE slot (1x instead of 2x).
        // To isolate the multiplier, both use the same three player tokens but
        // swapped between captain/rookie roles is impossible (roles are fixed),
        // so instead we compare: alice's captain price-gain counts 2x.
        vm.startPrank(alice);
        fanovo.approve(address(game), entryFee);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        address[] memory players = new address[](3);
        players[0] = address(captain);
        players[1] = address(best);
        players[2] = address(rookie);
        game.snapshotStartPrices(roundId, players);

        // Move ONLY the captain's price up.
        vm.startPrank(bob);
        country.approve(address(playerRouter), 300 ether);
        playerRouter.buy(address(captain), 300 ether, 0);
        vm.stopPrank();

        vm.warp(endTime + 1);
        game.snapshotEndPrices(roundId, players);
        game.settleRoundBatch(roundId, 0);

        // Score should equal 2 * (captain price delta) since best/rookie unchanged.
        uint256 capStart = game.startPrices(roundId, address(captain));
        uint256 capEnd = game.endPrices(roundId, address(captain));
        uint256 expected = (capEnd - capStart) * 2;

        assertEq(game.getUserLineup(roundId, alice).score, expected, "captain 2x multiplier applied");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _stake(address who, CountryToken c, uint256 matchId, uint8 side, uint256 amount) internal {
        vm.startPrank(who);
        c.approve(address(hub), amount);
        hub.stake(matchId, side, amount);
        vm.stopPrank();
    }

    function _packMintCountry(address to, CountryToken c, uint256 count) internal {
        _fundFanovo(address(packOpener), count * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < count; i++) {
            wcHook.packMint(to, address(c));
        }
        vm.stopPrank();
    }

    function _seedCountryTokens(address to, uint256 amount) internal {
        uint256 packs = amount / 1e18;
        _fundFanovo(address(packOpener), packs * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < packs; i++) {
            wcHook.packMint(to, address(countryFactory.countries(0)));
        }
        vm.stopPrank();
    }

    function _openAllPlayerPacks(
        CountryToken country,
        PlayerToken captain,
        PlayerToken best,
        PlayerToken rookie
    ) internal {
        vm.startPrank(address(playerPackOpener));
        country.approve(address(playerHook), type(uint256).max);
        for (uint256 i = 0; i < 150; i++) playerHook.packMint(alice, address(captain));
        for (uint256 i = 0; i < 50; i++) playerHook.packMint(alice, address(best));
        for (uint256 i = 0; i < 250; i++) playerHook.packMint(alice, address(rookie));
        vm.stopPrank();
    }
}
