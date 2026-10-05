import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers'
import { ABIS, CHAINS, DEPLOYMENTS, LOCAL_CHAIN_ID, LOCAL_RPC_URL } from '../lib/chain'

const STORAGE_KEY = 'ecocredx.wallet'

const remember = (value) => {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable (private window) - reconnecting is just a convenience
  }
}

const recall = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Is a Hardhat node running on this machine? Checked by hand so ethers doesn't retry forever.
async function probeLocalNode() {
  if (!DEPLOYMENTS[LOCAL_CHAIN_ID]) return null
  try {
    const res = await fetch(LOCAL_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(1500),
    })
    const { result } = await res.json()
    if (Number(result) !== LOCAL_CHAIN_ID) return null

    const provider = new JsonRpcProvider(LOCAL_RPC_URL, LOCAL_CHAIN_ID, { staticNetwork: true })
    provider.pollingInterval = 1000
    const accounts = await provider.send('eth_accounts', [])
    return { provider, accounts, chainId: LOCAL_CHAIN_ID }
  } catch {
    return null
  }
}

// Read-only connection to a public chain the contracts are deployed on, for visitors without a wallet.
function publicReader() {
  // a main-network deployment, once there is one, is what visitors should see
  const candidates = Object.values(DEPLOYMENTS).filter((d) => CHAINS[d.chainId]?.rpcUrl)
  const deployment = candidates.find((d) => !CHAINS[d.chainId].testnet) ?? candidates[0]
  if (!deployment) return null
  const provider = new JsonRpcProvider(CHAINS[deployment.chainId].rpcUrl, deployment.chainId, { staticNetwork: true })
  return { provider, accounts: [], chainId: deployment.chainId }
}

async function metaMaskSession() {
  const provider = new BrowserProvider(window.ethereum)
  const accounts = await provider.send('eth_accounts', [])
  if (accounts.length === 0) return null
  const signer = await provider.getSigner()
  const { chainId } = await provider.getNetwork()
  return { mode: 'metamask', provider, signer, account: signer.address, chainId: Number(chainId) }
}

/**
 * Wallet connection. Two ways in:
 *  - MetaMask (any chain the contracts are deployed to)
 *  - "demo" accounts: the unlocked accounts of a local Hardhat node, no extension needed
 * Without a wallet the app is read-only: from the local node if one is running, else from a public chain.
 */
export function useWallet() {
  const [ready, setReady] = useState(false)
  const [reader, setReader] = useState(null)
  const [session, setSession] = useState(null)
  const hasMetaMask = typeof window !== 'undefined' && Boolean(window.ethereum)

  const connectDemo = useCallback(async (address, node) => {
    const signer = await node.provider.getSigner(address)
    setSession({ mode: 'demo', provider: node.provider, signer, account: signer.address, chainId: node.chainId })
    remember(`demo:${signer.address}`)
  }, [])

  // Startup: find the local node and restore the previous connection.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const node = await probeLocalNode()
      if (cancelled) return
      setReader(node ?? publicReader())

      const saved = recall()
      try {
        if (saved === 'metamask' && window.ethereum) {
          const restored = await metaMaskSession()
          if (!cancelled && restored) setSession(restored)
        } else if (saved?.startsWith('demo:') && node) {
          const address = saved.slice(5)
          if (node.accounts.some((a) => a.toLowerCase() === address.toLowerCase())) {
            await connectDemo(address, node)
          }
        }
      } catch {
        remember(null)
      }
      if (!cancelled) setReady(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [connectDemo])

  // Follow account / network changes made inside MetaMask.
  const isMetaMask = session?.mode === 'metamask'
  useEffect(() => {
    if (!isMetaMask) return
    const sync = async () => {
      const next = await metaMaskSession().catch(() => null)
      setSession(next)
      if (!next) remember(null)
    }
    window.ethereum.on('accountsChanged', sync)
    window.ethereum.on('chainChanged', sync)
    return () => {
      window.ethereum.removeListener('accountsChanged', sync)
      window.ethereum.removeListener('chainChanged', sync)
    }
  }, [isMetaMask])

  const connectMetaMask = useCallback(async () => {
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    const next = await metaMaskSession()
    setSession(next)
    remember(next ? 'metamask' : null)
  }, [])

  const disconnect = useCallback(() => {
    setSession(null)
    remember(null)
  }, [])

  // Ask MetaMask to move to a chain; the local Hardhat chain is added if it is unknown.
  const switchChain = useCallback(async (chainId) => {
    const hex = `0x${chainId.toString(16)}`
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
    } catch (err) {
      if (err.code !== 4902 || chainId !== LOCAL_CHAIN_ID) throw err
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hex,
            chainName: 'Hardhat Local',
            rpcUrls: [LOCAL_RPC_URL],
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          },
        ],
      })
    }
  }, [])

  const chainId = session?.chainId ?? reader?.chainId ?? null
  const readProvider = session?.provider ?? reader?.provider ?? null
  const deployment = chainId ? (DEPLOYMENTS[chainId] ?? null) : null
  const signer = session?.signer ?? null

  const contracts = useMemo(() => {
    if (!deployment || !readProvider) return null
    const runner = signer ?? readProvider
    return {
      credit: new Contract(deployment.EcoCredit, ABIS.EcoCredit, runner),
      market: new Contract(deployment.EcoMarketplace, ABIS.EcoMarketplace, runner),
    }
  }, [deployment, readProvider, signer])

  return {
    ready,
    hasMetaMask,
    mode: session?.mode ?? null,
    account: session?.account ?? null,
    chainId,
    currency: CHAINS[chainId]?.currency ?? 'ETH',
    readProvider,
    deployment,
    contracts,
    demoAccounts: reader?.accounts ?? [],
    localNode: reader,
    connectMetaMask,
    connectDemo,
    disconnect,
    switchChain,
  }
}
