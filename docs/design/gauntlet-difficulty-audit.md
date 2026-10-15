# Difficulty Audit — the Whole Gauntlet (Floors 1–9)

> **Status:** Analysis and proposal only. No game rules or numbers were changed.
> **History:**
> - **2026-10-14:** late game (Floors 4–9).
> - **2026-10-15:** re-run against the reworked Sovereign / Commander / Emissary (FB-037/038/039).
> - **2026-10-15:** extended to Floors 1–3 from a brand-new run, plus build-balance packages ("mixed crews should be best").
>
> **Tool:** `scripts/sim/gauntlet-economy-sim.mjs` (run `npm run build -w @battlecraps/shared` first).
> - Every table is `SIM_N=4000`; isolated and lever tables use 2,000 per cell.
> - Separate runs of the same configuration differ by about ±2 points.
> - Late-game cells measured on runs that started on Floor 1 are noisier (±4), because only ~10% of those runs get there.
>
> Rerun a section with `node scripts/sim/gauntlet-economy-sim.mjs chain | early | packages | isolated | levers | options | compare`.

---

## TL;DR

1. **Playtesters are right about Floors 1–3, and the wall is the opening, not the bosses.**
   - A new run ($30, no crew, $5 table max) clears the first Loading Dock marker ($30 → $50) **36%** of the time on the pass line. The second marker clears ~**52%**, with one crew member.
   - Only **11–13%** of new runs reach Floor 4 with a cash or mixed crew.
   - After that the floor is easy: The Foreman 94–97% (his payoff rule *helps*), Sarge ~89%, Le Prix 85–93%.
2. **Opening fix:** for post-tutorial runs only, start with **$40 and one free Starter crew member**.
   - Reaching Floor 4 goes from 11–13% to **37–42%**; finishing the whole run from 6–8% to **20–24%**.
   - The tutorial keeps its $30 and scripted dice.
3. **The Floor 6–8 boss reworks made the late game harder.** For runs that reach Floor 5, finishing drops ~10–12 points for cash and mixed crews and ~11 for hype crews.
   - The Emissary bites every build (−9 to −17).
   - The Sovereign and The Commander bite mostly hype builds (−12 to −15), and cash/mixed builds only 0–4.
4. **The late-game economy is still soft.** With boss rules off, every late marker clears 99–100% for cash and mixed crews. Crew cash is the engine.
5. **Mixed crews should be best (agreed direction).** Today all-in cash is as good as mixed, and all-in hype barely works. Recommended late-game package, A + H:
   - **Crew-cash taper:** crew cash scales ×0.8 (Floor 5) down to ×0.45 (Floor 9).
   - **Crew Hype ×1.5:** every Hype crew member's boost goes up by half.
   - **Result** (finish from Floor 5): mixed **63%**, cash **45%**, hype **28%** (today 73 / 72 / 16).
6. **Whole-run recommendation: opening fix + A + H.** From a new run:
   - Reach Floor 4: ~40% (today ~11%).
   - Finish: mixed **20%**, cash **15%**, mixed with 1× odds **15%** (today 6–7%).
   - Pure hype stays non-viable (reaches Floor 4 ~8% of the time). **Decided 2026-10-15: that's fine.** Pure hype builds aren't a balance target; Hype is a multiplier and needs crew cash to multiply.

---

## Method

The harness plays whole runs on the real shared engine, using the same per-roll order as `apps/api/src/routes/rolls.ts`:

`resolveRoll` → base Hype tick → Poseidon's Favor → `resolveCascade` (real Starter crew; Le Prix's real `DISABLE_CREW` hook; skipped during the Emissary's blackout) → crew Hype lever → Sarge's clock → The Vig → the Emissary's signal lag → Load-Bearing → Hierophant escrow → `settleTurn` → the Foreman's skim / the Executive's +15% → The Frequency → escrow release → the Sovereign's Undertow → state advance → the Commander's orbital bleed.

| Modelled | How |
|---|---|
| New run | Starts at marker 0 with $30, no crew, 3 slots and 5 shooters (`POST /runs`). Tutorial dice are not modelled. |
| Pub | After every marker, one empty active slot is filled with the lineup's next crew member. A Starter costs 2 × the cleared marker's max bet: $10 after marker 0, $20 after marker 1, $40 after marker 2. The player only hires if they still keep the next marker's min bet. The draft is assumed to offer that crew member, which is optimistic early. |
| Marker clear | Bankroll plus chips on the table ≥ target, checked after every roll. The Foreman's room clears only when his Cut reaches the $25 Payoff. Escrowed or in-transit crew cash is paid on a clear. |
| Per marker | Hype resets to 1.0×. Shooters reset to 5 (+1 Member's Jacket). Boss counter comes from `getBossEntryCounter` and Le Prix's entry charm from `pickEntryCharmSlot`. |
| Comps | Each comp is in effect from the marker after the boss that awards it: Vig, Jacket, Keepsake, Board Seat, Covenant, Poseidon, Cargo Hold, Frequency. |
| Bosses | **Foreman:** 20% skim of winning profit; clears at the $25 Cut. **Sarge:** the 6th straight blank in a point phase is a Seven-Out. **Le Prix:** one charmed crew member skipped, re-picked each come-out. **Executive:** rating, PIP, +15% at Exceptional. **Hierophant:** crew cash held until a win, × Hype, 75% seized on a 7-out. **Sovereign:** the tide cycles Dead Calm (no odds) / Undertow (7-out takes 35%) / High Tide (7-out drowns 2; The Covenant cancels it). **Commander:** Hype above 1.0× loses 20% after every roll that isn't a 7-out. **Emissary:** crew effects land one roll late, a 7-out drops them, then a 6-roll blackout. **Architect:** each 7-out demolishes the last crew member to fire; crew cash × 0.85^N. `bossVersion: 'legacy'` restores the pre-rework Floor 6–8 rules (§2 only). |
| Lineups (hire order) | **cash:** Doorman, Grinder, Ace McGee, Close Call, Even Keel · **hype:** Lookout, Momentum, Handicapper, Echo, Odd Couple · **mixed:** Doorman, Ace McGee, Handicapper, Momentum, Close Call · **none:** never hires. |
| Bets | **pass:** Pass Line at the 10% table max · **odds1x:** plus 1× odds · **maxOdds:** plus full 3/4/5× odds. No odds bets during Dead Calm. |
| Late-game modes | `levers`, `options` and `compare` start at **Floor 4** with 1.1× the $4k target and the Floor 1–3 comps, so enough runs reach Floor 5 to measure it. |

**Simplifications:** fixed betting strategies, no hardways, Starter crew only, no crew swaps.

**Cross-checks:**
- An engine-free 40-line craps sim gives marker 0 at 36.2% (pass) / 55.6% (1× odds), matching the harness's 36% / 55%.
- Each boss rework's own tuning sim puts its rule cost within a few points of the isolated numbers below.

---

## 1. Floors 1–3 — where new runs die

### Cash crew · pass line, from a new run (today)

| # | Marker | Target | Reached | Clear | Arrival ÷ target | Median rolls | Main loss |
|---|---|---|---|---|---|---|---|
| 0 | — | $50 | 100% | **36.3%** | 0.60 | 25 | out of shooters 62% |
| 1 | — | $100 | 36.3% | **53.0%** | 0.44 | 24 | out of shooters 46% |
| 2 | **The Foreman** | $200 | 19.3% | 95.2% | 0.43 | 17 | out of shooters 5% |
| 3 | — | $300 | 18.3% | 89.4% | 0.30 | 16 | out of shooters 11% |
| 4 | — | $500 | 16.4% | 96.8% | 0.62 | 9 | out of shooters 3% |
| 5 | **Sarge** | $1k | 15.8% | 89.0% | 0.52 | 12 | out of shooters 11% |
| 6 | — | $1.5k | 14.1% | 99.1% | 0.69 | 8 | — |
| 7 | — | $2k | 14.0% | 99.6% | 0.77 | 6 | — |
| 8 | **Mme. Le Prix** | $4k | 13.9% | 92.5% | 0.52 | 16 | out of shooters 7.5% |

**Why markers 0–1 are the wall:**
- With $30, a $5 max bet and no crew, marker 0 needs about four more pass-line wins than losses before 5 shooters run out. The pass line is slightly −EV, so this is close to a coin-flip game played against the house edge.
- Marker 1 starts after paying $10 for the first crew member. The player arrives with ~$44 of $100 and has just one crew member earning ~$1–3 per hit.
- From marker 2 on, three crew members and bigger bets take over.
- The no-crew baseline ("none") shows the floor: without crew nobody clears Floor 1 reliably (37% / 35% / 52%).

### All lineups — Floors 1–3

Clear rate given reached; **bold** = boss. "Reach F4" = share of new runs that clear Le Prix.

| Lineup · bets · variant | Reach F4 | 0 | 1 | **2** | 3 | 4 | **5** | 6 | 7 | **8** |
|---|---|---|---|---|---|---|---|---|---|---|
| none · pass · today | 0.0% | 37 | 35 | 52 | 34 | 46 | 19 | 63 | 60 | 33 |
| cash · pass · today | 12.3% | 36 | 51 | 94 | 88 | 97 | 93 | 99 | 99 | 93 |
| cash · pass · no boss rules | 11.2% | 36 | 52 | 69 | 97 | 97 | 94 | 100 | 100 | 98 |
| mixed · pass · today | 11.1% | 37 | 51 | 97 | 87 | 95 | 89 | 98 | 98 | 86 |
| mixed · pass · crew Hype ×1.5 | 11.9% | 37 | 52 | 97 | 90 | 96 | 87 | 98 | 99 | 87 |
| mixed · pass · no boss rules | 11.6% | 36 | 54 | 77 | 95 | 96 | 92 | 98 | 99 | 94 |
| hype · pass · today | 1.3% | 36 | 43 | 72 | 57 | 78 | 54 | 82 | 77 | 75 |
| hype · pass · crew Hype ×1.5 | 2.6% | 35 | 50 | 78 | 65 | 79 | 62 | 88 | 92 | 76 |
| mixed · odds1x · today | 16.2% | 55 | 61 | 93 | 81 | 93 | 83 | 98 | 98 | 87 |
| cash · maxOdds · today | 4.9% | 47 | 52 | 60 | 80 | 90 | 72 | 93 | 94 | 72 |

**Boss costs on Floors 1–3**, isolated (rule on minus off, arriving with 1.1× the previous target and a full crew):

| Lineup · bets | The Foreman | Sarge | Le Prix |
|---|---|---|---|
| cash · pass | **+8** | −3 | −6 |
| mixed · pass | **+7** | −3 | −8 |
| hype · pass | **+9** | −13 | −6 |
| mixed · odds1x | **+12** | −5 | −9 |

- **The Foreman *helps*.** His Cut counts 20% of winnings and ignores losses, so $25 of Cut (~$125 of winning profit) arrives sooner than a $200 bankroll would. That's arguably fine for the first boss, but it means he isn't the problem.
- **Sarge and Le Prix are modest gates.** Sarge's clock is the hype build's worst early room (−13).
- **Crew Hype ×1.5 changes almost nothing early** (Reach F4 +1 point), so it's safe for Floors 1–3.

### Fixes for the opening

Chained from a new run. Cells: reach Floor 4 / finish the whole run. The last column gives the mixed crew's per-marker clear rates for markers 0–8.

| Option | cash · pass | mixed · pass | hype · pass | mixed · odds1x | mixed · pass, markers 0–8 |
|---|---|---|---|---|---|
| Today | 12.9% / 7.7% | 10.5% / 6.3% | 0.9% / 0.1% | 16.5% / 7.6% | 36 / 53 / 96 / 85 / 95 / 88 / 98 / 99 / 83 |
| E1 · start $40 | 19.1% / 11.3% | 18.3% / 10.5% | 2.2% / 0.2% | 20.0% / 9.1% | 59 / 53 / 96 / 86 / 95 / 87 / 99 / 99 / 87 |
| E2 · start $50 (skips marker 0) | 32.9% / 18.7% | 28.5% / 15.6% | 3.7% / 0.1% | 25.8% / 11.8% | 98 / 50 / 97 / 85 / 95 / 87 / 98 / 99 / 87 |
| E3 · start with 1 free crew | 30.1% / 18.1% | 26.8% / 14.9% | 3.1% / 0.1% | 24.5% / 11.8% | 54 / 77 / 97 / 91 / 95 / 89 / 99 / 99 / 88 |
| E4 · Floor 1 table max 20% | 21.3% / 12.3% | 18.0% / 10.3% | 2.9% / 0.1% | 11.1% / 5.1% | 55 / 59 / 92 / 83 / 95 / 88 / 99 / 99 / 88 |
| E5 · +1 shooter on Floor 1 | 15.8% / 9.6% | 15.3% / 9.2% | 1.8% / 0.1% | 17.3% / 7.6% | 40 / 61 / 99 / 87 / 96 / 88 / 99 / 99 / 87 |
| E6 · +1 shooter on markers 0–1 | 16.7% / 9.2% | 14.8% / 8.2% | 2.0% / 0.3% | 16.9% / 7.2% | 41 / 62 / 96 / 84 / 96 / 89 / 98 / 99 / 89 |
| **E7 · 1 free crew + start $40** | **41.1% / 24.1%** | **37.0% / 20.8%** | 4.0% / 0.4% | **31.9% / 15.2%** | 75 / 78 / 97 / 92 / 95 / 89 / 98 / 99 / 87 |

**E7 is the recommended opening fix.** The two parts fix different markers: the $40 helps marker 0 (36% → 59%), and the free crew member helps marker 1 (53% → 77%). Together, marker 0 is ~75% and marker 1 ~78%, and Floors 2–3 are unchanged.

**Tutorial constraint:**
- The $30 start exists because a $40 start cleared the first marker too early and broke the tutorial's beat flow.
- The tutorial run scripts its dice (a hard 8 clears the first marker), and `POST /runs` already knows `user.tutorialCompleted`.
- So E7 should apply to **post-tutorial runs only**: keep $30 and no crew when the tutorial is pending.
- Sal's crew-rail line ("You recruit crew members in the pub between markers") still holds. A "first round's on the house" pick before marker 0 would need its own small UI.

---

## 2. Did the Floor 6–8 reworks change things? (runs from Floor 4)

The same runs under the legacy and current Floor 6–8 rules, written legacy → current. "Finish | F5" = share of runs that reach Floor 5 and beat The Architect. Boss columns = clear rate given reached. **Rule cost** = isolated clear rate with that boss's rule on minus off.

| Lineup · bets | Finish \| F5 | Sovereign clear | Commander clear | Emissary clear | Sovereign rule cost | Commander rule cost | Emissary rule cost |
|---|---|---|---|---|---|---|---|
| cash · pass | 82.1 → **71.5** | 99.8 → 95.0 | 97.8 → 99.8 | 99.2 → 89.5 | −0.1 → −4.0 | −2.1 → 0.0 | −0.6 → **−9.3** |
| mixed · pass | 84.8 → **72.8** | 99.8 → 96.0 | 98.9 → 98.7 | 98.1 → 87.8 | +0.1 → −3.7 | −0.9 → −0.6 | −1.5 → **−11.7** |
| hype · pass | 27.5 → **15.9** | 88.2 → 77.2 | 92.8 → 76.8 | 93.2 → 75.9 | −0.3 → **−12.4** | +2.4 → **−15.1** | −0.7 → **−17.3** |
| cash · odds1x | 68.0 → 59.4 | 98.8 → 94.9 | 94.8 → 99.0 | 97.9 → 85.8 | +0.2 → −3.2 | −3.7 → −0.3 | −2.1 → −13.1 |
| mixed · odds1x | 74.5 → 62.0 | 98.8 → 96.3 | 97.8 → 97.2 | 95.5 → 83.4 | 0.0 → −3.0 | −0.8 → −2.2 | −3.9 → −16.5 |
| hype · odds1x | 18.1 → 14.6 | 85.2 → 78.5 | 88.3 → 83.0 | 89.6 → 80.0 | −1.9 → −8.5 | −0.3 → −6.0 | −0.7 → −11.8 |
| cash · maxOdds | 21.3 → 21.1 | 87.1 → 90.3 | 81.9 → 91.6 | 81.8 → 69.5 | −4.4 → +0.2 | −10.2 → −1.5 | −14.7 → −31.2 |
| mixed · maxOdds | 18.4 → 16.5 | 84.8 → 90.0 | 85.7 → 81.5 | 80.0 → 74.9 | −1.4 → +6.1 | −0.8 → −5.5 | −18.0 → −31.3 |

**Each rework:**
- **The Emissary** went from costing ~0 to −9 to −17 for every build. He's the only late rule besides The Hierophant that hits crew cash, because cash lands late, a 7-out loses it, and the blackout stops it.
- **The Sovereign** now costs ~4 points for cash/mixed crews and ~12 for hype crews. Both her penalties wait for a 7-out, and a cash crew clears her room in ~10 rolls.
- **The Commander** reversed whom he hurts. He now costs cash crews nothing (they barely use Hype) and hype crews ~15.
- **Max-odds bettors** were *helped* by the Sovereign and Commander changes, because the old tide minimum and death spiral are gone. The Emissary hurts them more.

**Net effect:** the late game is ~10–12 points harder for every build. Hype builds lost about 40% of their already small late finish rate.

---

## 3. The late game today (runs from Floor 4, current rules)

### Isolated markers — what each boss rule costs

The player arrives with 1.1× the previous target and a full crew for the slots and comps earned by then. Cells read *rule on / rule off (cost in points)*. Differences of ±2 points are noise.

| Lineup · bets | 11 Exec | 14 Hiero | 17 Sov | 20 Cmdr | 23 Emi | 26 Arch | Late non-boss markers |
|---|---|---|---|---|---|---|---|
| cash · pass | 80/98 (−18) | 91/99 (−8) | 96/100 (−4) | 100/100 (0) | 91/100 (−9) | 97/100 (−3) | 99–100 |
| mixed · pass | 80/98 (−18) | 94/99 (−5) | 96/100 (−4) | 99/100 (−1) | 89/100 (−12) | 97/100 (−3) | 99–100 |
| hype · pass | 67/83 (−16) | 86/85 (≈0) | 76/88 (−12) | 76/90 (−14) | 75/93 (−18) | 86/93 (−7) | 84–97 |
| cash · odds1x | 80/95 (−15) | 86/97 (−11) | 95/99 (−4) | 99/99 (0) | 87/100 (−13) | 93/100 (−7) | 98–100 |
| mixed · odds1x | 77/94 (−18) | 90/98 (−7) | 96/98 (−2) | 96/99 (−3) | 85/100 (−15) | 95/100 (−5) | 97–100 |
| hype · odds1x | 75/78 (−3) | 81/80 (≈0) | 75/80 (−5) | 76/83 (−7) | 74/84 (−10) | 82/85 (−3) | 78–95 |
| cash · maxOdds | 74/78 (−4) | 70/89 (−18) | 90/89 (≈0) | 89/90 (−1) | 62/94 (−32) | 81/93 (−13) | 87–98 |
| mixed · maxOdds | 68/72 (−5) | 70/77 (−7) | 85/79 (+7) | 73/78 (−5) | 62/92 (−30) | 78/91 (−13) | 77–95 |

### Soft spots
- **Late non-boss markers are automatic** for cash and mixed crews (≥ 98%). Markers 15, 19, 22, 24 and 25 grow only 1.33–1.5× over the previous target; players arrive at 0.7–0.85× and clear in 3–6 rolls.
- **The Commander costs cash and mixed crews nothing, and The Sovereign ~4 points.** They're hype-build bosses now.
- **The real gates for strong builds are The Executive (−18), The Hierophant (−5 to −11) and The Emissary (−9 to −15).** All three either end the run outright (PIP) or take away crew cash.
- **Betting max odds every roll is a losing strategy.** With max odds on a 6/8, a player stakes 60% of the target on one decision, so those runs die broke.
- **The $276M playtester run is an outlier.** A typical finisher ends at $63–75M, and pass-line Starter runs top out around $75–110M. Only max-odds gambling (best runs ~$110–150M) or Rare/Legendary multipliers (not simulated) get near it.

### Why: crew cash is risk-free, target-scaled income
- **Formula:** each cash crew pays `ADDITIVE_MULT × 10% × target` (FB-024).
- **Size:** a 4-slot cash crew adds ~4% of the target per roll before Hype, ~5% with The Vig.
- **It doesn't care about the floor:** the share of the target is the same on Floor 9 as on Floor 4.
- **It pays on losing rolls too, including the 7-out.** Only The Hierophant and The Emissary hold it back.
- **Hype multiplies it.**
- **Net effect:** a shooter lasts ~8.5 rolls and brings in ~0.4–0.6× the target from crew cash alone. Players enter a marker at 0.4–0.85× the target with 6–7 shooters, so a marker needs about one good shooter and gives you six.

**Single-lever sensitivity.** Runs start at Floor 4; levers apply on Floors 5–9 unless noted. The last column is the five late bosses with every boss rule off, for a cash crew on the pass line: the room a boss rule has to work with.

| Lever | Finish \| F5: cash · pass | mixed · pass | hype · pass | mixed · odds1x | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|
| Today | 72.6% | 73.8% | 15.9% | 62.3% | 99 / 100 / 100 / 100 / 100 |
| Member's Jacket off (F5+) | 61.4% | 62.2% | 7.4% | 55.0% | 98 / 99 / 100 / 100 / 100 |
| The Vig off | 63.1% | 66.8% | 15.6% | 55.0% | 98 / 99 / 99 / 100 / 100 |
| The Keepsake off | 72.2% | 62.5% | 5.1% | 51.8% | 99 / 100 / 100 / 100 / 100 |
| The Covenant off | 67.8% | 67.6% | 10.1% | 57.2% | 99 / 100 / 99 / 100 / 100 |
| Poseidon's Favor off | 70.6% | 69.1% | 12.3% | 58.6% | 100 / 100 / 100 / 100 / 100 |
| Crew cash × 0.5 (F5+) | 30.6% | 42.9% | 14.7% | 36.1% | 91 / 94 / 96 / 99 / 99 |
| Crew cash off (F5+) | 0.0% | 3.1% | 16.5% | 4.7% | 45 / 55 / 45 / — / — |
| Table max 7.5% (F5+) | 74.2% | 72.4% | 8.4% | 67.3% | 100 / 100 / 100 / 100 / 100 |
| Table max 5% (F5+) | 77.7% | 72.1% | 1.7% | 70.7% | 100 / 100 / 100 / 100 / 100 |
| Targets × 1.15 per marker | 66.9% | 70.1% | 10.7% | 55.0% | 99 / 99 / 99 / 100 / 100 |
| Targets × 1.3 per marker | 63.5% | 62.3% | 7.6% | 49.0% | 99 / 100 / 99 / 100 / 100 |
| One extra hire per floor | 71.3% | 71.7% | 13.8% | 60.6% | 99 / 100 / 100 / 100 / 100 |
| Crew cash × 0.35 (F5+) | 12.8% | 29.7% | 15.7% | 26.8% | 85 / 90 / 91 / 95 / 96 |
| Crew cash × 0.5 + Jacket off (F5+) | 18.1% | 28.4% | 8.6% | 27.3% | 86 / 93 / 94 / 97 / 97 |
| 4 shooters (F5+) | 48.0% | 43.5% | 3.6% | 40.1% | 95 / 99 / 98 / 100 / 100 |
| Crew cash × 0.5 + 4 shooters (F5+) | 7.9% | 15.5% | 4.3% | 17.4% | 79 / 87 / 90 / 95 / 93 |
| Boss targets × 2 (F5+) | 55.5% | 54.7% | 7.3% | 39.3% | 98 / 99 / 99 / 100 / 100 |
| Crew Hype × 1.25 (all floors) | 72.6% | 77.0% | 21.3% | 67.1% | 99 / 100 / 100 / 100 / 100 |
| Crew Hype × 1.5 (all floors) | 73.6% | 80.2% | 27.5% | 68.1% | 99 / 100 / 100 / 100 / 100 |

**Reading the lever table:**
- **Crew cash is the only lever that moves cash builds a lot.** Halving it costs ~42 points; removing it ends the build. It doesn't affect hype builds at all.
- **Crew Hype ×1.5 helps hype (16% → 28%) and mixed (74% → 80%) builds, and leaves cash builds alone.** That's exactly the "mixed is best" direction.
- **The Keepsake and The Covenant are the hype build's lifelines** (16% → 5% and → 10% without them). Don't trim them.
- **Lowering the table max, raising targets and charging more at the pub all fail.** A lower table max *helps* cash builds, because there's less house edge to lose, and wrecks hype builds. Steeper targets bring proportionally more crew cash, so they also hurt hype builds most.

---

## 4. Build balance: making mixed crews the best

**Design decision (2026-10-15):** going all-in on one mechanic should present problems, and a mixed crew should be the strongest build. Pure hype builds are **not** a balance target: Hype multiplies profit, so a crew with no cash has nothing to multiply. Balance work targets mixed crews first, then pure cash.

**Today it isn't** (finish | F5, pass line, from Floor 4):
- **Pure cash:** 72%, about equal to mixed (74%). All-in cash barely pays a price; its only counters are The Hierophant and The Emissary.
- **Pure hype:** 16%. All-in hype is punished far too hard.

**Why hype crews are weak:** Hype multiplies profit, but a pure hype crew has almost nothing to multiply: just the pass line, which wins ~half the time on 10% of the target. That's why mixed crews (cash × Hype) are strong, and it fits the intended design.

### Late-game options (runs from Floor 4)

**Option list:**
- **A · crew-cash taper:** ADDITIVE_MULT × 0.8 / 0.7 / 0.6 / 0.5 / 0.45 on Floors 5–9.
- **A+ · steeper taper:** × 0.7 / 0.6 / 0.5 / 0.45 / 0.4.
- **B · comp diet:** The Vig +20% → +10%; Member's Jacket's extra shooter only at boss markers from Floor 5.
- **C · steeper targets:** every late target × 1.2 per marker (The Architect ≈ $924M).
- **C2 · boss targets ×2:** Floor 5–9 boss targets doubled.
- **X · table max 5%:** from Floor 5 (shown because it backfires).
- **H · crew Hype ×1.5:** every Hype crew member adds 1.5× today's boost, on every floor.
- **A + H / A+ + H:** the taper combined with the Hype buff.
- **R = A + B.**

**How to read the tables:**
- **Finish | F5:** share of runs that reach Floor 5 and beat The Architect.
- **Marker columns:** clear rate given reached; **bold** = boss.
- **Last column:** the same option with boss rules off.

#### cash crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 72.3% | 99 | 100 | 89 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 91 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 45.4% | 97 | 99 | 87 | 100 | 99 | 88 | 98 | 99 | 98 | 98 | 99 | 81 | 100 | 99 | 85 | 99 / 99 / 98 / 99 / 98 |
| A+ · steeper taper | 36.1% | 96 | 98 | 85 | 99 | 98 | 84 | 96 | 98 | 95 | 98 | 99 | 78 | 100 | 98 | 84 | 97 / 98 / 96 / 99 / 98 |
| B · comp diet | 66.0% | 96 | 99 | 89 | 100 | 99 | 94 | 99 | 100 | 100 | 100 | 100 | 90 | 100 | 100 | 95 | 99 / 100 / 100 / 100 / 100 |
| C · steeper targets | 66.0% | 99 | 99 | 88 | 100 | 100 | 94 | 99 | 100 | 100 | 100 | 100 | 88 | 100 | 100 | 94 | 99 / 100 / 100 / 100 / 100 |
| C2 · boss targets × 2 | 53.3% | 99 | 100 | 81 | 100 | 100 | 92 | 100 | 100 | 99 | 100 | 100 | 80 | 100 | 100 | 91 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 74.7% | 100 | 100 | 91 | 100 | 100 | 96 | 100 | 100 | 100 | 100 | 100 | 89 | 100 | 100 | 96 | 100 / 100 / 100 / 100 / 100 |
| H · crew Hype ×1.5 | 72.3% | 99 | 100 | 90 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 90 | 100 | 100 | 95 | 99 / 100 / 100 / 100 / 100 |
| A + H | 44.8% | 97 | 99 | 86 | 100 | 99 | 87 | 98 | 99 | 98 | 98 | 100 | 80 | 100 | 99 | 85 | 98 / 98 / 98 / 99 / 98 |
| A+ + H | 36.7% | 96 | 98 | 85 | 99 | 98 | 83 | 97 | 99 | 96 | 98 | 99 | 80 | 99 | 99 | 81 | 97 / 98 / 96 / 98 / 97 |
| R · A + B | 33.7% | 92 | 97 | 84 | 99 | 98 | 86 | 95 | 97 | 97 | 96 | 99 | 80 | 99 | 98 | 82 | 97 / 98 / 98 / 98 / 98 |

#### mixed crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 73.0% | 99 | 100 | 93 | 100 | 100 | 97 | 100 | 100 | 99 | 100 | 100 | 87 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| A · crew-cash taper | 52.8% | 98 | 99 | 91 | 100 | 99 | 92 | 98 | 99 | 95 | 99 | 100 | 81 | 100 | 100 | 90 | 98 / 99 / 98 / 99 / 98 |
| A+ · steeper taper | 47.3% | 96 | 99 | 91 | 99 | 99 | 90 | 97 | 99 | 93 | 99 | 99 | 82 | 100 | 99 | 87 | 98 / 99 / 97 / 99 / 99 |
| B · comp diet | 65.3% | 95 | 98 | 93 | 100 | 99 | 95 | 99 | 100 | 98 | 100 | 100 | 87 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| C · steeper targets | 66.5% | 98 | 99 | 92 | 100 | 100 | 95 | 100 | 100 | 99 | 100 | 100 | 84 | 100 | 100 | 95 | 99 / 100 / 100 / 100 / 100 |
| C2 · boss targets × 2 | 54.6% | 99 | 99 | 86 | 100 | 100 | 93 | 100 | 100 | 97 | 100 | 100 | 77 | 100 | 100 | 94 | 98 / 99 / 99 / 100 / 100 |
| X · late table max 5% | 73.7% | 100 | 100 | 93 | 100 | 100 | 97 | 100 | 100 | 100 | 100 | 100 | 85 | 100 | 100 | 96 | 100 / 100 / 100 / 100 / 100 |
| H · crew Hype ×1.5 | 79.9% | 100 | 100 | 95 | 100 | 100 | 98 | 100 | 100 | 99 | 100 | 100 | 89 | 100 | 100 | 98 | 100 / 100 / 100 / 100 / 100 |
| A + H | 63.2% | 98 | 99 | 94 | 100 | 100 | 96 | 99 | 100 | 96 | 100 | 100 | 84 | 100 | 100 | 91 | 99 / 99 / 99 / 100 / 100 |
| A+ + H | 57.9% | 98 | 99 | 93 | 100 | 99 | 94 | 99 | 99 | 94 | 100 | 100 | 83 | 100 | 100 | 90 | 99 / 99 / 99 / 100 / 99 |
| R · A + B | 40.7% | 93 | 97 | 92 | 99 | 98 | 90 | 95 | 99 | 93 | 98 | 99 | 78 | 99 | 98 | 87 | 98 / 98 / 98 / 99 / 99 |

#### hype crew · pass line at max

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 15.5% | 80 | 90 | 86 | 95 | 93 | 78 | 89 | 94 | 77 | 92 | 97 | 76 | 98 | 97 | 88 | 87 / 90 / 90 / 92 / 93 |
| A · crew-cash taper | 15.8% | 82 | 90 | 85 | 95 | 93 | 76 | 92 | 94 | 77 | 94 | 97 | 75 | 98 | 97 | 85 | 87 / 92 / 89 / 94 / 92 |
| A+ · steeper taper | 15.7% | 82 | 90 | 84 | 95 | 93 | 77 | 92 | 95 | 77 | 91 | 97 | 77 | 98 | 97 | 86 | 85 / 90 / 89 / 95 / 93 |
| B · comp diet | 11.2% | 75 | 84 | 86 | 91 | 92 | 78 | 88 | 93 | 77 | 88 | 93 | 74 | 96 | 95 | 90 | 85 / 89 / 88 / 94 / 91 |
| C · steeper targets | 9.7% | 76 | 87 | 81 | 92 | 90 | 75 | 91 | 93 | 74 | 90 | 93 | 73 | 96 | 95 | 82 | 82 / 85 / 89 / 90 / 90 |
| C2 · boss targets × 2 | 6.3% | 80 | 90 | 69 | 100 | 97 | 58 | 100 | 97 | 57 | 100 | 97 | 62 | 100 | 100 | 68 | 70 / 74 / 76 / 81 / 82 |
| X · late table max 5% | 2.3% | 68 | 82 | 73 | 90 | 87 | 58 | 78 | 89 | 54 | 86 | 88 | 64 | 95 | 97 | 75 | 72 / 81 / 87 / 84 / 87 |
| H · crew Hype ×1.5 | 29.2% | 87 | 93 | 92 | 96 | 95 | 85 | 95 | 97 | 82 | 94 | 99 | 82 | 99 | 98 | 91 | 91 / 94 / 93 / 94 / 96 |
| A + H | 27.8% | 87 | 94 | 92 | 97 | 95 | 80 | 95 | 98 | 83 | 95 | 98 | 80 | 98 | 98 | 90 | 89 / 94 / 94 / 95 / 96 |
| A+ + H | 28.4% | 88 | 94 | 90 | 97 | 94 | 83 | 95 | 98 | 83 | 94 | 98 | 82 | 99 | 99 | 89 | 90 / 93 / 94 / 96 / 95 |
| R · A + B | 11.3% | 77 | 86 | 85 | 91 | 90 | 74 | 87 | 92 | 77 | 90 | 94 | 80 | 95 | 98 | 86 | 85 / 90 / 92 / 94 / 95 |

#### mixed crew · pass at max + 1× odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 62.2% | 97 | 98 | 91 | 100 | 99 | 95 | 99 | 99 | 97 | 100 | 100 | 85 | 100 | 100 | 95 | 97 / 99 / 99 / 100 / 100 |
| A · crew-cash taper | 45.7% | 95 | 98 | 90 | 99 | 98 | 93 | 97 | 98 | 94 | 97 | 99 | 80 | 99 | 99 | 89 | 96 / 97 / 97 / 98 / 98 |
| A+ · steeper taper | 39.2% | 93 | 97 | 88 | 99 | 98 | 91 | 96 | 97 | 90 | 97 | 99 | 80 | 99 | 99 | 88 | 95 / 96 / 95 / 98 / 98 |
| B · comp diet | 54.3% | 94 | 97 | 90 | 99 | 99 | 96 | 98 | 99 | 96 | 99 | 100 | 83 | 100 | 100 | 94 | 98 / 99 / 98 / 100 / 100 |
| C · steeper targets | 50.8% | 96 | 97 | 87 | 99 | 98 | 95 | 98 | 99 | 96 | 99 | 100 | 79 | 100 | 100 | 94 | 97 / 98 / 98 / 99 / 100 |
| C2 · boss targets × 2 | 38.4% | 97 | 99 | 78 | 100 | 100 | 93 | 100 | 100 | 91 | 100 | 100 | 68 | 100 | 100 | 90 | 93 / 95 / 94 / 99 / 99 |
| X · late table max 5% | 70.6% | 99 | 99 | 93 | 100 | 100 | 96 | 100 | 100 | 98 | 100 | 100 | 86 | 100 | 100 | 96 | 99 / 100 / 100 / 100 / 100 |
| H · crew Hype ×1.5 | 71.1% | 98 | 99 | 94 | 100 | 100 | 98 | 100 | 100 | 98 | 100 | 100 | 86 | 100 | 100 | 96 | 99 / 99 / 99 / 100 / 100 |
| A + H | 55.8% | 97 | 98 | 93 | 99 | 99 | 96 | 98 | 99 | 94 | 98 | 100 | 83 | 99 | 100 | 92 | 98 / 99 / 98 / 99 / 99 |
| A+ + H | 50.1% | 96 | 98 | 92 | 99 | 98 | 94 | 97 | 99 | 93 | 99 | 100 | 80 | 99 | 99 | 90 | 97 / 98 / 97 / 98 / 99 |
| R · A + B | 35.9% | 90 | 95 | 90 | 98 | 96 | 91 | 95 | 97 | 92 | 96 | 98 | 79 | 99 | 99 | 89 | 96 / 96 / 96 / 98 / 97 |

#### cash crew · pass at max + max odds

| Option | Finish \| F5 | 12 | 13 | **14** | 15 | 16 | **17** | 18 | 19 | **20** | 21 | 22 | **23** | 24 | 25 | **26** | No-rule boss 14/17/20/23/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 21.0% | 88 | 94 | 74 | 98 | 94 | 92 | 91 | 97 | 89 | 96 | 97 | 69 | 100 | 97 | 84 | 90 / 92 / 93 / 95 / 94 |
| A · crew-cash taper | 8.6% | 84 | 93 | 70 | 96 | 90 | 87 | 83 | 91 | 83 | 89 | 92 | 67 | 96 | 91 | 70 | 85 / 86 / 82 / 87 / 86 |
| A+ · steeper taper | 6.3% | 83 | 90 | 66 | 96 | 87 | 85 | 81 | 93 | 79 | 85 | 93 | 59 | 95 | 91 | 75 | 84 / 83 / 81 / 84 / 85 |
| B · comp diet | 16.2% | 83 | 92 | 74 | 97 | 93 | 89 | 87 | 95 | 88 | 94 | 97 | 70 | 100 | 98 | 80 | 88 / 90 / 91 / 95 / 93 |
| C · steeper targets | 15.2% | 88 | 92 | 71 | 96 | 90 | 91 | 90 | 95 | 88 | 94 | 96 | 65 | 98 | 98 | 80 | 88 / 88 / 92 / 92 / 95 |
| C2 · boss targets × 2 | 13.3% | 88 | 94 | 64 | 100 | 99 | 84 | 100 | 97 | 81 | 100 | 99 | 52 | 100 | 100 | 74 | 84 / 86 / 85 / 90 / 90 |
| X · late table max 5% | 51.2% | 96 | 97 | 86 | 99 | 99 | 94 | 97 | 99 | 97 | 99 | 100 | 80 | 100 | 100 | 92 | 96 / 97 / 97 / 99 / 99 |
| H · crew Hype ×1.5 | 22.0% | 88 | 95 | 75 | 98 | 94 | 91 | 91 | 96 | 91 | 95 | 97 | 70 | 99 | 98 | 83 | 90 / 93 / 92 / 93 / 93 |
| A + H | 8.5% | 84 | 94 | 70 | 96 | 89 | 89 | 83 | 93 | 81 | 88 | 93 | 62 | 97 | 91 | 72 | 87 / 87 / 82 / 88 / 84 |
| A+ + H | 5.6% | 82 | 91 | 65 | 95 | 88 | 85 | 81 | 90 | 77 | 88 | 92 | 62 | 95 | 92 | 66 | 84 / 84 / 83 / 83 / 83 |
| R · A + B | 5.6% | 80 | 90 | 69 | 95 | 87 | 87 | 78 | 91 | 80 | 82 | 92 | 62 | 97 | 85 | 71 | 84 / 84 / 79 / 83 / 82 |

**Summary (finish | F5, pass line):**

| Package | Cash | Mixed | Hype | Mixed · 1× odds | Shape |
|---|---|---|---|---|---|
| Today | 72% | 73% | 16% | 62% | cash ≈ mixed ≫ hype |
| A (taper) | 45% | 53% | 16% | 46% | mixed > cash ≫ hype |
| H (Hype ×1.5) | 72% | 80% | 29% | 71% | everything easier |
| **A + H** | **45%** | **63%** | **28%** | **56%** | **mixed ≫ cash > hype** |
| A+ + H | 37% | 58% | 28% | 50% | mixed ≫ cash ≈ hype |
| R (A + B) | 34% | 41% | 11% | 36% | B hits hype builds too |

**A + H is the recommendation:**
- Mixed crews lead by ~18 points over cash and ~35 over hype.
- Each pure build has natural counters: The Hierophant and The Emissary punish all-in cash; Sarge, The Sovereign, The Commander and The Executive punish all-in hype.
- Use A+ + H if the late game should be harder overall.

**H in code:** raise each Hype crew member's boost by half. Lookout and Momentum +0.2 → +0.3, Echo +0.4 → +0.6, Handicapper 0.3 / 0.2 / 0.1 → 0.45 / 0.3 / 0.15, Odd Couple / Mirror +0.2 → +0.3, Silver Lining +0.4 → +0.6. Unlockable Hype crew would need the same review.

**Copy:** crew copy lives in `seed.ts` and `CrewPortrait.tsx`; boss and comp copy is unaffected.

### Hype builds early
Pure hype crews reach Floor 4 only 1–8% of the time under every option tested. They need a few markers of crew before Hype has anything to multiply, and Sarge's clock (−13) hits them hardest.

That's accepted: pure hype isn't a balance target. No early hype helper is planned. The hype crew rows remain in the tables as a reference point only.

---

## 5. Whole runs — packages from a new run

Chained from a brand-new run ($30, no crew). Each cell: reach Floor 4 / reach Floor 5 / finish given Floor 5 / finish the whole run. "Finish given F5" here is noisier (±3–5) than §4's Floor-4 runs.

| Package | cash · pass | mixed · pass | hype · pass | mixed · odds1x |
|---|---|---|---|---|
| Today | 12% / 10% / 70% / 7% | 11% / 8% / 71% / 6% | 1% / 1% / 17% / 0% | 15% / 12% / 62% / 7% |
| Opening fix (1 free crew + $40) | 42% / 33% / 73% / 24% | 37% / 28% / 72% / 20% | 4% / 2% / 18% / 0% | 31% / 23% / 61% / 14% |
| A + H (late cash taper + Hype ×1.5) | 13% / 10% / 47% / 5% | 12% / 9% / 67% / 6% | 3% / 2% / 24% / 0% | 18% / 14% / 57% / 8% |
| Opening fix + A + H | 41% / 32% / 48% / 15% | 39% / 31% / 63% / 20% | 8% / 5% / 24% / 1% | 35% / 28% / 54% / 15% |
| Opening fix + A+ + H | 41% / 32% / 37% / 12% | 40% / 32% / 58% / 19% | 8% / 5% / 28% / 1% | 33% / 27% / 52% / 14% |

**Recommended: opening fix (E7) + A + H.**
- **Reaching Floor 4:** ~40% for cash, mixed and 1×-odds crews (today ~11–15%).
- **Finishing the whole run:** mixed 20%, cash 15%, mixed with 1× odds 15% (today 6–7%).
- **More runs see the late game, and the late game decides more of them:** finish given Floor 5 falls from ~71% to 48–63%.
- **Mixed crews are the best build end to end.**

---

## 6. Recommendations

1. **Fix the opening first (E7: post-tutorial runs start with $40 and one free Starter).** It's the biggest single improvement for players, and it matches what playtesters report. Floors 1–3's bosses are not the problem; leave them alone, including The Foreman's helpful payoff.
2. **Adopt A + H for the late game:** crew-cash taper on Floors 5–9, plus crew Hype ×1.5 on all floors. H barely changes Floors 1–3 (+1 point to reach Floor 4), so it doesn't fight the opening fix.
3. **Count the boss reworks in.** The Emissary, Sovereign and Commander changes already took 10–12 points off the late game. Don't pile extra late-game nerfs on top of A.
4. **Hold off on the comp trim (B).** It overshoots with A and hurts hype builds as much as cash.
5. **Don't lower the table max or steepen targets.** Both mostly punish hype builds.
6. **A boss rule that should threaten cash and mixed builds has to take crew cash or end the run** (the Hierophant / Emissary / Executive pattern). Rules that only touch Hype, or that wait for a 7-out, cost those builds 0–5 points.
7. **Pure hype builds are not a target (decided).** Keep the Hype buff (H) for what it does for mixed crews; don't tune for pure hype.
8. **Later, consider making crew cash at risk** (e.g. crew cash on a 7-out roll is lost). The Emissary shows how effective that is.

**Suggested target bands** (my proposal, not a decided goal):
- Reach Floor 4 from a new run: ~40%.
- Finish given Floor 5: 50–65% for mixed crews, 35–50% for pure cash crews. Pure hype isn't a target.

---

## Appendix — reproducing / extending

- **Levers** live in `BASE_LEVERS`: `targetMult`, `maxBetPct`, `additiveMult`, `vig`, `jacket`, `keepsake`, `covenant`, `poseidon`, `frequencyPct`, `bossRules`, `hires`, `bossVersion`, `crewHypeMult`, `startCents`, `startCrew`, `extraShooters`. Per-marker levers are functions of the marker index.
- **New candidates:** add them to `OPTIONS` (late curves), `LEVERS` (one-row sensitivity), `EARLY_OPTIONS` (opening) or `PACKAGES` (whole runs).
- **Boss-rule experiments:** add a branch in `playMarker` next to the existing `isBoss(BOSS.…)` branches, then measure with `isolated` mode (rule on vs off). Every boss's parameters come from `GAUNTLET[…].boss.ruleParams`; the script throws if their shape changes.
- **Sanity check:** at startup the script checks its max/min-bet helpers against `getMaxBet`, `getMinBet` and `getBossMinBet` at identity levers.
