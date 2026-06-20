# How to Mint the E3D Agent Identity NFT

## Quick Guide

You need to:
1. Create ERC-8004 registration metadata
2. Pin it to IPFS
3. Approve E3D spending
4. Call `mintAgentIdentity()`

## Option 1: Using Your Backend (Recommended)

Since your backend already has IPFS pinning (`pinJsonToIPFS`), the easiest way is:

### Step 1: Generate Registration URI via Backend

Add a temporary endpoint to your server:

```javascript
// In server/spacepacket.js
app.post('/api/agents/:tokenAddress/generate_registration', requireAuthJson, async (req, res) => {
  const addr = req.params.tokenAddress.toLowerCase();

  const registration = {
    "@context": "https://erc8004.org/v1",
    "type": "AIAgent",
    "name": "E3D Token Agent",
    "description": "AI agent for E3D token holders",
    "identity": {
      "nftContract": NFTManager_ADDRESS,
      "tokenAddress": addr,
      "blockchain": "ethereum",
      "chainId": 1
    },
    "capabilities": {
      "mcp": true,
      "tasks": ["market_analysis", "social_monitoring", "holder_tracking"],
      "endpoints": {
        "status": `https://e3d.ai/api/agents/${addr}`,
        "heartbeat": `https://e3d.ai/api/agents/${addr}/heartbeat`,
        "activity": `https://e3d.ai/api/agents/${addr}/activity`
      }
    },
    "platform": {
      "name": "E3D",
      "version": "1.0.0",
      "website": "https://e3d.ai"
    }
  };

  const uri = await pinJsonToIPFS(registration, `agent_registration_${addr}.json`);
  res.json({ registration_uri: uri });
});
```

Then call it:
```bash
curl -X POST https://e3d.ai/api/agents/0x6488861b401F427D13B6619C77C297366bCf6386/generate_registration \
  -H "Content-Type: application/json" \
  --cookie "your-session-cookie"
```

### Step 2: Mint via Etherscan (Easiest)

1. Go to: https://etherscan.io/address/0xeED4620ff525101Ffcf7327378232CA9EF778D47#writeProxyContract

2. Connect your wallet (the one with 100+ E3D)

3. First approve E3D:
   - Go to E3D Token contract: https://etherscan.io/token/0x6488861b401F427D13B6619C77C297366bCf6386#writeContract
   - Find `approve` function
   - spender: `0xeED4620ff525101Ffcf7327378232CA9EF778D47`
   - amount: `100000000000000000000` (100 E3D with 18 decimals)
   - Click "Write"

4. Then mint the agent:
   - Go back to NFT Manager write contract
   - Find `mintAgentIdentity` function
   - tokenAddress: `0x6488861b401F427D13B6619C77C297366bCf6386`
   - registrationURI: `ipfs://QmYourHashHere` (from Step 1)
   - Click "Write"

5. Wait for confirmation, then check:
   - Call `getAgentByTokenAddress` with `0x6488861b401F427D13B6619C77C297366bCf6386`
   - Should return your new NFT ID!

## Option 2: Using the Script

If you want to mint programmatically:

```bash
# 1. First, generate and pin the registration metadata manually or via backend
# Get the IPFS hash

# 2. Edit scripts/mint-e3d-agent.js
# - Update registrationURI with your IPFS hash
# - Uncomment the minting code

# 3. Run the script
npx hardhat run scripts/mint-e3d-agent.js --network mainnet
```

## Option 3: Manual IPFS Upload

If you don't want to add a backend endpoint:

1. Create a file `e3d_agent_registration.json`:

```json
{
  "@context": "https://erc8004.org/v1",
  "type": "AIAgent",
  "name": "E3D Token Agent",
  "description": "AI agent working on behalf of E3D token holders",
  "identity": {
    "nftContract": "0xeED4620ff525101Ffcf7327378232CA9EF778D47",
    "tokenAddress": "0x6488861b401F427D13B6619C77C297366bCf6386",
    "blockchain": "ethereum",
    "chainId": 1
  },
  "capabilities": {
    "mcp": true,
    "tasks": ["market_analysis", "social_monitoring", "holder_tracking"],
    "endpoints": {
      "status": "https://e3d.ai/api/agents/0x6488861b401F427D13B6619C77C297366bCf6386",
      "heartbeat": "https://e3d.ai/api/agents/0x6488861b401F427D13B6619C77C297366bCf6386/heartbeat",
      "activity": "https://e3d.ai/api/agents/0x6488861b401F427D13B6619C77C297366bCf6386/activity"
    }
  },
  "platform": {
    "name": "E3D",
    "version": "1.0.0",
    "website": "https://e3d.ai"
  }
}
```

2. Upload to IPFS:
   - Go to https://pinata.cloud (or use your service)
   - Upload the JSON file
   - Copy the IPFS hash (e.g., `QmXXXX...`)

3. Use Etherscan method above with `ipfs://QmXXXX...` as the URI

## Verifying the Agent

After minting, verify on Etherscan:

```
1. Go to: https://etherscan.io/address/0xeED4620ff525101Ffcf7327378232CA9EF778D47#readProxyContract

2. Call getAgentByTokenAddress:
   - tokenAddress: 0x6488861b401F427D13B6619C77C297366bCf6386

3. Should return:
   - tokenId: (your NFT ID)
   - identity: (struct with all agent data)

4. Call getAgentStats:
   - tokenId: (the ID from step 3)

5. Should show:
   - reputationScore: 5000 (50%)
   - isActive: true
   - validationLevel: 0 (unvalidated)
```

## After Minting

Once minted, you can:

1. **View your agent NFT** on OpenSea:
   - https://opensea.io/assets/ethereum/0xeED4620ff525101Ffcf7327378232CA9EF778D47/[tokenId]

2. **Update backend** to track the NFT ID in your database

3. **Display on frontend** - Agent dashboard will show:
   - NFT ID
   - Reputation score
   - Validation status
   - Activity metrics

4. **Start recording activity**:
   - When agents complete tasks, call `recordAgentActivity(tokenId)`
   - When funders send E3D, call `recordAgentFunding(tokenId, amount)`
   - Both are owner-only functions callable from your backend

## Costs

- **Approval transaction**: ~50k gas (~$2-5 depending on gas price)
- **Minting transaction**: ~150k gas (~$6-15 depending on gas price)
- **100 E3D burned**: Sent to contract (creates scarcity)

**Total cost**: ~$10-20 in gas + 100 E3D

## Troubleshooting

**"Insufficient E3D for activation"**
- Make sure you have 100+ E3D in your wallet
- Check allowance was approved first

**"Agent already exists for token"**
- Each token can only have ONE agent
- Check if already minted: call `getAgentByTokenAddress()`

**"Not agent NFT" error**
- Wrong token ID used in stats/update functions
- Make sure using the NFT ID, not the token address

## Next Steps

After successfully minting:
1. ✅ E3D token has its agent NFT
2. Add backend integration to record funding/activity
3. Update frontend to display agent identity
4. Reach out to other token communities to mint their agents!
5. Send that a16z email 🚀
