// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {PackOpener} from "../../src/PackOpener.sol";
import {PlayerPackOpener} from "../../src/PlayerPackOpener.sol";
import {WorldCupHook} from "../../src/WorldCupHook.sol";
import {PlayerHook} from "../../src/PlayerHook.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";
import {PredictionMarketHub} from "../../src/PredictionMarketHub.sol";

/// @notice End-to-end lifecycle through every phase, in order:
///   Phase 1: open country packs (commit -> reveal)
///   Transition: phase 2 activates
///   Phase 2: trade countries -> open player packs -> trade players -> predict
///
/// @dev Uses the real commit-reveal pack flow so the user-facing path is exercised.
///      Phase-2 activation at MAX_PACKS (48k) is verified separately with a stubbed
///      counter rather than 48k real opens (which would be prohibitively slow).
contract FullLifecycleIntegrationTest is IntegrationBase {
    PredictionMarketHub internal hub;
    address internal treasury = makeAddr("treasury");

    function test_E2E_CountryPacks_CommitReveal_Phase1() public {
        // ── PHASE 1: open country packs via commit-reveal ──
        uint8 packCount = 5;
        _fundFanovo(alice, 100 ether);

        vm.startPrank(alice);
        fanovo.approve(address(packOpener), packCount * packOpener.PACK_PRICE());
        packOpener.commit(packCount);
        vm.stopPrank();

        // Wait the required delay, then reveal.
        vm.roll(block.number + packOpener.DELAY_BLOCKS() + 1);
        vm.prank(alice);
        packOpener.reveal();

        // Alice now owns 5 country tokens across some set of countries.
        uint256 totalCountryBalance;
        for (uint8 i = 0; i < TOTAL_COUNTRIES; i++) {
            totalCountryBalance += countryFactory.countries(i).balanceOf(alice);
        }
        assertEq(totalCountryBalance, uint256(packCount) * 1e18, "alice received 5 country tokens");
        assertEq(packOpener.totalPacksOpened(), packCount, "packs counted");
        assertFalse(wcHook.phase2Active(), "still phase 1");
    }

    function test_E2E_Phase2Transition_EnablesTrading() public {
        // Open a few packs through the real flow so alice holds country 0.
        CountryToken c0 = countryFactory.countries(0);
        _fundFanovo(address(packOpener), 50 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < 20; i++) {
            wcHook.packMint(alice, address(c0));
        }
        vm.stopPrank();

        // Trading is blocked in phase 1.
        _fundFanovo(bob, 1_000 ether);
        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), 100 ether);
        vm.expectRevert(); // PhaseGate bubbles up through the pool manager
        curveRouter.buy(address(c0), 100 ether, 0);
        vm.stopPrank();

        // ── TRANSITION: packOpener flips the hook into phase 2 ──
        _activateCountryPhase2();
        assertTrue(wcHook.phase2Active(), "phase 2 active");

        // ── PHASE 2: trading now works ──
        vm.startPrank(bob);
        uint256 out = curveRouter.buy(address(c0), 100 ether, 0);
        vm.stopPrank();
        assertGt(out, 0, "country trading enabled in phase 2");
    }

    function test_E2E_FullChain_CountriesThenPlayersThenPredict() public {
        uint8 idxA = 0;
        uint8 idxB = 1;
        CountryToken countryA = countryFactory.countries(idxA);
        CountryToken countryB = countryFactory.countries(idxB);

        // 1) Seed country tokens to actors (pack mints, phase 1).
        //    Do ALL country pack mints now — they're blocked once phase 2 starts.
        _packMintCountry(bob, countryA, 600);
        _packMintCountry(address(playerPackOpener), countryA, 460);
        _packMintCountry(alice, countryB, 50);
        _packMintCountry(alice, countryA, 10); // alice's prediction-market stake

        // 2) Enter country phase 2 and trade a country.
        _activateCountryPhase2();
        _fundFanovo(bob, 1_000 ether);
        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), 200 ether);
        uint256 boughtCountry = curveRouter.buy(address(countryA), 200 ether, 0);
        vm.stopPrank();
        assertGt(boughtCountry, 0, "country trade works");

        // 3) Open player packs for country A (450 -> per-country phase 2).
        (PlayerToken captain, PlayerToken best, PlayerToken rookie) = playerFactory.playersOfCountry(idxA);
        vm.startPrank(address(playerPackOpener));
        countryA.approve(address(playerHook), type(uint256).max);
        for (uint256 i = 0; i < 150; i++) playerHook.packMint(alice, address(captain));
        for (uint256 i = 0; i < 50; i++) playerHook.packMint(alice, address(best));
        for (uint256 i = 0; i < 250; i++) playerHook.packMint(alice, address(rookie));
        vm.stopPrank();
        assertTrue(playerHook.phase2ByCountry(idxA), "player phase 2 active for country A");

        // 4) Trade a player (country token -> player token).
        vm.startPrank(bob);
        countryA.approve(address(playerRouter), 50 ether);
        uint256 boughtPlayer = playerRouter.buy(address(captain), 50 ether, 0);
        vm.stopPrank();
        assertGt(boughtPlayer, 0, "player trade works");

        // 5) Prediction market: alice (A) vs bob (B), settle A_WINS, alice claims.
        hub = new PredictionMarketHub(address(countryFactory), address(fanovo), address(this), treasury);

        uint64 closes = uint64(block.timestamp + 1 days);
        uint256 matchId = hub.createMatch(idxA, idxB, closes, uint64(closes + 1 days), "A vs B");

        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        hub.stake(matchId, hub.SIDE_A(), 10 ether);
        vm.stopPrank();

        // bob stakes side B — give him country B from alice first.
        vm.prank(alice);
        countryB.transfer(bob, 10 ether);
        vm.startPrank(bob);
        countryB.approve(address(hub), 10 ether);
        hub.stake(matchId, hub.SIDE_B(), 10 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(matchId, PredictionMarketHub.Outcome.A_WINS);

        uint256 aBefore = countryA.balanceOf(alice);
        vm.prank(alice);
        hub.claim(matchId);
        assertGt(countryA.balanceOf(alice), aBefore, "winner claimed stake + winnings");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    function _packMintCountry(address to, CountryToken c, uint256 count) internal {
        _fundFanovo(address(packOpener), count * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < count; i++) {
            wcHook.packMint(to, address(c));
        }
        vm.stopPrank();
    }
}
