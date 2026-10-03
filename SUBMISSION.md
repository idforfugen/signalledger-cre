# SignalLedger — submission brief

## One-line pitch

SignalLedger is a Chainlink CRE workflow that reconciles live market evidence with on-chain state, applies transparent risk rules, and records the practice trade an autonomous agent would make with a reproducible audit hash.

## Bounties

- **Chainlink — Best workflow with CRE (2 × $1,000):** uses a CRE cron trigger, two external APIs with DON median aggregation, and a read-only Ethereum Sepolia USDC contract call. The project is explicitly an automated risk-monitoring workflow, one of the sponsor's listed example use cases.
- **RYO-CHAN — Autonomous Agents ($6,000 listed value):** interprets market evidence, records a practice decision, makes cause and effect visible, enforces user-defined risk limits, and preserves a repeatable reasoning trail.

## Problem

Most market agents show a conclusion but hide the evidence path. Reviewers cannot tell whether the input was stale, whether sources agreed, which policy branch fired, or whether the same facts would reproduce the same decision. Giving such an agent transaction authority makes that opacity dangerous.

## Solution

SignalLedger separates evidence collection, verification, policy, and execution:

1. A CRE cron trigger starts a run every ten minutes.
2. CRE nodes fetch the Alternative.me BTC market ticker and Fear & Greed index.
3. Field-level median consensus reconciles the external evidence.
4. A CRE EVM capability reads the Circle USDC `totalSupply` value on Ethereum Sepolia.
5. A deterministic policy calculates risk and returns `HOLD`, `PRACTICE_LONG`, `WATCH_REVERSAL`, `REDUCE_EXPOSURE`, or `BLOCKED_STALE_OR_INVALID`.
6. The exact inputs and output are canonicalized into a Keccak-256 audit hash.

The repository contains no signer, private key, transaction construction, or broadcast path. All decisions are practice-only.

## What is working

- TypeScript CRE workflow built with `@chainlink/cre-sdk`
- Two public HTTP evidence adapters (BTC market ticker and Fear & Greed)
- Field-level DON consensus configuration
- Read-only ERC-20 state query through the CRE EVM client
- Independent freshness windows for fast market data (1 hour) and daily sentiment (26 hours)
- Fail-closed policy for stale evidence or invalid chain state
- Deterministic risk score, practice action, allocation ceiling, rationale, and Keccak-256 trace
- Portable JSON audit record linked to the verified CRE run, with explicit no-sign/no-broadcast controls
- 19 passing tests: 15 workflow/integration tests and 4 interactive audit-record tests
- Successful official CRE CLI simulation with recorded binary/config hashes and decision trace
- Strict TypeScript check
- Responsive, zero-build interactive scenario lab
- GitHub Actions CI and Pages deployment workflows

## Verification commands

```bash
bun install --cwd my-workflow
bun test --cwd my-workflow
bun test docs
bun run --cwd my-workflow typecheck
cre workflow simulate my-workflow --target staging-settings --trigger-index 0 --non-interactive
```

The final command performs public HTTP reads and a Sepolia `eth_call`; it does not broadcast a transaction.

## Two-minute demo script

**0:00–0:20 — The problem**  
Open the landing page. Explain that market-agent outputs are hard to audit: reviewers need the evidence, freshness, rules, risk limits, and a reproducible trail.

**0:20–0:50 — The evidence path**  
Show the three source cards: the BTC market ticker, Fear & Greed sentiment, and the Sepolia USDC contract read. Explain that CRE reconciles the external fields through DON consensus before policy evaluation.

**0:50–1:20 — Cause and effect**  
Use the scenario lab. Move BTC change above 3% with mid-range sentiment to produce `PRACTICE_LONG`; move the market feed past 60 minutes to show `BLOCKED_STALE_OR_INVALID`; disable the chain-supply gate to show another fail-closed result.

**1:20–1:45 — Reproducibility**  
Show the canonical trace, download its portable JSON audit record, then show the workflow code that turns the trace into a Keccak-256 hash. Note that identical evidence produces the same record and audit hash.

**1:45–2:00 — CRE proof and safety**  
Show the successful CRE CLI simulation output and the test run. End on the hard boundary: no signer, no broadcast, no real trades.

## Submission fields

- **Project name:** SignalLedger
- **Tagline:** Evidence in. Auditable practice decisions out.
- **Category:** AI agents · market intelligence · risk monitoring · compliance · CRE
- **Repository:** `https://github.com/idforfugen/signalledger-cre`
- **Demo:** `https://idforfugen.github.io/signalledger-cre/`
- **Contact / team:** idforfugen

## Final pre-submission checklist

- [x] CRE Platform login completed
- [x] Official CRE CLI simulation succeeds and output is captured
- [x] Public GitHub repository pushed
- [x] CI passes on GitHub
- [x] GitHub Pages demo is publicly reachable
- [ ] Repository and demo URLs added to DoraHacks
- [ ] Both bounties selected
- [ ] Two-minute demo video recorded and linked
- [ ] User reviews and accepts the final submission terms
