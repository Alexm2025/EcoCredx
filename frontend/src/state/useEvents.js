import { useEffect, useState } from 'react'
import { blockTimestamps, fetchEvents, historyProvider } from '../lib/events'
import { errorMessage } from '../lib/format'
import { useApp } from './context'

const EMPTY = { status: 'loading', logs: [], error: null }

/**
 * Every event both contracts have emitted, oldest first, each with a `timestamp`.
 * Re-read whenever a new block arrives.
 */
export function useEvents() {
  const { wallet, data } = useApp()
  const { contracts, readProvider, deployment, chainId } = wallet
  const { blockNumber } = data
  const ready = data.status === 'ready'
  const [state, setState] = useState({ chainId: null, ...EMPTY })

  useEffect(() => {
    if (!ready) return
    let cancelled = false

    const load = async () => {
      try {
        const provider = await historyProvider(chainId, deployment, readProvider)
        const [creditLogs, marketLogs] = await Promise.all([
          fetchEvents(contracts.credit, provider, chainId, deployment.deployBlock),
          fetchEvents(contracts.market, provider, chainId, deployment.deployBlock),
        ])
        const logs = [...creditLogs, ...marketLogs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index)
        const times = await blockTimestamps(provider, chainId, logs.map((l) => l.blockNumber))
        if (cancelled) return
        setState({
          chainId,
          status: 'ready',
          error: null,
          logs: logs.map((log) => ({
            name: log.eventName,
            args: log.args,
            address: log.address,
            blockNumber: log.blockNumber,
            index: log.index,
            txHash: log.transactionHash,
            timestamp: times[log.blockNumber],
          })),
        })
      } catch (err) {
        if (!cancelled) setState((prev) => (prev.status === 'ready' ? prev : { chainId, ...EMPTY, status: 'error', error: errorMessage(err) }))
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [ready, contracts, readProvider, deployment, chainId, blockNumber])

  return state.chainId === chainId ? state : EMPTY
}
