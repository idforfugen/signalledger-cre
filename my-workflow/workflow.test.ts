import { describe, expect } from 'bun:test'
import { EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import type { Address } from 'viem'
import { newIERC20Mock } from './bindings/IERC20_mock'
import {
  buildPracticeDecision,
  configSchema,
  fetchMarketEvidence,
  fetchSentimentEvidence,
  initWorkflow,
  onCronTrigger,
  readStablecoinSupply,
  type Config,
} from './workflow'

const CHAIN_SELECTOR = 16015286601757825753n
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address

const config: Config = {
  schedule: '0 */10 * * * *',
  assetId: 'bitcoin',
  marketDataUrl: 'https://market.example/price',
  sentimentDataUrl: 'https://sentiment.example/index',
  stablecoin: {
    chainSelectorName: 'ethereum-testnet-sepolia',
    address: USDC,
    decimals: 6,
    isTestnet: true,
  },
  risk: { marketMaxAgeSeconds: 3600, sentimentMaxAgeSeconds: 93600 },
}

const makeRequester = (body: unknown, statusCode = 200) =>
  ({
    sendRequest: () => ({
      result: () => ({ statusCode, body: Buffer.from(JSON.stringify(body)) }),
    }),
  }) as any

const baseInput = {
  market: {
    priceUsd: 64000,
    change24hPct: 1,
    marketCapUsd: 1_250_000_000_000,
    updatedAt: 1_700_000_000,
  },
  sentiment: { fearGreed: 50, updatedAt: 1_700_000_000 },
  stablecoinSupplyBaseUnits: 18_000_000_000_000n,
  stablecoinDecimals: 6,
  evaluatedAt: 1_700_000_300,
  marketMaxAgeSeconds: 3600,
  sentimentMaxAgeSeconds: 93600,
}

describe('evidence adapters', () => {
  test('accepts HTTPS data sources without the browser URL global', () => {
    expect(configSchema.safeParse(config).success).toBe(true)
  })

  test('rejects non-HTTPS data sources', () => {
    expect(
      configSchema.safeParse({ ...config, marketDataUrl: 'http://market.example/price' }).success,
    ).toBe(false)
  })

  test('parses Alternative.me market evidence', () => {
    const result = fetchMarketEvidence(
      makeRequester({
        data: {
          '1': {
            website_slug: 'bitcoin',
            last_updated: 1_700_000_000,
            quotes: {
              USD: {
                price: 64000,
                percentage_change_24h: 2.5,
                market_cap: 1_250_000_000_000,
              },
            },
          },
        },
      }),
      config,
    )
    expect(result.change24hPct).toBe(2.5)
    expect(result.priceUsd).toBe(64000)
  })

  test('rejects incomplete market evidence', () => {
    expect(() =>
      fetchMarketEvidence(
        makeRequester({
          data: {
            '1': {
              website_slug: 'bitcoin',
              last_updated: 1_700_000_000,
              quotes: { USD: { price: 64000 } },
            },
          },
        }),
        config,
      ),
    ).toThrow('Invalid 24h change')
  })

  test('parses Fear & Greed evidence', () => {
    const result = fetchSentimentEvidence(
      makeRequester({ data: [{ value: '27', timestamp: '1700000000' }] }),
      config,
    )
    expect(result).toEqual({ fearGreed: 27, updatedAt: 1_700_000_000 })
  })
})

describe('deterministic practice policy', () => {
  test('holds when no configured edge exists', () => {
    const result = buildPracticeDecision(baseInput)
    expect(result.action).toBe('HOLD')
    expect(result.maxAllocationBps).toBe(0)
    expect(result.practiceOnly).toBe(true)
  })

  test('creates a capped long practice signal', () => {
    const result = buildPracticeDecision({
      ...baseInput,
      market: { ...baseInput.market, change24hPct: 4 },
      sentiment: { ...baseInput.sentiment, fearGreed: 58 },
    })
    expect(result.action).toBe('PRACTICE_LONG')
    expect(result.maxAllocationBps).toBe(2500)
  })

  test('watches for reversal without executing', () => {
    const result = buildPracticeDecision({
      ...baseInput,
      market: { ...baseInput.market, change24hPct: -4 },
      sentiment: { ...baseInput.sentiment, fearGreed: 25 },
    })
    expect(result.action).toBe('WATCH_REVERSAL')
    expect(result.maxAllocationBps).toBe(1000)
  })

  test('blocks stale market evidence', () => {
    const result = buildPracticeDecision({
      ...baseInput,
      evaluatedAt: baseInput.market.updatedAt + 7200,
    })
    expect(result.action).toBe('BLOCKED_STALE_OR_INVALID')
    expect(result.riskScore).toBeGreaterThanOrEqual(60)
  })

  test('accepts a current daily sentiment value older than one hour', () => {
    const result = buildPracticeDecision({
      ...baseInput,
      market: { ...baseInput.market, updatedAt: 1_700_080_000 },
      sentiment: { ...baseInput.sentiment, updatedAt: 1_700_000_000 },
      evaluatedAt: 1_700_080_300,
    })
    expect(result.action).not.toBe('BLOCKED_STALE_OR_INVALID')
  })

  test('blocks sentiment older than its daily freshness window', () => {
    const result = buildPracticeDecision({
      ...baseInput,
      market: { ...baseInput.market, updatedAt: 1_700_100_000 },
      sentiment: { ...baseInput.sentiment, updatedAt: 1_700_000_000 },
      evaluatedAt: 1_700_100_300,
    })
    expect(result.action).toBe('BLOCKED_STALE_OR_INVALID')
    expect(result.rationale).toContain('sentiment evidence exceeded freshness limit')
  })

  test('produces the same audit hash for identical inputs', () => {
    expect(buildPracticeDecision(baseInput).auditHash).toBe(
      buildPracticeDecision(baseInput).auditHash,
    )
  })
})

describe('CRE and EVM integration', () => {
  test('reads token supply through the CRE EVM client', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    const tokenMock = newIERC20Mock(USDC, evmMock)
    tokenMock.totalSupply = () => 18_000_000_000_000n
    const runtime = newTestRuntime() as any

    expect(readStablecoinSupply(runtime, config.stablecoin)).toBe(18_000_000_000_000n)
  })

  test('registers exactly one cron handler', () => {
    const handlers = initWorkflow(config)
    expect(handlers).toHaveLength(1)
    expect(handlers[0].fn).toBe(onCronTrigger)
    expect((handlers[0].trigger as any).config.schedule).toBe(config.schedule)
  })

  test('requires the trigger execution time', () => {
    const runtime = { config, log: () => undefined } as any
    expect(() => onCronTrigger(runtime, {} as any)).toThrow(
      'Scheduled execution time is required',
    )
  })
})
