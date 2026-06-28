/**
 * Check the wrapped E3D token address and balances on BSC.
 */
import type { Chain } from "@wormhole-foundation/sdk";
import { toNative, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { Contract, formatUnits, JsonRpcProvider } from "ethers";
import { config } from "./config.js";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
] as const;

async function main(): Promise<void> {
  const wh = await wormhole(config.wormholeNetwork, [evm]);
  const bscChain = wh.getChain(config.bscChain as Chain);
  const bscTokenBridge = await bscChain.getTokenBridge();

  const e3dTokenId = {
    chain: config.ethChain as Chain,
    address: toNative(config.ethChain as Chain, config.e3dTokenAddress),
  };

  let wrappedAddress: string;
  try {
    const wrapped = await bscTokenBridge.getWrappedAsset(e3dTokenId);
    wrappedAddress = wrapped.toString();
  } catch {
    console.log("Wrapped E3D not yet attested on BSC. Run 'npm run attest' first.");
    return;
  }

  console.log(`Wrapped E3D address on BSC: ${wrappedAddress}`);
  console.log(`Set WRAPPED_E3D_BSC_ADDRESS=${wrappedAddress} in .env`);

  const bscProvider = new JsonRpcProvider(config.bscRpcUrl);
  const token = new Contract(wrappedAddress, ERC20_ABI, bscProvider);

  const [name, symbol, decimals] = await Promise.all([
    (token.name as () => Promise<string>)(),
    (token.symbol as () => Promise<string>)(),
    (token.decimals as () => Promise<number>)(),
  ]);
  console.log(`Token: ${name} (${symbol}), ${decimals} decimals`);

  const seen = new Set<string>();
  const addresses = [
    { label: "Recipient", address: config.bscRecipientAddress },
    { label: "Treasury",  address: config.treasuryAddress },
  ];

  for (const { label, address } of addresses) {
    if (!address || address === "0x0000000000000000000000000000000000000000") continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const balance = await (token.balanceOf as (a: string) => Promise<bigint>)(address);
      console.log(`${label} (${address}): ${formatUnits(balance, decimals)} ${symbol}`);
    } catch {
      console.log(`${label} (${address}): balance query failed`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(`Check failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
