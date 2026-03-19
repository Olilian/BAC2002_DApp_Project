// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testnet deployment
 * @dev ERC20 stablecoin with 6 decimals (matching real USDC)
 */
contract MockUSDC is ERC20, Ownable {
    
    // USDC uses 6 decimals (not 18 like most tokens)
    uint8 private constant DECIMALS = 6;
    
    constructor() ERC20("USD Coin", "USDC") Ownable(msg.sender) {
        // Mint initial supply to deployer (1 million USDC)
        _mint(msg.sender, 1_000_000 * 10**DECIMALS);
    }
    
    /**
     * @notice Override decimals to match real USDC (6 decimals)
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Mint new tokens (testnet only - for getting test USDC)
     * @param to Address to receive tokens
     * @param amount Amount to mint (in base units, e.g., 1000000 = 1 USDC)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @notice Faucet function - anyone can claim 1000 USDC for testing
     * @dev Remove this in production, only for POC
     */
    function faucet() external {
        require(balanceOf(msg.sender) < 10_000 * 10**DECIMALS, "Already have enough USDC");
        _mint(msg.sender, 1_000 * 10**DECIMALS); // Mint 1000 USDC
    }
}
