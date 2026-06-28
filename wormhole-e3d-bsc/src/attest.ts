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
  const bscChain = wh.getChain(config.bscChain as Chain);

  const ethProvider = new JsonRpcProvider(config.ethRpcUrl);
  const bscProvider = new JsonRpcProvider(config.bscRpcUrl);
  const ethSigner = await getEvmSignerForKey(ethProvider, config.ethPrivateKey);
  const bscSigner = await getEvmSignerForKey(bscProvider, config.bscPrivateKey);

  const ethTokenBridge = await ethChain.getTokenBridge();
  const bscTokenBridge = await bscChain.getTokenBridge();
  const e3dTokenId = {
    chain: config.ethChain as Chain,
    address: toNative(config.ethChain as Chain, config.e3dTokenAddress),
  };

  // Check if wrapped E3D already exists on BSC
  try {
    const existing = await bscTokenBridge.getWrappedAsset(e3dTokenId);
    console.log(`Wrapped E3D already exists on BSC: ${existing}`);
    console.log("Attestation already completed — run 'npm run check' to confirm.");
    console.log(`Set WRAPPED_E3D_BSC_ADDRESS=${existing} in .env`);
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

  // Step 3: create wrapped E3D on BSC
  console.log("Creating wrapped E3D on BSC...");
  const createWrappedTxs = bscTokenBridge.submitAttestation(
    vaa,
    bscSigner.address() as unknown as Parameters<typeof bscTokenBridge.submitAttestation>[1]
  );
  const bscTxids = await signSendWait(bscChain, createWrappedTxs, bscSigner);
  const bscTxHash = bscTxids[bscTxids.length - 1]?.txid ?? String(bscTxids[0]);
  console.log(`BSC tx hash: ${bscTxHash}`);

  // Step 4: confirm and print the wrapped token address
  const wrappedAddress = await bscTokenBridge.getWrappedAsset(e3dTokenId);
  console.log(`\nWrapped E3D address on BSC: ${wrappedAddress}`);
  console.log(`Set WRAPPED_E3D_BSC_ADDRESS=${wrappedAddress} in .env`);

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
