import { useState } from 'react'
import { Address, Empty } from '../components/ui'
import { formatCredits, parseAmount, sameAddress } from '../lib/format'
import { useApp } from '../state/context'
import { ActivityRow } from './Earn'

function ReviewControls({ activity }) {
  const { wallet, runTx } = useApp()
  const [amountText, setAmountText] = useState(activity.amountRequested.toString())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (sameAddress(activity.claimant, wallet.account)) {
    return <span className="note">This is your own claim — another verifier has to review it.</span>
  }

  const amount = parseAmount(amountText)
  const validAmount = amount !== null && amount <= activity.amountRequested

  const act = async (label, send) => {
    setBusy(true)
    await runTx(label, send)
    setBusy(false)
  }

  const approve = () =>
    act(`Approve activity #${activity.id}`, () => wallet.contracts.credit.approveActivity(activity.id, amount, note.trim()))
  const reject = () =>
    act(`Reject activity #${activity.id}`, () => wallet.contracts.credit.rejectActivity(activity.id, note.trim()))

  return (
    <div className="review">
      <span className="muted small">
        Claimed by <Address value={activity.claimant} />
      </span>
      <div className="inline">
        <input
          className="narrow"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          inputMode="numeric"
          aria-label="Credits to approve"
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Note for the claimant" aria-label="Review note" />
        <button type="button" className="btn primary" disabled={busy || !validAmount} onClick={approve}>
          Approve
        </button>
        <button type="button" className="btn danger" disabled={busy || note.trim() === ''} onClick={reject}>
          Reject
        </button>
      </div>
      <span className="muted small">
        {validAmount
          ? 'Approving mints the credits to the claimant. Rejecting needs a note.'
          : `Approve between 1 and ${formatCredits(activity.amountRequested)} credits.`}
      </span>
    </div>
  )
}

export function Verify() {
  const { data } = useApp()
  const pending = data.activities.filter((a) => a.status === 0)
  const reviewed = data.activities.filter((a) => a.status !== 0).reverse()

  if (!data.isVerifier) {
    return (
      <section>
        <h1>Verify claims</h1>
        <Empty>Only accounts with the verifier role can review claims.</Empty>
      </section>
    )
  }

  return (
    <>
      <section>
        <h1>Verify claims</h1>
        <p className="lead">Check the evidence behind each claim. Credits only exist once a verifier approves them.</p>
        <h2>Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? (
          <Empty>Nothing is waiting for review.</Empty>
        ) : (
          <ul className="rows card">
            {pending.map((a) => (
              <ActivityRow key={a.id} activity={a}>
                <ReviewControls activity={a} />
              </ActivityRow>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Already reviewed</h2>
        {reviewed.length === 0 ? (
          <Empty>No claims have been reviewed yet.</Empty>
        ) : (
          <ul className="rows card">
            {reviewed.map((a) => (
              <ActivityRow key={a.id} activity={a}>
                <span className="muted small">
                  Claimed by <Address value={a.claimant} /> · reviewed by <Address value={a.verifier} />
                </span>
              </ActivityRow>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
