import { Address, Empty, TypeBadge } from '../components/ui'
import { CREDIT_TYPES } from '../lib/chain'
import { formatCredits, formatDate } from '../lib/format'
import { useApp } from '../state/context'

const sum = (values) => values.reduce((total, v) => total + v, 0n)

const STEPS = [
  ['Earn', 'Submit an eco-friendly activity with evidence. Its fingerprint is locked on-chain so it can never be claimed twice.'],
  ['Verify', 'An independent verifier reviews the claim. Approval mints the credits straight to your wallet.'],
  ['Trade', 'List credits for sale or buy from others. Credits sit in escrow and payment goes directly to the seller.'],
  ['Retire', 'Burn credits to claim the environmental benefit. Retired credits are gone for good and publicly recorded.'],
]

function SupplyChart({ issued, retired }) {
  const max = issued.reduce((m, v) => (v > m ? v : m), 0n)

  return (
    <div className="supply">
      <div className="legend">
        <span><span className="swatch solid" /> In circulation</span>
        <span><span className="swatch faded" /> Retired</span>
      </div>
      {CREDIT_TYPES.map((t) => {
        const circulating = issued[t.id] - retired[t.id]
        const pct = (v) => (max === 0n ? 0 : Number((v * 1000n) / max) / 10)
        return (
          <div className="supply-row" key={t.id}>
            <div className="supply-name">
              <TypeBadge type={t.id} />
              <span className="muted small">1 credit = 1 {t.unit}</span>
            </div>
            <div className="bar-track">
              {circulating > 0n && (
                <div
                  className={`bar type-${t.key}`}
                  style={{ width: `${pct(circulating)}%` }}
                  title={`${t.name}: ${formatCredits(circulating)} in circulation`}
                />
              )}
              {retired[t.id] > 0n && (
                <div
                  className={`bar retired type-${t.key}`}
                  style={{ width: `${pct(retired[t.id])}%` }}
                  title={`${t.name}: ${formatCredits(retired[t.id])} retired`}
                />
              )}
            </div>
            <div className="supply-values">
              <strong>{formatCredits(issued[t.id])}</strong> issued
              <span className="muted"> · {formatCredits(retired[t.id])} retired</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Dashboard() {
  const { data } = useApp()
  const issued = sum(data.issued)
  const retired = sum(data.retired)
  const activeListings = data.listings.filter((l) => l.active)
  const approved = data.activities.filter((a) => a.status === 1)
  const recent = approved.slice(-5).reverse()

  const stats = [
    ['Credits issued', formatCredits(issued)],
    ['In circulation', formatCredits(issued - retired)],
    ['Credits retired', formatCredits(retired)],
    ['Verified activities', approved.length],
    ['Open listings', activeListings.length],
  ]

  return (
    <>
      <section className="hero">
        <h1>A transparent marketplace for environmental credits</h1>
        <p>
          Earn credits for verified eco-friendly work, trade them peer-to-peer, and retire them to offset your
          footprint. Every claim, sale and retirement is recorded on the blockchain — no intermediaries, no
          double counting.
        </p>
        <div className="hero-actions">
          <a className="btn primary" href="#earn">Earn credits</a>
          <a className="btn" href="#market">Browse marketplace</a>
        </div>
      </section>

      <section className="stats">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <span className="stat-value">{value}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Credits by type</h2>
        <SupplyChart issued={data.issued} retired={data.retired} />
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="step-number">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Recently verified activities</h2>
        {recent.length === 0 ? (
          <Empty>No activities have been verified yet.</Empty>
        ) : (
          <ul className="rows">
            {recent.map((a) => (
              <li key={a.id} className="row">
                <div className="row-main">
                  <strong>{a.description}</strong>
                  <span className="muted small">
                    by <Address value={a.claimant} /> · verified by <Address value={a.verifier} /> · {formatDate(a.reviewedAt)}
                  </span>
                </div>
                <div className="row-side">
                  <strong>+{formatCredits(a.amountApproved)}</strong>
                  <TypeBadge type={a.creditType} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
