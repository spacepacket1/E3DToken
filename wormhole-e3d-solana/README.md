# Wormhole E3D Solana Bridge

## What this project does

This project bridges E3D from Ethereum to Solana through the Wormhole Token Bridge. The flow is:
attest the Ethereum ERC-20, transfer E3D from Ethereum, redeem on Solana, and verify balances on
both chains.

## Why Ethereum E3D is canonical

Ethereum E3D is the canonical asset because it is the original ERC-20 with the established supply,
existing liquidity, and contract history. This bridge treats Ethereum as the source of truth rather
than creating a second independent E3D economy on Solana.

## Why Solana E3D is wrapped, not a new token

Solana E3D in this project is a Wormhole-wrapped representation of Ethereum E3D, not a new token.
That avoids fragmented supply, keeps the asset 1:1 backed by the locked Ethereum-side E3D, and
preserves a single canonical asset definition across chains.

## Wormhole Wrapped Token Transfers vs Native Token Transfers

Wormhole supports different transfer models depending on whether the asset is native to the source
chain or already exists as a wrapped representation elsewhere. Native Token Transfers are for
Wormhole's newer native-asset flow. Wrapped Token Transfers use the Token Bridge model, where the
canonical token stays on its origin chain and wrapped tokens are minted on the destination chain
after verification. This project uses Wrapped Token Transfers because E3D is canonical on Ethereum
and Solana receives the Wormhole-wrapped SPL version.

## Testnet/devnet process

Use this process first with `ETH_CHAIN=Sepolia`, `SOLANA_CHAIN=SolanaDevnet`, and
`WORMHOLE_NETWORK=Testnet`.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:
   - Sepolia RPC URL
   - Solana devnet RPC URL
   - Ethereum private key
   - Solana private key or keypair path
   - `TRANSFER_AMOUNT_E3D`
   - `SOLANA_RECIPIENT_ADDRESS`
3. Confirm `E3D_TOKEN_ADDRESS` is set to the intended E3D contract for the run.
4. Confirm the Ethereum wallet holds E3D and enough Sepolia ETH for gas.
5. Confirm the Solana wallet holds enough devnet SOL for fees and token-account rent.
6. Check whether a wrapped Solana mint already exists:

   ```bash
   npm run check
   ```

7. If no wrapped mint exists yet, attest the Ethereum token:

   ```bash
   npm run attest
   ```

8. Transfer E3D from Ethereum to Solana:

   ```bash
   npm run transfer
   ```

9. If the transfer output says manual redemption is needed, redeem using the saved transfer record:

   ```bash
   npm run redeem -- transfers/transfer-<timestamp>-eth-to-solana.json
   ```

10. Verify balances on both chains:

    ```bash
    npm run balances
    ```

## Mainnet process

Mainnet carries real asset risk. Verify addresses before every run, test on Testnet first, and
bridge a tiny amount before attempting a larger transfer.

1. Start only after the Sepolia + SolanaDevnet process has succeeded end to end.
2. Set `.env` for mainnet use:
   - `ETH_CHAIN` to the intended Ethereum mainnet setting used by the scripts
   - `SOLANA_CHAIN` to the intended Solana mainnet setting used by the scripts
   - `WORMHOLE_NETWORK=Mainnet`
   - production RPC URLs
3. Verify the E3D token address against the known Ethereum mainnet E3D address before any mainnet
   command.
4. Verify Wormhole Token Bridge and related contract addresses against the official Wormhole docs
   before any mainnet command.
5. Confirm the Ethereum wallet has mainnet E3D and enough ETH for gas.
6. Confirm the Solana wallet has enough SOL for fees and rent.
7. Run:

   ```bash
   npm run check
   ```

8. If the wrapped mint does not already exist on Solana mainnet, run:

   ```bash
   npm run attest
   ```

9. Bridge a tiny amount first:

   ```bash
   npm run transfer
   ```

10. If required, redeem the transfer using the saved JSON record:

    ```bash
    npm run redeem -- transfers/transfer-<timestamp>-eth-to-solana.json
    ```

11. Verify balances:

    ```bash
    npm run balances
    ```

12. Only after the small transfer succeeds should you consider larger transfers.

## Required wallets

- Ethereum wallet with E3D and ETH for gas
- Solana wallet with SOL for fees and rent

## Environment variables

| Variable | Description |
| --- | --- |
| `ETH_RPC_URL` | Ethereum RPC endpoint used by the bridge scripts. |
| `SOLANA_RPC_URL` | Solana RPC endpoint used by the bridge scripts. |
| `ETH_PRIVATE_KEY` | Ethereum private key for the wallet that holds E3D and pays Ethereum gas. |
| `SOLANA_PRIVATE_KEY_OR_KEYPAIR_PATH` | Solana signer, provided either as a private key value or as a path to a keypair file, used for redemption and Solana-side transactions. |
| `E3D_TOKEN_ADDRESS` | Ethereum E3D ERC-20 contract address to attest and bridge. `.env.example` defaults this to `0x6488861b401F427D13B6619C77C297366bCf6386`. |
| `ETH_CHAIN` | Ethereum chain identifier expected by the scripts, such as `Sepolia`. |
| `SOLANA_CHAIN` | Solana chain identifier expected by the scripts, such as `SolanaDevnet`. |
| `WORMHOLE_NETWORK` | Wormhole environment for the run. Supported values are `Testnet` or `Mainnet`. |
| `TRANSFER_AMOUNT_E3D` | Amount of E3D to bridge from Ethereum to Solana. |
| `SOLANA_RECIPIENT_ADDRESS` | Solana recipient address that should receive the wrapped E3D. |

## Commands

```bash
npm install
npm run check
npm run attest
npm run transfer
npm run redeem
npm run balances
```

## Safety warnings

- Never commit `.env`.
- Verify E3D token address against the known mainnet address before any mainnet run.
- Verify Wormhole contract addresses from official Wormhole docs.
- Always test on Testnet first.
- Bridge a tiny amount first on mainnet.
- Never mint wrapped E3D outside Wormhole.

## Future TODO: maps.e3d.ai API Toll Model

This repository is only for Wormhole bridging. The future toll model implementation belongs in
`/Users/cbloom/e3d-maps`, not here.

- Agents pay E3DToken to use `maps.e3d.ai` APIs.
- Supported chains may include Ethereum, Solana, Base, BNB.
- Example tolls:
  - `/api/maps/route` = `0.1 E3D`
  - `/api/maps/congestion` = `0.05 E3D`
  - `/api/maps/hazards` = `0.2 E3D`
  - `/api/maps/prediction` = `1 E3D`
