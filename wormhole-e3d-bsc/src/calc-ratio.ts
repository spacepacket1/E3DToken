/**
 * Calculate the BNB amount to pair with E3D on PancakeSwap
 * such that the BSC price matches the current Ethereum price.
 *
 * Usage: npm run calc-ratio
 *
 * Fetches live prices from GeckoTerminal and CoinGecko, then prints
 * the PANCAKESWAP_BNB_AMOUNT to set in .env before running add-liquidity.
 */
import { config } from "./config.js";

const E3D_ADDRESS  = "0x6488861b401f427d13b6619c77c297366bcf6386";
const GECKO_BASE   = "https://api.geckoterminal.com/api/v2";
const COINGECKO    = "https://api.coingecko.com/api/v3";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": "wormhole-e3d-bsc/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function getE3dPriceUsd(): Promise<number> {
  const data = await fetchJson(
    `${GECKO_BASE}/networks/eth/tokens/${E3D_ADDRESS}/pools?page=1`
  ) as { data: Array<{ attributes: { base_token_price_usd: string } }> };

  const pools = data?.data ?? [];
  if (!pools.length) throw new Error("No E3D pools found on GeckoTerminal");

  // Use the pool with the most liquidity (first result, sorted by reserve by default)
  const price = parseFloat(pools[0].attributes.base_token_price_usd);
  if (!price || isNaN(price)) throw new Error("Could not parse E3D price from GeckoTerminal");
  return price;
}

async function getBnbPriceUsd(): Promise<number> {
  // Try CoinGecko first
  try {
    const data = await fetchJson(
      `${COINGECKO}/simple/price?ids=binancecoin&vs_currencies=usd`
    ) as { binancecoin: { usd: number } };
    const price = data?.binancecoin?.usd;
    if (price && !isNaN(price)) return price;
  } catch {
    // fall through to backup
  }

  // Backup: GeckoTerminal BNB/USDT pool on BSC
  const data = await fetchJson(
    `${GECKO_BASE}/networks/bsc/pools/0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae`
  ) as { data: { attributes: { base_token_price_usd: string } } };
  const price = parseFloat(data?.data?.attributes?.base_token_price_usd ?? "");
  if (!price || isNaN(price)) throw new Error("Could not fetch BNB price");
  return price;
}

async function main(): Promise<void> {
  const e3dAmount = parseFloat(config.pancakeswapE3dAmount);
  if (!e3dAmount || isNaN(e3dAmount)) {
    throw new Error("PANCAKESWAP_E3D_AMOUNT not set in .env");
  }

  console.log("Fetching live prices...");
  const [e3dPrice, bnbPrice] = await Promise.all([getE3dPriceUsd(), getBnbPriceUsd()]);

  const e3dValueUsd  = e3dAmount * e3dPrice;
  const bnbNeeded    = e3dValueUsd / bnbPrice;

  // Add 2% buffer so slippage doesn't reject the tx if price moves slightly
  const bnbWithBuffer = bnbNeeded * 1.02;

  console.log("");
  console.log(`E3D price (Ethereum):  $${e3dPrice.toFixed(6)}`);
  console.log(`BNB price:             $${bnbPrice.toFixed(2)}`);
  console.log(`${e3dAmount} E3D value:        $${e3dValueUsd.toFixed(4)}`);
  console.log("");
  console.log(`─────────────────────────────────────────`);
  console.log(`PANCAKESWAP_BNB_AMOUNT=${bnbWithBuffer.toFixed(6)}`);
  console.log(`─────────────────────────────────────────`);
  console.log("");
  console.log(`Implied E3D price on BSC: $${e3dPrice.toFixed(6)} (matches Ethereum)`);
  console.log(`Total pool size: ~$${(e3dValueUsd * 2).toFixed(2)}`);
  console.log("");
  console.log(`Run this immediately before 'npm run add-liquidity' — prices shift.`);
  console.log(`If BNB price moves >5% before you execute, run calc-ratio again.`);
}

main().catch((err: unknown) => {
  console.error(`calc-ratio failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
