// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {WorldCupHook} from "./WorldCupHook.sol";

/// @title CurveRouter
/// @notice Simplified buy/sell router for country tokens via V4 unlock callback
contract CurveRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    WorldCupHook public immutable hook;
    IERC20 public immutable fanovo;

    uint24 public constant POOL_FEE = 0;
    int24 public constant POOL_TICK_SPACING = 60;

    enum Op { BUY, SELL }

    struct Callback {
        Op op;
        address user;
        address country;
        uint256 amountIn;
        uint256 minOut;
    }

    error OnlyPoolManager();
    error SlippageExceeded();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDelta();

    constructor(IPoolManager poolManager_, WorldCupHook hook_, IERC20 fanovo_) {
        if (
            address(poolManager_) == address(0)
                || address(hook_) == address(0)
                || address(fanovo_) == address(0)
        ) revert ZeroAddress();
        poolManager = poolManager_;
        hook = hook_;
        fanovo = fanovo_;
    }

    function buy(address country, uint256 fanovoIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (country == address(0)) revert ZeroAddress();
        if (fanovoIn == 0) revert ZeroAmount();

        fanovo.safeTransferFrom(msg.sender, address(this), fanovoIn);

        bytes memory result = poolManager.unlock(abi.encode(Callback({
            op: Op.BUY,
            user: msg.sender,
            country: country,
            amountIn: fanovoIn,
            minOut: minOut
        })));

        amountOut = abi.decode(result, (uint256));
    }

    function sell(address country, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 fanovoOut)
    {
        if (country == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        IERC20(country).safeTransferFrom(msg.sender, address(this), amountIn);

        bytes memory result = poolManager.unlock(abi.encode(Callback({
            op: Op.SELL,
            user: msg.sender,
            country: country,
            amountIn: amountIn,
            minOut: minOut
        })));

        fanovoOut = abi.decode(result, (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();

        Callback memory cb = abi.decode(data, (Callback));
        PoolKey memory key = _poolKeyFor(cb.country);
        bool fanovoIsCurrency0 = Currency.unwrap(key.currency0) == address(fanovo);

        if (cb.op == Op.BUY) {
            return _doBuy(key, cb, fanovoIsCurrency0);
        } else {
            return _doSell(key, cb, fanovoIsCurrency0);
        }
    }

    function _doBuy(PoolKey memory key, Callback memory cb, bool fanovoIsCurrency0)
        internal
        returns (bytes memory)
    {
        Currency fanovoCurrency = Currency.wrap(address(fanovo));
        poolManager.sync(fanovoCurrency);
        fanovo.safeTransfer(address(poolManager), cb.amountIn);
        poolManager.settle();

        bool zeroForOne = fanovoIsCurrency0;
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(cb.amountIn),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        BalanceDelta delta = poolManager.swap(key, params, "");

        int128 countryDelta = fanovoIsCurrency0 ? delta.amount1() : delta.amount0();
        if (countryDelta <= 0) revert InvalidDelta();
        uint256 amountOut = uint256(int256(countryDelta));

        if (amountOut < cb.minOut) revert SlippageExceeded();

        poolManager.take(Currency.wrap(cb.country), cb.user, amountOut);

        return abi.encode(amountOut);
    }

    function _doSell(PoolKey memory key, Callback memory cb, bool fanovoIsCurrency0)
        internal
        returns (bytes memory)
    {
        Currency countryCurrency = Currency.wrap(cb.country);
        poolManager.sync(countryCurrency);
        IERC20(cb.country).safeTransfer(address(poolManager), cb.amountIn);
        poolManager.settle();

        bool zeroForOne = !fanovoIsCurrency0;
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(cb.amountIn),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        BalanceDelta delta = poolManager.swap(key, params, "");

        int128 fanovoDelta = fanovoIsCurrency0 ? delta.amount0() : delta.amount1();
        if (fanovoDelta <= 0) revert InvalidDelta();
        uint256 fanovoOut = uint256(int256(fanovoDelta));

        if (fanovoOut < cb.minOut) revert SlippageExceeded();

        poolManager.take(Currency.wrap(address(fanovo)), cb.user, fanovoOut);

        return abi.encode(fanovoOut);
    }

    function _poolKeyFor(address country) internal view returns (PoolKey memory) {
        (Currency c0, Currency c1) = address(fanovo) < country
            ? (Currency.wrap(address(fanovo)), Currency.wrap(country))
            : (Currency.wrap(country), Currency.wrap(address(fanovo)));
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: POOL_FEE,
            tickSpacing: POOL_TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }
}
