/**
 * Redeem a Wormhole transfer VAA on BSC to mint wrapped E3D.
 *
 * Usage: npm run redeem -- transfers/transfer-<timestamp>-eth-to-bsc.json
 *
 * The transfer record is written by 'npm run transfer'. Pass the path as the
 * first CLI argument, or set TRANSFER_RECORD_PATH in env.
 */
import { readFileSync } from "node:fs";
import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";

interface TransferRecord {
  sourceChain: string;
  destinationChain: string;
  e3dTokenAddress: string;
  bscRecipientAddress: string;
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
  console.log(`Redeeming transfer: ${record.amount} E3D → BSC`);
  console.log(`Ethereum lock tx: ${record.ethTxHash}`);

  const wh = await wormhole(config.wormholeNetwork, [evm]);
  const ethChain = wh.getChain(config.ethChain as Chain);
  const bscChain = wh.getChain(config.bscChain as Chain);

  const bscProvider = new JsonRpcProvider(config.bscRpcUrl);
  const bscSigner = await getEvmSignerForKey(bscProvider, config.bscPrivateKey);

  // Retrieve the VAA using the Ethereum lock tx
  console.log("Fetching Wormhole VAA...");
  const [whMessage] = await ethChain.parseTransaction(record.ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:Transfer", 1_800_000);
  if (!vaa) throw new Error("VAA not yet available — try again in a few minutes");

  console.log(`VAA sequence: ${vaa.sequence}`);

  const bscTokenBridge = await bscChain.getTokenBridge();

  // Check if already redeemed
  const isCompleted = await bscTokenBridge.isTransferCompleted(vaa);
  if (isCompleted) {
    console.log("Transfer already redeemed on BSC. Nothing to do.");
    return;
  }

  console.log("Submitting redemption on BSC...");
  const redeemTxs = bscTokenBridge.redeem(
    bscSigner.address() as unknown as Parameters<typeof bscTokenBridge.redeem>[0],
    vaa
  );
  const bscTxids = await signSendWait(bscChain, redeemTxs, bscSigner);
  const bscTxHash = bscTxids[bscTxids.length - 1]?.txid ?? String(bscTxids[0]);

  console.log(`BSC redemption tx: ${bscTxHash}`);
  console.log(`Wrapped E3D minted to ${config.bscRecipientAddress} on BSC.`);
  console.log(`Run 'npm run check' to verify balance, then 'npm run add-liquidity' for PancakeSwap.`);
}

main().catch((err: unknown) => {
  console.error(`Redeem failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
