import { createContext, useContext } from 'react'

export const AppContext = createContext(null)

// { wallet, data, refresh, runTx, toasts, dismissToast }
export const useApp = () => useContext(AppContext)
