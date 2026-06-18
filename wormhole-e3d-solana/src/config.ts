import "dotenv/config";

export type WormholeNetwork = "Mainnet" | "Testnet";

export interface Config {
  ethRpcUrl: string;
  solanaRpcUrl: string;
  ethPrivateKey: string;
  solanaKeypairPath: string;
  e3dTokenAddress: string;
  ethChain: string;
  solanaChain: string;
  wormholeNetwork: WormholeNetwork;
  transferAmountE3d: string;
  solanaRecipientAddress: string;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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
  solanaRpcUrl: readRequiredEnv("SOLANA_RPC_URL"),
  ethPrivateKey: readRequiredEnv("ETH_PRIVATE_KEY"),
  solanaKeypairPath: readRequiredEnv("SOLANA_PRIVATE_KEY_OR_KEYPAIR_PATH"),
  e3dTokenAddress: readRequiredEnv("E3D_TOKEN_ADDRESS"),
  ethChain: readRequiredEnv("ETH_CHAIN"),
  solanaChain: readRequiredEnv("SOLANA_CHAIN"),
  wormholeNetwork: readWormholeNetwork(),
  transferAmountE3d: readRequiredEnv("TRANSFER_AMOUNT_E3D"),
  solanaRecipientAddress: readRequiredEnv("SOLANA_RECIPIENT_ADDRESS")
};
