// web3-utils.js
// Web3 utility functions for MetaMask and contract interactions

let provider = null;
let signer = null;
let userAddress = null;
let contracts = {};

// Initialize ethers.js provider
async function initWeb3() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed!');
  }
  
  provider = new ethers.BrowserProvider(window.ethereum);
  return provider;
}

// Connect to MetaMask
async function connectWallet() {
  try {
    await initWeb3();
    
    // Request account access
    const accounts = await provider.send("eth_requestAccounts", []);
    userAddress = accounts[0];
    
    signer = await provider.getSigner();
    
    // Check if on correct network
    const network = await provider.getNetwork();
    const sepoliaChainId = 11155111n; // Sepolia chain ID as BigInt
    
    if (network.chainId !== sepoliaChainId) {
      await switchToSepolia();
    }
    
    // Initialize contracts
    await initContracts();
    
    return {
      address: userAddress,
      shortAddress: `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
    };
  } catch (error) {
    console.error('Error connecting wallet:', error);
    throw error;
  }
}

// Switch to Sepolia network
async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: NETWORK_CONFIG.chainId }],
    });
  } catch (switchError) {
    // Chain doesn't exist, add it
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: NETWORK_CONFIG.chainId,
          chainName: NETWORK_CONFIG.chainName,
          rpcUrls: [NETWORK_CONFIG.rpcUrl],
          blockExplorerUrls: [NETWORK_CONFIG.blockExplorer]
        }]
      });
    } else {
      throw switchError;
    }
  }
}

// Initialize contract instances
async function initContracts() {
  contracts.usdc = new ethers.Contract(
    CONTRACT_ADDRESSES.MockUSDC,
    CONTRACT_ABIS.MockUSDC,
    signer
  );
  
  contracts.registry = new ethers.Contract(
    CONTRACT_ADDRESSES.InvoiceRegistry,
    CONTRACT_ABIS.InvoiceRegistry,
    signer
  );
  
  contracts.auction = new ethers.Contract(
    CONTRACT_ADDRESSES.AuctionContract,
    CONTRACT_ABIS.AuctionContract,
    signer
  );
  
  contracts.escrow = new ethers.Contract(
    CONTRACT_ADDRESSES.EscrowManager,
    CONTRACT_ABIS.EscrowManager,
    signer
  );
}

// Get user's USDC balance
async function getUSDCBalance(address = userAddress) {
  const balance = await contracts.usdc.balanceOf(address);
  return ethers.formatUnits(balance, 6); // USDC has 6 decimals
}

// Claim test USDC from faucet
async function claimTestUSDC() {
  const tx = await contracts.usdc.faucet();
  await tx.wait();
  return tx.hash;
}

// Format USDC amount for display
function formatUSDC(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

// Parse USDC amount to contract format (6 decimals)
function parseUSDC(amount) {
  return ethers.parseUnits(amount.toString(), 6);
}

// Create invoice
async function createInvoice(buyerAddress, faceValue, daysUntilDue) {
  const faceValueWei = parseUSDC(faceValue);
  const dueDate = Math.floor(Date.now() / 1000) + (daysUntilDue * 24 * 60 * 60);
  
  const tx = await contracts.registry.createInvoice(buyerAddress, faceValueWei, dueDate);
  const receipt = await tx.wait();
  
  // Get invoice ID from event
  const event = receipt.logs.find(log => {
    try {
      return contracts.registry.interface.parseLog(log)?.name === 'InvoiceCreated';
    } catch {
      return false;
    }
  });
  
  if (event) {
    const parsed = contracts.registry.interface.parseLog(event);
    return {
      invoiceId: parsed.args.invoiceId.toString(),
      txHash: tx.hash
    };
  }
  
  return { txHash: tx.hash };
}

// Get invoice details
async function getInvoice(invoiceId) {
  const invoice = await contracts.registry.getInvoice(invoiceId);
  return {
    id: invoice.id.toString(),
    seller: invoice.seller,
    buyer: invoice.buyer,
    faceValue: ethers.formatUnits(invoice.faceValue, 6),
    dueDate: new Date(Number(invoice.dueDate) * 1000),
    status: InvoiceStatus[invoice.status],
    currentOwner: invoice.currentOwner,
    createdAt: new Date(Number(invoice.createdAt) * 1000)
  };
}

// Start auction
async function startAuction(invoiceId, minBidPercent = 90, durationHours = 24) {
  const durationSeconds = durationHours * 60 * 60;
  const tx = await contracts.auction.startAuction(invoiceId, minBidPercent, durationSeconds);
  const receipt = await tx.wait();
  
  // Get auction ID from event
  const event = receipt.logs.find(log => {
    try {
      return contracts.auction.interface.parseLog(log)?.name === 'AuctionCreated';
    } catch {
      return false;
    }
  });
  
  if (event) {
    const parsed = contracts.auction.interface.parseLog(event);
    return {
      auctionId: parsed.args.auctionId.toString(),
      txHash: tx.hash
    };
  }
  
  return { txHash: tx.hash };
}

// Get auction details
async function getAuction(auctionId) {
  const auction = await contracts.auction.getAuction(auctionId);
  return {
    invoiceId: auction.invoiceId.toString(),
    seller: auction.seller,
    faceValue: ethers.formatUnits(auction.faceValue, 6),
    minBid: ethers.formatUnits(auction.minBid, 6),
    startTime: new Date(Number(auction.startTime) * 1000),
    endTime: new Date(Number(auction.endTime) * 1000),
    highestBidder: auction.highestBidder,
    highestBid: ethers.formatUnits(auction.highestBid, 6),
    active: auction.active,
    settled: auction.settled,
    timeRemaining: Math.max(0, Number(auction.endTime) - Math.floor(Date.now() / 1000))
  };
}

// Approve USDC spending
async function approveUSDC(spenderAddress, amount) {
  const amountWei = parseUSDC(amount);
  const tx = await contracts.usdc.approve(spenderAddress, amountWei);
  await tx.wait();
  return tx.hash;
}

// Place bid
async function placeBid(auctionId, bidAmount) {
  // First check allowance
  const allowance = await contracts.usdc.allowance(userAddress, CONTRACT_ADDRESSES.AuctionContract);
  const bidAmountWei = parseUSDC(bidAmount);
  
  // If allowance is insufficient, approve first
  if (allowance < bidAmountWei) {
    await approveUSDC(CONTRACT_ADDRESSES.AuctionContract, bidAmount);
  }
  
  const tx = await contracts.auction.placeBid(auctionId, bidAmountWei);
  await tx.wait();
  return tx.hash;
}

// Settle auction
async function settleAuction(auctionId) {
  const tx = await contracts.auction.settleAuction(auctionId);
  await tx.wait();
  return tx.hash;
}

// Get all auctions (simplified - gets recent auctions)
async function getAllAuctions() {
  const auctionCount = await contracts.auction.auctionCount();
  const auctions = [];
  
  // Get last 10 auctions
  const start = Math.max(1, Number(auctionCount) - 9);
  for (let i = start; i <= Number(auctionCount); i++) {
    try {
      const auction = await getAuction(i);
      auction.id = i;
      auctions.push(auction);
    } catch (error) {
      console.error(`Error fetching auction ${i}:`, error);
    }
  }
  
  return auctions.reverse(); // Most recent first
}

// Get user's invoices
async function getUserInvoices(address = userAddress) {
  const invoiceIds = await contracts.registry.getSellerInvoices(address);
  const invoices = [];
  
  for (const id of invoiceIds) {
    try {
      const invoice = await getInvoice(id);
      invoices.push(invoice);
    } catch (error) {
      console.error(`Error fetching invoice ${id}:`, error);
    }
  }
  
  return invoices;
}

// Format time remaining
function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Ended';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 400px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Export functions
if (typeof window !== 'undefined') {
  window.web3Utils = {
    connectWallet,
    getUSDCBalance,
    claimTestUSDC,
    formatUSDC,
    parseUSDC,
    createInvoice,
    getInvoice,
    startAuction,
    getAuction,
    placeBid,
    settleAuction,
    getAllAuctions,
    getUserInvoices,
    formatTimeRemaining,
    showNotification,
    get userAddress() { return userAddress; },
    get contracts() { return contracts; }
  };
}