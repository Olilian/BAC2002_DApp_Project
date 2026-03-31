const hre = require("hardhat");
const addresses = require("../deployed-addresses.json");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Authorizing contracts with account:", deployer.address);

    const registry = await hre.ethers.getContractAt(
        "InvoiceRegistry",
        addresses.InvoiceRegistry
    );

    await registry.authorizeContract(addresses.AuctionContract);
    console.log("AuctionContract authorized:", addresses.AuctionContract);

    await registry.authorizeContract(addresses.EscrowManager);
    console.log("EscrowManager authorized:", addresses.EscrowManager);

    console.log("Done.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });