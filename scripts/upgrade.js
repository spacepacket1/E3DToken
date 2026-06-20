// scripts/upgradeImplementation.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  const E3DNFTManager = await ethers.getContractFactory("E3DNFTManager");

  console.log("🔄 Upgrading E3D NFT implementation...");

  const proxyAddress = "0xeED4620ff525101Ffcf7327378232CA9EF778D47"; // Your existing proxy
  await upgrades.upgradeProxy(proxyAddress, E3DNFTManager);

  console.log("✅ Upgrade complete");

  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("🔎 New Implementation Address:", implAddress);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
