# SignalLedger

**Evidence in. Auditable practice decisions out.**

SignalLedger is a Chainlink Runtime Environment (CRE) workflow that combines two off-chain market data sources with a live EVM state read, applies a deterministic risk policy, and emits a reproducible Keccak-256 decision trace. It never signs or submits a trade.

[Open the interactive demo](https://idforfugen.github.io/signalledger-cre/) · Built for [BLI Legal Tech Hackathon 2](https://dorahacks.io/hackathon/legal-hack-2026/detail)

**CRE proof:** the official CRE CLI simulation completed successfully on 2026-10-04. See the [verified output, binary hash, config hash, and decision trace](evidence/cre-simulation.md).

## Why it exists

Autonomous financial agents are easy to demo and hard to audit. A reviewer should be able to answer:

- Which evidence produced this decision?
- Was the evidence fresh and independently reconciled?
- Which exact policy branch fired?
- Can the same input reproduce the same output?
- Could the demo move real funds by accident?

SignalLedger makes those answers explicit. The output is practice-only decision support, not an execution instruction.

## Workflow

```text
CRE cron trigger
      │
      ├── BTC market ticker ────────── DON median consensus ─┐
      ├── Fear & Greed evidence ────── DON median consensus ─┼── deterministic policy
      └── Sepolia USDC totalSupply ─── EVM capability ───────┘           │
                                                                         ├── practice action
                                                                         ├── risk + allocation cap
                                                                         └── Keccak-256 audit hash
```

The policy can return `HOLD`, `PRACTICE_LONG`, `WATCH_REVERSAL`, `REDUCE_EXPOSURE`, or `BLOCKED_STALE_OR_INVALID`. Every branch has a visible rule and an allocation ceiling. Fast market evidence has a one-hour freshness window; the daily sentiment index has a separate 26-hour window. Stale evidence or an invalid chain read fails closed.

## Bounty fit

### Chainlink CRE

- TypeScript workflow using the official `@chainlink/cre-sdk`
- Scheduled CRE trigger
- Two external HTTP evidence feeds, with field-level DON consensus aggregation
- EVM capability reading Circle's USDC contract on Ethereum Sepolia
- Verified CRE CLI simulation with no user private key and no broadcast

### Autonomous Agents

- Interprets price, momentum, sentiment, freshness, and on-chain evidence
- Produces a practice-only position decision and hard allocation cap
- Records the precise rationale and a canonical, reproducible audit hash
- Includes an interactive scenario lab that exposes every policy transition
- Exports a portable, deterministic JSON audit record with its own SHA-256 integrity digest, the active freshness policy, and a link to the verified CRE run

## Run locally

Requirements: [Bun](https://bun.sh/) and the [CRE CLI](https://docs.chain.link/cre).

```bash
bun install --cwd my-workflow
bun test --cwd my-workflow
bun test docs
bun run --cwd my-workflow typecheck
cre workflow simulate my-workflow --target staging-settings --trigger-index 0 --non-interactive
```

The simulation is read-only. It fetches public data and performs an `eth_call` against the Sepolia USDC contract. It does not require or load a wallet private key.

To view the static demo locally:

```bash
python3 -m http.server 8080 --directory docs
```

Then open `http://localhost:8080`.

## Policy summary

| Condition | Practice output | Allocation ceiling |
|---|---:|---:|
| Market evidence older than 60 minutes, daily sentiment older than 26 hours, or invalid on-chain supply | `BLOCKED_STALE_OR_INVALID` | 0% |
| Combined risk score ≥ 70 | `REDUCE_EXPOSURE` | 20% |
| 24h change ≥ 3% and sentiment is 45–75 | `PRACTICE_LONG` | 25% |
| 24h change ≤ -3% and sentiment ≤ 35 | `WATCH_REVERSAL` | 10% |
| Any other valid state | `HOLD` | 0% |

The implementation in [`my-workflow/workflow.ts`](my-workflow/workflow.ts) is the source of truth.

## Repository map

```text
my-workflow/                 CRE workflow, config, tests, and read-only IERC20 binding
docs/                        Interactive, zero-build web demo
.github/workflows/           CI and GitHub Pages deployment
```

## Safety and limitations

- Practice-only: there is no transaction construction, signer, private key, or broadcast path.
- Public market APIs can be unavailable or rate-limited; the workflow fails instead of fabricating data.
- The risk policy is intentionally simple and inspectable. It is not financial advice.
- Sepolia state is used to demonstrate verifiable EVM integration, not to represent mainnet liquidity.
- This project is a hackathon prototype and has not been audited for production use.

## License

MIT
