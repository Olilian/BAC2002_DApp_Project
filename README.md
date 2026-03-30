# ChainFactor - Decentralized Invoice Factoring Marketplace

BAC2002 Blockchain and Cryptocurrency Team Project

## Overview

A decentralized invoice factoring platform where businesses can auction unpaid invoices to liquidity providers for instant cash, eliminating traditional factoring fees (15-20%) and replacing them with transparent, competitive auction pricing (2-5%).

## Architecture

### Smart Contracts
- **MockUSDC.sol** - ERC20 stablecoin for testnet (6 decimals)
- **InvoiceRegistry.sol** - Invoice creation, verification, status management
- **AuctionContract.sol** - English auction with automatic refunds
- **EscrowManager.sol** - Secure fund custody and final payment handling

## Transaction keys for Smart Contracts:
- MockUSDC: 0x2ec207bBB4754719C911262CA22F17F29ccb9DA2
- InvoiceRegistry: 0xe8f8CAC9C658F9D237b531ab0F1E1b269e593aC7
- AuctionContract: 0x0EA763d174A1dDe964f32f3229BA78a6f1000961
- EscrowManager: 0xEA70002b520a1E65838968D5F40DacA632b60f8C

## Testnet:
- Network: Ethereum Sepolia Testnet

### Tech Stack
- Solidity 0.8.20
- Hardhat development environment
- OpenZeppelin contracts library
- Ethereum Sepolia testnet
- ethers.js for Web3 integration

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `SEPOLIA_RPC_URL` - Get from Infura or Alchemy
- `PRIVATE_KEY` - Your MetaMask private key (for deployment)
- `ETHERSCAN_API_KEY` - For contract verification

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm test
```

Expected output: All tests passing

### 5. Deploy to Local Network (Testing)

Terminal 1:
```bash
npm run node
```

Terminal 2:
```bash
npm run deploy:localhost
```

### 6. Deploy to Sepolia Testnet

Make sure you have Sepolia ETH in your deployer account (get from faucet).

```bash
npm run deploy:sepolia
```

This will:
- Deploy all 4 contracts
- Verify on Etherscan
- Save addresses to `deployed-addresses.json`

## Contract Addresses (After Deployment)

After deployment, addresses will be saved in `deployed-addresses.json`:

```json
{
  "network": "sepolia",
  "MockUSDC": "0x...",
  "InvoiceRegistry": "0x...",
  "AuctionContract": "0x...",
  "EscrowManager": "0x...",
  "deployedAt": "2026-03-19T..."
}
```

## Complete Transaction Flow

1. **Create Invoice** - Seller creates invoice for delivered goods
2. **Verify Invoice** - Admin verifies invoice authenticity
3. **Start Auction** - Seller starts 24-hour auction
4. **Competitive Bidding** - LPs place bids, automatic refunds
5. **Settle Auction** - Seller receives instant payout (97.5%)
6. **Create Escrow** - Invoice ownership transfers to winning LP
7. **Maturity Payment** - Buyer pays full amount (100%)
8. **Final Release** - LP receives payment + profit

## Testing Locally

### Interact with Contracts

```javascript
// In Hardhat console: npx hardhat console --network localhost

const USDC = await ethers.getContractAt("MockUSDC", "0x...");
const Registry = await ethers.getContractAt("InvoiceRegistry", "0x...");

// Get test USDC
await USDC.faucet();

// Create invoice
await Registry.createInvoice(buyerAddress, ethers.parseUnits("10000", 6), dueDate);
```

## Key Metrics

- **Discount Rate**: 2.5% (vs 15-20% traditional)
- **Settlement Time**: Instant (vs 3-5 days traditional)
- **LP Returns**: 15% APR on 60-day invoices
- **Gas Costs**: ~$5-10 per complete transaction

## Security Features

- OpenZeppelin contracts (audited libraries)
- ReentrancyGuard on all fund transfers
- Access control (Ownable)
- Automatic refunds (no manual intervention)
- Input validation on all functions

## Team

- LEONG WEI JIE
- LIM JING HAN WAYNE
- LOH CHERNG JUN TRISTON
- ONG LI LIAN
- SEAH MING JUN

## License

MIT

---

**BAC2002 Project** | Singapore Institute of Technology
