// scripts/getABI.js
const fs = require('fs');
const path = require('path');

async function main() {
  const artifactPath = path.join(__dirname, '../artifacts/contracts/E3DNFTManager.sol/E3DNFTManager.json');
  const artifact = require(artifactPath);
  const abi = JSON.stringify(artifact.abi, null, 2);
  
  // Print to console
  console.log(abi);
  
  // Also save to a file for easy access
  fs.writeFileSync(
    path.join(__dirname, '../E3DNFTManager_abi.json'), 
    abi
  );
  
  console.log('ABI saved to E3DNFTManager_abi.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
