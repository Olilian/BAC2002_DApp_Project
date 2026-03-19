// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("Starting deployment to", hre.network.name);
  
  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");
  
  // 1. Deploy MockUSDC
  console.log("1.Deploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);
  
  // 2. Deploy InvoiceRegistry
  console.log("\n2.Deploying InvoiceRegistry...");
  const InvoiceRegistry = await hre.ethers.getContractFactory("InvoiceRegistry");
  const registry = await InvoiceRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("InvoiceRegistry deployed to:", registryAddress);
  
  // 3. Deploy AuctionContract
  console.log("\n3. Deploying AuctionContract...");
  const AuctionContract = await hre.ethers.getContractFactory("AuctionContract");
  const auction = await AuctionContract.deploy(usdcAddress, registryAddress);
  await auction.waitForDeployment();
  const auctionAddress = await auction.getAddress();
  console.log("AuctionContract deployed to:", auctionAddress);
  
  // 4. Deploy EscrowManager
  console.log("\n4. Deploying EscrowManager...");
  const EscrowManager = await hre.ethers.getContractFactory("EscrowManager");
  const escrow = await EscrowManager.deploy(usdcAddress, registryAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("EscrowManager deployed to:", escrowAddress);
  
  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("\nContract Addresses:");
  console.log("├─ MockUSDC:         ", usdcAddress);
  console.log("├─ InvoiceRegistry:  ", registryAddress);
  console.log("├─ AuctionContract:  ", auctionAddress);
  console.log("└─ EscrowManager:    ", escrowAddress);
  console.log("=".repeat(60));
  
  // Save addresses to file for frontend
  const fs = require('fs');
  const addresses = {
    network: hre.network.name,
    MockUSDC: usdcAddress,
    InvoiceRegistry: registryAddress,
    AuctionContract: auctionAddress,
    EscrowManager: escrowAddress,
    deployedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(
    'deployed-addresses.json',
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nAddresses saved to deployed-addresses.json");
  
  // Wait for Etherscan verification
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    await usdc.deploymentTransaction().wait(6);
    
    console.log("\nVerifying contracts on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: usdcAddress,
        constructorArguments: [],
      });
      console.log("MockUSDC verified");
    } catch (error) {
      console.log("MockUSDC verification failed:", error.message);
    }
    
    try {
      await hre.run("verify:verify", {
        address: registryAddress,
        constructorArguments: [],
      });
      console.log("InvoiceRegistry verified");
    } catch (error) {
      console.log("InvoiceRegistry verification failed:", error.message);
    }
    
    try {
      await hre.run("verify:verify", {
        address: auctionAddress,
        constructorArguments: [usdcAddress, registryAddress],
      });
      console.log("AuctionContract verified");
    } catch (error) {
      console.log("AuctionContract verification failed:", error.message);
    }
    
    try {
      await hre.run("verify:verify", {
        address: escrowAddress,
        constructorArguments: [usdcAddress, registryAddress],
      });
      console.log("EscrowManager verified");
    } catch (error) {
      console.log("EscrowManager verification failed:", error.message);
    }
  }
  
  console.log("\nDeployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
