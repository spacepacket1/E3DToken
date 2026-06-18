import { Connection, PublicKey } from "@solana/web3.js";
import type { Chain } from "@wormhole-foundation/sdk";
import { toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { Contract, formatUnits } from "ethers";
import { config } from "./config.js";
import { getSigner } from "./utils.js";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
] as const;

type ChainContextLike = {
  chain?: string;
  getWrappedAsset?: (token: unknown) => Promise<unknown> | unknown;
  getTokenBridge?: () => Promise<unknown> | unknown;
};

type WormholeSdkLike = {
  getChain: (chain: string) => ChainContextLike;
};

type TokenBridgeLike = {
  getWrappedAsset?: (token: unknown) => Promise<unknown> | unknown;
};

type Erc20Like = {
  balanceOf: (account: string) => Promise<bigint>;
  decimals: () => Promise<number>;
};

async function main(): Promise<void> {
  const sdk = (await wormhole(config.wormholeNetwork, [evm, solana])) as WormholeSdkLike;
  const ethereum = sdk.getChain(config.ethChain);
  const solanaChain = sdk.getChain(config.solanaChain);
  const ethSigner = getSigner(config);
  const tokenContract = new Contract(config.e3dTokenAddress, ERC20_ABI, ethSigner) as unknown as Erc20Like;

  if (!ethereum.chain) {
    throw new Error(`Unable to resolve Wormhole chain context for ${config.ethChain}`);
  }

  const ethDecimals = await tokenContract.decimals();
  const ethBalance = await tokenContract.balanceOf(ethSigner.address);
  const wrappedMintAddress = await findWrappedMintAddress(
    solanaChain,
    { chain: ethereum.chain, address: toNative(ethereum.chain as Chain, config.e3dTokenAddress) }
  );
  const solanaConnection = new Connection(config.solanaRpcUrl, "confirmed");
  const solanaRecipient = new PublicKey(config.solanaRecipientAddress);
  const solBalanceLamports = await solanaConnection.getBalance(solanaRecipient);

  let wrappedDecimals = ethDecimals;
  let wrappedBalance = 0n;

  if (wrappedMintAddress) {
    const mintPublicKey = new PublicKey(wrappedMintAddress);
    wrappedDecimals = await getMintDecimals(solanaConnection, mintPublicKey, ethDecimals);
    wrappedBalance = await getSplTokenBalance(solanaConnection, solanaRecipient, mintPublicKey);
  }

  console.log(`Ethereum wallet address: ${ethSigner.address}`);
  console.log(`Ethereum E3D balance: ${formatUnits(ethBalance, ethDecimals)} E3D`);
  console.log(`Solana recipient address: ${config.solanaRecipientAddress}`);
  console.log(`Solana wrapped E3D balance: ${formatUnits(wrappedBalance, wrappedDecimals)} E3D`);
  console.log(`Wrapped E3D mint address: ${wrappedMintAddress ?? "not found"}`);
  console.log(`SOL balance: ${formatUnits(solBalanceLamports, 9)} SOL`);
}

async function findWrappedMintAddress(
  solanaChain: ChainContextLike,
  sourceToken: unknown
): Promise<string | null> {
  try {
    const wrappedAsset = await lookupWrappedAsset(solanaChain, sourceToken);
    return formatWrappedAssetAddress(wrappedAsset);
  } catch (error) {
    if (isWrappedAssetNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function lookupWrappedAsset(
  solanaChain: ChainContextLike,
  sourceToken: unknown
): Promise<unknown> {
  if (typeof solanaChain.getWrappedAsset === "function") {
    return solanaChain.getWrappedAsset(sourceToken);
  }

  if (typeof solanaChain.getTokenBridge === "function") {
    const tokenBridge = (await solanaChain.getTokenBridge()) as TokenBridgeLike;

    if (typeof tokenBridge.getWrappedAsset === "function") {
      return tokenBridge.getWrappedAsset(sourceToken);
    }
  }

  throw new Error("Wormhole SDK does not expose a wrapped asset lookup method for Solana");
}

async function getMintDecimals(
  connection: Connection,
  mintAddress: PublicKey,
  fallbackDecimals: number
): Promise<number> {
  const accountInfo = await connection.getParsedAccountInfo(mintAddress);
  const parsedValue = accountInfo.value?.data;

  if (!parsedValue || typeof parsedValue !== "object" || !("parsed" in parsedValue)) {
    return fallbackDecimals;
  }

  const parsed = parsedValue.parsed;

  if (!parsed || typeof parsed !== "object" || !("info" in parsed)) {
    return fallbackDecimals;
  }

  const info = parsed.info;

  if (!info || typeof info !== "object" || !("decimals" in info)) {
    return fallbackDecimals;
  }

  const decimals = info.decimals;

  return typeof decimals === "number" ? decimals : fallbackDecimals;
}

async function getSplTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mintAddress: PublicKey
): Promise<bigint> {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    mint: mintAddress
  });

  let totalBalance = 0n;

  for (const tokenAccount of tokenAccounts.value) {
    const parsed = tokenAccount.account.data.parsed;

    if (!parsed || typeof parsed !== "object" || !("info" in parsed)) {
      continue;
    }

    const info = parsed.info;

    if (!info || typeof info !== "object" || !("tokenAmount" in info)) {
      continue;
    }

    const tokenAmount = info.tokenAmount;

    if (!tokenAmount || typeof tokenAmount !== "object" || !("amount" in tokenAmount)) {
      continue;
    }

    const rawAmount = tokenAmount.amount;

    if (typeof rawAmount === "string") {
      totalBalance += BigInt(rawAmount);
    }
  }

  return totalBalance;
}

function formatWrappedAssetAddress(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("address" in value && typeof value.address === "string") {
      return value.address;
    }

    if ("mint" in value && typeof value.mint === "string") {
      return value.mint;
    }

    if ("toString" in value && typeof value.toString === "function") {
      const stringValue = value.toString();
      return stringValue === "[object Object]" ? null : stringValue;
    }
  }

  return null;
}

function isWrappedAssetNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("not found") ||
    message.includes("no wrapped asset") ||
    message.includes("does not exist") ||
    message.includes("account not found")
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Failed to check balances: ${message}`);
  process.exitCode = 1;
});
