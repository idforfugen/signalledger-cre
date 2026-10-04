# Verified CRE CLI simulation

Simulation date: 2026-10-04 08:30 Asia/Shanghai
CRE CLI: v1.36.0  
Mode: local simulation, no broadcast

## Command

```bash
cre workflow simulate my-workflow \
  --target staging-settings \
  --trigger-index 0 \
  --non-interactive
```

## Verification

```text
✓ Workflow compiled
✓ Simulation limits enabled
Binary hash: 76e7256265bd0ad6309463a346e05defa70a22982f001078d744ec73481373fe
Config hash: 239acd1d464a76e4953b736e9223a593ea12ca931cade6133ebf7f670dc94403
✓ Workflow Simulation Result
Simulation complete!
```

## Evidence snapshot

```json
{
  "workflow": "SignalLedger",
  "asset": "bitcoin",
  "evidence": {
    "market": {
      "priceUsd": 84804,
      "change24hPct": 0.3194,
      "marketCapUsd": 1703989939190,
      "updatedAt": 1791073640
    },
    "sentiment": {
      "fearGreed": 65,
      "updatedAt": 1791072000
    },
    "chain": "ethereum-testnet-sepolia",
    "stablecoinAddress": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "stablecoinSupplyBaseUnits": "10742412907338884453"
  },
  "decision": {
    "action": "HOLD",
    "riskScore": 10,
    "maxAllocationBps": 0,
    "rationale": [
      "24h change 0.32%",
      "Fear & Greed 65/100",
      "market evidence age 760s",
      "sentiment evidence age 2400s",
      "configured allocation ceiling 25.00%",
      "no configured edge; preserve optionality"
    ],
    "auditHash": "0x01ff876154d8c0544daeb43bf71c5b7969bf35cf86352ec2fd43ff7698a65f8a",
    "practiceOnly": true
  }
}
```

The warning about a default simulation key is emitted by the CLI for all EVM simulations. SignalLedger performs only `eth_call`; the workflow contains no chain-write handler and the command did not use `--broadcast`.
