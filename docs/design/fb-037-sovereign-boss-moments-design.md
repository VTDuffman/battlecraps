# FB-037: The Sovereign Boss Moments (Design)

**Status:** Design agreed 2026-10-14. Ready for implementation.
**Pattern:** boss #6 of the per-boss "moments" roll-out (FB-032 Foreman → FB-036 Hierophant). Big wins, big losses. Includes a rule redesign, tuned by simulation.

---

## 1. Summary

The Sovereign (Floor 6, Atlantis — The Throne Room, `TIDAL_SURGE`). The tide cycles LOW → EBB → HIGH → FLOW, advancing each time a come-out cycle resolves (Natural, Craps Out, Point Hit, Seven-Out); a point set at a stage stays at that stage until it resolves.

**Today:** the stage only raises the minimum Pass Line bet (1× / 2× / 3× / 2× the table minimum ≈ at most half the max bet). Simulated (`scripts/sim/sovereign-tide-sim.mjs`, real engine, Floor-6 comps): **~0 pts** of clear rate. No barks, a small header readout, no win/loss moments.

## 2. Decisions (2026-10-14)

| # | Question | Decision |
|---|---|---|
| 1 | Rule | **The tide rhythm — a different challenge at each stage** (meaner tuning). Stage minimums dropped. |
| 2 | Covenant vs. a wave | The Covenant **cancels the whole wave** ("doesn't cost a shooter"). Sim: it meets a wave in only 4–11% of fights; "all" vs "one" differs by ≤ 1.2 pts. |
| 3 | Mechanic drama | **The water line** + tide dial. |
| 4 | Win | **The Crown Sinks.** |
| 5 | Loss | **The Wave.** |

## 3. The rule — the tide rhythm

| Stage | Name | Rule (one line each) |
|---|---|---|
| LOW | **Dead Calm** | No odds bets. |
| EBB / FLOW | **The Undertow** | A Seven-Out drags 35% of your bankroll out to sea. |
| HIGH | **High Tide** | A Seven-Out drowns two shooters. |

- Undertow: 35% of the bankroll after the roll's settlement, rounded down to the dollar. It's a bankroll loss, so The Covenant doesn't stop it (it saves shooters, not money).
- Wave: costs 2 shooters (can end the run from 2). The Covenant, if unused at this marker, cancels it entirely. Lefty re-rolling out of the 7 means no Seven-Out at all.
- Dead Calm: odds bets can't be placed during a LOW-tide point (server rejects; client disables the odds controls and says why).

**Simulated cost** vs. no tide rule (pass-line players, Floor-6 comps): cash crew −6.0, mixed −5.4, hype −14.3 pts. Odds-heavy rows rise slightly — a sim artifact (its max-odds-every-roll player over-bets, so any restriction reduces their variance).

**Context:** at Floor 6 a pass-line cash/mixed crew clears ~99.7% with no rule at all — the late-game economy is strong. A separate audit (session "Late-game difficulty audit") is measuring Floors 5–9; this rule may be re-tuned after it.

## 4. Server facts

`turn:settled` + HTTP roll in his fight carry `tide { stage, nextStage, undertowCents?, waveShooters? }` (stage index 0–3 for the roll's tide; `undertowCents` / `waveShooters` when they hit).

## 5. Barks

Regal, ancient, slow — he speaks like the sea.

| Event | When | Bark | Lines |
|---|---|---|---|
| `waveHit` | the wave drowns shooters | always | "The deep keeps what it takes." · "Two more for the sea." |
| `undertowHit` | the undertow drags bankroll | always | "The tide takes its share." · "Everything returns to the sea." |
| `highTide` | the tide turns to HIGH | 50% | "The sea rises for its king." · "Hear it coming?" |
| `win` / `loss` | fallback | chance | "Even kings must wait for the tide." / "Another empire, gone under." |

## 6. The water line + tide dial

- **Water line:** translucent sea-blue water along the bottom of the table that rises with the stage (low / mid / high), with a gentle animated surface and foam; at HIGH it laps over the felt. Swell sound on each turn of the tide.
- **Tide dial:** a small four-segment dial (LOW · EBB · HIGH · FLOW) with the current stage lit and the next one marked, plus the stage's one-line rule ("DEAD CALM — NO ODDS", "UNDERTOW — A 7-OUT TAKES 35%", "HIGH TIDE — A 7-OUT DROWNS 2 SHOOTERS").
- **Undertow hit:** the water surges and pulls back across the bankroll, "−$X" swept away. **Wave hit:** a wave crest breaks over the shooter pips.

## 7. Win: The Crown Sinks

The throne room drowns in calm blue; his crown tumbles slowly down through deep water — light shafts, rising bubbles — and settles in the sand. "…the tide will return. It always does." ~6 s + ~3 s to read.

## 8. Loss: The Wave

A huge wave rises from the bottom of the screen, curls and crashes over everything; then all is muffled and under water, bubbles drifting up. "Your run will not outlast this tide." ~7–8 s.

## 9. Copy

`ruleBlurb`, `ruleHeaderText`, `entryLines` (keep "You can see it coming"), `barks`, cinematics in `config.ts`; `boss_framework.md`, `floors.md`, PRD, CLAUDE.md. Remove `stageMultipliers` min-bet behaviour (`validateBet` / `getBossMinBet` for TIDAL_SURGE).
