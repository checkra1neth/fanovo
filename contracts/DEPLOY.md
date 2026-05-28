# Деплой на X Layer

## Подготовка

1. Создай `.env` файл из `.env.example`:
```bash
cp .env.example .env
```

2. Вставь свой приватный ключ в `.env`:
```
PRIVATE_KEY=0x_your_private_key_here
RPC_URL_XLAYER=https://rpc.xlayer.tech
RPC_URL_XLAYER_TESTNET=https://testrpc.xlayer.tech
```

3. Убедись что на кошельке есть OKB для газа:
   - **Mainnet (chain 196):** нужен реальный OKB
   - **Testnet (chain 195):** получи тестовый OKB на https://faucets.chain.link/xlayer-testnet

## Деплой на Testnet

```bash
source .env
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL_XLAYER_TESTNET \
  --broadcast \
  --verify \
  -vvvv
```

## Деплой на Mainnet

```bash
source .env
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL_XLAYER \
  --broadcast \
  --verify \
  -vvvv
```

## После деплоя

1. Сохрани адреса контрактов из вывода
2. Вызови `activateTrading()` когда pack window закроется
3. Зарегистрируй пулы через `registerPool()` для каждой страны

## Адреса Uniswap V4 на X Layer (mainnet, chain 196)

| Contract | Address |
|----------|---------|
| PoolManager | 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32 |
| PositionManager | 0xcf1eafc6928dc385a342e7c6491d371d2871458b |
| Quoter | 0x8928074ca1b241d8ec02815881c1af11e8bc5219 |
| Universal Router | 0xda00ae15d3a71466517129255255db7c0c0956d3 |
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 |
