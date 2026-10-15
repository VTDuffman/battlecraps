# Pre-FB-041 baseline

The game's balance **before** FB-041 (economy rebalance), for the before/after comparison in FB-041 Phase 4.

- **Captured:** 2026-10-15, at `main` 1deed07 (FB-041 plan merged, no FB-041 code yet).
- **Command:** `npm run build -w @battlecraps/shared && SIM_N=4000 node scripts/sim/gauntlet-economy-sim.mjs <mode>`

| File | Mode | What it shows |
|---|---|---|
| `early.txt` | `early` | Floors 1–3 from a new run ($30, no crew): per-marker clear rates, where runs die, opening-fix options |
| `options.txt` | `options` | Late game from Floor 4: finish rate given Floor 5 under each rebalance option ("Today" = pre-FB-041) |
| `packages.txt` | `packages` | Whole runs from a new run under the combined packages ("Today" = pre-FB-041) |

**Baseline ("Today") — the numbers Phase 4 compares against:**

| Measure | Cash · pass | Mixed · pass | Mixed · 1× odds | Hype · pass (not a target) |
|---|---|---|---|---|
| Reach Floor 4 from a new run (`early`) | 13.3% | 10.5% | 15.4% | 1.1% |
| Finish given Floor 5, runs from Floor 4 (`options`) | 72.9% | 73.1% | 63.2% | 15.9% |
| Whole-run finish (`packages`) | 8% | 6% | 8% | 0% |

Mixed · pass per-marker clear rates on Floors 1–3 (markers 0–8): 35 / 51 / 97 / 87 / 95 / 88 / 98 / 99 / 85.

**FB-041 targets (Phase 4):** reach Floor 4 35–45%; finish given Floor 5: mixed 55–65%, cash 40–50%; whole run ~15–20%.

Monte Carlo noise: about ±2 points between runs of the same configuration.
