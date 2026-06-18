import type { Chain } from "@wormhole-foundation/sdk";
import { toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { config } from "./config.js";

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

async function main(): Promise<void> {
  const sdk = (await wormhole(config.wormholeNetwork, [evm, solana])) as WormholeSdkLike;
  const ethereum = sdk.getChain(config.ethChain);
  const solanaChain = sdk.getChain(config.solanaChain);

  if (!ethereum.chain) {
    throw new Error(`Unable to resolve Wormhole chain context for ${config.ethChain}`);
  }

  const e3dTokenId = { chain: ethereum.chain, address: toNative(ethereum.chain as Chain, config.e3dTokenAddress) };

  try {
    const wrappedAsset = await lookupWrappedAsset(solanaChain, e3dTokenId);
    const wrappedMintAddress = formatWrappedAssetAddress(wrappedAsset);

    if (!wrappedMintAddress) {
      printResult({
        wrappedMintAddress: null
      });
      return;
    }

    printResult({
      wrappedMintAddress
    });
  } catch (error) {
    if (isWrappedAssetNotFoundError(error)) {
      printResult({
        wrappedMintAddress: null
      });
      return;
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

    if (typeof tokenBridge?.getWrappedAsset === "function") {
      return tokenBridge.getWrappedAsset(sourceToken);
    }
  }

  throw new Error("Wormhole SDK does not expose a wrapped asset lookup method for Solana");
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
    message.includes("account not found") ||
    message.includes("not a wrapped asset")
  );
}

function printResult({
  wrappedMintAddress
}: {
  wrappedMintAddress: string | null;
}): void {
  const attestationNeeded = wrappedMintAddress === null;

  console.log(`Network: ${config.wormholeNetwork}`);
  console.log(`Ethereum E3D token address: ${config.e3dTokenAddress}`);

  if (wrappedMintAddress) {
    console.log(`Solana wrapped E3D mint address: ${wrappedMintAddress}`);
  } else {
    console.log("Solana wrapped E3D mint address: not found");
    console.log("Wrapped E3D mint not found on Solana. Run: npm run attest");
  }

  console.log(`Attestation needed: ${attestationNeeded ? "Yes" : "No"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Failed to check wrapped E3D on Solana: ${message}`);
  process.exitCode = 1;
});
