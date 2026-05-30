// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";
import {LineupsGame} from "../../src/LineupsGame.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {CountryToken} from "../../src/CountryToken.sol";

/// @notice LineupsGame — fantasy round: submit lineup, snapshot prices, settle, claim.
/// @dev Score = sum of player price increases over the round (captain 2x).
contract LineupsGameIntegrationTest is IntegrationBase {
    LineupsGame internal game;

    uint8 internal constant COUNTRY_IDX = 0;
    CountryToken internal country;
    PlayerToken internal captain; // role 0
    PlayerToken internal best; // role 1
    PlayerToken internal rookie; // role 2

    uint256 internal constant ENTRY_FEE = 10 ether;

    function setUp() public override {
        super.setUp();
        game = new LineupsGame(fanovo, playerHook);

        country = countryFactory.countries(COUNTRY_IDX);
        (captain, best, rookie) = playerFactory.playersOfCountry(COUNTRY_IDX);

        // Activate player trading for this country (open all 450 packs).
        _seedCountryTokens(address(playerPackOpener), 1_000 ether);
        _seedCountryTokens(bob, 2_000 ether);
        _openAllPlayerPacks();

        // Entry fee funding.
        _fundFanovo(alice, 1_000 ether);
    }

    function test_FullRound_SubmitSnapshotSettleClaim() public {
        // Create a round that locks in 1h, scores from +1h to +2h.
        uint256 lockTime = block.timestamp + 1 hours;
        uint256 startTime = lockTime;
        uint256 endTime = startTime + 1 hours;
        uint256 roundId = game.createRound("R1", ENTRY_FEE, lockTime, startTime, endTime);

        // Alice submits a lineup before lock.
        vm.startPrank(alice);
        fanovo.approve(address(game), ENTRY_FEE);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();

        assertEq(game.getRoundEntrants(roundId), 1, "one entrant");

        // Snapshot START prices.
        address[] memory players = new address[](3);
        players[0] = address(captain);
        players[1] = address(best);
        players[2] = address(rookie);
        game.snapshotStartPrices(roundId, players);

        // During the round, bob buys players -> prices rise.
        vm.startPrank(bob);
        country.approve(address(playerRouter), 600 ether);
        playerRouter.buy(address(captain), 200 ether, 0);
        playerRouter.buy(address(best), 200 ether, 0);
        playerRouter.buy(address(rookie), 200 ether, 0);
        vm.stopPrank();

        // Move to end, snapshot END prices, settle.
        vm.warp(endTime + 1);
        game.snapshotEndPrices(roundId, players);
        game.settleRoundBatch(roundId, 0);

        LineupsGame.Lineup memory lu = game.getUserLineup(roundId, alice);
        assertGt(lu.score, 0, "alice scored from price gains");

        // Sole entrant claims the whole pool.
        uint256 before = fanovo.balanceOf(alice);
        vm.prank(alice);
        game.claimReward(roundId);
        assertEq(fanovo.balanceOf(alice) - before, ENTRY_FEE, "sole winner takes pool");
    }

    function test_Submit_RevertsAfterLock() public {
        uint256 lockTime = block.timestamp + 1 hours;
        uint256 roundId = game.createRound("R", ENTRY_FEE, lockTime, lockTime, lockTime + 1 hours);

        vm.warp(lockTime + 1);
        vm.startPrank(alice);
        fanovo.approve(address(game), ENTRY_FEE);
        vm.expectRevert(LineupsGame.LockTimeExpired.selector);
        game.submitLineup(roundId, address(captain), address(best), address(rookie));
        vm.stopPrank();
    }

    function test_Submit_RejectsWrongRole() public {
        uint256 lockTime = block.timestamp + 1 hours;
        uint256 roundId = game.createRound("R", ENTRY_FEE, lockTime, lockTime, lockTime + 1 hours);

        // rookie (role 2) placed in the "best" slot (expects role 1) -> WrongRole.
        // c1Rookie keeps the third slot a distinct address so the duplicate check passes first.
        (, , PlayerToken c1Rookie) = playerFactory.playersOfCountry(1);

        vm.startPrank(alice);
        fanovo.approve(address(game), ENTRY_FEE);
        vm.expectRevert(LineupsGame.WrongRole.selector);
        game.submitLineup(roundId, address(captain), address(rookie), address(c1Rookie));
        vm.stopPrank();
    }

    function test_Submit_RejectsMixedCountries() public {
        uint256 lockTime = block.timestamp + 1 hours;
        uint256 roundId = game.createRound("R", ENTRY_FEE, lockTime, lockTime, lockTime + 1 hours);

        // best from a different country (index 1)
        (, PlayerToken otherBest,) = playerFactory.playersOfCountry(1);

        vm.startPrank(alice);
        fanovo.approve(address(game), ENTRY_FEE);
        vm.expectRevert(LineupsGame.MixedCountries.selector);
        game.submitLineup(roundId, address(captain), address(otherBest), address(rookie));
        vm.stopPrank();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    function _seedCountryTokens(address to, uint256 amount) internal {
        uint256 packs = amount / 1e18;
        _fundFanovo(address(packOpener), packs * 1 ether);
        vm.startPrank(address(packOpener));
        for (uint256 i = 0; i < packs; i++) {
            wcHook.packMint(to, address(country));
        }
        vm.stopPrank();
    }

    function _openAllPlayerPacks() internal {
        vm.startPrank(address(playerPackOpener));
        country.approve(address(playerHook), type(uint256).max);
        for (uint256 i = 0; i < 150; i++) playerHook.packMint(alice, address(captain));
        for (uint256 i = 0; i < 50; i++) playerHook.packMint(alice, address(best));
        for (uint256 i = 0; i < 250; i++) playerHook.packMint(alice, address(rookie));
        vm.stopPrank();
    }
}
