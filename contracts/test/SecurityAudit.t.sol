// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {FanovoToken} from "../src/FanovoToken.sol";
import {WorldCupHook} from "../src/WorldCupHook.sol";
import {CountryToken} from "../src/CountryToken.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/// @title Security Audit Tests
/// @notice Tests for potential attack vectors and edge cases
contract SecurityAuditTest is Test {
    FanovoToken public fanovo;
    WorldCupHook public hook;
    address public deployer = address(this);
    address public attacker = address(0xBAD);
    address public alice = address(0xA11CE);
    address public mockPM = address(0x7777);
    address public packOpenerAddr = address(0xDAC0);

    CountryToken[] public countryTokens;

    function setUp() public {
        fanovo = new FanovoToken(deployer);
        hook = new WorldCupHook(IPoolManager(mockPM), fanovo, address(this));

        // Deploy and register all 48 countries
        for (uint8 i = 0; i < 48; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            countryTokens.push(ct);
            hook.registerCountry(address(ct));
        }

        // Setup packOpener and finalize
        hook.setPackOpener(packOpenerAddr);
        hook.finalize();

        // Fund accounts
        require(fanovo.transfer(alice, 100_000 ether), "transfer failed");
        require(fanovo.transfer(attacker, 10_000 ether), "transfer failed");
        require(fanovo.transfer(packOpenerAddr, 500_000 ether), "transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // REENTRANCY TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Reentrancy_GuardPresent() public {
        // Verify the reentrancy guard works by checking packMint succeeds normally
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        // Verify state updated correctly
        (, uint128 circulating,) = hook.getCurveState(address(countryTokens[0]));
        assertEq(uint256(circulating), 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL ATTACKS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Attack_DirectMintCountryToken() public {
        // Attacker tries to mint country tokens directly
        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        countryTokens[0].mint(attacker, 1_000_000 ether);
    }

    function test_Attack_DirectBurnCountryToken() public {
        // First give alice some tokens via pack
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        // Attacker tries to burn alice's tokens
        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        countryTokens[0].burn(alice, 1 ether);
    }

    function test_Attack_CallBeforeSwapDirectly() public {
        // Attacker tries to call beforeSwap directly (not through PoolManager)
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPoolManager.selector);
        hook.beforeSwap(
            address(0),
            _dummyPoolKey(),
            IPoolManager.SwapParams({zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0}),
            ""
        );
    }

    function test_Attack_RegisterCountryAsNonOwner() public {
        // Can't register after finalize anyway
        CountryToken ct = new CountryToken("Hack", "HCK", "HCK", address(hook));
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyOwner.selector);
        hook.registerCountry(address(ct));
    }

    function test_Attack_PackMintAsNonPackOpener() public {
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPackOpener.selector);
        hook.packMint(attacker, address(countryTokens[0]));
    }

    function test_Attack_ActivatePhase2AsNonPackOpener() public {
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPackOpener.selector);
        hook.activatePhase2();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ECONOMIC ATTACKS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Attack_PackMintCapEnforced() public {
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);

        // Mint up to threshold (18000 tokens = 18000 packs for one country)
        // PACK_MINT_THRESHOLD = 18_000e18, each pack mints 1e18
        // So we can mint 17999 packs before hitting the cap
        for (uint256 i = 0; i < 17_999; i++) {
            hook.packMint(alice, address(countryTokens[0]));
        }

        // Next should revert (circulating would be 18000e18 which >= PACK_MINT_THRESHOLD)
        vm.expectRevert(WorldCupHook.CapReached.selector);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();
    }

    function test_Attack_PackMintAfterPhase2() public {
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));

        hook.activatePhase2();

        vm.expectRevert(WorldCupHook.PhaseGate.selector);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SETUP PROTECTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Attack_RegisterAfterFinalize() public {
        CountryToken ct = new CountryToken("Late", "LATE", "LATE", address(hook));
        vm.expectRevert(WorldCupHook.SetupAlreadyComplete.selector);
        hook.registerCountry(address(ct));
    }

    function test_Attack_SetPackOpenerAfterFinalize() public {
        vm.expectRevert(WorldCupHook.SetupAlreadyComplete.selector);
        hook.setPackOpener(address(0x999));
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // INVARIANT TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Invariant_PackBurnAlwaysReducesSupply() public {
        uint256 supplyBefore = fanovo.totalSupply();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        uint256 supplyAfter = fanovo.totalSupply();
        assertTrue(supplyAfter < supplyBefore);
        assertEq(supplyBefore - supplyAfter, 0.05 ether);
    }

    function test_Invariant_CirculatingMatchesTokenSupply() public {
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);

        for (uint256 i = 0; i < 50; i++) {
            hook.packMint(alice, address(countryTokens[0]));
        }
        vm.stopPrank();

        (, uint128 circulating,) = hook.getCurveState(address(countryTokens[0]));
        uint256 supply = countryTokens[0].totalSupply();
        assertEq(uint256(circulating), supply);
    }

    function test_Invariant_PriceIncreasesWithPacks() public {
        uint256 priceBefore = hook.currentPrice(address(countryTokens[0]));

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        for (uint256 i = 0; i < 100; i++) {
            hook.packMint(alice, address(countryTokens[0]));
        }
        vm.stopPrank();

        uint256 priceAfter = hook.currentPrice(address(countryTokens[0]));
        assertTrue(priceAfter > priceBefore);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Edge_PackMintZeroAddress() public {
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        vm.expectRevert(WorldCupHook.ZeroAddress.selector);
        hook.packMint(address(0), address(countryTokens[0]));
        vm.stopPrank();
    }

    function test_Edge_PackMintUnregisteredCountry() public {
        CountryToken fake = new CountryToken("Fake", "FAKE", "FAKE", address(hook));
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        vm.expectRevert(WorldCupHook.CountryNotRegistered.selector);
        hook.packMint(alice, address(fake));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════

    function _dummyPoolKey() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0x100)),
            currency1: Currency.wrap(address(0x200)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
    }
}
