// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract E3DNFTManager is Initializable, ERC721URIStorageUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, IERC2981 {
    using SafeERC20 for IERC20;

    uint256 private royaltyPercentage;
    uint256 private nextTokenId;
    IERC20 public e3dToken; // E3D Token Contract
  
    struct NFTInfo {
        address creator;
        string metadataURI;
        address[] linkedNFTContracts;
    }

    mapping(uint256 => NFTInfo) public nftData;
    mapping(uint256 => uint256) public nftPrices;
    mapping(address => uint256) public stakedE3D;
    uint256 public proposalId;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => uint256) public totalVotesInFavor;
    uint256 public currentProposal;
    uint256 public mintFeeE3D;
    uint256 public discountForE3DPurchase;
    uint256 public lastRewardDistribution;
    uint256 public rewardInterval;
    uint256 public rewardAmountPerAddress;
    uint256 public rewardRateStaking; // expressed as 1 = 1%
    uint256 public rewardRateNFT;     // expressed as 1 = 1%
    uint256 public e3dPerETH; // Manual price oracle for conversion
    mapping(uint256 => bool) public isPriceInE3D;

    event NFTMinted(uint256 indexed tokenId, address indexed creator, string metadataURI);
    event NFTListed(uint256 indexed tokenId, uint256 price, bool inE3D);
    event NFTUnlisted(uint256 indexed tokenId);
    event NFTPurchased(uint256 indexed tokenId, address buyer, bool usedE3D);
    event RoyaltyDistributed(uint256 indexed tokenId, uint256 amount, address[] recipients);
    event RoyaltyPaid(uint256 indexed tokenId, address recipient, uint256 amount, address linkedNFTContract);
    event RoyaltyChangeProposed(uint256 proposalId, address proposer, uint256 newPercentage);
    event RoyaltyPercentageUpdated(uint256 newPercentage);
    event E3DStaked(address staker, uint256 amount);
    event E3DWithdrawn(address staker, uint256 amount);
    event E3DRewardDistributed(address recipient, uint256 amount);
    event StakingRewardChangeProposed(uint256 proposalId, address proposer, uint256 newRate);
    event StakingRewardRateUpdated(uint256 newRate);
    event NFTRewardChangeProposed(uint256 proposalId, address proposer, uint256 newRate);
    event NFTRewardRateUpdated(uint256 newRate);
    event MintFeeChangeProposed(uint256 proposalId, address proposer, uint256 newFee);
    event MintFeeUpdated(uint256 newFee);
    event E3DPerETHUpdated(uint256 newRate);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // Prevents direct contract deployment
    }

    function initialize(address _e3dTokenAddress) public initializer {
        __ERC721_init("E3D NFT", "E3DNFT");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        royaltyPercentage = 10;
        e3dToken = IERC20(_e3dTokenAddress);
        nextTokenId = 1;
        proposalId = 0;
        mintFeeE3D = 100 * 10**18;
        discountForE3DPurchase = 5;
        rewardInterval = 1 days;
        rewardAmountPerAddress = 10 * 10**18;
        rewardRateStaking = 1;
        rewardRateNFT = 1;
        e3dPerETH = 1000 * 10**18; // default value: 1 ETH = 1000 E3D
    }

    function setE3DPerETH(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be positive");
        e3dPerETH = newRate;
        emit E3DPerETHUpdated(newRate);
    }

    function convertETHtoE3D(uint256 ethAmount) public view returns (uint256) {
        return (ethAmount * e3dPerETH) / 1 ether;
    }

    function convertE3DtoETH(uint256 e3dAmount) public view returns (uint256) {
        return (e3dAmount * 1 ether) / e3dPerETH;
    }

    function mintNFT(string memory metadataURI, address[] memory linkedNFTContracts) public {
        uint256 userStake = stakedE3D[msg.sender];
        uint256 discount = 0;

        if (userStake >= 1000 * 10**18) {
            discount = (mintFeeE3D * 30) / 100; // 30% discount
        } else if (userStake >= 500 * 10**18) {
            discount = (mintFeeE3D * 20) / 100; // 20% discount
        } else if (userStake >= 100 * 10**18) {
            discount = (mintFeeE3D * 10) / 100; // 10% discount
        }

        uint256 finalFee = mintFeeE3D - discount;

        require(e3dToken.balanceOf(msg.sender) >= finalFee, "Not enough E3D tokens");
        require(e3dToken.allowance(msg.sender, address(this)) >= finalFee, "Approve E3D tokens first");
        require(e3dToken.transferFrom(msg.sender, address(this), finalFee), "Transfer failed");

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        nftData[tokenId] = NFTInfo({
            creator: msg.sender,
            metadataURI: metadataURI,
            linkedNFTContracts: linkedNFTContracts
        });

        emit NFTMinted(tokenId, msg.sender, metadataURI);
    }

    function listNFT(uint256 tokenId, uint256 price, bool inE3D) public {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(price > 0, "Price must be greater than zero");
        nftPrices[tokenId] = price;
        isPriceInE3D[tokenId] = inE3D;
        emit NFTListed(tokenId, price, inE3D);
    }

    function unlistNFT(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(nftPrices[tokenId] > 0, "NFT is not listed");
        delete nftPrices[tokenId];
        emit NFTUnlisted(tokenId);
    }

    function buyNFT(uint256 tokenId, bool useE3D) public payable nonReentrant {
        uint256 price = nftPrices[tokenId];
        require(price > 0, "NFT not for sale");

        bool priceInE3D = isPriceInE3D[tokenId];
        address seller = ownerOf(tokenId);
        uint256 royaltyAmount;
        uint256 sellerAmount;
        uint256 discounted;

        if (useE3D) {
            uint256 e3dAmount = priceInE3D ? price : convertETHtoE3D(price);
            discounted = e3dAmount - (e3dAmount * discountForE3DPurchase) / 100;
            royaltyAmount = (discounted * royaltyPercentage) / 100;
            sellerAmount = discounted - royaltyAmount;

            require(e3dToken.balanceOf(msg.sender) >= discounted, "Not enough E3D tokens");
            require(e3dToken.allowance(msg.sender, address(this)) >= discounted, "Approve E3D tokens first");

            e3dToken.safeTransferFrom(msg.sender, seller, sellerAmount);
            e3dToken.safeTransferFrom(msg.sender, address(this), royaltyAmount);
            distributeRoyalties(tokenId, royaltyAmount);
        } else {
            uint256 ethAmount = priceInE3D ? convertE3DtoETH(price) : price;
            royaltyAmount = (ethAmount * royaltyPercentage) / 100;
            sellerAmount = ethAmount - royaltyAmount;

            require(msg.value >= ethAmount, "Insufficient ETH sent");
            payable(seller).transfer(sellerAmount);
            distributeRoyaltiesETH(tokenId, royaltyAmount);
        }

        _transfer(seller, msg.sender, tokenId);
        delete nftPrices[tokenId];

        emit NFTPurchased(tokenId, msg.sender, useE3D);
    }

    function distributeRoyalties(uint256 tokenId, uint256 royaltyAmount) private {
        NFTInfo storage nft = nftData[tokenId];
        uint256 totalContracts = nft.linkedNFTContracts.length;

        if (totalContracts == 0 || royaltyAmount == 0) return;

        uint256 sharePerOwner = royaltyAmount / totalContracts;
        address[] memory recipients = new address[](totalContracts);
        uint256 recipientCount = 0;

        for (uint256 i = 0; i < totalContracts; i++) {
            try IERC721(nft.linkedNFTContracts[i]).ownerOf(tokenId) returns (address owner) {
                if (owner != address(0)) {
                    e3dToken.transfer(owner, sharePerOwner);
                    recipients[recipientCount] = owner;
                    recipientCount++;
                }
            } catch {}
        }

        // Emit only the actual recipients
        address[] memory actualRecipients = new address[](recipientCount);
        for (uint256 j = 0; j < recipientCount; j++) {
            actualRecipients[j] = recipients[j];
        }
        emit RoyaltyDistributed(tokenId, royaltyAmount, actualRecipients);
    }

    function distributeRoyaltiesETH(uint256 tokenId, uint256 royaltyAmount) private {
        NFTInfo storage nft = nftData[tokenId];
        uint256 totalContracts = nft.linkedNFTContracts.length;

        if (totalContracts == 0 || royaltyAmount == 0) return;

        uint256 sharePerOwner = royaltyAmount / totalContracts;
        for (uint256 i = 0; i < totalContracts; i++) {
            try IERC721(nft.linkedNFTContracts[i]).ownerOf(tokenId) returns (address owner) {
                if (owner != address(0)) {
                    payable(owner).transfer(sharePerOwner);
                }
            } catch {}
        }

        emit RoyaltyDistributed(tokenId, royaltyAmount, nft.linkedNFTContracts);
    }

   function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake zero");
        e3dToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedE3D[msg.sender] += amount;
        emit E3DStaked(msg.sender, amount);
    }

    function withdrawStake(uint256 amount) external {
        require(amount > 0 && amount <= stakedE3D[msg.sender], "Invalid withdraw amount");
        stakedE3D[msg.sender] -= amount;
        e3dToken.safeTransfer(msg.sender, amount);
        emit E3DWithdrawn(msg.sender, amount);
    }

    function proposeRoyaltyChange(uint256 newPercentage) public {
        require(newPercentage <= 50, "Cannot exceed 50%");
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        proposalId++; // Increment proposal ID for new proposal
        currentProposal = newPercentage;
        totalVotesInFavor[proposalId] = 0; // Reset votes for new proposal
        emit RoyaltyChangeProposed(proposalId, msg.sender, newPercentage);
    }

    function voteOnRoyaltyChange(bool inFavor) public {
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        if (inFavor) {
            totalVotesInFavor[proposalId] += e3dToken.balanceOf(msg.sender);
        }
    }

   function executeRoyaltyChange() public onlyOwner {
        uint256 totalSupply = e3dToken.totalSupply();
        require(totalVotesInFavor[proposalId] * 100 / totalSupply >= 51, "Not enough votes");

        royaltyPercentage = currentProposal;
        totalVotesInFavor[proposalId] = 0;

        // ✅ Reset hasVoted for all users (Prevent stale vote lock)
        for (uint256 i = 0; i < 1000; i++) { // Adjust based on real voter tracking
            address voter = address(uint160(i));
            hasVoted[proposalId][voter] = false;
        }

        emit RoyaltyPercentageUpdated(royaltyPercentage);
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view override 
        returns (address receiver, uint256 royaltyAmount) {
        return (nftData[tokenId].creator, (salePrice * royaltyPercentage) / 100);
    }

    function fundRewards(uint256 amount) public onlyOwner {
        require(e3dToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function autoRefillE3D(uint256 minBalance, uint256 refillAmount) private {
        if (e3dToken.balanceOf(address(this)) < minBalance) {
            e3dToken.transferFrom(owner(), address(this), refillAmount);
        }
    }

    function getRoyaltyRate(address user) public view returns (uint256) {
        if (stakedE3D[user] >= 1000 * 10**18) return 5; // 5% royalty
        if (stakedE3D[user] >= 500 * 10**18) return 7; // 7% royalty
        return 10; // Default 10%
    }

    function proposeMintFeeChange(uint256 newFee) public {
        require(newFee >= 10 * 10**18 && newFee <= 1000 * 10**18, "Fee out of bounds");
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        proposalId++;
        currentProposal = newFee;
        totalVotesInFavor[proposalId] = 0;
        emit MintFeeChangeProposed(proposalId, msg.sender, newFee);
    }

    function voteOnMintFeeChange(bool inFavor) public {
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        if (inFavor) {
            totalVotesInFavor[proposalId] += e3dToken.balanceOf(msg.sender);
        }
    }

    function executeMintFeeChange() public onlyOwner {
        uint256 totalSupply = e3dToken.totalSupply();
        require(totalVotesInFavor[proposalId] * 100 / totalSupply >= 51, "Not enough votes");

        mintFeeE3D = currentProposal;
        totalVotesInFavor[proposalId] = 0;

        for (uint256 i = 0; i < 1000; i++) {
            address voter = address(uint160(i));
            hasVoted[proposalId][voter] = false;
        }

        emit MintFeeUpdated(mintFeeE3D);
    }

   function proposeStakingRewardChange(uint256 newRate) public {
        require(newRate <= 10, "Cannot exceed 10%");
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        proposalId++;
        currentProposal = newRate;
        totalVotesInFavor[proposalId] = 0;
        emit StakingRewardChangeProposed(proposalId, msg.sender, newRate);
    }

    function voteOnStakingRewardChange(bool inFavor) public {
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        if (inFavor) {
            totalVotesInFavor[proposalId] += e3dToken.balanceOf(msg.sender);
        }
    }

    function executeStakingRewardChange() public onlyOwner {
        uint256 totalSupply = e3dToken.totalSupply();
        require(totalVotesInFavor[proposalId] * 100 / totalSupply >= 51, "Not enough votes");

        rewardRateStaking = currentProposal;
        totalVotesInFavor[proposalId] = 0;

        for (uint256 i = 0; i < 1000; i++) {
            address voter = address(uint160(i));
            hasVoted[proposalId][voter] = false;
        }

        emit StakingRewardRateUpdated(rewardRateStaking);
    }

   function proposeNFTRewardChange(uint256 newRate) public {
        require(newRate <= 10, "Cannot exceed 10%");
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        proposalId++;
        currentProposal = newRate;
        totalVotesInFavor[proposalId] = 0;
        emit NFTRewardChangeProposed(proposalId, msg.sender, newRate);
    }

    function voteOnNFTRewardChange(bool inFavor) public {
        require(e3dToken.balanceOf(msg.sender) >= 100 * 10**18, "Must hold at least 100 E3D tokens");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        if (inFavor) {
            totalVotesInFavor[proposalId] += e3dToken.balanceOf(msg.sender);
        }
    }

    function executeNFTRewardChange() public onlyOwner {
        uint256 totalSupply = e3dToken.totalSupply();
        require(totalVotesInFavor[proposalId] * 100 / totalSupply >= 51, "Not enough votes");

        rewardRateNFT = currentProposal;
        totalVotesInFavor[proposalId] = 0;

        for (uint256 i = 0; i < 1000; i++) {
            address voter = address(uint160(i));
            hasVoted[proposalId][voter] = false;
        }

        emit NFTRewardRateUpdated(rewardRateNFT);
    }

    function distributeStakerAndHolderRewards() external onlyOwner {
        require(block.timestamp >= lastRewardDistribution + rewardInterval, "Too soon to distribute again");

        for (uint256 i = 0; i < 1000; i++) {
            address user = address(uint160(i));
            uint256 userStake = stakedE3D[user];
            if (userStake > 0) {
                uint256 reward = (userStake * rewardRateStaking) / 100;
                e3dToken.safeTransfer(user, reward);
                emit E3DRewardDistributed(user, reward);
            }
        }

        for (uint256 tokenId = 1; tokenId < nextTokenId; tokenId++) {
            try this.ownerOf(tokenId) returns (address holder) {
                if (holder != address(0)) {
                    uint256 price = nftPrices[tokenId];
                    uint256 reward = price > 0 ? (price * rewardRateNFT) / 100 : rewardAmountPerAddress;
                    e3dToken.safeTransfer(holder, reward);
                    emit E3DRewardDistributed(holder, reward);
                }
            } catch {}
        }

        lastRewardDistribution = block.timestamp;
    }

    function getLinkedNFTContracts(uint256 tokenId) public view returns (address[] memory) {
        return nftData[tokenId].linkedNFTContracts;
    }
}