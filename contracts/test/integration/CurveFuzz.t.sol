// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {WorldCupHook} from "../../src/WorldCupHook.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @title CurveFuzz — property-based tests for the WorldCupHook bonding curve.
/// @notice Fuzzes quote math and real round-trip swaps through the live PoolManager.
///         Key properties: no reverts on valid input, bounded output, price
///         monotonicity, no free money from rounding, and curve solvency.
contract CurveFuzzIntegrationTest is IntegrationBase {
    CountryToken internal country;

    uint256 internal constant VIRTUAL = 20_000 ether;

    function setUp() public override {
        super.setUp();
        country = countryFactory.countries(0);

        // Seed real reserves in phase 1 (~2000 packs -> realFanovo≈1900, circ=2000).
        _fundFanovo(address(packOpener), 2_000 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < 2_000; i++) {
            wcHook.packMint(alice, address(country));
        }
        vm.stopPrank();

        _activateCountryPhase2();

        // Fund traders generously for buys.
        _fundFanovo(alice, 200_000 ether);
        _fundFanovo(bob, 200_000 ether);
    }

    // ── Property 1: quoteBuy never reverts and output stays below the asymptote ──
    function testFuzz_QuoteBuy_BoundedBelowAsymptote(uint256 fanovoIn) public view {
        fanovoIn = bound(fanovoIn, 1e12, 100_000 ether);
        uint256 out = wcHook.quoteBuy(address(country), fanovoIn);

        (, uint128 circ,) = wcHook.getCurveState(address(country));
        uint256 capacity = VIRTUAL - uint256(circ);
        assertLt(out, capacity, "buy out must stay below remaining capacity");
    }

    // ── Property 2: quoteBuy is monotonic — more in, at least as much out ──
    function testFuzz_QuoteBuy_Monotonic(uint256 a, uint256 b) public view {
        a = bound(a, 1e15, 50_000 ether);
        b = bound(b, 1e15, 50_000 ether);
        if (a > b) (a, b) = (b, a); // a <= b

        uint256 outA = wcHook.quoteBuy(address(country), a);
        uint256 outB = wcHook.quoteBuy(address(country), b);
        assertGe(outB, outA, "larger input -> >= output");
    }

    // ── Property 3: real buy moves price up (never down) ──
    function testFuzz_Buy_PriceNonDecreasing(uint256 fanovoIn) public {
        fanovoIn = bound(fanovoIn, 1e16, 50_000 ether);
        uint256 priceBefore = wcHook.currentPrice(address(country));

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        uint256 out = curveRouter.buy(address(country), fanovoIn, 0);
        vm.stopPrank();

        assertGt(out, 0, "buy returns tokens");
        assertGe(wcHook.currentPrice(address(country)), priceBefore, "price non-decreasing after buy");
    }

    // ── Property 4: no free money — buy then immediately sell returns <= input ──
    function testFuzz_RoundTrip_NeverProfitable(uint256 fanovoIn) public {
        fanovoIn = bound(fanovoIn, 1e16, 50_000 ether);

        vm.startPrank(bob);
        fanovo.approve(address(curveRouter), fanovoIn);
        uint256 bought = curveRouter.buy(address(country), fanovoIn, 0);

        country.approve(address(curveRouter), bought);
        uint256 returned = curveRouter.sell(address(country), bought, 0);
        vm.stopPrank();

        assertLe(returned, fanovoIn, "round trip cannot be profitable");
    }

    // ── Property 5: SAFETY INVARIANT — a sell never overpays; it pays from
    //    reserves or reverts. (Full redemption is intentionally NOT solvent
    //    because pack mints add only 0.95 FANOVO per 1.0 token; the revert
    //    guard in _executeSell is what protects the curve.) ──
    function testFuzz_Sell_NeverOverpaysOrReverts(uint256 sellAmount) public {
        (uint128 realFanovo, uint128 circ,) = wcHook.getCurveState(address(country));
        sellAmount = bound(sellAmount, 1e12, uint256(circ));

        // Mirror _executeSell's gross formula exactly.
        uint256 vfPlusRf = VIRTUAL + uint256(realFanovo);
        uint256 vcMinusCirc = VIRTUAL - uint256(circ);
        uint256 gross = (vfPlusRf * sellAmount) / (vcMinusCirc + sellAmount);

        // alice holds the seeded circulating supply.
        vm.startPrank(alice);
        country.approve(address(curveRouter), sellAmount);

        if (gross > uint256(realFanovo)) {
            // Must revert rather than overpay (InsufficientLiquidity bubbles up).
            vm.expectRevert();
            curveRouter.sell(address(country), sellAmount, 0);
        } else {
            uint256 out = curveRouter.sell(address(country), sellAmount, 0);
            // Successful sells pay strictly from reserves, post-fee <= gross <= reserves.
            assertLe(out, uint256(realFanovo), "payout never exceeds reserves");
            assertLe(out, gross, "post-fee payout <= gross");
        }
        vm.stopPrank();
    }

    // ── Property 6: FINDING — quoteSell does NOT cap at reserves, so it can
    //    quote a payout that would actually revert. This pins that behavior:
    //    selling the entire circulating supply quotes > reserves AND reverts. ──
    function test_Finding_QuoteSell_CanOverQuote_AndSuchSellReverts() public {
        (uint128 realFanovo, uint128 circ,) = wcHook.getCurveState(address(country));

        uint256 quoted = wcHook.quoteSell(address(country), uint256(circ));
        // The quote for redeeming everything exceeds real reserves (the finding).
        assertGt(quoted, uint256(realFanovo), "quoteSell over-quotes full redemption");

        // Executing that sell reverts — the curve protects itself.
        vm.startPrank(alice);
        country.approve(address(curveRouter), uint256(circ));
        vm.expectRevert();
        curveRouter.sell(address(country), uint256(circ), 0);
        vm.stopPrank();
    }
}
