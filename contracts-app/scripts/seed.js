// Fills a freshly deployed chain with demo data so the app has something to show.
//   npx hardhat run scripts/seed.js --network localhost
//   npx hardhat run scripts/seed.js --network sepolia
//
// Local chain: uses the node's built-in accounts - #0 admin, #1 verifier, #2-#4 participants.
// Public testnet: there is only the deployer, so it also acts as verifier, and three demo
// participants are derived from its key and given a little ETH for gas.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const { chainId } = await ethers.provider.getNetwork();

// Demo data is invented. It must never be written to a chain where credits are real.
if ([1n, 137n].includes(chainId)) {
  console.error("Refusing to seed demo data on a main network.");
  process.exit(1);
}
const deploymentFile = new URL(`../../frontend/src/contracts/deployments/${chainId}.json`, import.meta.url);
const deployment = JSON.parse(await readFile(fileURLToPath(deploymentFile), "utf8"));

const credit = await ethers.getContractAt("EcoCredit", deployment.EcoCredit);
const market = await ethers.getContractAt("EcoMarketplace", deployment.EcoMarketplace);

if ((await credit.activityCount()) > 0n) {
  console.log("Chain already has activities - skipping seed.");
  process.exit(0);
}

const send = async (tx) => (await tx).wait();
const signers = await ethers.getSigners();
const isLocal = signers.length >= 5;
const admin = signers[0];
let verifier, greenGrid, riverTrust, buyer;

if (isLocal) {
  [, verifier, greenGrid, riverTrust, buyer] = signers;
  await send(credit.grantRole(await credit.VERIFIER_ROLE(), verifier.address));
} else {
  verifier = admin; // the deployer already holds the verifier role
  const demoWallet = (name) => new ethers.Wallet(ethers.id(`${process.env.SEPOLIA_PRIVATE_KEY}:demo:${name}`), ethers.provider);
  [greenGrid, riverTrust, buyer] = ["greengrid", "rivertrust", "buyer"].map(demoWallet);

  const gasMoney = [[greenGrid, "0.004"], [riverTrust, "0.004"], [buyer, "0.007"]];
  for (const [wallet, eth] of gasMoney) {
    const shortfall = ethers.parseEther(eth) - (await ethers.provider.getBalance(wallet.address));
    if (shortfall > 0n) await send(admin.sendTransaction({ to: wallet.address, value: shortfall }));
  }
}

// Test ETH is scarce on a public testnet, so prices there are 100x smaller
const price = (eth) => ethers.parseEther(eth) / (isLocal ? 1n : 100n);
const [CARBON, WATER, RENEWABLE, WASTE, BIODIVERSITY] = [0, 1, 2, 3, 4];

const claims = [
  [greenGrid, RENEWABLE, 500, "5 MW rooftop solar installation, Pune industrial estate - Q2 generation report", "https://example.org/evidence/solar-q2"],
  [greenGrid, CARBON, 320, "Replaced diesel generators with grid-tied battery storage", "https://example.org/evidence/battery"],
  [riverTrust, WATER, 150, "Rainwater harvesting across 40 housing societies", "https://example.org/evidence/rainwater"],
  [riverTrust, BIODIVERSITY, 80, "Mangrove restoration, 12 hectares, Thane creek", "https://example.org/evidence/mangrove"],
  [riverTrust, WASTE, 200, "Community e-waste collection drive - 18 tonnes recycled", "https://example.org/evidence/ewaste"],
  [buyer, CARBON, 60, "Planted 3,000 native saplings on campus", "https://example.org/evidence/saplings"],
  [greenGrid, CARBON, 900, "Claimed fleet electrification (no meter data attached)", ""],
];
for (const [signer, type, amount, description, uri] of claims) {
  await send(credit.connect(signer).submitActivity(type, amount, ethers.id(description), description, uri));
}

await send(credit.connect(verifier).approveActivity(0, 500, "Generation data matches meter readings"));
await send(credit.connect(verifier).approveActivity(1, 300, "20 credits withheld pending Q3 audit"));
await send(credit.connect(verifier).approveActivity(2, 150, "Site inspection completed"));
await send(credit.connect(verifier).approveActivity(3, 80, "Satellite imagery confirms canopy growth"));
await send(credit.connect(verifier).rejectActivity(6, "No supporting evidence provided"));
// activities 4 and 5 stay pending for the verifier demo

for (const seller of [greenGrid, riverTrust]) {
  await send(credit.connect(seller).setApprovalForAll(deployment.EcoMarketplace, true));
}
await send(market.connect(greenGrid).createListing(RENEWABLE, 200, price("0.004")));
await send(market.connect(greenGrid).createListing(CARBON, 120, price("0.01")));
await send(market.connect(riverTrust).createListing(WATER, 100, price("0.006")));
await send(market.connect(riverTrust).createListing(BIODIVERSITY, 40, price("0.02")));

await send(market.connect(buyer).buy(1, 30, { value: price("0.01") * 30n }));
await send(credit.connect(buyer).retire(CARBON, 10, "Offsetting 2026 annual tech fest"));

console.log("Seeded: 7 activities, 4 listings, 1 purchase, 1 retirement.");
console.log(`  admin    ${admin.address}`);
console.log(`  verifier ${verifier.address}`);
console.log(`  users    ${greenGrid.address}, ${riverTrust.address}, ${buyer.address}`);
