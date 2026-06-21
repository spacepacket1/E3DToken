import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";

async function main(): Promise<void> {
  const wh = await wormhole(config.wormholeNetwork, [evm]);
  const ethChain = wh.getChain(config.ethChain as Chain);
  const baseChain = wh.getChain(config.baseChain as Chain);

  const ethProvider = new JsonRpcProvider(config.ethRpcUrl);
  const baseProvider = new JsonRpcProvider(config.baseRpcUrl);
  const ethSigner = await getEvmSignerForKey(ethProvider, config.ethPrivateKey);
  const baseSigner = await getEvmSignerForKey(baseProvider, config.basePrivateKey);

  const ethTokenBridge = await ethChain.getTokenBridge();
  const baseTokenBridge = await baseChain.getTokenBridge();
  const e3dTokenId = {
    chain: config.ethChain as Chain,
    address: toNative(config.ethChain as Chain, config.e3dTokenAddress),
  };

  // Check if wrapped E3D already exists on Base
  try {
    const existing = await baseTokenBridge.getWrappedAsset(e3dTokenId);
    console.log(`Wrapped E3D already exists on Base: ${existing}`);
    console.log("Attestation already completed — run 'npm run check' to confirm.");
    return;
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  // Step 1: attest on Ethereum (skip if resuming from a saved tx)
  const pendingTxFile = "attest-pending-txhash.txt";
  let ethTxHash: string;

  if (existsSync(pendingTxFile)) {
    ethTxHash = readFileSync(pendingTxFile, "utf8").trim();
    console.log(`Resuming from saved Ethereum tx hash: ${ethTxHash}`);
  } else {
    console.log("Submitting attestation on Ethereum...");
    const attestTxs = ethTokenBridge.createAttestation(
      config.e3dTokenAddress as unknown as Parameters<typeof ethTokenBridge.createAttestation>[0],
      ethSigner.address() as unknown as Parameters<typeof ethTokenBridge.createAttestation>[1]
    );
    const ethTxids = await signSendWait(ethChain, attestTxs, ethSigner);
    ethTxHash = ethTxids[ethTxids.length - 1]?.txid ?? String(ethTxids[0]);
    writeFileSync(pendingTxFile, ethTxHash, "utf8");
    console.log(`Ethereum tx hash: ${ethTxHash}`);
  }

  // Step 2: wait for Wormhole guardian VAA (5-15 min on mainnet)
  console.log("Waiting for Wormhole guardian VAA (5–15 minutes on mainnet)...");
  const [whMessage] = await ethChain.parseTransaction(ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:AttestMeta", 1_800_000);
  if (!vaa) throw new Error("Timed out waiting for Wormhole VAA after 30 minutes");
  console.log(`Wormhole VAA sequence: ${vaa.sequence}`);

  // Step 3: create wrapped E3D on Base
  console.log("Creating wrapped E3D on Base...");
  const createWrappedTxs = baseTokenBridge.submitAttestation(
    vaa,
    baseSigner.address() as unknown as Parameters<typeof baseTokenBridge.submitAttestation>[1]
  );
  const baseTxids = await signSendWait(baseChain, createWrappedTxs, baseSigner);
  const baseTxHash = baseTxids[baseTxids.length - 1]?.txid ?? String(baseTxids[0]);
  console.log(`Base tx hash: ${baseTxHash}`);

  // Step 4: confirm and print the wrapped token address
  const wrappedAddress = await baseTokenBridge.getWrappedAsset(e3dTokenId);
  console.log(`\nWrapped E3D address on Base: ${wrappedAddress}`);
  console.log(`Set WRAPPED_E3D_BASE_ADDRESS=${wrappedAddress} in spacepacket/.env`);

  if (existsSync(pendingTxFile)) rmSync(pendingTxFile);
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("no wrapped asset") ||
    m.includes("does not exist") ||
    m.includes("account not found") ||
    m.includes("not a wrapped asset")
  );
}

main().catch((err: unknown) => {
  console.error(`Attest failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
