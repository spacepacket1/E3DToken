const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const ACTIVATION_FEE = ethers.parseEther("100"); // 100 E3D

  console.log("Setting agent activation fee to 100 E3D...");

  const contract = await ethers.getContractAt("E3DNFTManager", PROXY_ADDRESS);

  const tx = await contract.setAgentActivationFee(ACTIVATION_FEE);
  console.log("Transaction sent:", tx.hash);

  await tx.wait();
  console.log("✅ Transaction confirmed!");

  // Verify the fee was set
  const fee = await contract.agentActivationFee();
  console.log("Agent activation fee:", ethers.formatEther(fee), "E3D");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
