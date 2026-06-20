const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    const E3DNFTManager = await ethers.getContractFactory("E3DNFTManager");
    const estimatedGas = await ethers.provider.estimateGas(
        E3DNFTManager.getDeployTransaction("0x6488861b401f427d13b6619c77c297366bcf6386")
    );

    console.log(`Estimated gas needed: ${ethers.utils.formatUnits(estimatedGas, "gwei")} Gwei`);
}

main();

