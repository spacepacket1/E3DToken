import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { getSolanaSignAndSendSigner } from "@wormhole-foundation/sdk-solana";
import { config } from "./config.js";

interface TransferRecord {
  sourceChain?: string;
  destinationChain?: string;
  e3dTokenAddress?: string;
  solanaRecipientAddress?: string;
  amount?: string;
  ethTxHash?: string;
  vaaSequence?: string | number;
  status?: string;
  timestamp?: string;
}

async function main(): Promise<void> {
  const recordPathArg = process.argv[2];
  if (!recordPathArg) throw new Error("Usage: npm run redeem -- <path-to-transfer-json>");

  const recordPath = resolve(recordPathArg);
  if (!existsSync(recordPath)) throw new Error(`File not found: ${recordPath}`);

  const record = JSON.parse(readFileSync(recordPath, "utf8")) as TransferRecord;

  if (record.status === "redeemed") throw new Error("Transfer already redeemed.");
  if (!record.solanaRecipientAddress) throw new Error("Missing solanaRecipientAddress in transfer JSON.");
  if (!record.ethTxHash) throw new Error("Missing ethTxHash in transfer JSON.");

  const sourceChain = (record.sourceChain ?? config.ethChain) as Chain;
  const destChain = (record.destinationChain ?? config.solanaChain) as Chain;

  const wh = await wormhole(config.wormholeNetwork, [evm, solana]);
  const ethChain = wh.getChain(sourceChain);
  const solChain = wh.getChain(destChain);

  // Fetch VAA
  console.log("Fetching Wormhole VAA...");
  const [whMessage] = await ethChain.parseTransaction(record.ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:Transfer", 60_000);
  if (!vaa) throw new Error("VAA not found. The transfer may still be pending guardian signatures.");
  console.log(`VAA sequence: ${vaa.sequence}`);

  // Build Solana signer
  const solConnection = new Connection(config.solanaRpcUrl, "confirmed");
  const solKeypair = loadSolanaKeypair(config.solanaKeypairPath);
  const solSigner = await getSolanaSignAndSendSigner(solConnection, solKeypair);

  // redeem() internally creates the ATA if needed, posts the VAA, then completes the transfer
  console.log("Redeeming transfer on Solana (creates ATA, posts VAA, completes transfer)...");
  const solTokenBridge = await solChain.getTokenBridge();
  const redeemTxs = solTokenBridge.redeem(
    toNative(destChain, solSigner.address()),
    vaa
  );
  const solTxids = await signSendWait(solChain, redeemTxs, solSigner);
  const solTxSig = solTxids[solTxids.length - 1]?.txid ?? String(solTxids[0]);
  console.log(`Solana tx signature: ${solTxSig}`);
  console.log(`Recipient token account: ${record.solanaRecipientAddress}`);
  console.log(`Amount received: ${record.amount ?? "unknown"} E3D`);

  // Update record
  writeFileSync(recordPath, JSON.stringify({ ...record, status: "redeemed" }, null, 2) + "\n", "utf8");
}

function loadSolanaKeypair(pathOrKey: string): Keypair {
  if (existsSync(pathOrKey)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(pathOrKey, "utf8")) as number[]));
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
  console.error(`Failed to redeem transfer on Solana: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
