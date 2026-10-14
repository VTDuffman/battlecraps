# Late-Game Difficulty Audit (Floors 5–9)

> **Status:** Analysis and proposal only. No game rules or numbers were changed.
> **Prepared:** 2026-10-14, while The Sovereign's rework was being designed.
> **Tool:** `scripts/sim/gauntlet-economy-sim.mjs` (run `npm run build -w @battlecraps/shared` first).
> Every table below comes from that script at `SIM_N=4000` (isolated and lever tables: 2,000 per cell). The same configuration run separately gives slightly different numbers, about ±2 points (e.g. today's cash · pass finish | F5 comes out at 81–83%). Rerun a section with
> `node scripts/sim/gauntlet-economy-sim.mjs chain | isolated | levers | options`.

---

## TL;DR

1. **Past The Hierophant the gauntlet barely pushes back.** With a cash or mixed Starter crew on the pass line, every late marker clears 96–100% of the time it is reached. A run that gets through Floor 5 beats The Architect **82–86%** of the time. Turn every boss rule off and that becomes **~98%**.
2. **The cause is crew cash, not bankroll carry or the comps.** Cash crew pay a fixed share of the *current* target on almost every roll, win or lose, before Hype. Each shooter is worth about half to three-quarters of a target while a marker needs ≤ 1 target. Most markers clear in 5–12 rolls, and a marker gives you about 50. Remove crew cash from Floor 5 onward and a cash crew's late-game finish rate falls from 82% to **0%**. Remove any single comp and it drops by 0–12 points.
3. **The game is scale-invariant.** Max bet, min bet and crew cash are all fixed shares of the target, and every marker is entered at 0.4–0.85× its target. So a marker at $60M plays like a marker at $30k, except that you have more comps and crew slots by then. Raising targets doesn't help: crew cash rises with them.
4. **Lowering the table max does the opposite of what you'd expect.** A late table max of 5% makes cash builds *stronger* (81–83% → 87%), because there's less house edge to lose and crew cash stays the same. It also cuts hype builds from ~27% to ~7%.
5. **Hype builds are already far behind.** A hype crew reaches Floor 5 in only 56% of runs, and finishes from there 27% of the time, against 82–86% for cash and mixed crews. Any rebalance should narrow that gap, not widen it.
6. **Recommendation:** taper crew-cash scaling by floor (Option A), trim The Vig and Member's Jacket (Option B), or both (R). R cuts the cash and mixed late-game finish rate to ~42–57% and leaves hype builds about where they are. **R does not, by itself, give boss rules more room:** with every rule off, the late bosses still clear ~97%. A boss rule still has to cost roughly 10–15 points on its own, as The Executive (−15 to −19) and The Hierophant (−7 to −11) already do, on the pass line or 1× odds. That is a design target for The Sovereign, not something the economy will provide.

---

## Method

The harness runs a full run from **Floor 4, marker 9 ($5k)** to **The Architect (marker 26, $60M)** on the real shared engine, using the same per-roll order as `apps/api/src/routes/rolls.ts`:

`resolveRoll` → base Hype tick (`getBaseHypeTick` / Natural +0.10 / Craps Out −0.05, floored at 1.0) → Poseidon's Favor → `resolveCascade` (real Starter crew objects) → The Vig → Load-Bearing → escrow hold → `settleTurn` → The Executive's +15% → The Frequency → escrow release → state advance.

| Modelled | How |
|---|---|
| Bankroll carry | One bankroll from marker 9 to marker 26. The run starts with 1.1× the $4k Floor 3 boss target. |
| Marker clear | Bankroll plus chips on the table ≥ target, checked after every roll. This is the pre-roll auto-clear plus the in-roll checks. |
| Per marker | Hype resets to 1.0×, shooters reset to 5 (+1 Member's Jacket), boss counter set by `getBossEntryCounter`. |
| Comps | Vig, Jacket and Keepsake from the start, then Board Seat (4th slot) after 11, Covenant after 14, Poseidon after 17, Cargo Hold (5th slot) after 20, Frequency after 23. |
| Pub | The only cost is filling a newly opened slot with a Starter (2 × the cleared marker's max bet). A sensitivity row also charges one extra hire per floor. |
| Bosses | Executive (rating, PIP, +15% at Exceptional); Hierophant (escrow until a win, × Hype, 75% seized on a 7-out); Sovereign (tide minimum bet); Commander (tiered decay, slot penalty < 0.75×, halved max < 0.5×, no Keepsake); Emissary (one-roll delay, evaporates on a 7-out); Architect (demolishes the last crew to fire, additives × 0.85^N). |
| Lineups (slots 1–5 in order) | **cash**: Doorman, Grinder, Ace McGee, Close Call, Even Keel · **hype**: Lookout, Momentum, Handicapper, Echo, Odd Couple · **mixed**: Doorman, Ace McGee, Handicapper, Momentum, Close Call |
| Bets | **pass**: Pass Line at the table max · **odds1x**: plus 1× odds · **maxOdds**: plus full 3/4/5× odds |

**Simplifications:** fixed strategies; no hardways; Starter crew only (no Whale, Shark or Old Pro, so the top of the bankroll distribution is understated); no crew swaps at the pub. The strategies bet the *normal* 10% table max at The Sovereign and only bet more when the tide minimum forces it. Her tide lifts the table max to 5× the tide minimum (up to 25% of the target). Betting that raised max changes almost nothing: 99.2% for cash/mixed crews, 84% for the hype crew.

---

## 1. The curve today (chained runs)

"Clear" = clear rate among runs that reached that marker. "Arrival" = median bankroll ÷ target on entry.

### Cash crew · pass line at max (finished the gauntlet 65.3% from Floor 4)

| # | Marker | Target | Reached | Clear | Arrival ÷ target | Median rolls | Shooters used |
|---|---|---|---|---|---|---|---|
| 9 | — | $5k | 100% | 99.8% | 0.88 | 4 | 0.41 |
| 10 | — | $7.5k | 99.8% | 99.3% | 0.68 | 8 | 0.93 |
| 11 | **The Executive** | $15k | 99.2% | **80.5%** (PIP 19.5%) | 0.52 | 11 | 0.92 |
| 12 | — | $30k | 79.8% | 99.1% | 0.42 | 12 | 1.33 |
| 13 | — | $50k | 79.1% | 99.7% | 0.63 | 8 | 0.84 |
| 14 | **The Hierophant** | $100k | 78.8% | **89.8%** | 0.52 | 14 | 1.67 |
| 15 | — | $150k | 70.8% | 100.0% | 0.76 | 5 | 0.16 |
| 16 | — | $250k | 70.8% | 100.0% | 0.63 | 7 | 0.34 |
| 17 | **The Sovereign** | $500k | 70.7% | 99.8% | 0.52 | 10 | 0.45 |
| 18 | — | $1M | 70.5% | 99.9% | 0.52 | 10 | 0.47 |
| 19 | — | $1.5M | 70.5% | 99.9% | 0.70 | 6 | 0.23 |
| 20 | **The Commander** | $3M | 70.4% | 97.3% | 0.52 | 10 | 0.66 |
| 21 | — | $5M | 68.5% | 100.0% | 0.50 | 8 | 0.30 |
| 22 | — | $7.5M | 68.5% | 100.0% | 0.70 | 5 | 0.12 |
| 23 | **The Emissary** | $15M | 68.5% | 99.2% | 0.52 | 10 | 0.53 |
| 24 | — | $20M | 67.9% | 100.0% | 0.83 | 3 | 0.04 |
| 25 | — | $30M | 67.9% | 100.0% | 0.70 | 5 | 0.13 |
| 26 | **The Architect** | $60M | 67.9% | 96.1% | 0.52 | 7 | 0.38 |

Final bankroll: median $62.7M, p90 $67.7M, max $75.6M (Starter crew only).

### All lineups and strategies — summary

| Lineup · bets | Finished (from F4) | Reached F5 | Finish \| F5 | Executive | Hierophant | Sovereign | Commander | Emissary | Architect | Late filler markers |
|---|---|---|---|---|---|---|---|---|---|---|
| cash · pass | 65.3% | 79.8% | 82% | 80.5% | 89.8% | 99.8% | 97.3% | 99.2% | 96.1% | 99–100% |
| mixed · pass | 65.7% | 78.6% | 84% | 79.4% | 92.4% | 99.7% | 99.2% | 97.9% | 96.0% | 98–100% |
| hype · pass | 14.5% | 56.0% | 26% | 66.8% | 85.4% | 88.6% | 93.4% | 92.8% | 83.8% | 82–98% |
| cash · odds1x | 52.6% | 76.4% | 69% | 79.6% | 87.2% | 98.8% | 94.4% | 97.1% | 94.3% | 97–100% |
| mixed · odds1x | 56.1% | 75.3% | 75% | 78.8% | 91.8% | 99.1% | 98.1% | 95.6% | 94.8% | 97–100% |
| hype · odds1x | 11.7% | 64.5% | 18% | 76.7% | 84.2% | 84.8% | 87.7% | 89.7% | 86.0% | 78–98% |
| cash · maxOdds | 14.1% | 62.9% | 22% | 75.7% | 73.9% | 87.4% | 81.5% | 82.5% | 84.6% | 89–100% |
| mixed · maxOdds | 11.9% | 59.4% | 20% | 74.5% | 78.4% | 84.7% | 85.7% | 82.4% | 86.2% | 81–98% |
| hype · maxOdds | 1.1% | 42.5% | 3% | 68.7% | 70.6% | 70.0% | 73.6% | 75.3% | 80.8% | 68–90% |

**Betting max odds every roll is a losing strategy.** With max odds on a 6/8, a player stakes 60% of the target on a single decision. Runs die by going broke, not by running out of shooters. 1× odds costs a few points compared with the plain pass line. The game rewards betting the pass line and letting the crew earn.

### Boss rules off — what the economy does by itself

| Lineup · bets | Finished (from F4) | Late markers 12–26 (all) |
|---|---|---|
| cash · pass | 94.0% | 99.0–100% |
| mixed · pass | 92.9% | 98.7–100% |
| hype · pass | 19.6% | 82–98.5% |

---

## 2. Isolated markers — the rule cost

Each marker is played alone: the player arrives with 1.1× the previous target and has the comps and slots earned by then. Boss cells read *rule on / rule off (rule cost in points)*.

| Lineup · bets | 11 Exec | 14 Hiero | 17 Sov | 20 Cmdr | 23 Emi | 26 Arch | late filler |
|---|---|---|---|---|---|---|---|
| cash · pass | 82/98 (−16) | 91/100 (−8) | 100/100 (0) | 98/100 (−2) | 99/100 (−1) | 96/100 (−4) | 100 |
| mixed · pass | 79/98 (−19) | 92/99 (−7) | 100/100 (0) | 99/100 (0) | 98/100 (−2) | 96/100 (−4) | 99–100 |
| hype · pass | 68/82 (−14) | 84/85 (−1) | 90/87 (≈0) | 92/91 (≈0) | 93/92 (≈0) | 84/93 (−8) | 86–97 |
| cash · odds1x | 79/95 (−15) | 87/98 (−11) | 99/99 (0) | 95/99 (−4) | 97/100 (−2) | 94/100 (−5) | 98–100 |
| mixed · odds1x | 78/96 (−17) | 90/98 (−8) | 99/99 (0) | 98/99 (−1) | 95/100 (−5) | 95/100 (−5) | 98–100 |
| cash · maxOdds | 71/77 (−6) | 71/87 (−17) | 84/89 (−5) | 80/90 (−10) | 78/92 (−14) | 81/94 (−13) | 87–98 |
| mixed · maxOdds | 68/72 (−4) | 69/75 (−6) | 78/77 (≈0) | 78/79 (≈0) | 74/92 (−19) | 79/92 (−13) | 78–98 |
| hype · maxOdds | 46/50 (−4) | 49/51 (−2) | 50/52 (−2) | 53/52 (≈0) | 51/52 (≈0) | 52/53 (≈0) | 52–71 |

(Differences of ±2 points are within noise at this sample size.)

---

## 3. Soft spots

- **The curve goes flat after The Hierophant (marker 14).** From marker 15 to marker 25 no marker, boss or filler, clears less than 97% for a cash or mixed crew on the pass line. The run's fate is decided on Floors 4–5 (The Executive's PIP and The Hierophant's seizure).
- **The Sovereign (17) costs nothing.** Her tide only raises the *minimum* bet. A max bettor is never affected, and the raised minimum also *raises* the table max. This matches the earlier finding that she clears ~99.7% with no rule.
- **The Commander (20) and The Emissary (23) cost 0–5 points**, except against max-odds bettors (−10 to −19).
- **The Architect (26) costs ~4 points.** Each demolition is real, but a marker takes ~7 rolls, so a run rarely reaches a second seven-out.
- **Markers 15, 19, 22, 24 and 25 are near-automatic.** They grow only 1.33–1.5× over the previous target, so players arrive at 0.7–0.85× the target and clear in 3–6 rolls.
- **The $276M playtester run is an outlier, but a possible one.** A typical finisher ends at $63–75M, because clears land just past the target and $60M is the last one. Pass-line Starter runs top out around $75–110M. Only max-odds gambling reaches the playtester's figure (best hype · max-odds run: $342M), as would Rare/Legendary multipliers (Whale, Old Pro's 15% table max), which aren't simulated here.

---

## 4. Why: crew cash is risk-free, target-scaled income

Each cash crew pays `ADDITIVE_MULT × 10% × target` (FB-024). In a 4-slot cash crew, Doorman (0.25), Grinder (0.15), Ace McGee (0.40) and Close Call (0.35) fire on about 25–55% of rolls each. Together they add roughly **4% of the target per roll before Hype**, or about 5% with The Vig. Even Keel (0.50 on double-evens) adds about 1.2% more once Cargo Hold opens slot 5. That pay is:

- **scale-invariant:** it's the same share of the target on Floor 9 as on Floor 4;
- **risk-free:** it pays on losing rolls too, including the seven-out. Only The Hierophant and The Emissary ever hold it back;
- **multiplied by Hype**, so it grows during a hot shooter.

A shooter lasts about 8.5 rolls on average, so each shooter brings in roughly 0.4–0.6× the target in crew cash alone. The pass line at a 10% max bet is slightly −EV. Players enter a marker at 0.4–0.85× the target (filler targets grow 1.33–2×), with 6 shooters (7 with The Covenant). So a marker needs about one good shooter and gives you six. The lever table shows how lopsided this is:

| Lever (Floors 5–9 only unless noted) | Finish \| F5: cash · pass | mixed · pass | hype · pass | mixed · odds1x | No-rule boss 14/17/20/23/26 (cash · pass) |
|---|---|---|---|---|---|
| Today | 80.9% | 86.5% | 27.8% | 72.5% | 99 / 100 / 100 / 100 / 100 |
| Member's Jacket off (F5+) | 69.2% | 75.1% | 17.5% | 64.8% | 98 / 99 / 99 / 100 / 100 |
| The Vig off | 73.7% | 80.2% | 23.5% | 68.3% | 98 / 99 / 100 / 100 / 100 |
| The Keepsake off | 81.4% | 73.8% | 8.4% | 61.7% | 99 / 100 / 100 / 100 / 100 |
| The Covenant off | 78.4% | 80.6% | 17.9% | 68.9% | 99 / 100 / 99 / 100 / 100 |
| Poseidon's Favor off | 83.0% | 84.8% | 24.9% | 73.1% | 100 / 100 / 100 / 100 / 100 |
| Crew cash × 0.5 (F5+) | 38.9% | 59.3% | 25.0% | 46.6% | 93 / 95 / 96 / 98 / 99 |
| Crew cash off (F5+) | 0.0% | 6.4% | 28.0% | 7.7% | 44 / 39 / 40 / — / — |
| Table max 7.5% (F5+) | 84.3% | 85.3% | 18.1% | 81.2% | 100 / 100 / 100 / 100 / 100 |
| Table max 5% (F5+) | 87.2% | 87.3% | 6.8% | 85.2% | 100 / 100 / 100 / 100 / 100 |
| Targets × 1.15 per marker | 76.8% | 82.0% | 20.2% | 68.9% | 99 / 100 / 100 / 100 / 100 |
| Targets × 1.3 per marker | 73.1% | 78.7% | 13.9% | 58.7% | 99 / 100 / 100 / 100 / 100 |
| One extra hire per floor | 83.2% | 83.7% | 22.4% | 74.2% | 100 / 100 / 100 / 100 / 100 |
| Crew cash × 0.35 (F5+) | 17.3% | 42.5% | 26.1% | 36.3% | 84 / 89 / 90 / 95 / 97 |
| Crew cash × 0.5 + Jacket off (F5+) | 25.1% | 41.5% | 13.8% | 36.6% | 86 / 93 / 93 / 97 / 98 |
| 4 shooters (F5+) | 54.9% | 57.0% | 5.9% | 46.2% | 95 / 99 / 99 / 100 / 100 |
| Crew cash × 0.5 + 4 shooters (F5+) | 11.9% | 21.6% | 6.2% | 22.8% | 79 / 87 / 88 / 95 / 94 |
| Boss targets × 2 (F5+) | 65.5% | 71.1% | 15.5% | 49.8% | 98 / 99 / 99 / 100 / 100 |

How to read it:
- **Crew cash is the only lever that moves the cash build substantially.** Halving it costs ~42 points; removing it ends the build. The comps each cost 0–12 points (Member's Jacket is the largest).
- **Crew cash barely affects the hype build** (25–28% at any crew-cash level), while The Keepsake is its lifeline (28% → 8%), so cutting it *narrows* the gap between builds.
- **Lowering the table max, raising targets and charging more at the pub all fail.** A lower table max helps cash builds because of the house edge, and wrecks hype builds, whose profit is Hype × bet. Steeper targets bring proportionally more crew cash, so they mainly hurt hype builds. The pub only takes 20% of a cleared target per hire, and a single shooter earns that back.
- **Even strong combinations leave the no-rule bosses at 79–98%.** To push a filler marker below ~97%, crew cash has to come down by more than half *and* shooters have to be cut. With 15 late markers in a row, that collapses the finish rate (10–25%) well before the boss rooms feel tense on their own.

---

## 5. Rebalance options

Each option was simulated as a full chained run from Floor 4 with every boss rule on. "Finish | F5" = share of runs that reach Floor 5 and beat The Architect. Marker cells = clear rate given reached; **bold** = boss. The last column reruns the same option with boss rules off (the room a boss rule has).

#### cash crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 82.8% | 99 | 100 | 90 | 100 | 100 | 100 | 100 | 100 | 98 | 100 | 100 | 100 | 100 | 100 | 97 | 100 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 57.0% | 97 | 99 | 86 | 100 | 99 | 99 | 98 | 99 | 92 | 99 | 100 | 95 | 100 | 99 | 86 | 98 / 99 / 98 / 98 / 98 |
| A+ · steeper taper | 46.3% | 96 | 98 | 83 | 99 | 99 | 97 | 96 | 99 | 87 | 98 | 99 | 93 | 99 | 99 | 84 | 97 / 97 / 95 / 98 / 97 |
| B · comp diet | 73.6% | 96 | 99 | 88 | 100 | 99 | 99 | 99 | 100 | 97 | 100 | 100 | 99 | 100 | 100 | 95 | 99 / 100 / 100 / 100 / 100 |
| C · steeper targets | 75.4% | 99 | 99 | 87 | 100 | 100 | 100 | 100 | 100 | 96 | 100 | 100 | 99 | 100 | 100 | 94 | 99 / 100 / 100 / 100 / 100 |
| C2 · boss targets × 2 | 67.4% | 99 | 100 | 81 | 100 | 100 | 99 | 100 | 100 | 95 | 100 | 100 | 98 | 100 | 100 | 91 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 87.4% | 100 | 100 | 91 | 100 | 100 | 100 | 100 | 100 | 99 | 100 | 100 | 100 | 100 | 100 | 97 | 100 / 100 / 100 / 100 / 100 |
| R · A + B | 41.7% | 93 | 97 | 83 | 99 | 97 | 97 | 95 | 98 | 90 | 96 | 98 | 94 | 99 | 99 | 82 | 98 / 98 / 97 / 98 / 98 |

#### mixed crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 84.3% | 98 | 99 | 93 | 100 | 100 | 100 | 100 | 100 | 99 | 100 | 100 | 98 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 68.2% | 97 | 99 | 92 | 100 | 100 | 99 | 98 | 100 | 97 | 99 | 100 | 93 | 100 | 100 | 90 | 98 / 99 / 98 / 99 / 99 |
| A+ · steeper taper | 59.8% | 96 | 98 | 91 | 99 | 99 | 98 | 97 | 99 | 96 | 99 | 100 | 92 | 100 | 99 | 87 | 97 / 99 / 98 / 99 / 99 |
| B · comp diet | 78.0% | 96 | 98 | 93 | 100 | 99 | 100 | 99 | 100 | 99 | 100 | 100 | 98 | 100 | 100 | 95 | 99 / 99 / 99 / 100 / 100 |
| C · steeper targets | 80.0% | 98 | 99 | 91 | 100 | 100 | 100 | 100 | 100 | 99 | 100 | 100 | 97 | 100 | 100 | 95 | 99 / 100 / 100 / 100 / 100 |
| C2 · boss targets × 2 | 72.1% | 99 | 99 | 86 | 100 | 100 | 99 | 100 | 100 | 98 | 100 | 100 | 94 | 100 | 100 | 93 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 87.9% | 99 | 100 | 94 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 99 | 100 | 100 | 96 | 100 / 100 / 100 / 100 / 100 |
| R · A + B | 57.4% | 93 | 97 | 92 | 99 | 98 | 99 | 96 | 98 | 95 | 99 | 99 | 94 | 100 | 99 | 89 | 98 / 98 / 98 / 99 / 99 |

#### hype crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 26.9% | 82 | 90 | 86 | 94 | 92 | 89 | 90 | 95 | 92 | 93 | 97 | 93 | 99 | 97 | 87 | 86 / 90 / 91 / 92 / 92 |
| A · crew-cash taper | 26.0% | 81 | 90 | 86 | 94 | 92 | 89 | 91 | 94 | 92 | 92 | 97 | 93 | 97 | 96 | 87 | 85 / 92 / 91 / 93 / 94 |
| A+ · steeper taper | 24.4% | 80 | 88 | 86 | 95 | 92 | 91 | 92 | 94 | 91 | 92 | 96 | 93 | 97 | 97 | 82 | 85 / 90 / 88 / 95 / 94 |
| B · comp diet | 19.8% | 77 | 85 | 86 | 92 | 91 | 88 | 89 | 91 | 93 | 93 | 94 | 92 | 98 | 95 | 84 | 87 / 90 / 89 / 94 / 94 |
| C · steeper targets | 17.8% | 77 | 86 | 83 | 93 | 91 | 87 | 88 | 93 | 92 | 94 | 94 | 90 | 95 | 94 | 81 | 83 / 88 / 87 / 91 / 91 |
| C2 · boss targets × 2 | 16.0% | 81 | 91 | 72 | 100 | 97 | 73 | 100 | 97 | 77 | 100 | 97 | 79 | 100 | 100 | 74 | 69 / 74 / 77 / 76 / 85 |
| X · late table max 5% | 7.2% | 70 | 82 | 76 | 89 | 85 | 82 | 79 | 89 | 89 | 85 | 92 | 86 | 94 | 91 | 75 | 74 / 78 / 80 / 87 / 90 |
| R · A + B | 19.3% | 76 | 86 | 85 | 92 | 90 | 91 | 87 | 93 | 93 | 88 | 95 | 93 | 97 | 96 | 83 | 84 / 90 / 92 / 93 / 93 |

#### mixed crew · pass at max + 1× odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 73.8% | 96 | 99 | 91 | 100 | 99 | 99 | 99 | 99 | 97 | 100 | 100 | 96 | 100 | 100 | 95 | 98 / 99 / 99 / 100 / 100 |
| A · crew-cash taper | 53.7% | 95 | 98 | 89 | 99 | 98 | 97 | 96 | 99 | 93 | 98 | 99 | 92 | 100 | 99 | 89 | 96 / 97 / 97 / 98 / 98 |
| A+ · steeper taper | 48.3% | 93 | 97 | 89 | 99 | 97 | 96 | 95 | 97 | 93 | 98 | 98 | 90 | 99 | 99 | 89 | 96 / 97 / 96 / 97 / 97 |
| B · comp diet | 65.1% | 93 | 96 | 91 | 99 | 98 | 99 | 98 | 99 | 97 | 99 | 100 | 95 | 100 | 100 | 94 | 97 / 98 / 99 / 100 / 99 |
| C · steeper targets | 64.1% | 95 | 98 | 88 | 99 | 99 | 98 | 98 | 99 | 97 | 100 | 100 | 94 | 100 | 100 | 94 | 96 / 98 / 99 / 100 / 100 |
| C2 · boss targets × 2 | 50.8% | 97 | 98 | 79 | 100 | 100 | 94 | 100 | 99 | 93 | 100 | 100 | 86 | 100 | 100 | 91 | 93 / 94 / 96 / 99 / 100 |
| X · late table max 5% | 82.8% | 99 | 100 | 92 | 100 | 100 | 100 | 100 | 100 | 99 | 100 | 100 | 97 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| R · A + B | 45.6% | 90 | 95 | 89 | 98 | 97 | 97 | 95 | 98 | 95 | 97 | 98 | 91 | 99 | 98 | 89 | 96 / 96 / 96 / 98 / 98 |

#### cash crew · pass at max + max odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 23.2% | 89 | 94 | 74 | 98 | 94 | 87 | 93 | 97 | 82 | 96 | 97 | 82 | 99 | 98 | 84 | 90 / 91 / 90 / 95 / 95 |
| A · crew-cash taper | 7.7% | 84 | 92 | 68 | 96 | 88 | 82 | 83 | 93 | 71 | 89 | 93 | 71 | 96 | 91 | 73 | 87 / 86 / 83 / 88 / 89 |
| A+ · steeper taper | 5.0% | 81 | 90 | 65 | 96 | 87 | 76 | 82 | 91 | 65 | 87 | 92 | 69 | 98 | 92 | 68 | 83 / 86 / 80 / 82 / 85 |
| B · comp diet | 16.7% | 83 | 93 | 72 | 98 | 90 | 87 | 89 | 95 | 83 | 93 | 96 | 80 | 99 | 98 | 82 | 87 / 89 / 88 / 92 / 93 |
| C · steeper targets | 14.0% | 87 | 90 | 72 | 95 | 90 | 86 | 89 | 93 | 79 | 92 | 97 | 76 | 97 | 95 | 82 | 88 / 88 / 91 / 93 / 94 |
| C2 · boss targets × 2 | 14.8% | 87 | 94 | 64 | 100 | 99 | 79 | 100 | 96 | 75 | 100 | 97 | 69 | 100 | 100 | 74 | 83 / 85 / 87 / 89 / 90 |
| X · late table max 5% | 59.2% | 96 | 98 | 86 | 99 | 99 | 97 | 98 | 99 | 93 | 99 | 100 | 95 | 100 | 100 | 91 | 97 / 97 / 98 / 99 / 100 |
| R · A + B | 5.3% | 80 | 90 | 67 | 95 | 87 | 78 | 80 | 91 | 73 | 84 | 94 | 67 | 96 | 88 | 72 | 82 / 86 / 82 / 84 / 89 |

### Option A — Crew-cash taper (recommended core)
Scale crew additives off a shrinking share of the target as floors rise: `ADDITIVE_MULT × {F5 0.8, F6 0.7, F7 0.6, F8 0.5, F9 0.45}`. In code this is one floor-indexed multiplier in the FB-024 formula (or per-floor `markerTargetCents` scaling before the cascade). Every crew file keeps its own `ADDITIVE_MULT`.
- Cuts the cash-crew late finish rate by ~26 points (83% → 57%) and the mixed by ~16 (84% → 68%), mostly in the boss rooms. Filler markers stay 96–100%.
- Leaves hype builds where they are, so the gap between builds narrows.
- It counters the growth in crew income that the 4th and 5th slots bring (Board Seat, Cargo Hold), which today arrives exactly when the game should be getting harder.
- **A+** (0.7 → 0.4) goes another ~8–11 points.

### Option B — Comp diet
The Vig +20% → +10%; Member's Jacket's extra shooter only at **boss** markers from Floor 5. The fan text would read "+1 shooter in every High Limit Room".
- Worth ~6–9 points on its own (cash 83% → 74%, mixed 84% → 78%, hype 27% → 20%) and hits every build, including hype. Best used to fine-tune Option A rather than on its own.
- Data point: The Keepsake is the hype build's lifeline (turning it off: 28% → 8%). Don't trim it.

### Option C — Steeper targets (not recommended)
**C:** every late target × 1.2 per marker (The Architect ≈ $924M). **C2:** late boss targets × 2.
- Mostly hurts **hype** builds, because cash builds' crew cash grows with the target. C2 does concentrate pressure on boss rooms (Hierophant 81%, Architect 91% for cash), but the no-rule bosses stay 98–100% for cash and mixed crews, while a hype crew's bosses drop to 72–79%.
- The numbers become very large (~$1B), for a modest effect.

### Option X — Late table max 5% (rejected)
Shown because it seems like the obvious fix. It **raises** the cash/mixed finish rate (+4–9 points) and cuts the hype build's from 27% to 7%.

### Package R = A + B (recommended starting point)
- Cash crew · pass: 83% → 42% · mixed · pass: 84% → 57% · mixed · 1× odds: 74% → 46% · hype · pass: 27% → 19%.
- Each late filler marker still clears 92–100%, and each boss now costs something: the cash crew clears The Hierophant, The Commander, The Emissary and The Architect at 83%, 90%, 94% and 82%.
- **What it does not do:** with boss rules off, the late bosses still clear 96–99%. The economy fix lowers the overall finish rate. It does not make room for a weak boss rule. For The Sovereign, the rule itself has to cost about 10–15 points, which is the scale of The Executive's PIP and The Hierophant's seizure.

---

## 6. Recommendations

1. **Adopt Option A (crew-cash taper)** as the economy change. Tune the per-floor factors with `levers` / `options` mode until a strong lineup's late finish rate hits the target band (suggested: **40–60% from Floor 5** for a good cash/mixed build, **15–30%** for a hype build).
2. **Add Option B's Vig trim** if A alone overshoots the band. Make the Jacket boss-only only if filler floors still feel automatic after A.
3. **Don't lower the table max** to make the late game harder.
4. **Design each remaining boss rule to cost ≥ 10 points on its own** (isolated mode, rule on vs off). Rules that only raise a bet minimum, or that bite after a second seven-out, cost ≤ 5 today. They need to fire inside a ~7–12-roll fight.
5. **Consider making crew cash *at risk*** as a later structural change. Today it pays even on a seven-out. The Hierophant's "held until a win" rule shows how much this matters: it is the only rule that bites cash builds hard. A softer, game-wide version, for example crew cash on a seven-out roll is lost, would raise the stakes everywhere without new floor-specific numbers. Not simulated here; the harness's escrow path is the place to start.
6. **Rebalance the hype build separately.** It reaches Floor 5 only 56% of the time, against ~80% for cash and mixed. It probably needs better Floor 4 survival, for example at The Executive's PIP, where it loses a third of its runs.

---

## Appendix — reproducing / extending

- Levers live in `BASE_LEVERS` (`targetMult`, `maxBetPct`, `additiveMult`, `vig`, `jacket`, `keepsake`, `covenant`, `poseidon`, `frequencyPct`, `bossRules`, `hires`). Per-marker levers are functions of the marker index.
- Add a candidate to `OPTIONS` (curves) or `LEVERS` (one-row sensitivity).
- A boss-rule experiment slots into `playMarker` next to the existing `isBoss(BOSS.…)` branches. Measure it with `isolated` mode, rule on vs off.
- The script checks at startup that its local max/min-bet helpers reproduce `getMaxBet`, `getMinBet` and `getBossMinBet` at identity levers, and throws if they drift.
