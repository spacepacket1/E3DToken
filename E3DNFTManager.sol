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
    uint256 public proposalId; // Track current proposal ID
    mapping(uint256 => mapping(address => bool)) public hasVoted; // proposalId => voter => hasVoted
    mapping(uint256 => uint256) public totalVotesInFavor; // proposalId => total votes in favor
    uint256 public currentProposal; // Proposed royalty percentage
    uint256 public mintFeeE3D;
    uint256 public discountForE3DPurchase; 

    event NFTMinted(uint256 indexed tokenId, address indexed creator, string metadataURI);
    event NFTListed(uint256 indexed tokenId, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address buyer, bool usedE3D);
    event RoyaltyDistributed(uint256 indexed tokenId, uint256 amount, address[] recipients);
    event RoyaltyChangeProposed(uint256 proposalId, address proposer, uint256 newPercentage);
    event RoyaltyPercentageUpdated(uint256 newPercentage);
    event E3DStaked(address staker, uint256 amount);
    event E3DWithdrawn(address staker, uint256 amount);
    event E3DRewardDistributed(address recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // Prevents direct contract deployment
    }

    function initialize(address _e3dTokenAddress) public initializer {
        __ERC721_init("E3D NFT", "E3DNFT");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init(); // Initialize ReentrancyGuard
        royaltyPercentage = 10;
        e3dToken = IERC20(_e3dTokenAddress);
        nextTokenId = 1;
        proposalId = 0;
        mintFeeE3D = 100 * 10**18;   // 100 E3D tokens required for minting
        discountForE3DPurchase = 5;  // 5% discount when using E3DToken for purchase
    }

    function mintNFT(string memory metadataURI, address[] memory linkedNFTContracts) public {
        require(e3dToken.balanceOf(msg.sender) >= mintFeeE3D, "Not enough E3D tokens");
        require(e3dToken.allowance(msg.sender, address(this)) >= mintFeeE3D, "Approve E3D tokens first");
        require(e3dToken.transferFrom(msg.sender, address(this), mintFeeE3D), "Transfer failed");

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

    function listNFT(uint256 tokenId, uint256 price) public {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(price > 0, "Price must be greater than zero");
        nftPrices[tokenId] = price;
        emit NFTListed(tokenId, price);
    }

    function buyNFT(uint256 tokenId, bool useE3D) public payable nonReentrant {
        uint256 price = nftPrices[tokenId];
        require(price > 0, "NFT not for sale");

        address seller = ownerOf(tokenId);
        uint256 royaltyRate = getRoyaltyRate(msg.sender);
        uint256 royaltyAmount = (price * royaltyRate) / 100;
        uint256 creatorFee = useE3D ? 0 : (price * 2) / 100; // 🔹 2% fee only if paid with ETH
        uint256 sellerAmount = price - royaltyAmount - creatorFee;
        uint256 rewardAmount = price / 100;

        require(e3dToken.balanceOf(address(this)) >= rewardAmount * 2, "Insufficient E3D for rewards");

        if (useE3D) {
            uint256 discountedPrice = price - (price * discountForE3DPurchase) / 100;
            require(e3dToken.balanceOf(msg.sender) >= discountedPrice, "Not enough E3D tokens");
            require(e3dToken.allowance(msg.sender, address(this)) >= discountedPrice, "Approve E3D tokens first");

            e3dToken.safeTransferFrom(msg.sender, seller, sellerAmount);
            e3dToken.safeTransferFrom(msg.sender, address(this), royaltyAmount);
            distributeRoyalties(tokenId, royaltyAmount);
        } else {
            require(msg.value >= price, "Incorrect ETH amount");
            payable(seller).transfer(sellerAmount);
            payable(owner()).transfer(creatorFee); // 🔹 Only take 2% if paid in ETH
            distributeRoyaltiesETH(tokenId, royaltyAmount);
        }

        e3dToken.safeTransfer(msg.sender, rewardAmount);
        e3dToken.safeTransfer(seller, rewardAmount);

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
}