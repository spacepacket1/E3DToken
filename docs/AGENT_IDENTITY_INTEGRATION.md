# Agent Identity (ERC-8004) Integration Guide

## Overview

The E3DNFTManager contract has been extended to support Agent Identity NFTs following the ERC-8004 standard. This creates a revenue-generating marketplace where token communities can activate, fund, and trade AI agents.

## Contract Changes

### New Storage Variables

```solidity
struct AgentIdentity {
    address tokenAddress;        // The token this agent represents
    string registrationURI;      // ERC-8004 registration file (IPFS)
    uint256 reputationScore;     // 0-10000 (10000 = 100%)
    uint256 totalFundingE3D;     // Lifetime funding received
    uint8 validationLevel;       // 0=unvalidated, 1=basic, 2=premium, 3=elite
    uint256 activatedTimestamp;  // When activated
    bool isActive;               // Active status
    uint256 taskCompletionCount; // Tasks completed
    uint256 lastActivityTimestamp; // Last activity
}

mapping(uint256 => AgentIdentity) public agentIdentities;
mapping(address => uint256) public tokenToAgentNFT;
uint256 public agentActivationFee; // Default: 100 E3D
```

### New Functions

#### Public Functions

**`mintAgentIdentity(address tokenAddress, string registrationURI) → uint256`**
- Burns 100 E3D to activate an agent for a token
- Mints an Agent Identity NFT
- Returns the NFT token ID
- One agent per token address

**`getAgentByTokenAddress(address tokenAddress) → (uint256, AgentIdentity)`**
- Look up agent NFT by token address
- Returns NFT ID and full agent data

**`getAgentStats(uint256 tokenId) → (address, uint256, uint256, uint8, uint256, bool, uint256, uint256)`**
- Returns comprehensive agent statistics
- Includes reputation, funding, validation level, activity metrics

#### Owner-Only Functions

**`updateAgentReputation(uint256 tokenId, uint256 newScore)`**
- Update agent reputation score (0-10000)
- Called by backend based on funder feedback

**`recordAgentFunding(uint256 tokenId, uint256 amount)`**
- Record E3D funding for an agent
- Increments lifetime funding total
- Updates last activity timestamp

**`updateAgentValidation(uint256 tokenId, uint8 level)`**
- Set validation level (0-3)
- 0 = unvalidated, 1 = basic, 2 = premium, 3 = elite

**`recordAgentActivity(uint256 tokenId)`**
- Increment task completion counter
- Update last activity timestamp

**`setAgentActive(uint256 tokenId, bool active)`**
- Set agent active/inactive status

**`setAgentActivationFee(uint256 newFee)`**
- Update the E3D activation fee

## Deployment

### Upgrade Existing Contract

```bash
cd /Users/cbloom/e3d-hardhat
npx hardhat run scripts/upgrade-add-agents.js --network mainnet
```

This upgrades the existing proxy at `0xeED4620ff525101Ffcf7327378232CA9EF778D47` without changing its address.

## Backend Integration

### 1. Agent Registration Endpoint

Add to `server/spacepacket.js`:

```javascript
app.post('/api/agents/:tokenAddress/register_identity', requireAuthJson, async (req, res) => {
  try {
    const addr = normalizeTokenAddress(req.params.tokenAddress);

    // Fetch token metadata
    const tokenData = await fetchTokenData(addr);

    // Generate ERC-8004 registration file
    const registration = {
      "@context": "https://erc8004.org/v1",
      "type": "AIAgent",
      "name": `${tokenData.name} Agent`,
      "description": `AI agent working on behalf of ${tokenData.name} token holders`,
      "identity": {
        "nftContract": NFTManager_ADDRESS,
        "tokenAddress": addr
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

    const registrationURI = await pinJsonToIPFS(
      registration,
      `agent_identity_${addr}.json`
    );

    return res.json({
      ok: true,
      token_address: addr,
      registration_uri: registrationURI,
      nft_manager: NFTManager_ADDRESS,
      activation_fee_e3d: "100",
      instructions: "Call mintAgentIdentity(tokenAddress, registrationURI) on NFT Manager"
    });
  } catch (e) {
    console.error('register_identity error:', e);
    return res.status(500).json({ message: 'Registration failed' });
  }
});
```

### 2. Update Funding Finalization

Modify `finalize_funding` endpoint to record funding in agent NFT:

```javascript
app.post('/api/agents/:tokenAddress/finalize_funding', async (req, res) => {
  // ... existing funding verification ...

  // After funding is credited, update agent NFT if exists
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const nftContract = new ethers.Contract(
      NFTManager_ADDRESS,
      NFTManagerABI,
      provider.getSigner()
    );

    const [agentNftId] = await nftContract.getAgentByTokenAddress(addr);

    if (agentNftId > 0) {
      // Record funding on-chain
      await nftContract.recordAgentFunding(agentNftId, ethers.utils.parseEther(creditedE3DNum.toString()));
      console.log(`Recorded ${creditedE3DNum} E3D funding for agent NFT #${agentNftId}`);
    }
  } catch (e) {
    console.error('Failed to record agent funding on-chain:', e);
    // Non-critical, continue
  }

  // ... rest of existing code ...
});
```

### 3. Get Agent Identity in Dashboard

Add to agent status endpoint:

```javascript
app.get('/api/agents/:tokenAddress', async (req, res) => {
  // ... existing agent data fetching ...

  // Fetch on-chain agent identity if exists
  let agentIdentity = null;
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const nftContract = new ethers.Contract(NFTManager_ADDRESS, NFTManagerABI, provider);

    const [nftId, identity] = await nftContract.getAgentByTokenAddress(addr);

    if (nftId > 0) {
      const stats = await nftContract.getAgentStats(nftId);
      agentIdentity = {
        nft_id: nftId.toString(),
        reputation_score: identity.reputationScore.toString(),
        total_funding_e3d: ethers.utils.formatEther(identity.totalFundingE3D),
        validation_level: identity.validationLevel,
        is_active: identity.isActive,
        tasks_completed: stats.tasksCompleted.toString(),
        days_since_activation: stats.daysSinceActivation.toString(),
        registration_uri: identity.registrationURI
      };
    }
  } catch (e) {
    console.error('Failed to fetch agent identity:', e);
  }

  return res.json({
    agent: status,
    token: token,
    activities: activities,
    funding_stats: fundingStats,
    agent_identity: agentIdentity  // NEW
  });
});
```

## Frontend Integration

### Update AgentDashboardPage.js

Add agent identity display:

```javascript
const [agentIdentity, setAgentIdentity] = useState(null);

useEffect(() => {
  // Fetch agent data includes agent_identity field
  const resp = await axios.get(`${apiBase}/api/agents/${tokenAddr}`);
  setData(resp.data);
  setAgentIdentity(resp.data.agent_identity);
}, [tokenAddr]);

// In render:
{agentIdentity && (
  <Paper style={{ background: '#1a1a1a', border: '1px solid #333', padding: 12 }}>
    <Typography variant="h6" style={{ color: 'white', marginBottom: 8 }}>
      Agent Identity (ERC-8004)
    </Typography>
    <Divider style={{ background: '#333', marginBottom: 12 }} />

    <Box style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 6 }}>
      <Typography style={{ color: '#bbb' }}>NFT ID</Typography>
      <Typography style={{ color: 'white' }}>#{agentIdentity.nft_id}</Typography>

      <Typography style={{ color: '#bbb' }}>Reputation</Typography>
      <Typography style={{ color: 'white' }}>
        {(agentIdentity.reputation_score / 100).toFixed(1)}% ⭐
      </Typography>

      <Typography style={{ color: '#bbb' }}>Validation</Typography>
      <Typography style={{ color: 'white' }}>
        {agentIdentity.validation_level === 0 ? 'Unvalidated' :
         agentIdentity.validation_level === 1 ? '✓ Basic' :
         agentIdentity.validation_level === 2 ? '✓✓ Premium' : '✓✓✓ Elite'}
      </Typography>

      <Typography style={{ color: '#bbb' }}>Tasks Completed</Typography>
      <Typography style={{ color: 'white' }}>{agentIdentity.tasks_completed}</Typography>
    </Box>
  </Paper>
)}
```

## Revenue Model

### Revenue Streams

1. **Agent Activation** (100 E3D burned per agent)
   - Creates E3D scarcity
   - One-time fee per token

2. **Funding Rake** (2% of all E3D funding)
   - Recurring revenue from agent funding
   - Implemented in backend, not contract

3. **NFT Trading Royalties** (5% on secondary sales)
   - Already implemented in existing royalty system
   - Passive revenue when successful agents trade

### Example Revenue Projection

**Month 1:**
- 50 agents activated × 100 E3D = 5,000 E3D
- Average 1000 E3D funded per agent × 2% = 1,000 E3D
- **Total: 6,000 E3D/month**

**Month 6:**
- 300 active agents
- 250 new activations × 100 = 25,000 E3D
- 300 agents × 2000 E3D avg × 2% = 12,000 E3D
- Trading royalties: ~5,000 E3D
- **Total: 42,000 E3D/month**

## Testing on Sepolia

Before mainnet upgrade, test on Sepolia:

```bash
# Deploy to Sepolia
npx hardhat run scripts/upgrade-add-agents.js --network sepolia

# Test agent registration
npx hardhat console --network sepolia
> const nft = await ethers.getContractAt("E3DNFTManager", "PROXY_ADDRESS")
> await nft.mintAgentIdentity("0x6488861b401F427D13B6619C77C297366bCf6386", "ipfs://...")
```

## Next Steps

1. ✅ Contract upgraded with agent identity functions
2. ⬜ Add backend endpoints for registration
3. ⬜ Update frontend to display agent identities
4. ⬜ Test on Sepolia testnet
5. ⬜ Upgrade mainnet contract
6. ⬜ Activate E3D token as first pilot agent
7. ⬜ Launch marketing campaign targeting token communities

## Support

For questions or issues:
- Contract: `/Users/cbloom/e3d-hardhat/contracts/E3DNFTManager.sol`
- Upgrade script: `/Users/cbloom/e3d-hardhat/scripts/upgrade-add-agents.js`
- Current proxy: `0xeED4620ff525101Ffcf7327378232CA9EF778D47`
