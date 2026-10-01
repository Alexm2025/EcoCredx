import { ACTIVITY_STATUS, CHAINS, CREDIT_TYPES } from '../lib/chain'
import { sameAddress, shortAddress } from '../lib/format'
import { useApp } from '../state/context'

export function TypeBadge({ type }) {
  const info = CREDIT_TYPES[type]
  return (
    <span className="type-badge">
      <span className={`dot type-${info?.key}`} aria-hidden="true" />
      {info?.name ?? `Type ${type}`}
    </span>
  )
}

export function Address({ value }) {
  const { wallet } = useApp()
  if (!value) return <span className="muted">—</span>
  const mine = sameAddress(value, wallet.account)
  return (
    <span className="address" title={value}>
      {shortAddress(value)}
      {mine && <span className="you">you</span>}
    </span>
  )
}

const STATUS_ICON = ['◷', '✓', '✕']

export function StatusPill({ status }) {
  return (
    <span className={`pill status-${ACTIVITY_STATUS[status].toLowerCase()}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {ACTIVITY_STATUS[status]}
    </span>
  )
}

export function TxLink({ hash }) {
  const { wallet } = useApp()
  const explorer = CHAINS[wallet.chainId]?.explorer
  const label = `${hash.slice(0, 10)}…`
  if (!explorer) return <span className="mono" title={hash}>{label}</span>
  return (
    <a className="mono" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" title={hash}>
      {label}
    </a>
  )
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function TypeSelect({ value, onChange, balances }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {CREDIT_TYPES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {balances ? ` — you hold ${balances[t.id].toLocaleString('en-US')}` : ''}
        </option>
      ))}
    </select>
  )
}

/** Shown in place of a form when nobody is connected. */
export function ConnectPrompt({ children }) {
  return <p className="connect-prompt">{children ?? 'Connect a wallet (top right) to continue.'}</p>
}
