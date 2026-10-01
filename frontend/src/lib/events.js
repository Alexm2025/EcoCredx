// Public RPC endpoints cap how many blocks one log query may span
const MAX_BLOCK_RANGE = 40_000

const logCache = new Map() // contract -> { logs, nextBlock }
const inFlight = new Map() // contract -> promise of the running fetch
const blockTimes = new Map()

async function fetchNewEvents(contract, provider, key, fromBlock) {
  const latest = await provider.getBlockNumber()
  let cached = logCache.get(key)
  // a local chain that was restarted has a shorter history than the cache remembers
  if (!cached || latest < cached.nextBlock - 1) cached = { logs: [], nextBlock: fromBlock }

  const fresh = []
  for (let start = cached.nextBlock; start <= latest; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, latest)
    fresh.push(...(await contract.queryFilter('*', start, end)))
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
