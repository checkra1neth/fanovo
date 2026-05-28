// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {PlayerToken} from "./PlayerToken.sol";

/// @title PlayerFactory
/// @notice Deploys and tracks 144 PlayerToken contracts (3 per country)
contract PlayerFactory is Ownable2Step {

    uint8 public constant TOTAL_COUNTRIES = 48;
    uint8 public constant PLAYERS_PER_COUNTRY = 3;
    uint16 public constant TOTAL_PLAYERS = 144;

    uint8 public constant ROLE_CAPTAIN = 0;
    uint8 public constant ROLE_BEST = 1;
    uint8 public constant ROLE_ROOKIE = 2;

    address public immutable hook;

    PlayerToken[] public players;

    mapping(uint8 => mapping(uint8 => PlayerToken)) private _byCountry;
    mapping(address => uint8) public countryIndexOf;
    mapping(address => uint8) public roleOf;
    mapping(address => bool) public isPlayer;

    bool public setupComplete;

    event PlayerCreated(
        uint16 indexed playerIndex,
        uint8 indexed countryIndex,
        uint8 role,
        address token
    );
    event SetupCompleted();

    error SetupAlreadyComplete();
    error IncompleteSetup();
    error InvalidCountryIndex();
    error InvalidRole();
    error SlotAlreadyFilled();
    error ZeroAddress();

    constructor(address hook_, address initialOwner) Ownable(initialOwner) {
        if (hook_ == address(0) || initialOwner == address(0)) revert ZeroAddress();
        hook = hook_;
    }

    function createPlayer(
        uint8 countryIndex,
        uint8 role,
        address country,
        string memory name_,
        string memory symbol_
    ) external onlyOwner returns (PlayerToken) {
        if (setupComplete) revert SetupAlreadyComplete();
        if (countryIndex >= TOTAL_COUNTRIES) revert InvalidCountryIndex();
        if (role >= PLAYERS_PER_COUNTRY) revert InvalidRole();
        if (country == address(0)) revert ZeroAddress();
        if (address(_byCountry[countryIndex][role]) != address(0)) revert SlotAlreadyFilled();

        uint256 maxSupply;
        if (role == ROLE_CAPTAIN) maxSupply = 1_500e18;
        else if (role == ROLE_BEST) maxSupply = 500e18;
        else maxSupply = 2_500e18;

        PlayerToken token = new PlayerToken(
            name_,
            symbol_,
            hook,
            maxSupply,
            country,
            countryIndex,
            role
        );

        uint16 idx = uint16(players.length);
        players.push(token);
        _byCountry[countryIndex][role] = token;
        countryIndexOf[address(token)] = countryIndex;
        roleOf[address(token)] = role;
        isPlayer[address(token)] = true;

        emit PlayerCreated(idx, countryIndex, role, address(token));
        return token;
    }

    function completeSetup() external onlyOwner {
        if (setupComplete) revert SetupAlreadyComplete();
        if (players.length != TOTAL_PLAYERS) revert IncompleteSetup();
        setupComplete = true;
        emit SetupCompleted();
    }

    function playersLength() external view returns (uint256) {
        return players.length;
    }

    function byCountry(uint8 countryIndex, uint8 role) external view returns (PlayerToken) {
        return _byCountry[countryIndex][role];
    }

    function playersOfCountry(uint8 countryIndex)
        external
        view
        returns (PlayerToken captain, PlayerToken best, PlayerToken rookie)
    {
        if (countryIndex >= TOTAL_COUNTRIES) revert InvalidCountryIndex();
        captain = _byCountry[countryIndex][ROLE_CAPTAIN];
        best = _byCountry[countryIndex][ROLE_BEST];
        rookie = _byCountry[countryIndex][ROLE_ROOKIE];
    }
}
