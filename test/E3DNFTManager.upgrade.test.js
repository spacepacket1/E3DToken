const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Exercises the upgrade features added to E3DNFTManager:
//  1. agent identity activation fee is BURNED (not parked in the contract)
//  2. reputation/activity/funding writes are gated to scorer-or-owner
//  3. agent identity NFTs are non-transferable except via handoffAgent()
//  4. getAgentTier() thresholds for off-chain x402 pricing
//  5. dynamic tokenURI resolver for agents; static URIs for art NFTs

const FEE = ethers.parseEther("100");      // agent activation fee
const MINT_FEE = ethers.parseEther("100"); // initialize() default for mintNFT
const AGENT_A = "0x00000000000000000000000000000000000000A1";
const AGENT_B = "0x00000000000000000000000000000000000000B2";

describe("E3DNFTManager upgrade features", function () {
  let owner, scorer, alice, bob;
  let e3d, mgr, mgrAddr;

  async function mintAgent(signer, agentAddr, uri) {
    await e3d.connect(owner).transfer(signer.address, FEE);
    await e3d.connect(signer).approve(mgrAddr, FEE);
    await mgr.connect(signer).mintAgentIdentity(agentAddr, uri);
    const res = await mgr.getAgentByTokenAddress(agentAddr);
    return res.tokenId;
  }

  beforeEach(async function () {
    [owner, scorer, alice, bob] = await ethers.getSigners();

    const E3D = await ethers.getContractFactory("E3DToken");
    e3d = await E3D.deploy(owner.address); // mints 1,000,000 E3D to owner
    await e3d.waitForDeployment();

    const Mgr = await ethers.getContractFactory("E3DNFTManager");
    mgr = await upgrades.deployProxy(Mgr, [await e3d.getAddress()], { initializer: "initialize" });
    await mgr.waitForDeployment();
    mgrAddr = await mgr.getAddress();

    await mgr.connect(owner).setAgentActivationFee(FEE);
    await e3d.connect(owner).transfer(alice.address, ethers.parseEther("1000"));
    await e3d.connect(owner).transfer(bob.address, ethers.parseEther("1000"));
  });

  describe("activation fee is burned", function () {
    it("reduces total supply and never accrues to the contract", async function () {
      const before = await e3d.totalSupply();
      await mintAgent(alice, AGENT_A, "ipfs://agentA");
      const after = await e3d.totalSupply();
      expect(before - after).to.equal(FEE);
      expect(await e3d.balanceOf(mgrAddr)).to.equal(0n);
    });
  });

  describe("scorer role", function () {
    let id;
    beforeEach(async function () { id = await mintAgent(alice, AGENT_A, "ipfs://agentA"); });

    it("rejects reputation writes from a non-scorer non-owner", async function () {
      await expect(mgr.connect(bob).updateAgentReputation(id, 6000))
        .to.be.revertedWithCustomError(mgr, "NotScorer");
    });

    it("allows the designated scorer and the owner", async function () {
      await mgr.connect(owner).setReputationScorer(scorer.address);
      await mgr.connect(scorer).updateAgentReputation(id, 6000);
      expect((await mgr.getAgentStats(id)).reputationScore).to.equal(6000n);
      await mgr.connect(owner).updateAgentReputation(id, 7000);
      expect((await mgr.getAgentStats(id)).reputationScore).to.equal(7000n);
      await mgr.connect(scorer).recordAgentActivity(id);
      expect((await mgr.getAgentStats(id)).tasksCompleted).to.equal(1n);
    });
  });

  describe("controlled transfer / handoff", function () {
    let id;
    beforeEach(async function () { id = await mintAgent(alice, AGENT_A, "ipfs://agentA"); });

    it("blocks ordinary transfers of agent tokens", async function () {
      await expect(mgr.connect(alice).transferFrom(alice.address, bob.address, id))
        .to.be.revertedWithCustomError(mgr, "AgentNotTransferable");
    });

    it("allows a deliberate handoff by the holder, then re-locks", async function () {
      await expect(mgr.connect(bob).handoffAgent(id, bob.address))
        .to.be.revertedWithCustomError(mgr, "NotOwner");
      await expect(mgr.connect(alice).handoffAgent(id, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(mgr, "InvalidTokenAddress");

      await expect(mgr.connect(alice).handoffAgent(id, bob.address))
        .to.emit(mgr, "AgentHandedOff").withArgs(id, alice.address, bob.address);
      expect(await mgr.ownerOf(id)).to.equal(bob.address);

      // re-locked: new holder cannot ordinarily transfer
      await expect(mgr.connect(bob).transferFrom(bob.address, alice.address, id))
        .to.be.revertedWithCustomError(mgr, "AgentNotTransferable");
    });

    it("does not restrict ordinary (non-agent) NFTs", async function () {
      await e3d.connect(owner).approve(mgrAddr, MINT_FEE);
      const tx = await mgr.connect(owner).mintNFT("ipfs://art", []);
      const rc = await tx.wait();
      const ev = rc.logs
        .map((l) => { try { return mgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "NFTMinted");
      const regularId = ev.args.tokenId;

      await mgr.connect(owner).transferFrom(owner.address, bob.address, regularId);
      expect(await mgr.ownerOf(regularId)).to.equal(bob.address);
    });
  });

  describe("getAgentTier thresholds", function () {
    let id;
    beforeEach(async function () { id = await mintAgent(alice, AGENT_A, "ipfs://agentA"); });

    it("maps reputation + validation + active state to tiers", async function () {
      expect(await mgr.getAgentTier(id)).to.equal(1); // fresh: rep 5000, val 0

      await mgr.connect(owner).updateAgentReputation(id, 6500);
      await mgr.connect(owner).updateAgentValidation(id, 1);
      expect(await mgr.getAgentTier(id)).to.equal(2);

      await mgr.connect(owner).updateAgentReputation(id, 8000);
      await mgr.connect(owner).updateAgentValidation(id, 2);
      expect(await mgr.getAgentTier(id)).to.equal(3);

      await mgr.connect(owner).updateAgentReputation(id, 4000);
      expect(await mgr.getAgentTier(id)).to.equal(0);

      await mgr.connect(owner).updateAgentReputation(id, 9000);
      await mgr.connect(owner).setAgentActive(id, false);
      expect(await mgr.getAgentTier(id)).to.equal(0); // inactive => 0
    });
  });

  describe("dynamic resolver", function () {
    it("resolves agent tokenURI to baseURI+id, leaves art NFTs static", async function () {
      const id = await mintAgent(alice, AGENT_A, "ipfs://agentA");

      // art NFT
      await e3d.connect(owner).approve(mgrAddr, MINT_FEE);
      const tx = await mgr.connect(owner).mintNFT("ipfs://art", []);
      const rc = await tx.wait();
      const ev = rc.logs
        .map((l) => { try { return mgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "NFTMinted");
      const regularId = ev.args.tokenId;

      // before base set: agent uses its stored registrationURI
      expect(await mgr.tokenURI(id)).to.equal("ipfs://agentA");

      await mgr.connect(owner).setAgentBaseURI("https://maps.e3d.ai/agents/");
      expect(await mgr.tokenURI(id)).to.equal("https://maps.e3d.ai/agents/" + id.toString());

      // art NFT unaffected by the agent base URI
      expect(await mgr.tokenURI(regularId)).to.equal("ipfs://art");
    });
  });

  describe("owner-only admin setters", function () {
    it("rejects non-owner callers", async function () {
      await expect(mgr.connect(alice).setAgentBaseURI("x"))
        .to.be.revertedWithCustomError(mgr, "OwnableUnauthorizedAccount");
      await expect(mgr.connect(alice).setReputationScorer(alice.address))
        .to.be.revertedWithCustomError(mgr, "OwnableUnauthorizedAccount");
    });
  });

  describe("mint validation", function () {
    it("reverts on a duplicate agent for the same token address", async function () {
      await mintAgent(alice, AGENT_A, "ipfs://agentA");
      await expect(mgr.connect(bob).mintAgentIdentity(AGENT_A, "ipfs://dup"))
        .to.be.revertedWithCustomError(mgr, "AgentAlreadyExistsForToken");
    });

    it("reverts without sufficient allowance", async function () {
      await expect(mgr.connect(alice).mintAgentIdentity(AGENT_B, "ipfs://b"))
        .to.be.revertedWithCustomError(mgr, "ApproveE3DTokensFirst");
    });

    it("reverts on zero token address and on empty URI", async function () {
      await expect(mgr.connect(alice).mintAgentIdentity(ethers.ZeroAddress, "ipfs://x"))
        .to.be.revertedWithCustomError(mgr, "InvalidTokenAddress");
      await expect(mgr.connect(alice).mintAgentIdentity(AGENT_B, ""))
        .to.be.revertedWithCustomError(mgr, "RegistrationURIRequired");
    });

    it("blocks handoff on a non-agent token id", async function () {
      await expect(mgr.connect(alice).handoffAgent(9999, alice.address))
        .to.be.revertedWithCustomError(mgr, "NotAgentNFT");
    });
  });
});
