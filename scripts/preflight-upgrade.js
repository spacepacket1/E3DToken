// Read-only pre-flight for the E3DNFTManager upgrade. Sends NO transaction.
// Confirms the .env deployer can actually perform the upgrade and has gas.
const { ethers, upgrades, network } = require("hardhat");

async function main() {
  const PROXY = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const [signer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(signer.address);
  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  const adminAddr = await upgrades.erc1967.getAdminAddress(PROXY);

  console.log("network:               ", network.name);
  console.log("deployer (.env key):   ", signer.address);
  console.log("deployer ETH balance:  ", ethers.formatEther(bal), "ETH");
  console.log("proxy:                 ", PROXY);
  console.log("current implementation:", impl);
  console.log("proxy admin:           ", adminAddr);

  try {
    const admin = await ethers.getContractAt(
      ["function owner() view returns (address)"], adminAddr);
    const adminOwner = await admin.owner();
    const can = adminOwner.toLowerCase() === signer.address.toLowerCase();
    console.log("proxy admin owner:     ", adminOwner);
    console.log("deployer CAN upgrade:  ", can ? "YES" : "NO — wrong key, would revert");
  } catch (e) {
    console.log("admin.owner() read failed:", e.message);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
