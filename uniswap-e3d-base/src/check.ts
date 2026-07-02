/**
 * Check E3D/WETH Uniswap v3 pool state on Base.
 * Usage: npm run check
 */

import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { config } from "./config.js";

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

async function main() {
  const provider = new JsonRpcProvider(config.baseRpcUrl);

  // Derive pool address — skip factory call if POOL_ADDRESS is set
  const poolAddress = process.env.POOL_ADDRESS ?? await (
    new Contract(config.factoryAddress, FACTORY_ABI, provider)
      .getPool as (a: string, b: string, fee: number) => Promise<string>
  )(config.e3dAddress, config.wethAddress, config.feeTier);

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Pool does not exist yet. Run `npm run create-pool`.");
    return;
  }

  console.log(`Pool:  ${poolAddress}`);

  // Batch all reads in one round-trip
  const pool = new Contract(poolAddress, POOL_ABI, provider);
  const e3dToken = new Contract(config.e3dAddress, ERC20_ABI, provider);
  const wethToken = new Contract(config.wethAddress, ERC20_ABI, provider);

  const [slot0, liquidity, e3dReserve, wethReserve] = await Promise.all([
    (pool.slot0 as () => Promise<{ sqrtPriceX96: bigint; tick: bigint }>)(),
    (pool.liquidity as () => Promise<bigint>)(),
    (e3dToken.balanceOf as (a: string) => Promise<bigint>)(poolAddress),
    (wethToken.balanceOf as (a: string) => Promise<bigint>)(poolAddress),
  ]);

  // token0 = WETH (lower address), token1 = E3D
  const token0IsE3D = config.e3dAddress.toLowerCase() < config.wethAddress.toLowerCase();
  const DECIMALS = 18;
  const Q96 = 2n ** 96n;

  // price of token1/token0 = (sqrtPriceX96/2^96)^2
  // token0=WETH, token1=E3D → price = E3D per WETH
  const sqrtP = slot0.sqrtPriceX96;
  const e3dPerWeth = token0IsE3D
    ? Number(sqrtP * sqrtP) / Number(Q96 * Q96)
    : Number(Q96 * Q96) / Number(sqrtP * sqrtP);

  console.log(`Fee:   0.3%`);
  console.log(`Tick:  ${slot0.tick}`);
  console.log(`Price: ${e3dPerWeth.toFixed(0)} E3D / WETH`);
  console.log(`Active liquidity: ${liquidity}`);
  console.log(`E3D reserves:  ${formatUnits(e3dReserve, DECIMALS)} E3D`);
  console.log(`WETH reserves: ${formatUnits(wethReserve, DECIMALS)} WETH`);
}

main().catch((e) => { console.error(e); process.exit(1); });
