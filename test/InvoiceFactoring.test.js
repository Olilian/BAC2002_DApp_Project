// test/InvoiceFactoring.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Invoice Factoring System", function () {
  let usdc, registry, auction, escrow;
  let owner, seller, buyer, lp1, lp2;
  
  const FACE_VALUE = ethers.parseUnits("10000", 6); // 10,000 USDC
  const MIN_BID_PERCENT = 90; // 90%
  const AUCTION_DURATION = 24 * 60 * 60; // 24 hours
  const DUE_DATE_OFFSET = 60 * 24 * 60 * 60; // 60 days
  
  beforeEach(async function () {
    [owner, seller, buyer, lp1, lp2] = await ethers.getSigners();
    
    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    
    // Deploy InvoiceRegistry
    const InvoiceRegistry = await ethers.getContractFactory("InvoiceRegistry");
    registry = await InvoiceRegistry.deploy();
    
    // Deploy AuctionContract
    const AuctionContract = await ethers.getContractFactory("AuctionContract");
    auction = await AuctionContract.deploy(
      await usdc.getAddress(),
      await registry.getAddress()
    );
    
    // Deploy EscrowManager
    const EscrowManager = await ethers.getContractFactory("EscrowManager");
    escrow = await EscrowManager.deploy(
      await usdc.getAddress(),
      await registry.getAddress()
    );
    
    // Mint USDC to test accounts
    await usdc.mint(lp1.address, ethers.parseUnits("50000", 6));
    await usdc.mint(lp2.address, ethers.parseUnits("50000", 6));
    await usdc.mint(buyer.address, ethers.parseUnits("50000", 6));
    
    // Approve auction contract to spend USDC
    await usdc.connect(lp1).approve(await auction.getAddress(), ethers.MaxUint256);
    await usdc.connect(lp2).approve(await auction.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer).approve(await escrow.getAddress(), ethers.MaxUint256);
  });
  
  describe("1. Invoice Creation", function () {
    it("Should create an invoice", async function () {
      const dueDate = (await time.latest()) + DUE_DATE_OFFSET;
      
      await registry.connect(seller).createInvoice(
        buyer.address,
        FACE_VALUE,
        dueDate
      );
      
      const invoice = await registry.getInvoice(1);
      expect(invoice.seller).to.equal(seller.address);
      expect(invoice.buyer).to.equal(buyer.address);
      expect(invoice.faceValue).to.equal(FACE_VALUE);
      expect(invoice.status).to.equal(0); // PENDING
    });
    
    it("Should not create invoice with past due date", async function () {
      const pastDate = (await time.latest()) - 100;
      
      await expect(
        registry.connect(seller).createInvoice(buyer.address, FACE_VALUE, pastDate)
      ).to.be.revertedWith("Due date must be in future");
    });
  });
  
  describe("2. Invoice Verification", function () {
    beforeEach(async function () {
      const dueDate = (await time.latest()) + DUE_DATE_OFFSET;
      await registry.connect(seller).createInvoice(buyer.address, FACE_VALUE, dueDate);
    });
    
    it("Admin should verify invoice", async function () {
      await registry.verifyInvoice(1);
      const invoice = await registry.getInvoice(1);
      expect(invoice.status).to.equal(1); // VERIFIED
    });
    
    it("Non-admin cannot verify", async function () {
      await expect(
        registry.connect(seller).verifyInvoice(1)
      ).to.be.reverted;
    });
  });
  
  describe("3. Auction Flow", function () {
    beforeEach(async function () {
      const dueDate = (await time.latest()) + DUE_DATE_OFFSET;
      await registry.connect(seller).createInvoice(buyer.address, FACE_VALUE, dueDate);
      await registry.verifyInvoice(1);
    });
    
    it("Should start auction for verified invoice", async function () {
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      const auctionData = await auction.getAuction(1);
      expect(auctionData.active).to.equal(true);
      expect(auctionData.seller).to.equal(seller.address);
    });
    
    it("Should accept valid bid", async function () {
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      const bidAmount = ethers.parseUnits("9500", 6); // 95% of face value
      await auction.connect(lp1).placeBid(1, bidAmount);
      
      const auctionData = await auction.getAuction(1);
      expect(auctionData.highestBidder).to.equal(lp1.address);
      expect(auctionData.highestBid).to.equal(bidAmount);
    });
    
    it("Should refund previous bidder when outbid", async function () {
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      const bid1 = ethers.parseUnits("9500", 6);
      const bid2 = ethers.parseUnits("9700", 6);
      
      await auction.connect(lp1).placeBid(1, bid1);
      const balanceBefore = await usdc.balanceOf(lp1.address);
      
      await auction.connect(lp2).placeBid(1, bid2);
      const balanceAfter = await usdc.balanceOf(lp1.address);
      
      // LP1 should get refunded
      expect(balanceAfter - balanceBefore).to.equal(bid1);
    });
    
    it("Should settle auction and pay seller", async function () {
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      const bidAmount = ethers.parseUnits("9750", 6);
      await auction.connect(lp1).placeBid(1, bidAmount);
      
      // Fast forward past auction end
      await time.increase(AUCTION_DURATION + 1);
      
      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      await auction.settleAuction(1);
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      
      // Seller should receive bid amount
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(bidAmount);
      
      // Invoice ownership should transfer to LP
      const invoice = await registry.getInvoice(1);
      expect(invoice.currentOwner).to.equal(lp1.address);
    });
  });
  
  describe("4. Escrow & Final Payment", function () {
    beforeEach(async function () {
      const dueDate = (await time.latest()) + DUE_DATE_OFFSET;
      await registry.connect(seller).createInvoice(buyer.address, FACE_VALUE, dueDate);
      await registry.verifyInvoice(1);
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      const bidAmount = ethers.parseUnits("9750", 6);
      await auction.connect(lp1).placeBid(1, bidAmount);
      
      await time.increase(AUCTION_DURATION + 1);
      await auction.settleAuction(1);
    });
    
    it("Should create escrow after settlement", async function () {
      await escrow.createEscrow(1, lp1.address);
      
      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.beneficiary).to.equal(lp1.address);
      expect(escrowData.buyer).to.equal(buyer.address);
      expect(escrowData.amount).to.equal(FACE_VALUE);
    });
    
    it("Buyer should pay and LP receives funds", async function () {
      await escrow.createEscrow(1, lp1.address);
      
      // Fast forward to due date
      await time.increase(DUE_DATE_OFFSET);
      
      const lpBalanceBefore = await usdc.balanceOf(lp1.address);
      await escrow.connect(buyer).payInvoice(1);
      const lpBalanceAfter = await usdc.balanceOf(lp1.address);
      
      // LP should receive full face value
      expect(lpBalanceAfter - lpBalanceBefore).to.equal(FACE_VALUE);
      
      // Escrow should be marked as paid and released
      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.paid).to.equal(true);
      expect(escrowData.released).to.equal(true);
    });
  });
  
  describe("5. Complete End-to-End Flow", function () {
    it("Should complete full invoice factoring cycle", async function () {
      // 1. Create invoice
      const dueDate = (await time.latest()) + DUE_DATE_OFFSET;
      await registry.connect(seller).createInvoice(buyer.address, FACE_VALUE, dueDate);
      
      // 2. Verify invoice
      await registry.verifyInvoice(1);
      
      // 3. Start auction
      await auction.connect(seller).startAuction(1, MIN_BID_PERCENT, AUCTION_DURATION);
      
      // 4. Multiple bids
      await auction.connect(lp1).placeBid(1, ethers.parseUnits("9500", 6));
      await auction.connect(lp2).placeBid(1, ethers.parseUnits("9750", 6)); // Winner
      
      // 5. Settle auction
      await time.increase(AUCTION_DURATION + 1);
      const sellerBefore = await usdc.balanceOf(seller.address);
      await auction.settleAuction(1);
      const sellerAfter = await usdc.balanceOf(seller.address);
      
      // Seller got 9750 USDC instantly
      expect(sellerAfter - sellerBefore).to.equal(ethers.parseUnits("9750", 6));
      
      // 6. Create escrow
      await escrow.createEscrow(1, lp2.address);
      
      // 7. Buyer pays at maturity
      await time.increase(DUE_DATE_OFFSET);
      const lp2Before = await usdc.balanceOf(lp2.address);
      await escrow.connect(buyer).payInvoice(1);
      const lp2After = await usdc.balanceOf(lp2.address);
      
      // LP2 got full 10000 USDC (profit = 250 USDC)
      expect(lp2After - lp2Before).to.equal(FACE_VALUE);
      
      // Verify final invoice status
      const invoice = await registry.getInvoice(1);
      expect(invoice.status).to.equal(4); // PAID
    });
  });
});
