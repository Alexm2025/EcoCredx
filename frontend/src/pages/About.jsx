import { CHAINS, chainName } from '../lib/chain'
import { useApp } from '../state/context'

const REPO_URL = 'https://github.com/Alexm2025/EcoCredx'

function ContractLink({ address }) {
  const { wallet } = useApp()
  const explorer = CHAINS[wallet.chainId]?.explorer
  if (!explorer) return <span className="mono">{address}</span>
  return (
    <a className="mono" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
      {address}
    </a>
  )
}

export function About() {
  const { wallet, data } = useApp()
  const { platform } = data
  const testnet = CHAINS[wallet.chainId]?.testnet

  return (
    <>
      <section>
        <h1>About EcoCredx</h1>
        <p className="lead">
          EcoCredx is a marketplace where environmental credits are earned through verified eco-friendly work, traded
          peer-to-peer, and retired to claim their benefit. The rules are enforced by public smart contracts rather
          than by a company database.
        </p>
      </section>

      <div className="grid two">
        <section className="card prose">
          <h2>How credits are created</h2>
          <p>
            A participant submits an activity with evidence. An appointed verifier reviews it and approves or rejects
            it. Credits are minted only on approval — nobody, including the platform admin, can create credits any
            other way.
          </p>
          <h2>What the blockchain guarantees</h2>
          <ul>
            <li>The same evidence cannot back two claims.</li>
            <li>Retired credits are destroyed and cannot be sold or retired again.</li>
            <li>Listed credits are held in escrow, so a purchase always completes or is fully undone.</li>
            <li>Every claim, sale and retirement is permanently recorded and publicly visible.</li>
          </ul>
          <h2>What it does not guarantee</h2>
          <p>
            The blockchain proves that a verifier approved a claim; it cannot prove the activity itself happened. The
            quality of a credit depends on the verifier who approved it. Check the evidence and the verifier before
            you buy.
          </p>
        </section>

        <section className="card prose">
          <h2>Fees</h2>
          <p>
            Buyers pay the listed price. Sellers receive it minus a platform fee, currently{' '}
            <strong>{platform.feeBps / 100}%</strong> on new listings. The fee is fixed for a listing when it is
            created and can never exceed 10%. You also pay the network&apos;s transaction fee (gas) for each action.
          </p>
          <h2>Risks you accept</h2>
          <ul>
            <li>Transactions are final. A mistaken transfer, purchase or retirement cannot be reversed.</li>
            <li>You alone control your wallet. If you lose its recovery phrase, nobody can restore your credits.</li>
            <li>Prices are set by sellers in {wallet.currency}, whose value can change quickly.</li>
            <li>In an emergency the admin can pause activity. A pause never moves or removes your credits.</li>
            <li>The smart contracts have not been independently audited.</li>
          </ul>
          {testnet && (
            <p className="note">
              You are on {chainName(wallet.chainId)}, a test network. Credits, claims and prices shown here are for
              demonstration only and have no real-world value.
            </p>
          )}
          <h2>Privacy</h2>
          <p>
            EcoCredx has no accounts and collects no personal data. Your wallet address, claims, descriptions and
            evidence links are stored on a public blockchain, permanently. Do not submit anything you want to keep
            private. An evidence file you choose is fingerprinted in your browser and is never uploaded.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Verify it yourself</h2>
        <dl className="facts">
          <dt>Network</dt>
          <dd>{chainName(wallet.chainId)}</dd>
          <dt>Credit contract (EcoCredit)</dt>
          <dd><ContractLink address={wallet.deployment.EcoCredit} /></dd>
          <dt>Marketplace contract (EcoMarketplace)</dt>
          <dd><ContractLink address={wallet.deployment.EcoMarketplace} /></dd>
          <dt>Source code and contact</dt>
          <dd>
            <a href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL}</a> — report problems under Issues.
          </dd>
        </dl>
      </section>
    </>
  )
}
