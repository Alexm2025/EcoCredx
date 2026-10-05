import abis from '../contracts/abis.json'

// One file per chain, written by contracts-app/scripts/deploy.js
const deploymentFiles = import.meta.glob('../contracts/deployments/*.json', {
  eager: true,
  import: 'default',
})

export const LOCAL_CHAIN_ID = 31337
export const LOCAL_RPC_URL = 'http://127.0.0.1:8545'

// The local Hardhat chain only exists on the developer's machine, so the hosted site ignores it
export const IS_LOCAL_PAGE = ['localhost', '127.0.0.1'].includes(window.location.hostname)

export const DEPLOYMENTS = Object.fromEntries(
  Object.values(deploymentFiles)
    .filter((d) => IS_LOCAL_PAGE || d.chainId !== LOCAL_CHAIN_ID)
    .map((d) => [d.chainId, d]),
)

export const ABIS = abis

// rpcUrl: a public endpoint used to show the app read-only to visitors without a wallet
// historyRpcUrls: endpoints that keep old event logs, tried in order for the ledger. Many public
//   endpoints (and the RPC behind a wallet) drop old logs or refuse wide log queries.
// currency: the coin that prices and gas are paid in on that chain
export const CHAINS = {
  31337: { name: 'Hardhat Local', currency: 'ETH', testnet: true, explorer: null, rpcUrl: null },
  11155111: {
    name: 'Sepolia',
    currency: 'ETH',
    testnet: true,
    explorer: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    historyRpcUrls: ['https://rpc.sepolia.ethpandaops.io', 'https://sepolia.gateway.tenderly.co'],
  },
  137: {
    name: 'Polygon',
    currency: 'POL',
    testnet: false,
    explorer: 'https://polygonscan.com',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  },
}

export const chainName = (chainId) => CHAINS[chainId]?.name ?? `Chain ${chainId}`

// Index = token id in EcoCredit.sol
export const CREDIT_TYPES = [
  { id: 0, key: 'carbon', name: 'Carbon', unit: 'tonne CO₂e avoided', examples: 'Tree plantation, emission cuts, clean transport' },
  { id: 1, key: 'water', name: 'Water', unit: 'kilolitre conserved', examples: 'Rainwater harvesting, water recycling' },
  { id: 2, key: 'energy', name: 'Renewable Energy', unit: 'MWh generated', examples: 'Solar, wind, biogas generation' },
  { id: 3, key: 'waste', name: 'Waste', unit: 'tonne recycled', examples: 'Recycling, composting, e-waste collection' },
  { id: 4, key: 'bio', name: 'Biodiversity', unit: 'hectare protected', examples: 'Habitat restoration, mangrove and wetland protection' },
]

export const ACTIVITY_STATUS = ['Pending', 'Approved', 'Rejected']
