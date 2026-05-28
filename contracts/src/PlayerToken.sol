// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @title PlayerToken
/// @notice ERC-20 token representing a player in the World Cup protocol
/// @dev Minted only by the PlayerHook contract. Stores country/role metadata
///      for the hook to read during registration.
contract PlayerToken is ERC20 {
    address public immutable hook;
    uint256 public immutable maxSupply;
    address public immutable country;
    uint8 public immutable countryIndex;
    uint8 public immutable role;

    error OnlyHook();
    error ExceedsMaxSupply();

    modifier onlyHook() {
        if (msg.sender != hook) revert OnlyHook();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address hook_,
        uint256 maxSupply_,
        address country_,
        uint8 countryIndex_,
        uint8 role_
    ) ERC20(name_, symbol_) {
        hook = hook_;
        maxSupply = maxSupply_;
        country = country_;
        countryIndex = countryIndex_;
        role = role_;
    }

    function mint(address to, uint256 amount) external onlyHook {
        if (totalSupply() + amount > maxSupply) revert ExceedsMaxSupply();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyHook {
        _burn(from, amount);
    }
}
