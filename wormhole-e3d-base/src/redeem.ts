/**
 * Redeem a Wormhole transfer VAA on Base to mint wrapped E3D.
 *
 * Usage: npm run redeem -- transfers/transfer-<timestamp>-eth-to-base.json
 *
 * The transfer record is written by 'npm run transfer'. Pass the path as the
 * first CLI argument, or set TRANSFER_RECORD_PATH in env.
 */
import { readFileSync } from "node:fs";
import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, wormhole, deserialize } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";

interface TransferRecord {
  sourceChain: string;
  destinationChain: string;
  e3dTokenAddress: string;
  baseRecipientAddress: string;
  amount: string;
  ethTxHash: string;
  vaaSequence?: string;
  status: string;
  timestamp: string;
}

async function main(): Promise<void> {
  const recordPath = process.argv[2] || process.env["TRANSFER_RECORD_PATH"];
  if (!recordPath) {
    throw new Error("Usage: npm run redeem -- <path-to-transfer-record.json>");
  }

  const record: TransferRecord = JSON.parse(readFileSync(recordPath, "utf8"));
  console.log(`Redeeming transfer: ${record.amount} E3D → Base`);
  console.log(`Ethereum lock tx: ${record.ethTxHash}`);

  const wh = await wormhole(config.wormholeNetwork, [evm]);
  const ethChain = wh.getChain(config.ethChain as Chain);
  const baseChain = wh.getChain(config.baseChain as Chain);

  const baseProvider = new JsonRpcProvider(config.baseRpcUrl);
  const baseSigner = await getEvmSignerForKey(baseProvider, config.basePrivateKey);

  // Retrieve the VAA using the Ethereum lock tx
  console.log("Fetching Wormhole VAA...");
  const [whMessage] = await ethChain.parseTransaction(record.ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:Transfer", 1_800_000);
  if (!vaa) throw new Error("VAA not yet available — try again in a few minutes");

  console.log(`VAA sequence: ${vaa.sequence}`);

  // Redeem on Base
  const baseTokenBridge = await baseChain.getTokenBridge();

  // Check if already redeemed
  const isCompleted = await baseTokenBridge.isTransferCompleted(vaa);
  if (isCompleted) {
    console.log("Transfer already redeemed on Base. Nothing to do.");
    return;
  }

  console.log("Submitting redemption on Base...");
  const redeemTxs = baseTokenBridge.redeem(
    baseSigner.address() as unknown as Parameters<typeof baseTokenBridge.redeem>[0],
    vaa
  );
  const baseTxids = await signSendWait(baseChain, redeemTxs, baseSigner);
  const baseTxHash = baseTxids[baseTxids.length - 1]?.txid ?? String(baseTxids[0]);

  console.log(`Base redemption tx: ${baseTxHash}`);
  console.log(`Wrapped E3D minted to ${record.baseRecipientAddress} on Base.`);
  console.log(`Run 'npm run check' to verify the wrapped E3D balance.`);
}

main().catch((err: unknown) => {
  console.error(`Redeem failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
