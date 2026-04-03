# ChainFactor — Decentralized Invoice Factoring Marketplace

**BAC2002 Blockchain and Cryptocurrency | Singapore Institute of Technology**  
**Team P2-17**

---

## Overview

ChainFactor is a decentralized invoice factoring platform where businesses sell unpaid receivables to liquidity providers via transparent on-chain auctions. It eliminates traditional factoring fees (15–50% annually) and replaces them with competitive auction pricing (2–5%).

**The problem it solves:**
- Traditional factoring: high cost, opaque pricing, 24–48hr manual processing
- ChainFactor: open bidding, instant settlement, no trusted intermediary

---

## Architecture

### Smart Contracts (Ethereum Sepolia Testnet)

| Contract | Address | Purpose |
|---|---|---|
| `MockUSDC` | `0x2ec207bBB4754719C911262CA22F17F29ccb9DA2` | ERC-20 testnet stablecoin (6 decimals) |
| `InvoiceRegistry` | `0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7` | Invoice creation, verification, status tracking |
| `AuctionContract` | `0x0EA763d174A1dDe964f32f3229BA78a6f1000961` | English auction with automatic refunds |
| `EscrowManager` | `0xEA70002b520a1E65838968D5F40DacA632b60f8C` | Post-settlement escrow and buyer payment |

### Frontend Pages

| File | Role | Party |
|---|---|---|
| `seller.html` | Seller Portal | Business/Supplier |
| `marketplace.html` | LP Marketplace | Liquidity Providers |
| `main_dashboard.html` | Dashboard + Pay Invoice | All parties / Debtor |

### Tech Stack
- **Contracts:** Solidity 0.8.20, OpenZeppelin v5, Hardhat
- **Frontend:** HTML5, CSS3, JavaScript ES6
- **Web3:** ethers.js v6, MetaMask
- **Network:** Ethereum Sepolia Testnet
- **Testing:** Mocha + Chai

---

## Prerequisites

- Node.js v18+
- MetaMask browser extension
- Sepolia ETH (get from [sepoliafaucet.com](https://sepoliafaucet.com))
- Infura or Alchemy account for RPC URL
- Etherscan API key (for contract verification)

---

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd chainfactor
npm install
```

### 2. Configure Environment

Create your `.env` file:

```bash
cp .env.example .env
```

Fill in the required values:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_deployer_wallet_private_key_without_0x
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**Getting these values:**
- `SEPOLIA_RPC_URL` — [app.infura.io](https://app.infura.io) or [dashboard.alchemy.com](https://dashboard.alchemy.com) → create project → copy Sepolia endpoint
- `PRIVATE_KEY` — MetaMask → Account Details → Export Private Key (use a dedicated test wallet, never your main wallet)
- `ETHERSCAN_API_KEY` — [etherscan.io/myapikey](https://etherscan.io/myapikey)

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm test
```

Expected: 11 test cases passing across all 4 contracts.

---

## Deployment

### Local Development

Terminal 1 — start local node:
```bash
npm run node
```

Terminal 2 — deploy contracts:
```bash
npm run deploy:localhost
```

### Sepolia Testnet

Make sure your deployer wallet has Sepolia ETH, then:

```bash
npm run deploy:sepolia
```

This will:
1. Deploy all 4 contracts in the correct order
2. Save addresses to `deployed-addresses.json`
3. Attempt Etherscan verification (requires valid API key)

After deployment, **update `contracts-config.js`** with the new addresses from `deployed-addresses.json`.

---

## Post-Deployment: Required Setup Steps

These steps must be completed **once** after every fresh deployment before the DApp works correctly.

### Step 1 — Authorize Contracts

`AuctionContract` and `EscrowManager` must be authorized on `InvoiceRegistry` before they can update invoice status on-chain. Without this, `settleAuction()` and `createEscrow()` will revert.

**Option A — Via script (recommended):**
```bash
npx hardhat run scripts/authorize.js --network sepolia
```

**Option B — Via Etherscan Write Contract (requires verified contracts):**
1. Go to `InvoiceRegistry` on Sepolia Etherscan
2. Write Contract → Connect deployer wallet
3. Call `authorizeContract` with `AuctionContract` address
4. Call `authorizeContract` again with `EscrowManager` address

### Step 2 — Verify Contracts on Etherscan (optional but recommended)

Verification makes the source code publicly auditable and enables Etherscan's Read/Write Contract UI.

```bash
# MockUSDC
npx hardhat verify --network sepolia 0x2ec207bBB4754719C911262CA22F17F29ccb9DA2

# InvoiceRegistry
npx hardhat verify --network sepolia 0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7

# AuctionContract (pass constructor args: usdc, registry)
npx hardhat verify --network sepolia 0x0EA763d174A1dDe964f32f3229BA78a6f1000961 \
  0x2ec207bBB4754719C911262CA22F17F29ccb9DA2 \
  0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7

# EscrowManager (pass constructor args: usdc, registry)
npx hardhat verify --network sepolia 0xEA70002b520a1E65838968D5F40DacA632b60f8C \
  0x2ec207bBB4754719C911262CA22F17F29ccb9DA2 \
  0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7
```

> **Note:** Verification does not affect DApp functionality. Contracts work correctly whether verified or not.

---

## Running the Frontend

The frontend is plain HTML/JS — no build step required.

Open any of the three pages directly in your browser, or serve locally:

```bash
# Using VS Code Live Server extension (recommended)
# Right-click main_dashboard.html → Open with Live Server

# Or using Python
python -m http.server 8080
# Then open http://localhost:8080/main_dashboard.html
```

---

## User Guide

### Seller (seller.html)
1. Connect MetaMask → Sepolia network
2. **Create Invoice** tab → enter buyer wallet address, face value, days until due → submit
3. Wait for admin verification (invoice status: PENDING → VERIFIED)
4. **My Live Auction** tab → set min bid % and duration → Start Auction
5. After auction ends → click **Settle Auction** to receive USDC instantly

### Liquidity Provider (marketplace.html)
1. Connect MetaMask → claim test USDC if needed
2. Browse live auctions → click **Place Bid** → set amount → submit
3. If outbid, USDC is automatically returned to your wallet
4. After winning → click **Won Auctions** in sidebar → **Create Escrow**
5. Wait for buyer to pay at maturity → USDC auto-released to your wallet

### Buyer/Debtor (main_dashboard.html)
1. Connect MetaMask with the wallet address registered as buyer on the invoice
2. Scroll to **Pay Invoice** section
3. Your assigned invoices appear automatically — click **Pay** when due
4. Or enter Invoice ID manually → click **Pay Invoice**

### Admin (Etherscan or Hardhat console)
1. Call `verifyInvoice(invoiceId)` on `InvoiceRegistry` to approve invoices
2. This is the only centralised step — simulates real-world due diligence

---

## Key Metrics

| Metric | ChainFactor | Traditional |
|---|---|---|
| Discount rate | 2–5% | 15–50% annually |
| Settlement time | Instant | 24–48 hours |
| Minimum volume | None | Often required |
| Pricing transparency | Open auction | Opaque, single counterparty |

---

## Security Features

- `ReentrancyGuard` on all fund-transferring functions
- `Ownable` access control for admin functions
- Solidity 0.8.x built-in overflow/underflow protection
- Atomic bid/refund — outbid funds returned in same transaction
- OpenZeppelin audited libraries throughout
- Input validation on all external functions

---

## Project Structure

```
chainfactor/
├── contracts/
│   ├── MockUSDC.sol
│   ├── InvoiceRegistry.sol
│   ├── AuctionContract.sol
│   └── EscrowManager.sol
├── scripts/
│   ├── deploy.js
│   └── authorize.js
├── test/
│   └── InvoiceFactoring.test.js
├── UI/
│   ├── seller.html
│   ├── marketplace.html
│   ├── main_dashboard.html
│   ├── contracts-config.js
│   ├── web3-utils.js
│   └── styles.css
├── hardhat.config.js
├── package.json
└── .env
```

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| 522 timeout on scripts | Bad RPC URL in `.env` | Update `SEPOLIA_RPC_URL` with valid Infura/Alchemy URL |
| `settleAuction()` reverts | Contracts not authorized | Run `authorize.js` or call via Etherscan Write Contract |
| MetaMask wrong network | Not on Sepolia | MetaMask will auto-prompt to switch; or manually select Sepolia |
| Faucet claim fails | Balance already ≥ 10,000 USDC | Send some USDC to another wallet first |
| No Read/Write Contract on Etherscan | Contract not verified | Run verify commands above |
| `ethers is not defined` | Wrong CDN loaded | Ensure all HTML files use ethers v6 CDN |

---

## Team

| Name | Student ID |
|---|---|
| Leong Wei Jie | 2402127 |
| Lim Jing Han Wayne | 2402220 |
| Loh Cherng Jun Triston | 2403342 |
| Ong Li Lian | 2402999 |
| Seah Ming Jun | 2403225 |

---

**BAC2002 Blockchain and Cryptocurrency | AY2025/2026 Trimester 2**  
**Singapore Institute of Technology**  
MIT License
