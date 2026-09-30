const { ethers } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Deploy RealEstate + Escrow, mint a few properties, and list one for sale.
 *
 * Seeding matters: without it the API would serve an empty catalogue and the
 * demo would have nothing to show. After this runs, GET /properties returns real
 * on-chain data and tokenId 1 has a live escrow you can deposit against.
 *
 * Writes deployments/<chainId>.json and prints the env lines to paste into
 * logindemoserver/.env, so no address is hand-copied out of scrollback.
 */
async function main() {
  const signers = await ethers.getSigners();
  const [deployer, buyer, inspector, lender] = signers;
  const net = await ethers.provider.getNetwork();

  console.log(`\n  chainId ${net.chainId}   deployer ${deployer.address}\n`);

  // --- RealEstate (ERC-721) ---
  const RealEstate = await ethers.getContractFactory('RealEstate');
  const realEstate = await RealEstate.deploy();
  await realEstate.waitForDeployment();
  const realEstateAddress = await realEstate.getAddress();
  console.log(`  RealEstate  ${realEstateAddress}`);

  // --- Escrow ---
  // Roles are distinct accounts on purpose: finalizeSale() requires approval
  // from buyer, seller AND lender, so collapsing them would hide that the
  // multi-party flow actually works.
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy(
    realEstateAddress,
    deployer.address, // seller
    inspector.address,
    lender.address
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`  Escrow      ${escrowAddress}\n`);

  // --- Mint ---
  // Placeholder metadata URIs. The API reads them back but never resolves them,
  // so an unreachable URL breaks nothing.
  const metadata = [
    'https://ipfs.io/ipfs/QmRentVerseProperty1',
    'https://ipfs.io/ipfs/QmRentVerseProperty2',
    'https://ipfs.io/ipfs/QmRentVerseProperty3',
  ];

  for (const [i, uri] of metadata.entries()) {
    await (await realEstate.mint(uri)).wait();
    console.log(`  minted tokenId ${i + 1}`);
  }

  // --- List tokenId 1 ---
  const purchasePrice = ethers.parseEther('10');
  const escrowAmount = ethers.parseEther('5');

  // Escrow.list() pulls the NFT via transferFrom, so it needs approval first.
  // Without this the listing reverts with ERC721: caller is not token owner.
  await (await realEstate.approve(escrowAddress, 1)).wait();
  await (await escrow.list(1, buyer.address, purchasePrice, escrowAmount)).wait();

  console.log(
    `\n  listed tokenId 1 — price ${ethers.formatEther(purchasePrice)} ETH, ` +
      `earnest ${ethers.formatEther(escrowAmount)} ETH`
  );
  console.log(`  designated buyer  ${buyer.address}`);
  console.log(`  (import that account into MetaMask to run the deposit flow)\n`);

  // --- Persist ---
  const record = {
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    contracts: { realEstate: realEstateAddress, escrow: escrowAddress },
    roles: {
      seller: deployer.address,
      buyer: buyer.address,
      inspector: inspector.address,
      lender: lender.address,
    },
  };

  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${net.chainId}.json`), JSON.stringify(record, null, 2));

  console.log('  paste into logindemoserver/.env:\n');
  console.log(`REAL_ESTATE_ADDRESS=${realEstateAddress}`);
  console.log(`ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`CHAIN_ID=${net.chainId}`);
  console.log(`RPC_URL=http://127.0.0.1:8545\n`);
  console.log(`  saved blockchain/deployments/${net.chainId}.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
