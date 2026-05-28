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
import {PlayerToken} from "./PlayerToken.sol";

/// @title PlayerHook
/// @notice Uniswap V4 Hook implementing bonding curves for player tokens
/// @dev Mirrors PITCH PlayerCurveHook architecture:
///      - State: realCountry (uint128) + circulating (uint128) per player
///      - Virtual reserves = maxSupply per role
///      - Settlement: take → burn/transfer → mint → sync → transfer → settle
///      - Pack minting via authorized packOpener only
///      - setupComplete + finalize() pattern
///      - phase2ByCountry activates per country
///      - beforeAddLiquidity/beforeRemoveLiquidity/beforeDonate all revert
contract PlayerHook is IHooks, Pausable {
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;
    using SafeCast for int256;

    // ─── Immutables ──────────────────────────────────────────────────────────────

    IPoolManager public immutable poolManager;
    address public immutable owner;

    // ─── Constants ───────────────────────────────────────────────────────────────

    uint256 public constant PACK_COUNTRY_AMOUNT = 1e18;
    uint256 public constant PACK_BURN_AMOUNT = 5e16;
    uint256 public constant PACK_TO_CURVE_AMOUNT = 95e16;
    uint256 public constant SWAP_FEE_BPS = 500;
    uint256 public constant BPS_DENOM = 10_000;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint8 public constant ROLE_CAPTAIN = 0;
    uint8 public constant ROLE_BEST = 1;
    uint8 public constant ROLE_ROOKIE = 2;

    uint16 public constant CAP_CAPTAIN = 150;
    uint16 public constant CAP_BEST = 50;
    uint16 public constant CAP_ROOKIE = 250;
    uint16 public constant PACKS_PER_COUNTRY = 450;
    uint16 public constant TOTAL_COUNTRIES = 48;
    uint16 public constant TOTAL_PLAYERS_REQUIRED = 144;

    uint256 public constant MAX_SUPPLY_CAPTAIN = 1_500e18;
    uint256 public constant MAX_SUPPLY_BEST = 500e18;
    uint256 public constant MAX_SUPPLY_ROOKIE = 2_500e18;

    // ─── Types ───────────────────────────────────────────────────────────────────

    struct CurveState {
        uint128 realCountry;    // Real country tokens held in curve
        uint128 circulating;    // Player tokens minted (circulating supply)
        address countryToken;   // The country token address for this player
        uint8 countryIndex;     // Country index (0-47)
        uint8 role;             // Role (0=Captain, 1=Best, 2=Rookie)
        uint16 packsMinted;     // Packs minted for this player
        bool initialized;
    }

    // ─── State ───────────────────────────────────────────────────────────────────

    mapping(address => CurveState) public curves;
    address[] public allPlayers;

    mapping(uint8 => uint16) public packsByCountry;
    mapping(uint8 => bool) public phase2ByCountry;
    mapping(PoolId => address) public poolToPlayer;

    address public packOpener;
    bool public setupComplete;

    // Reentrancy guard
    uint256 private _locked = 1;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event PlayerRegistered(address indexed player, address indexed country, uint8 countryIndex, uint8 role, uint256 index);
    event PoolBound(PoolId indexed poolId, address indexed player);
    event PackOpenerSet(address indexed packOpener);
    event SetupFinalized();
    event PackMinted(address indexed user, address indexed player, uint8 countryIndex, uint8 role);
    event CountryPhase2Activated(uint8 indexed countryIndex, uint256 timestamp);
    event Buy(address indexed user, address indexed player, uint256 countryIn, uint256 playerOut, uint256 burned);
    event Sell(address indexed user, address indexed player, uint256 playerIn, uint256 countryOut, uint256 burned);

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
    error TooManyPlayers();
    error WrongPlayerCount();
    error InvalidPlayerBinding();
    error AlreadyRegistered();
    error PlayerNotRegistered();
    error PlayerAlreadyHasPool();
    error InvalidPoolKey();
    error InvalidCountryIndex();
    error InvalidRole();
    error PhaseGate();
    error CountryCapReached();
    error RoleCapReached();
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

    constructor(IPoolManager _pm, address _owner) {
        if (address(_pm) == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();
        poolManager = _pm;
        owner = _owner;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────────

    /// @notice Register a player token (must have hook() == address(this))
    function registerPlayer(address player) external onlyOwner duringSetup {
        if (player == address(0)) revert ZeroAddress();
        if (allPlayers.length >= TOTAL_PLAYERS_REQUIRED) revert TooManyPlayers();

        PlayerToken token = PlayerToken(player);
        if (token.hook() != address(this)) revert InvalidPlayerBinding();

        uint8 countryIdx = token.countryIndex();
        uint8 roleVal = token.role();
        address countryAddr = token.country();
        if (countryIdx >= TOTAL_COUNTRIES) revert InvalidCountryIndex();
        if (roleVal > ROLE_ROOKIE) revert InvalidRole();
        if (countryAddr == address(0)) revert ZeroAddress();

        CurveState storage state = curves[player];
        if (state.initialized) revert AlreadyRegistered();

        state.initialized = true;
        state.countryIndex = countryIdx;
        state.role = roleVal;
        state.countryToken = countryAddr;

        uint256 idx = allPlayers.length;
        allPlayers.push(player);
        emit PlayerRegistered(player, countryAddr, countryIdx, roleVal, idx);
    }

    function setPackOpener(address packOpener_) external onlyOwner duringSetup {
        if (packOpener != address(0)) revert PackOpenerAlreadySet();
        if (packOpener_ == address(0)) revert ZeroAddress();
        packOpener = packOpener_;
        emit PackOpenerSet(packOpener_);
    }

    function finalize() external onlyOwner duringSetup {
        if (packOpener == address(0)) revert PackOpenerNotSet();
        if (allPlayers.length != TOTAL_PLAYERS_REQUIRED) revert WrongPlayerCount();
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

    /// @notice Mint 1 player token to user via pack opening
    /// @dev Called by packOpener. Transfers PACK_COUNTRY_AMOUNT from packOpener,
    ///      sends PACK_BURN_AMOUNT to DEAD_ADDRESS, seeds PACK_TO_CURVE_AMOUNT into curve.
    function packMint(address user, address player)
        external
        onlyPackOpenerMod
        afterSetup
        whenNotPaused
        nonReentrant
    {
        if (user == address(0)) revert ZeroAddress();

        CurveState storage state = curves[player];
        if (!state.initialized) revert PlayerNotRegistered();
        if (phase2ByCountry[state.countryIndex]) revert PhaseGate();

        uint16 limit = roleCap(state.role);
        uint16 newPlayerCount = state.packsMinted + 1;
        if (newPlayerCount > limit) revert RoleCapReached();

        uint16 newCountryCount = packsByCountry[state.countryIndex] + 1;
        if (newCountryCount > PACKS_PER_COUNTRY) revert CountryCapReached();

        state.packsMinted = newPlayerCount;
        state.realCountry = (uint256(state.realCountry) + PACK_TO_CURVE_AMOUNT).toUint128();
        state.circulating = (uint256(state.circulating) + PACK_COUNTRY_AMOUNT).toUint128();
        packsByCountry[state.countryIndex] = newCountryCount;

        // Transfer country token from packOpener
        bool success = IERC20(state.countryToken).transferFrom(packOpener, address(this), PACK_COUNTRY_AMOUNT);
        require(success, "Transfer failed");
        // Burn portion to DEAD_ADDRESS
        bool burnSuccess = IERC20(state.countryToken).transfer(DEAD_ADDRESS, PACK_BURN_AMOUNT);
        require(burnSuccess, "Burn transfer failed");
        // Mint player token to user
        PlayerToken(player).mint(user, PACK_COUNTRY_AMOUNT);

        emit PackMinted(user, player, state.countryIndex, state.role);

        // Activate trading if all packs for this country are opened
        if (newCountryCount == PACKS_PER_COUNTRY) {
            phase2ByCountry[state.countryIndex] = true;
            emit CountryPhase2Activated(state.countryIndex, block.timestamp);
        }
    }

    // ─── Hook Callbacks ──────────────────────────────────────────────────────────

    /// @notice Pool binding — detect player + country pair and bind
    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPM returns (bytes4) {
        if (sender != owner) revert NotDeployer();
        if (setupComplete) revert SetupAlreadyComplete();

        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);

        address player;
        address expectedCountry;
        if (curves[c0].initialized) {
            player = c0;
            expectedCountry = c1;
        } else if (curves[c1].initialized) {
            player = c1;
            expectedCountry = c0;
        } else {
            revert InvalidPoolKey();
        }

        if (curves[player].countryToken != expectedCountry) revert InvalidPoolKey();

        PoolId poolId = key.toId();
        if (poolToPlayer[poolId] != address(0)) revert PlayerAlreadyHasPool();

        poolToPlayer[poolId] = player;
        emit PoolBound(poolId, player);

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

    /// @notice Core swap logic — implements custom bonding curve for player tokens
    /// @dev Settlement: take → burn/transfer → mint → sync → transfer → settle
    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        onlyPM
        whenNotPaused
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (paused()) revert PausedError();
        if (params.amountSpecified >= 0) revert ExactOutputUnsupported();

        PoolId poolId = key.toId();
        address player = poolToPlayer[poolId];
        if (player == address(0)) revert PlayerNotRegistered();

        CurveState storage state = curves[player];
        if (!phase2ByCountry[state.countryIndex]) revert PhaseGate();

        address country = state.countryToken;
        bool countryIsCurrency0 = Currency.unwrap(key.currency0) == country;
        bool isBuy = (params.zeroForOne == countryIsCurrency0);

        uint256 amountIn = uint256(-params.amountSpecified);
        if (amountIn == 0) revert ZeroAmount();

        if (isBuy) {
            return _executeBuy(player, state, country, amountIn);
        } else {
            return _executeSell(player, state, country, amountIn);
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

    /// @dev Buy: CountryToken in → PlayerToken out
    ///      Settlement: take country → transfer burn to DEAD → mint player → sync → transfer → settle
    function _executeBuy(
        address player,
        CurveState storage state,
        address country,
        uint256 amountIn
    ) internal returns (bytes4, BeforeSwapDelta, uint24) {
        uint256 burnAmount = (amountIn * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 effectiveIn = amountIn - burnAmount;

        uint256 virtuals = maxSupply(state.role);
        uint256 vfPlusRf = virtuals + uint256(state.realCountry);
        uint256 vcMinusCirc = virtuals - uint256(state.circulating);
        uint256 amountOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn);

        if (amountOut == 0) revert ZeroAmount();
        if (amountOut >= vcMinusCirc) revert AsymptoteReached();

        state.realCountry = (uint256(state.realCountry) + effectiveIn).toUint128();
        state.circulating = (uint256(state.circulating) + amountOut).toUint128();

        // Settlement: take → transfer burn → mint → sync → transfer → settle
        Currency countryCurrency = Currency.wrap(country);
        poolManager.take(countryCurrency, address(this), amountIn);
        bool burnSuccess = IERC20(country).transfer(DEAD_ADDRESS, burnAmount);
        require(burnSuccess, "Burn failed");

        Currency playerCurrency = Currency.wrap(player);
        PlayerToken(player).mint(address(this), amountOut);
        poolManager.sync(playerCurrency);
        bool success = IERC20(player).transfer(address(poolManager), amountOut);
        require(success, "Transfer failed");
        poolManager.settle();

        emit Buy(tx.origin, player, amountIn, amountOut, burnAmount);

        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(amountIn.toInt256().toInt128(), -amountOut.toInt256().toInt128()),
            0
        );
    }

    /// @dev Sell: PlayerToken in → CountryToken out
    ///      Settlement: take player → burn player → sync country → transfer → settle (burn to DEAD)
    function _executeSell(
        address player,
        CurveState storage state,
        address country,
        uint256 amountIn
    ) internal returns (bytes4, BeforeSwapDelta, uint24) {
        if (amountIn > uint256(state.circulating)) revert InsufficientLiquidity();

        uint256 virtuals = maxSupply(state.role);
        uint256 vfPlusRf = virtuals + uint256(state.realCountry);
        uint256 vcMinusCirc = virtuals - uint256(state.circulating);
        uint256 grossCountryOut = (vfPlusRf * amountIn) / (vcMinusCirc + amountIn);

        if (grossCountryOut == 0) revert ZeroAmount();
        if (grossCountryOut > uint256(state.realCountry)) revert InsufficientLiquidity();

        uint256 burnAmount = (grossCountryOut * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 countryToUser = grossCountryOut - burnAmount;

        state.realCountry = (uint256(state.realCountry) - grossCountryOut).toUint128();
        state.circulating = (uint256(state.circulating) - amountIn).toUint128();

        // Settlement: take player → burn player → transfer burn → sync country → transfer → settle
        Currency playerCurrency = Currency.wrap(player);
        poolManager.take(playerCurrency, address(this), amountIn);
        PlayerToken(player).burn(address(this), amountIn);

        bool burnSuccess = IERC20(country).transfer(DEAD_ADDRESS, burnAmount);
        require(burnSuccess, "Burn failed");

        Currency countryCurrency = Currency.wrap(country);
        poolManager.sync(countryCurrency);
        bool success = IERC20(country).transfer(address(poolManager), countryToUser);
        require(success, "Transfer failed");
        poolManager.settle();

        emit Sell(tx.origin, player, amountIn, countryToUser, burnAmount);

        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(amountIn.toInt256().toInt128(), -countryToUser.toInt256().toInt128()),
            0
        );
    }

    // ─── View Functions ──────────────────────────────────────────────────────────

    function canPackMint(address player) external view returns (bool) {
        CurveState memory s = curves[player];
        if (!s.initialized) return false;
        if (phase2ByCountry[s.countryIndex]) return false;
        if (paused()) return false;
        if (s.packsMinted >= roleCap(s.role)) return false;
        return packsByCountry[s.countryIndex] < PACKS_PER_COUNTRY;
    }

    function currentPrice(address player) external view returns (uint256) {
        CurveState memory s = curves[player];
        if (!s.initialized) return 0;
        uint256 virtuals = maxSupply(s.role);
        uint256 circulating = uint256(s.circulating);
        if (circulating >= virtuals) return type(uint256).max;
        uint256 vcMinusCirc = virtuals - circulating;
        uint256 vfPlusRf = virtuals + uint256(s.realCountry);
        return (vfPlusRf * 1e18) / vcMinusCirc;
    }

    /// @notice Quote buy: how many player tokens for a given country token input
    function quoteBuy(address player, uint256 countryIn) external view returns (uint256 playerOut) {
        CurveState memory s = curves[player];
        if (!s.initialized) return 0;
        uint256 virtuals = maxSupply(s.role);
        uint256 circulating = uint256(s.circulating);
        if (circulating >= virtuals) return 0;
        uint256 burnAmount = (countryIn * SWAP_FEE_BPS) / BPS_DENOM;
        uint256 effectiveIn = countryIn - burnAmount;
        uint256 vfPlusRf = virtuals + uint256(s.realCountry);
        uint256 vcMinusCirc = virtuals - circulating;
        playerOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn);
    }

    /// @notice Quote sell: how many country tokens for a given player input
    function quoteSell(address player, uint256 playerIn) external view returns (uint256 countryOut) {
        CurveState memory s = curves[player];
        if (!s.initialized || playerIn > s.circulating) return 0;
        uint256 virtuals = maxSupply(s.role);
        uint256 circulating = uint256(s.circulating);
        if (circulating >= virtuals) return 0;
        uint256 vfPlusRf = virtuals + uint256(s.realCountry);
        uint256 vcMinusCirc = virtuals - circulating;
        uint256 grossCountryOut = (vfPlusRf * playerIn) / (vcMinusCirc + playerIn);
        if (grossCountryOut > uint256(s.realCountry)) return 0;
        uint256 burnAmount = (grossCountryOut * SWAP_FEE_BPS) / BPS_DENOM;
        countryOut = grossCountryOut - burnAmount;
    }

    /// @notice How many packs remain for a given country
    function packsRemainingForCountry(uint8 countryIndex) external view returns (uint16) {
        if (countryIndex >= TOTAL_COUNTRIES) return 0;
        uint16 opened = packsByCountry[countryIndex];
        if (opened >= PACKS_PER_COUNTRY) return 0;
        return PACKS_PER_COUNTRY - opened;
    }

    function getPlayerReserves(address player) external view returns (uint128 realCountry_, uint128 circulating_) {
        CurveState memory s = curves[player];
        return (s.realCountry, s.circulating);
    }

    function playersLength() external view returns (uint256) {
        return allPlayers.length;
    }

    function getPlayer(uint256 index) external view returns (address) {
        return allPlayers[index];
    }

    // ─── Pure Helpers ────────────────────────────────────────────────────────────

    function roleCap(uint8 role) public pure returns (uint16) {
        if (role == ROLE_CAPTAIN) return CAP_CAPTAIN;
        if (role == ROLE_BEST) return CAP_BEST;
        if (role == ROLE_ROOKIE) return CAP_ROOKIE;
        revert InvalidRole();
    }

    function maxSupply(uint8 role) public pure returns (uint256) {
        if (role == ROLE_CAPTAIN) return MAX_SUPPLY_CAPTAIN;
        if (role == ROLE_BEST) return MAX_SUPPLY_BEST;
        if (role == ROLE_ROOKIE) return MAX_SUPPLY_ROOKIE;
        revert InvalidRole();
    }
}
