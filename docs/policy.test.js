import { describe, expect, test } from 'bun:test'
import { buildAuditRecord, evaluateScenario, VERIFIED_CRE_REFERENCE } from './policy.js'

const baseScenario = {
  change: 3.2,
  sentiment: 58,
  ageMinutes: 8,
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
      'change=3.2|sentiment=58|age=480|supply=valid|risk=20|action=PRACTICE_LONG|practiceOnly=true',
    )
  })

  test('blocks stale evidence and records the safety boundary', () => {
    const record = buildAuditRecord(evaluateScenario({ ...baseScenario, ageMinutes: 61 }))

    expect(record.decision.action).toBe('BLOCKED_STALE_OR_INVALID')
    expect(record.decision.riskScore).toBe(70)
    expect(record.safetyControls).toEqual({
      broadcastsTransactions: false,
      accessesPrivateKeys: false,
      signsTransactions: false,
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
})
