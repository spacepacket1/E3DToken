/**
 * Creates and initializes the E3D/WETH Uniswap v3 pool on Base (0.3% fee).
 * Run once. If the pool already exists, it will skip creation and initialize if needed.
 *
 * Usage: npm run create-pool
 */

import { JsonRpcProvider, Wallet, Contract, parseUnits } from "ethers";
import { config } from "./config.js";

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) returns (address pool)",
];

const POOL_ABI = [
  "function initialize(uint160 sqrtPriceX96) external",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

// sqrtPriceX96 = sqrt(token1/token0) * 2^96
// token ordering in Uniswap v3 is by address (lower address = token0)
function computeSqrtPriceX96(token0IsE3D: boolean, e3dPerWeth: bigint): bigint {
  // price = token1 / token0
  // if token0 = E3D: price = WETH/E3D = 1/e3dPerWeth
  // if token0 = WETH: price = E3D/WETH = e3dPerWeth
  const Q96 = 2n ** 96n;
  const PRECISION = 10n ** 18n;

  let priceNumerator: bigint;
  let priceDenominator: bigint;

  if (token0IsE3D) {
    // price = 1 / e3dPerWeth
    priceNumerator = PRECISION;
    priceDenominator = e3dPerWeth * PRECISION;
  } else {
    // price = e3dPerWeth / 1
    priceNumerator = e3dPerWeth * PRECISION;
    priceDenominator = PRECISION;
  }

  // sqrtPrice = sqrt(numerator/denominator) * Q96
  // Use integer sqrt: sqrtPriceX96 = sqrt(numerator * Q96^2 / denominator)
  const inside = (priceNumerator * Q96 * Q96) / priceDenominator;
  return bigintSqrt(inside);
}

function bigintSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

async function main() {
  const provider = new JsonRpcProvider(config.baseRpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const factory = new Contract(config.factoryAddress, FACTORY_ABI, wallet);

  console.log(`Checking for existing E3D/WETH pool (0.3% fee) on Base...`);

  let poolAddress: string = await (factory.getPool as (a: string, b: string, fee: number) => Promise<string>)(
    config.e3dAddress,
    config.wethAddress,
    config.feeTier
  );

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Pool does not exist. Creating...");
    const tx = await (factory.createPool as (a: string, b: string, fee: number) => Promise<{ wait: () => Promise<{ hash: string }> }>)(
      config.e3dAddress,
      config.wethAddress,
      config.feeTier
    );
    const receipt = await tx.wait();
    console.log(`Pool created. Tx: ${receipt.hash}`);

    poolAddress = await (factory.getPool as (a: string, b: string, fee: number) => Promise<string>)(
      config.e3dAddress,
      config.wethAddress,
      config.feeTier
    );
  } else {
    console.log(`Pool already exists: ${poolAddress}`);
  }

  // Uniswap v3 always sorts tokens by address — derive locally, no on-chain call needed
  const token0IsE3D = config.e3dAddress.toLowerCase() < config.wethAddress.toLowerCase();
  console.log(`token0: ${token0IsE3D ? "E3D" : "WETH"} (${token0IsE3D ? config.e3dAddress : config.wethAddress})`);

  // Brief pause to let the Base node index the newly deployed pool contract
  await new Promise((r) => setTimeout(r, 3000));

  const pool = new Contract(poolAddress, POOL_ABI, wallet);
  const slot0 = await (pool.slot0 as () => Promise<{ sqrtPriceX96: bigint }>)();

  if (slot0.sqrtPriceX96 === 0n) {
    console.log("Pool not yet initialized. Initializing with initial price...");
    const sqrtPriceX96 = computeSqrtPriceX96(token0IsE3D, config.initialPriceE3dPerWeth);
    console.log(`sqrtPriceX96: ${sqrtPriceX96}`);
    const initTx = await (pool.initialize as (sqrtPrice: bigint) => Promise<{ wait: () => Promise<{ hash: string }> }>)(sqrtPriceX96);
    const initReceipt = await initTx.wait();
    console.log(`Pool initialized. Tx: ${initReceipt.hash}`);
  } else {
    console.log("Pool already initialized.");
  }

  console.log(`\nPool address: ${poolAddress}`);
  console.log(`Set POOL_ADDRESS=${poolAddress} in .env`);
}

main().catch((e) => { console.error(e); process.exit(1); });
