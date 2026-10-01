// Fills a freshly deployed LOCAL chain with demo data so the app has something to show.
//   npx hardhat run scripts/seed.js --network localhost
// Uses the node's built-in accounts: #0 admin, #1 verifier, #2-#4 participants.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const { chainId } = await ethers.provider.getNetwork();
const deploymentFile = new URL(`../../frontend/src/contracts/deployments/${chainId}.json`, import.meta.url);
const deployment = JSON.parse(await readFile(fileURLToPath(deploymentFile), "utf8"));

const [, verifier, greenGrid, riverTrust, buyer] = await ethers.getSigners();
const credit = await ethers.getContractAt("EcoCredit", deployment.EcoCredit);
const market = await ethers.getContractAt("EcoMarketplace", deployment.EcoMarketplace);

if ((await credit.activityCount()) > 0n) {
  console.log("Chain already has activities - skipping seed.");
  process.exit(0);
}

const send = async (tx) => (await tx).wait();
const [CARBON, WATER, RENEWABLE, WASTE, BIODIVERSITY] = [0, 1, 2, 3, 4];

await send(credit.grantRole(await credit.VERIFIER_ROLE(), verifier.address));

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
await send(market.connect(greenGrid).createListing(RENEWABLE, 200, ethers.parseEther("0.004")));
await send(market.connect(greenGrid).createListing(CARBON, 120, ethers.parseEther("0.01")));
await send(market.connect(riverTrust).createListing(WATER, 100, ethers.parseEther("0.006")));
await send(market.connect(riverTrust).createListing(BIODIVERSITY, 40, ethers.parseEther("0.02")));

await send(market.connect(buyer).buy(1, 30, { value: ethers.parseEther("0.3") }));
await send(credit.connect(buyer).retire(CARBON, 10, "Offsetting 2026 annual tech fest"));

console.log("Seeded: 7 activities, 4 listings, 1 purchase, 1 retirement.");
console.log(`  admin    ${(await ethers.getSigners())[0].address}`);
console.log(`  verifier ${verifier.address}`);
console.log(`  users    ${greenGrid.address}, ${riverTrust.address}, ${buyer.address}`);
