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
import "./AgentIdentityLib.sol";

contract E3DNFTManager is Initializable, ERC721URIStorageUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, IERC2981 {
    using SafeERC20 for IERC20;
    using AgentIdentityLib for AgentIdentityLib.AgentIdentity;

    error RateMustBePositive();
    error NotEnoughE3DTokens();
    error ApproveE3DTokensFirst();
    error TransferFailed();
    error NotOwner();
    error PriceMustBeGreaterThanZero();
    error NFTNotListed();
    error NFTNotForSale();
    error InsufficientETHSent();
    error CannotStakeZero();
    error InvalidWithdrawAmount();
    error CannotExceed50Percent();
    error MustHoldAtLeast100E3DTokens();
    error AlreadyVoted();
    error NotEnoughVotes();
    error FeeOutOfBounds();
    error CannotExceed10Percent();
    error TooSoonToDistributeAgain();
    error InvalidTier();
    error NotAgentNFT();
    error InvalidTokenAddress();
    error RegistrationURIRequired();
    error AgentAlreadyExistsForToken();
    error InsufficientE3DForActivation();
    error InvalidLevel();
    error InvalidFee();

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

    // Subscription related variables
    enum SubscriptionTier { None, Monthly, Annual }
    
    struct SubscriptionDetails {
        SubscriptionTier tier;
        uint256 expirationTimestamp;
        uint256 remainingFreeMints;
        bool paidWithE3D;
    }
    
    mapping(address => SubscriptionDetails) public subscriptions;
    
    // Subscription pricing in ETH and E3D
    uint256 public monthlyPriceETH;     // in wei
    uint256 public yearlyPriceETH;      // in wei
    uint256 public monthlyPriceE3D;     // in E3D tokens (50% discount)
    uint256 public yearlyPriceE3D;      // in E3D tokens (50% discount)
    uint256 public monthlyFreeMints;    // Free mints with monthly subscription
    uint256 public yearlyFreeMints;     // Free mints with yearly subscription

    // ===== Agent Identity (ERC-8004) Storage =====
    mapping(uint256 => AgentIdentityLib.AgentIdentity) public agentIdentities;
    mapping(address => uint256) public tokenToAgentNFT;  // token address => NFT ID
    uint256 public agentActivationFee;  // Fee in E3D to activate an agent (default 100 E3D)

    event NFTMinted(uint256 indexed tokenId, address indexed creator, string metadataURI);
    event AgentIdentityMinted(uint256 indexed tokenId, address indexed tokenAddress, address indexed activator, string registrationURI);
    event AgentReputationUpdated(uint256 indexed tokenId, uint256 newScore);
    event AgentFundingRecorded(uint256 indexed tokenId, uint256 amount, uint256 newTotal);
    event AgentValidationUpdated(uint256 indexed tokenId, uint8 newLevel);
    event AgentActivityRecorded(uint256 indexed tokenId, uint256 timestamp);
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
    
    // Subscription related events
    event SubscriptionPurchased(address subscriber, SubscriptionTier tier, bool paidWithE3D, uint256 expiryTime);
    event FreeMintUsed(address subscriber, uint256 remainingFreeMints);
    event SubscriptionRenewed(address subscriber, SubscriptionTier tier, uint256 newExpiryTime);
    event SubscriptionPriceUpdated(SubscriptionTier tier, bool isPriceInE3D, uint256 price);
    event FreeMintsUpdated(SubscriptionTier tier, uint256 freeMints);

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
        
        // Initialize subscription prices and free mints
        monthlyPriceETH = 0.003 ether;    // $3 in ETH
        yearlyPriceETH = 0.02 ether;      // $20 in ETH
        monthlyPriceE3D = convertETHtoE3D(monthlyPriceETH) / 2; // 50% discount in E3D
        yearlyPriceE3D = convertETHtoE3D(yearlyPriceETH) / 2;  // 50% discount in E3D
        monthlyFreeMints = 3;             // 3 free mints per month
        yearlyFreeMints = 40;             // 40 free mints per year

        // Initialize agent activation fee
        agentActivationFee = 100 * 10**18; // 100 E3D
    }

    function setE3DPerETH(uint256 newRate) external onlyOwner {
        if (newRate == 0) revert RateMustBePositive();
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
        // Check if user has an active subscription with free mints
        if (subscriptions[msg.sender].expirationTimestamp > block.timestamp && 
            subscriptions[msg.sender].remainingFreeMints > 0) {
            
            // Use a free mint from subscription
            subscriptions[msg.sender].remainingFreeMints--;
            
            // Mint NFT using a function local variable
            uint256 freeTokenId = nextTokenId++;
            _safeMint(msg.sender, freeTokenId);
            _setTokenURI(freeTokenId, metadataURI);
            
            nftData[freeTokenId] = NFTInfo({
                creator: msg.sender,
                metadataURI: metadataURI,
                linkedNFTContracts: linkedNFTContracts
            });
            
            emit NFTMinted(freeTokenId, msg.sender, metadataURI);
            emit FreeMintUsed(msg.sender, subscriptions[msg.sender].remainingFreeMints);
            return;
        }
        
        // If no subscription or no free mints left, proceed with normal minting
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

        if (e3dToken.balanceOf(msg.sender) < finalFee) revert NotEnoughE3DTokens();
        if (e3dToken.allowance(msg.sender, address(this)) < finalFee) revert ApproveE3DTokensFirst();
        if (!e3dToken.transferFrom(msg.sender, address(this), finalFee)) revert TransferFailed();

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
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (price == 0) revert PriceMustBeGreaterThanZero();
        nftPrices[tokenId] = price;
        isPriceInE3D[tokenId] = inE3D;
        emit NFTListed(tokenId, price, inE3D);
    }

    function unlistNFT(uint256 tokenId) public {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (nftPrices[tokenId] == 0) revert NFTNotListed();
        delete nftPrices[tokenId];
        emit NFTUnlisted(tokenId);
    }

    function buyNFT(uint256 tokenId, bool useE3D) public payable nonReentrant {
        uint256 price = nftPrices[tokenId];
        if (price == 0) revert NFTNotForSale();

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

            if (e3dToken.balanceOf(msg.sender) < discounted) revert NotEnoughE3DTokens();
            if (e3dToken.allowance(msg.sender, address(this)) < discounted) revert ApproveE3DTokensFirst();

            e3dToken.safeTransferFrom(msg.sender, seller, sellerAmount);
            e3dToken.safeTransferFrom(msg.sender, address(this), royaltyAmount);
            distributeRoyalties(tokenId, royaltyAmount);
        } else {
            uint256 ethAmount = priceInE3D ? convertE3DtoETH(price) : price;
            royaltyAmount = (ethAmount * royaltyPercentage) / 100;
            sellerAmount = ethAmount - royaltyAmount;

            if (msg.value < ethAmount) revert InsufficientETHSent();
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
        if (amount == 0) revert CannotStakeZero();
        e3dToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedE3D[msg.sender] += amount;
        emit E3DStaked(msg.sender, amount);
    }

    function withdrawStake(uint256 amount) external {
        if (amount == 0 || amount > stakedE3D[msg.sender]) revert InvalidWithdrawAmount();
        stakedE3D[msg.sender] -= amount;
        e3dToken.safeTransfer(msg.sender, amount);
        emit E3DWithdrawn(msg.sender, amount);
    }

    function setRoyaltyPercentage(uint256 newPercentage) external onlyOwner {
        if (newPercentage > 50) revert CannotExceed50Percent();
        royaltyPercentage = newPercentage;
        emit RoyaltyPercentageUpdated(royaltyPercentage);
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view override 
        returns (address receiver, uint256 royaltyAmount) {
        return (nftData[tokenId].creator, (salePrice * royaltyPercentage) / 100);
    }

    function getRoyaltyRate(address user) public view returns (uint256) {
        if (stakedE3D[user] >= 1000 * 10**18) return 5; // 5% royalty
        if (stakedE3D[user] >= 500 * 10**18) return 7; // 7% royalty
        return 10; // Default 10%
    }

    function setMintFee(uint256 newFee) external onlyOwner {
        if (newFee < 10 * 10**18 || newFee > 1000 * 10**18) revert FeeOutOfBounds();
        mintFeeE3D = newFee;
        emit MintFeeUpdated(mintFeeE3D);
    }

    function setStakingRewardRate(uint256 newRate) external onlyOwner {
        if (newRate > 10) revert CannotExceed10Percent();
        rewardRateStaking = newRate;
        emit StakingRewardRateUpdated(rewardRateStaking);
    }

    function setNFTRewardRate(uint256 newRate) external onlyOwner {
        if (newRate > 10) revert CannotExceed10Percent();
        rewardRateNFT = newRate;
        emit NFTRewardRateUpdated(rewardRateNFT);
    }

    function getLinkedNFTContracts(uint256 tokenId) public view returns (address[] memory) {
        return nftData[tokenId].linkedNFTContracts;
    }

    /**
     * @dev Update subscription prices and free mint amounts
     * @param _monthlyETH Monthly subscription price in ETH
     * @param _yearlyETH Yearly subscription price in ETH
     * @param _monthlyMints Number of free mints with monthly subscription
     * @param _yearlyMints Number of free mints with yearly subscription
     */
    function setSubscriptionPrices(
        uint256 _monthlyETH,
        uint256 _yearlyETH,
        uint256 _monthlyMints,
        uint256 _yearlyMints
    ) public onlyOwner {
        monthlyPriceETH = _monthlyETH;
        yearlyPriceETH = _yearlyETH;
        monthlyPriceE3D = convertETHtoE3D(_monthlyETH) / 2; // 50% discount
        yearlyPriceE3D = convertETHtoE3D(_yearlyETH) / 2;   // 50% discount
        monthlyFreeMints = _monthlyMints;
        yearlyFreeMints = _yearlyMints;
        
        emit SubscriptionPriceUpdated(SubscriptionTier.Monthly, false, monthlyPriceETH);
        emit SubscriptionPriceUpdated(SubscriptionTier.Monthly, true, monthlyPriceE3D);
        emit SubscriptionPriceUpdated(SubscriptionTier.Annual, false, yearlyPriceETH);
        emit SubscriptionPriceUpdated(SubscriptionTier.Annual, true, yearlyPriceE3D);
        emit FreeMintsUpdated(SubscriptionTier.Monthly, monthlyFreeMints);
        emit FreeMintsUpdated(SubscriptionTier.Annual, yearlyFreeMints);
    }

    /**
     * @dev Subscribe with ETH
     * @param _tier Subscription tier (1 = Monthly, 2 = Annual)
     */
    function subscribeWithETH(SubscriptionTier _tier) public payable {
        if (_tier != SubscriptionTier.Monthly && _tier != SubscriptionTier.Annual) revert InvalidTier();
        
        uint256 requiredAmount = _tier == SubscriptionTier.Monthly ? monthlyPriceETH : yearlyPriceETH;
        if (msg.value < requiredAmount) revert InsufficientETHSent();
        
        uint256 duration = _tier == SubscriptionTier.Monthly ? 30 days : 365 days;
        uint256 freeMints = _tier == SubscriptionTier.Monthly ? monthlyFreeMints : yearlyFreeMints;
        
        // If subscription exists and hasn't expired, add to it rather than replace
        if (subscriptions[msg.sender].expirationTimestamp > block.timestamp) {
            subscriptions[msg.sender].expirationTimestamp += duration;
            subscriptions[msg.sender].remainingFreeMints += freeMints;
            
            emit SubscriptionRenewed(msg.sender, _tier, subscriptions[msg.sender].expirationTimestamp);
        } else {
            subscriptions[msg.sender] = SubscriptionDetails({
                tier: _tier,
                expirationTimestamp: block.timestamp + duration,
                remainingFreeMints: freeMints,
                paidWithE3D: false
            });
            
            emit SubscriptionPurchased(msg.sender, _tier, false, block.timestamp + duration);
        }
        
        // Refund excess ETH if any
        uint256 excess = msg.value - requiredAmount;
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }
    }

    /**
     * @dev Subscribe with E3D Tokens (50% discount)
     * @param _tier Subscription tier (1 = Monthly, 2 = Annual)
     */
    function subscribeWithE3D(SubscriptionTier _tier) public {
        if (_tier != SubscriptionTier.Monthly && _tier != SubscriptionTier.Annual) revert InvalidTier();
        
        uint256 requiredAmount = _tier == SubscriptionTier.Monthly ? monthlyPriceE3D : yearlyPriceE3D;
        
        // Transfer E3D tokens from user to contract
        if (e3dToken.balanceOf(msg.sender) < requiredAmount) revert NotEnoughE3DTokens();
        if (e3dToken.allowance(msg.sender, address(this)) < requiredAmount) revert ApproveE3DTokensFirst();
        if (!e3dToken.transferFrom(msg.sender, address(this), requiredAmount)) revert TransferFailed();
        
        uint256 duration = _tier == SubscriptionTier.Monthly ? 30 days : 365 days;
        uint256 freeMints = _tier == SubscriptionTier.Monthly ? monthlyFreeMints : yearlyFreeMints;
        
        // If subscription exists and hasn't expired, add to it rather than replace
        if (subscriptions[msg.sender].expirationTimestamp > block.timestamp) {
            subscriptions[msg.sender].expirationTimestamp += duration;
            subscriptions[msg.sender].remainingFreeMints += freeMints;
            
            emit SubscriptionRenewed(msg.sender, _tier, subscriptions[msg.sender].expirationTimestamp);
        } else {
            subscriptions[msg.sender] = SubscriptionDetails({
                tier: _tier,
                expirationTimestamp: block.timestamp + duration,
                remainingFreeMints: freeMints,
                paidWithE3D: true
            });
            
            emit SubscriptionPurchased(msg.sender, _tier, true, block.timestamp + duration);
        }
    }

    /**
     * @dev View function to check subscription status
     * @param user Address to check subscription status for
     * @return tier Subscription tier
     * @return expiration Subscription expiration timestamp
     * @return remainingMints Number of free mints remaining
     * @return isActive Whether the subscription is active
     */
    function getSubscriptionDetails(address user) public view returns (
        SubscriptionTier tier,
        uint256 expiration,
        uint256 remainingMints,
        bool isActive
    ) {
        SubscriptionDetails memory sub = subscriptions[user];
        bool active = sub.expirationTimestamp > block.timestamp;
        
        return (
            active ? sub.tier : SubscriptionTier.None,
            sub.expirationTimestamp,
            active ? sub.remainingFreeMints : 0,
            active
        );
    }

    /**
     * @dev Check if an address has an active subscription
     * @param user Address to check
     * @return True if subscription is active, false otherwise
     */
    function hasActiveSubscription(address user) public view returns (bool) {
        return subscriptions[user].expirationTimestamp > block.timestamp;
    }

    // ===== Agent Identity (ERC-8004) Functions =====

    modifier agentExists(uint256 tokenId) {
        if (agentIdentities[tokenId].tokenAddress == address(0)) revert NotAgentNFT();
        _;
    }

    function mintAgentIdentity(
        address tokenAddress,
        string calldata registrationURI
    ) external returns (uint256) {
        if (tokenAddress == address(0)) revert InvalidTokenAddress();
        if (bytes(registrationURI).length == 0) revert RegistrationURIRequired();
        if (tokenToAgentNFT[tokenAddress] != 0) revert AgentAlreadyExistsForToken();

        // Burn activation fee in E3D (creates scarcity)
        if (e3dToken.balanceOf(msg.sender) < agentActivationFee) revert InsufficientE3DForActivation();
        if (e3dToken.allowance(msg.sender, address(this)) < agentActivationFee) revert ApproveE3DTokensFirst();
        if (!e3dToken.transferFrom(msg.sender, address(this), agentActivationFee)) revert TransferFailed();

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, registrationURI);

        // Initialize agent identity data
        agentIdentities[tokenId] = AgentIdentityLib.AgentIdentity({
            tokenAddress: tokenAddress,
            registrationURI: registrationURI,
            reputationScore: 5000,
            totalFundingE3D: 0,
            validationLevel: 0,
            activatedTimestamp: block.timestamp,
            isActive: true,
            taskCompletionCount: 0,
            lastActivityTimestamp: block.timestamp
        });

        tokenToAgentNFT[tokenAddress] = tokenId;

        emit AgentIdentityMinted(tokenId, tokenAddress, msg.sender, registrationURI);
        return tokenId;
    }

    function updateAgentReputation(uint256 tokenId, uint256 newScore) external onlyOwner agentExists(tokenId) {
        agentIdentities[tokenId].updateReputation(newScore);
        emit AgentReputationUpdated(tokenId, newScore);
    }

    function recordAgentFunding(uint256 tokenId, uint256 amount) external onlyOwner agentExists(tokenId) {
        agentIdentities[tokenId].recordFunding(amount);
        emit AgentFundingRecorded(tokenId, amount, agentIdentities[tokenId].totalFundingE3D);
    }

    function updateAgentValidation(uint256 tokenId, uint8 level) external onlyOwner agentExists(tokenId) {
        if (level > 3) revert InvalidLevel();
        agentIdentities[tokenId].validationLevel = level;
        emit AgentValidationUpdated(tokenId, level);
    }

    function recordAgentActivity(uint256 tokenId) external onlyOwner agentExists(tokenId) {
        agentIdentities[tokenId].recordActivity();
        emit AgentActivityRecorded(tokenId, block.timestamp);
    }

    function setAgentActive(uint256 tokenId, bool active) external onlyOwner agentExists(tokenId) {
        agentIdentities[tokenId].isActive = active;
    }

    function setAgentActivationFee(uint256 newFee) external onlyOwner {
        if (newFee < 1 * 10**18 || newFee > 10000 * 10**18) revert InvalidFee();
        agentActivationFee = newFee;
    }

    function getAgentByTokenAddress(address tokenAddress) external view returns (
        uint256 tokenId,
        AgentIdentityLib.AgentIdentity memory identity
    ) {
        tokenId = tokenToAgentNFT[tokenAddress];
        if (tokenId > 0) identity = agentIdentities[tokenId];
    }

    function getAgentStats(uint256 tokenId) external view agentExists(tokenId) returns (
        address tokenAddress,
        uint256 reputationScore,
        uint256 totalFunding,
        uint8 validationLevel,
        uint256 tasksCompleted,
        bool isActive,
        uint256 daysSinceActivation,
        uint256 daysSinceLastActivity
    ) {
        AgentIdentityLib.AgentIdentity memory agent = agentIdentities[tokenId];
        return (
            agent.tokenAddress,
            agent.reputationScore,
            agent.totalFundingE3D,
            agent.validationLevel,
            agent.taskCompletionCount,
            agent.isActive,
            (block.timestamp - agent.activatedTimestamp) / 1 days,
            agent.lastActivityTimestamp > 0 ? (block.timestamp - agent.lastActivityTimestamp) / 1 days : 0
        );
    }
}
