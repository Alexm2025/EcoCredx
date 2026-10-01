import { useSyncExternalStore } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header, Toasts } from './components/Header'
import { CHAINS, DEPLOYMENTS, IS_LOCAL_PAGE, LOCAL_RPC_URL, chainName } from './lib/chain'
import { errorMessage } from './lib/format'
import { About } from './pages/About'
import { Admin } from './pages/Admin'
import { Dashboard } from './pages/Dashboard'
import { Earn } from './pages/Earn'
import { Ledger } from './pages/Ledger'
import { Marketplace } from './pages/Marketplace'
import { Verify } from './pages/Verify'
import { Wallet } from './pages/Wallet'
import { useApp } from './state/context'

const PAGES = {
  dashboard: Dashboard,
  market: Marketplace,
  earn: Earn,
  wallet: Wallet,
  ledger: Ledger,
  verify: Verify,
  admin: Admin,
  about: About,
}

function Notice({ title, children }) {
  return (
    <section className="card notice">
      <h1>{title}</h1>
      {children}
    </section>
  )
}

// Shown instead of the pages while there is no usable chain connection.
function Blocker() {
  const { wallet, data, showToast } = useApp()

  const switchTo = async (chainId) => {
    try {
      await wallet.switchChain(chainId)
    } catch (err) {
      showToast({ kind: 'error', text: errorMessage(err) })
    }
  }

  if (!wallet.ready) return <Notice title="Connecting…" />

  if (!wallet.chainId && !IS_LOCAL_PAGE) {
    return (
      <Notice title="Not live yet">
        <p>The EcoCredx contracts have not been deployed to a public network yet. Please check back soon.</p>
      </Notice>
    )
  }

  if (!wallet.chainId) {
    return (
      <Notice title="No blockchain connection">
        <p>EcoCredx could not find a local chain at <code>{LOCAL_RPC_URL}</code>. Start one from the <code>contracts-app</code> folder:</p>
        <pre>{'npm run node            # terminal 1 - keep it running\nnpm run deploy:local    # terminal 2\nnpm run seed:local      # optional demo data'}</pre>
        <p>Then reload this page — or connect MetaMask (top right) on a network where the contracts are deployed.</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </Notice>
    )
  }

  if (!wallet.deployment) {
    return (
      <Notice title="Unsupported network">
        <p>Your wallet is on {chainName(wallet.chainId)}, where EcoCredx is not deployed. Switch to:</p>
        <div className="hero-actions">
          {Object.keys(DEPLOYMENTS).map((id) => (
            <button key={id} type="button" className="btn primary" onClick={() => switchTo(Number(id))}>
              {chainName(Number(id))}
            </button>
          ))}
        </div>
      </Notice>
    )
  }

  if (data.status === 'error') {
    return (
      <Notice title="Could not read the contracts">
        <p>{data.error}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </Notice>
    )
  }

  if (data.status === 'loading') return <Notice title="Loading chain data…" />
  return null
}

// Standing notices above every page: test-network warning and emergency pauses.
function Banners() {
  const { wallet, data } = useApp()
  const { platform } = data

  return (
    <>
      {CHAINS[wallet.chainId]?.testnet && (
        <p className="banner">
          <strong>Test network.</strong> Everything here runs on {chainName(wallet.chainId)} for demonstration. Credits,
          claims and prices have no real-world value.
        </p>
      )}
      {platform.creditPaused && (
        <p className="banner alert">
          <strong>Paused.</strong> The platform admin has temporarily frozen claims, transfers and retirements.
        </p>
      )}
      {platform.marketPaused && (
        <p className="banner alert">
          <strong>Marketplace paused.</strong> New listings and purchases are temporarily disabled. Sellers can still
          cancel their listings.
        </p>
      )}
    </>
  )
}

// The open tab lives in the URL hash, so links, reloads and the back button all work
const onHashChange = (callback) => {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

const APK_URL = 'https://github.com/Alexm2025/EcoCredx/releases/latest/download/EcoCredx.apk'
// Android WebViews (the app itself) identify with 'wv' in the user agent
const IN_ANDROID_APP = /; wv[)]/.test(navigator.userAgent)

const tabFromHash = () => {
  const id = window.location.hash.slice(1)
  return id in PAGES ? id : 'dashboard'
}

export default function App() {
  const { wallet, data } = useApp()
  const tab = useSyncExternalStore(onHashChange, tabFromHash)

  const pending = data.activities.filter((a) => a.status === 0).length
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'market', label: 'Marketplace' },
    { id: 'earn', label: 'Earn credits' },
    { id: 'wallet', label: 'My wallet' },
    { id: 'ledger', label: 'Ledger' },
    data.isVerifier && { id: 'verify', label: 'Verify', count: pending },
    (data.isAdmin || data.isMarketOwner) && { id: 'admin', label: 'Admin' },
    { id: 'about', label: 'About' },
  ].filter(Boolean)

  const blocked = !wallet.ready || !wallet.deployment || data.status !== 'ready'
  // Role tabs disappear when you switch to an account without that role
  const current = tabs.some((t) => t.id === tab) ? tab : 'dashboard'
  const Page = PAGES[current]

  return (
    <>
      <Header tabs={tabs} tab={current} />
      <main className="main">
        {blocked ? (
          <Blocker />
        ) : (
          <>
            <Banners />
            <ErrorBoundary key={current}>
              <Page />
            </ErrorBoundary>
          </>
        )}
      </main>
      <footer className="footer">
        EcoCredx · Blockchain-Based Environmental Credit Marketplace
        {data.blockNumber > 0 && <span> · block {data.blockNumber}</span>}
        {' · '}
        <a href="#about">About &amp; terms</a>
        {!IN_ANDROID_APP && (
          <span>
            {' · '}
            <a href={APK_URL}>Get the Android app</a>
          </span>
        )}
      </footer>
      <Toasts />
    </>
  )
}
