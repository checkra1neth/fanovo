// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {HookDeployer} from "../src/HookDeployer.sol";

/// @title DeployHookDeployer
/// @notice Phase 1: Deploy HookDeployer contract
/// @dev Run this first, then use the deployed address to mine salts off-chain
///      with: python3 script/mine_salt.py <hook_deployer_address> <creation_code_hex>
contract DeployHookDeployer is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        HookDeployer hookDeployer = new HookDeployer();
        console.log("HookDeployer deployed at:", address(hookDeployer));
        console.log("Deployer address:", deployer);
        
        vm.stopBroadcast();

        console.log("\n=== NEXT STEPS ===");
        console.log("1. Note the HookDeployer address above");
        console.log("2. Run Python salt mining script for WorldCupHook:");
        console.log("   python3 script/mine_salt.py <hook_deployer_address> <worldcup_hook_creation_code_hex>");
        console.log("3. Run Python salt mining script for PlayerHook:");
        console.log("   python3 script/mine_salt.py <hook_deployer_address> <player_hook_creation_code_hex>");
        console.log("4. Set SALT_WC and SALT_PLAYER env vars");
        console.log("5. Run DeployAll script");
    }
}
