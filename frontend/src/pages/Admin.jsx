import { useState } from 'react'
import { id as keccakText, isAddress } from 'ethers'
import { Address, Empty, Field } from '../components/ui'
import { chainName } from '../lib/chain'
import { sameAddress, shortAddress } from '../lib/format'
import { useApp } from '../state/context'
import { useEvents } from '../state/useEvents'

const VERIFIER_ROLE = keccakText('VERIFIER_ROLE')

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

export function Admin() {
  const { wallet, data, runTx } = useApp()
  const events = useEvents()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  if (!data.isAdmin) {
    return (
      <section>
        <h1>Admin</h1>
        <Empty>Only the platform admin can manage verifiers.</Empty>
      </section>
    )
  }

  const verifiers = currentVerifiers(events.logs.filter((l) => l.name === 'RoleGranted' || l.name === 'RoleRevoked'))
  const candidate = address.trim()
  const valid = isAddress(candidate) && !verifiers.some((v) => sameAddress(v, candidate))

  const act = async (label, send) => {
    setBusy(true)
    const ok = await runTx(label, send)
    setBusy(false)
    return ok
  }

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
    <>
      <section>
        <h1>Admin</h1>
        <p className="lead">
          Verifiers are the trusted reviewers who approve or reject claims. The admin appoints them but cannot mint
          credits directly.
        </p>
      </section>

      <div className="grid two">
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
        </section>

        <section className="card">
          <h2>Appoint a verifier</h2>
          <form className="form" onSubmit={grant}>
            <Field label="Wallet address" hint={candidate !== '' && !valid ? 'Enter a valid address that is not already a verifier.' : null}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mono" />
            </Field>
            <button type="submit" className="btn primary" disabled={busy || !valid}>
              Grant verifier role
            </button>
          </form>

          <h2>Contracts</h2>
          <dl className="facts">
            <dt>Network</dt>
            <dd>{chainName(wallet.chainId)}</dd>
            <dt>EcoCredit</dt>
            <dd className="mono">{wallet.deployment.EcoCredit}</dd>
            <dt>EcoMarketplace</dt>
            <dd className="mono">{wallet.deployment.EcoMarketplace}</dd>
          </dl>
        </section>
      </div>
    </>
  )
}
