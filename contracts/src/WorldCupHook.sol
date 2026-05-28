// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SafeCast} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/math/SafeCast.sol";
import {Pausable} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/Pausable.sol";
import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {CountryToken} from "./CountryToken.sol";
import {FanovoToken} from "./FanovoToken.sol";

/// @title WorldCupHook
/// @notice Uniswap V4 Hook implementing bonding curves for World Cup country tokens
/// @dev Mirrors PITCH CurveHook architecture:
///      - State: realFanovo (uint128) + circulating (uint128) per country
///      - Formula: VIRTUAL_FANOVO + realFanovo as virtual+real reserve
///      - Settlement: take → burn → mint → sync → transfer → settle
///      - Pack minting via authorized packOpener only
///      - setupComplete + finalize() pattern
///      - beforeAddLiquidity/beforeRemoveLiquidity/beforeDonate all revert
contract WorldCupHook is IHooks, Pausable {
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;
    using SafeCast for int256;

    // ─── Immutables ──────────────────────────────────────────────────────────────

    IPoolManager public immutable poolManager;
    address public immutable owner;
    FanovoToken public immutable fanovo;

    // ─── Constants ───────────────────────────────────────────────────────────────

    uint256 public constant SWAP_FEE_BPS = 500; // 5%
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant VIRTUAL_FANOVO = 20_000e18;
    uint256 public constant VIRTUAL_COUNTRY = 20_000e18;
    uint256 public constant REQUIRED_COUNTRIES = 48;
    uint256 public constant PACK_MINT_THRESHOLD = 18_000e18;

    uint256 public constant PACK_FANOVO_AMOUNT = 1e18;
    uint256 public constant PACK_BURN_AMOUNT = 5e16;
    uint256 public constant PACK_TO_CURVE_AMOUNT = 95e16;

    // ─── State ───────────────────────────────────────────────────────────────────

    struct CurveState {
        uint128 realFanovo;     // Real FANOVO held in curve (NOT including virtual)
        uint128 circulating;    // Country tokens minted (circulating supply)
        bool initialized;
    }

    mapping(address => CurveState) public curves;
    address[] public allCountries;

    mapping(PoolId => address) public poolToCountry;

    address public packOpener;
    bool public setupComplete;
    bool public phase2Active;

    // Reentrancy guard
    uint256 private _locked = 1;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event CountryRegistered(address indexed country, uint256 index);
    event PoolBound(PoolId indexed poolId, address indexed country);
    event PackOpenerSet(address indexed packOpener);
    event SetupFinalized();
    event Phase2Activated(uint256 timestamp);
    event PackMinted(address indexed user, address indexed country, uint256 toCurve);
    event Buy(address indexed user, address indexed country, uint256 fanovoIn, uint256 countryOut, uint256 burned);
    event Sell(address indexed user, address indexed country, uint256 countryIn, uint256 fanovoOut, uint256 burned);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error OnlyOwner();
    error OnlyPoolManager();
    error OnlyPackOpener();
    error Reentrancy();
    error ZeroAddress();
    error ZeroAmount();
    error SetupAlreadyComplete();
    error SetupIncomplete();
    error PackOpenerAlreadySet();
    error PackOpenerNotSet();
    error TooManyCountries();
    error WrongCountryCount();
    error InvalidCountryBinding();
    error AlreadyRegistered();
    error CountryNotRegistered();
    error CountryAlreadyHasPool();
    error InvalidPoolKey();
    error PhaseGate();
    error CapReached();
    error InsufficientLiquidity();
    error AsymptoteReached();
    error ExactOutputUnsupported();
    error PausedError();
    error NotDeployer();

    // ─── Modifiers ───────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyPM() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    modifier onlyPackOpenerMod() {
        if (msg.sender != packOpener) revert OnlyPackOpener();
        _;
    }

    modifier duringSetup() {
        if (setupComplete) revert SetupAlreadyComplete();
        _;
    }

    modifier afterSetup() {
        if (!setupComplete) revert SetupIncomplete();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────────

    constructor(IPoolManager _pm, FanovoToken _fanovo, address _owner) {
        if (address(_pm) == address(0)) revert ZeroAddress();
        if (address(_fanovo) == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();
        poolManager = _pm;
        owner = _owner;
        fanovo = _fanovo;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────────

    function registerCountry(address country) external onlyOwner duringSetup {
        if (country == address(0)) revert ZeroAddress();
        if (allCountries.length >= REQUIRED_COUNTRIES) revert TooManyCountries();
        if (CountryToken(country).hook() != address(this)) revert InvalidCountryBinding();

        CurveState storage state = curves[country];
        if (state.initialized) revert AlreadyRegistered();

        state.initialized = true;
        uint256 idx = allCountries.length;
        allCountries.push(country);
        emit CountryRegistered(country, idx);
    }

    function setPackOpener(address packOpener_) external onlyOwner duringSetup {
        if (packOpener != address(0)) revert PackOpenerAlreadySet();
        if (packOpener_ == address(0)) revert ZeroAddress();
        packOpener = packOpener_;
        emit PackOpenerSet(packOpener_);
    }

    function finalize() external onlyOwner duringSetup {
        if (packOpener == address(0)) revert PackOpenerNotSet();
        if (allCountries.length != REQUIRED_COUNTRIES) revert WrongCountryCount();
        setupComplete = true;
        emit SetupFinalized();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Pack Minting (called by PackOpener only) ────────────────────────────────

    /// @notice Mint 1 country token to user via pack opening
    /// @dev Called by packOpener. Transfers PACK_FANOVO_AMOUNT from packOpener,
    ///      burns PACK_BURN_AMOUNT, seeds PACK_TO_CURVE_AMOUNT into curve.
    function packMint(address user, address country)
        external
        onlyPackOpenerMod
        afterSetup
        whenNotPaused
        nonReentrant
    {
        if (phase2Active) revert PhaseGate();
        if (user == address(0)) revert ZeroAddress();

        CurveState storage state = curves[country];
        if (!state.initialized) revert CountryNotRegistered();

        uint256 newCirculating = uint256(state.circulating) + 1e18;
        if (newCirculating >= PACK_MINT_THRESHOLD) revert CapReached();

        state.realFanovo = (uint256(state.realFanovo) + PACK_TO_CURVE_AMOUNT).toUint128();
        state.circulating = newCirculating.toUint128();

        // Transfer FANOVO from packOpener to this contract
        bool success = fanovo.transferFrom(packOpener, address(this), PACK_FANOVO_AMOUNT);
        require(success, "Transfer failed");
        // Burn the fee portion
        fanovo.burn(PACK_BURN_AMOUNT);
        // Mint 1 country token to user
        CountryToken(country).mint(user, 1e18);

        emit PackMinted(user, country, PACK_TO_CURVE_AMOUNT);
    }

    /// @notice Activate phase 2 (trading) — called by packOpener
    function activatePhase2() external onlyPackOpenerMod afterSetup {
        if (phase2Active) revert PhaseGate();
        phase2Active = true;
        emit Phase2Activated(block.timestamp);
    }

    // ─── Hook Callbacks ──────────────────────────────────────────────────────────

    /// @notice Pool binding — binds pool to country during initialization
    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPM returns (bytes4) {
        if (sender != owner) revert NotDeployer();
        if (setupComplete) revert SetupAlreadyComplete();

        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        address country;
        if (c0 == address(fanovo)) {
            country = c1;
        } else if (c1 == address(fanovo)) {
            country = c0;
        } else {
            revert InvalidPoolKey();
        }

        CurveState storage state = curves[country];
        if (!state.initialized) revert CountryNotRegistered();

        PoolId poolId = key.toId();
        if (poolToCountry[poolId] != address(0)) revert CountryAlreadyHasPool();

        poolToCountry[poolId] = country;
        emit PoolBound(poolId, country);

        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external view onlyPM returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    /// @notice Block all external liquidity additions
    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert InvalidPoolKey();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external view onlyPM returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    /// @notice Block all external liquidity removals
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert InvalidPoolKey();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external view onlyPM returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    /// @notice Core swap logic — implements custom bonding curve with 5% burn
    /// @dev Settlement pattern: take → burn → mint → sync → transfer → settle
    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        onlyPM
        whenNotPaused
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (paused()) revert PausedError();
        if (!phase2Active) revert PhaseGate();
        if (params.amountSpecified >= 0) revert ExactOutputUnsupported();

        PoolId poolId = key.toId();
        address country = poolToCountry[poolId];
        if (country == address(0)) revert CountryNotRegistered();

        bool fanovoIsCurrency0 = Currency.unwrap(key.currency0) == address(fanovo);
        bool isBuy = (params.zeroForOne == fanovoIsCurrency0);

        uint256 amountIn = uint256(-params.amountSpecified);
        if (amountIn == 0) revert ZeroAmount();

        if (isBuy) {
            return _executeBuy(country, amountIn);
        } else {
            return _executeSell(country, amountIn);
        }
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        view
        onlyPM
        returns (bytes4, int128)
    {
        return (IHooks.afterSwap.selector, 0);
    }

    /// @notice Block all donations
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert InvalidPoolKey();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        view
        onlyPM
        returns (bytes4)
    {
        return IHooks.afterDonate.selector;
    }

    // ─── Internal: Swap Execution ────────────────────────────────────────────────

    /// @dev Buy: FANOVO in → Country out
    ///      Formula: amountOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn)
    ///      Settlement: take FANOVO → burn fee → mint country → sync → transfer → settle
    function _executeBuy(address country, uint256 amountIn)
        internal
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        CurveState storage state = curves[country];

        uint256 burnAmount = (amountIn * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 effectiveIn = amountIn - burnAmount;

        uint256 vfPlusRf = VIRTUAL_FANOVO + uint256(state.realFanovo);
        uint256 vcMinusCirc = VIRTUAL_COUNTRY - uint256(state.circulating);
        uint256 amountOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn);

        if (amountOut == 0) revert ZeroAmount();
        if (amountOut >= vcMinusCirc) revert AsymptoteReached();

        state.realFanovo = (uint256(state.realFanovo) + effectiveIn).toUint128();
        state.circulating = (uint256(state.circulating) + amountOut).toUint128();

        // Settlement: take → burn → mint → sync → transfer → settle
        Currency fanovoCurrency = Currency.wrap(address(fanovo));
        poolManager.take(fanovoCurrency, address(this), amountIn);
        fanovo.burn(burnAmount);

        Currency countryCurrency = Currency.wrap(country);
        CountryToken(country).mint(address(this), amountOut);
        poolManager.sync(countryCurrency);
        bool success = IERC20(country).transfer(address(poolManager), amountOut);
        require(success, "Transfer failed");
        poolManager.settle();

        emit Buy(tx.origin, country, amountIn, amountOut, burnAmount);

        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(amountIn.toInt256().toInt128(), -amountOut.toInt256().toInt128()),
            0
        );
    }

    /// @dev Sell: Country in → FANOVO out
    ///      Formula: grossOut = (vfPlusRf * amountIn) / (vcMinusCirc + amountIn)
    ///      Settlement: take country → burn country → burn FANOVO fee → sync FANOVO → transfer → settle
    function _executeSell(address country, uint256 amountIn)
        internal
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        CurveState storage state = curves[country];

        if (amountIn > uint256(state.circulating)) revert InsufficientLiquidity();

        uint256 vfPlusRf = VIRTUAL_FANOVO + uint256(state.realFanovo);
        uint256 vcMinusCirc = VIRTUAL_COUNTRY - uint256(state.circulating);
        uint256 grossFifaOut = (vfPlusRf * amountIn) / (vcMinusCirc + amountIn);

        if (grossFifaOut == 0) revert ZeroAmount();
        if (grossFifaOut > uint256(state.realFanovo)) revert InsufficientLiquidity();

        uint256 burnAmount = (grossFifaOut * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 fanovoToUser = grossFifaOut - burnAmount;

        state.realFanovo = (uint256(state.realFanovo) - grossFifaOut).toUint128();
        state.circulating = (uint256(state.circulating) - amountIn).toUint128();

        // Settlement: take country → burn country → burn FANOVO fee → sync FANOVO → transfer → settle
        Currency countryCurrency = Currency.wrap(country);
        poolManager.take(countryCurrency, address(this), amountIn);
        CountryToken(country).burn(address(this), amountIn);

        fanovo.burn(burnAmount);
        Currency fanovoCurrency = Currency.wrap(address(fanovo));
        poolManager.sync(fanovoCurrency);
        bool success = IERC20(address(fanovo)).transfer(address(poolManager), fanovoToUser);
        require(success, "Transfer failed");
        poolManager.settle();

        emit Sell(tx.origin, country, amountIn, fanovoToUser, burnAmount);

        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(amountIn.toInt256().toInt128(), -fanovoToUser.toInt256().toInt128()),
            0
        );
    }

    // ─── View Functions ──────────────────────────────────────────────────────────

    /// @notice Current price of country token in FANOVO (18 decimals)
    function currentPrice(address country) external view returns (uint256) {
        CurveState memory s = curves[country];
        if (!s.initialized) return 0;
        uint256 vfPlusRf = VIRTUAL_FANOVO + uint256(s.realFanovo);
        if (uint256(s.circulating) >= VIRTUAL_COUNTRY) return type(uint256).max;
        uint256 vcMinusCirc = VIRTUAL_COUNTRY - uint256(s.circulating);
        return (vfPlusRf * 1e18) / vcMinusCirc;
    }

    /// @notice Quote buy: how many country tokens for a given FANOVO input
    function quoteBuy(address country, uint256 fanovoIn) external view returns (uint256 countryOut) {
        CurveState memory s = curves[country];
        if (!s.initialized) return 0;
        uint256 circulating = uint256(s.circulating);
        if (circulating >= VIRTUAL_COUNTRY) return 0;
        uint256 burnAmount = (fanovoIn * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 effectiveIn = fanovoIn - burnAmount;
        uint256 vfPlusRf = VIRTUAL_FANOVO + uint256(s.realFanovo);
        uint256 vcMinusCirc = VIRTUAL_COUNTRY - circulating;
        countryOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn);
    }

    /// @notice Quote sell: how many FANOVO for a given country input
    function quoteSell(address country, uint256 countryIn) external view returns (uint256 fanovoOut) {
        CurveState memory s = curves[country];
        if (!s.initialized || countryIn > s.circulating) return 0;
        uint256 vfPlusRf = VIRTUAL_FANOVO + uint256(s.realFanovo);
        uint256 vcMinusCirc = VIRTUAL_COUNTRY - uint256(s.circulating);
        uint256 grossFanovoOut = (vfPlusRf * countryIn) / (vcMinusCirc + countryIn);
        uint256 burnAmount = (grossFanovoOut * SWAP_FEE_BPS) / BPS_DENOM;
        fanovoOut = grossFanovoOut - burnAmount;
    }

    /// @notice Check if a country can still receive pack mints
    function canPackMint(address country) external view returns (bool) {
        CurveState memory s = curves[country];
        if (!s.initialized) return false;
        if (phase2Active) return false;
        if (paused()) return false;
        return uint256(s.circulating) + 1e18 < PACK_MINT_THRESHOLD;
    }

    function getCountryToken(uint256 index) external view returns (address) {
        return allCountries[index];
    }

    function countriesLength() external view returns (uint256) {
        return allCountries.length;
    }

    function getCurveState(address country) external view returns (uint128 realFanovo_, uint128 circulating_, bool initialized_) {
        CurveState memory s = curves[country];
        return (s.realFanovo, s.circulating, s.initialized);
    }
}
