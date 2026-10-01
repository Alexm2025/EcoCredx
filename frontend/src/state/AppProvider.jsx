import { useCallback, useMemo, useRef, useState } from 'react'
import { errorMessage } from '../lib/format'
import { AppContext } from './context'
import { useEcoData } from './useEcoData'
import { useWallet } from './useWallet'

const TOAST_MS = 6000

export function AppProvider({ children }) {
  const wallet = useWallet()
  const { data, refresh } = useEcoData(wallet)
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const showToast = useCallback(
    (toast, id = nextId.current++) => {
      setToasts((list) => (list.some((t) => t.id === id) ? list.map((t) => (t.id === id ? { id, ...toast } : t)) : [...list, { id, ...toast }]))
      if (toast.kind !== 'pending') setTimeout(() => dismissToast(id), TOAST_MS)
      return id
    },
    [dismissToast],
  )

  // Sends a transaction, narrates it in a toast, and reloads chain data once it is mined.
  // `send` must return the ethers transaction response. Resolves to true on success.
  const runTx = useCallback(
    async (label, send) => {
      const id = showToast({ kind: 'pending', text: `${label} — confirm in your wallet…` })
      try {
        const tx = await send()
        showToast({ kind: 'pending', text: `${label} — waiting for confirmation…` }, id)
        await tx.wait()
        showToast({ kind: 'success', text: `${label} — confirmed on-chain.` }, id)
        await refresh()
        return true
      } catch (err) {
        showToast({ kind: 'error', text: `${label} failed. ${errorMessage(err)}` }, id)
        return false
      }
    },
    [showToast, refresh],
  )

  const value = useMemo(
    () => ({ wallet, data, refresh, runTx, showToast, toasts, dismissToast }),
    [wallet, data, refresh, runTx, showToast, toasts, dismissToast],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
