require("@nomicfoundation/hardhat-toolbox"); 
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades"); // 🔹 Ensure this is included!
require("dotenv").config();
const { task } = require("hardhat/config");

task("balance", "Prints an account's ETH balance")
    .addParam("account", "The account's address")
    .setAction(async (taskArgs, hre) => {
        const provider = hre.ethers.provider;
        const balance = await provider.getBalance(taskArgs.account);
        console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);
    });

module.exports = {
    solidity: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1  // Minimize deployment size for large contracts
        },
        viaIR: true,
        metadata: {
          bytecodeHash: "none"  // Remove metadata hash to save space
        }
      }
    },
    networks: {
      mainnet: {
        url: process.env.INFURA_URL,
        accounts: [process.env.PRIVATE_KEY],
      },
    },
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
    },
    sourcify: {
      enabled: false,
    },
};
