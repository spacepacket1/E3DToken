const { ethers } = require("hardhat");
const axios = require("axios");

// Simple IPFS upload using Pinata (you can use your existing pinning service)
async function pinToIPFS(jsonData, filename) {
  // For now, we'll return a mock IPFS URI
  // Replace this with your actual IPFS pinning logic
  console.log("Pinning to IPFS:", filename);
  console.log(JSON.stringify(jsonData, null, 2));

  // TODO: Replace with actual IPFS upload
  // For testing, you can manually upload to https://pinata.cloud or use your existing service

  return "ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"; // Replace with real hash
}

async function main() {
  const NFT_MANAGER_ADDRESS = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const E3D_TOKEN_ADDRESS = "0x6488861b401F427D13B6619C77C297366bCf6386";
  const E3D_TOKEN_CONTRACT = "0x6488861b401F427D13B6619C77C297366bCf6386"; // E3D ERC20

  console.log("Minting Agent Identity for E3D Token...\n");

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  // Get contracts
  const nftManager = await ethers.getContractAt("E3DNFTManager", NFT_MANAGER_ADDRESS);
  const e3dToken = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function approve(address spender, uint256 amount) returns (bool)"],
    E3D_TOKEN_CONTRACT
  );

  // Check E3D balance
  const balance = await e3dToken.balanceOf(signer.address);
  const activationFee = await nftManager.agentActivationFee();
  console.log("E3D Balance:", ethers.formatEther(balance), "E3D");
  console.log("Activation Fee:", ethers.formatEther(activationFee), "E3D");

  if (balance < activationFee) {
    throw new Error("Insufficient E3D balance for activation fee!");
  }

  // Create ERC-8004 registration metadata
  const registration = {
    "@context": "https://erc8004.org/v1",
    "type": "AIAgent",
    "name": "E3D Token Agent",
    "description": "AI agent working on behalf of E3D token holders, monitoring ecosystem health, promoting the token, and providing analytics.",
    "identity": {
      "nftContract": NFT_MANAGER_ADDRESS,
      "tokenAddress": E3D_TOKEN_ADDRESS,
      "blockchain": "ethereum",
      "chainId": 1
    },
    "capabilities": {
      "mcp": true,
      "tasks": [
        "market_analysis",
        "social_monitoring",
        "holder_tracking",
        "ecosystem_promotion",
        "analytics_reporting"
      ],
      "endpoints": {
        "status": `https://e3d.ai/api/agents/${E3D_TOKEN_ADDRESS}`,
        "heartbeat": `https://e3d.ai/api/agents/${E3D_TOKEN_ADDRESS}/heartbeat`,
        "activity": `https://e3d.ai/api/agents/${E3D_TOKEN_ADDRESS}/activity`
      }
    },
    "platform": {
      "name": "E3D",
      "version": "1.0.0",
      "website": "https://e3d.ai",
      "standard": "ERC-8004"
    },
    "metadata": {
      "created": new Date().toISOString(),
      "image": "https://e3d.ai/logo.png" // Update with actual logo URL
    }
  };

  // Pin to IPFS (you'll need to replace this with actual pinning)
  console.log("\nERC-8004 Registration Data:");
  console.log(JSON.stringify(registration, null, 2));

  // Using the already pinned IPFS registration
  const registrationURI = "ipfs://bafkreihlwq4df4quw5plpi5yrjfaog6sxnbpcsnbsuhf5uz26lx6t6fc5i";
  console.log("\nUsing IPFS URI:", registrationURI);
  console.log("View at: https://ipfs.io/ipfs/bafkreihlwq4df4quw5plpi5yrjfaog6sxnbpcsnbsuhf5uz26lx6t6fc5i\n");

  // Minting code

  // Step 1: Approve E3D spending
  console.log("\n1. Approving E3D spending...");
  const approveTx = await e3dToken.approve(NFT_MANAGER_ADDRESS, activationFee);
  console.log("Approval tx:", approveTx.hash);
  await approveTx.wait();
  console.log("✅ Approved!");

  // Step 2: Mint Agent Identity
  console.log("\n2. Minting Agent Identity NFT...");
  const mintTx = await nftManager.mintAgentIdentity(E3D_TOKEN_ADDRESS, registrationURI);
  console.log("Mint tx:", mintTx.hash);
  const receipt = await mintTx.wait();

  // Find the AgentIdentityMinted event
  const event = receipt.logs
    .map(log => {
      try {
        return nftManager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(e => e && e.name === 'AgentIdentityMinted');

  if (event) {
    console.log("\n✅ Agent Identity Minted!");
    console.log("Token ID:", event.args.tokenId.toString());
    console.log("Token Address:", event.args.tokenAddress);
    console.log("Activator:", event.args.activator);
    console.log("Registration URI:", event.args.registrationURI);
  }

  // Step 3: Verify
  console.log("\n3. Verifying agent...");
  const [agentNftId, identity] = await nftManager.getAgentByTokenAddress(E3D_TOKEN_ADDRESS);
  console.log("Agent NFT ID:", agentNftId.toString());
  console.log("Reputation Score:", identity.reputationScore.toString(), "/ 10000");
  console.log("Is Active:", identity.isActive);

  console.log("\n🎉 E3D Agent successfully registered on-chain!");
  console.log("View on Etherscan:");
  console.log(`https://etherscan.io/token/${NFT_MANAGER_ADDRESS}?a=${agentNftId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
