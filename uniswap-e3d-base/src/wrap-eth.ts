/**
 * Wraps ETH into WETH on Base (needed before adding liquidity).
 * Usage: WRAP_ETH_AMOUNT=0.01 tsx src/wrap-eth.ts
 */

import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther } from "ethers";
import { config } from "./config.js";

const WETH_ABI = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const amount = process.env.WRAP_ETH_AMOUNT;
  if (!amount) throw new Error("Set WRAP_ETH_AMOUNT env var (e.g. WRAP_ETH_AMOUNT=0.01)");

  const provider = new JsonRpcProvider(config.baseRpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const weth = new Contract(config.wethAddress, WETH_ABI, wallet);

  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`ETH balance: ${formatEther(ethBalance)}`);

  const wethBefore: bigint = await (weth.balanceOf as (a: string) => Promise<bigint>)(wallet.address);
  console.log(`WETH balance before: ${formatEther(wethBefore)}`);

  console.log(`Wrapping ${amount} ETH → WETH...`);
  const tx = await (weth.deposit as () => Promise<{ wait: () => Promise<{ hash: string }> }>)({ value: parseEther(amount) } as unknown as never);
  const receipt = await tx.wait();
  console.log(`Wrapped. Tx: ${receipt.hash}`);

  const wethAfter: bigint = await (weth.balanceOf as (a: string) => Promise<bigint>)(wallet.address);
  console.log(`WETH balance after: ${formatEther(wethAfter)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
