// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {CountryToken} from "./CountryToken.sol";

/// @title CountryFactory
/// @notice Deploys and tracks 48 CountryToken contracts
contract CountryFactory is Ownable2Step {

    uint256 public constant TOTAL_COUNTRIES = 48;

    address public immutable hook;

    CountryToken[] public countries;

    mapping(string => CountryToken) public byCode;

    bool public setupComplete;

    event CountryCreated(uint256 indexed index, address token, string code);
    event SetupCompleted();

    error SetupAlreadyComplete();
    error TooManyCountries();
    error CodeAlreadyUsed();
    error EmptyCode();
    error IncompleteSetup();
    error ZeroAddress();

    constructor(address hook_, address initialOwner) Ownable(initialOwner) {
        if (hook_ == address(0) || initialOwner == address(0)) revert ZeroAddress();
        hook = hook_;
    }

    function createCountry(
        string memory name_,
        string memory symbol_,
        string memory code_
    ) external onlyOwner returns (CountryToken) {
        if (setupComplete) revert SetupAlreadyComplete();
        if (countries.length >= TOTAL_COUNTRIES) revert TooManyCountries();
        if (bytes(code_).length == 0) revert EmptyCode();
        if (address(byCode[code_]) != address(0)) revert CodeAlreadyUsed();

        CountryToken token = new CountryToken(name_, symbol_, code_, hook);
        uint256 idx = countries.length;
        countries.push(token);
        byCode[code_] = token;

        emit CountryCreated(idx, address(token), code_);
        return token;
    }

    function completeSetup() external onlyOwner {
        if (setupComplete) revert SetupAlreadyComplete();
        if (countries.length != TOTAL_COUNTRIES) revert IncompleteSetup();
        setupComplete = true;
        emit SetupCompleted();
    }

    function countriesLength() external view returns (uint256) {
        return countries.length;
    }

    function allCountries() external view returns (CountryToken[] memory) {
        return countries;
    }
}
