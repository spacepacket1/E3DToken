import "dotenv/config";

export type WormholeNetwork = "Mainnet" | "Testnet";

export interface Config {
  ethRpcUrl: string;
  baseRpcUrl: string;
  ethPrivateKey: string;
  basePrivateKey: string;
  e3dTokenAddress: string;
  ethChain: string;
  baseChain: string;
  wormholeNetwork: WormholeNetwork;
  transferAmountE3d: string;
  baseRecipientAddress: string;
  treasuryAddress: string;
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
  ethRpcUrl: readRequiredEnv("ETH_RPC_URL"),
  baseRpcUrl: readRequiredEnv("BASE_RPC_URL"),
  ethPrivateKey: readRequiredEnv("ETH_PRIVATE_KEY"),
  // BASE_PRIVATE_KEY defaults to ETH_PRIVATE_KEY if using same wallet on both chains
  basePrivateKey: readOptionalEnv("BASE_PRIVATE_KEY", readRequiredEnv("ETH_PRIVATE_KEY")),
  e3dTokenAddress: readRequiredEnv("E3D_TOKEN_ADDRESS"),
  ethChain: readOptionalEnv("ETH_CHAIN", "Ethereum"),
  baseChain: readOptionalEnv("BASE_CHAIN", "Base"),
  wormholeNetwork: readWormholeNetwork(),
  transferAmountE3d: readRequiredEnv("TRANSFER_AMOUNT_E3D"),
  baseRecipientAddress: readRequiredEnv("BASE_RECIPIENT_ADDRESS"),
  treasuryAddress: readRequiredEnv("MAPS_TREASURY_ADDRESS"),
};
