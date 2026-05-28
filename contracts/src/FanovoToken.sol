// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @title FanovoToken (FANOVO)
/// @notice Main protocol token — fixed supply, deflationary via burn on every swap
contract FanovoToken is ERC20 {
    uint256 public constant MAX_SUPPLY = 960_000 ether;

    constructor(address recipient) ERC20("Fanovo Token", "FANOVO") {
        _mint(recipient, MAX_SUPPLY);
    }

    /// @notice Anyone can burn their own tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Burn from an approved address
    function burnFrom(address account, uint256 amount) external {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }
}
