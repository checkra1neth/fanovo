// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title WCTSale
/// @notice Fixed-price WCT sale for USDT. 1 USDT = 2 WCT ($0.50 per WCT).
///         Blocks further purchases after pool is created.
contract WCTSale {
    IERC20 public immutable usdt;
    IERC20 public immutable wct;
    address public treasury;
    address public owner;

    uint256 public constant PRICE_USD = 5e5; // $0.50 in USDT 6-decimals
    uint256 public constant WCT_DECIMALS = 18;
    uint256 public constant USDT_DECIMALS = 6;

    bool public poolCreated;

    event Buy(address indexed buyer, uint256 usdtAmount, uint256 wctAmount);
    event TreasurySet(address indexed treasury);
    event PoolCreated();
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Recovered(address indexed to, uint256 amount);

    error OnlyOwner();
    error PoolAlreadyCreated();
    error InvalidAmount();
    error InsufficientBalance();
    error TreasuryNotSet();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _usdt, address _wct, address _owner) {
        if (_usdt == address(0) || _wct == address(0) || _owner == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        wct = IERC20(_wct);
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /// @notice Buy WCT with USDT. 1 USDT = 2 WCT.
    /// @param usdtAmount Amount of USDT to spend (6 decimals).
    function buy(uint256 usdtAmount) external {
        if (poolCreated) revert PoolAlreadyCreated();
        if (usdtAmount == 0) revert InvalidAmount();
        if (treasury == address(0)) revert TreasuryNotSet();

        // 1 USDT = 2 WCT (price $0.50 per WCT)
        uint256 wctAmount = usdtAmount * 2 * 10 ** (WCT_DECIMALS - USDT_DECIMALS);

        if (wct.balanceOf(address(this)) < wctAmount) revert InsufficientBalance();

        // Pull USDT from buyer to treasury
        bool usdtOk = usdt.transferFrom(msg.sender, treasury, usdtAmount);
        if (!usdtOk) revert TransferFailed();

        // Send WCT to buyer
        bool wctOk = wct.transfer(msg.sender, wctAmount);
        if (!wctOk) revert TransferFailed();

        emit Buy(msg.sender, usdtAmount, wctAmount);
    }

    /// @notice Called by owner after V4 pool is created. Blocks fixed-price sales.
    function createPool() external onlyOwner {
        poolCreated = true;
        emit PoolCreated();
    }

    /// @notice Recover remaining WCT after pool is created.
    function recoverWCT() external onlyOwner {
        uint256 balance = wct.balanceOf(address(this));
        if (balance > 0) {
            bool ok = wct.transfer(owner, balance);
            if (!ok) revert TransferFailed();
            emit Recovered(owner, balance);
        }
    }

    /// @notice View current WCT balance available for sale.
    function availableWCT() external view returns (uint256) {
        return wct.balanceOf(address(this));
    }
}
