const { ethers, upgrades } = require("hardhat");

async function main() {
    const proxyAddress = "0xeED4620ff525101Ffcf7327378232CA9EF778D47"; // Proxy Contract Address

    console.log("🛠 Fetching contract at proxy address:", proxyAddress);

    // Force load using the IMPLEMENTATION ABI
    const E3DNFTManager = await ethers.getContractAt(
        "contracts/E3DNFTManager.sol:E3DNFTManager", 
        proxyAddress
    );

    console.log("✅ Contract loaded at:", E3DNFTManager.address);

    // Test function call
    const royaltyPercentage = await E3DNFTManager.royaltyPercentage();
    console.log("🎉 Current royalty percentage:", royaltyPercentage.toString());
}

// Run the script
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });

