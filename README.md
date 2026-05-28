# Fanovo Protocol

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Foundry-Framework-FF6D3F?logo=ethereum)](https://book.getfoundry.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![X Layer](https://img.shields.io/badge/X%20Layer-Chain%20196-000000)](https://www.okx.com/xlayer)

> A Uniswap v4 hooks-based prediction market and fantasy sports protocol built on X Layer for the World Cup.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Demo](#demo)
- [Contracts](#contracts)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Tech Stack](#tech-stack)
- [Partners](#partners)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Fanovo is a next-generation decentralized gaming protocol that combines:

- **Bonding curves** via Uniswap v4 hooks for 48 country tokens and 144 player tokens
- **Prediction markets** for betting on World Cup match outcomes
- **Fantasy lineups** game where users build teams and earn rewards

The protocol is deployed on **X Layer Mainnet (Chain 196)** and uses **FANOVO** as the native utility token.

---

## Features

- 🏆 **48 Country Tokens** — Each country has its own ERC-20 token with a bonding curve. Open packs to mint random country tokens.
- ⚽ **144 Player Tokens** — 3 players per country (Captain, Best, Rookie) with role-based supply caps and trading via Uniswap v4 pools.
- 🎲 **Prediction Market** — Bet FANOVO tokens on match outcomes. Stake, claim, and earn rewards.
- 🎯 **Lineups Game** — Build fantasy lineups with player tokens. Compete in rounds and claim rewards based on scores.
- 🔥 **Deflationary Tokenomics** — Every swap burns a portion of tokens, creating sustainable value accrual.
- ⛓️ **X Layer Mainnet** — Fast, low-cost transactions with EVM compatibility.
- 🎒 **Commit-Reveal Packs** — Fair pack opening with cryptographic delay to prevent front-running.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Fanovo Protocol                       │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: Country Tokens                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   FANOVO     │───▶│  PackOpener  │───▶│ CountryToken │  │
│  │   Token      │    │  (commit-    │    │   (x48)      │  │
│  │              │    │   reveal)    │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                            │      │
│         │         450 packs triggers Phase 2         │      │
│         │◀───────────────────────────────────────────│      │
│         │                                            │      │
│  Phase 2: Player Tokens                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ CountryToken │───▶│PlayerPackOpener│──▶│ PlayerToken  │  │
│  │              │    │  (commit-    │    │   (x144)     │  │
│  │              │    │   reveal)    │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Uniswap v4 Hook Trading                 │  │
│  │         WorldCupHook ◄─────► PlayerHook              │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                              │
│         ┌────────────────────┼────────────────────┐        │
│         ▼                    ▼                    ▼        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │  Prediction  │   │   Lineups    │   │   Curve/     │   │
│  │   Market     │   │    Game      │   │   Player     │   │
│  │   Hub        │   │              │   │   Routers    │   │
│  └──────────────┘   └──────────────┘   └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| `WorldCupHook` | Uniswap v4 hook for country token bonding curves and pack minting |
| `PlayerHook` | Uniswap v4 hook for player token bonding curves and trading |
| `PackOpener` | Commit-reveal pack opener for country tokens (burns FANOVO) |
| `PlayerPackOpener` | Commit-reveal pack opener for player tokens (burns Country tokens) |
| `CurveRouter` | Simplified router for buying/selling country tokens |
| `PlayerRouter` | Simplified router for buying/selling player tokens |
| `PredictionMarketHub` | On-chain prediction market for match outcomes |
| `LineupsGame` | Fantasy sports game with rounds and rewards |

---

## Demo

> 🎥 **Coming soon**: A video demo of the Fanovo Protocol UI will be added here.

### Screenshots

> 📸 Screenshots of the application will be added here.

---

## Contracts

All contracts are deployed on **X Layer Mainnet (Chain 196)**.

### Core

| Contract | Address |
|----------|---------|
| **FANOVO Token** | `0xe81de3d4db134d2E722Bc4A2E4f07e4A4231b131` |
| **FanovoSale** | `0x492FcadaA3a959d162f585783D7671c0F61523cD` |
| **FanovoTreasury** | `0xAA28CC5434Eed5e597697599798D80c622705AeA` |

### Hooks

| Contract | Address |
|----------|---------|
| **WorldCupHook** | `0x3E5bb4D77Fd54A9b3417d2119410A2D15167eaa8` |
| **PlayerHook** | `0x65b705ed083F54562d81DCdd3510EB986A592AA8` |

### Factories

| Contract | Address |
|----------|---------|
| **CountryFactory** | `0x211cd8002090DC1A96609E48Ff2bF934C3fA729F` |
| **PlayerFactory** | `0xaf6b5a193d1743E10723864169700b36EC7a506F` |

### Pack Openers

| Contract | Address |
|----------|---------|
| **PackOpener** (countries) | `0x77d413eFeB04f818E2d6435d91f63cd180213d44` |
| **PlayerPackOpener** | `0x013c7d43F746a68282e9452bB65BBF6aB155831A` |

### Routers

| Contract | Address |
|----------|---------|
| **CurveRouter** | `0x2A1780b5c2e54a918719dE67f5C138003908b8e3` |
| **PlayerRouter** | `0x2D19D8fF5518B6809f25dC062FE763709eAd33b1` |

### Games & Markets

| Contract | Address |
|----------|---------|
| **PredictionMarketHub** | `0x3aFf12bc0a69f82CF91452E03E8B8c13349cc7f7` |
| **LineupsGame** | `0x0D1b651350bF9A84D491D7735496C3d572A6867D` |

### External

| Contract | Address |
|----------|---------|
| **USDT** | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` |
| **Uniswap v4 PoolManager** | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) — for smart contract development
- [Node.js](https://nodejs.org/) 20+ — for frontend development
- [Git](https://git-scm.com/) — version control

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/fanovo.git
cd fanovo
```

2. **Install contract dependencies**

```bash
cd contracts
forge install foundry-rs/forge-std
forge install Uniswap/v4-core
forge install Uniswap/v4-periphery
```

3. **Install frontend dependencies**

```bash
cd ../frontend
npm install
```

4. **Set up environment variables**

```bash
cd ../contracts
cp .env.example .env
# Edit .env with your private key and RPC endpoint
```

### Build & Test

**Contracts:**

```bash
cd contracts
forge build
forge test
```

**Frontend:**

```bash
cd frontend
npm run dev
```

---

## Usage

### Buying Country Tokens

```bash
cast send 0x2A1780b5c2e54a918719dE67f5C138003908b8e3 \
  --rpc-url https://rpc.xlayer.tech \
  --private-key $PRIVATE_KEY \
  "buy(address,uint256,uint256)" \
  0x...countryToken... \
  1000000000000000000 \
  0
```

### Opening Player Packs

```bash
cast send 0x013c7d43F746a68282e9452bB65BBF6aB155831A \
  --rpc-url https://rpc.xlayer.tech \
  --private-key $PRIVATE_KEY \
  "commitPlayerPacks(uint8,uint8)" \
  0 \
  1
```

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Home page with stats and phases |
| `/markets` | Country token markets |
| `/markets/players/[id]` | Player tokens for a country |
| `/pack` | Open country token packs |
| `/players-pack` | Open player token packs |
| `/predict` | Prediction market betting |
| `/lineups` | Fantasy lineups game |
| `/portfolio` | User token portfolio |
| `/buy` | Buy FANOVO tokens |
| `/tokenomics` | Tokenomics information |
| `/mechanics` | Protocol mechanics explanation |
| `/trade/[id]` | Trade specific country token |

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Solidity | 0.8.28 | Smart contracts |
| Foundry | Latest | Development framework |
| Uniswap v4 | Latest | DEX hooks |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.6 | React framework |
| React | 19.2.4 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Wagmi | 3.6.15 | Web3 connection |
| Viem | 2.51.0 | Ethereum library |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| X Layer | L2 blockchain (Chain 196) |
| Uniswap v4 | AMM with custom hooks |

---

## Partners

Built with:

- [@XLayerOfficial](https://x.com/XLayerOfficial) — The blockchain powering Fanovo
- [@Uniswap](https://x.com/Uniswap) — Uniswap v4 hooks infrastructure
- [@flapdotsh](https://x.com/flapdotsh) — Development partner

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow [Foundry best practices](https://book.getfoundry.sh/)
- Use TypeScript strict mode for frontend
- Write tests for new contracts
- Update documentation for API changes

---

## License

This project is licensed under the MIT License.

---

<p align="center">
  Built with ❤️ for the World Cup
</p>
