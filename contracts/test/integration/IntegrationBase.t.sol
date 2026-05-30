// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {FanovoToken} from "../../src/FanovoToken.sol";
import {WorldCupHook} from "../../src/WorldCupHook.sol";
import {PlayerHook} from "../../src/PlayerHook.sol";
import {CountryFactory} from "../../src/CountryFactory.sol";
import {CountryToken} from "../../src/CountryToken.sol";
import {PlayerFactory} from "../../src/PlayerFactory.sol";
import {PlayerToken} from "../../src/PlayerToken.sol";
import {PackOpener} from "../../src/PackOpener.sol";
import {PlayerPackOpener} from "../../src/PlayerPackOpener.sol";
import {CurveRouter} from "../../src/CurveRouter.sol";
import {PlayerRouter} from "../../src/PlayerRouter.sol";

/// @title IntegrationBase
/// @notice Shared harness that deploys the FULL protocol against a real Uniswap V4 PoolManager.
/// @dev Mirrors the production deploy sequence (scripts/refresh/01..07):
///        1. PoolManager + FanovoToken
///        2. WorldCupHook + PlayerHook at flag-valid addresses (via deployCodeTo)
///        3. CountryFactory -> 48 CountryTokens -> registerCountry -> completeSetup
///        4. PlayerFactory  -> 144 PlayerTokens -> registerPlayer  -> completeSetup
///        5. initialize all 48 country pools + 144 player pools (must precede finalize)
///        6. PackOpener / PlayerPackOpener -> setPackOpener -> finalize both hooks
///        7. CurveRouter + PlayerRouter
///
///      Everything runs on a local, throwaway EVM. Production contracts are untouched.
abstract contract IntegrationBase is Test {
    // ─── Hook permission flags (must be encoded in the hook address) ──────────────
    // beforeInitialize | beforeAddLiquidity | beforeRemoveLiquidity
    // | beforeSwap | beforeDonate | beforeSwapReturnsDelta
    uint160 internal constant HOOK_FLAGS =
        uint160(1 << 13) | uint160(1 << 11) | uint160(1 << 9) | uint160(1 << 7) | uint160(1 << 5) | uint160(1 << 3);

    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    uint24 internal constant POOL_FEE = 0;
    int24 internal constant POOL_TICK_SPACING = 60;

    uint8 internal constant TOTAL_COUNTRIES = 48;
    uint16 internal constant TOTAL_PLAYERS = 144;

    // ─── Core ─────────────────────────────────────────────────────────────────────
    PoolManager internal poolManager;
    FanovoToken internal fanovo;
    WorldCupHook internal wcHook;
    PlayerHook internal playerHook;
    CountryFactory internal countryFactory;
    PlayerFactory internal playerFactory;
    PackOpener internal packOpener;
    PlayerPackOpener internal playerPackOpener;
    CurveRouter internal curveRouter;
    PlayerRouter internal playerRouter;

    // ─── Actors ─────────────────────────────────────────────────────────────────
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public virtual {
        // 1. PoolManager + FANOVO (test contract is owner/holder of full supply)
        poolManager = new PoolManager(address(this));
        fanovo = new FanovoToken(address(this));

        // 2. Hooks at flag-valid addresses
        address wcHookAddr = address(uint160(HOOK_FLAGS) | (uint160(1) << 20));
        address playerHookAddr = address(uint160(HOOK_FLAGS) | (uint160(2) << 20));

        deployCodeTo(
            "WorldCupHook.sol:WorldCupHook", abi.encode(poolManager, fanovo, address(this)), wcHookAddr
        );
        wcHook = WorldCupHook(wcHookAddr);

        deployCodeTo("PlayerHook.sol:PlayerHook", abi.encode(poolManager, address(this)), playerHookAddr);
        playerHook = PlayerHook(playerHookAddr);

        // 3. Countries
        countryFactory = new CountryFactory(address(wcHook), address(this));
        for (uint8 i = 0; i < TOTAL_COUNTRIES; i++) {
            string memory code = string(abi.encodePacked("C", vm.toString(i)));
            CountryToken ct = countryFactory.createCountry(
                string(abi.encodePacked("Country ", vm.toString(i))), code, code
            );
            wcHook.registerCountry(address(ct));
        }
        countryFactory.completeSetup();

        // 4. Players (3 per country: role layout BEST=1, CAPTAIN=0, ROOKIE=2)
        playerFactory = new PlayerFactory(address(playerHook), address(this));
        uint8[3] memory roleRow = [uint8(1), uint8(0), uint8(2)];
        for (uint16 i = 0; i < TOTAL_PLAYERS; i++) {
            uint8 countryIdx = uint8(i / 3);
            uint8 role = roleRow[i % 3];
            address country = address(countryFactory.countries(countryIdx));
            string memory sym = string(abi.encodePacked("P", vm.toString(i)));
            PlayerToken pt = playerFactory.createPlayer(
                countryIdx, role, country, string(abi.encodePacked("Player ", vm.toString(i))), sym
            );
            playerHook.registerPlayer(address(pt));
        }
        playerFactory.completeSetup();

        // 5. Initialize all pools BEFORE finalize (beforeInitialize requires setup incomplete)
        for (uint8 i = 0; i < TOTAL_COUNTRIES; i++) {
            poolManager.initialize(_countryPoolKey(address(countryFactory.countries(i))), SQRT_PRICE_1_1);
        }
        for (uint16 i = 0; i < TOTAL_PLAYERS; i++) {
            PlayerToken pt = playerFactory.players(i);
            poolManager.initialize(_playerPoolKey(address(pt), pt.country()), SQRT_PRICE_1_1);
        }

        // 6. Openers + finalize
        packOpener = new PackOpener(fanovo, wcHook, countryFactory);
        playerPackOpener = new PlayerPackOpener(playerHook, playerFactory);
        wcHook.setPackOpener(address(packOpener));
        playerHook.setPackOpener(address(playerPackOpener));
        wcHook.finalize();
        playerHook.finalize();

        // 7. Routers
        curveRouter = new CurveRouter(poolManager, wcHook, fanovo);
        playerRouter = new PlayerRouter(poolManager, playerHook);
    }

    // ─── Pool key helpers ─────────────────────────────────────────────────────────

    function _countryPoolKey(address country) internal view returns (PoolKey memory) {
        (Currency c0, Currency c1) = address(fanovo) < country
            ? (Currency.wrap(address(fanovo)), Currency.wrap(country))
            : (Currency.wrap(country), Currency.wrap(address(fanovo)));
        return PoolKey({currency0: c0, currency1: c1, fee: POOL_FEE, tickSpacing: POOL_TICK_SPACING, hooks: IHooks(address(wcHook))});
    }

    function _playerPoolKey(address player, address country) internal view returns (PoolKey memory) {
        (Currency c0, Currency c1) = country < player
            ? (Currency.wrap(country), Currency.wrap(player))
            : (Currency.wrap(player), Currency.wrap(country));
        return PoolKey({currency0: c0, currency1: c1, fee: POOL_FEE, tickSpacing: POOL_TICK_SPACING, hooks: IHooks(address(playerHook))});
    }

    // ─── Convenience ────────────────────────────────────────────────────────────

    function _fundFanovo(address to, uint256 amount) internal {
        require(fanovo.transfer(to, amount), "fund failed");
    }

    /// @dev Force WorldCupHook into phase 2 the same way PackOpener does at MAX_PACKS.
    function _activateCountryPhase2() internal {
        vm.prank(address(packOpener));
        wcHook.activatePhase2();
    }
}
