// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library AgentIdentityLib {
    struct AgentIdentity {
        address tokenAddress;
        string registrationURI;
        uint256 reputationScore;
        uint256 totalFundingE3D;
        uint8 validationLevel;
        uint256 activatedTimestamp;
        bool isActive;
        uint256 taskCompletionCount;
        uint256 lastActivityTimestamp;
    }

    function updateReputation(AgentIdentity storage agent, uint256 newScore) internal {
        require(newScore <= 10000, "Invalid score");
        agent.reputationScore = newScore;
    }

    function recordFunding(AgentIdentity storage agent, uint256 amount) internal {
        agent.totalFundingE3D += amount;
        agent.lastActivityTimestamp = block.timestamp;
    }

    function recordActivity(AgentIdentity storage agent) internal {
        agent.taskCompletionCount += 1;
        agent.lastActivityTimestamp = block.timestamp;
    }

    function getDaysSince(uint256 timestamp) internal view returns (uint256) {
        return timestamp > 0 ? (block.timestamp - timestamp) / 1 days : 0;
    }
}
