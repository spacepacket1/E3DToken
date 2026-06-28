import "dotenv/config";

export type WormholeNetwork = "Mainnet" | "Testnet";

export interface Config {
  ethRpcUrl: string;
  bscRpcUrl: string;
  ethPrivateKey: string;
  bscPrivateKey: string;
  e3dTokenAddress: string;
  ethChain: string;
  bscChain: string;
  wormholeNetwork: WormholeNetwork;
  transferAmountE3d: string;
  bscRecipientAddress: string;
  treasuryAddress: string;
  wrappedE3dBscAddress: string;
  pancakeswapBnbAmount: string;
  pancakeswapE3dAmount: string;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readOptionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function readWormholeNetwork(): WormholeNetwork {
  const value = readRequiredEnv("WORMHOLE_NETWORK");
  if (value !== "Mainnet" && value !== "Testnet") {
    throw new Error('WORMHOLE_NETWORK must be either "Mainnet" or "Testnet"');
  }
  return value;
}

export const config: Config = {
  ethRpcUrl:            readRequiredEnv("ETH_RPC_URL"),
  bscRpcUrl:            readOptionalEnv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
  ethPrivateKey:        readRequiredEnv("ETH_PRIVATE_KEY"),
  bscPrivateKey:        readOptionalEnv("BSC_PRIVATE_KEY", readRequiredEnv("ETH_PRIVATE_KEY")),
  e3dTokenAddress:      readRequiredEnv("E3D_TOKEN_ADDRESS"),
  ethChain:             readOptionalEnv("ETH_CHAIN", "Ethereum"),
  bscChain:             readOptionalEnv("BSC_CHAIN", "Bsc"),
  wormholeNetwork:      readWormholeNetwork(),
  transferAmountE3d:    readRequiredEnv("TRANSFER_AMOUNT_E3D"),
  bscRecipientAddress:  readRequiredEnv("BSC_RECIPIENT_ADDRESS"),
  treasuryAddress:      readRequiredEnv("MAPS_TREASURY_ADDRESS"),
  wrappedE3dBscAddress: readOptionalEnv("WRAPPED_E3D_BSC_ADDRESS", ""),
  pancakeswapBnbAmount: readOptionalEnv("PANCAKESWAP_BNB_AMOUNT", "0.5"),
  pancakeswapE3dAmount: readOptionalEnv("PANCAKESWAP_E3D_AMOUNT", "50"),
};
