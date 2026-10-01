import { useState } from 'react'
import { id as keccakText, isAddress } from 'ethers'
import { Address, Empty, Field } from '../components/ui'
import { chainName } from '../lib/chain'
import { formatEth, sameAddress, shortAddress } from '../lib/format'
import { useApp } from '../state/context'
import { useEvents } from '../state/useEvents'

const VERIFIER_ROLE = keccakText('VERIFIER_ROLE')
const MAX_FEE_PERCENT = 10

// AccessControl keeps no member list, so replay the grant / revoke history.
function currentVerifiers(logs) {
  const members = new Map()
  for (const { name, args } of logs) {
    if (args.role !== VERIFIER_ROLE) continue
    if (name === 'RoleGranted') members.set(args.account.toLowerCase(), args.account)
    if (name === 'RoleRevoked') members.delete(args.account.toLowerCase())
  }
  return [...members.values()]
}

// Shared by both panels: runs one transaction at a time and reports whether it worked.
function useAction() {
  const { runTx } = useApp()
  const [busy, setBusy] = useState(false)
  const act = async (label, send) => {
    setBusy(true)
    const ok = await runTx(label, send)
    setBusy(false)
    return ok
  }
  return [busy, act]
}

function Verifiers() {
  const { wallet } = useApp()
  const events = useEvents()
  const [address, setAddress] = useState('')
  const [busy, act] = useAction()

  const verifiers = currentVerifiers(events.logs.filter((l) => l.name === 'RoleGranted' || l.name === 'RoleRevoked'))
  const candidate = address.trim()
  const valid = isAddress(candidate) && !verifiers.some((v) => sameAddress(v, candidate))

  const grant = async (e) => {
    e.preventDefault()
    const ok = await act(`Appoint verifier ${shortAddress(candidate)}`, () =>
      wallet.contracts.credit.grantRole(VERIFIER_ROLE, candidate),
    )
    if (ok) setAddress('')
  }

  const revoke = (verifier) =>
    act(`Remove verifier ${shortAddress(verifier)}`, () => wallet.contracts.credit.revokeRole(VERIFIER_ROLE, verifier))

  return (
    <section className="card">
      <h2>Verifiers</h2>
      {events.status !== 'ready' ? (
        <Empty>{events.status === 'error' ? `Could not load verifiers. ${events.error}` : 'Loading…'}</Empty>
      ) : verifiers.length === 0 ? (
        <Empty>No verifiers appointed.</Empty>
      ) : (
        <ul className="rows">
          {verifiers.map((v) => (
            <li className="row" key={v}>
              <div className="row-main">
                <Address value={v} />
                <span className="mono muted small">{v}</span>
              </div>
              <div className="row-side">
                <button type="button" className="btn danger" disabled={busy} onClick={() => revoke(v)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Appoint a verifier</h2>
      <form className="form" onSubmit={grant}>
        <Field label="Wallet address" hint={candidate !== '' && !valid ? 'Enter a valid address that is not already a verifier.' : null}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mono" />
        </Field>
        <button type="submit" className="btn primary" disabled={busy || !valid}>
          Grant verifier role
        </button>
      </form>
    </section>
  )
}

function Platform() {
  const { wallet, data } = useApp()
  const { platform } = data
  const { currency } = wallet
  const [feeText, setFeeText] = useState('')
  const [treasuryText, setTreasuryText] = useState('')
  const [busy, act] = useAction()
  const { market, credit } = wallet.contracts

  const feePercent = Number(feeText)
  const validFee = feeText.trim() !== '' && feePercent >= 0 && feePercent <= MAX_FEE_PERCENT && Number.isInteger(feePercent * 100)
  const treasury = treasuryText.trim()
  const validTreasury = isAddress(treasury) && !sameAddress(treasury, platform.treasury)

  const setFee = async (e) => {
    e.preventDefault()
    const ok = await act(`Set platform fee to ${feePercent}%`, () => market.setFee(Math.round(feePercent * 100)))
    if (ok) setFeeText('')
  }

  const setTreasury = async (e) => {
    e.preventDefault()
    const ok = await act(`Send fees to ${shortAddress(treasury)}`, () => market.setTreasury(treasury))
    if (ok) setTreasuryText('')
  }

  return (
    <section className="card">
      <h2>Marketplace revenue</h2>
      <dl className="facts">
        <dt>Platform fee on new listings</dt>
        <dd><strong>{platform.feeBps / 100}%</strong></dd>
        <dt>Fees collected, not yet withdrawn</dt>
        <dd><strong>{formatEth(platform.accruedFees, 6)} {currency}</strong></dd>
        <dt>Fees are paid out to</dt>
        <dd className="mono">{platform.treasury}</dd>
      </dl>

      {data.isMarketOwner ? (
        <>
          <button
            type="button"
            className="btn primary"
            disabled={busy || platform.accruedFees === 0n}
            onClick={() => act('Withdraw collected fees', () => market.withdrawFees())}
          >
            Withdraw fees
          </button>

          <form className="form" onSubmit={setFee}>
            <Field label="Change the fee (%)" hint={`0 to ${MAX_FEE_PERCENT}%. Applies to listings created from now on; existing listings keep their fee.`}>
              <div className="inline">
                <input value={feeText} onChange={(e) => setFeeText(e.target.value)} inputMode="decimal" placeholder="e.g. 2.5" />
                <button type="submit" className="btn" disabled={busy || !validFee}>
                  Set fee
                </button>
              </div>
            </Field>
          </form>

          <form className="form" onSubmit={setTreasury}>
            <Field label="Change the payout address">
              <div className="inline">
                <input value={treasuryText} onChange={(e) => setTreasuryText(e.target.value)} placeholder="0x…" className="mono" />
                <button type="submit" className="btn" disabled={busy || !validTreasury}>
                  Set address
                </button>
              </div>
            </Field>
          </form>
        </>
      ) : (
        <p className="muted small">Only the marketplace owner can change these.</p>
      )}

      <h2>Emergency controls</h2>
      <p className="muted small">
        Pausing is for emergencies such as a discovered bug. It never moves or removes anyone&apos;s credits, and sellers
        can still cancel listings while the marketplace is paused.
      </p>
      <div className="hero-actions">
        {data.isMarketOwner && (
          <button
            type="button"
            className={platform.marketPaused ? 'btn primary' : 'btn danger'}
            disabled={busy}
            onClick={() =>
              platform.marketPaused
                ? act('Resume marketplace', () => market.unpause())
                : act('Pause marketplace', () => market.pause())
            }
          >
            {platform.marketPaused ? 'Resume marketplace' : 'Pause marketplace'}
          </button>
        )}
        {data.isAdmin && (
          <button
            type="button"
            className={platform.creditPaused ? 'btn primary' : 'btn danger'}
            disabled={busy}
            onClick={() =>
              platform.creditPaused
                ? act('Resume credits', () => credit.unpause())
                : act('Pause all credit activity', () => credit.pause())
            }
          >
            {platform.creditPaused ? 'Resume credits' : 'Pause all credit activity'}
          </button>
        )}
      </div>

      <h2>Contracts</h2>
      <dl className="facts">
        <dt>Network</dt>
        <dd>{chainName(wallet.chainId)}</dd>
        <dt>EcoCredit</dt>
        <dd className="mono">{wallet.deployment.EcoCredit}</dd>
        <dt>EcoMarketplace</dt>
        <dd className="mono">{wallet.deployment.EcoMarketplace}</dd>
        <dt>Marketplace owner</dt>
        <dd className="mono">{platform.owner}</dd>
      </dl>
    </section>
  )
}

export function Admin() {
  const { data } = useApp()

  if (!data.isAdmin && !data.isMarketOwner) {
    return (
      <section>
        <h1>Admin</h1>
        <Empty>Only the platform admin can open this page.</Empty>
      </section>
    )
  }

  return (
    <>
      <section>
        <h1>Admin</h1>
        <p className="lead">
          Appoint the verifiers who review claims, manage the marketplace fee, and use the emergency controls. The
          admin cannot mint credits or touch anyone&apos;s balance.
        </p>
      </section>

      <div className="grid two">
        {data.isAdmin && <Verifiers />}
        <Platform />
      </div>
    </>
  )
}
