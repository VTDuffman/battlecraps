# Post-FB-041 baseline

The game's balance **after** FB-041 (economy rebalance), captured in Phase 4 to validate the change. It's the "before" for any future tuning.

- **Captured:** 2026-10-15 on `claude/fb-041-phase-2` (Phases 1–3 implemented, `main` merged in).
- **Command:** `npm run build -w @battlecraps/shared && SIM_N=4000 node scripts/sim/gauntlet-economy-sim.mjs <mode>`
- **The sim's defaults are the shipped game:**
  - A post-tutorial run starts with $40 and one free crew member.
  - Crew cash comes from the engine's floor taper.
  - Crew Hype comes from the crew files.
  - `PRE_FB041` reproduces the old game for comparison.

| File | Mode | What it shows |
|---|---|---|
| `validate.txt` | `validate` | Shipped vs pre-FB-041 against the FB-041 target bands |
| `early.txt` | `early` | Floors 1–3 from a new run; the opening pick (lineup vs 3-Starter draft) vs the old opening |
| `packages.txt` | `packages` | Whole runs: old game, shipped (lineup / draft pick), shipped + steeper A+ taper |
| `options.txt` | `options` | Late game from Floor 4: shipped vs pre-FB-041, A+, comp diet |

## Result: every band met

| Measure | Pre-FB-041 | Shipped | Band |
|---|---|---|---|
| Reach Floor 4 — cash · pass (draft pick) | 13.6% | **42.0%** | 35–45% ✅ |
| Reach Floor 4 — mixed · pass (draft pick) | 11.2% | **40.4%** | 35–45% ✅ |
| Finish \| F5 — mixed · pass | 71.1% | **62.6%** | 55–65% ✅ |
| Finish \| F5 — cash · pass | 72.4% | **44.3%** | 40–50% ✅ |
| Whole run — cash · pass (draft pick) | 7.4% | **16.1%** | 15–20% ✅ |
| Whole run — mixed · pass (draft pick) | 6.0% | **20.4%** | 15–20% (within ±3 noise) |

Pure hype isn't a balance target: finish \| F5 went 15.9% → 27.7%.

**If the late game is still too soft after playtests:** the steeper A+ curve gives finish \| F5 mixed 59% / cash 37% and whole-run mixed 18% / cash 13% (`packages.txt`, "Shipped + A+").

Monte Carlo noise: about ±2 points between runs (±4 for finish-given-Floor-5 cells measured on runs that start at Floor 1).
