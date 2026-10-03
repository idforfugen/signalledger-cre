export const VERIFIED_CRE_REFERENCE = Object.freeze({
  runDate: '2026-10-04',
  cliVersion: '1.36.0',
  network: 'ethereum-sepolia',
  usdcContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  binaryHash: '0a2d5d9a446af31e5642cbee9b787a49a76cdf48133c272e8fb917068ab97689',
  configHash: 'd9114c1996d7a9b6f890b5c8fb90c8aa5b873572820a2fd319e238f133335ef4',
  auditHash: '0xb08177f1727c954d495cc38849645be97863318f9001d402d01c6b021e62ba3e',
  evidenceUrl: 'https://github.com/idforfugen/signalledger-cre/blob/main/evidence/cre-simulation.md',
})

const assertFinite = (label, value) => {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`)
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

export function evaluateScenario({ change, sentiment, ageMinutes, validSupply }) {
  assertFinite('change', change)
  assertFinite('sentiment', sentiment)
  assertFinite('ageMinutes', ageMinutes)

  const stale = ageMinutes > 60
  let risk = riskFromChange(change) + riskFromSentiment(sentiment)
  if (stale) risk += 50
  if (!validSupply) risk += 100
  risk = Math.min(100, risk)

  let action = 'HOLD'
  let allocation = 0
  let rationale = 'No configured edge; preserve optionality.'

  if (stale || !validSupply) {
    action = 'BLOCKED_STALE_OR_INVALID'
    rationale = stale
      ? 'Evidence exceeded the 60-minute freshness limit.'
      : 'The on-chain supply gate did not return a valid value.'
  } else if (risk >= 70) {
    action = 'REDUCE_EXPOSURE'
    allocation = 20
    rationale = 'Combined volatility and sentiment risk crossed 70.'
  } else if (change >= 3 && sentiment >= 45 && sentiment <= 75) {
    action = 'PRACTICE_LONG'
    allocation = 25
    rationale = 'Positive momentum with non-extreme sentiment.'
  } else if (change <= -3 && sentiment <= 35) {
    action = 'WATCH_REVERSAL'
    allocation = 10
    rationale = 'Oversold conditions detected; wait for confirmation.'
  }

  const canonicalTrace = [
    `change=${change}`,
    `sentiment=${sentiment}`,
    `age=${ageMinutes * 60}`,
    `supply=${validSupply ? 'valid' : 'invalid'}`,
    `risk=${risk}`,
    `action=${action}`,
    'practiceOnly=true',
  ].join('|')

  return {
    evidence: {
      btc24hChangePercent: change,
      sentimentScore: sentiment,
      marketFeedAgeSeconds: ageMinutes * 60,
      onChainSupplyGate: validSupply ? 'valid' : 'invalid',
    },
    decision: {
      action,
      riskScore: risk,
      maxSimulatedAllocationPercent: allocation,
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
    verifiedCreReference: VERIFIED_CRE_REFERENCE,
    safetyControls: {
      broadcastsTransactions: false,
      accessesPrivateKeys: false,
      signsTransactions: false,
    },
  }
}
