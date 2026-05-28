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

/// @notice Unit tests for WorldCupHook — setup, pack minting, admin, and view functions
/// @dev Hook swap tests require a full PoolManager setup (integration tests)
contract WorldCupHookTest is Test {
    FanovoToken public fanovo;
    WorldCupHook public hook;
    address public deployer = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public attacker = address(0xBAD);
    address public packOpenerAddr = address(0xDAC0);

    // Mock PoolManager (we only test non-swap functions here)
    address public mockPM = address(0x7777);

    CountryToken[] public countryTokens;

    function setUp() public {
        fanovo = new FanovoToken(deployer);
        hook = new WorldCupHook(IPoolManager(mockPM), fanovo, address(this));

        // Deploy and register 4 country tokens
        for (uint8 i = 0; i < 4; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            countryTokens.push(ct);
            hook.registerCountry(address(ct));
        }

        // Give alice and bob some WCT
        require(fanovo.transfer(alice, 10_000 ether), "transfer failed");
        require(fanovo.transfer(bob, 10_000 ether), "transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_RegisterCountry() public view {
        assertEq(hook.countriesLength(), 4);
        address ct0 = hook.getCountryToken(0);
        assertTrue(ct0 != address(0));
        assertEq(ct0, address(countryTokens[0]));
    }

    function test_RegisterCountry_MaxLimit() public {
        // Register remaining 44 countries
        for (uint8 i = 4; i < 48; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            hook.registerCountry(address(ct));
        }
        assertEq(hook.countriesLength(), 48);

        // 49th should revert
        CountryToken extra = new CountryToken("Extra", "EXT", "EXT", address(hook));
        vm.expectRevert(WorldCupHook.TooManyCountries.selector);
        hook.registerCountry(address(extra));
    }

    function test_RegisterCountry_OnlyOwner() public {
        CountryToken ct = new CountryToken("Hack", "HCK", "HCK", address(hook));
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyOwner.selector);
        hook.registerCountry(address(ct));
    }

    function test_RegisterCountry_InvalidBinding() public {
        // Deploy a country token bound to a different hook
        CountryToken ct = new CountryToken("Bad", "BAD", "BAD", address(0x1234));
        vm.expectRevert(WorldCupHook.InvalidCountryBinding.selector);
        hook.registerCountry(address(ct));
    }

    function test_SetPackOpener() public {
        hook.setPackOpener(packOpenerAddr);
        assertEq(hook.packOpener(), packOpenerAddr);
    }

    function test_SetPackOpener_OnlyOnce() public {
        hook.setPackOpener(packOpenerAddr);
        vm.expectRevert(WorldCupHook.PackOpenerAlreadySet.selector);
        hook.setPackOpener(address(0x999));
    }

    function test_Finalize() public {
        // Need all 48 countries
        for (uint8 i = 4; i < 48; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            hook.registerCountry(address(ct));
        }
        hook.setPackOpener(packOpenerAddr);
        hook.finalize();
        assertTrue(hook.setupComplete());
    }

    function test_Finalize_RequiresPackOpener() public {
        for (uint8 i = 4; i < 48; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            hook.registerCountry(address(ct));
        }
        vm.expectRevert(WorldCupHook.PackOpenerNotSet.selector);
        hook.finalize();
    }

    function test_Finalize_Requires48Countries() public {
        hook.setPackOpener(packOpenerAddr);
        vm.expectRevert(WorldCupHook.WrongCountryCount.selector);
        hook.finalize();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // PACK MINTING TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_PackMint() public {
        _setupFinalized();

        // PackOpener calls packMint
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        // Alice should have 1 country token
        assertEq(countryTokens[0].balanceOf(alice), 1 ether);
    }

    function test_PackMint_OnlyPackOpener() public {
        _setupFinalized();

        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPackOpener.selector);
        hook.packMint(alice, address(countryTokens[0]));
    }

    function test_PackMint_RequiresSetup() public {
        // Don't finalize — packMint should revert
        hook.setPackOpener(packOpenerAddr);
        vm.prank(packOpenerAddr);
        vm.expectRevert(WorldCupHook.SetupIncomplete.selector);
        hook.packMint(alice, address(countryTokens[0]));
    }

    function test_PackMint_SeedsCurve() public {
        _setupFinalized();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        (uint128 realFIFA, uint128 circulating,) = hook.getCurveState(address(countryTokens[0]));
        assertEq(uint256(realFIFA), 0.95 ether);
        assertEq(uint256(circulating), 1 ether);
    }

    function test_PackMint_BurnsWCT() public {
        _setupFinalized();

        uint256 supplyBefore = fanovo.totalSupply();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        uint256 supplyAfter = fanovo.totalSupply();
        assertEq(supplyBefore - supplyAfter, 0.05 ether);
    }

    function test_PackMint_RevertsAfterPhase2() public {
        _setupFinalized();

        vm.prank(packOpenerAddr);
        hook.activatePhase2();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        vm.expectRevert(WorldCupHook.PhaseGate.selector);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // PHASE 2 TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_ActivatePhase2() public {
        _setupFinalized();

        vm.prank(packOpenerAddr);
        hook.activatePhase2();
        assertTrue(hook.phase2Active());
    }

    function test_ActivatePhase2_OnlyPackOpener() public {
        _setupFinalized();

        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPackOpener.selector);
        hook.activatePhase2();
    }

    function test_ActivatePhase2_CannotActivateTwice() public {
        _setupFinalized();

        vm.startPrank(packOpenerAddr);
        hook.activatePhase2();
        vm.expectRevert(WorldCupHook.PhaseGate.selector);
        hook.activatePhase2();
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_CurrentPrice_Initial() public view {
        // Initial: realFIFA = 0, circulating = 0
        // price = (VIRTUAL_FIFA + 0) * 1e18 / (VIRTUAL_COUNTRY - 0) = 20000e18 * 1e18 / 20000e18 = 1e18
        uint256 price = hook.currentPrice(address(countryTokens[0]));
        assertEq(price, 1 ether);
    }

    function test_CurrentPrice_AfterPackMint() public {
        _setupFinalized();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        // After 1 pack: realFIFA = 0.95e18, circulating = 1e18
        // price = (20000e18 + 0.95e18) * 1e18 / (20000e18 - 1e18)
        uint256 price = hook.currentPrice(address(countryTokens[0]));
        assertTrue(price > 1 ether); // Price should increase
    }

    function test_CanPackMint() public {
        _setupFinalized();

        assertTrue(hook.canPackMint(address(countryTokens[0])));
    }

    function test_CanPackMint_FalseAfterPhase2() public {
        _setupFinalized();

        vm.prank(packOpenerAddr);
        hook.activatePhase2();

        assertFalse(hook.canPackMint(address(countryTokens[0])));
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECURITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_HookCallbacks_OnlyPoolManager() public {
        vm.prank(attacker);
        vm.expectRevert(WorldCupHook.OnlyPoolManager.selector);
        hook.beforeSwap(
            address(0),
            _dummyPoolKey(),
            IPoolManager.SwapParams({zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0}),
            ""
        );
    }

    function test_BeforeAddLiquidity_AlwaysReverts() public {
        vm.prank(mockPM);
        vm.expectRevert(WorldCupHook.InvalidPoolKey.selector);
        hook.beforeAddLiquidity(
            address(0),
            _dummyPoolKey(),
            IPoolManager.ModifyLiquidityParams({tickLower: 0, tickUpper: 0, liquidityDelta: 0, salt: 0}),
            ""
        );
    }

    function test_BeforeRemoveLiquidity_AlwaysReverts() public {
        vm.prank(mockPM);
        vm.expectRevert(WorldCupHook.InvalidPoolKey.selector);
        hook.beforeRemoveLiquidity(
            address(0),
            _dummyPoolKey(),
            IPoolManager.ModifyLiquidityParams({tickLower: 0, tickUpper: 0, liquidityDelta: 0, salt: 0}),
            ""
        );
    }

    function test_BeforeDonate_AlwaysReverts() public {
        vm.prank(mockPM);
        vm.expectRevert(WorldCupHook.InvalidPoolKey.selector);
        hook.beforeDonate(address(0), _dummyPoolKey(), 0, 0, "");
    }

    function test_CountryToken_OnlyHookCanMint() public {
        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        countryTokens[0].mint(attacker, 1000 ether);
    }

    function test_CountryToken_OnlyHookCanBurn() public {
        _setupFinalized();

        // First mint via pack
        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        vm.prank(attacker);
        vm.expectRevert(CountryToken.OnlyHook.selector);
        countryTokens[0].burn(alice, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // INVARIANT-STYLE TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    function test_Invariant_PackBurnAlwaysReducesSupply() public {
        _setupFinalized();

        uint256 supplyBefore = fanovo.totalSupply();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        hook.packMint(alice, address(countryTokens[0]));
        vm.stopPrank();

        uint256 supplyAfter = fanovo.totalSupply();
        assertTrue(supplyAfter < supplyBefore);
        assertEq(supplyBefore - supplyAfter, 0.05 ether);
    }

    function test_Invariant_CirculatingMatchesSupply() public {
        _setupFinalized();

        vm.startPrank(packOpenerAddr);
        fanovo.approve(address(hook), type(uint256).max);
        for (uint256 i = 0; i < 5; i++) {
            hook.packMint(alice, address(countryTokens[0]));
        }
        vm.stopPrank();

        (, uint128 circulating,) = hook.getCurveState(address(countryTokens[0]));
        uint256 supply = countryTokens[0].totalSupply();
        assertEq(uint256(circulating), supply);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════

    function _setupFinalized() internal {
        // Register remaining countries to reach 48
        for (uint8 i = 4; i < 48; i++) {
            string memory name = string(abi.encodePacked("Country", vm.toString(i)));
            string memory symbol = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = new CountryToken(name, symbol, "TST", address(hook));
            hook.registerCountry(address(ct));
        }
        hook.setPackOpener(packOpenerAddr);
        hook.finalize();

        // Give packOpener WCT
        require(fanovo.transfer(packOpenerAddr, 100_000 ether), "transfer failed");
    }

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
