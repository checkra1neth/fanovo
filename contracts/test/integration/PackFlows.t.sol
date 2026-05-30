// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {PackOpener} from "../../src/PackOpener.sol";
import {PlayerPackOpener} from "../../src/PlayerPackOpener.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @notice User-facing commit-reveal pack flows for both country and player packs.
contract PackFlowsIntegrationTest is IntegrationBase {
    function setUp() public override {
        super.setUp();
        _fundFanovo(alice, 1_000 ether);
    }

    // ─── Country packs ────────────────────────────────────────────────────────────

    function test_Country_CommitReveal_MintsTokens() public {
        uint8 count = 3;
        vm.startPrank(alice);
        fanovo.approve(address(packOpener), count * packOpener.PACK_PRICE());
        packOpener.commit(count);
        vm.stopPrank();

        vm.roll(block.number + packOpener.DELAY_BLOCKS() + 1);
        vm.prank(alice);
        packOpener.reveal();

        uint256 total;
        for (uint8 i = 0; i < TOTAL_COUNTRIES; i++) {
            total += countryFactory.countries(i).balanceOf(alice);
        }
        assertEq(total, uint256(count) * 1e18, "3 country tokens minted");
    }

    function test_Country_Reveal_RevertsTooEarly() public {
        vm.startPrank(alice);
        fanovo.approve(address(packOpener), packOpener.PACK_PRICE());
        packOpener.commit(1);
        vm.expectRevert(PackOpener.TooEarly.selector);
        packOpener.reveal();
        vm.stopPrank();
    }

    function test_Country_DoubleCommit_Reverts() public {
        vm.startPrank(alice);
        fanovo.approve(address(packOpener), 2 * packOpener.PACK_PRICE());
        packOpener.commit(1);
        vm.expectRevert(PackOpener.AlreadyCommitted.selector);
        packOpener.commit(1);
        vm.stopPrank();
    }

    function test_Country_RecoverStuckCommit_RefundsAfterTimeout() public {
        uint8 count = 4;
        uint256 cost = count * packOpener.PACK_PRICE();
        uint256 balBefore = fanovo.balanceOf(alice);

        vm.startPrank(alice);
        fanovo.approve(address(packOpener), cost);
        packOpener.commit(count);
        vm.stopPrank();

        assertEq(fanovo.balanceOf(alice), balBefore - cost, "fanovo escrowed");

        // Wait past CLAIM_TIMEOUT and recover.
        vm.warp(block.timestamp + packOpener.CLAIM_TIMEOUT() + 1);
        vm.prank(alice);
        packOpener.recoverStuckCommit();

        assertEq(fanovo.balanceOf(alice), balBefore, "full refund after timeout");
        assertEq(packOpener.totalPacksOpened(), 0, "counter rolled back");
    }

    function test_Country_RevealClearsSlot_AllowsReCommit() public {
        vm.startPrank(alice);
        fanovo.approve(address(packOpener), 5 * packOpener.PACK_PRICE());
        packOpener.commit(2);
        vm.stopPrank();

        vm.roll(block.number + packOpener.DELAY_BLOCKS() + 1);
        vm.prank(alice);
        packOpener.reveal();

        // Can commit again after a successful reveal.
        vm.prank(alice);
        packOpener.commit(3);
        assertEq(packOpener.totalPacksOpened(), 5, "second commit counted");
    }

    // ─── Player packs ───────────────────────────────────────────────────────────

    function test_Player_CommitReveal_MintsPlayers() public {
        uint8 countryIdx = 0;
        CountryToken country = countryFactory.countries(countryIdx);

        // Alice needs country tokens to open player packs.
        _packMintCountry(alice, country, 10);

        uint8 count = 6;
        vm.startPrank(alice);
        country.approve(address(playerPackOpener), uint256(count) * 1e18);
        playerPackOpener.commitPlayerPacks(countryIdx, count);
        vm.stopPrank();

        vm.roll(block.number + playerPackOpener.DELAY_BLOCKS() + 1);
        vm.prank(alice);
        playerPackOpener.revealPlayerPacks(countryIdx);

        // Alice should hold `count` player tokens spread across the 3 roles of country 0.
        (PlayerToken captain, PlayerToken best, PlayerToken rookie) = playerFactory.playersOfCountry(countryIdx);
        uint256 total = captain.balanceOf(alice) + best.balanceOf(alice) + rookie.balanceOf(alice);
        assertEq(total, uint256(count) * 1e18, "6 player tokens minted");
    }

    function test_Player_Reveal_RevertsTooEarly() public {
        uint8 countryIdx = 0;
        CountryToken country = countryFactory.countries(countryIdx);
        _packMintCountry(alice, country, 5);

        vm.startPrank(alice);
        country.approve(address(playerPackOpener), 1e18);
        playerPackOpener.commitPlayerPacks(countryIdx, 1);
        vm.expectRevert(PlayerPackOpener.TooEarly.selector);
        playerPackOpener.revealPlayerPacks(countryIdx);
        vm.stopPrank();
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
