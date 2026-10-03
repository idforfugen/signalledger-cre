const changeInput = document.querySelector('#change')
const sentimentInput = document.querySelector('#sentiment')
const ageInput = document.querySelector('#age')
const supplyInput = document.querySelector('#supply')

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

function evaluate() {
  const change = Number(changeInput.value)
  const sentiment = Number(sentimentInput.value)
  const ageMinutes = Number(ageInput.value)
  const validSupply = supplyInput.checked
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
    rationale = stale ? 'Evidence exceeded the 60-minute freshness limit.' : 'The on-chain supply gate did not return a valid value.'
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

  document.querySelector('#change-output').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
  document.querySelector('#sentiment-output').textContent = sentiment
  document.querySelector('#age-output').textContent = `${ageMinutes} min`
  document.querySelector('#risk-score').textContent = risk
  document.querySelector('#score-ring').style.setProperty('--score', risk)
  document.querySelector('#action').textContent = action
  document.querySelector('#rationale').textContent = rationale
  document.querySelector('#allocation').textContent = `${allocation}%`
  document.querySelector('#trace-value').textContent = `change=${change}|sentiment=${sentiment}|age=${ageMinutes * 60}|supply=${validSupply ? 'valid' : 'invalid'}|risk=${risk}|action=${action}|practiceOnly=true`
}

for (const input of [changeInput, sentimentInput, ageInput, supplyInput]) {
  input.addEventListener('input', evaluate)
  input.addEventListener('change', evaluate)
}

evaluate()

