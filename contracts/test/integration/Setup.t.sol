// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IntegrationBase} from "./IntegrationBase.t.sol";

/// @notice Smoke test: verifies the full protocol harness wires up like production.
contract SetupIntegrationTest is IntegrationBase {
    function test_Setup_AllWired() public view {
        // Countries
        assertEq(countryFactory.countriesLength(), TOTAL_COUNTRIES, "countries");
        assertEq(wcHook.countriesLength(), TOTAL_COUNTRIES, "hook countries");
        assertTrue(countryFactory.setupComplete(), "country factory setup");

        // Players
        assertEq(playerFactory.playersLength(), TOTAL_PLAYERS, "players");
        assertEq(playerHook.playersLength(), TOTAL_PLAYERS, "hook players");
        assertTrue(playerFactory.setupComplete(), "player factory setup");

        // Hooks finalized + openers bound
        assertTrue(wcHook.setupComplete(), "wc finalized");
        assertTrue(playerHook.setupComplete(), "player finalized");
        assertEq(wcHook.packOpener(), address(packOpener), "wc opener");
        assertEq(playerHook.packOpener(), address(playerPackOpener), "player opener");

        // Phase 1 active (no trading yet)
        assertFalse(wcHook.phase2Active(), "phase2 not active yet");
    }

    function test_Setup_HookFlagsValid() public view {
        assertEq(uint160(address(wcHook)) & HOOK_FLAGS, HOOK_FLAGS, "wc flags");
        assertEq(uint160(address(playerHook)) & HOOK_FLAGS, HOOK_FLAGS, "player flags");
    }
}
