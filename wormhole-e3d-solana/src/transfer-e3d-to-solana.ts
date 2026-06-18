import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import solana from "@wormhole-foundation/sdk/solana";
import { PublicKey } from "@solana/web3.js";
import { Contract, formatUnits, JsonRpcProvider, parseUnits } from "ethers";
import { config } from "./config.js";
import { saveTransferRecord } from "./utils.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function deriveAta(ownerAddress: string, mintAddress: string): string {
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata.toBase58();
}

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
] as const;

type Erc20Like = {
  balanceOf: (account: string) => Promise<bigint>;
  allowance: (owner: string, spender: string) => Promise<bigint>;
  approve: (spender: string, amount: bigint) => Promise<{ hash?: string; wait: () => Promise<unknown> }>;
  decimals: () => Promise<number>;
};

async function main(): Promise<void> {
  const wh = await wormhole(config.wormholeNetwork, [evm, solana]);
  const ethChain = wh.getChain(config.ethChain as Chain);
  const solChain = wh.getChain(config.solanaChain as Chain);

  const ethProvider = new JsonRpcProvider(config.ethRpcUrl);
  const ethSigner = await getEvmSignerForKey(ethProvider, config.ethPrivateKey);
  const ethAddress = ethSigner.address();

  const tokenContract = new Contract(
    config.e3dTokenAddress,
    ERC20_ABI,
    new (await import("ethers")).Wallet(config.ethPrivateKey, ethProvider)
  ) as unknown as Erc20Like;

  // Check balance
  const decimals = await tokenContract.decimals();
  const amount = parseUnits(config.transferAmountE3d, decimals);
  const balance = await tokenContract.balanceOf(ethAddress);

  if (balance < amount) {
    throw new Error(
      `Insufficient E3D balance. Required ${config.transferAmountE3d} E3D, available ${formatUnits(balance, decimals)} E3D.`
    );
  }
  console.log(`E3D balance: ${formatUnits(balance, decimals)} E3D`);

  // Check and set allowance
  const ethTokenBridge = await ethChain.getTokenBridge();
  const bridgeAddress = (ethTokenBridge as unknown as { tokenBridgeAddress: string }).tokenBridgeAddress;
  const allowance = await tokenContract.allowance(ethAddress, bridgeAddress);

  if (allowance < amount) {
    console.log(`Approving Wormhole Token Bridge to spend ${config.transferAmountE3d} E3D...`);
    const approvalTx = await tokenContract.approve(bridgeAddress, amount);
    console.log(`Approval tx: ${approvalTx.hash}`);
    await approvalTx.wait();
    console.log("Approval confirmed.");
  } else {
    console.log("Allowance sufficient, skipping approval.");
  }

  // Build addresses — recipient must be ATA, not wallet address
  const solTokenBridge = await solChain.getTokenBridge();
  const e3dTokenId = { chain: config.ethChain as Chain, address: toNative(config.ethChain as Chain, config.e3dTokenAddress) };
  const wrappedMint = (await solTokenBridge.getWrappedAsset(e3dTokenId)).toString();
  const recipientAta = deriveAta(config.solanaRecipientAddress, wrappedMint);
  console.log(`Wrapped E3D mint: ${wrappedMint}`);
  console.log(`Recipient ATA: ${recipientAta}`);

  const e3dAddress = toNative(config.ethChain as Chain, config.e3dTokenAddress);
  const recipientAddress = toNative(config.solanaChain as Chain, recipientAta);
  const senderAddress = toNative(config.ethChain as Chain, ethAddress);

  // Submit transfer on Ethereum
  console.log(`Transferring ${config.transferAmountE3d} E3D to Solana...`);
  const transferTxs = ethTokenBridge.transfer(
    senderAddress,
    { chain: config.solanaChain as Chain, address: recipientAddress },
    e3dAddress,
    BigInt(amount)
  );
  const ethTxids = await signSendWait(ethChain, transferTxs, ethSigner);
  const ethTxHash = ethTxids[ethTxids.length - 1]?.txid ?? String(ethTxids[0]);
  console.log(`Ethereum tx hash: ${ethTxHash}`);

  // Wait for VAA (30 min timeout)
  console.log("Waiting for Wormhole guardian VAA (5-15 minutes on mainnet)...");
  const [whMessage] = await ethChain.parseTransaction(ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:Transfer", 1_800_000);

  const vaaSequence = vaa?.sequence !== undefined ? String(vaa.sequence) : undefined;
  const status = vaa ? "pending_redeem" : "pending_vaa";

  if (vaa) {
    console.log(`Wormhole VAA sequence: ${vaaSequence}`);
  } else {
    console.log("VAA not yet available — save the transfer record and redeem later.");
  }

  // Save transfer record
  const transferRecordPath = saveTransferRecord({
    sourceChain: config.ethChain,
    destinationChain: config.solanaChain,
    e3dTokenAddress: config.e3dTokenAddress,
    solanaRecipientAddress: recipientAta,
    amount: config.transferAmountE3d,
    ethTxHash,
    vaaSequence,
    status,
    timestamp: new Date().toISOString()
  });

  console.log(`Transfer record saved: ${transferRecordPath}`);
  console.log(`Run: npm run redeem -- ${transferRecordPath}`);
}

main().catch((err: unknown) => {
  console.error(`Failed to transfer E3D to Solana: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
