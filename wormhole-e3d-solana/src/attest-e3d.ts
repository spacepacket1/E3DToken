import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import solana from "@wormhole-foundation/sdk/solana";
import { getSolanaSignAndSendSigner } from "@wormhole-foundation/sdk-solana";
import { Connection, Keypair } from "@solana/web3.js";
import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";

async function main(): Promise<void> {
  const wh = await wormhole(config.wormholeNetwork, [evm, solana]);
  const ethChain = wh.getChain(config.ethChain as Chain);
  const solChain = wh.getChain(config.solanaChain as Chain);

  // Check if already attested
  const ethTokenBridge = await ethChain.getTokenBridge();
  const solTokenBridge = await solChain.getTokenBridge();
  const e3dTokenId = { chain: config.ethChain as Chain, address: toNative(config.ethChain as Chain, config.e3dTokenAddress) };

  try {
    const existing = await solTokenBridge.getWrappedAsset(e3dTokenId);
    console.log(`Wrapped E3D SPL mint already exists on Solana: ${existing}`);
    console.log("Attestation already completed. No duplicate attestation submitted.");
    return;
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  // Build signers
  const ethProvider = new JsonRpcProvider(config.ethRpcUrl);
  const ethSigner = await getEvmSignerForKey(ethProvider, config.ethPrivateKey);

  const solConnection = new Connection(config.solanaRpcUrl, "confirmed");
  const solKeypair = loadSolanaKeypair(config.solanaKeypairPath);
  const solSigner = await getSolanaSignAndSendSigner(solConnection, solKeypair);

  // Step 1: attest on Ethereum (skip if we already have a saved tx hash)
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

  // Step 2: wait for VAA (up to 30 minutes)
  console.log("Waiting for Wormhole guardian VAA (this may take 5-15 minutes on mainnet)...");
  const [whMessage] = await ethChain.parseTransaction(ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:AttestMeta", 1_800_000);
  if (!vaa) throw new Error("Timed out waiting for Wormhole VAA");
  console.log(`Wormhole VAA sequence: ${vaa.sequence}`);

  // Step 3: create wrapped asset on Solana
  console.log("Creating wrapped E3D SPL mint on Solana...");
  const createWrappedTxs = solTokenBridge.submitAttestation(
    vaa,
    solSigner.address() as unknown as Parameters<typeof solTokenBridge.submitAttestation>[1]
  );
  const solTxids = await signSendWait(solChain, createWrappedTxs, solSigner);
  const solTxSig = solTxids[solTxids.length - 1]?.txid ?? String(solTxids[0]);
  console.log(`Solana tx signature: ${solTxSig}`);

  // Step 4: confirm and clean up
  const wrappedAsset = await solTokenBridge.getWrappedAsset(e3dTokenId);
  console.log(`Wrapped E3D SPL mint address: ${wrappedAsset}`);
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

function loadSolanaKeypair(pathOrKey: string): Keypair {
  if (existsSync(pathOrKey)) {
    const parsed = JSON.parse(readFileSync(pathOrKey, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  return Keypair.fromSecretKey(decodeBase58(pathOrKey));
}

function decodeBase58(value: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];
  for (const ch of value) {
    const cv = ALPHABET.indexOf(ch);
    if (cv < 0) throw new Error("Invalid base58 character");
    for (let i = 0; i < bytes.length; i++) bytes[i] *= 58;
    bytes[0] += cv;
    for (let i = 0; i < bytes.length; i++) {
      const carry = bytes[i] >> 8;
      bytes[i] &= 0xff;
      if (carry > 0) bytes[i + 1] = (bytes[i + 1] ?? 0) + carry;
    }
  }
  for (const ch of value) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

main().catch((err: unknown) => {
  console.error(`Failed to attest E3D through Wormhole: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
