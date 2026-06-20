// Read-only: confirm whether the upgraded implementation is actually live on the proxy.
const { ethers, upgrades } = require("hardhat");

async function main() {
  const PROXY = "0xeED4620ff525101Ffcf7327378232CA9EF778D47";
  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("implementation on proxy:", impl);

  const dead = new ethers.VoidSigner("0x000000000000000000000000000000000000dEaD", ethers.provider);
  const c = (await ethers.getContractAt("E3DNFTManager", PROXY)).connect(dead);

  for (const [label, call] of [
    ["reputationScorer()", () => c.reputationScorer()],
    ["agentBaseURI()", () => c.agentBaseURI()],
    ["agentActivationFee()", () => c.agentActivationFee()],
  ]) {
    try {
      const v = await call();
      console.log(`NEW/LIVE  ${label} =>`, v.toString());
    } catch (e) {
      console.log(`MISSING   ${label} =>`, e.shortMessage || e.message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
