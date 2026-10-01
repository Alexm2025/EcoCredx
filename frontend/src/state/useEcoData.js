import { useCallback, useEffect, useState } from 'react'
import { ZeroHash, id as keccakText } from 'ethers'
import { CREDIT_TYPES, LOCAL_CHAIN_ID } from '../lib/chain'
import { errorMessage, sameAddress } from '../lib/format'

const PAGE_SIZE = 100
const REFRESH_MS = 5000
const PUBLIC_REFRESH_MS = 15000 // public chains are slower and their free endpoints are rate limited
const VERIFIER_ROLE = keccakText('VERIFIER_ROLE')
const ZEROES = CREDIT_TYPES.map(() => 0n)

async function fetchAll(count, getPage) {
  const total = Number(count)
  const pages = []
  for (let offset = 0; offset < total; offset += PAGE_SIZE) pages.push(getPage(offset, PAGE_SIZE))
  return (await Promise.all(pages)).flat()
}

const toActivity = (a) => ({
  id: Number(a.id),
  claimant: a.claimant,
  creditType: Number(a.creditType),
  amountRequested: a.amountRequested,
  amountApproved: a.amountApproved,
  evidenceHash: a.evidenceHash,
  description: a.description,
  evidenceURI: a.evidenceURI,
  status: Number(a.status),
  verifier: a.verifier,
  reviewNote: a.reviewNote,
  submittedAt: Number(a.submittedAt),
  reviewedAt: Number(a.reviewedAt),
})

const toListing = (l) => ({
  id: Number(l.id),
  seller: l.seller,
  creditType: Number(l.creditType),
  amount: l.amount,
  pricePerCredit: l.pricePerCredit,
  active: l.active,
  createdAt: Number(l.createdAt),
  feeBps: Number(l.feeBps),
})

const toRetirement = (r) => ({
  id: Number(r.id),
  account: r.account,
  creditType: Number(r.creditType),
  amount: r.amount,
  reason: r.reason,
  retiredAt: Number(r.retiredAt),
})

async function loadSnapshot({ contracts, readProvider, account, deployment }) {
  const { credit, market } = contracts

  const code = await readProvider.getCode(deployment.EcoCredit)
  if (code === '0x') {
    throw new Error('The EcoCredx contracts are not deployed on this chain yet. Run the deploy script, then reload.')
  }

  const [[issued, retired], activityCount, listingCount, retirementCount, blockNumber, platform] = await Promise.all([
    credit.supplyStats(),
    credit.activityCount(),
    market.listingCount(),
    credit.retirementCount(),
    readProvider.getBlockNumber(),
    Promise.all([market.feeBps(), market.treasury(), market.accruedFees(), market.owner(), market.paused(), credit.paused()]),
  ])

  const [activities, listings, retirements, mine] = await Promise.all([
    fetchAll(activityCount, (offset, limit) => credit.getActivities(offset, limit)),
    fetchAll(listingCount, (offset, limit) => market.getListings(offset, limit)),
    fetchAll(retirementCount, (offset, limit) => credit.getRetirements(offset, limit)),
    account
      ? Promise.all([
          credit.balancesOf(account),
          readProvider.getBalance(account),
          credit.hasRole(ZeroHash, account),
          credit.hasRole(VERIFIER_ROLE, account),
          credit.isApprovedForAll(account, deployment.EcoMarketplace),
        ])
      : null,
  ])

  return {
    blockNumber,
    issued: [...issued],
    retired: [...retired],
    activities: activities.map(toActivity),
    listings: listings.map(toListing),
    retirements: retirements.map(toRetirement),
    balances: mine ? [...mine[0]] : ZEROES,
    ethBalance: mine ? mine[1] : 0n,
    isAdmin: mine ? mine[2] : false,
    isVerifier: mine ? mine[3] : false,
    marketApproved: mine ? mine[4] : false,
    isMarketOwner: sameAddress(account, platform[3]),
    platform: {
      feeBps: Number(platform[0]),
      treasury: platform[1],
      accruedFees: platform[2],
      owner: platform[3],
      marketPaused: platform[4],
      creditPaused: platform[5],
    },
  }
}

const EMPTY = {
  status: 'loading',
  error: null,
  blockNumber: 0,
  issued: ZEROES,
  retired: ZEROES,
  activities: [],
  listings: [],
  retirements: [],
  balances: ZEROES,
  ethBalance: 0n,
  isAdmin: false,
  isVerifier: false,
  marketApproved: false,
  isMarketOwner: false,
  platform: { feeBps: 0, treasury: '', accruedFees: 0n, owner: '', marketPaused: false, creditPaused: false },
}

/** Everything the UI shows, read from the chain and re-read every few seconds. */
export function useEcoData(wallet) {
  const { contracts, readProvider, account, deployment, chainId } = wallet
  const key = `${chainId}:${account}`
  const [state, setState] = useState({ key: null, ...EMPTY })

  const load = useCallback(async () => {
    if (!contracts) return
    try {
      const snapshot = await loadSnapshot({ contracts, readProvider, account, deployment })
      setState({ key, ...EMPTY, ...snapshot, status: 'ready' })
    } catch (err) {
      // keep showing the last good data if a background refresh fails
      setState((prev) =>
        prev.key === key && prev.status === 'ready' ? prev : { key, ...EMPTY, status: 'error', error: errorMessage(err) },
      )
    }
  }, [contracts, readProvider, account, deployment, key])

  useEffect(() => {
    load()
    const timer = setInterval(load, chainId === LOCAL_CHAIN_ID ? REFRESH_MS : PUBLIC_REFRESH_MS)
    return () => clearInterval(timer)
  }, [load, chainId])

  // A snapshot taken for another account or chain is never shown
  const data = state.key === key ? state : EMPTY
  return { data, refresh: load }
}
