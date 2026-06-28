/**
 * Add initial E3D/BNB liquidity to PancakeSwap V2.
 *
 * Prerequisites:
 *   1. Run 'npm run attest' — sets WRAPPED_E3D_BSC_ADDRESS
 *   2. Run 'npm run transfer' + 'npm run redeem' — wrapped E3D in wallet
 *   3. Set WRAPPED_E3D_BSC_ADDRESS, PANCAKESWAP_BNB_AMOUNT, PANCAKESWAP_E3D_AMOUNT in .env
 *
 * Usage: npm run add-liquidity
 *
 * This creates a new E3D/WBNB pool on PancakeSwap V2 if one does not exist,
 * or adds to the existing pool. The deployer wallet receives LP tokens.
 */
import { Contract, formatUnits, JsonRpcProvider, parseEther, parseUnits, Wallet } from "ethers";
import { config } from "./config.js";

// PancakeSwap V2 on BSC mainnet
const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

const ROUTER_ABI = [
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function factory() view returns (address)",
] as const;

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
] as const;

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

async function main(): Promise<void> {
  if (!config.wrappedE3dBscAddress) {
    throw new Error("WRAPPED_E3D_BSC_ADDRESS not set — run 'npm run attest' first.");
  }

  const provider = new JsonRpcProvider(config.bscRpcUrl);
  const wallet   = new Wallet(config.bscPrivateKey, provider);
  const address  = await wallet.getAddress();

  const token  = new Contract(config.wrappedE3dBscAddress, ERC20_ABI, wallet);
  const router = new Contract(PANCAKE_ROUTER_V2, ROUTER_ABI, wallet);

  const decimals   = await (token.decimals as () => Promise<number>)();
  const symbol     = await (token.symbol  as () => Promise<string>)();
  const e3dBalance = await (token.balanceOf as (a: string) => Promise<bigint>)(address);
  const bnbBalance = await provider.getBalance(address);

  console.log(`Wallet: ${address}`);
  console.log(`${symbol} balance: ${formatUnits(e3dBalance, decimals)}`);
  console.log(`BNB balance:  ${formatUnits(bnbBalance, 18)}`);

  const e3dAmount  = parseUnits(config.pancakeswapE3dAmount, decimals);
  const bnbAmount  = parseEther(config.pancakeswapBnbAmount);

  if (e3dBalance < e3dAmount) {
    throw new Error(
      `Insufficient ${symbol}. Need ${config.pancakeswapE3dAmount}, have ${formatUnits(e3dBalance, decimals)}.`
    );
  }
  if (bnbBalance < bnbAmount) {
    throw new Error(
      `Insufficient BNB. Need ${config.pancakeswapBnbAmount}, have ${formatUnits(bnbBalance, 18)}.`
    );
  }

  // Check for existing pair
  const factoryAddress = await (router.factory as () => Promise<string>)();
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const existingPair  = await (factory.getPair as (a: string, b: string) => Promise<string>)(
    config.wrappedE3dBscAddress, WBNB
  );
  if (existingPair !== "0x0000000000000000000000000000000000000000") {
    console.log(`Existing PancakeSwap pair: ${existingPair}`);
    console.log("Adding to existing pool...");
  } else {
    console.log("No existing pair — creating new E3D/BNB pool...");
  }

  // Approve router to spend E3D
  const allowance = await (token.allowance as (o: string, s: string) => Promise<bigint>)(
    address, PANCAKE_ROUTER_V2
  );
  if (allowance < e3dAmount) {
    console.log(`Approving PancakeSwap router for ${config.pancakeswapE3dAmount} ${symbol}...`);
    const approveTx = await (token.approve as (s: string, a: bigint) => Promise<{ hash: string; wait: () => Promise<unknown> }>)(
      PANCAKE_ROUTER_V2, e3dAmount
    );
    console.log(`Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval confirmed.");
  } else {
    console.log("Router allowance sufficient, skipping approval.");
  }

  // Slippage: accept up to 5% less than desired (adjust for thin markets)
  const slippage       = 5n;
  const e3dAmountMin   = e3dAmount - (e3dAmount * slippage / 100n);
  const bnbAmountMin   = bnbAmount - (bnbAmount * slippage / 100n);
  const deadline       = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

  console.log(`Adding liquidity: ${config.pancakeswapE3dAmount} ${symbol} + ${config.pancakeswapBnbAmount} BNB`);
  console.log(`Slippage tolerance: 5%`);

  const addLiqTx = await (
    router.addLiquidityETH as (
      token: string, amountTokenDesired: bigint, amountTokenMin: bigint,
      amountETHMin: bigint, to: string, deadline: bigint,
      opts: { value: bigint }
    ) => Promise<{ hash: string; wait: () => Promise<{ logs: unknown[] }> }>
  )(
    config.wrappedE3dBscAddress,
    e3dAmount,
    e3dAmountMin,
    bnbAmountMin,
    address,
    deadline,
    { value: bnbAmount }
  );

  console.log(`Add liquidity tx: ${addLiqTx.hash}`);
  console.log("Waiting for confirmation...");
  await addLiqTx.wait();

  // Re-fetch pair address
  const pairAddress = await (factory.getPair as (a: string, b: string) => Promise<string>)(
    config.wrappedE3dBscAddress, WBNB
  );

  console.log(`\nPancakeSwap pair created/updated: ${pairAddress}`);
  console.log(`BSCScan: https://bscscan.com/address/${pairAddress}`);
  console.log(`PancakeSwap: https://pancakeswap.finance/swap?outputCurrency=${config.wrappedE3dBscAddress}`);
  console.log(`\nLP tokens sent to: ${address}`);
  console.log("Done. E3D is now tradeable on PancakeSwap.");
}

main().catch((err: unknown) => {
  console.error(`Add liquidity failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
