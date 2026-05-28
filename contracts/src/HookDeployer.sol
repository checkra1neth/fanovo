// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WorldCupHook} from "./WorldCupHook.sol";
import {PlayerHook} from "./PlayerHook.sol";
import {FanovoToken} from "./FanovoToken.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @title HookDeployer
/// @notice Factory that deploys WorldCupHook and PlayerHook via CREATE2 for address mining
contract HookDeployer {
    function deploy(IPoolManager poolManager, FanovoToken fanovo, bytes32 salt) external returns (WorldCupHook hook) {
        hook = new WorldCupHook{salt: salt}(poolManager, fanovo, msg.sender);
    }

    function computeAddress(IPoolManager poolManager, FanovoToken fanovo, bytes32 salt) external view returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(
            type(WorldCupHook).creationCode,
            abi.encode(poolManager, fanovo, msg.sender)
        ));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    function deployPlayer(IPoolManager poolManager, bytes32 salt)
        external
        returns (PlayerHook hook)
    {
        hook = new PlayerHook{salt: salt}(poolManager, msg.sender);
    }

    function computePlayerAddress(IPoolManager poolManager, bytes32 salt)
        external
        view
        returns (address)
    {
        bytes32 initCodeHash = keccak256(abi.encodePacked(
            type(PlayerHook).creationCode,
            abi.encode(poolManager, msg.sender)
        ));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }
}
