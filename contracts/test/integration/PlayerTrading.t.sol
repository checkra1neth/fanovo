// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {PlayerHook} from "../../src/PlayerHook.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";
import {PlayerRouter} from "../../src/PlayerRouter.sol";

/// @notice Phase 2 — player token trading through PlayerRouter -> PlayerHook.beforeSwap.
/// @dev Player pools trade CountryToken <-> PlayerToken. Per-country phase 2 activates
///      automatically once PACKS_PER_COUNTRY (450) packs are opened for that country.
contract PlayerTradingIntegrationTest is IntegrationBase {
    uint8 internal constant COUNTRY_IDX = 0;
    CountryToken internal country;
    PlayerToken internal captain; // role 0
    PlayerToken internal best; // role 1
    PlayerToken internal rookie; // role 2

    function setUp() public override {
        super.setUp();
        country = countryFactory.countries(COUNTRY_IDX);
        (captain, best, rookie) = playerFactory.playersOfCountry(COUNTRY_IDX);

        // Mint country tokens to the player pack opener + traders.
        // packMint on the player hook pulls CountryToken from playerPackOpener.
        _seedCountryTokens(address(playerPackOpener), 1_000 ether);
        _seedCountryTokens(bob, 1_000 ether);

        // Open enough player packs to trigger per-country phase 2 (450 packs).
        // Spread across the 3 roles within their caps (150/50/250).
        _openPlayerPacks();
    }

    function test_PlayerPhase2_AutoActivatesAt450Packs() public view {
        assertTrue(playerHook.phase2ByCountry(COUNTRY_IDX), "country phase2 active");
        assertEq(playerHook.packsByCountry(COUNTRY_IDX), 450, "all packs opened");
    }

    function test_Buy_PlayerWithCountryToken() public {
        uint256 countryIn = 50 ether;
        uint256 expectedOut = playerHook.quoteBuy(address(captain), countryIn);
        assertGt(expectedOut, 0, "buy quote positive");

        uint256 balBefore = captain.balanceOf(bob);

        vm.startPrank(bob);
        country.approve(address(playerRouter), countryIn);
        uint256 out = playerRouter.buy(address(captain), countryIn, expectedOut);
        vm.stopPrank();

        assertEq(out, expectedOut, "router out == quote");
        assertEq(captain.balanceOf(bob) - balBefore, out, "bob received player tokens");
    }

    function test_Buy_PriceIncreases() public {
        uint256 priceBefore = playerHook.currentPrice(address(best));

        vm.startPrank(bob);
        country.approve(address(playerRouter), 30 ether);
        playerRouter.buy(address(best), 30 ether, 0);
        vm.stopPrank();

        assertGt(playerHook.currentPrice(address(best)), priceBefore, "player price rises");
    }

    function test_Sell_PlayerForCountryToken() public {
        // Buy first to hold player tokens + seed real reserves.
        vm.startPrank(bob);
        country.approve(address(playerRouter), 100 ether);
        uint256 bought = playerRouter.buy(address(rookie), 100 ether, 0);
        vm.stopPrank();

        uint256 expectedOut = playerHook.quoteSell(address(rookie), bought);
        assertGt(expectedOut, 0, "sell quote positive");

        uint256 countryBefore = country.balanceOf(bob);

        vm.startPrank(bob);
        rookie.approve(address(playerRouter), bought);
        uint256 out = playerRouter.sell(address(rookie), bought, expectedOut);
        vm.stopPrank();

        assertEq(out, expectedOut, "router out == sell quote");
        assertEq(country.balanceOf(bob) - countryBefore, out, "bob got country tokens back");
    }

    function test_Buy_SlippageProtection() public {
        uint256 countryIn = 40 ether;
        uint256 expectedOut = playerHook.quoteBuy(address(captain), countryIn);

        vm.startPrank(bob);
        country.approve(address(playerRouter), countryIn);
        vm.expectRevert(PlayerRouter.SlippageExceeded.selector);
        playerRouter.buy(address(captain), countryIn, expectedOut + 1);
        vm.stopPrank();
    }

    function test_RoundTrip_IsLossy() public {
        vm.startPrank(bob);
        country.approve(address(playerRouter), 80 ether);
        uint256 bought = playerRouter.buy(address(captain), 80 ether, 0);

        captain.approve(address(playerRouter), bought);
        uint256 returned = playerRouter.sell(address(captain), bought, 0);
        vm.stopPrank();

        assertLt(returned, 80 ether, "round trip lossy due to 5% burns + curve");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    /// @dev Mint country tokens to `to` by routing pack mints from the country pack opener.
    function _seedCountryTokens(address to, uint256 amount) internal {
        uint256 packs = amount / 1e18;
        _fundFanovo(address(packOpener), packs * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < packs; i++) {
            wcHook.packMint(to, address(country));
        }
        vm.stopPrank();
    }

    /// @dev Open all 450 player packs for COUNTRY_IDX directly via the hook,
    ///      respecting role caps (captain 150, best 50, rookie 250).
    function _openPlayerPacks() internal {
        // playerPackOpener already holds country tokens (seeded in setUp).
        vm.startPrank(address(playerPackOpener));
        country.approve(address(playerHook), type(uint256).max);
        for (uint256 i = 0; i < 150; i++) playerHook.packMint(alice, address(captain));
        for (uint256 i = 0; i < 50; i++) playerHook.packMint(alice, address(best));
        for (uint256 i = 0; i < 250; i++) playerHook.packMint(alice, address(rookie));
        vm.stopPrank();
    }
}
