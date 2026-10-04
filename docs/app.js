import { buildAuditRecord, evaluateScenario, sealAuditRecord } from './policy.js'

const changeInput = document.querySelector('#change')
const sentimentInput = document.querySelector('#sentiment')
const marketAgeInput = document.querySelector('#market-age')
const sentimentAgeInput = document.querySelector('#sentiment-age')
const supplyInput = document.querySelector('#supply')
const downloadButton = document.querySelector('#download-audit')
const downloadStatus = document.querySelector('#download-status')

let currentAuditRecord
let evaluationVersion = 0

async function evaluate() {
  const version = ++evaluationVersion
  const change = Number(changeInput.value)
  const sentiment = Number(sentimentInput.value)
  const marketAgeMinutes = Number(marketAgeInput.value)
  const sentimentAgeHours = Number(sentimentAgeInput.value)
  const validSupply = supplyInput.checked
  const result = evaluateScenario({
    change,
    sentiment,
    marketAgeMinutes,
    sentimentAgeHours,
    validSupply,
  })
  const { action, riskScore, maxSimulatedAllocationPercent, rationale } = result.decision
  currentAuditRecord = undefined
  downloadButton.disabled = true

  document.querySelector('#change-output').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
  document.querySelector('#sentiment-output').textContent = sentiment
  document.querySelector('#market-age-output').textContent = `${marketAgeMinutes} min`
  document.querySelector('#sentiment-age-output').textContent = `${sentimentAgeHours} hr`
  document.querySelector('#risk-score').textContent = riskScore
  document.querySelector('#score-ring').style.setProperty('--score', riskScore)
  document.querySelector('#action').textContent = action
  document.querySelector('#rationale').textContent = rationale
  document.querySelector('#allocation').textContent = `${maxSimulatedAllocationPercent}%`
  document.querySelector('#trace-value').textContent = result.canonicalTrace
  document.querySelector('#record-digest').textContent = 'Calculating…'
  downloadStatus.textContent = 'Sealing deterministic audit record…'

  try {
    const sealedRecord = await sealAuditRecord(buildAuditRecord(result))
    if (version !== evaluationVersion) return

    currentAuditRecord = sealedRecord
    document.querySelector('#record-digest').textContent = sealedRecord.recordDigest.value
    downloadButton.disabled = false
    downloadStatus.textContent = 'Portable JSON · change an input and the digest changes'
  } catch {
    if (version !== evaluationVersion) return
    document.querySelector('#record-digest').textContent = 'Digest unavailable in this browser'
    downloadStatus.textContent = 'Audit export is unavailable without Web Crypto'
  }
}

function downloadAuditRecord() {
  if (!currentAuditRecord) return

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

for (const input of [changeInput, sentimentInput, marketAgeInput, sentimentAgeInput, supplyInput]) {
  input.addEventListener('input', evaluate)
  input.addEventListener('change', evaluate)
}

downloadButton.addEventListener('click', downloadAuditRecord)

evaluate()
