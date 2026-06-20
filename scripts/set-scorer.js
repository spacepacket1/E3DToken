// Idempotent: confirm base URI, and set reputationScorer to the deployer if not already.
const { ethers } = require("hardhat");

async function main() {
  const PROXY = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const [signer] = await ethers.getSigners();
  const dead = new ethers.VoidSigner("0x000000000000000000000000000000000000dEaD", ethers.provider);
  const r = (await ethers.getContractAt("E3DNFTManager", PROXY)).connect(dead);

  console.log("agentBaseURI():            ", JSON.stringify(await r.agentBaseURI()));
  const cur = await r.reputationScorer();
  console.log("reputationScorer (current):", cur);

  if (cur.toLowerCase() === signer.address.toLowerCase()) {
    console.log("scorer already set — nothing to do.");
    return;
  }

  const c = await ethers.getContractAt("E3DNFTManager", PROXY);
  const tx = await c.setReputationScorer(signer.address);
  console.log("setReputationScorer tx:", tx.hash);
  await tx.wait();
  console.log("reputationScorer (after):  ", await r.reputationScorer());
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
