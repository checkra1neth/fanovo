# Fanovo Protocol

A Uniswap v4 hooks-based prediction market and fantasy sports protocol built for the PITCH World Cup.

## Architecture

Fanovo consists of two main token systems connected through Uniswap v4 hooks:

### Phase 1: Country Tokens (FIFA)
- 48 country ERC-20 tokens with bonding curves
- Users buy packs using FANOVO tokens
- Pack minting triggers phase 2 when 450 packs per country are opened

### Phase 2: Player Tokens  
- 144 player ERC-20 tokens (3 per country: Captain, Best, Rookie)
- Trading via Uniswap v4 pools with player-specific bonding curves
- Country tokens are used to buy player tokens

### Games & Markets
- **Prediction Market**: Bet FANOVO on match outcomes
- **Lineups Game**: Build fantasy lineups with player tokens for rewards

## Contracts (X Layer Mainnet — Chain 196)

### Core
| Contract | Address |
|----------|---------|
| FANOVO Token | `0xe81de3d4db134d2E722Bc4A2E4f07e4A4231b131` |
| FanovoSale | `0x492FcadaA3a959d162f585783D7671c0F61523cD` |
| FanovoTreasury | `0xAA28CC5434Eed5e597697599798D80c622705AeA` |

### Hooks
| Contract | Address |
|----------|---------|
| WorldCupHook | `0x3E5bb4D77Fd54A9b3417d2119410A2D15167eaa8` |
| PlayerHook | `0x65b705ed083F54562d81DCdd3510EB986A592AA8` |

### Factories
| Contract | Address |
|----------|---------|
| CountryFactory | `0x211cd8002090DC1A96609E48Ff2bF934C3fA729F` |
| PlayerFactory | `0xaf6b5a193d1743E10723864169700b36EC7a506F` |

### Pack Openers
| Contract | Address |
|----------|---------|
| PackOpener (countries) | `0x77d413eFeB04f818E2d6435d91f63cd180213d44` |
| PlayerPackOpener | `0x013c7d43F746a68282e9452bB65BBF6aB155831A` |

### Routers
| Contract | Address |
|----------|---------|
| CurveRouter | `0x2A1780b5c2e54a918719dE67f5C138003908b8e3` |
| PlayerRouter | `0x2D19D8fF5518B6809f25dC062FE763709eAd33b1` |

### Games & Markets
| Contract | Address |
|----------|---------|
| PredictionMarketHub | `0x3aFf12bc0a69f82CF91452E03E8B8c13349cc7f7` |
| LineupsGame | `0x0D1b651350bF9A84D491D7735496C3d572A6867D` |

### External
| Contract | Address |
|----------|---------|
| USDT | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` |
| Uniswap v4 PoolManager | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |

## Project Structure

```
tifosy/
├── contracts/          # Foundry Solidity project
│   ├── src/           # Active contracts (17 .sol files)
│   ├── script/        # Deployment scripts
│   ├── test/          # Foundry tests
│   ├── broadcast/     # Deployment transaction logs
│   └── lib/           # Foundry dependencies
├── frontend/          # Next.js 14+ application
│   ├── src/
│   │   ├── app/      # Next.js App Router pages
│   │   ├── components/ # React components
│   │   └── lib/      # Utilities, ABIs, contract addresses
│   └── public/       # Static assets
├── archive/           # Archived old code
│   ├── original-pitch/ # Original PITCH protocol contracts
│   ├── reference/     # Reference implementations
│   └── scripts/      # One-off deployment scripts
└── .gitignore        # Git ignore rules
```

## Development

### Contracts
```bash
cd contracts
forge build
forge test
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deployment

Main deployment script: `contracts/script/DeployAll.s.sol`

Uses CREATE2 deterministic deployment with pre-mined salts:
- WorldCupHook salt: `0x14142`
- PlayerHook salt: `0xaea4`

## License

MIT
