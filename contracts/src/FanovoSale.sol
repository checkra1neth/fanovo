// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title FanovoSale
/// @notice Fixed-price FANOVO sale for USDT. 1 USDT = 2 FANOVO ($0.50 per FANOVO).
///         Blocks further purchases after pool is created.
contract FanovoSale {
    IERC20 public immutable usdt;
    IERC20 public immutable fanovo;
    address public treasury;
    address public owner;

    uint256 public constant PRICE_USD = 5e5; // $0.50 in USDT 6-decimals
    uint256 public constant FANVO_DECIMALS = 18;
    uint256 public constant USDT_DECIMALS = 6;

    bool public poolCreated;

    event Buy(address indexed buyer, uint256 usdtAmount, uint256 fanovoAmount);
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

    constructor(address _usdt, address _fanovo, address _owner) {
        if (_usdt == address(0) || _fanovo == address(0) || _owner == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        fanovo = IERC20(_fanovo);
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

    function markPoolCreated() external onlyOwner {
        poolCreated = true;
        emit PoolCreated();
    }

    function buy(uint256 usdtAmount) external returns (uint256 fanovoAmount) {
        if (poolCreated) revert PoolAlreadyCreated();
        if (usdtAmount == 0) revert InvalidAmount();
        if (treasury == address(0)) revert TreasuryNotSet();

        fanovoAmount = (usdtAmount * 10 ** FANVO_DECIMALS) / PRICE_USD;
        if (fanovoAmount == 0) revert InvalidAmount();
        if (fanovo.balanceOf(address(this)) < fanovoAmount) revert InsufficientBalance();

        bool usdtSuccess = usdt.transferFrom(msg.sender, treasury, usdtAmount);
        if (!usdtSuccess) revert TransferFailed();

        bool fanovoSuccess = fanovo.transfer(msg.sender, fanovoAmount);
        if (!fanovoSuccess) revert TransferFailed();

        emit Buy(msg.sender, usdtAmount, fanovoAmount);
    }

    function recover(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = fanovo.balanceOf(address(this));
        if (balance == 0) revert InsufficientBalance();
        bool success = fanovo.transfer(to, balance);
        if (!success) revert TransferFailed();
        emit Recovered(to, balance);
    }
}
