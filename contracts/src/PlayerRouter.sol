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

import {PlayerHook} from "./PlayerHook.sol";
import {PlayerToken} from "./PlayerToken.sol";

/// @title PlayerRouter
/// @notice Simplified buy/sell router for player tokens via V4 unlock callback
contract PlayerRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    PlayerHook public immutable hook;

    uint24 public constant POOL_FEE = 0;
    int24 public constant POOL_TICK_SPACING = 60;

    enum Op { BUY, SELL }

    struct Callback {
        Op op;
        address user;
        address player;
        address country;
        uint256 amountIn;
        uint256 minOut;
    }

    error OnlyPoolManager();
    error SlippageExceeded();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDelta();
    error PlayerNotRegistered();

    constructor(IPoolManager poolManager_, PlayerHook hook_) {
        if (address(poolManager_) == address(0) || address(hook_) == address(0)) revert ZeroAddress();
        poolManager = poolManager_;
        hook = hook_;
    }

    function _countryOf(address player) internal view returns (address country) {
        country = PlayerToken(player).country();
        if (country == address(0)) revert PlayerNotRegistered();
    }

    function buy(address player, uint256 countryIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (player == address(0)) revert ZeroAddress();
        if (countryIn == 0) revert ZeroAmount();

        address country = _countryOf(player);
        IERC20(country).safeTransferFrom(msg.sender, address(this), countryIn);

        bytes memory result = poolManager.unlock(abi.encode(Callback({
            op: Op.BUY,
            user: msg.sender,
            player: player,
            country: country,
            amountIn: countryIn,
            minOut: minOut
        })));

        amountOut = abi.decode(result, (uint256));
    }

    function sell(address player, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 countryOut)
    {
        if (player == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        address country = _countryOf(player);
        IERC20(player).safeTransferFrom(msg.sender, address(this), amountIn);

        bytes memory result = poolManager.unlock(abi.encode(Callback({
            op: Op.SELL,
            user: msg.sender,
            player: player,
            country: country,
            amountIn: amountIn,
            minOut: minOut
        })));

        countryOut = abi.decode(result, (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();

        Callback memory cb = abi.decode(data, (Callback));
        PoolKey memory key = _poolKeyFor(cb.player, cb.country);
        bool countryIsCurrency0 = Currency.unwrap(key.currency0) == cb.country;

        if (cb.op == Op.BUY) {
            return _doBuy(key, cb, countryIsCurrency0);
        } else {
            return _doSell(key, cb, countryIsCurrency0);
        }
    }

    function _doBuy(PoolKey memory key, Callback memory cb, bool countryIsCurrency0)
        internal
        returns (bytes memory)
    {
        Currency countryCurrency = Currency.wrap(cb.country);
        poolManager.sync(countryCurrency);
        IERC20(cb.country).safeTransfer(address(poolManager), cb.amountIn);
        poolManager.settle();

        bool zeroForOne = countryIsCurrency0;
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(cb.amountIn),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        BalanceDelta delta = poolManager.swap(key, params, "");

        int128 playerDelta = countryIsCurrency0 ? delta.amount1() : delta.amount0();
        if (playerDelta <= 0) revert InvalidDelta();
        uint256 amountOut = uint256(int256(playerDelta));

        if (amountOut < cb.minOut) revert SlippageExceeded();

        poolManager.take(Currency.wrap(cb.player), cb.user, amountOut);

        return abi.encode(amountOut);
    }

    function _doSell(PoolKey memory key, Callback memory cb, bool countryIsCurrency0)
        internal
        returns (bytes memory)
    {
        Currency playerCurrency = Currency.wrap(cb.player);
        poolManager.sync(playerCurrency);
        IERC20(cb.player).safeTransfer(address(poolManager), cb.amountIn);
        poolManager.settle();

        bool zeroForOne = !countryIsCurrency0;
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(cb.amountIn),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        BalanceDelta delta = poolManager.swap(key, params, "");

        int128 countryDelta = countryIsCurrency0 ? delta.amount0() : delta.amount1();
        if (countryDelta <= 0) revert InvalidDelta();
        uint256 countryOut = uint256(int256(countryDelta));

        if (countryOut < cb.minOut) revert SlippageExceeded();

        poolManager.take(Currency.wrap(cb.country), cb.user, countryOut);

        return abi.encode(countryOut);
    }

    function _poolKeyFor(address player, address country) internal view returns (PoolKey memory) {
        (Currency c0, Currency c1) = country < player
            ? (Currency.wrap(country), Currency.wrap(player))
            : (Currency.wrap(player), Currency.wrap(country));
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: POOL_FEE,
            tickSpacing: POOL_TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }
}
