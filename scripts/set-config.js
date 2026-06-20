// Post-upgrade config: set the agent resolver base URI and the reputation scorer.
// Writes two onlyOwner txs from the .env deployer key (no MetaMask prompt).
const { ethers } = require("hardhat");

async function main() {
  const PROXY = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const BASE_URI = "https://maps.e3d.ai/agents/";
  const [signer] = await ethers.getSigners();
  const SCORER = signer.address; // deployer for now

  const c = await ethers.getContractAt("E3DNFTManager", PROXY);

  console.log("setAgentBaseURI:", BASE_URI);
  let tx = await c.setAgentBaseURI(BASE_URI);
  console.log("  tx:", tx.hash);
  await tx.wait();

  console.log("setReputationScorer:", SCORER);
  tx = await c.setReputationScorer(SCORER);
  console.log("  tx:", tx.hash);
  await tx.wait();

  // read back through a non-admin signer
  const dead = new ethers.VoidSigner("0x000000000000000000000000000000000000dEaD", ethers.provider);
  const r = (await ethers.getContractAt("E3DNFTManager", PROXY)).connect(dead);
  console.log("--- confirmed on-chain ---");
  console.log("agentBaseURI():    ", JSON.stringify(await r.agentBaseURI()));
  console.log("reputationScorer():", await r.reputationScorer());
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
