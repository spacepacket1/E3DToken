import "dotenv/config";

function readRequired(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function readOptional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  baseRpcUrl: readRequired("BASE_RPC_URL"),
  privateKey: readRequired("BASE_PRIVATE_KEY"),

  // Tokens
  e3dAddress: readOptional("WRAPPED_E3D_BASE_ADDRESS", "0xDFC9E32Dd0542D12c08ED15FEfadBAe8071B48A5"),
  wethAddress: readOptional("WETH_BASE_ADDRESS", "0x4200000000000000000000000000000000000006"),

  // Uniswap v3 on Base (mainnet)
  factoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  positionManagerAddress: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",

  feeTier: 3000, // 0.3%
  tickSpacing: 60,

  // Initial price: E3D per WETH (how many E3D = 1 WETH)
  // e.g. 10000 means 1 WETH = 10,000 E3D
  initialPriceE3dPerWeth: BigInt(readOptional("INITIAL_PRICE_E3D_PER_WETH", "16812")),

  // Liquidity amounts for add-liquidity
  e3dAmount: readOptional("E3D_LIQUIDITY_AMOUNT", "50"),   // E3D to deposit
  wethAmount: readOptional("WETH_LIQUIDITY_AMOUNT", "0.005"), // WETH to deposit

  // Tick range (wide by default: roughly ±10x from current price)
  tickLower: -138160, // ~0.1x price
  tickUpper: 138160,  // ~10x price
};
