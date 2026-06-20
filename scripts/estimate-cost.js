// Read-only: estimate the ETH cost of the upgrade at current gas prices.
const { ethers } = require("hardhat");

async function main() {
  const fd = await ethers.provider.getFeeData();
  const gp = fd.maxFeePerGas ?? fd.gasPrice;
  const gasImpl = 4610810n;   // new implementation deployment (from gas report)
  const gasUpgrade = 120000n; // ProxyAdmin upgradeAndCall + overhead (generous)
  const total = gasImpl + gasUpgrade;
  console.log("gasPrice/maxFee (gwei):", ethers.formatUnits(gp, "gwei"));
  console.log("estimated gas:         ", total.toString());
  console.log("estimated cost:        ", ethers.formatEther(gp * total), "ETH");
  console.log("suggested funding (2x):", ethers.formatEther(gp * total * 2n), "ETH");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
