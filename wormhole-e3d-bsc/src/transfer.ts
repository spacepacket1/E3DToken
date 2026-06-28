import type { Chain } from "@wormhole-foundation/sdk";
import { signSendWait, toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { Contract, formatUnits, JsonRpcProvider, parseUnits } from "ethers";
import { config } from "./config.js";
import { saveTransferRecord } from "./utils.js";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;

type Erc20Like = {
  balanceOf: (account: string) => Promise<bigint>;
  allowance: (owner: string, spender: string) => Promise<bigint>;
  approve: (spender: string, amount: bigint) => Promise<{ hash?: string; wait: () => Promise<unknown> }>;
  decimals: () => Promise<number>;
};

async function main(): Promise<void> {
  const wh = await wormhole(config.wormholeNetwork, [evm]);
  const ethChain = wh.getChain(config.ethChain as Chain);

  const ethProvider = new JsonRpcProvider(config.ethRpcUrl);
  const ethWallet = new (await import("ethers")).Wallet(config.ethPrivateKey, ethProvider);
  const ethSigner = await getEvmSignerForKey(ethProvider, config.ethPrivateKey);
  const ethAddress = ethSigner.address();

  const tokenContract = new Contract(config.e3dTokenAddress, ERC20_ABI, ethWallet) as unknown as Erc20Like;

  const decimals = await tokenContract.decimals();
  const amount = parseUnits(config.transferAmountE3d, decimals);
  const balance = await tokenContract.balanceOf(ethAddress);

  if (balance < amount) {
    throw new Error(
      `Insufficient E3D balance. Need ${config.transferAmountE3d} E3D, have ${formatUnits(balance, decimals)} E3D.`
    );
  }
  console.log(`E3D balance: ${formatUnits(balance, decimals)} E3D`);

  // Approve the Ethereum Token Bridge if needed
  const ethTokenBridge = await ethChain.getTokenBridge();
  const bridgeAddress = (ethTokenBridge as unknown as { tokenBridgeAddress: string }).tokenBridgeAddress;
  const allowance = await tokenContract.allowance(ethAddress, bridgeAddress);

  if (allowance < amount) {
    console.log(`Approving Wormhole Token Bridge for ${config.transferAmountE3d} E3D...`);
    const approveTx = await tokenContract.approve(bridgeAddress, amount);
    console.log(`Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval confirmed.");
  } else {
    console.log("Allowance sufficient, skipping approval.");
  }

  // Transfer — recipient on BSC is a plain EVM address
  const e3dAddress = toNative(config.ethChain as Chain, config.e3dTokenAddress);
  const senderAddress = toNative(config.ethChain as Chain, ethAddress);
  const recipientAddress = toNative(config.bscChain as Chain, config.bscRecipientAddress);

  console.log(`Transferring ${config.transferAmountE3d} E3D to BSC address ${config.bscRecipientAddress}...`);
  const transferTxs = ethTokenBridge.transfer(
    senderAddress,
    { chain: config.bscChain as Chain, address: recipientAddress },
    e3dAddress,
    BigInt(amount)
  );
  const ethTxids = await signSendWait(ethChain, transferTxs, ethSigner);
  const ethTxHash = ethTxids[ethTxids.length - 1]?.txid ?? String(ethTxids[0]);
  console.log(`Ethereum lock tx: ${ethTxHash}`);

  // Wait for VAA
  console.log("Waiting for Wormhole guardian VAA (5–15 minutes on mainnet)...");
  const [whMessage] = await ethChain.parseTransaction(ethTxHash);
  const vaa = await wh.getVaa(whMessage, "TokenBridge:Transfer", 1_800_000);

  const vaaSequence = vaa?.sequence !== undefined ? String(vaa.sequence) : undefined;
  const status = vaa ? "pending_redeem" : "pending_vaa";

  if (vaa) {
    console.log(`VAA sequence: ${vaaSequence}`);
    console.log(`Run 'npm run redeem' to mint wrapped E3D on BSC.`);
  } else {
    console.log("VAA not yet available. Run 'npm run redeem' after the VAA appears.");
  }

  const recordPath = saveTransferRecord({
    sourceChain: config.ethChain,
    destinationChain: config.bscChain,
    e3dTokenAddress: config.e3dTokenAddress,
    bscRecipientAddress: config.bscRecipientAddress,
    amount: config.transferAmountE3d,
    ethTxHash,
    vaaSequence,
    status,
    timestamp: new Date().toISOString(),
  });

  console.log(`Transfer record: ${recordPath}`);
}

main().catch((err: unknown) => {
  console.error(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
