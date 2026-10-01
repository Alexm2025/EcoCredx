import { formatEther } from 'ethers'

export const shortAddress = (address) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '')

export const sameAddress = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase()

export const formatCredits = (amount) => BigInt(amount ?? 0).toLocaleString('en-US')

// Trims trailing noise: 0.010000 -> 0.01, 12.3456789 -> 12.3457
export function formatEth(wei, digits = 4) {
  const value = Number(formatEther(wei ?? 0n))
  if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toExponential(2)
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatDate(seconds) {
  if (!seconds) return '—'
  return new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const FRIENDLY_ERRORS = {
  ERC1155InsufficientBalance: 'You do not hold enough credits for this.',
  ERC1155MissingApprovalForAll: 'The marketplace is not approved to move your credits yet.',
  ERC1155InvalidReceiver: 'That address cannot receive credits.',
  AccessControlUnauthorizedAccount: 'This account does not have permission to do that.',
  OwnableUnauthorizedAccount: 'Only the marketplace owner can do that.',
  EnforcedPause: 'This is paused by the platform admin right now. Please try again later.',
}

// Turns an ethers / wallet error into one readable sentence.
export function errorMessage(err) {
  if (!err) return 'Something went wrong.'
  if (err.code === 'ACTION_REJECTED' || err.code === 4001) return 'Transaction cancelled in wallet.'
  if (err.code === 'INSUFFICIENT_FUNDS') return 'Not enough funds in your wallet to pay for this transaction.'
  if (err.revert?.name && FRIENDLY_ERRORS[err.revert.name]) return FRIENDLY_ERRORS[err.revert.name]

  const raw =
    err.reason ||
    err.info?.error?.data?.message ||
    err.info?.error?.message ||
    err.shortMessage ||
    err.message ||
    String(err)

  // some nodes report a custom error only as text: "reverted with custom error 'EnforcedPause()'"
  const custom = raw.match(/custom error '(\w+)\(/)
  if (custom) return FRIENDLY_ERRORS[custom[1]] ?? 'The contract refused this action.'

  const quoted = raw.match(/reason string '([^']+)'/)
  const text = (quoted ? quoted[1] : raw).replace(/^(EcoCredit|EcoMarketplace): /, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Whole, positive credit amounts only. Returns a bigint, or null if the text is not valid.
export function parseAmount(text) {
  return /^[1-9]\d{0,17}$/.test(text.trim()) ? BigInt(text.trim()) : null
}
