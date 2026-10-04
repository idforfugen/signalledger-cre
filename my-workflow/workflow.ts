import {
  ConsensusAggregationByFields,
  cre,
  getNetwork,
  median,
  type CronPayload,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk'
import { keccak256, stringToBytes, type Address } from 'viem'
import { z } from 'zod'
import { IERC20 } from './bindings/IERC20'

export const configSchema = z.object({
  schedule: z.string().min(1),
  assetId: z.string().min(1),
  // Avoid z.string().url(): its implementation relies on the URL global, which
  // is unavailable in the Javy WASM runtime used by CRE simulations.
  marketDataUrl: z.string().regex(/^https:\/\/[^\s]+$/),
  sentimentDataUrl: z.string().regex(/^https:\/\/[^\s]+$/),
  stablecoin: z.object({
    chainSelectorName: z.string().min(1),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    decimals: z.number().int().min(0).max(36),
    isTestnet: z.boolean(),
  }),
  risk: z.object({
    marketMaxAgeSeconds: z.number().int().positive(),
    sentimentMaxAgeSeconds: z.number().int().positive(),
    maxPracticeAllocationBps: z.number().int().min(0).max(2500),
  }),
})

export type Config = z.infer<typeof configSchema>

export interface MarketEvidence {
  priceUsd: number
  change24hPct: number
  marketCapUsd: number
  updatedAt: number
}

export interface SentimentEvidence {
  fearGreed: number
  updatedAt: number
}

export type PracticeAction =
  | 'BLOCKED_STALE_OR_INVALID'
  | 'REDUCE_EXPOSURE'
  | 'PRACTICE_LONG'
  | 'WATCH_REVERSAL'
  | 'HOLD'

export interface PracticeDecision {
  action: PracticeAction
  riskScore: number
  maxAllocationBps: number
  rationale: string[]
  auditHash: `0x${string}`
  practiceOnly: true
}

interface DecisionInput {
  market: MarketEvidence
  sentiment: SentimentEvidence
  stablecoinSupplyBaseUnits: bigint
  stablecoinDecimals: number
  evaluatedAt: number
  marketMaxAgeSeconds: number
  sentimentMaxAgeSeconds: number
  maxPracticeAllocationBps: number
}

const assertFinite = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export const fetchMarketEvidence = (
  sendRequester: HTTPSendRequester,
  config: Pick<Config, 'marketDataUrl' | 'assetId'>,
): MarketEvidence => {
  const response = sendRequester
    .sendRequest({ method: 'GET', url: config.marketDataUrl })
    .result()

  if (response.statusCode !== 200) {
    throw new Error(`Market API returned HTTP ${response.statusCode}`)
  }

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const rows = body?.data && typeof body.data === 'object' ? Object.values(body.data) : []
  const asset = (rows as Array<any>).find((row) => row?.website_slug === config.assetId)
  if (!asset) throw new Error(`Market API did not return ${config.assetId}`)

  const usd = asset.quotes?.USD

  const evidence = {
    priceUsd: assertFinite(usd?.price, 'price'),
    change24hPct: assertFinite(
      usd?.percentage_change_24h ?? usd?.percent_change_24h,
      '24h change',
    ),
    marketCapUsd: assertFinite(usd?.market_cap, 'market cap'),
    updatedAt: assertFinite(asset.last_updated, 'market timestamp'),
  }

  if (evidence.priceUsd <= 0 || evidence.marketCapUsd <= 0 || evidence.updatedAt <= 0) {
    throw new Error('Market API returned non-positive evidence')
  }

  return evidence
}

export const fetchSentimentEvidence = (
  sendRequester: HTTPSendRequester,
  config: Pick<Config, 'sentimentDataUrl'>,
): SentimentEvidence => {
  const response = sendRequester
    .sendRequest({ method: 'GET', url: config.sentimentDataUrl })
    .result()

  if (response.statusCode !== 200) {
    throw new Error(`Sentiment API returned HTTP ${response.statusCode}`)
  }

  const body = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  const row = body?.data?.[0]
  const fearGreed = Number(row?.value)
  const updatedAt = Number(row?.timestamp)

  if (!Number.isFinite(fearGreed) || fearGreed < 0 || fearGreed > 100) {
    throw new Error('Sentiment API returned an invalid Fear & Greed value')
  }
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    throw new Error('Sentiment API returned an invalid timestamp')
  }

  return { fearGreed, updatedAt }
}

export const readStablecoinSupply = (
  runtime: Runtime<Config>,
  stablecoin: Config['stablecoin'],
): bigint => {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: stablecoin.chainSelectorName,
    isTestnet: stablecoin.isTestnet,
  })
  if (!network) throw new Error(`Network not found: ${stablecoin.chainSelectorName}`)

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const token = new IERC20(evmClient, stablecoin.address as Address)
  return token.totalSupply(runtime)
}

const riskFromChange = (change24hPct: number): number => {
  const magnitude = Math.abs(change24hPct)
  if (magnitude >= 10) return 45
  if (magnitude >= 5) return 30
  if (magnitude >= 2) return 15
  return 5
}

const riskFromSentiment = (fearGreed: number): number => {
  if (fearGreed <= 20) return 35
  if (fearGreed <= 35) return 20
  if (fearGreed >= 80) return 25
  if (fearGreed >= 70) return 15
  return 5
}

export const buildPracticeDecision = (input: DecisionInput): PracticeDecision => {
  const marketAgeSeconds = Math.max(0, input.evaluatedAt - input.market.updatedAt)
  const sentimentAgeSeconds = Math.max(0, input.evaluatedAt - input.sentiment.updatedAt)
  const staleMarket = marketAgeSeconds > input.marketMaxAgeSeconds
  const staleSentiment = sentimentAgeSeconds > input.sentimentMaxAgeSeconds
  const stale = staleMarket || staleSentiment
  const invalidSupply = input.stablecoinSupplyBaseUnits <= 0n

  let riskScore = riskFromChange(input.market.change24hPct) + riskFromSentiment(input.sentiment.fearGreed)
  if (stale) riskScore += 50
  if (invalidSupply) riskScore += 100
  riskScore = Math.min(100, riskScore)

  let action: PracticeAction = 'HOLD'
  let maxAllocationBps = 0
  const rationale: string[] = [
    `24h change ${input.market.change24hPct.toFixed(2)}%`,
    `Fear & Greed ${input.sentiment.fearGreed.toFixed(0)}/100`,
    `market evidence age ${marketAgeSeconds}s`,
    `sentiment evidence age ${sentimentAgeSeconds}s`,
    `configured allocation ceiling ${(input.maxPracticeAllocationBps / 100).toFixed(2)}%`,
  ]

  if (stale || invalidSupply) {
    action = 'BLOCKED_STALE_OR_INVALID'
    if (staleMarket) rationale.push('market evidence exceeded freshness limit')
    if (staleSentiment) rationale.push('sentiment evidence exceeded freshness limit')
    if (invalidSupply) rationale.push('on-chain supply check failed')
  } else if (riskScore >= 70) {
    action = 'REDUCE_EXPOSURE'
    maxAllocationBps = Math.min(2000, input.maxPracticeAllocationBps)
    rationale.push('combined volatility and sentiment risk crossed 70')
  } else if (
    input.market.change24hPct >= 3 &&
    input.sentiment.fearGreed >= 45 &&
    input.sentiment.fearGreed <= 75
  ) {
    action = 'PRACTICE_LONG'
    maxAllocationBps = Math.min(2500, input.maxPracticeAllocationBps)
    rationale.push('positive momentum with non-extreme sentiment')
  } else if (input.market.change24hPct <= -3 && input.sentiment.fearGreed <= 35) {
    action = 'WATCH_REVERSAL'
    maxAllocationBps = Math.min(1000, input.maxPracticeAllocationBps)
    rationale.push('oversold conditions detected; wait for confirmation')
  } else {
    rationale.push('no configured edge; preserve optionality')
  }

  const canonicalTrace = [
    `priceUsd=${input.market.priceUsd}`,
    `change24hPct=${input.market.change24hPct}`,
    `marketCapUsd=${input.market.marketCapUsd}`,
    `marketUpdatedAt=${input.market.updatedAt}`,
    `fearGreed=${input.sentiment.fearGreed}`,
    `sentimentUpdatedAt=${input.sentiment.updatedAt}`,
    `marketAgeSeconds=${marketAgeSeconds}`,
    `sentimentAgeSeconds=${sentimentAgeSeconds}`,
    `stablecoinSupplyBaseUnits=${input.stablecoinSupplyBaseUnits.toString()}`,
    `stablecoinDecimals=${input.stablecoinDecimals}`,
    `configuredMaxAllocationBps=${input.maxPracticeAllocationBps}`,
    `evaluatedAt=${input.evaluatedAt}`,
    `riskScore=${riskScore}`,
    `action=${action}`,
    `maxAllocationBps=${maxAllocationBps}`,
    'practiceOnly=true',
  ].join('|')

  return {
    action,
    riskScore,
    maxAllocationBps,
    rationale,
    auditHash: keccak256(stringToBytes(canonicalTrace)),
    practiceOnly: true,
  }
}

const safeJsonStringify = (value: unknown): string =>
  JSON.stringify(value, (_, field) => (typeof field === 'bigint' ? field.toString() : field), 2)

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error('Scheduled execution time is required')
  }

  const httpClient = new cre.capabilities.HTTPClient()
  const market = httpClient
    .sendRequest(
      runtime,
      fetchMarketEvidence,
      ConsensusAggregationByFields<MarketEvidence>({
        priceUsd: median,
        change24hPct: median,
        marketCapUsd: median,
        updatedAt: median,
      }),
    )({ marketDataUrl: runtime.config.marketDataUrl, assetId: runtime.config.assetId })
    .result()

  const sentiment = httpClient
    .sendRequest(
      runtime,
      fetchSentimentEvidence,
      ConsensusAggregationByFields<SentimentEvidence>({
        fearGreed: median,
        updatedAt: median,
      }),
    )({ sentimentDataUrl: runtime.config.sentimentDataUrl })
    .result()

  const stablecoinSupplyBaseUnits = readStablecoinSupply(runtime, runtime.config.stablecoin)
  const evaluatedAt = Number(payload.scheduledExecutionTime.seconds)
  const decision = buildPracticeDecision({
    market,
    sentiment,
    stablecoinSupplyBaseUnits,
    stablecoinDecimals: runtime.config.stablecoin.decimals,
    evaluatedAt,
    marketMaxAgeSeconds: runtime.config.risk.marketMaxAgeSeconds,
    sentimentMaxAgeSeconds: runtime.config.risk.sentimentMaxAgeSeconds,
    maxPracticeAllocationBps: runtime.config.risk.maxPracticeAllocationBps,
  })

  const result = {
    workflow: 'SignalLedger',
    asset: runtime.config.assetId,
    evidence: {
      market,
      sentiment,
      chain: runtime.config.stablecoin.chainSelectorName,
      stablecoinAddress: runtime.config.stablecoin.address,
      stablecoinSupplyBaseUnits,
    },
    decision,
  }
  runtime.log(`SignalLedger decision\n${safeJsonStringify(result)}`)
  return safeJsonStringify(result)
}

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability()
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}
