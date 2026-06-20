const { ethers, upgrades } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = "0xeED4620ff525101Ffcf7327378232CA9EF778D47"; // E3D NFT Manager proxy

  console.log("Upgrading E3DNFTManager to add Agent Identity (ERC-8004) functionality...");

  const E3DNFTManagerV2 = await ethers.getContractFactory("E3DNFTManager");

  console.log("Preparing upgrade...");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, E3DNFTManagerV2);

  await upgraded.waitForDeployment();

  const implAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  console.log("✅ E3DNFTManager upgraded successfully!");
  console.log("Proxy address (unchanged):", PROXY_ADDRESS);
  console.log("New implementation address:", implAddress);

  // Verify the new functionality is available
  console.log("\nVerifying new agent functions...");
  // If this proxy is a TransparentUpgradeableProxy, calls *from the admin address*
  // intentionally revert. Use a non-admin `from` address for verification reads.
  const provider = ethers.provider;
  const readOnlySigner = new ethers.VoidSigner("0x000000000000000000000000000000000000dEaD", provider);
  const contract = (await ethers.getContractAt("E3DNFTManager", PROXY_ADDRESS)).connect(readOnlySigner);

  const activationFee = await contract.agentActivationFee();
  console.log("Agent activation fee:", ethers.formatEther(activationFee), "E3D");

  console.log("\n✅ Upgrade complete! New agent identity functions are now available:");
  console.log("  - mintAgentIdentity()");
  console.log("  - updateAgentReputation()");
  console.log("  - recordAgentFunding()");
  console.log("  - updateAgentValidation()");
  console.log("  - recordAgentActivity()");
  console.log("  - getAgentByTokenAddress()");
  console.log("  - getAgentStats()");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
