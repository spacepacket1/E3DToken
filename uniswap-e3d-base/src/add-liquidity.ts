/**
 * Adds liquidity to the E3D/WETH Uniswap v3 pool on Base.
 * Requires pool to already be created and initialized (npm run create-pool).
 *
 * Usage: npm run add-liquidity
 */

import { JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits, MaxUint256 } from "ethers";
import { config } from "./config.js";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function liquidity() view returns (uint128)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const POSITION_MANAGER_ABI = [
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

// Round tick down to nearest multiple of tickSpacing
function nearestUsableTick(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

async function approveIfNeeded(
  token: Contract,
  owner: string,
  spender: string,
  amount: bigint,
  symbol: string
) {
  const allowance: bigint = await (token.allowance as (o: string, s: string) => Promise<bigint>)(owner, spender);
  if (allowance < amount) {
    console.log(`Approving ${symbol} to NonfungiblePositionManager...`);
    const tx = await (token.approve as (s: string, a: bigint) => Promise<{ wait: () => Promise<{ hash: string }> }>)(spender, MaxUint256);
    await tx.wait();
    console.log(`${symbol} approved.`);
  }
}

async function main() {
  const provider = new JsonRpcProvider(config.baseRpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const walletAddress = await wallet.getAddress();

  const factory = new Contract(config.factoryAddress, FACTORY_ABI, provider);
  const poolAddress: string = await (factory.getPool as (a: string, b: string, fee: number) => Promise<string>)(
    config.e3dAddress,
    config.wethAddress,
    config.feeTier
  );

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("Pool does not exist. Run `npm run create-pool` first.");
  }

  console.log(`Pool: ${poolAddress}`);

  const pool = new Contract(poolAddress, POOL_ABI, provider);
  const token0: string = await (pool.token0 as () => Promise<string>)();
  const token0IsE3D = token0.toLowerCase() === config.e3dAddress.toLowerCase();

  const slot0 = await (pool.slot0 as () => Promise<{ sqrtPriceX96: bigint; tick: bigint }>)();
  if (slot0.sqrtPriceX96 === 0n) {
    throw new Error("Pool not initialized. Run `npm run create-pool` first.");
  }

  const currentTick = Number(slot0.tick);
  console.log(`Current tick: ${currentTick}`);

  // Snap tick range to valid boundaries
  const tickLower = nearestUsableTick(config.tickLower, config.tickSpacing);
  const tickUpper = nearestUsableTick(config.tickUpper, config.tickSpacing);

  const e3dToken = new Contract(config.e3dAddress, ERC20_ABI, wallet);
  const wethToken = new Contract(config.wethAddress, ERC20_ABI, wallet);

  const e3dDecimals: number = await (e3dToken.decimals as () => Promise<number>)();
  const wethDecimals: number = await (wethToken.decimals as () => Promise<number>)();

  const e3dAmount = parseUnits(config.e3dAmount, e3dDecimals);
  const wethAmount = parseUnits(config.wethAmount, wethDecimals);

  // token0/token1 ordering must match the pool
  const amount0Desired = token0IsE3D ? e3dAmount : wethAmount;
  const amount1Desired = token0IsE3D ? wethAmount : e3dAmount;
  const token0Addr = token0IsE3D ? config.e3dAddress : config.wethAddress;
  const token1Addr = token0IsE3D ? config.wethAddress : config.e3dAddress;

  // Print balances
  const e3dBalance: bigint = await (e3dToken.balanceOf as (a: string) => Promise<bigint>)(walletAddress);
  const wethBalance: bigint = await (wethToken.balanceOf as (a: string) => Promise<bigint>)(walletAddress);
  console.log(`E3D balance: ${formatUnits(e3dBalance, e3dDecimals)} E3D`);
  console.log(`WETH balance: ${formatUnits(wethBalance, wethDecimals)} WETH`);

  if (e3dBalance < e3dAmount) throw new Error(`Insufficient E3D balance.`);
  if (wethBalance < wethAmount) throw new Error(`Insufficient WETH balance. Wrap ETH first.`);

  // Approve both tokens
  await approveIfNeeded(e3dToken, walletAddress, config.positionManagerAddress, e3dAmount, "E3D");
  await approveIfNeeded(wethToken, walletAddress, config.positionManagerAddress, wethAmount, "WETH");

  const positionManager = new Contract(config.positionManagerAddress, POSITION_MANAGER_ABI, wallet);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

  console.log(`\nAdding liquidity: ${config.e3dAmount} E3D + ${config.wethAmount} WETH`);
  console.log(`Tick range: [${tickLower}, ${tickUpper}]`);

  const mintParams = {
    token0: token0Addr,
    token1: token1Addr,
    fee: config.feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: walletAddress,
    deadline,
  };

  const tx = await (positionManager.mint as (p: typeof mintParams) => Promise<{ wait: () => Promise<{ hash: string }> }>)(mintParams);
  const receipt = await tx.wait();

  console.log(`\nLiquidity added. Tx: ${receipt.hash}`);
  console.log(`Check your position at https://app.uniswap.org/pools`);
}

main().catch((e) => { console.error(e); process.exit(1); });
