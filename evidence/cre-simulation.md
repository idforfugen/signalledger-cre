# Verified CRE CLI simulation

Simulation date: 2026-10-04 02:59 Asia/Shanghai  
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
Binary hash: 0a2d5d9a446af31e5642cbee9b787a49a76cdf48133c272e8fb917068ab97689
Config hash: d9114c1996d7a9b6f890b5c8fb90c8aa5b873572820a2fd319e238f133335ef4
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
      "priceUsd": 84924,
      "change24hPct": 0.89082,
      "marketCapUsd": 1706397122060,
      "updatedAt": 1791053550
    },
    "sentiment": {
      "fearGreed": 67,
      "updatedAt": 1790985600
    },
    "chain": "ethereum-testnet-sepolia",
    "stablecoinAddress": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "stablecoinSupplyBaseUnits": "10742413123494819302"
  },
  "decision": {
    "action": "HOLD",
    "riskScore": 10,
    "maxAllocationBps": 0,
    "rationale": [
      "24h change 0.89%",
      "Fear & Greed 67/100",
      "market evidence age 450s",
      "sentiment evidence age 68400s",
      "no configured edge; preserve optionality"
    ],
    "auditHash": "0xb08177f1727c954d495cc38849645be97863318f9001d402d01c6b021e62ba3e",
    "practiceOnly": true
  }
}
```

The warning about a default simulation key is emitted by the CLI for all EVM simulations. SignalLedger performs only `eth_call`; the workflow contains no chain-write handler and the command did not use `--broadcast`.

