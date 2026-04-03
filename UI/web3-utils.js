// web3-utils.js
// Web3 utility functions for MetaMask and contract interactions
// Compatible with ethers.js v6

let provider = null;
let signer = null;
let userAddress = null;
let contracts = {};

// ─── Initialize ethers.js v6 provider ───────────────────────────────────────
async function initWeb3() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed!');
  }
  // v6: BrowserProvider (replaces v5's ethers.providers.Web3Provider)
  provider = new ethers.BrowserProvider(window.ethereum);
  return provider;
}

// ─── Connect to MetaMask ─────────────────────────────────────────────────────
async function connectWallet() {
  try {
    await initWeb3();

    // Request account access
    const accounts = await provider.send("eth_requestAccounts", []);
    userAddress = accounts[0];

    // v6: getSigner() is async
    signer = await provider.getSigner();

    // Check if on correct network
    const network = await provider.getNetwork();
    const sepoliaChainId = 11155111n; // v6: chainId is a BigInt

    if (network.chainId !== sepoliaChainId) {
      await switchToSepolia();
      // Re-init provider and signer after network switch
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
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

// ─── Switch to Sepolia network ───────────────────────────────────────────────
async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: NETWORK_CONFIG.chainId }],
    });
  } catch (switchError) {
    // Chain doesn't exist in MetaMask yet, add it
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

// ─── Initialize contract instances ──────────────────────────────────────────
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

// ─── Get user's USDC balance ─────────────────────────────────────────────────
async function getUSDCBalance(address = userAddress) {
  const balance = await contracts.usdc.balanceOf(address);
  // v6: ethers.formatUnits() is a top-level function
  return ethers.formatUnits(balance, 6);
}

// ─── Claim test USDC from faucet ────────────────────────────────────────────
async function claimTestUSDC() {
  const tx = await contracts.usdc.faucet();
  await tx.wait();
  return tx.hash;
}

// ─── Format USDC amount for display ─────────────────────────────────────────
function formatUSDC(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

// ─── Parse USDC amount to contract format (6 decimals) ──────────────────────
function parseUSDC(amount) {
  // v6: ethers.parseUnits() is a top-level function
  return ethers.parseUnits(amount.toString(), 6);
}

// ─── Create invoice ──────────────────────────────────────────────────────────
async function createInvoice(buyerAddress, faceValue, daysUntilDue) {
  const faceValueWei = parseUSDC(faceValue);
  const dueDate = Math.floor(Date.now() / 1000) + (daysUntilDue * 24 * 60 * 60);

  const tx = await contracts.registry.createInvoice(buyerAddress, faceValueWei, dueDate);
  const receipt = await tx.wait();

  // Get invoice ID from InvoiceCreated event
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

// ─── Get invoice details ─────────────────────────────────────────────────────
async function getInvoice(invoiceId) {
  const invoice = await contracts.registry.getInvoice(invoiceId);
  return {
    id: invoice.id.toString(),
    seller: invoice.seller,
    buyer: invoice.buyer,
    faceValue: ethers.formatUnits(invoice.faceValue, 6),
    // v6: contract BigInt fields — use Number() for timestamp conversion
    dueDate: new Date(Number(invoice.dueDate) * 1000),
    status: InvoiceStatus[invoice.status],
    currentOwner: invoice.currentOwner,
    createdAt: new Date(Number(invoice.createdAt) * 1000)
  };
}

// ─── Start auction ───────────────────────────────────────────────────────────
async function startAuction(invoiceId, minBidPercent = 90, durationMinutes = 60) {
  // Validate duration before sending — contract now allows >= 1 minute
  if (durationMinutes < 1) throw new Error('Auction duration must be at least 1 minute');
  if (durationMinutes > 10080) throw new Error('Auction duration must not exceed 10080 minutes (7 days)');

  const durationSeconds = durationMinutes * 60;
  const tx = await contracts.auction.startAuction(invoiceId, minBidPercent, durationSeconds);
  const receipt = await tx.wait();

  // Get auction ID from AuctionCreated event
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

// ─── Get auction details ─────────────────────────────────────────────────────
async function getAuction(auctionId) {
  const auction = await contracts.auction.getAuction(auctionId);
  const endTime = Number(auction.endTime);
  return {
    invoiceId: auction.invoiceId.toString(),
    seller: auction.seller,
    faceValue: ethers.formatUnits(auction.faceValue, 6),
    minBid: ethers.formatUnits(auction.minBid, 6),
    startTime: new Date(Number(auction.startTime) * 1000),
    endTime: new Date(endTime * 1000),
    highestBidder: auction.highestBidder,
    highestBid: ethers.formatUnits(auction.highestBid, 6),
    active: auction.active,
    settled: auction.settled,
    timeRemaining: Math.max(0, endTime - Math.floor(Date.now() / 1000))
  };
}

// ─── Get auction directly by invoice ID ─────────────────────────────────────
// Avoids iterating all auctions — uses the invoiceToAuction mapping on-chain
async function getAuctionByInvoice(invoiceId) {
  const auction = await contracts.auction.getAuctionByInvoice(invoiceId);
  const auctionId = await contracts.auction.invoiceToAuction(invoiceId);
  const endTime = Number(auction.endTime);
  return {
    id: Number(auctionId),
    invoiceId: auction.invoiceId.toString(),
    seller: auction.seller,
    faceValue: ethers.formatUnits(auction.faceValue, 6),
    minBid: ethers.formatUnits(auction.minBid, 6),
    startTime: new Date(Number(auction.startTime) * 1000),
    endTime: new Date(endTime * 1000),
    highestBidder: auction.highestBidder,
    highestBid: ethers.formatUnits(auction.highestBid, 6),
    active: auction.active,
    settled: auction.settled,
    timeRemaining: Math.max(0, endTime - Math.floor(Date.now() / 1000))
  };
}

// ─── Approve USDC spending ───────────────────────────────────────────────────
async function approveUSDC(spenderAddress, amount) {
  const amountWei = parseUSDC(amount);
  const tx = await contracts.usdc.approve(spenderAddress, amountWei);
  await tx.wait();
  return tx.hash;
}

// ─── Place bid ───────────────────────────────────────────────────────────────
async function placeBid(auctionId, bidAmount) {
  const bidAmountWei = parseUSDC(bidAmount);

  // Check current allowance — v6 returns BigInt so use < directly
  const allowance = await contracts.usdc.allowance(userAddress, CONTRACT_ADDRESSES.AuctionContract);
  if (allowance < bidAmountWei) {
    await approveUSDC(CONTRACT_ADDRESSES.AuctionContract, bidAmount);
  }

  const tx = await contracts.auction.placeBid(auctionId, bidAmountWei);
  await tx.wait();
  return tx.hash;
}

// ─── Settle auction (callable by anyone after auction ends) ──────────────────
async function settleAuction(auctionId) {
  const tx = await contracts.auction.settleAuction(auctionId);
  await tx.wait();
  return tx.hash;
}

// ─── Cancel auction (seller only, only if no bids placed) ────────────────────
async function cancelAuction(auctionId) {
  const tx = await contracts.auction.cancelAuction(auctionId);
  await tx.wait();
  return tx.hash;
}

// ─── Create escrow (LP calls this after winning the auction) ─────────────────
async function createEscrow(invoiceId, beneficiaryAddress) {
  const tx = await contracts.escrow.createEscrow(invoiceId, beneficiaryAddress);
  await tx.wait();
  return tx.hash;
}

// ─── Pay invoice (buyer/debtor calls at maturity) ────────────────────────────
async function payInvoice(invoiceId, amount) {
  const amountWei = parseUSDC(amount);

  // Approve EscrowManager to pull face value from buyer's wallet
  const allowance = await contracts.usdc.allowance(userAddress, CONTRACT_ADDRESSES.EscrowManager);
  if (allowance < amountWei) {
    await approveUSDC(CONTRACT_ADDRESSES.EscrowManager, amount);
  }

  const tx = await contracts.escrow.payInvoice(invoiceId);
  await tx.wait();
  return tx.hash;
}

// ─── Release payment manually (beneficiary or buyer, if auto-release fails) ──
async function releasePayment(invoiceId) {
  const tx = await contracts.escrow.releasePayment(invoiceId);
  await tx.wait();
  return tx.hash;
}

// ─── Get escrow details ──────────────────────────────────────────────────────
async function getEscrow(invoiceId) {
  const escrow = await contracts.escrow.getEscrow(invoiceId);
  return {
    invoiceId: escrow.invoiceId.toString(),
    buyer: escrow.buyer,
    beneficiary: escrow.beneficiary,
    amount: ethers.formatUnits(escrow.amount, 6),
    dueDate: new Date(Number(escrow.dueDate) * 1000),
    paid: escrow.paid,
    released: escrow.released
  };
}

// ─── Check if invoice is paid ────────────────────────────────────────────────
async function isInvoicePaid(invoiceId) {
  return await contracts.escrow.isPaid(invoiceId);
}

// ─── Check if payment is released to LP ─────────────────────────────────────
async function isPaymentReleased(invoiceId) {
  return await contracts.escrow.isReleased(invoiceId);
}

// ─── Get all auctions (last 10, most recent first) ───────────────────────────
async function getAllAuctions() {
  const auctionCount = Number(await contracts.auction.auctionCount());
  const auctions = [];

  const start = Math.max(1, auctionCount - 9);
  for (let i = start; i <= auctionCount; i++) {
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

// ─── Get user's invoices (parallel fetch) ────────────────────────────────────
async function getUserInvoices(address = userAddress) {
  const invoiceIds = await contracts.registry.getSellerInvoices(address);
  const invoices = await Promise.all(
    invoiceIds.map(id =>
      getInvoice(id).catch(err => {
        console.error(`Error fetching invoice ${id}:`, err);
        return null;
      })
    )
  );
  return invoices.filter(Boolean); // Drop any failed fetches
}

// ─── Format time remaining ───────────────────────────────────────────────────
function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Ended';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// ─── Show notification ───────────────────────────────────────────────────────
function showNotification(message, type = 'info') {
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
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// ─── Notification animation CSS ──────────────────────────────────────────────
const notifStyle = document.createElement('style');
notifStyle.textContent = `
  @keyframes slideIn {
    from { transform: translateX(420px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0);    opacity: 1; }
    to   { transform: translateX(420px); opacity: 0; }
  }
`;
document.head.appendChild(notifStyle);

// ─── Export all utilities to window.web3Utils ────────────────────────────────
if (typeof window !== 'undefined') {
  window.web3Utils = {
    // Wallet
    connectWallet,
    // USDC
    getUSDCBalance,
    claimTestUSDC,
    approveUSDC,
    // Formatting helpers
    formatUSDC,
    parseUSDC,
    formatTimeRemaining,
    // Invoices
    createInvoice,
    getInvoice,
    getUserInvoices,
    // Auctions
    startAuction,
    getAuction,
    getAuctionByInvoice,
    cancelAuction,
    getAllAuctions,
    settleAuction,
    placeBid,
    // Escrow & payments
    createEscrow,
    payInvoice,
    releasePayment,
    getEscrow,
    isInvoicePaid,
    isPaymentReleased,
    // UI
    showNotification,
    // Live accessors
    get userAddress() { return userAddress; },
    get contracts() { return contracts; }
  };
}