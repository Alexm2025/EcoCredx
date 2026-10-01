import { useState } from 'react'
import { isAddress } from 'ethers'
import { ConnectPrompt, Empty, Field, TypeBadge, TypeSelect } from '../components/ui'
import { CREDIT_TYPES } from '../lib/chain'
import { formatCredits, formatDate, formatEth, parseAmount, sameAddress } from '../lib/format'
import { useApp } from '../state/context'

function TransferForm() {
  const { wallet, data, runTx } = useApp()
  const [type, setType] = useState(0)
  const [amountText, setAmountText] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)

  const amount = parseAmount(amountText)
  const enough = amount !== null && amount <= data.balances[type]
  const validTo = isAddress(to.trim()) && !sameAddress(to.trim(), wallet.account)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const ok = await runTx(`Send ${formatCredits(amount)} ${CREDIT_TYPES[type].name} credits`, () =>
      wallet.contracts.credit.safeTransferFrom(wallet.account, to.trim(), type, amount, '0x'),
    )
    if (ok) {
      setAmountText('')
      setTo('')
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Credit type">
        <TypeSelect value={type} onChange={setType} balances={data.balances} />
      </Field>
      <Field label="Amount" hint={amount !== null && !enough ? 'More than you hold.' : null}>
        <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" placeholder="e.g. 10" />
      </Field>
      <Field label="Recipient address" hint={to.trim() !== '' && !validTo ? 'Enter another valid wallet address.' : null}>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="mono" />
      </Field>
      <button type="submit" className="btn primary" disabled={busy || !enough || !validTo}>
        Send credits
      </button>
    </form>
  )
}

function RetireForm() {
  const { wallet, data, runTx } = useApp()
  const [type, setType] = useState(0)
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const amount = parseAmount(amountText)
  const enough = amount !== null && amount <= data.balances[type]

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const ok = await runTx(`Retire ${formatCredits(amount)} ${CREDIT_TYPES[type].name} credits`, () =>
      wallet.contracts.credit.retire(type, amount, reason.trim()),
    )
    if (ok) {
      setAmountText('')
      setReason('')
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Credit type">
        <TypeSelect value={type} onChange={setType} balances={data.balances} />
      </Field>
      <Field label="Amount" hint={amount !== null && !enough ? 'More than you hold.' : null}>
        <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" placeholder="e.g. 10" />
      </Field>
      <Field label="Reason / beneficiary" hint="Shown publicly on the retirement certificate.">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140} placeholder="e.g. Offsetting our 2026 annual event" />
      </Field>
      <button type="submit" className="btn primary" disabled={busy || !enough}>
        Retire permanently
      </button>
      <p className="muted small">Retired credits are burned. This cannot be undone.</p>
    </form>
  )
}

export function Wallet() {
  const { wallet, data } = useApp()

  if (!wallet.account) {
    return (
      <section>
        <h1>My wallet</h1>
        <ConnectPrompt>Connect a wallet to see and manage your credits.</ConnectPrompt>
      </section>
    )
  }

  const myRetirements = data.retirements.filter((r) => sameAddress(r.account, wallet.account)).reverse()
  const retiredByType = CREDIT_TYPES.map((t) =>
    myRetirements.filter((r) => r.creditType === t.id).reduce((total, r) => total + r.amount, 0n),
  )
  const escrowByType = CREDIT_TYPES.map((t) =>
    data.listings
      .filter((l) => l.active && l.creditType === t.id && sameAddress(l.seller, wallet.account))
      .reduce((total, l) => total + l.amount, 0n),
  )

  return (
    <>
      <section>
        <h1>My wallet</h1>
        <p className="lead">
          <span className="mono">{wallet.account}</span> · {formatEth(data.ethBalance)} ETH
        </p>
        <div className="grid balances">
          {CREDIT_TYPES.map((t) => (
            <div className="stat" key={t.id}>
              <TypeBadge type={t.id} />
              <span className="stat-value">{formatCredits(data.balances[t.id])}</span>
              <span className="stat-label">
                {formatCredits(escrowByType[t.id])} listed for sale · {formatCredits(retiredByType[t.id])} retired
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid two">
        <section className="card">
          <h2>Send credits</h2>
          <TransferForm />
        </section>
        <section className="card">
          <h2>Retire credits</h2>
          <RetireForm />
        </section>
      </div>

      <section className="card">
        <h2>Retirement certificates</h2>
        {myRetirements.length === 0 ? (
          <Empty>You have not retired any credits yet.</Empty>
        ) : (
          <ul className="rows">
            {myRetirements.map((r) => (
              <li className="row" key={r.id}>
                <div className="row-main">
                  <strong>Certificate #{r.id}</strong>
                  <span className="muted small">{formatDate(r.retiredAt)}</span>
                  {r.reason && <span className="note">{r.reason}</span>}
                </div>
                <div className="row-side">
                  <strong>{formatCredits(r.amount)}</strong>
                  <TypeBadge type={r.creditType} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
