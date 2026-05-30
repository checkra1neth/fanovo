// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {PredictionMarketHub} from "../../src/PredictionMarketHub.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @notice Prediction market — stake on match outcomes, settle, claim winnings.
/// @dev Staking sides: A = CountryToken A, B = CountryToken B, DRAW = FANOVO.
contract PredictionMarketIntegrationTest is IntegrationBase {
    PredictionMarketHub internal hub;
    address internal treasury = makeAddr("treasury");

    uint8 internal constant IDX_A = 0;
    uint8 internal constant IDX_B = 1;
    CountryToken internal countryA;
    CountryToken internal countryB;

    function setUp() public override {
        super.setUp();
        hub = new PredictionMarketHub(address(countryFactory), address(fanovo), address(this), treasury);

        countryA = countryFactory.countries(IDX_A);
        countryB = countryFactory.countries(IDX_B);

        // Seed alice with country A tokens, bob with country B tokens, both with FANOVO.
        _seedCountry(alice, countryA, 100 ether);
        _seedCountry(bob, countryB, 100 ether);
        _fundFanovo(alice, 1_000 ether);
        _fundFanovo(bob, 1_000 ether);
    }

    function _seedCountry(address to, CountryToken c, uint256 amount) internal {
        uint256 packs = amount / 1e18;
        _fundFanovo(address(packOpener), packs * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < packs; i++) {
            wcHook.packMint(to, address(c));
        }
        vm.stopPrank();
    }

    function _createMatch() internal returns (uint256 id) {
        uint64 closes = uint64(block.timestamp + 1 days);
        uint64 deadline = uint64(closes + 1 days);
        id = hub.createMatch(IDX_A, IDX_B, closes, deadline, "A vs B");
    }

    function test_CreateMatch() public {
        uint256 id = _createMatch();
        PredictionMarketHub.MatchInfo memory m = hub.getMatch(id);
        assertEq(m.countryIndexA, IDX_A);
        assertEq(m.countryIndexB, IDX_B);
        assertFalse(m.settled);
    }

    function test_Stake_OnSideA() public {
        uint256 id = _createMatch();

        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        hub.stake(id, hub.SIDE_A(), 10 ether);
        vm.stopPrank();

        (uint256 a,,,) = hub.userStakes(id, alice);
        assertEq(a, 10 ether, "alice staked on A");
    }

    function test_FullFlow_AWins_WinnerClaimsLoserPool() public {
        uint256 id = _createMatch();

        // alice stakes A (10), bob stakes B (10).
        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        hub.stake(id, hub.SIDE_A(), 10 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        countryB.approve(address(hub), 10 ether);
        hub.stake(id, hub.SIDE_B(), 10 ether);
        vm.stopPrank();

        // Close staking and settle A_WINS.
        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(id, PredictionMarketHub.Outcome.A_WINS);

        // Loser pool (B = 10 country B) is split: 5% burn, 15% treasury, 80% winners.
        assertEq(countryB.balanceOf(treasury), 10 ether * 1500 / 10_000, "treasury got 15% of B");
        assertEq(countryB.balanceOf(hub.DEAD_ADDRESS()), 10 ether * 500 / 10_000, "5% B burned");

        // alice (only winner) claims: her stake back (A) + 80% of loser pool (B).
        uint256 aBefore = countryA.balanceOf(alice);
        uint256 bBefore = countryB.balanceOf(alice);
        vm.prank(alice);
        hub.claim(id);

        assertEq(countryA.balanceOf(alice) - aBefore, 10 ether, "stake A returned");
        assertEq(countryB.balanceOf(alice) - bBefore, 10 ether * 8000 / 10_000, "won 80% of B pool");
    }

    function test_Settle_DrawPaysFanovoStakers() public {
        uint256 id = _createMatch();

        // alice stakes A, bob stakes DRAW (FANOVO).
        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        hub.stake(id, hub.SIDE_A(), 10 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        fanovo.approve(address(hub), 20 ether);
        hub.stake(id, hub.SIDE_DRAW(), 20 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + 1);
        hub.settle(id, PredictionMarketHub.Outcome.DRAW);

        // Draw winner (bob) gets FANOVO stake back + share of loser country A pool.
        uint256 fanovoBefore = fanovo.balanceOf(bob);
        uint256 aBefore = countryA.balanceOf(bob);
        vm.prank(bob);
        hub.claim(id);

        assertEq(fanovo.balanceOf(bob) - fanovoBefore, 20 ether, "draw FANOVO stake returned");
        assertEq(countryA.balanceOf(bob) - aBefore, 10 ether * 8000 / 10_000, "won 80% of A pool");
    }

    function test_Cancel_RefundsStakes() public {
        uint256 id = _createMatch();

        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        hub.stake(id, hub.SIDE_A(), 10 ether);
        vm.stopPrank();

        hub.cancelMatch(id);

        uint256 aBefore = countryA.balanceOf(alice);
        vm.prank(alice);
        hub.claim(id);
        assertEq(countryA.balanceOf(alice) - aBefore, 10 ether, "cancel refunds full stake");
    }

    function test_Stake_RevertsAfterClose() public {
        uint256 id = _createMatch();
        uint8 sideA = hub.SIDE_A();

        vm.startPrank(alice);
        countryA.approve(address(hub), 10 ether);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(PredictionMarketHub.StakingClosed.selector);
        hub.stake(id, sideA, 10 ether);
        vm.stopPrank();
    }

    function test_Settle_OnlyOwner() public {
        uint256 id = _createMatch();
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert();
        hub.settle(id, PredictionMarketHub.Outcome.A_WINS);
    }
}
