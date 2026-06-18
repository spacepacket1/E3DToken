# Wormhole E3D Solana Bridge

Bridge the Ethereum E3D ERC-20 token to Solana as a Wormhole-wrapped SPL token.

**Design principle:** Ethereum E3D is the canonical asset. Solana E3D is a 1:1 Wormhole-wrapped
representation. No separate supply is created.

**Working directory:** `/Users/cbloom/E3DToken`

**Output folder:** `wormhole-e3d-solana/` (created in Phase 1)

**Read before every phase:**
- `E3DToken.sol`
- `wormhole-e3d-solana/package.json` (after Phase 1)
- `wormhole-e3d-solana/src/config.ts` (after Phase 1)

---

## Phase 1 — Project scaffold

Create the folder `wormhole-e3d-solana/` and all boilerplate files. Do not implement any
Wormhole logic yet — stubs only.

### Files to create

**`wormhole-e3d-solana/package.json`**

- `name`: `wormhole-e3d-solana`
- `version`: `0.1.0`
- `type`: `module`
- dependencies: `@wormhole-foundation/sdk`, `@solana/web3.js`, `ethers`, `dotenv`
- devDependencies: `tsx`, `typescript`, `@types/node`
- scripts:
  - `check`: `tsx src/check-wrapped-e3d.ts`
  - `attest`: `tsx src/attest-e3d.ts`
  - `transfer`: `tsx src/transfer-e3d-to-solana.ts`
  - `redeem`: `tsx src/redeem-on-solana.ts`
  - `balances`: `tsx src/check-balances.ts`

**`wormhole-e3d-solana/tsconfig.json`**

- `target`: `ES2022`, `module`: `Node16`, `moduleResolution`: `Node16`
- `strict`: true, `esModuleInterop`: true
- `include`: `["src"]`

**`wormhole-e3d-solana/.env.example`**

```
ETH_RPC_URL=
SOLANA_RPC_URL=
ETH_PRIVATE_KEY=
SOLANA_PRIVATE_KEY_OR_KEYPAIR_PATH=
E3D_TOKEN_ADDRESS=0x6488861b401F427D13B6619C77C297366bCf6386
ETH_CHAIN=Sepolia
SOLANA_CHAIN=SolanaDevnet
WORMHOLE_NETWORK=Testnet
TRANSFER_AMOUNT_E3D=
SOLANA_RECIPIENT_ADDRESS=
```

**`wormhole-e3d-solana/.gitignore`**

Ignore: `.env`, `node_modules/`, `dist/`, `transfers/`

**`wormhole-e3d-solana/src/config.ts`**

Load and validate all env vars from `.env`. Export a typed `config` object with:
- `ethRpcUrl`, `solanaRpcUrl`
- `ethPrivateKey`, `solanaKeypairPath`
- `e3dTokenAddress`
- `ethChain`, `solanaChain`
- `wormholeNetwork` (`"Mainnet"` or `"Testnet"`)
- `transferAmountE3d`, `solanaRecipientAddress`

Throw a clear error if any required var is missing.

**`wormhole-e3d-solana/src/utils.ts`**

Export helper stubs:
- `getSigner(config)` — returns an ethers `Wallet` connected to the provider
- `getSolanaKeypair(config)` — loads a Solana `Keypair` from a path or base58 private key
- `saveTransferRecord(data)` — writes a JSON file to `transfers/transfer-<timestamp>-eth-to-solana.json`

**`wormhole-e3d-solana/src/check-wrapped-e3d.ts`** — stub: print "not implemented"

**`wormhole-e3d-solana/src/attest-e3d.ts`** — stub: print "not implemented"

**`wormhole-e3d-solana/src/transfer-e3d-to-solana.ts`** — stub: print "not implemented"

**`wormhole-e3d-solana/src/redeem-on-solana.ts`** — stub: print "not implemented"

**`wormhole-e3d-solana/src/check-balances.ts`** — stub: print "not implemented"

### Acceptance criteria

- `wormhole-e3d-solana/` folder exists with all listed files
- `package.json` is valid JSON with correct scripts
- `tsconfig.json` is valid JSON
- `.env.example` contains all required keys
- `.gitignore` ignores `.env` and `node_modules`
- `src/config.ts` compiles (`npx tsc --noEmit` passes)
- No hard-coded private keys anywhere

---

## Phase 2 — check-wrapped-e3d

Implement `src/check-wrapped-e3d.ts`. Do not modify any other script.

### Purpose

Query the Wormhole SDK to determine whether a wrapped SPL token already exists on Solana for
the canonical Ethereum E3D ERC-20.

### Expected behavior

1. Load config from `src/config.ts`.
2. Initialize the Wormhole SDK for the configured network (`Mainnet` or `Testnet`).
3. Get the Ethereum chain context and the Solana chain context.
4. Wrap the E3D token address as a Wormhole `TokenId`.
5. Call the SDK to look up the wrapped asset on Solana.
6. Print:
   - Ethereum E3D token address
   - Solana wrapped E3D mint address (if found)
   - Whether attestation is needed
   - Network in use

If no wrapped asset exists, print:

```
Wrapped E3D mint not found on Solana. Run: npm run attest
```

If the wrapped asset exists, print the mint address clearly.

### Acceptance criteria

- Script runs without error on Testnet when `WORMHOLE_NETWORK=Testnet`
- Correctly reports "not found" when no attestation has been done
- Correctly reports the mint address when attestation has been done
- Does not throw an unhandled exception in either case
- `npx tsc --noEmit` passes

---

## Phase 3 — attest-e3d

Implement `src/attest-e3d.ts`. Do not modify any other script.

### Purpose

Attest the Ethereum E3D ERC-20 token through Wormhole so a corresponding wrapped SPL mint is
created on Solana. Attestation only needs to happen once per token per network.

### Expected behavior

1. Load config.
2. Initialize Wormhole SDK.
3. Check whether the wrapped asset already exists on Solana (reuse logic from Phase 2).
4. If it already exists, print the existing mint address and exit cleanly — do not submit
   a duplicate attestation.
5. If it does not exist:
   - Connect Ethereum signer via `getSigner`.
   - Submit token attestation transaction on Ethereum.
   - Print Ethereum tx hash.
   - Wait for Wormhole guardian signatures / VAA.
   - Submit the VAA on Solana to create the wrapped mint.
   - Print:
     - Ethereum tx hash
     - Wormhole VAA sequence
     - Solana tx signature
     - Wrapped E3D SPL mint address

### Acceptance criteria

- Running the script twice does not create duplicate assets
- If wrapped asset already exists, script exits with a clear message (exit code 0)
- All addresses and hashes printed clearly
- No hard-coded addresses or keys
- `npx tsc --noEmit` passes

---

## Phase 4 — transfer-e3d-to-solana

Implement `src/transfer-e3d-to-solana.ts`. Do not modify any other script.

### Purpose

Bridge a configured amount of E3D from Ethereum to Solana through the Wormhole Token Bridge.

### Expected behavior

1. Load config; require `TRANSFER_AMOUNT_E3D` and `SOLANA_RECIPIENT_ADDRESS`.
2. Connect Ethereum signer via `getSigner`.
3. Check E3D balance on Ethereum — abort with a clear message if insufficient.
4. Check Wormhole Token Bridge allowance for the E3D contract.
5. If allowance is insufficient, submit an approval transaction and wait for confirmation.
6. Initiate the Wormhole token bridge transfer.
7. Print Ethereum tx hash.
8. Wait for Guardian VAA (with a reasonable timeout).
9. Save transfer metadata using `saveTransferRecord` from `src/utils.ts`:
   - `sourceChain`, `destinationChain`
   - `e3dTokenAddress`, `solanaRecipientAddress`
   - `amount`
   - `ethTxHash`
   - `vaaSequence` (if available)
   - `status` (`"pending_redeem"` or `"complete"` if auto-relayed)
   - `timestamp`
10. Print the path to the saved JSON file.
11. Print next step: `"Run: npm run redeem -- <path-to-json>"` if manual redemption is needed.

### Acceptance criteria

- Aborts cleanly if E3D balance is insufficient
- Approval step is skipped if allowance is already sufficient
- Transfer metadata JSON is saved to `transfers/`
- `npx tsc --noEmit` passes
- No hard-coded addresses or keys

---

## Phase 5 — redeem-on-solana

Implement `src/redeem-on-solana.ts`. Do not modify any other script.

### Purpose

Manually redeem a pending Wormhole transfer on Solana using a saved transfer metadata JSON.

### Expected behavior

1. Accept the path to a transfer JSON file as a CLI argument (`process.argv[2]`).
2. Load and parse the transfer JSON.
3. Load config.
4. Initialize Wormhole SDK.
5. Fetch or reconstruct the VAA from the saved sequence/chain data.
6. Load Solana keypair via `getSolanaKeypair`.
7. Submit the redemption transaction on Solana.
8. Print:
   - Solana tx signature
   - Recipient token account address
   - Wrapped E3D mint address
   - Amount received
9. Update the transfer JSON `status` to `"redeemed"`.

### Acceptance criteria

- Fails clearly if no JSON path argument is provided
- Fails clearly if the JSON file does not exist
- Fails clearly if the transfer is already redeemed
- Prints all output addresses clearly
- `npx tsc --noEmit` passes

---

## Phase 6 — check-balances

Implement `src/check-balances.ts`. Do not modify any other script.

### Purpose

Check balances on both chains after a bridge operation.

### Expected behavior

1. Load config.
2. Initialize Wormhole SDK.
3. Connect Ethereum provider; query E3D ERC-20 balance of the source wallet.
4. Connect Solana; query wrapped E3D SPL token balance of `SOLANA_RECIPIENT_ADDRESS`.
5. Query SOL balance of the Solana recipient (for rent/fees).
6. Print:
   - Ethereum wallet address
   - Ethereum E3D balance
   - Solana recipient address
   - Solana wrapped E3D balance
   - Wrapped E3D mint address
   - SOL balance

### Acceptance criteria

- Runs without error when no wrapped asset exists yet (prints 0 balance gracefully)
- All balances printed with token symbol and correct decimals
- `npx tsc --noEmit` passes

---

## Phase 7 — README

Write `wormhole-e3d-solana/README.md`. Do not modify any source files.

### Required sections

1. **What this project does** — bridge E3D from Ethereum to Solana via Wormhole Token Bridge
2. **Why Ethereum E3D is canonical** — original supply, liquidity, contract history
3. **Why Solana E3D is wrapped, not a new token** — no fragmented supply, 1:1 backing
4. **Wormhole Wrapped Token Transfers vs Native Token Transfers** — brief explanation of the
   difference and why Wrapped Token Transfers is used here
5. **Testnet/devnet process** — step-by-step using Sepolia + SolanaDevnet
6. **Mainnet process** — step-by-step with safety warnings
7. **Required wallets**
   - Ethereum wallet with E3D and ETH for gas
   - Solana wallet with SOL for fees and rent
8. **Environment variables** — table of all vars from `.env.example` with descriptions
9. **Commands**
   ```
   npm install
   npm run check
   npm run attest
   npm run transfer
   npm run redeem
   npm run balances
   ```
10. **Safety warnings**
    - Never commit `.env`
    - Verify E3D token address against the known mainnet address before any mainnet run
    - Verify Wormhole contract addresses from official Wormhole docs
    - Always test on Testnet first
    - Bridge a tiny amount first on mainnet
    - Never mint wrapped E3D outside Wormhole
11. **Future TODO: maps.e3d.ai API Toll Model**
    - Agents pay E3DToken to use maps.e3d.ai APIs
    - Supported chains may include Ethereum, Solana, Base, BNB
    - Example tolls: `/api/maps/route` = 0.1 E3D, `/api/maps/congestion` = 0.05 E3D,
      `/api/maps/hazards` = 0.2 E3D, `/api/maps/prediction` = 1 E3D
    - Implementation belongs in `/Users/cbloom/e3d-maps`, not here

### Acceptance criteria

- All 11 sections present
- Mainnet section includes explicit warning to verify addresses and test on Testnet first
- `.env.example` vars table is complete and accurate
- Commands section matches actual `package.json` scripts
