// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract E3DToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    constructor(address initialOwner)
        ERC20("E3DToken", "E3D")
        ERC20Permit("E3DToken")
        Ownable(initialOwner)
    {
        _mint(initialOwner, 1000000 * 10 ** decimals()); // Initial supply: 1,000,000 E3D
    }
}
