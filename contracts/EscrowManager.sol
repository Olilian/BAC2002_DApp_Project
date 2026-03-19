// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./InvoiceRegistry.sol";

/**
 * @title EscrowManager
 * @notice Manages escrow for invoice payments from buyer to LP
 */
contract EscrowManager is ReentrancyGuard {
    
    IERC20 public immutable usdc;
    InvoiceRegistry public immutable invoiceRegistry;
    
    // Escrow record
    struct Escrow {
        uint256 invoiceId;
        address buyer;
        address beneficiary;    // LP who won the auction
        uint256 amount;
        uint256 dueDate;
        bool paid;
        bool released;
    }
    
    // State
    mapping(uint256 => Escrow) public escrows; // invoiceId => Escrow
    
    // Events
    event EscrowCreated(uint256 indexed invoiceId, address indexed beneficiary, uint256 amount);
    event PaymentReceived(uint256 indexed invoiceId, address indexed buyer, uint256 amount);
    event PaymentReleased(uint256 indexed invoiceId, address indexed beneficiary, uint256 amount);
    
    constructor(address _usdc, address _invoiceRegistry) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_invoiceRegistry != address(0), "Invalid registry address");
        
        usdc = IERC20(_usdc);
        invoiceRegistry = InvoiceRegistry(_invoiceRegistry);
    }
    
    /**
     * @notice Create escrow after auction settles
     * @param invoiceId Invoice that was auctioned
     * @param beneficiary LP who won the auction
     */
    function createEscrow(uint256 invoiceId, address beneficiary) external {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(escrows[invoiceId].amount == 0, "Escrow already exists");
        
        InvoiceRegistry.Invoice memory invoice = invoiceRegistry.getInvoice(invoiceId);
        require(invoice.exists, "Invoice does not exist");
        require(invoice.status == InvoiceRegistry.InvoiceStatus.SETTLED, "Invoice not settled");
        require(invoice.currentOwner == beneficiary, "Beneficiary not owner");
        
        Escrow storage escrow = escrows[invoiceId];
        escrow.invoiceId = invoiceId;
        escrow.buyer = invoice.buyer;
        escrow.beneficiary = beneficiary;
        escrow.amount = invoice.faceValue;
        escrow.dueDate = invoice.dueDate;
        escrow.paid = false;
        escrow.released = false;
        
        emit EscrowCreated(invoiceId, beneficiary, invoice.faceValue);
    }
    
    /**
     * @notice Buyer pays invoice at maturity
     * @param invoiceId Invoice to pay
     */
    function payInvoice(uint256 invoiceId) external nonReentrant {
        Escrow storage escrow = escrows[invoiceId];
        
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.paid, "Already paid");
        require(msg.sender == escrow.buyer, "Only buyer can pay");
        require(block.timestamp >= escrow.dueDate, "Not due yet");
        
        // Transfer USDC from buyer to contract
        require(
            usdc.transferFrom(msg.sender, address(this), escrow.amount),
            "Payment transfer failed"
        );
        
        escrow.paid = true;
        
        emit PaymentReceived(invoiceId, msg.sender, escrow.amount);
        
        // Automatically release to beneficiary
        _releasePayment(invoiceId);
    }
    
    /**
     * @notice Release payment to beneficiary (LP)
     * @param invoiceId Invoice to release payment for
     */
    function _releasePayment(uint256 invoiceId) internal {
        Escrow storage escrow = escrows[invoiceId];
        
        require(escrow.paid, "Not paid yet");
        require(!escrow.released, "Already released");
        
        escrow.released = true;
        
        // Transfer to beneficiary (LP)
        require(
            usdc.transfer(escrow.beneficiary, escrow.amount),
            "Release transfer failed"
        );
        
        // Update invoice status to fully paid
        invoiceRegistry.updateStatus(invoiceId, InvoiceRegistry.InvoiceStatus.PAID);
        
        emit PaymentReleased(invoiceId, escrow.beneficiary, escrow.amount);
    }
    
    /**
     * @notice Manual release (in case auto-release fails)
     * @param invoiceId Invoice to release
     */
    function releasePayment(uint256 invoiceId) external nonReentrant {
        Escrow storage escrow = escrows[invoiceId];
        
        require(escrow.paid, "Not paid yet");
        require(!escrow.released, "Already released");
        
        // Can be called by beneficiary or buyer
        require(
            msg.sender == escrow.beneficiary || msg.sender == escrow.buyer,
            "Not authorized"
        );
        
        _releasePayment(invoiceId);
    }
    
    /**
     * @notice Get escrow details
     * @param invoiceId Invoice ID
     */
    function getEscrow(uint256 invoiceId) external view returns (Escrow memory) {
        return escrows[invoiceId];
    }
    
    /**
     * @notice Check if invoice is paid
     * @param invoiceId Invoice ID
     */
    function isPaid(uint256 invoiceId) external view returns (bool) {
        return escrows[invoiceId].paid;
    }
    
    /**
     * @notice Check if payment is released
     * @param invoiceId Invoice ID
     */
    function isReleased(uint256 invoiceId) external view returns (bool) {
        return escrows[invoiceId].released;
    }
}
