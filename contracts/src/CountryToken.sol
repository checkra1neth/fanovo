// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @title CountryToken
/// @notice ERC-20 token representing a country in the World Cup protocol
/// @dev Minted only by the hook contract, supply capped at asymptote
contract CountryToken is ERC20 {
    address public immutable hook;
    string public countryCode;     // e.g. "BRA", "ARG", "GER"
    uint256 public constant ASYMPTOTE = 20_000 ether;

    error OnlyHook();
    error ExceedsAsymptote();

    modifier onlyHook() {
        if (msg.sender != hook) revert OnlyHook();
        _;
    }

    constructor(string memory name_, string memory symbol_, string memory code_, address hook_) ERC20(name_, symbol_) {
        hook = hook_;
        countryCode = code_;
    }

    function mint(address to, uint256 amount) external onlyHook {
        if (totalSupply() + amount > ASYMPTOTE) revert ExceedsAsymptote();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyHook {
        _burn(from, amount);
    }
}
