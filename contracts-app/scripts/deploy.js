// Deploys EcoCredit + EcoMarketplace and hands the addresses and ABIs to the frontend.
//   npx hardhat run scripts/deploy.js --network localhost
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre, { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const PLATFORM_FEE_BPS = 200; // 2% of each sale, taken from the seller's proceeds

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/src/contracts");

const [deployer] = await ethers.getSigners();
const { chainId } = await ethers.provider.getNetwork();
console.log(`Deploying to chain ${chainId} as ${deployer.address}`);

const credit = await ethers.deployContract("EcoCredit", [deployer.address]);
await credit.waitForDeployment();
const deployBlock = (await credit.deploymentTransaction().wait()).blockNumber;
console.log(`EcoCredit      ${await credit.getAddress()}`);

// The deployer owns the marketplace and receives its fees; both can be changed later.
const market = await ethers.deployContract("EcoMarketplace", [await credit.getAddress(), deployer.address, PLATFORM_FEE_BPS]);
await market.waitForDeployment();
console.log(`EcoMarketplace ${await market.getAddress()}`);

const deployment = {
  chainId: Number(chainId),
  deployBlock,
  EcoCredit: await credit.getAddress(),
  EcoMarketplace: await market.getAddress(),
};
const abis = {
  EcoCredit: (await hre.artifacts.readArtifact("EcoCredit")).abi,
  EcoMarketplace: (await hre.artifacts.readArtifact("EcoMarketplace")).abi,
};

await mkdir(path.join(frontendDir, "deployments"), { recursive: true });
await writeFile(path.join(frontendDir, "deployments", `${chainId}.json`), JSON.stringify(deployment, null, 2) + "\n");
await writeFile(path.join(frontendDir, "abis.json"), JSON.stringify(abis, null, 2) + "\n");
console.log(`Wrote frontend config to ${frontendDir}`);
