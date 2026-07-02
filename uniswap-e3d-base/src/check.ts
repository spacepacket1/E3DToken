/**
 * Check E3D/WETH Uniswap v3 pool state on Base.
 * Usage: npm run check
 */

import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { config } from "./config.js";

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const provider = new JsonRpcProvider(config.baseRpcUrl);
  const factory = new Contract(config.factoryAddress, FACTORY_ABI, provider);

  const poolAddress: string = await (factory.getPool as (a: string, b: string, fee: number) => Promise<string>)(
    config.e3dAddress,
    config.wethAddress,
    config.feeTier
  );

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Pool does not exist yet. Run `npm run create-pool`.");
    return;
  }

  console.log(`Pool address: ${poolAddress}`);

  const pool = new Contract(poolAddress, POOL_ABI, provider);
  const token0: string = await (pool.token0 as () => Promise<string>)();
  const token1: string = await (pool.token1 as () => Promise<string>)();
  const slot0 = await (pool.slot0 as () => Promise<{ sqrtPriceX96: bigint; tick: bigint }>)();
  const liquidity: bigint = await (pool.liquidity as () => Promise<bigint>)();

  const token0IsE3D = token0.toLowerCase() === config.e3dAddress.toLowerCase();

  const e3dToken = new Contract(config.e3dAddress, ERC20_ABI, provider);
  const wethToken = new Contract(config.wethAddress, ERC20_ABI, provider);
  const e3dDecimals: number = await (e3dToken.decimals as () => Promise<number>)();
  const wethDecimals: number = await (wethToken.decimals as () => Promise<number>)();

  // Pool token balances (total reserves)
  const e3dReserve: bigint = await (e3dToken.balanceOf as (a: string) => Promise<bigint>)(poolAddress);
  const wethReserve: bigint = await (wethToken.balanceOf as (a: string) => Promise<bigint>)(poolAddress);

  console.log(`token0: ${token0} (${token0IsE3D ? "E3D" : "WETH"})`);
  console.log(`token1: ${token1} (${token0IsE3D ? "WETH" : "E3D"})`);
  console.log(`Fee: 0.3%`);
  console.log(`Initialized: ${slot0.sqrtPriceX96 !== 0n}`);

  if (slot0.sqrtPriceX96 !== 0n) {
    const Q96 = 2n ** 96n;
    const sqrtPrice = slot0.sqrtPriceX96;
    // price = (sqrtPriceX96 / 2^96)^2 adjusted for decimals
    const priceRaw = (sqrtPrice * sqrtPrice * 10n ** BigInt(e3dDecimals)) / (Q96 * Q96 * 10n ** BigInt(wethDecimals));
    const e3dPerWeth = token0IsE3D
      ? (10n ** 36n) / (sqrtPrice * sqrtPrice / (Q96 * Q96 / 10n ** 18n))
      : priceRaw;

    console.log(`Current tick: ${slot0.tick}`);
    console.log(`Active liquidity: ${liquidity}`);
    console.log(`E3D reserves: ${formatUnits(e3dReserve, e3dDecimals)} E3D`);
    console.log(`WETH reserves: ${formatUnits(wethReserve, wethDecimals)} WETH`);
  } else {
    console.log("Pool not yet initialized. Run `npm run create-pool`.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
