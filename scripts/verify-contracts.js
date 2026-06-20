const { run } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const IMPLEMENTATION_ADDRESS = "0x7A6da3c8bE4b4173677DecB3e9CE9D5b2F645518";

  console.log("Verifying contracts on Etherscan...\n");

  // Verify the implementation contract
  console.log("1. Verifying Implementation Contract...");
  console.log("Address:", IMPLEMENTATION_ADDRESS);

  try {
    await run("verify:verify", {
      address: IMPLEMENTATION_ADDRESS,
      constructorArguments: [], // No constructor args for upgradeable implementation
    });
    console.log("✅ Implementation verified!\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Implementation already verified!\n");
    } else {
      console.log("❌ Implementation verification failed:");
      console.log(error.message, "\n");
    }
  }

  // Verify the proxy contract
  console.log("2. Verifying Proxy Contract...");
  console.log("Address:", PROXY_ADDRESS);

  try {
    await run("verify:verify", {
      address: PROXY_ADDRESS,
      constructorArguments: [], // Proxy constructor args handled by OpenZeppelin
    });
    console.log("✅ Proxy verified!\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Proxy already verified!\n");
    } else {
      console.log("❌ Proxy verification failed:");
      console.log(error.message, "\n");
    }
  }

  console.log("🎉 Verification complete!");
  console.log("\nView on Etherscan:");
  console.log(`Implementation: https://etherscan.io/address/${IMPLEMENTATION_ADDRESS}#code`);
  console.log(`Proxy: https://etherscan.io/address/${PROXY_ADDRESS}#code`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
