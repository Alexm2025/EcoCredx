import { useState } from 'react'
import { parseEther } from 'ethers'
import { Address, ConnectPrompt, Empty, Field, TypeBadge, TypeSelect } from '../components/ui'
import { CREDIT_TYPES } from '../lib/chain'
import { formatCredits, formatDate, formatEth, parseAmount, sameAddress } from '../lib/format'
import { useApp } from '../state/context'

function parsePrice(text) {
  try {
    const wei = parseEther(text.trim())
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

function ListingCard({ listing }) {
  const { wallet, runTx } = useApp()
  const [quantity, setQuantity] = useState('1')
  const [newPrice, setNewPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = sameAddress(listing.seller, wallet.account)

  const amount = parseAmount(quantity)
  const validAmount = amount !== null && amount <= listing.amount
  const total = validAmount ? amount * listing.pricePerCredit : null
  const price = parsePrice(newPrice)

  const act = async (label, send) => {
    setBusy(true)
    const ok = await runTx(label, send)
    setBusy(false)
    return ok
  }

  const buy = () =>
    act(`Buy ${formatCredits(amount)} ${CREDIT_TYPES[listing.creditType].name} credits`, () =>
      wallet.contracts.market.buy(listing.id, amount, { value: total }),
    )

  const updatePrice = async () => {
    const ok = await act(`Update price of listing #${listing.id}`, () => wallet.contracts.market.updatePrice(listing.id, price))
    if (ok) setNewPrice('')
  }

  const cancel = () => act(`Cancel listing #${listing.id}`, () => wallet.contracts.market.cancelListing(listing.id))

  return (
    <article className="listing">
      <header className="listing-head">
        <TypeBadge type={listing.creditType} />
        <span className="muted small">#{listing.id}</span>
      </header>
      <p className="listing-price">
        {formatEth(listing.pricePerCredit, 6)} <span className="unit">ETH / credit</span>
      </p>
      <p className="listing-meta">
        <strong>{formatCredits(listing.amount)}</strong> available
      </p>
      <p className="muted small">
        Seller <Address value={listing.seller} /> · listed {formatDate(listing.createdAt)}
      </p>

      {!wallet.account ? (
        <p className="muted small">Connect a wallet to buy.</p>
      ) : mine ? (
        <div className="listing-actions">
          <div className="inline">
            <input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="New price (ETH)"
              inputMode="decimal"
              aria-label="New price in ETH"
            />
            <button type="button" className="btn" disabled={busy || !price} onClick={updatePrice}>
              Update
            </button>
          </div>
          <button type="button" className="btn danger" disabled={busy} onClick={cancel}>
            Cancel listing
          </button>
        </div>
      ) : (
        <div className="listing-actions">
          <div className="inline">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
              aria-label="Credits to buy"
            />
            <button type="button" className="btn primary" disabled={busy || !validAmount} onClick={buy}>
              Buy
            </button>
          </div>
          <span className="muted small">
            {validAmount ? `Total ${formatEth(total, 6)} ETH` : `Enter 1 – ${formatCredits(listing.amount)}`}
          </span>
        </div>
      )}
    </article>
  )
}

function SellForm() {
  const { wallet, data, runTx } = useApp()
  const [type, setType] = useState(0)
  const [amountText, setAmountText] = useState('')
  const [priceText, setPriceText] = useState('')
  const [busy, setBusy] = useState(false)

  const amount = parseAmount(amountText)
  const price = parsePrice(priceText)
  const enough = amount !== null && amount <= data.balances[type]
  const canSubmit = enough && price !== null && !busy

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { credit, market } = wallet.contracts
    // One-time permission that lets the marketplace hold credits in escrow
    const approved =
      data.marketApproved ||
      (await runTx('Approve marketplace', () => credit.setApprovalForAll(wallet.deployment.EcoMarketplace, true)))
    if (approved) {
      const ok = await runTx(`List ${formatCredits(amount)} ${CREDIT_TYPES[type].name} credits`, () =>
        market.createListing(type, amount, price),
      )
      if (ok) {
        setAmountText('')
        setPriceText('')
      }
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Credit type">
        <TypeSelect value={type} onChange={setType} balances={data.balances} />
      </Field>
      <Field label="Credits to sell" hint={amount !== null && !enough ? 'More than you hold.' : null}>
        <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" placeholder="e.g. 50" />
      </Field>
      <Field label="Price per credit (ETH)">
        <input value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" placeholder="e.g. 0.01" />
      </Field>
      <button type="submit" className="btn primary" disabled={!canSubmit}>
        {data.marketApproved ? 'List for sale' : 'Approve & list for sale'}
      </button>
      {!data.marketApproved && (
        <p className="muted small">
          First time selling needs two confirmations: one to let the marketplace escrow your credits, one to create the listing.
        </p>
      )}
    </form>
  )
}

export function Marketplace() {
  const { wallet, data } = useApp()
  const [filter, setFilter] = useState(null)

  const active = data.listings.filter((l) => l.active)
  const shown = active.filter((l) => filter === null || l.creditType === filter).reverse()

  return (
    <div className="split">
      <section>
        <div className="section-head">
          <h1>Marketplace</h1>
          <div className="chips" role="group" aria-label="Filter by credit type">
            <button type="button" className={filter === null ? 'chip active' : 'chip'} onClick={() => setFilter(null)}>
              All ({active.length})
            </button>
            {CREDIT_TYPES.map((t) => (
              <button key={t.id} type="button" className={filter === t.id ? 'chip active' : 'chip'} onClick={() => setFilter(t.id)}>
                <span className={`dot type-${t.key}`} aria-hidden="true" />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <Empty>No credits are listed for sale{filter === null ? '' : ' in this category'} right now.</Empty>
        ) : (
          <div className="grid">
            {shown.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <aside className="card">
        <h2>Sell your credits</h2>
        {wallet.account ? <SellForm /> : <ConnectPrompt>Connect a wallet to list credits for sale.</ConnectPrompt>}
      </aside>
    </div>
  )
}
