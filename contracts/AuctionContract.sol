// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./InvoiceRegistry.sol";

/**
 * @title AuctionContract
 * @notice English auction for invoice factoring with automatic refunds
 */
contract AuctionContract is ReentrancyGuard {
    
    IERC20 public immutable usdc;
    InvoiceRegistry public immutable invoiceRegistry;
    
    // Auction struct
    struct Auction {
        uint256 invoiceId;
        address seller;
        uint256 faceValue;
        uint256 minBid;           // Minimum acceptable bid (e.g., 90% of face value)
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bool active;
        bool settled;
    }
    
    // State
    uint256 public auctionCount;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => uint256) public invoiceToAuction; // invoiceId => auctionId
    
    // Events
    event AuctionCreated(uint256 indexed auctionId, uint256 indexed invoiceId, uint256 minBid, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event BidRefunded(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid);
    event AuctionCancelled(uint256 indexed auctionId);
    
    constructor(address _usdc, address _invoiceRegistry) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_invoiceRegistry != address(0), "Invalid registry address");
        
        usdc = IERC20(_usdc);
        invoiceRegistry = InvoiceRegistry(_invoiceRegistry);
    }
    
    /**
     * @notice Start an auction for a verified invoice
     * @param invoiceId Invoice to auction
     * @param minBidPercentage Minimum bid as percentage (e.g., 90 = 90% of face value)
     * @param duration Auction duration in seconds
     */
    function startAuction(
        uint256 invoiceId,
        uint256 minBidPercentage,
        uint256 duration
    ) external returns (uint256) {
        require(minBidPercentage > 0 && minBidPercentage <= 100, "Invalid min bid percentage");
 require(duration >= 1 minutes && duration <= 7 days, "Duration must be 1min-7d");        require(invoiceRegistry.canAuction(invoiceId), "Invoice not ready for auction");
        
        InvoiceRegistry.Invoice memory invoice = invoiceRegistry.getInvoice(invoiceId);
        require(invoice.seller == msg.sender, "Only seller can start auction");
        require(invoiceToAuction[invoiceId] == 0, "Auction already exists");
        
        auctionCount++;
        uint256 auctionId = auctionCount;
        
        uint256 minBid = (invoice.faceValue * minBidPercentage) / 100;
        
        Auction storage auction = auctions[auctionId];
        auction.invoiceId = invoiceId;
        auction.seller = msg.sender;
        auction.faceValue = invoice.faceValue;
        auction.minBid = minBid;
        auction.startTime = block.timestamp;
        auction.endTime = block.timestamp + duration;
        auction.active = true;
        auction.settled = false;
        
        invoiceToAuction[invoiceId] = auctionId;
        
        // Update invoice status
        invoiceRegistry.updateStatus(invoiceId, InvoiceRegistry.InvoiceStatus.AUCTIONED);
        
        emit AuctionCreated(auctionId, invoiceId, minBid, auction.endTime);
        
        return auctionId;
    }
    
    /**
     * @notice Place a bid on an active auction
     * @param auctionId Auction to bid on
     * @param bidAmount Bid amount in USDC
     */
    function placeBid(uint256 auctionId, uint256 bidAmount) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        
        require(auction.active, "Auction not active");
        require(block.timestamp < auction.endTime, "Auction ended");
        require(bidAmount >= auction.minBid, "Bid below minimum");
        require(bidAmount > auction.highestBid, "Bid not higher than current highest");
        require(msg.sender != auction.seller, "Seller cannot bid");
        
        // Transfer USDC from new bidder to contract
        require(
            usdc.transferFrom(msg.sender, address(this), bidAmount),
            "USDC transfer failed"
        );
        
        // Refund previous highest bidder if exists
        if (auction.highestBidder != address(0)) {
            uint256 refundAmount = auction.highestBid;
            address previousBidder = auction.highestBidder;
            
            require(
                usdc.transfer(previousBidder, refundAmount),
                "Refund failed"
            );
            
            emit BidRefunded(auctionId, previousBidder, refundAmount);
        }
        
        // Update auction state
        auction.highestBidder = msg.sender;
        auction.highestBid = bidAmount;
        
        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }
    
    /**
     * @notice Settle auction after it ends
     * @param auctionId Auction to settle
     */
    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        
        require(auction.active, "Auction not active");
        require(block.timestamp >= auction.endTime, "Auction not ended yet");
        require(!auction.settled, "Already settled");
        require(auction.highestBidder != address(0), "No bids placed");
        
        auction.active = false;
        auction.settled = true;
        
        // Transfer winning bid to seller
        require(
            usdc.transfer(auction.seller, auction.highestBid),
            "Payment to seller failed"
        );
        
        // Transfer invoice ownership to winner
        invoiceRegistry.transferOwnership(auction.invoiceId, auction.highestBidder);
        
        // Update invoice status
        invoiceRegistry.updateStatus(auction.invoiceId, InvoiceRegistry.InvoiceStatus.SETTLED);
        
        emit AuctionSettled(auctionId, auction.highestBidder, auction.highestBid);
    }
    
    /**
     * @notice Cancel auction if no bids (seller only)
     * @param auctionId Auction to cancel
     */
    function cancelAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];
        
        require(auction.active, "Auction not active");
        require(msg.sender == auction.seller, "Only seller can cancel");
        require(auction.highestBidder == address(0), "Cannot cancel with bids");
        
        auction.active = false;
        
        // Reset invoice status to VERIFIED
        invoiceRegistry.updateStatus(auction.invoiceId, InvoiceRegistry.InvoiceStatus.VERIFIED);
        
        emit AuctionCancelled(auctionId);
    }
    
    /**
     * @notice Get auction details
     * @param auctionId Auction ID
     */
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }
    
    /**
     * @notice Get auction for an invoice
     * @param invoiceId Invoice ID
     */
    function getAuctionByInvoice(uint256 invoiceId) external view returns (Auction memory) {
        uint256 auctionId = invoiceToAuction[invoiceId];
        require(auctionId != 0, "No auction for this invoice");
        return auctions[auctionId];
    }
    
    /**
     * @notice Check if auction can be settled
     * @param auctionId Auction ID
     */
    function canSettle(uint256 auctionId) external view returns (bool) {
        Auction memory auction = auctions[auctionId];
        return auction.active && 
               block.timestamp >= auction.endTime && 
               !auction.settled && 
               auction.highestBidder != address(0);
    }
}
