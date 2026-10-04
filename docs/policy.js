export const VERIFIED_CRE_REFERENCE = Object.freeze({
  runDate: '2026-10-04',
  cliVersion: '1.36.0',
  network: 'ethereum-sepolia',
  usdcContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  binaryHash: '76e7256265bd0ad6309463a346e05defa70a22982f001078d744ec73481373fe',
  configHash: '239acd1d464a76e4953b736e9223a593ea12ca931cade6133ebf7f670dc94403',
  auditHash: '0x01ff876154d8c0544daeb43bf71c5b7969bf35cf86352ec2fd43ff7698a65f8a',
  evidenceUrl: 'https://github.com/idforfugen/signalledger-cre/blob/main/evidence/cre-simulation.md',
})

const assertFinite = (label, value) => {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`)
}

const assertRange = (label, value, minimum, maximum) => {
  assertFinite(label, value)
  if (value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`)
  }
}

const riskFromChange = (change) => {
  const magnitude = Math.abs(change)
  if (magnitude >= 10) return 45
  if (magnitude >= 5) return 30
  if (magnitude >= 2) return 15
  return 5
}

const riskFromSentiment = (sentiment) => {
  if (sentiment <= 20) return 35
  if (sentiment <= 35) return 20
  if (sentiment >= 80) return 25
  if (sentiment >= 70) return 15
  return 5
}

export function evaluateScenario({
  change,
  sentiment,
  marketAgeMinutes,
  sentimentAgeHours,
  maxAllocationPercent,
  validSupply,
}) {
  assertFinite('change', change)
  assertRange('sentiment', sentiment, 0, 100)
  assertRange('marketAgeMinutes', marketAgeMinutes, 0, Number.MAX_SAFE_INTEGER)
  assertRange('sentimentAgeHours', sentimentAgeHours, 0, Number.MAX_SAFE_INTEGER)
  assertRange('maxAllocationPercent', maxAllocationPercent, 0, 25)
  if (typeof validSupply !== 'boolean') {
    throw new TypeError('validSupply must be a boolean')
  }

  const staleMarket = marketAgeMinutes > 60
  const staleSentiment = sentimentAgeHours > 26
  const stale = staleMarket || staleSentiment
  let risk = riskFromChange(change) + riskFromSentiment(sentiment)
  if (stale) risk += 50
  if (!validSupply) risk += 100
  risk = Math.min(100, risk)

  let action = 'HOLD'
  let allocation = 0
  const configuredMaxAllocationBps = Math.round(maxAllocationPercent * 100)
  let rationale = 'No configured edge; preserve optionality.'

  if (stale || !validSupply) {
    action = 'BLOCKED_STALE_OR_INVALID'
    const failures = []
    if (staleMarket) failures.push('Market evidence exceeded the 60-minute freshness limit.')
    if (staleSentiment) failures.push('Sentiment evidence exceeded the 26-hour freshness limit.')
    if (!validSupply) failures.push('The on-chain supply gate did not return a valid value.')
    rationale = failures.join(' ')
  } else if (risk >= 70) {
    action = 'REDUCE_EXPOSURE'
    allocation = Math.min(20, maxAllocationPercent)
    rationale = 'Combined volatility and sentiment risk crossed 70.'
  } else if (change >= 3 && sentiment >= 45 && sentiment <= 75) {
    action = 'PRACTICE_LONG'
    allocation = Math.min(25, maxAllocationPercent)
    rationale = 'Positive momentum with non-extreme sentiment.'
  } else if (change <= -3 && sentiment <= 35) {
    action = 'WATCH_REVERSAL'
    allocation = Math.min(10, maxAllocationPercent)
    rationale = 'Oversold conditions detected; wait for confirmation.'
  }

  const canonicalTrace = [
    `change=${change}`,
    `sentiment=${sentiment}`,
    `marketAgeSeconds=${marketAgeMinutes * 60}`,
    `sentimentAgeSeconds=${sentimentAgeHours * 60 * 60}`,
    `supply=${validSupply ? 'valid' : 'invalid'}`,
    `configuredMaxAllocationBps=${configuredMaxAllocationBps}`,
    `risk=${risk}`,
    `action=${action}`,
    'practiceOnly=true',
  ].join('|')

  return {
    evidence: {
      btc24hChangePercent: change,
      sentimentScore: sentiment,
      marketFeedAgeSeconds: marketAgeMinutes * 60,
      sentimentFeedAgeSeconds: sentimentAgeHours * 60 * 60,
      onChainSupplyGate: validSupply ? 'valid' : 'invalid',
    },
    decision: {
      action,
      riskScore: risk,
      maxSimulatedAllocationPercent: allocation,
      configuredMaxAllocationPercent: maxAllocationPercent,
      rationale,
      practiceOnly: true,
    },
    canonicalTrace,
  }
}

export function buildAuditRecord(result) {
  return {
    schemaVersion: 'signalledger.audit.v1',
    recordType: 'deterministic-practice-decision',
    evidence: result.evidence,
    decision: result.decision,
    canonicalTrace: result.canonicalTrace,
    policy: {
      identifier: 'signalledger.practice-policy.v1',
      marketMaxAgeSeconds: 3600,
      sentimentMaxAgeSeconds: 93600,
      systemMaxAllocationBps: 2500,
      configuredMaxAllocationBps: Math.round(
        result.decision.configuredMaxAllocationPercent * 100,
      ),
      requiresPositiveOnChainSupply: true,
      implementationUrl:
        'https://github.com/idforfugen/signalledger-cre/blob/main/docs/policy.js',
    },
    verifiedCreReference: VERIFIED_CRE_REFERENCE,
    safetyControls: {
      broadcastsTransactions: false,
      accessesPrivateKeys: false,
      signsTransactions: false,
    },
  }
}

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export async function sealAuditRecord(record, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle) throw new Error('Web Crypto is required to seal the audit record')

  const payload = new TextEncoder().encode(JSON.stringify(record))
  const digest = await cryptoProvider.subtle.digest('SHA-256', payload)

  return {
    ...record,
    recordDigest: {
      algorithm: 'SHA-256',
      value: `0x${toHex(new Uint8Array(digest))}`,
      scope: 'UTF-8 JSON of this record before recordDigest is attached',
    },
  }
}
