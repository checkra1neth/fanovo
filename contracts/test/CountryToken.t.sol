// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {CountryToken} from "../src/CountryToken.sol";

contract CountryTokenTest is Test {
    CountryToken public token;
    address public hook = address(0x1);
    address public alice = address(0x2);
    address public attacker = address(0x3);

    function setUp() public {
        vm.prank(hook);
        token = new CountryToken("Argentina", "ARG", "ARG", hook);
    }

    // ─── Basic Tests ─────────────────────────────────────────────────────────────

    function test_Name() public view {
        assertEq(token.name(), "Argentina");
        assertEq(token.symbol(), "ARG");
    }

    function test_HookCanMint() public {
        vm.prank(hook);
        token.mint(alice, 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
    }

    function test_HookCanBurn() public {
        vm.prank(hook);
        token.mint(alice, 100 ether);

        vm.prank(hook);
        token.burn(alice, 50 ether);
        assertEq(token.balanceOf(alice), 50 ether);
    }

    // ─── Access Control Tests ────────────────────────────────────────────────────

    function test_NonHookCannotMint() public {
        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        token.mint(attacker, 100 ether);
    }

    function test_NonHookCannotBurn() public {
        vm.prank(hook);
        token.mint(alice, 100 ether);

        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        token.burn(alice, 50 ether);
    }

    // ─── Supply Cap Tests ────────────────────────────────────────────────────────

    function test_CannotExceedAsymptote() public {
        vm.startPrank(hook);
        token.mint(alice, 19_999 ether);

        vm.expectRevert(CountryToken.ExceedsAsymptote.selector);
        token.mint(alice, 2 ether); // Would exceed 20,000

        // But can mint up to exactly asymptote
        token.mint(alice, 1 ether);
        assertEq(token.totalSupply(), 20_000 ether);
        vm.stopPrank();
    }

    function test_BurnAndRemint() public {
        vm.startPrank(hook);
        token.mint(alice, 20_000 ether);
        token.burn(alice, 5_000 ether);

        // Can mint again after burn
        token.mint(alice, 5_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
        vm.stopPrank();
    }

    // ─── Fuzz Tests ──────────────────────────────────────────────────────────────

    function testFuzz_MintWithinCap(uint256 amount) public {
        amount = bound(amount, 1, 20_000 ether);
        vm.prank(hook);
        token.mint(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.totalSupply(), amount);
    }

    function testFuzz_MintExceedsCap(uint256 amount) public {
        amount = bound(amount, 20_001 ether, type(uint256).max / 2);
        vm.prank(hook);
        vm.expectRevert(CountryToken.ExceedsAsymptote.selector);
        token.mint(alice, amount);
    }
}
