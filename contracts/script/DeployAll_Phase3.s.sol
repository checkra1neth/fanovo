// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@uniswap/v4-core/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {FanovoToken} from "../src/FanovoToken.sol";
import {WorldCupHook} from "../src/WorldCupHook.sol";
import {PlayerHook} from "../src/PlayerHook.sol";
import {HookDeployer} from "../src/HookDeployer.sol";
import {CountryFactory} from "../src/CountryFactory.sol";
import {PlayerFactory} from "../src/PlayerFactory.sol";
import {CountryToken} from "../src/CountryToken.sol";
import {PlayerToken} from "../src/PlayerToken.sol";
import {PackOpener} from "../src/PackOpener.sol";
import {PlayerPackOpener} from "../src/PlayerPackOpener.sol";
import {CurveRouter} from "../src/CurveRouter.sol";
import {PlayerRouter} from "../src/PlayerRouter.sol";
import {PredictionMarketHub} from "../src/PredictionMarketHub.sol";
import {FanovoSale} from "../src/FanovoSale.sol";
import {FanovoTreasury} from "../src/FanovoTreasury.sol";
import {LineupsGame} from "../src/LineupsGame.sol";

/// @title DeployAll_Phase3
/// @notice Continues deployment from Phase 2 (CountryFactory deployed)
contract DeployAll_Phase3 is Script {
    
    address constant POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address constant USDT = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address constant FANOVO_TOKEN = 0xe81de3d4db134d2E722Bc4A2E4f07e4A4231b131;
    address constant HOOK_DEPLOYER = 0xD65D0F83EB6A6ED26b57E9d628F70a1e00b6997E;
    address constant WORLD_CUP_HOOK = 0x39ECCF85f3F97D2020f5A7b3eeED5695EC636aA8;
    address constant PLAYER_HOOK = 0x3Ad1ECB123443CbC308058B03E130045bc9E6AA8;
    address constant COUNTRY_FACTORY = 0x4fD8F53a074C25819dEb231537C53a63Bd5c14B1;
    
    uint24 constant POOL_FEE = 0;
    int24 constant TICK_SPACING = 60;
    uint160 constant SQRT_PRICE_X96 = 79228162514264337593543950336;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        FanovoToken fanovo = FanovoToken(FANOVO_TOKEN);
        WorldCupHook worldCupHook = WorldCupHook(WORLD_CUP_HOOK);
        PlayerHook playerHook = PlayerHook(PLAYER_HOOK);
        CountryFactory countryFactory = CountryFactory(COUNTRY_FACTORY);

        // ─── 1. Create 48 CountryTokens ────────────────────────────────────────
        string[48] memory countryNames = _getCountryNames();
        string[48] memory countrySymbols = _getCountrySymbols();
        string[48] memory countryCodes = _getCountryCodes();
        
        for (uint8 i = 0; i < 48; i++) {
            countryFactory.createCountry(countryNames[i], countrySymbols[i], countryCodes[i]);
        }
        console.log("Created 48 CountryTokens");

        // ─── 2. Deploy PlayerFactory ───────────────────────────────────────────
        PlayerFactory playerFactory = new PlayerFactory(address(playerHook), deployer);
        console.log("PlayerFactory:", address(playerFactory));

        // ─── 3. Create 144 PlayerTokens ────────────────────────────────────────
        string[144] memory playerNames = _getPlayerNames();
        string[144] memory playerSymbols = _getPlayerSymbols();
        uint8[144] memory playerCountries = _getPlayerCountries();
        uint8[144] memory playerRoles = _getPlayerRoles();

        for (uint8 i = 0; i < 144; i++) {
            address country = address(countryFactory.countries(playerCountries[i]));
            playerFactory.createPlayer(
                playerCountries[i],
                playerRoles[i],
                country,
                playerNames[i],
                playerSymbols[i]
            );
        }
        console.log("Created 144 PlayerTokens");

        // ─── 4. Register tokens in hooks ───────────────────────────────────────
        for (uint8 i = 0; i < 48; i++) {
            worldCupHook.registerCountry(address(countryFactory.countries(i)));
        }
        console.log("Registered 48 countries in WorldCupHook");

        for (uint16 i = 0; i < 144; i++) {
            playerHook.registerPlayer(address(playerFactory.players(i)));
        }
        console.log("Registered 144 players in PlayerHook");

        // ─── 5. Initialize 48 V4 pools (FANOVO/Country) ───────────────────────
        for (uint8 i = 0; i < 48; i++) {
            address country = address(countryFactory.countries(i));
            _initializePool(POOL_MANAGER, address(fanovo), country, address(worldCupHook));
        }
        console.log("Initialized 48 FANOVO/Country pools");

        // ─── 6. Initialize 144 V4 pools (Country/Player) ──────────────────────
        for (uint16 i = 0; i < 144; i++) {
            PlayerToken player = playerFactory.players(i);
            address country = player.country();
            _initializePool(POOL_MANAGER, country, address(player), address(playerHook));
        }
        console.log("Initialized 144 Country/Player pools");

        // ─── 7. Deploy PackOpeners ─────────────────────────────────────────────
        PackOpener packOpener = new PackOpener(
            IERC20(address(fanovo)),
            worldCupHook,
            countryFactory
        );
        PlayerPackOpener playerPackOpener = new PlayerPackOpener(playerHook, playerFactory);
        console.log("PackOpener:", address(packOpener));
        console.log("PlayerPackOpener:", address(playerPackOpener));

        // ─── 8. Finalize hooks ─────────────────────────────────────────────────
        worldCupHook.setPackOpener(address(packOpener));
        worldCupHook.finalize();
        playerHook.setPackOpener(address(playerPackOpener));
        playerHook.finalize();
        console.log("Hooks finalized");

        // ─── 9. Deploy Routers ─────────────────────────────────────────────────
        CurveRouter curveRouter = new CurveRouter(
            IPoolManager(POOL_MANAGER),
            worldCupHook,
            IERC20(address(fanovo))
        );
        PlayerRouter playerRouter = new PlayerRouter(
            IPoolManager(POOL_MANAGER),
            playerHook
        );
        console.log("CurveRouter:", address(curveRouter));
        console.log("PlayerRouter:", address(playerRouter));

        // ─── 10. Deploy PredictionMarketHub ────────────────────────────────────
        FanovoTreasury treasury = new FanovoTreasury(USDT, deployer);
        PredictionMarketHub marketHub = new PredictionMarketHub(
            address(countryFactory),
            address(fanovo),
            deployer,
            address(treasury)
        );
        console.log("FanovoTreasury:", address(treasury));
        console.log("PredictionMarketHub:", address(marketHub));

        // ─── 11. Deploy Sale & LineupsGame ─────────────────────────────────────
        FanovoSale sale = new FanovoSale(USDT, address(fanovo), deployer);
        LineupsGame lineupsGame = new LineupsGame(fanovo, playerHook);
        console.log("FanovoSale:", address(sale));
        console.log("LineupsGame:", address(lineupsGame));

        // ─── 12. Transfer FANOVO to Sale ───────────────────────────────────────
        uint256 saleAmount = 100_000 ether;
        fanovo.transfer(address(sale), saleAmount);
        console.log("Transferred", saleAmount / 1e18, "FANOVO to Sale");

        // ─── 13. Setup Sale Treasury ───────────────────────────────────────────
        sale.setTreasury(address(treasury));
        console.log("Sale treasury set");

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("FanovoToken:", address(fanovo));
        console.log("WorldCupHook:", address(worldCupHook));
        console.log("PlayerHook:", address(playerHook));
        console.log("CountryFactory:", address(countryFactory));
        console.log("PlayerFactory:", address(playerFactory));
        console.log("PackOpener:", address(packOpener));
        console.log("PlayerPackOpener:", address(playerPackOpener));
        console.log("CurveRouter:", address(curveRouter));
        console.log("PlayerRouter:", address(playerRouter));
        console.log("PredictionMarketHub:", address(marketHub));
        console.log("FanovoTreasury:", address(treasury));
        console.log("FanovoSale:", address(sale));
        console.log("LineupsGame:", address(lineupsGame));
    }

    function _initializePool(
        address poolManager,
        address token0,
        address token1,
        address hook
    ) internal {
        (address c0, address c1) = token0 < token1 ? (token0, token1) : (token1, token0);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hook)
        });
        IPoolManager(poolManager).initialize(key, SQRT_PRICE_X96);
    }

    function _getCountryNames() internal pure returns (string[48] memory) {
        return [
            "Argentina", "Australia", "Belgium", "Brazil", "Cameroon", "Canada",
            "Costa Rica", "Croatia", "Denmark", "Ecuador", "England", "France",
            "Germany", "Ghana", "Iran", "Japan", "Mexico", "Morocco",
            "Netherlands", "Poland", "Portugal", "Qatar", "Saudi Arabia", "Senegal",
            "Serbia", "South Korea", "Spain", "Switzerland", "Tunisia", "Uruguay",
            "USA", "Wales", "Algeria", "Austria", "Chile", "Colombia",
            "Czech Republic", "Egypt", "Greece", "Hungary", "Italy", "Nigeria",
            "Norway", "Peru", "Romania", "Russia", "Scotland", "Turkey"
        ];
    }

    function _getCountrySymbols() internal pure returns (string[48] memory) {
        return [
            "ARG", "AUS", "BEL", "BRA", "CMR", "CAN",
            "CRC", "CRO", "DEN", "ECU", "ENG", "FRA",
            "GER", "GHA", "IRN", "JPN", "MEX", "MAR",
            "NED", "POL", "POR", "QAT", "KSA", "SEN",
            "SRB", "KOR", "ESP", "SUI", "TUN", "URU",
            "USA", "WAL", "ALG", "AUT", "CHI", "COL",
            "CZE", "EGY", "GRE", "HUN", "ITA", "NGA",
            "NOR", "PER", "ROU", "RUS", "SCO", "TUR"
        ];
    }

    function _getCountryCodes() internal pure returns (string[48] memory) {
        return [
            "ARG", "AUS", "BEL", "BRA", "CMR", "CAN",
            "CRC", "CRO", "DEN", "ECU", "ENG", "FRA",
            "GER", "GHA", "IRN", "JPN", "MEX", "MAR",
            "NED", "POL", "POR", "QAT", "KSA", "SEN",
            "SRB", "KOR", "ESP", "SUI", "TUN", "URU",
            "USA", "WAL", "ALG", "AUT", "CHI", "COL",
            "CZE", "EGY", "GRE", "HUN", "ITA", "NGA",
            "NOR", "PER", "ROU", "RUS", "SCO", "TUR"
        ];
    }

    function _getPlayerNames() internal pure returns (string[144] memory) {
        string[144] memory names;
        for (uint8 i = 0; i < 144; i++) {
            names[i] = string(abi.encodePacked("Player ", _uintToString(i)));
        }
        return names;
    }

    function _getPlayerSymbols() internal pure returns (string[144] memory) {
        string[144] memory symbols;
        for (uint8 i = 0; i < 144; i++) {
            symbols[i] = string(abi.encodePacked("PLY", _uintToString(i)));
        }
        return symbols;
    }

    function _getPlayerCountries() internal pure returns (uint8[144] memory) {
        uint8[144] memory countries;
        for (uint8 i = 0; i < 48; i++) {
            countries[i * 3] = i;
            countries[i * 3 + 1] = i;
            countries[i * 3 + 2] = i;
        }
        return countries;
    }

    function _getPlayerRoles() internal pure returns (uint8[144] memory) {
        uint8[144] memory roles;
        for (uint8 i = 0; i < 48; i++) {
            roles[i * 3] = 0;
            roles[i * 3 + 1] = 1;
            roles[i * 3 + 2] = 2;
        }
        return roles;
    }

    function _uintToString(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint8 temp = v;
        uint8 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            buffer[digits] = bytes1(48 + v % 10);
            v /= 10;
        }
        return string(buffer);
    }
}
