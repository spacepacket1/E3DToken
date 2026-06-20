// Read-only storage-layout safety check against the live proxy.
// Does NOT send any transaction. Run before any real upgrade.
const { ethers, upgrades } = require("hardhat");

async function main() {
  const PROXY = "0xeED4620ff525101Ffcf7327378232CA9EF778D47"; // E3DNFTManager proxy
  const Factory = await ethers.getContractFactory("E3DNFTManager");

  console.log("🔎 Validating new implementation against deployed proxy (read-only)...");
  await upgrades.validateUpgrade(PROXY, Factory);
  console.log("✅ Storage layout compatible — upgrade is safe.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Upgrade validation FAILED:");
    console.error(err.message || err);
    process.exit(1);
  });
