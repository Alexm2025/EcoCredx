import { useState } from 'react'
import { ZeroAddress, ZeroHash } from 'ethers'
import { Address, Empty, TxLink } from '../components/ui'
import { CREDIT_TYPES } from '../lib/chain'
import { formatCredits, formatDate, formatEth, sameAddress } from '../lib/format'
import { useApp } from '../state/context'
import { useEvents } from '../state/useEvents'

const credits = (amount, type) => `${formatCredits(amount)} ${CREDIT_TYPES[Number(type)]?.name ?? ''} credits`

// Event -> { kind, text, parties } for display. Returns null for events not worth a ledger row.
function describe({ name, args }, marketAddress) {
  switch (name) {
    case 'ActivitySubmitted':
      return { kind: 'Claim', text: `Claim #${args.id} submitted for ${credits(args.amount, args.creditType)}`, parties: [args.claimant] }
    case 'ActivityApproved':
      return { kind: 'Issued', text: `Claim #${args.id} approved — ${credits(args.amount, args.creditType)} minted`, parties: [args.claimant, args.verifier] }
    case 'ActivityRejected':
      return { kind: 'Rejected', text: `Claim #${args.id} rejected — ${args.note}`, parties: [args.verifier] }
    case 'CreditsRetired':
      return { kind: 'Retired', text: `${credits(args.amount, args.creditType)} retired${args.reason ? ` — ${args.reason}` : ''}`, parties: [args.account] }
    case 'TransferSingle': {
      // mints, burns and escrow moves are already covered by their own events
      const internal = [args.from, args.to].some((a) => a === ZeroAddress || sameAddress(a, marketAddress))
      if (internal) return null
      return { kind: 'Transfer', text: `${credits(args.value, args.id)} sent`, parties: [args.from, args.to] }
    }
    case 'RoleGranted':
    case 'RoleRevoked': {
      const role = args.role === ZeroHash ? 'Admin' : 'Verifier'
      return { kind: 'Role', text: `${role} role ${name === 'RoleGranted' ? 'granted' : 'revoked'}`, parties: [args.account, args.sender] }
    }
    case 'ListingCreated':
      return { kind: 'Listed', text: `Listing #${args.id}: ${credits(args.amount, args.creditType)} at ${formatEth(args.pricePerCredit, 6)} ETH each`, parties: [args.seller] }
    case 'CreditsPurchased':
      return { kind: 'Sale', text: `${credits(args.amount, args.creditType)} bought from listing #${args.id} for ${formatEth(args.totalPrice, 6)} ETH`, parties: [args.buyer, args.seller] }
    case 'ListingCancelled':
      return { kind: 'Cancelled', text: `Listing #${args.id} cancelled — ${formatCredits(args.amountReturned)} credits returned`, parties: [args.seller] }
    case 'ListingPriceUpdated':
      return { kind: 'Price', text: `Listing #${args.id} repriced to ${formatEth(args.pricePerCredit, 6)} ETH each`, parties: [] }
    default:
      return null
  }
}

export function Ledger() {
  const { wallet } = useApp()
  const events = useEvents()
  const [onlyMine, setOnlyMine] = useState(false)

  const rows = events.logs
    .map((log) => ({ log, info: describe(log, wallet.deployment?.EcoMarketplace) }))
    .filter(({ info }) => info && (!onlyMine || info.parties.some((p) => sameAddress(p, wallet.account))))
    .reverse()

  return (
    <section>
      <div className="section-head">
        <h1>Public ledger</h1>
        {wallet.account && (
          <label className="check">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only my activity
          </label>
        )}
      </div>
      <p className="lead">
        Every claim, approval, sale, transfer and retirement, read directly from the blockchain. Nobody — including
        the platform admin — can edit or delete these records.
      </p>

      {events.status === 'error' ? (
        <Empty>Could not load the ledger. {events.error}</Empty>
      ) : events.status === 'loading' ? (
        <Empty>Loading ledger…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No records yet.</Empty>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Details</th>
                <th>Accounts</th>
                <th>Block</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ log, info }) => (
                <tr key={`${log.txHash}-${log.index}`}>
                  <td className="nowrap">{formatDate(log.timestamp)}</td>
                  <td><span className="pill">{info.kind}</span></td>
                  <td>{info.text}</td>
                  <td>
                    <div className="parties">
                      {info.parties.map((p, i) => (
                        <Address key={i} value={p} />
                      ))}
                    </div>
                  </td>
                  <td>{log.blockNumber}</td>
                  <td><TxLink hash={log.txHash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
