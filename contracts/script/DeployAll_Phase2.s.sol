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

/// @title DeployAll_Phase2
/// @notice Continues deployment after FanovoToken is deployed
/// @dev Assumes FanovoToken and HookDeployer already deployed
contract DeployAll_Phase2 is Script {
    
    // X Layer Mainnet addresses
    address constant POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address constant USDT = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address constant FANOVO_TOKEN = 0xe81de3d4db134d2E722Bc4A2E4f07e4A4231b131;
    address constant HOOK_DEPLOYER = 0xD65D0F83EB6A6ED26b57E9d628F70a1e00b6997E;
    
    uint24 constant POOL_FEE = 0;
    int24 constant TICK_SPACING = 60;
    uint160 constant SQRT_PRICE_X96 = 79228162514264337593543950336; // 1.0

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        FanovoToken fanovo = FanovoToken(FANOVO_TOKEN);
        HookDeployer hookDeployer = HookDeployer(HOOK_DEPLOYER);

        // ─── 1. WorldCupHook already deployed ──────────────────────────────────
        WorldCupHook worldCupHook = WorldCupHook(0x39ECCF85f3F97D2020f5A7b3eeED5695EC636aA8);
        console.log("WorldCupHook:", address(worldCupHook));

        // ─── 2. PlayerHook already deployed ────────────────────────────────────
        PlayerHook playerHook = PlayerHook(0x3Ad1ECB123443CbC308058B03E130045bc9E6AA8);
        console.log("PlayerHook:", address(playerHook));

        // ─── 3. Deploy Factories ───────────────────────────────────────────────
        CountryFactory countryFactory = new CountryFactory(address(worldCupHook), deployer);
        PlayerFactory playerFactory = new PlayerFactory(address(playerHook), deployer);
        console.log("CountryFactory:", address(countryFactory));
        console.log("PlayerFactory:", address(playerFactory));

        // ─── 4. Create 48 CountryTokens ────────────────────────────────────────
        string[48] memory countryNames = _getCountryNames();
        string[48] memory countrySymbols = _getCountrySymbols();
        string[48] memory countryCodes = _getCountryCodes();
        
        for (uint8 i = 0; i < 48; i++) {
            countryFactory.createCountry(countryNames[i], countrySymbols[i], countryCodes[i]);
        }
        console.log("Created 48 CountryTokens");

        // ─── 5. Create 144 PlayerTokens ────────────────────────────────────────
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

        // ─── 6. Register tokens in hooks ───────────────────────────────────────
        for (uint8 i = 0; i < 48; i++) {
            worldCupHook.registerCountry(address(countryFactory.countries(i)));
        }
        console.log("Registered 48 countries in WorldCupHook");

        for (uint16 i = 0; i < 144; i++) {
            playerHook.registerPlayer(address(playerFactory.players(i)));
        }
        console.log("Registered 144 players in PlayerHook");

        // ─── 7. Initialize 48 V4 pools (FANOVO/Country) ───────────────────────
        for (uint8 i = 0; i < 48; i++) {
            address country = address(countryFactory.countries(i));
            _initializePool(POOL_MANAGER, address(fanovo), country, address(worldCupHook));
        }
        console.log("Initialized 48 FANOVO/Country pools");

        // ─── 8. Initialize 144 V4 pools (Country/Player) ──────────────────────
        for (uint16 i = 0; i < 144; i++) {
            PlayerToken player = playerFactory.players(i);
            address country = player.country();
            _initializePool(POOL_MANAGER, country, address(player), address(playerHook));
        }
        console.log("Initialized 144 Country/Player pools");

        // ─── 9. Finalize hooks ─────────────────────────────────────────────────
        PackOpener packOpener = new PackOpener(
            IERC20(address(fanovo)),
            worldCupHook,
            countryFactory
        );
        PlayerPackOpener playerPackOpener = new PlayerPackOpener(playerHook, playerFactory);
        console.log("PackOpener:", address(packOpener));
        console.log("PlayerPackOpener:", address(playerPackOpener));

        worldCupHook.setPackOpener(address(packOpener));
        worldCupHook.finalize();
        playerHook.setPackOpener(address(playerPackOpener));
        playerHook.finalize();
        console.log("Hooks finalized");

        // ─── 10. Deploy Routers ────────────────────────────────────────────────
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

        // ─── 11. Deploy PredictionMarketHub ────────────────────────────────────
        FanovoTreasury treasury = new FanovoTreasury(USDT, deployer);
        PredictionMarketHub marketHub = new PredictionMarketHub(
            address(countryFactory),
            address(fanovo),
            deployer,
            address(treasury)
        );
        console.log("FanovoTreasury:", address(treasury));
        console.log("PredictionMarketHub:", address(marketHub));

        // ─── 12. Deploy Sale & LineupsGame ─────────────────────────────────────
        FanovoSale sale = new FanovoSale(USDT, address(fanovo), deployer);
        LineupsGame lineupsGame = new LineupsGame(fanovo, playerHook);
        console.log("FanovoSale:", address(sale));
        console.log("LineupsGame:", address(lineupsGame));

        // ─── 13. Transfer FANOVO to Sale ───────────────────────────────────────
        uint256 saleAmount = 100_000 ether;
        fanovo.transfer(address(sale), saleAmount);
        console.log("Transferred", saleAmount / 1e18, "FANOVO to Sale");

        // ─── 14. Setup Sale Treasury ───────────────────────────────────────────
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

    function _validateHookAddress(address hook) internal pure {
        uint160 addr = uint160(hook);
        uint160 requiredFlags =
            uint160(1 << 13) |
            uint160(1 << 11) |
            uint160(1 << 9)  |
            uint160(1 << 7)  |
            uint160(1 << 5)  |
            uint160(1 << 3);
        
        require(
            (addr & requiredFlags) == requiredFlags,
            "Hook address missing required permission bits"
        );
    }

    function _getCountryNames() internal pure returns (string[48] memory) {
        return [
            "United States", "Mexico", "Canada", "England", "France", "Croatia",
            "Norway", "Portugal", "Germany", "Netherlands", "Switzerland", "Scotland",
            "Spain", "Austria", "Belgium", "Bosnia & Herzegovina", "Sweden", "Turkiye",
            "Czechia", "Argentina", "Brazil", "Ecuador", "Uruguay", "Colombia",
            "Paraguay", "Morocco", "Tunisia", "Egypt", "Algeria", "Ghana",
            "Cape Verde", "South Africa", "Cote d'Ivoire", "Senegal", "Japan", "Iran",
            "Uzbekistan", "South Korea", "Jordan", "Australia", "Qatar", "Saudi Arabia",
            "Panama", "Curacao", "Haiti", "New Zealand", "DR Congo", "Iraq"
        ];
    }

    function _getCountrySymbols() internal pure returns (string[48] memory) {
        return [
            "USA", "MEX", "CAN", "ENG", "FRA", "CRO",
            "NOR", "POR", "GER", "NED", "SUI", "SCO",
            "ESP", "AUT", "BEL", "BIH", "SWE", "TUR",
            "CZE", "ARG", "BRA", "ECU", "URU", "COL",
            "PAR", "MAR", "TUN", "EGY", "ALG", "GHA",
            "CPV", "RSA", "CIV", "SEN", "JPN", "IRN",
            "UZB", "KOR", "JOR", "AUS", "QAT", "SAU",
            "PAN", "CUW", "HAI", "NZL", "COD", "IRQ"
        ];
    }

    function _getCountryCodes() internal pure returns (string[48] memory) {
        return [
            "USA", "MEX", "CAN", "ENG", "FRA", "CRO",
            "NOR", "POR", "GER", "NED", "SUI", "SCO",
            "ESP", "AUT", "BEL", "BIH", "SWE", "TUR",
            "CZE", "ARG", "BRA", "ECU", "URU", "COL",
            "PAR", "MAR", "TUN", "EGY", "ALG", "GHA",
            "CPV", "RSA", "CIV", "SEN", "JPN", "IRN",
            "UZB", "KOR", "JOR", "AUS", "QAT", "SAU",
            "PAN", "CUW", "HAI", "NZL", "COD", "IRQ"
        ];
    }

    function _getPlayerNames() internal pure returns (string[144] memory) {
        return [
            "Christian Pulisic", "Tyler Adams", "Cavan Sullivan",
            "Santiago Gimenez", "Edson Alvarez", "Gilberto Mora",
            "Alphonso Davies", "Jonathan David", "Luc de Fougerolles",
            "Lionel Messi", "Cristian Romero", "Nico Paz",
            "Vinicius Junior", "Marquinhos", "Estevao",
            "Moises Caicedo", "Enner Valencia", "Kendry Paez",
            "Federico Valverde", "Jose Maria Gimenez", "Luciano Rodriguez",
            "Luis Diaz", "James Rodriguez", "Yaser Asprilla",
            "Miguel Almiron", "Gustavo Gomez", "Julio Enciso",
            "Jude Bellingham", "Harry Kane", "Ethan Nwaneri",
            "Kylian Mbappe", "Aurelien Tchouameni", "Warren Zaire-Emery",
            "Josko Gvardiol", "Luka Modric", "Luka Vuskovic",
            "Erling Haaland", "Martin Odegaard", "Sindre Walle Egeli",
            "Bruno Fernandes", "Ruben Dias", "Rodrigo Mora",
            "Florian Wirtz", "Joshua Kimmich", "Brajan Gruda",
            "Virgil van Dijk", "Frenkie de Jong", "Jorrel Hato",
            "Granit Xhaka", "Manuel Akanji", "Ardon Jashari",
            "Andrew Robertson", "John McGinn", "Ben Doak",
            "Lamine Yamal", "Rodri", "Pau Cubarsi",
            "David Alaba", "Marcel Sabitzer", "Oghenetejiri Adejenughure",
            "Kevin De Bruyne", "Romelu Lukaku", "Mika Godts",
            "Edin Dzeko", "Sead Kolasinac", "Kerim Alajbegovic",
            "Alexander Isak", "Victor Lindelof", "Roony Bardghji",
            "Hakan Calhanoglu", "Caglar Soyuncu", "Arda Guler",
            "Tomas Soucek", "Vladimir Coufal", "Adam Karabec",
            "Achraf Hakimi", "Hakim Ziyech", "Eliesse Ben Seghir",
            "Youssef Msakni", "Montassar Talbi", "Mohamed Ali Ben Romdhane",
            "Mohamed Salah", "Ahmed Hegazi", "Omar Faied",
            "Riyad Mahrez", "Ismael Bennacer", "Ibrahim Maza",
            "Mohammed Kudus", "Thomas Partey", "Ernest Nuamah",
            "Ryan Mendes", "Vozinha", "Deroy Duarte",
            "Percy Tau", "Ronwen Williams", "Shandre Campbell",
            "Franck Kessie", "Sebastien Haller", "Yan Diomande",
            "Sadio Mane", "Kalidou Koulibaly", "Amara Diouf",
            "Takefusa Kubo", "Wataru Endo", "Kota Takai",
            "Mehdi Taremi", "Alireza Jahanbakhsh", "Mohammad Ghorbani",
            "Abbosbek Fayzullaev", "Eldor Shomurodov", "Abdukodir Khusanov",
            "Son Heung-min", "Kim Min-jae", "Yang Min-hyeok",
            "Mousa Al-Tamari", "Ehsan Haddad", "Mahmoud Al-Mardi",
            "Harry Souttar", "Mat Ryan", "Nestory Irankunda",
            "Akram Afif", "Hassan Al-Haydos", "Ahmed Al-Rawi",
            "Salem Al-Dawsari", "Ali Al-Bulaihi", "Talal Haji",
            "Adalberto Carrasquilla", "Anibal Godoy", "Kahiser Lenis",
            "Leandro Bacuna", "Cuco Martina", "Jearl Margaritha",
            "Duckens Nazon", "Johnny Placide", "Louicius Don Deedson",
            "Chris Wood", "Liberato Cacace", "Tyler Bindon",
            "Chancel Mbemba", "Cedric Bakambu", "Noah Sadiki",
            "Aymen Hussein", "Jalal Hassan", "Ali Jasim"
        ];
    }

    function _getPlayerSymbols() internal pure returns (string[144] memory) {
        return [
            "PULISIC", "ADAMS", "SULLIVAN",
            "SGIMENEZ", "ALVAREZ", "GMORA",
            "DAVIES", "DAVID", "FOUGEROLLES",
            "MESSI", "ROMERO", "PAZ",
            "VINICIUS", "MARQUINHOS", "ESTEVAO",
            "CAICEDO", "VALENCIA", "PAEZ",
            "VALVERDE", "JGIMENEZ", "RODRIGUEZ",
            "DIAZ", "JAMES", "ASPRILLA",
            "ALMIRON", "GOMEZ", "ENCISO",
            "BELLINGHAM", "KANE", "NWANERI",
            "MBAPPE", "TCHOUAMENI", "ZAIREEMERY",
            "GVARDIOL", "MODRIC", "VUSKOVIC",
            "HAALAND", "ODEGAARD", "EGELI",
            "FERNANDES", "DIAS", "RMORA",
            "WIRTZ", "KIMMICH", "GRUDA",
            "VANDIJK", "DEJONG", "HATO",
            "XHAKA", "AKANJI", "JASHARI",
            "ROBERTSON", "MCGINN", "DOAK",
            "YAMAL", "RODRI", "CUBARSI",
            "ALABA", "SABITZER", "ADEJENUGHURE",
            "DEBRUYNE", "LUKAKU", "GODTS",
            "DZEKO", "KOLASINAC", "ALAJBEGOVIC",
            "ISAK", "LINDELOF", "BARDGHJI",
            "CALHANOGLU", "SOYUNCU", "GULER",
            "SOUCEK", "COUFAL", "KARABEC",
            "HAKIMI", "ZIYECH", "BENSEGHIR",
            "MSAKNI", "TALBI", "BENROMDHANE",
            "SALAH", "HEGAZI", "FAIED",
            "MAHREZ", "BENNACER", "MAZA",
            "KUDUS", "PARTEY", "NUAMAH",
            "MENDES", "VOZINHA", "DUARTE",
            "TAU", "WILLIAMS", "CAMPBELL",
            "KESSIE", "HALLER", "DIOMANDE",
            "MANE", "KOULIBALY", "DIOUF",
            "KUBO", "ENDO", "TAKAI",
            "TAREMI", "JAHANBAKHSH", "GHORBANI",
            "FAYZULLAEV", "SHOMURODOV", "KHUSANOV",
            "SON", "KIM", "YANG",
            "ALTAMARI", "HADDAD", "ALMARDI",
            "SOUTTAR", "RYAN", "IRANKUNDA",
            "AFIF", "ALHAYDOS", "ALRAWI",
            "ALDAWSARI", "ALBULAIHI", "HAJI",
            "CARRASQUILLA", "GODOY", "LENIS",
            "BACUNA", "MARTINA", "MARGARITHA",
            "NAZON", "PLACIDE", "DEEDSON",
            "WOOD", "CACACE", "BINDON",
            "MBEMBA", "BAKAMBU", "SADIKI",
            "HUSSEIN", "HASSAN", "JASIM"
        ];
    }

    function _getPlayerCountries() internal pure returns (uint8[144] memory) {
        return [
            0,0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,5,6,6,6,7,7,7,8,8,8,9,9,9,10,10,10,11,11,11,12,12,12,13,13,13,14,14,14,15,15,15,16,16,16,17,17,17,18,18,18,19,19,19,20,20,20,21,21,21,22,22,22,23,23,23,24,24,24,25,25,25,26,26,26,27,27,27,28,28,28,29,29,29,30,30,30,31,31,31,32,32,32,33,33,33,34,34,34,35,35,35,36,36,36,37,37,37,38,38,38,39,39,39,40,40,40,41,41,41,42,42,42,43,43,43,44,44,44,45,45,45,46,46,46,47,47,47
        ];
    }

    function _getPlayerRoles() internal pure returns (uint8[144] memory) {
        return [
            1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2
        ];
    }
}
