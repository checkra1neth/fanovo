export const fanovoTokenAbi = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "burn", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "MAX_SUPPLY", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

export const worldCupHookAbi = [
  // View functions
  { type: "function", name: "currentPrice", inputs: [{ name: "country", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "quoteBuy", inputs: [{ name: "country", type: "address" }, { name: "fanovoIn", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "quoteSell", inputs: [{ name: "country", type: "address" }, { name: "countryIn", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "canPackMint", inputs: [{ name: "country", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getCountryToken", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "countriesLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getCurveState", inputs: [{ name: "country", type: "address" }], outputs: [{ name: "realFanovo", type: "uint128" }, { name: "circulating", type: "uint128" }, { name: "initialized", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "setupComplete", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "phase2Active", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "packOpener", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "poolToCountry", inputs: [{ name: "poolId", type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  // Constants
  { type: "function", name: "VIRTUAL_FANOVO", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "VIRTUAL_COUNTRY", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "SWAP_FEE_BPS", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "BPS_DENOM", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "PACK_MINT_THRESHOLD", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // Events
  { type: "event", name: "CountryRegistered", inputs: [{ name: "country", type: "address", indexed: true }, { name: "index", type: "uint256", indexed: false }] },
  { type: "event", name: "PoolBound", inputs: [{ name: "poolId", type: "bytes32", indexed: true }, { name: "country", type: "address", indexed: true }] },
  { type: "event", name: "PackOpenerSet", inputs: [{ name: "packOpener", type: "address", indexed: true }] },
  { type: "event", name: "SetupFinalized", inputs: [] },
  { type: "event", name: "Phase2Activated", inputs: [{ name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "PackMinted", inputs: [{ name: "user", type: "address", indexed: true }, { name: "country", type: "address", indexed: true }, { name: "toCurve", type: "uint256", indexed: false }] },
  { type: "event", name: "Buy", inputs: [{ name: "user", type: "address", indexed: true }, { name: "country", type: "address", indexed: true }, { name: "fanovoIn", type: "uint256", indexed: false }, { name: "countryOut", type: "uint256", indexed: false }, { name: "burned", type: "uint256", indexed: false }] },
  { type: "event", name: "Sell", inputs: [{ name: "user", type: "address", indexed: true }, { name: "country", type: "address", indexed: true }, { name: "countryIn", type: "uint256", indexed: false }, { name: "fanovoOut", type: "uint256", indexed: false }, { name: "burned", type: "uint256", indexed: false }] },
] as const;

export const playerHookAbi = [
  // Player lookup
  { type: "function", name: "getPlayerToken", inputs: [{ name: "countryId", type: "uint8" }, { name: "role", type: "uint8" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "getPlayer", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "playersLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getPlayerReserves", inputs: [{ name: "player", type: "address" }], outputs: [{ name: "realCountry", type: "uint128" }, { name: "circulating", type: "uint128" }], stateMutability: "view" },
  // Quote functions
  { type: "function", name: "currentPrice", inputs: [{ name: "player", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "quoteBuy", inputs: [{ name: "player", type: "address" }, { name: "countryIn", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "quoteSell", inputs: [{ name: "player", type: "address" }, { name: "playerIn", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "packsRemainingForCountry", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [{ type: "uint16" }], stateMutability: "view" },
  // State
  { type: "function", name: "setupComplete", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "packOpener", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "poolToPlayer", inputs: [{ name: "poolId", type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "phase2ByCountry", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "packsByCountry", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [{ type: "uint16" }], stateMutability: "view" },
  // Constants
  { type: "function", name: "SWAP_FEE_BPS", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "BPS_DENOM", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "PACKS_PER_COUNTRY", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "CAP_CAPTAIN", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "CAP_BEST", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "CAP_ROOKIE", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "MAX_SUPPLY_CAPTAIN", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "MAX_SUPPLY_BEST", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "MAX_SUPPLY_ROOKIE", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // Events
  { type: "event", name: "PlayerRegistered", inputs: [{ name: "player", type: "address", indexed: true }, { name: "country", type: "address", indexed: true }, { name: "countryIndex", type: "uint8", indexed: false }, { name: "role", type: "uint8", indexed: false }, { name: "index", type: "uint256", indexed: false }] },
  { type: "event", name: "PoolBound", inputs: [{ name: "poolId", type: "bytes32", indexed: true }, { name: "player", type: "address", indexed: true }] },
  { type: "event", name: "PackOpenerSet", inputs: [{ name: "packOpener", type: "address", indexed: true }] },
  { type: "event", name: "SetupFinalized", inputs: [] },
  { type: "event", name: "CountryPhase2Activated", inputs: [{ name: "countryIndex", type: "uint8", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "PackMinted", inputs: [{ name: "user", type: "address", indexed: true }, { name: "player", type: "address", indexed: true }, { name: "countryIndex", type: "uint8", indexed: false }, { name: "role", type: "uint8", indexed: false }] },
  { type: "event", name: "Buy", inputs: [{ name: "user", type: "address", indexed: true }, { name: "player", type: "address", indexed: true }, { name: "countryIn", type: "uint256", indexed: false }, { name: "playerOut", type: "uint256", indexed: false }, { name: "burned", type: "uint256", indexed: false }] },
  { type: "event", name: "Sell", inputs: [{ name: "user", type: "address", indexed: true }, { name: "player", type: "address", indexed: true }, { name: "playerIn", type: "uint256", indexed: false }, { name: "countryOut", type: "uint256", indexed: false }, { name: "burned", type: "uint256", indexed: false }] },
] as const;

// New PackOpener with commit-reveal
export const packOpenerAbi = [
  { type: "function", name: "commit", inputs: [{ name: "count", type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "reveal", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "recoverStuckCommit", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "commits", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "count", type: "uint8" }, { name: "revealBlock", type: "uint256" }, { name: "timestamp", type: "uint256" }, { name: "revealed", type: "bool" }, { name: "exists", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "packsRemaining", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "isClosed", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "totalPacksOpened", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "packsOpenedBy", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "MAX_PACKS", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "PACK_PRICE", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "MIN_PACK_SIZE", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "MAX_PACK_SIZE", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "DELAY_BLOCKS", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "fanovo", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "PackCommitted", inputs: [{ name: "user", type: "address", indexed: true }, { name: "count", type: "uint8", indexed: false }, { name: "revealBlock", type: "uint256", indexed: false }] },
  { type: "event", name: "PackRevealed", inputs: [{ name: "user", type: "address", indexed: true }, { name: "country", type: "address", indexed: true }, { name: "packNum", type: "uint256", indexed: true }] },
  { type: "event", name: "PacksClaimed", inputs: [{ name: "user", type: "address", indexed: true }, { name: "count", type: "uint8", indexed: false }] },
  { type: "event", name: "CommitRecovered", inputs: [{ name: "user", type: "address", indexed: true }, { name: "count", type: "uint8", indexed: false }] },
  { type: "event", name: "Phase2Triggered", inputs: [{ name: "timestamp", type: "uint256", indexed: false }] },
] as const;

export const playerPackOpenerAbi = [
  { type: "function", name: "commitPlayerPacks", inputs: [{ name: "countryIndex", type: "uint8" }, { name: "count", type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "revealPlayerPacks", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "recoverStuckCommit", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "commits", inputs: [{ name: "user", type: "address" }, { name: "countryIndex", type: "uint8" }], outputs: [{ name: "countryIndex", type: "uint8" }, { name: "count", type: "uint8" }, { name: "revealBlock", type: "uint256" }, { name: "timestamp", type: "uint256" }, { name: "revealed", type: "bool" }, { name: "exists", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "packsRemainingForCountry", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "packsOpenedBy", inputs: [{ name: "user", type: "address" }, { name: "countryIndex", type: "uint8" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "committedPacksByCountry", inputs: [{ name: "", type: "uint8" }], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "PACK_PRICE", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "MIN_PACK_SIZE", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "MAX_PACK_SIZE", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "DELAY_BLOCKS", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "PlayerPackCommitted", inputs: [{ name: "user", type: "address", indexed: true }, { name: "countryIndex", type: "uint8", indexed: true }, { name: "count", type: "uint8", indexed: false }, { name: "revealBlock", type: "uint256", indexed: false }] },
  { type: "event", name: "PlayerPackRevealed", inputs: [{ name: "user", type: "address", indexed: true }, { name: "player", type: "address", indexed: true }, { name: "countryIndex", type: "uint8", indexed: false }, { name: "role", type: "uint8", indexed: false }] },
  { type: "event", name: "PlayerPacksClaimed", inputs: [{ name: "user", type: "address", indexed: true }, { name: "count", type: "uint8", indexed: false }, { name: "countryIndex", type: "uint8", indexed: true }] },
  { type: "event", name: "CommitRecovered", inputs: [{ name: "user", type: "address", indexed: true }, { name: "countryIndex", type: "uint8", indexed: true }, { name: "count", type: "uint8", indexed: false }] },
] as const;

export const curveRouterAbi = [
  { type: "function", name: "buy", inputs: [{ name: "country", type: "address" }, { name: "fanovoIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "sell", inputs: [{ name: "country", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "poolManager", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "fanovo", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

export const playerRouterAbi = [
  { type: "function", name: "buy", inputs: [{ name: "player", type: "address" }, { name: "countryIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "sell", inputs: [{ name: "player", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "poolManager", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

export const countryFactoryAbi = [
  { type: "function", name: "createCountry", inputs: [{ name: "name_", type: "string" }, { name: "symbol_", type: "string" }, { name: "code_", type: "string" }], outputs: [{ type: "address" }], stateMutability: "nonpayable" },
  { type: "function", name: "completeSetup", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "countries", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "byCode", inputs: [{ name: "code", type: "string" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "countriesLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "allCountries", inputs: [], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "setupComplete", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "CountryCreated", inputs: [{ name: "index", type: "uint256", indexed: true }, { name: "token", type: "address", indexed: false }, { name: "code", type: "string", indexed: false }] },
  { type: "event", name: "SetupCompleted", inputs: [] },
] as const;

export const playerFactoryAbi = [
  { type: "function", name: "createPlayer", inputs: [{ name: "countryIndex", type: "uint8" }, { name: "role", type: "uint8" }, { name: "country", type: "address" }, { name: "name_", type: "string" }, { name: "symbol_", type: "string" }], outputs: [{ type: "address" }], stateMutability: "nonpayable" },
  { type: "function", name: "completeSetup", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "players", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "byCountry", inputs: [{ name: "countryIndex", type: "uint8" }, { name: "role", type: "uint8" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "playersOfCountry", inputs: [{ name: "countryIndex", type: "uint8" }], outputs: [{ type: "address" }, { type: "address" }, { type: "address" }], stateMutability: "view" },
  { type: "function", name: "playersLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "countryIndexOf", inputs: [{ name: "player", type: "address" }], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "roleOf", inputs: [{ name: "player", type: "address" }], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "isPlayer", inputs: [{ name: "player", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "setupComplete", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "hook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "PlayerCreated", inputs: [{ name: "playerIndex", type: "uint16", indexed: true }, { name: "countryIndex", type: "uint8", indexed: true }, { name: "role", type: "uint8", indexed: false }, { name: "token", type: "address", indexed: false }] },
  { type: "event", name: "SetupCompleted", inputs: [] },
] as const;

export const predictionMarketHubAbi = [
  { type: "function", name: "createMatch", inputs: [{ name: "countryIndexA", type: "uint8" }, { name: "countryIndexB", type: "uint8" }, { name: "stakingClosesAt", type: "uint64" }, { name: "settlementDeadline", type: "uint64" }, { name: "label", type: "string" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "stake", inputs: [{ name: "matchId", type: "uint256" }, { name: "side", type: "uint8" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "settle", inputs: [{ name: "matchId", type: "uint256" }, { name: "outcome", type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [{ name: "matchId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "cancelMatch", inputs: [{ name: "matchId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getMatch", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ type: "tuple", components: [{ type: "uint8" }, { type: "uint8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint8" }, { type: "uint128" }, { type: "uint128" }, { type: "uint128" }, { type: "bool" }, { type: "bool" }, { type: "string" }] }], stateMutability: "view" },
  { type: "function", name: "getUserStakes", inputs: [{ name: "matchId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "matches", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ type: "tuple", components: [{ type: "uint8" }, { type: "uint8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint8" }, { type: "uint128" }, { type: "uint128" }, { type: "uint128" }, { type: "bool" }, { type: "bool" }, { type: "string" }] }], stateMutability: "view" },
  { type: "function", name: "nextMatchId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "claimed", inputs: [{ name: "matchId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "treasury", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "fanovo", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "MatchCreated", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "countryIndexA", type: "uint8", indexed: true }, { name: "countryIndexB", type: "uint8", indexed: true }, { name: "stakingClosesAt", type: "uint64", indexed: false }, { name: "settlementDeadline", type: "uint64", indexed: false }, { name: "label", type: "string", indexed: false }] },
  { type: "event", name: "Staked", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "side", type: "uint8", indexed: false }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "MatchSettled", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "outcome", type: "uint8", indexed: false }, { name: "totalA", type: "uint256", indexed: false }, { name: "totalB", type: "uint256", indexed: false }, { name: "totalD", type: "uint256", indexed: false }] },
  { type: "event", name: "Claimed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "stakeReturned", type: "uint256", indexed: false }, { name: "prizeToken1", type: "address", indexed: false }, { name: "prizeAmount1", type: "uint256", indexed: false }, { name: "prizeToken2", type: "address", indexed: false }, { name: "prizeAmount2", type: "uint256", indexed: false }] },
] as const;

export const fanovoSaleAbi = [
  { type: "function", name: "buy", inputs: [{ name: "usdtAmount", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "markPoolCreated", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "recover", inputs: [{ name: "to", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "setTreasury", inputs: [{ name: "_treasury", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "transferOwnership", inputs: [{ name: "newOwner", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "poolCreated", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "PRICE_USD", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "usdt", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "fanovo", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "treasury", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "Buy", inputs: [{ name: "buyer", type: "address", indexed: true }, { name: "usdtAmount", type: "uint256", indexed: false }, { name: "fanovoAmount", type: "uint256", indexed: false }] },
  { type: "event", name: "PoolCreated", inputs: [] },
  { type: "event", name: "TreasurySet", inputs: [{ name: "treasury", type: "address", indexed: true }] },
  { type: "event", name: "OwnershipTransferred", inputs: [{ name: "previousOwner", type: "address", indexed: true }, { name: "newOwner", type: "address", indexed: true }] },
] as const;

export const fanovoTreasuryAbi = [
  { type: "function", name: "withdraw", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "transferOwnership", inputs: [{ name: "newOwner", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "balance", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "usdt", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "Withdraw", inputs: [{ name: "to", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "OwnershipTransferred", inputs: [{ name: "previousOwner", type: "address", indexed: true }, { name: "newOwner", type: "address", indexed: true }] },
] as const;

export const lineupsGameAbi = [
  { type: "function", name: "createRound", inputs: [{ name: "name", type: "string" }, { name: "entryFee", type: "uint256" }, { name: "lockTime", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "endTime", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "submitLineup", inputs: [{ name: "roundId", type: "uint256" }, { name: "captainPlayer", type: "address" }, { name: "bestPlayer", type: "address" }, { name: "rookiePlayer", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claimReward", inputs: [{ name: "roundId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "snapshotStartPrices", inputs: [{ name: "roundId", type: "uint256" }, { name: "players", type: "address[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "settleRound", inputs: [{ name: "roundId", type: "uint256" }, { name: "players", type: "address[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getRoundCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getUserLineup", inputs: [{ name: "roundId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "bool" }, { type: "bool" }, { type: "uint256" }] }], stateMutability: "view" },
  { type: "function", name: "getUserReward", inputs: [{ name: "roundId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "rounds", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "tuple", components: [{ type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "bool" }, { type: "uint256" }] }], stateMutability: "view" },
  { type: "function", name: "startPrices", inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "endPrices", inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "fanovo", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "playerHook", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "event", name: "RoundCreated", inputs: [{ name: "roundId", type: "uint256", indexed: true }, { name: "name", type: "string", indexed: false }, { name: "entryFee", type: "uint256", indexed: false }, { name: "lockTime", type: "uint256", indexed: false }, { name: "startTime", type: "uint256", indexed: false }, { name: "endTime", type: "uint256", indexed: false }] },
  { type: "event", name: "LineupSubmitted", inputs: [{ name: "roundId", type: "uint256", indexed: true }, { name: "user", type: "address", indexed: true }] },
  { type: "event", name: "RoundSettled", inputs: [{ name: "roundId", type: "uint256", indexed: true }, { name: "totalScore", type: "uint256", indexed: false }, { name: "pool", type: "uint256", indexed: false }] },
  { type: "event", name: "RewardClaimed", inputs: [{ name: "roundId", type: "uint256", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const;


