// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title FanovoTreasury
/// @notice Holds USDT collected from FANOVO sales. Owner-only withdrawal.
contract FanovoTreasury {
    IERC20 public immutable usdt;
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Withdraw(address indexed to, uint256 amount);

    error OnlyOwner();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _usdt, address _owner) {
        if (_usdt == address(0) || _owner == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Withdraw USDT to owner
    function withdraw(uint256 amount) external onlyOwner {
        bool success = usdt.transfer(owner, amount);
        if (!success) revert TransferFailed();
        emit Withdraw(owner, amount);
    }

    /// @notice View current USDT balance
    function balance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }
}
