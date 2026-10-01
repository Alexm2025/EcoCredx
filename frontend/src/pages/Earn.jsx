import { useState } from 'react'
import { keccak256, toUtf8Bytes } from 'ethers'
import { ConnectPrompt, Empty, Field, StatusPill, TypeBadge, TypeSelect } from '../components/ui'
import { CREDIT_TYPES } from '../lib/chain'
import { formatCredits, formatDate, parseAmount, sameAddress } from '../lib/format'
import { useApp } from '../state/context'

// The fingerprint is what stops the same evidence being claimed twice.
// A file is hashed in the browser and never uploaded; otherwise the link is hashed.
async function fingerprint(file, uri) {
  if (file) return keccak256(new Uint8Array(await file.arrayBuffer()))
  return keccak256(toUtf8Bytes(uri.trim().toLowerCase()))
}

function ClaimForm() {
  const { wallet, runTx, showToast } = useApp()
  const [type, setType] = useState(0)
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [uri, setUri] = useState('')
  const [file, setFile] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const amount = parseAmount(amountText)
  const hasEvidence = Boolean(file) || uri.trim() !== ''
  const canSubmit = amount !== null && description.trim() !== '' && hasEvidence && !busy

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { credit } = wallet.contracts
      const hash = await fingerprint(file, uri)
      const claimedBy = await credit.evidenceClaim(hash)
      if (claimedBy > 0n) {
        showToast({ kind: 'error', text: `This evidence already backs activity #${claimedBy - 1n}. The same evidence cannot be claimed twice.` })
        return
      }
      const ok = await runTx(`Submit claim for ${formatCredits(amount)} ${CREDIT_TYPES[type].name} credits`, () =>
        credit.submitActivity(type, amount, hash, description.trim(), uri.trim()),
      )
      if (ok) {
        setAmountText('')
        setDescription('')
        setUri('')
        setFile(null)
        setFormKey((k) => k + 1) // clears the file input
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} key={formKey}>
      <Field label="Credit type" hint={`${CREDIT_TYPES[type].examples}. 1 credit = 1 ${CREDIT_TYPES[type].unit}.`}>
        <TypeSelect value={type} onChange={setType} />
      </Field>
      <Field label="Credits claimed">
        <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" placeholder="e.g. 120" />
      </Field>
      <Field label="What did you do?">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="e.g. Planted 3,000 native saplings on the college campus"
        />
      </Field>
      <Field label="Evidence link" hint="Report, photo album, meter data… anything the verifier can open.">
        <input value={uri} onChange={(e) => setUri(e.target.value)} type="url" placeholder="https://…" />
      </Field>
      <Field label="Evidence file (optional)" hint="Fingerprinted in your browser — the file itself is not uploaded.">
        <input type="file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
      </Field>
      <button type="submit" className="btn primary" disabled={!canSubmit}>
        Submit for verification
      </button>
      {!hasEvidence && <p className="muted small">Add an evidence link or file to submit.</p>}
    </form>
  )
}

export function ActivityRow({ activity, children }) {
  return (
    <li className="row">
      <div className="row-main">
        <div className="row-title">
          <span className="muted small">#{activity.id}</span>
          <strong>{activity.description}</strong>
        </div>
        <span className="muted small">
          Submitted {formatDate(activity.submittedAt)}
          {/^https?:\/\//i.test(activity.evidenceURI) && (
            <>
              {' · '}
              <a href={activity.evidenceURI} target="_blank" rel="noreferrer">evidence</a>
            </>
          )}
          {' · fingerprint '}
          <span className="mono" title={activity.evidenceHash}>{activity.evidenceHash.slice(0, 10)}…</span>
        </span>
        {activity.reviewNote && <span className="note">Verifier note: {activity.reviewNote}</span>}
        {children}
      </div>
      <div className="row-side">
        <strong>
          {activity.status === 1 && activity.amountApproved !== activity.amountRequested
            ? `${formatCredits(activity.amountApproved)} of ${formatCredits(activity.amountRequested)}`
            : formatCredits(activity.amountRequested)}
        </strong>
        <TypeBadge type={activity.creditType} />
        <StatusPill status={activity.status} />
      </div>
    </li>
  )
}

export function Earn() {
  const { wallet, data } = useApp()
  const mine = data.activities.filter((a) => sameAddress(a.claimant, wallet.account)).reverse()

  return (
    <div className="split">
      <section>
        <h1>Earn credits</h1>
        <p className="lead">
          Claim credits for eco-friendly work. A verifier checks your evidence; once approved, the credits are
          minted to your wallet.
        </p>
        <h2>Your claims</h2>
        {!wallet.account ? (
          <ConnectPrompt>Connect a wallet to see your claims.</ConnectPrompt>
        ) : mine.length === 0 ? (
          <Empty>You have not submitted any activities yet.</Empty>
        ) : (
          <ul className="rows card">
            {mine.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </section>

      <aside className="card">
        <h2>New claim</h2>
        {wallet.account ? <ClaimForm /> : <ConnectPrompt>Connect a wallet to submit an activity.</ConnectPrompt>}
      </aside>
    </div>
  )
}
