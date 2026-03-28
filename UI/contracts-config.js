// contracts-config.js
// Contract addresses (update these after deployment to Sepolia)
const CONTRACT_ADDRESSES = {
  MockUSDC: "0x2ec207bBB4754719C911262CA22F17F29ccb9DA2",
  InvoiceRegistry: "0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7",
  AuctionContract: "0x0EA763d174A1dDe964f32f3229BA78a6f1000961",
  EscrowManager: "0xEA70002b520a1E65838968D5F40DacA632b60f8C"
};

// Minimal ABIs (only functions we need for frontend)
const CONTRACT_ABIS = {
  MockUSDC: [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function faucet()",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ],
  
  InvoiceRegistry: [
    "function createInvoice(address buyer, uint256 faceValue, uint256 dueDate) returns (uint256)",
    "function getInvoice(uint256 invoiceId) view returns (tuple(uint256 id, address seller, address buyer, uint256 faceValue, uint256 dueDate, uint8 status, address currentOwner, uint256 createdAt, bool exists))",
    "function invoiceCount() view returns (uint256)",
    "function getSellerInvoices(address seller) view returns (uint256[])",
    "function canAuction(uint256 invoiceId) view returns (bool)",
    "event InvoiceCreated(uint256 indexed invoiceId, address indexed seller, uint256 faceValue)",
    "event InvoiceVerified(uint256 indexed invoiceId)"
  ],
  
  AuctionContract: [
    "function startAuction(uint256 invoiceId, uint256 minBidPercentage, uint256 duration) returns (uint256)",
    "function placeBid(uint256 auctionId, uint256 bidAmount)",
    "function settleAuction(uint256 auctionId)",
    "function getAuction(uint256 auctionId) view returns (tuple(uint256 invoiceId, address seller, uint256 faceValue, uint256 minBid, uint256 startTime, uint256 endTime, address highestBidder, uint256 highestBid, bool active, bool settled))",
    "function auctionCount() view returns (uint256)",
    "function canSettle(uint256 auctionId) view returns (bool)",
    "event AuctionCreated(uint256 indexed auctionId, uint256 indexed invoiceId, uint256 minBid, uint256 endTime)",
    "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
    "event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid)"
  ],
  
  EscrowManager: [
    "function createEscrow(uint256 invoiceId, address beneficiary)",
    "function payInvoice(uint256 invoiceId)",
    "function getEscrow(uint256 invoiceId) view returns (tuple(uint256 invoiceId, address buyer, address beneficiary, uint256 amount, uint256 dueDate, bool paid, bool released))",
    "event EscrowCreated(uint256 indexed invoiceId, address indexed beneficiary, uint256 amount)",
    "event PaymentReceived(uint256 indexed invoiceId, address indexed buyer, uint256 amount)"
  ]
};

// Network configuration
const NETWORK_CONFIG = {
  chainId: "0xaa36a7", // Sepolia chainId in hex (11155111 in decimal)
  chainName: "Sepolia Testnet",
  rpcUrl: "https://sepolia.infura.io/v3/",
  blockExplorer: "https://sepolia.etherscan.io"
};

// Invoice status enum (matches Solidity)
const InvoiceStatus = {
  0: "PENDING",
  1: "VERIFIED", 
  2: "AUCTIONED",
  3: "SETTLED",
  4: "PAID",
  5: "CANCELLED"
};

// Helper to get status badge class
function getStatusBadgeClass(status) {
  const statusMap = {
    "PENDING": "badge-blue",
    "VERIFIED": "badge-green",
    "AUCTIONED": "badge-yellow",
    "SETTLED": "badge-green",
    "PAID": "badge-green",
    "CANCELLED": "badge-gray"
  };
  return statusMap[status] || "badge-gray";
}

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONTRACT_ADDRESSES, CONTRACT_ABIS, NETWORK_CONFIG, InvoiceStatus, getStatusBadgeClass };
}