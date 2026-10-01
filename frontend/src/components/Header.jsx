import { useState } from 'react'
import { chainName } from '../lib/chain'
import { errorMessage, formatEth, sameAddress, shortAddress } from '../lib/format'
import { useApp } from '../state/context'

// Who the local node's accounts are once scripts/seed.js has run
const DEMO_LABELS = ['Admin', 'Verifier', 'GreenGrid Energy', 'River Trust', 'Buyer']

function WalletMenu() {
  const { wallet, data, showToast } = useApp()
  const [open, setOpen] = useState(false)
  const demoAccounts = wallet.demoAccounts.slice(0, DEMO_LABELS.length)

  const attempt = async (action) => {
    setOpen(false)
    try {
      await action()
    } catch (err) {
      showToast({ kind: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div className="wallet-menu">
      <button type="button" className={wallet.account ? 'btn' : 'btn primary'} onClick={() => setOpen(!open)} aria-expanded={open}>
        {wallet.account ? (
          <>
            <span className="mono">{shortAddress(wallet.account)}</span>
            <span className="muted">{formatEth(data.ethBalance, 3)} ETH</span>
          </>
        ) : (
          'Connect wallet'
        )}
      </button>

      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popover" role="menu">
            <p className="popover-title">MetaMask</p>
            {wallet.hasMetaMask ? (
              <button type="button" className="menu-item" onClick={() => attempt(wallet.connectMetaMask)}>
                {wallet.mode === 'metamask' ? 'Connected — switch accounts inside MetaMask' : 'Connect MetaMask'}
              </button>
            ) : (
              <p className="popover-note">
                Not installed. Get it from <a href="https://metamask.io" target="_blank" rel="noreferrer">metamask.io</a>.
              </p>
            )}

            {demoAccounts.length > 0 && (
              <>
                <p className="popover-title">Demo accounts (local chain)</p>
                {demoAccounts.map((address, i) => (
                  <button
                    key={address}
                    type="button"
                    className={`menu-item ${sameAddress(address, wallet.account) && wallet.mode === 'demo' ? 'active' : ''}`}
                    onClick={() => attempt(() => wallet.connectDemo(address, wallet.localNode))}
                  >
                    <span>{DEMO_LABELS[i]}</span>
                    <span className="mono muted">{shortAddress(address)}</span>
                  </button>
                ))}
                <p className="popover-note">Test accounts of your Hardhat node. Names match the seed script.</p>
              </>
            )}

            {wallet.account && (
              <button type="button" className="menu-item danger" onClick={() => attempt(wallet.disconnect)}>
                Disconnect
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function Header({ tabs, tab }) {
  const { wallet } = useApp()

  return (
    <header className="header">
      <div className="header-row">
        <a className="brand" href="#dashboard">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M23 9c-8 0-13 4-13 10 0 1 .2 2 .5 3C12 17 15 14 20 12c-4 3-6.5 6-7.5 11 6 1 11-3 10.5-14Z" fill="#fff" />
          </svg>
          <span>EcoCredx</span>
        </a>
        <div className="header-right">
          {wallet.chainId && <span className="pill network">{chainName(wallet.chainId)}</span>}
          <WalletMenu />
        </div>
      </div>
      <nav className="tabs" aria-label="Sections">
        {tabs.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'tab active' : 'tab'}>
            {t.label}
            {t.count > 0 && <span className="tab-count">{t.count}</span>}
          </a>
        ))}
      </nav>
    </header>
  )
}

export function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
