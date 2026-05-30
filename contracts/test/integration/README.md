# Integration tests

End-to-end tests that exercise the **full protocol against a real Uniswap V4
`PoolManager`**. Unlike the unit tests in `test/` (which use a mock pool manager
at `0x7777` and can only cover pack-minting/admin/access-control), these tests
cover the parts that only work with a live pool manager:

- Phase 2 activation
- Country trading (`CurveRouter` → `WorldCupHook.beforeSwap`)
- Player trading (`PlayerRouter` → `PlayerHook.beforeSwap`)
- Commit-reveal pack flows (country + player)
- Prediction market (stake → settle → claim)
- Lineups fantasy game (submit → snapshot → settle → claim)

## How it stays isolated from production

Everything runs on a local, throwaway EVM created by Foundry. No RPC, no private
key, no real network. Production contracts and `src/` are **never touched** — these
are new files under `test/integration/` only.

## Why a separate profile

The real `PoolManager` (in `lib/v4-core`) pins solc `0.8.26`, while the repo's
default profile pins `0.8.28` for prod byte-parity. The `src/` contracts use
`pragma ^0.8.26`, so they compile under either.

`foundry.toml` keeps two profiles:

- **default** — solc `0.8.28`, `skip = ["test/integration/**"]`. Prod builds and
  the original unit tests are unchanged.
- **integration** — solc `0.8.26`, compiles everything incl. the real pool manager.

## Running

```bash
# existing unit tests (prod profile, unchanged)
forge test

# integration tests
FOUNDRY_PROFILE=integration forge test --match-path "test/integration/*"

# a single integration file
FOUNDRY_PROFILE=integration forge test --match-path "test/integration/CountryTrading.t.sol" -vv
```

## Files

| File | Covers |
|------|--------|
| `IntegrationBase.t.sol` | Shared harness — deploys the whole system like the prod scripts |
| `Setup.t.sol` | Smoke test: everything wired + hook flags valid |
| `PackFlows.t.sol` | Commit-reveal for country + player packs, timeout recovery |
| `CountryTrading.t.sol` | Buy/sell country tokens, 5% burn, slippage, price moves |
| `PlayerTrading.t.sol` | Player phase-2 auto-activation, buy/sell players |
| `PredictionMarket.t.sol` | Match create/stake/settle/claim, draw, cancel |
| `LineupsGame.t.sol` | Full fantasy round, role/country validation |
| `FullLifecycle.t.sol` | One sweep through every phase in order |

## Note on phase-2 activation

The country `PackOpener` auto-activates phase 2 at `MAX_PACKS` (48,000 packs).
Opening 48k packs in a loop is too slow for a test, so the lifecycle tests verify
the transition via `packOpener.activatePhase2()` (the same call the opener makes
internally). The commit-reveal mint path itself is covered in `PackFlows.t.sol`.

## Verifying the LIVE production deployment (read-only)

The integration tests above verify *contract logic*. To verify that your actual
on-chain deployment is wired and finalized correctly, use the read-only script:

```bash
forge build                                              # ensure out/ ABIs exist

# easiest: pull addresses straight from the frontend, use public RPC
python script/refresh/10_VerifyDeployment.py --from-frontend

# or use script/refresh/.env (RPC_URL_XLAYER + deployed addresses)
python script/refresh/10_VerifyDeployment.py

# skip the slower pool checks
python script/refresh/10_VerifyDeployment.py --from-frontend --no-pools
```

It sends **no transactions** and needs **no private key** (only an RPC URL, which
defaults to the public X Layer endpoint). Pool checks use Multicall3, so all
48 + 144 pools are verified in a couple of batched calls. It checks: token supply,
both hooks finalized + fully registered, both factories complete, all country and
player pools initialized and bound to their hooks, and the opener/router/market/
game wiring. Exit code is non-zero if any check fails, so it can be used in CI.

Last run against X Layer mainnet: **31 passed, 0 failed**.

