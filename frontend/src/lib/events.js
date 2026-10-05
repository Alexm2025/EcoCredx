import { JsonRpcProvider } from 'ethers'
import { CHAINS } from './chain'

// Public RPC endpoints cap how many blocks one log query may span
const MAX_BLOCK_RANGE = 40_000

const logCache = new Map() // contract -> { logs, nextBlock }
const inFlight = new Map() // contract -> promise of the running fetch
const blockTimes = new Map()
const historyProviders = new Map() // chain id -> promise of the provider to read history from

async function pickHistoryProvider(chainId, deployment, fallback) {
  const chain = CHAINS[chainId]
  const urls = chain?.historyRpcUrls ?? (chain?.rpcUrl ? [chain.rpcUrl] : [])
  for (const url of urls) {
    try {
      // one request per call: some public endpoints never answer batched requests
      const provider = new JsonRpcProvider(url, chainId, { staticNetwork: true, batchMaxCount: 1 })
      // deploying emits events, so an endpoint that finds none there has dropped its old logs
      const logs = await provider.getLogs({
        address: [deployment.EcoCredit, deployment.EcoMarketplace],
        fromBlock: deployment.deployBlock,
        toBlock: deployment.deployBlock,
      })
      if (logs.length > 0) return provider
    } catch {
      // unreachable or refusing - try the next one
    }
  }
  return fallback
}

/** The provider to read event history from: an endpoint known to keep old logs, else `fallback`. */
export function historyProvider(chainId, deployment, fallback) {
  if (!CHAINS[chainId]?.historyRpcUrls && !CHAINS[chainId]?.rpcUrl) return Promise.resolve(fallback)
  if (!historyProviders.has(chainId)) historyProviders.set(chainId, pickHistoryProvider(chainId, deployment, fallback))
  return historyProviders.get(chainId)
}

async function fetchNewEvents(contract, provider, key, fromBlock) {
  const latest = await provider.getBlockNumber()
  let cached = logCache.get(key)
  // a local chain that was restarted has a shorter history than the cache remembers
  if (!cached || latest < cached.nextBlock - 1) cached = { logs: [], nextBlock: fromBlock }

  // the contract may be bound to a wallet; history is read through `provider`
  const reader = contract.connect(provider)
  const fresh = []
  for (let start = cached.nextBlock; start <= latest; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, latest)
    fresh.push(...(await reader.queryFilter('*', start, end)))
  }

  const updated = { logs: [...cached.logs, ...fresh.filter((log) => log.eventName)], nextBlock: latest + 1 }
  logCache.set(key, updated)
  return updated.logs
}

/**
 * All decoded events a contract has emitted since `fromBlock`, oldest first.
 * History is cached, so repeat calls only ask the chain for blocks it has not seen.
 */
export function fetchEvents(contract, provider, chainId, fromBlock = 0) {
  const key = `${chainId}:${contract.target}`
  // one fetch at a time per contract, so concurrent callers cannot append the same logs twice
  const previous = inFlight.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => fetchNewEvents(contract, provider, key, fromBlock))
  inFlight.set(key, next)
  return next
}

/** Map of block number -> unix timestamp, cached per chain. */
export async function blockTimestamps(provider, chainId, blockNumbers) {
  const unique = [...new Set(blockNumbers)]
  await Promise.all(
    unique
      .filter((n) => !blockTimes.has(`${chainId}:${n}`))
      .map(async (n) => {
        const block = await provider.getBlock(n)
        blockTimes.set(`${chainId}:${n}`, block?.timestamp ?? 0)
      }),
  )
  return Object.fromEntries(unique.map((n) => [n, blockTimes.get(`${chainId}:${n}`)]))
}
