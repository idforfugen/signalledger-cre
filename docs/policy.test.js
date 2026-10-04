import { describe, expect, test } from 'bun:test'
import {
  buildAuditRecord,
  evaluateScenario,
  sealAuditRecord,
  VERIFIED_CRE_REFERENCE,
} from './policy.js'

const baseScenario = {
  change: 3.2,
  sentiment: 58,
  marketAgeMinutes: 8,
  sentimentAgeHours: 4,
  validSupply: true,
}

describe('interactive audit record', () => {
  test('exports a deterministic practice decision', () => {
    const first = buildAuditRecord(evaluateScenario(baseScenario))
    const second = buildAuditRecord(evaluateScenario(baseScenario))

    expect(first).toEqual(second)
    expect(first.decision).toEqual({
      action: 'PRACTICE_LONG',
      riskScore: 20,
      maxSimulatedAllocationPercent: 25,
      rationale: 'Positive momentum with non-extreme sentiment.',
      practiceOnly: true,
    })
    expect(first.canonicalTrace).toBe(
      'change=3.2|sentiment=58|marketAgeSeconds=480|sentimentAgeSeconds=14400|supply=valid|risk=20|action=PRACTICE_LONG|practiceOnly=true',
    )
  })

  test('blocks stale market evidence and records the safety boundary', () => {
    const record = buildAuditRecord(
      evaluateScenario({ ...baseScenario, marketAgeMinutes: 61 }),
    )

    expect(record.decision.action).toBe('BLOCKED_STALE_OR_INVALID')
    expect(record.decision.riskScore).toBe(70)
    expect(record.safetyControls).toEqual({
      broadcastsTransactions: false,
      accessesPrivateKeys: false,
      signsTransactions: false,
    })
  })

  test('blocks sentiment evidence only after its independent daily window', () => {
    const current = evaluateScenario({ ...baseScenario, sentimentAgeHours: 26 })
    const stale = evaluateScenario({ ...baseScenario, sentimentAgeHours: 27 })

    expect(current.decision.action).toBe('PRACTICE_LONG')
    expect(stale.decision.action).toBe('BLOCKED_STALE_OR_INVALID')
    expect(stale.decision.rationale).toContain('26-hour freshness limit')
  })

  test('seals identical records with the same portable digest', async () => {
    const record = buildAuditRecord(evaluateScenario(baseScenario))
    const first = await sealAuditRecord(record)
    const second = await sealAuditRecord(record)

    expect(first.recordDigest.algorithm).toBe('SHA-256')
    expect(first.recordDigest.value).toMatch(/^0x[0-9a-f]{64}$/)
    expect(first.recordDigest).toEqual(second.recordDigest)
    expect(first.policy).toEqual({
      identifier: 'signalledger.practice-policy.v1',
      marketMaxAgeSeconds: 3600,
      sentimentMaxAgeSeconds: 93600,
      requiresPositiveOnChainSupply: true,
      implementationUrl:
        'https://github.com/idforfugen/signalledger-cre/blob/main/docs/policy.js',
    })
  })

  test('links the portable record to the verified CRE run', () => {
    const record = buildAuditRecord(evaluateScenario(baseScenario))

    expect(record.verifiedCreReference).toBe(VERIFIED_CRE_REFERENCE)
    expect(record.verifiedCreReference.auditHash).toBe(
      '0xb08177f1727c954d495cc38849645be97863318f9001d402d01c6b021e62ba3e',
    )
  })

  test('rejects non-numeric evidence', () => {
    expect(() => evaluateScenario({ ...baseScenario, change: Number.NaN })).toThrow(
      'change must be a finite number',
    )
  })

  test('rejects impossible evidence ranges', () => {
    expect(() => evaluateScenario({ ...baseScenario, sentiment: 101 })).toThrow(
      'sentiment must be between 0 and 100',
    )
    expect(() => evaluateScenario({ ...baseScenario, marketAgeMinutes: -1 })).toThrow(
      'marketAgeMinutes must be between 0',
    )
  })
})
