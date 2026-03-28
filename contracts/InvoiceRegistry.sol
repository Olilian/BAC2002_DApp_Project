// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title InvoiceRegistry
 * @notice Manages invoice creation, verification, and status tracking
 */
contract InvoiceRegistry is Ownable {
    
    // Invoice status enum
    enum InvoiceStatus {
        PENDING,        // Created, awaiting verification
        VERIFIED,       // Verified, ready for auction
        AUCTIONED,      // In active auction
        SETTLED,        // Auction completed, payment to seller done
        PAID,           // Buyer paid full amount, LP received funds
        CANCELLED       // Invoice cancelled
    }
    
    // Invoice struct
    struct Invoice {
        uint256 id;
        address seller;         // Business/supplier
        address buyer;          // Company that owes money
        uint256 faceValue;      // Full invoice amount (in USDC)
        uint256 dueDate;        // Unix timestamp when buyer must pay
        InvoiceStatus status;
        address currentOwner;   // Who owns the invoice (seller initially, then LP)
        uint256 createdAt;
        bool exists;
    }
    
    // State variables
    uint256 public invoiceCount;
    mapping(uint256 => Invoice) public invoices;
    mapping(address => uint256[]) public sellerInvoices;

    // Authorized contracts (AuctionContract, EscrowManager) that can update status
    mapping(address => bool) public authorizedContracts;
    
    // Events
    event InvoiceCreated(uint256 indexed invoiceId, address indexed seller, uint256 faceValue);
    event InvoiceVerified(uint256 indexed invoiceId);
    event InvoiceStatusChanged(uint256 indexed invoiceId, InvoiceStatus newStatus);
    event OwnershipTransferred(uint256 indexed invoiceId, address indexed newOwner);
    event ContractAuthorized(address indexed contractAddress);
    
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Authorize a contract to call updateStatus (admin only)
     * @param contractAddress Address of the contract to authorize
     */
    function authorizeContract(address contractAddress) external onlyOwner {
        require(contractAddress != address(0), "Invalid address");
        authorizedContracts[contractAddress] = true;
        emit ContractAuthorized(contractAddress);
    }
    
    /**
     * @notice Create a new invoice
     * @param buyer Address of the company that owes money
     * @param faceValue Full invoice amount in USDC (base units)
     * @param dueDate Unix timestamp when payment is due
     */
    function createInvoice(
        address buyer,
        uint256 faceValue,
        uint256 dueDate
    ) external returns (uint256) {
        require(buyer != address(0), "Invalid buyer address");
        require(faceValue > 0, "Face value must be positive");
        require(dueDate > block.timestamp, "Due date must be in future");
        
        invoiceCount++;
        uint256 invoiceId = invoiceCount;
        
        Invoice storage invoice = invoices[invoiceId];
        invoice.id = invoiceId;
        invoice.seller = msg.sender;
        invoice.buyer = buyer;
        invoice.faceValue = faceValue;
        invoice.dueDate = dueDate;
        invoice.status = InvoiceStatus.PENDING;
        invoice.currentOwner = msg.sender;
        invoice.createdAt = block.timestamp;
        invoice.exists = true;
        
        sellerInvoices[msg.sender].push(invoiceId);
        
        emit InvoiceCreated(invoiceId, msg.sender, faceValue);
        
        return invoiceId;
    }
    
    /**
     * @notice Verify an invoice (admin only for POC)
     * @param invoiceId Invoice to verify
     */
    function verifyInvoice(uint256 invoiceId) external onlyOwner {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.exists, "Invoice does not exist");
        require(invoice.status == InvoiceStatus.PENDING, "Invoice not pending");
        
        invoice.status = InvoiceStatus.VERIFIED;
        
        emit InvoiceVerified(invoiceId);
        emit InvoiceStatusChanged(invoiceId, InvoiceStatus.VERIFIED);
    }
    
    /**
     * @notice Update invoice status (called by auction/escrow contracts)
     * @param invoiceId Invoice to update
     * @param newStatus New status
     */
    function updateStatus(uint256 invoiceId, InvoiceStatus newStatus) external {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.exists, "Invoice does not exist");
        
        require(
            msg.sender == owner() ||
            msg.sender == invoice.currentOwner ||
            authorizedContracts[msg.sender],
            "Not authorized"
        );
        
        invoice.status = newStatus;
        
        emit InvoiceStatusChanged(invoiceId, newStatus);
    }
    
    /**
     * @notice Transfer invoice ownership (when LP wins auction)
     * @param invoiceId Invoice to transfer
     * @param newOwner New owner address
     */
    function transferOwnership(uint256 invoiceId, address newOwner) external {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.exists, "Invoice does not exist");
        require(newOwner != address(0), "Invalid new owner");
        
        // Only current owner or authorized contracts can transfer
        require(
            msg.sender == invoice.currentOwner ||
            authorizedContracts[msg.sender],
            "Not current owner"
        );
        
        invoice.currentOwner = newOwner;
        
        emit OwnershipTransferred(invoiceId, newOwner);
    }
    
    /**
     * @notice Get invoice details
     * @param invoiceId Invoice ID
     */
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        require(invoices[invoiceId].exists, "Invoice does not exist");
        return invoices[invoiceId];
    }
    
    /**
     * @notice Get all invoices for a seller
     * @param seller Seller address
     */
    function getSellerInvoices(address seller) external view returns (uint256[] memory) {
        return sellerInvoices[seller];
    }
    
    /**
     * @notice Check if invoice can be auctioned
     * @param invoiceId Invoice to check
     */
    function canAuction(uint256 invoiceId) external view returns (bool) {
        Invoice memory invoice = invoices[invoiceId];
        return invoice.exists && invoice.status == InvoiceStatus.VERIFIED;
    }
}
