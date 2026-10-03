import { buildAuditRecord, evaluateScenario } from './policy.js'

const changeInput = document.querySelector('#change')
const sentimentInput = document.querySelector('#sentiment')
const ageInput = document.querySelector('#age')
const supplyInput = document.querySelector('#supply')
const downloadButton = document.querySelector('#download-audit')
const downloadStatus = document.querySelector('#download-status')

let currentAuditRecord

function evaluate() {
  const change = Number(changeInput.value)
  const sentiment = Number(sentimentInput.value)
  const ageMinutes = Number(ageInput.value)
  const validSupply = supplyInput.checked
  const result = evaluateScenario({ change, sentiment, ageMinutes, validSupply })
  const { action, riskScore, maxSimulatedAllocationPercent, rationale } = result.decision
  currentAuditRecord = buildAuditRecord(result)

  document.querySelector('#change-output').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
  document.querySelector('#sentiment-output').textContent = sentiment
  document.querySelector('#age-output').textContent = `${ageMinutes} min`
  document.querySelector('#risk-score').textContent = riskScore
  document.querySelector('#score-ring').style.setProperty('--score', riskScore)
  document.querySelector('#action').textContent = action
  document.querySelector('#rationale').textContent = rationale
  document.querySelector('#allocation').textContent = `${maxSimulatedAllocationPercent}%`
  document.querySelector('#trace-value').textContent = result.canonicalTrace
  downloadStatus.textContent = 'Portable JSON · same evidence produces the same record'
}

function downloadAuditRecord() {
  const blob = new Blob([`${JSON.stringify(currentAuditRecord, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `signalledger-audit-${currentAuditRecord.decision.action.toLowerCase()}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  downloadStatus.textContent = 'Audit record downloaded · no data left this browser'
}

for (const input of [changeInput, sentimentInput, ageInput, supplyInput]) {
  input.addEventListener('input', evaluate)
  input.addEventListener('change', evaluate)
}

downloadButton.addEventListener('click', downloadAuditRecord)

evaluate()
