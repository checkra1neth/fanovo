// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {WorldCupHook} from "../../src/WorldCupHook.sol";
import {CountryToken} from "../../src/CountryToken.sol";
import {CurveRouter} from "../../src/CurveRouter.sol";

/// @notice Phase 2 — country token trading through CurveRouter -> WorldCupHook.beforeSwap.
/// @dev This is the first coverage of the real bonding-curve swap path, which only
///      works against a live PoolManager.
contract CountryTradingIntegrationTest is IntegrationBase {
    CountryToken internal country;

    function setUp() public override {
        super.setUp();
        country = countryFactory.countries(0);

        // Give alice country tokens via a pack mint, then enter phase 2 so she can trade.
        _fundFanovo(address(packOpener), 1_000 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < 10; i++) {
            wcHook.packMint(alice, address(country));
        }
        vm.stopPrank();

        _activateCountryPhase2();

        // Fund traders with FANOVO for buys.
        _fundFanovo(alice, 10_000 ether);
        _fundFanovo(bob, 10_000 ether);
    }

    // ─── Buy ────────────────────────────────────────────────────────────────────

    function test_Buy_MatchesQuoteAndSeedsCurve() public {
        uint256 fanovoIn = 100 ether;
        uint256 expectedOut = wcHook.quoteBuy(address(country), fanovoIn);
        assertGt(expectedOut, 0, "quote should be positive");

        uint256 balBefore = country.balanceOf(bob);

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        uint256 out = curveRouter.buy(address(country), fanovoIn, expectedOut);
        vm.stopPrank();

        assertEq(out, expectedOut, "router out == quote");
        assertEq(country.balanceOf(bob) - balBefore, out, "bob received country tokens");
    }

    function test_Buy_BurnsFivePercentFanovo() public {
        uint256 fanovoIn = 200 ether;
        uint256 supplyBefore = fanovo.totalSupply();

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        curveRouter.buy(address(country), fanovoIn, 0);
        vm.stopPrank();

        // 5% of input is burned on buy.
        uint256 burned = supplyBefore - fanovo.totalSupply();
        assertEq(burned, fanovoIn * 500 / 10_000, "5% burn on buy");
    }

    function test_Buy_PriceIncreasesAfterBuy() public {
        uint256 priceBefore = wcHook.currentPrice(address(country));

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), 500 ether);
        curveRouter.buy(address(country), 500 ether, 0);
        vm.stopPrank();

        assertGt(wcHook.currentPrice(address(country)), priceBefore, "price rises after buy");
    }

    function test_Buy_SlippageProtection() public {
        uint256 fanovoIn = 100 ether;
        uint256 expectedOut = wcHook.quoteBuy(address(country), fanovoIn);

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        vm.expectRevert(CurveRouter.SlippageExceeded.selector);
        curveRouter.buy(address(country), fanovoIn, expectedOut + 1);
        vm.stopPrank();
    }

    // ─── Sell ───────────────────────────────────────────────────────────────────

    function test_Sell_MatchesQuote() public {
        uint256 sellAmount = 2 ether;
        uint256 expectedOut = wcHook.quoteSell(address(country), sellAmount);
        assertGt(expectedOut, 0, "sell quote positive");

        uint256 fanovoBefore = fanovo.balanceOf(alice);

        vm.startPrank(alice);
        country.approve(address(curveRouter), sellAmount);
        uint256 out = curveRouter.sell(address(country), sellAmount, expectedOut);
        vm.stopPrank();

        assertEq(out, expectedOut, "router out == sell quote");
        assertEq(fanovo.balanceOf(alice) - fanovoBefore, out, "alice received fanovo");
    }

    function test_Sell_PriceDecreasesAfterSell() public {
        // Buy first to build up real reserves so selling has liquidity.
        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), 1_000 ether);
        curveRouter.buy(address(country), 1_000 ether, 0);
        vm.stopPrank();

        uint256 priceBefore = wcHook.currentPrice(address(country));

        vm.startPrank(bob);
        uint256 bal = country.balanceOf(bob);
        country.approve(address(curveRouter), bal);
        curveRouter.sell(address(country), bal, 0);
        vm.stopPrank();

        assertLt(wcHook.currentPrice(address(country)), priceBefore, "price drops after sell");
    }

    // ─── Round-trip / invariants ──────────────────────────────────────────────────

    function test_RoundTrip_BuyThenSellLosesToFees() public {
        uint256 fanovoIn = 500 ether;

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        uint256 bought = curveRouter.buy(address(country), fanovoIn, 0);

        country.approve(address(curveRouter), bought);
        uint256 returned = curveRouter.sell(address(country), bought, 0);
        vm.stopPrank();

        // Buyer cannot profit from an instant round trip (5% burn each way + curve).
        assertLt(returned, fanovoIn, "round trip is lossy due to fees");
    }

    function test_Trade_AnyCountryTradableInPhase2() public {
        // Phase 2 is global: a country that only ever got pack mints is still tradable.
        CountryToken c5 = countryFactory.countries(5);
        _fundFanovo(address(packOpener), 10 ether);

        // packMint reverts in phase 2, so seed reserves via an initial buy instead.
        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), 300 ether);
        uint256 out = curveRouter.buy(address(c5), 300 ether, 0);
        vm.stopPrank();

        assertGt(out, 0, "fresh country tradable once phase 2 is live");
    }
}
