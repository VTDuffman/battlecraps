# Late-Game Difficulty Audit (Floors 5–9)

> **Status:** Analysis and proposal only. No game rules or numbers were changed.
> **Prepared:** 2026-10-14. **Re-run 2026-10-15** against the current boss rules: The Sovereign (FB-037), The Commander (FB-038) and The Emissary (FB-039). §1 compares those reworks with the rules they replaced.
> **Tool:** `scripts/sim/gauntlet-economy-sim.mjs` (run `npm run build -w @battlecraps/shared` first).
> Every table comes from that script at `SIM_N=4000` (isolated and lever tables: 2,000 per cell). Separate runs of the same configuration differ by about ±2 points. Rerun a section with
> `node scripts/sim/gauntlet-economy-sim.mjs chain | isolated | levers | options | compare`.

---

## TL;DR

1. **The Floor 6–8 reworks made the late game harder.** For a run that reaches Floor 5, the chance of beating The Architect drops by **8–12 points** for cash and mixed crews and by 5–9 points for hype crews. On the pass line, cash goes 82% → 71% and mixed 85% → 73%.
2. **The Emissary is now the hardest late boss for every build.** His rule costs 10–12 points for cash/mixed crews and ~18 for hype crews on the pass line, close to The Executive. The Sovereign costs ~4 points for cash/mixed crews and ~14 for hype. The Commander costs ~0 for cash/mixed and ~14 for hype.
3. **Most of the new pressure lands on hype builds**, which were already the weakest. From Floor 5 they now finish ~15% of the time (was ~25%), against ~72% for cash and mixed crews. Relative to cash, the gap between builds got wider.
4. **The underlying economy hasn't changed.** With boss rules off, every late marker still clears 99–100% for a cash or mixed crew. Crew cash is still the engine: halving it from Floor 5 cuts a cash crew's late finish rate from 71% to 30%, and removing it takes it to **0%**. Bets, crew cash and targets all scale together, so a $60M marker plays like a $30k one, only with more comps.
5. **Lowering the table max still backfires.** At 5% of the target from Floor 5, cash crews go from 71% to 76% and hype crews from 15% to **2%**.
6. **Recommendation:** Option A (taper crew-cash scaling by floor), **on its own**, now lands cash and mixed crews at ~45–52% from Floor 5 and leaves hype crews where they are. That is inside the suggested 40–60% band. The comp trim (B) is no longer needed: A + B overshoots (cash 34%). Hype builds need their own fix, mostly at The Executive and the new Sovereign and Commander rooms.

---

## Method

The harness runs a full run from **Floor 4, marker 9 ($5k)** to **The Architect (marker 26, $60M)** on the real shared engine, in the same per-roll order as `apps/api/src/routes/rolls.ts`:

`resolveRoll` → base Hype tick → Poseidon's Favor → `resolveCascade` (real Starter crew; skipped during the Emissary's blackout) → The Vig → the Emissary's signal lag → Load-Bearing → Hierophant escrow → `settleTurn` → The Executive's +15% → The Frequency → escrow release → the Sovereign's Undertow → state advance → the Commander's orbital bleed.

| Modelled | How |
|---|---|
| Bankroll carry | One bankroll from marker 9 to marker 26. The run starts with 1.1× the $4k Floor 3 boss target. |
| Marker clear | Bankroll plus chips on the table ≥ target, checked after every roll. This is the pre-roll auto-clear plus the in-roll checks. Escrowed or in-transit crew cash is paid on the clear. |
| Per marker | Hype resets to 1.0×. Shooters reset to 5 (+1 with Member's Jacket). Boss counter set by `getBossEntryCounter`. |
| Comps | Vig, Jacket and Keepsake from the start. Then Board Seat (4th slot) after 11, Covenant after 14, Poseidon after 17, Cargo Hold (5th slot) after 20, Frequency after 23. |
| Pub | The only cost is filling a newly opened slot with a Starter (2 × the cleared marker's max bet). A sensitivity row also charges one extra hire per floor. |
| Bosses (current) | **Executive:** rating, PIP, +15% at Exceptional. **Hierophant:** crew cash held until a win, paid × Hype, 75% seized on a 7-out. **Sovereign:** the tide cycles Dead Calm (no odds) → Undertow (a 7-out takes 35% of the bankroll) → High Tide (a 7-out drowns 2 shooters; The Covenant cancels it) → Undertow, and advances each come-out. **Commander:** after every roll except a 7-out, Hype above 1.0× loses 20%; a 7-out resets Hype with no Keepsake. **Emissary:** what the crew add (cash, Hype, multipliers) lands one roll late and a 7-out drops it; after a 7-out the crew go dark for 6 rolls. **Architect:** each 7-out demolishes the last crew to fire; additives × 0.85^N. |
| Legacy bosses | `bossVersion: 'legacy'` swaps in the pre-rework Floor 6–8 rules: tide minimum bets; tiered 7-out Hype decay with the death spiral; a one-roll crew-cash delay. Used only in §1. |
| Lineups (slots 1–5 in order) | **cash**: Doorman, Grinder, Ace McGee, Close Call, Even Keel · **hype**: Lookout, Momentum, Handicapper, Echo, Odd Couple · **mixed**: Doorman, Ace McGee, Handicapper, Momentum, Close Call |
| Bets | **pass**: Pass Line at the 10% table max · **odds1x**: plus 1× odds · **maxOdds**: plus full 3/4/5× odds. No odds during Dead Calm. |

**Simplifications:**
- Fixed betting strategies, no hardways.
- Starter crew only: no Whale, Shark or Old Pro, so the top of the bankroll distribution is understated.
- No crew swaps at the pub.

**Cross-check:** each rework's own tuning sim (`sovereign-tide-sim`, `commander-decay-sim`, `emissary-delay-sim`) puts its rule cost within a few points of this harness's isolated numbers.

---

## 1. Did the Floor 6–8 reworks change things?

The same runs with the legacy rules and the current rules. "Finish | F5" is the share of runs that reach Floor 5 and beat The Architect. The boss columns give the clear rate among runs that reached that boss. **Rule cost** is the isolated clear rate with that boss's rule on minus off, arriving with 1.1× the previous target. Everything is written legacy → current.

| Lineup · bets | Finish \| F5 | Sovereign clear | Commander clear | Emissary clear | Sovereign rule cost | Commander rule cost | Emissary rule cost |
|---|---|---|---|---|---|---|---|
| cash · pass | 81.5 → **70.9** | 99.9 → 95.1 | 97.4 → 99.8 | 99.5 → 89.3 | 0.0 → −3.6 | −2.5 → −0.1 | −0.5 → **−9.7** |
| mixed · pass | 85.4 → **73.1** | 99.7 → 95.9 | 99.3 → 99.2 | 98.0 → 87.6 | 0.0 → −4.1 | −0.8 → −0.5 | −1.7 → **−12.2** |
| hype · pass | 25.4 → **16.1** | 89.4 → 75.8 | 92.1 → 77.9 | 94.5 → 77.0 | −0.8 → **−13.8** | +1.5 → **−13.9** | −0.5 → **−18.3** |
| cash · odds1x | 69.5 → 61.5 | 98.5 → 95.1 | 95.5 → 99.0 | 97.7 → 85.5 | +0.1 → −4.1 | −3.8 → 0.0 | −1.9 → −14.4 |
| mixed · odds1x | 73.9 → 62.7 | 98.8 → 95.9 | 97.4 → 96.9 | 95.7 → 83.8 | +0.3 → −3.4 | −1.1 → −2.7 | −4.5 → −16.3 |
| hype · odds1x | 19.2 → 14.3 | 87.1 → 79.7 | 86.2 → 80.8 | 89.8 → 79.7 | +0.1 → −7.3 | −1.3 → −4.4 | +0.6 → −11.6 |
| cash · maxOdds | 21.4 → 21.7 | 87.2 → 92.9 | 83.6 → 88.8 | 81.3 → 68.8 | −5.6 → 0.0 | −11.2 → −0.6 | −16.4 → −28.9 |
| mixed · maxOdds | 18.7 → 15.5 | 85.9 → 89.6 | 87.4 → 83.0 | 80.5 → 70.7 | +0.6 → +4.9 | −1.6 → −5.8 | −19.1 → −30.9 |

**Each rework:**

- **The Emissary:** a big success. The old delay cost 0–2 points. The new one costs 10–18 on the pass line for every build, the same scale as The Executive (−18). It's the only late rule that hits cash builds hard, because crew cash lands late and a 7-out loses it. The 6-roll blackout then shuts off crew cash entirely.
- **The Sovereign:** now costs something, but mostly to hype builds (−14). Cash and mixed crews lose ~4 points: Undertow and High Tide only fire on a 7-out, and a cash crew clears her room in ~10 rolls.
- **The Commander:** the change reversed who he hurts. The old tiered decay pushed Hype below 1.0×, which mainly cost cash builds (−2.5) and could even help hype builds. The new bleed only shaves Hype above 1.0×. Cash crews barely use Hype, so for them he costs nothing; hype crews lose ~14 points.
- **Max-odds bettors:** the Sovereign and Commander reworks *helped* them (the old tide minimum and death spiral were what broke them). The Emissary hurts them more (−29 to −31).

**Net effect:**
- The late game is ~10 points harder for strong builds.
- Hype builds lost about a third of their already small finish rate.
- The absolute gap between cash and hype builds stayed about the same (~55 points), but in relative terms it grew from ~3.2× to ~4.4×.

---

## 2. The curve today (chained runs, current rules)

"Clear" = clear rate among runs that reached that marker. "Arrival" = median bankroll ÷ target on entry.

### Cash crew · pass line at max (finished the gauntlet 56.9% from Floor 4)

| # | Marker | Target | Reached | Clear | Arrival ÷ target | Median rolls | Shooters used |
|---|---|---|---|---|---|---|---|
| 9 | — | $5k | 100% | 99.9% | 0.88 | 4 | 0.41 |
| 10 | — | $7.5k | 99.9% | 99.0% | 0.68 | 8 | 0.94 |
| 11 | **The Executive** | $15k | 98.9% | **80.2%** (PIP 19.8%) | 0.52 | 11 | 0.91 |
| 12 | — | $30k | 79.3% | 99.1% | 0.42 | 11 | 1.29 |
| 13 | — | $50k | 78.6% | 99.8% | 0.63 | 8 | 0.85 |
| 14 | **The Hierophant** | $100k | 78.5% | **88.3%** | 0.52 | 14 | 1.67 |
| 15 | — | $150k | 69.3% | 99.9% | 0.76 | 5 | 0.15 |
| 16 | — | $250k | 69.2% | 99.9% | 0.63 | 8 | 0.34 |
| 17 | **The Sovereign** | $500k | 69.1% | 95.2% | 0.52 | 10 | 0.72 |
| 18 | — | $1M | 65.8% | 99.9% | 0.52 | 9 | 0.46 |
| 19 | — | $1.5M | 65.8% | 100.0% | 0.69 | 6 | 0.24 |
| 20 | **The Commander** | $3M | 65.7% | 99.8% | 0.52 | 10 | 0.49 |
| 21 | — | $5M | 65.6% | 100.0% | 0.50 | 7 | 0.30 |
| 22 | — | $7.5M | 65.6% | 100.0% | 0.70 | 5 | 0.12 |
| 23 | **The Emissary** | $15M | 65.6% | **90.4%** | 0.52 | 10 | 0.81 |
| 24 | — | $20M | 59.3% | 100.0% | 0.83 | 3 | 0.04 |
| 25 | — | $30M | 59.3% | 100.0% | 0.70 | 4 | 0.12 |
| 26 | **The Architect** | $60M | 59.3% | 96.0% | 0.52 | 7 | 0.37 |

Final bankroll: median $62.6M, p90 $67.7M, max $76.0M (Starter crew only).

### All lineups and strategies — summary

| Lineup · bets | Finished (from F4) | Reached F5 | Finish \| F5 | Executive | Hierophant | Sovereign | Commander | Emissary | Architect | Late non-boss markers |
|---|---|---|---|---|---|---|---|---|---|---|
| cash · pass | 56.9% | 79.3% | 72% | 80.2% | 88.3% | 95.2% | 99.8% | 90.4% | 96.0% | 99–100% |
| mixed · pass | 56.6% | 76.9% | 74% | 78.1% | 93.7% | 96.1% | 98.6% | 88.2% | 96.5% | 98–100% |
| hype · pass | 8.4% | 56.8% | 15% | 67.4% | 85.3% | 76.4% | 77.6% | 74.7% | 86.8% | 82–97% |
| cash · odds1x | 45.4% | 75.6% | 60% | 78.5% | 86.2% | 94.8% | 98.6% | 86.0% | 93.5% | 97–100% |
| mixed · odds1x | 47.3% | 76.5% | 62% | 80.0% | 90.4% | 96.2% | 96.8% | 83.9% | 95.1% | 97–100% |
| hype · odds1x | 9.2% | 65.2% | 14% | 76.1% | 83.9% | 78.2% | 80.8% | 79.1% | 84.3% | 79–96% |
| cash · maxOdds | 14.2% | 62.1% | 23% | 76.1% | 75.0% | 92.9% | 89.7% | 72.1% | 83.3% | 88–99% |
| mixed · maxOdds | 9.8% | 60.4% | 16% | 76.7% | 77.9% | 90.7% | 81.7% | 71.1% | 85.4% | 82–99% |
| hype · maxOdds | 0.8% | 41.6% | 2% | 67.3% | 72.2% | 75.6% | 66.0% | 76.9% | 78.6% | 67–90% |

**Betting max odds every roll loses.** With max odds on a 6/8, a player stakes 60% of the target on one decision. Those runs die by going broke, not by running out of shooters. The game rewards betting the pass line and letting the crew earn.

### Boss rules off — what the economy does by itself

| Lineup · bets | Finished (from F4) | Late markers 12–26 |
|---|---|---|
| cash · pass | 93.8% | 99.0–100% |
| mixed · pass | 92.3% | 98.7–100% |
| hype · pass | 18.7% | 82.6–96.8% |

---

## 3. Isolated markers — the rule cost (current rules)

Each marker is played on its own: the player arrives with 1.1× the previous target, with the comps and slots earned by then. Boss cells read *rule on / rule off (rule cost in points)*. Differences of ±2 points are noise.

| Lineup · bets | 11 Exec | 14 Hiero | 17 Sov | 20 Cmdr | 23 Emi | 26 Arch | Late non-boss |
|---|---|---|---|---|---|---|---|
| cash · pass | 80/98 (−18) | 90/100 (−10) | 95/100 (−5) | 100/100 (0) | 91/100 (−9) | 96/100 (−4) | 100 |
| mixed · pass | 79/98 (−18) | 93/99 (−6) | 96/100 (−4) | 99/100 (−1) | 87/100 (−13) | 96/100 (−4) | 99–100 |
| hype · pass | 67/84 (−17) | 86/84 (≈0) | 75/89 (−14) | 75/91 (−16) | 75/92 (−17) | 86/92 (−6) | 86–97 |
| cash · odds1x | 80/94 (−14) | 86/98 (−12) | 95/98 (−3) | 99/99 (0) | 85/100 (−14) | 93/100 (−6) | 98–100 |
| mixed · odds1x | 78/94 (−16) | 91/97 (−6) | 96/99 (−2) | 97/99 (−3) | 82/100 (−17) | 94/100 (−6) | 97–100 |
| hype · odds1x | 72/79 (−7) | 80/80 (0) | 75/80 (−5) | 76/83 (−7) | 75/84 (−9) | 83/86 (−3) | 81–95 |
| cash · maxOdds | 69/79 (−10) | 71/88 (−17) | 90/90 (0) | 89/89 (0) | 61/94 (−33) | 81/93 (−12) | 86–98 |
| mixed · maxOdds | 65/71 (−6) | 70/77 (−6) | 84/77 (+6) | 74/77 (−3) | 60/91 (−32) | 78/91 (−13) | 76–97 |
| hype · maxOdds | 50/51 (−1) | 52/53 (−1) | 55/52 (+3) | 50/53 (−3) | 49/51 (−2) | 54/52 (+3) | 51–70 |

---

## 4. Soft spots (current rules)

- **The non-boss markers are automatic.** From marker 12 to marker 25, every non-boss marker clears ≥ 98.5% for a cash or mixed crew on the pass line. Markers 15, 19, 22, 24 and 25 grow only 1.33–1.5× over the previous target, so players arrive at 0.7–0.85× and clear in 3–6 rolls.
- **The Commander (20) costs a cash or mixed crew nothing.** His bleed only touches Hype above 1.0×, and those builds earn through crew cash. He is a hype-build boss now.
- **The Sovereign (17) costs a cash or mixed crew ~4 points.** Both her penalties wait for a 7-out, and a cash crew clears her in ~10 rolls, usually with one shooter.
- **The Architect (26) costs ~4 points.** Demolition needs 7-outs, and a cash crew clears in ~7 rolls.
- **The real gates for strong builds are The Executive (−18), The Hierophant (−6 to −10) and now The Emissary (−9 to −13).** All three either end the run outright (PIP) or take away crew cash.
- **The $276M playtester run is an outlier, but a possible one.** A typical finisher ends at $63–75M, because clears land just past the target and $60M is the last one. Pass-line Starter runs top out around $75–120M. Only max-odds gambling reaches the playtester's figure (best max-odds runs: $190–240M), as would Rare/Legendary multipliers (Whale, Old Pro's 15% table max), which aren't simulated here.

---

## 5. Why: crew cash is risk-free, target-scaled income

Each cash crew pays `ADDITIVE_MULT × 10% × target` (FB-024).

- **How much:** in a 4-slot cash crew, Doorman (0.25), Grinder (0.15), Ace McGee (0.40) and Close Call (0.35) each fire on about 25–55% of rolls. Together they add roughly **4% of the target per roll before Hype**, about 5% with The Vig. Even Keel (0.50 on double evens) adds about 1.2% more once Cargo Hold opens slot 5.
- **Scale-invariant:** it's the same share of the target on Floor 9 as on Floor 4.
- **Risk-free:** it pays on losing rolls too, including the 7-out. Only The Hierophant (held until a win) and now The Emissary (lagged, dropped on a 7-out, then blacked out) hold it back. That's exactly why those two are the late bosses that bite cash builds.
- **Multiplied by Hype**, so it grows during a hot shooter.

A shooter lasts about 8.5 rolls on average, so each shooter brings in roughly 0.4–0.6× the target from crew cash alone. The pass line at a 10% max bet is slightly −EV. Players enter a marker at 0.4–0.85× the target with 6 shooters (7 with The Covenant), so a marker needs about one good shooter and gives you six.

**Single-lever sensitivity (current rules).** Floors 5–9 only, unless noted. The last column is the five late bosses with every boss rule off, for a cash crew on the pass line: the room a boss rule has to work with.

| Lever | Finish \| F5: cash · pass | mixed · pass | hype · pass | mixed · odds1x | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|
| Today | 70.9% | 72.5% | 14.7% | 62.6% | 99 / 100 / 100 / 100 / 100 |
| Member's Jacket off (F5+) | 61.6% | 61.0% | 7.7% | 53.5% | 98 / 99 / 100 / 100 / 100 |
| The Vig off | 59.8% | 63.8% | 14.7% | 52.6% | 98 / 99 / 99 / 100 / 100 |
| The Keepsake off | 70.1% | 61.6% | 5.6% | 52.8% | 99 / 100 / 100 / 100 / 100 |
| The Covenant off | 67.8% | 64.6% | 8.6% | 56.6% | 100 / 99 / 100 / 100 / 100 |
| Poseidon's Favor off | 70.8% | 72.0% | 13.4% | 60.2% | 99 / 100 / 100 / 100 / 100 |
| Crew cash × 0.5 (F5+) | 30.2% | 44.3% | 14.2% | 34.1% | 91 / 95 / 96 / 98 / 98 |
| Crew cash off (F5+) | 0.0% | 3.1% | 14.8% | 5.9% | 42 / 42 / 29 / — / — |
| Table max 7.5% (F5+) | 75.2% | 70.9% | 7.7% | 67.6% | 100 / 100 / 100 / 100 / 100 |
| Table max 5% (F5+) | 75.5% | 71.6% | 1.6% | 69.5% | 100 / 100 / 100 / 100 / 100 |
| Targets × 1.15 per marker | 69.3% | 68.8% | 8.8% | 54.9% | 99 / 100 / 100 / 100 / 100 |
| Targets × 1.3 per marker | 62.8% | 64.7% | 7.1% | 49.4% | 99 / 99 / 99 / 100 / 100 |
| One extra hire per floor | 71.4% | 71.7% | 14.8% | 59.0% | 99 / 100 / 100 / 100 / 100 |
| Crew cash × 0.35 (F5+) | 11.5% | 30.1% | 14.5% | 26.7% | 84 / 88 / 92 / 95 / 97 |
| Crew cash × 0.5 + Jacket off (F5+) | 19.7% | 29.8% | 8.5% | 29.4% | 88 / 92 / 91 / 98 / 97 |
| 4 shooters (F5+) | 46.2% | 44.3% | 3.1% | 38.5% | 95 / 98 / 98 / 99 / 100 |
| Crew cash × 0.5 + 4 shooters (F5+) | 8.0% | 13.7% | 3.6% | 17.3% | 80 / 88 / 90 / 93 / 94 |
| Boss targets × 2 (F5+) | 52.5% | 52.8% | 7.2% | 35.7% | 98 / 99 / 99 / 100 / 100 |

**How to read it:**
- **Crew cash is the only lever that moves cash builds a lot.** Halving it costs ~41 points; removing it ends the build. Each comp costs 0–11 points, The Vig and Member's Jacket the most.
- **Crew cash doesn't affect hype builds at all** (~14–15% at any crew-cash level). The Keepsake is their lifeline (15% → 6%), and so is The Covenant (→ 9%).
- **Lowering the table max, raising targets and charging more at the pub all fail.**
  - A lower table max *helps* cash builds, because there's less house edge to lose, and wrecks hype builds, whose profit is Hype × bet.
  - Steeper targets bring proportionally more crew cash, so they mainly hurt hype builds.
  - A pub hire is 20% of a cleared target, which one shooter earns back.
- **Even strong combinations leave the no-rule bosses at 80–97%.** Pushing a non-boss marker below ~97% takes cutting crew cash by more than half *and* cutting shooters. With 15 late markers in a row, that collapses the finish rate (8–20%) before any boss room feels tense on its own.

---

## 6. Rebalance options (current rules)

Each option was simulated as a full chained run from Floor 4 with every boss rule on.
- **Finish | F5:** share of runs that reach Floor 5 and beat The Architect.
- **Marker columns:** clear rate given reached; **bold** = boss.
- **Last column:** the same option with boss rules off — the room a boss rule has.

#### cash crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 71.3% | 99 | 99 | 89 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 90 | 100 | 100 | 95 | 100 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 45.1% | 97 | 99 | 88 | 100 | 99 | 88 | 98 | 99 | 98 | 99 | 100 | 81 | 100 | 99 | 83 | 98 / 98 / 98 / 99 / 98 |
| A+ · steeper taper | 36.7% | 96 | 98 | 83 | 99 | 99 | 85 | 96 | 98 | 95 | 97 | 99 | 80 | 100 | 99 | 83 | 97 / 97 / 96 / 98 / 97 |
| B · comp diet | 66.3% | 96 | 99 | 89 | 100 | 100 | 95 | 99 | 100 | 100 | 100 | 100 | 89 | 100 | 100 | 95 | 99 / 100 / 99 / 100 / 100 |
| C · steeper targets | 65.7% | 99 | 99 | 87 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 87 | 100 | 100 | 94 | 99 / 100 / 100 / 100 / 100 |
| C2 · boss targets × 2 | 53.2% | 99 | 100 | 81 | 100 | 100 | 91 | 100 | 100 | 99 | 100 | 100 | 80 | 100 | 100 | 92 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 74.8% | 100 | 100 | 91 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 89 | 100 | 100 | 97 | 100 / 100 / 100 / 100 / 100 |
| R · A + B | 33.9% | 93 | 97 | 85 | 99 | 98 | 85 | 96 | 98 | 96 | 96 | 98 | 80 | 99 | 98 | 83 | 97 / 98 / 97 / 98 / 98 |

#### mixed crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 70.6% | 99 | 99 | 92 | 100 | 100 | 96 | 100 | 100 | 98 | 100 | 100 | 88 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 52.3% | 98 | 99 | 92 | 100 | 99 | 92 | 98 | 100 | 95 | 99 | 100 | 81 | 100 | 100 | 88 | 98 / 99 / 98 / 99 / 99 |
| A+ · steeper taper | 45.7% | 96 | 98 | 90 | 99 | 99 | 90 | 98 | 99 | 92 | 99 | 100 | 80 | 100 | 100 | 88 | 98 / 98 / 97 / 99 / 99 |
| B · comp diet | 66.2% | 96 | 98 | 93 | 100 | 99 | 96 | 99 | 100 | 98 | 100 | 100 | 86 | 100 | 100 | 96 | 99 / 99 / 99 / 100 / 100 |
| C · steeper targets | 66.2% | 98 | 99 | 92 | 100 | 100 | 95 | 100 | 100 | 99 | 100 | 100 | 85 | 100 | 100 | 94 | 99 / 100 / 99 / 100 / 100 |
| C2 · boss targets × 2 | 54.8% | 99 | 99 | 87 | 100 | 100 | 94 | 100 | 100 | 96 | 100 | 100 | 77 | 100 | 100 | 92 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 72.5% | 99 | 100 | 94 | 100 | 100 | 96 | 100 | 100 | 100 | 100 | 100 | 85 | 100 | 100 | 96 | 100 / 100 / 100 / 100 / 100 |
| R · A + B | 42.0% | 93 | 97 | 91 | 99 | 98 | 91 | 96 | 98 | 93 | 97 | 99 | 80 | 99 | 99 | 88 | 98 / 99 / 98 / 99 / 100 |

#### hype crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 14.1% | 83 | 90 | 84 | 95 | 93 | 77 | 92 | 94 | 76 | 90 | 95 | 74 | 98 | 98 | 84 | 85 / 90 / 91 / 93 / 96 |
| A · crew-cash taper | 15.7% | 83 | 90 | 86 | 94 | 93 | 78 | 91 | 95 | 75 | 93 | 98 | 73 | 97 | 96 | 88 | 87 / 90 / 93 / 93 / 92 |
| A+ · steeper taper | 15.2% | 84 | 90 | 86 | 95 | 93 | 77 | 93 | 95 | 73 | 92 | 96 | 74 | 97 | 95 | 88 | 85 / 91 / 91 / 95 / 94 |
| B · comp diet | 12.1% | 76 | 85 | 86 | 91 | 89 | 77 | 87 | 93 | 80 | 91 | 95 | 76 | 97 | 96 | 88 | 86 / 88 / 92 / 93 / 92 |
| C · steeper targets | 9.6% | 78 | 86 | 81 | 91 | 91 | 73 | 90 | 93 | 73 | 91 | 94 | 71 | 97 | 95 | 86 | 84 / 87 / 91 / 90 / 91 |
| C2 · boss targets × 2 | 6.2% | 82 | 89 | 70 | 100 | 98 | 57 | 100 | 97 | 56 | 100 | 96 | 62 | 100 | 100 | 67 | 68 / 71 / 75 / 77 / 80 |
| X · late table max 5% | 1.9% | 70 | 79 | 72 | 89 | 85 | 57 | 85 | 91 | 53 | 81 | 94 | 65 | 91 | 94 | 65 | 74 / 80 / 81 / 81 / 90 |
| R · A + B | 11.6% | 76 | 84 | 86 | 92 | 88 | 76 | 89 | 93 | 79 | 89 | 96 | 76 | 97 | 95 | 88 | 87 / 90 / 91 / 92 / 93 |

#### mixed crew · pass at max + 1× odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 61.7% | 96 | 99 | 91 | 100 | 99 | 95 | 99 | 99 | 97 | 100 | 100 | 83 | 100 | 100 | 95 | 98 / 99 / 99 / 100 / 100 |
| A · crew-cash taper | 44.3% | 95 | 98 | 91 | 99 | 98 | 92 | 97 | 99 | 93 | 98 | 99 | 79 | 99 | 99 | 88 | 96 / 98 / 97 / 98 / 98 |
| A+ · steeper taper | 39.4% | 93 | 97 | 89 | 98 | 97 | 91 | 96 | 98 | 90 | 97 | 99 | 80 | 99 | 98 | 88 | 96 / 97 / 96 / 97 / 98 |
| B · comp diet | 54.7% | 93 | 97 | 91 | 99 | 98 | 95 | 98 | 99 | 96 | 99 | 100 | 82 | 100 | 100 | 95 | 97 / 98 / 99 / 100 / 100 |
| C · steeper targets | 53.0% | 96 | 98 | 88 | 99 | 99 | 95 | 98 | 99 | 95 | 100 | 100 | 81 | 100 | 100 | 93 | 96 / 98 / 99 / 99 / 100 |
| C2 · boss targets × 2 | 38.0% | 97 | 98 | 79 | 100 | 100 | 94 | 100 | 100 | 90 | 100 | 100 | 66 | 100 | 100 | 90 | 93 / 95 / 95 / 99 / 99 |
| X · late table max 5% | 69.7% | 98 | 99 | 92 | 100 | 100 | 96 | 100 | 100 | 99 | 100 | 100 | 86 | 100 | 100 | 95 | 99 / 99 / 100 / 100 / 100 |
| R · A + B | 37.0% | 91 | 95 | 89 | 98 | 97 | 92 | 95 | 98 | 93 | 96 | 99 | 79 | 99 | 98 | 87 | 96 / 97 / 96 / 98 / 99 |

#### cash crew · pass at max + max odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 22.9% | 89 | 94 | 75 | 98 | 94 | 94 | 91 | 96 | 92 | 96 | 97 | 70 | 98 | 98 | 84 | 91 / 91 / 91 / 95 / 94 |
| A · crew-cash taper | 8.4% | 84 | 92 | 69 | 97 | 88 | 87 | 83 | 92 | 82 | 88 | 93 | 67 | 96 | 93 | 67 | 85 / 86 / 86 / 85 / 80 |
| A+ · steeper taper | 5.8% | 82 | 90 | 67 | 95 | 87 | 84 | 81 | 90 | 77 | 86 | 93 | 59 | 97 | 91 | 71 | 83 / 84 / 80 / 88 / 85 |
| B · comp diet | 16.2% | 84 | 91 | 72 | 97 | 91 | 92 | 88 | 94 | 89 | 94 | 97 | 68 | 98 | 97 | 82 | 88 / 89 / 88 / 95 / 93 |
| C · steeper targets | 14.1% | 87 | 91 | 72 | 95 | 92 | 91 | 89 | 95 | 90 | 92 | 97 | 63 | 97 | 97 | 79 | 87 / 90 / 88 / 93 / 94 |
| C2 · boss targets × 2 | 13.7% | 89 | 94 | 65 | 100 | 99 | 82 | 100 | 97 | 83 | 100 | 99 | 56 | 100 | 100 | 70 | 82 / 84 / 86 / 88 / 90 |
| X · late table max 5% | 51.4% | 96 | 98 | 85 | 99 | 98 | 94 | 98 | 99 | 97 | 99 | 100 | 81 | 100 | 100 | 92 | 97 / 98 / 98 / 99 / 99 |
| R · A + B | 5.7% | 82 | 89 | 67 | 96 | 86 | 83 | 84 | 92 | 81 | 86 | 91 | 60 | 97 | 85 | 70 | 86 / 85 / 83 / 87 / 87 |

### Option A — Crew-cash taper (recommended)
Scale crew cash off a shrinking share of the target as floors rise: `ADDITIVE_MULT × {F5 0.8, F6 0.7, F7 0.6, F8 0.5, F9 0.45}`. In code this is one floor-indexed factor in the FB-024 formula, or per-floor `markerTargetCents` scaling before the cascade. Each crew file keeps its own `ADDITIVE_MULT`.
- **Cash and mixed crews:** cash on the pass line goes 71% → **45%**, mixed 71% → **52%**, mixed with 1× odds 62% → 44%. Most of the drop comes from the boss rooms that hit crew cash (Hierophant, Sovereign, Emissary 81%, Architect 83–88%). Non-boss markers stay 97–100%.
- **Hype crews:** unchanged (14% → 16%), so the gap between builds narrows a little.
- **Why it fits:** it counters the jump in crew income from the 4th and 5th slots (Board Seat, Cargo Hold), which today arrives exactly when the game should get harder.
- **A+** (0.7 → 0.4) goes another ~5–8 points further.

### Option B — Comp diet (no longer needed)
The Vig +20% → +10%, and Member's Jacket's extra shooter only at **boss** markers from Floor 5.
- Worth ~4–7 points on its own, and it hits every build, including hype crews (14% → 12%).
- Before the boss reworks it was needed to reach the target band. With the reworks in, A alone gets there, and **R = A + B overshoots** (cash 34%).
- Keep it in reserve for fine-tuning.
- Don't trim The Keepsake or The Covenant: they're the hype build's lifeline.

### Option C — Steeper targets (not recommended)
- **C:** every late target × 1.2 per marker (The Architect ≈ $924M).
- **C2:** late boss targets × 2.
- Both mostly hurt **hype** builds, because a cash build's crew cash grows with the target. C2 drops hype crews to 6%, and their bosses to 56–70%.

### Option X — Late table max 5% (rejected)
Shown because it seems like the obvious fix. It *raises* the cash and mixed finish rates and drops hype crews to 2%.

### Package R = A + B
- Cash 71% → 34%, mixed 71% → 42%, mixed with 1× odds 62% → 37%, hype 14% → 12%.
- Use it only if the target is "a strong build finishes about a third of the time".

---

## 7. Recommendations

1. **The boss reworks did their job, and the Emissary most of all.** Count them in before changing core mechanics: they already took ~10 points off the late finish rate for strong builds.
2. **Adopt Option A (crew-cash taper) on its own** as the economy change. It lands cash and mixed crews at ~45–52% from Floor 5, inside the suggested band of **40–60%** for a good cash or mixed build. Re-tune the per-floor factors in `levers` / `options` mode if the target band changes. That band is a suggestion, not a decided goal.
3. **Hold off on the comp trim (B).** With the reworks in place it overshoots when combined with A.
4. **Don't lower the table max or steepen targets** to make the late game harder. Both mostly punish hype builds.
5. **Fix hype builds next, separately.** From Floor 5 they now finish ~15%, against ~72% for cash and mixed crews. Two of the three reworks (Sovereign −14, Commander −14) land almost entirely on them, on top of The Executive (−17). Options to look at:
   - make Hype-only crews more forgiving in those rooms;
   - add a hype-side reward (e.g. The Keepsake also applying in The Commander's room);
   - let Hype pay a little on crew cash, so mixed crews aren't strictly better.
6. **A boss rule that should threaten cash and mixed builds has to take away crew cash, or end the run.** That's the Hierophant/Emissary/Executive pattern. Rules that only touch Hype (Commander) or wait for a 7-out (Sovereign) cost those builds 0–5 points, because they clear in ~10 rolls.
7. **Consider making crew cash *at risk*** as a later structural change: today it pays even on a 7-out. The Emissary's lag is a floor-specific version of that idea, and it is now the most effective late rule. A softer game-wide version (e.g. crew cash on a 7-out roll is lost) would raise the stakes everywhere. Not simulated here.

---

## Appendix — reproducing / extending

- **Levers** live in `BASE_LEVERS`: `targetMult`, `maxBetPct`, `additiveMult`, `vig`, `jacket`, `keepsake`, `covenant`, `poseidon`, `frequencyPct`, `bossRules`, `hires`, `bossVersion`. Per-marker levers are functions of the marker index.
- **New candidates:** add them to `OPTIONS` (curves) or `LEVERS` (one-row sensitivity).
- **Boss-rule experiments:** add a branch in `playMarker` next to the existing `isBoss(BOSS.…)` branches, then measure with `isolated` mode (rule on vs off). The current Sovereign, Commander and Emissary parameters come straight from `GAUNTLET[…].boss.ruleParams`. The script throws if their shape changes, so a retune is picked up automatically and a redesign fails loudly.
- **Sanity check:** at startup the script checks that its local max/min-bet helpers reproduce `getMaxBet`, `getMinBet` and `getBossMinBet` at identity levers, and throws if they drift.
