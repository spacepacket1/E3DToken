const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("🚀 Deploying E3DNFTManager with account:", deployer.address);

    // Ensure `upgrades` is working
    if (!upgrades) {
        console.error("❌ OpenZeppelin Upgrades Plugin not initialized!");
        return;
    }

    console.log("⏳ Deploying proxy...");
    const E3DNFTManager = await ethers.getContractFactory("E3DNFTManager");

    const e3dNFT = await upgrades.deployProxy(
        E3DNFTManager,
        ["0x6488861b401f427d13b6619c77c297366bcf6386"], // E3DToken address
        { initializer: "initialize" }
    );

    await e3dNFT.waitForDeployment();

    console.log("✅ E3DNFTManager (proxy) deployed to:", e3dNFT.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
