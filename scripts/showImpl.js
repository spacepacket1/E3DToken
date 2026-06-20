const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = "0xeED4620ff525101Ffcf7327378232CA9EF778D47"; // Replace with your actual proxy address

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("📦 Current implementation address:", implementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
