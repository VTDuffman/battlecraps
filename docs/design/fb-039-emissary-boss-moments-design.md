# FB-039: The Emissary Boss Moments (Design)

**Status:** Implemented 2026-10-14 (loss line: "[Translation complete. You will be studied.]").
**Pattern:** boss #8 of the per-boss "moments" roll-out (FB-032 Foreman → FB-038 Commander). Big wins, big losses. Includes a rule redesign, tuned by simulation.

---

## 1. Summary

The Emissary (Floor 8, The Signal — The Receiving Chamber, `TRANSMISSION_DELAY`). An alien that reconstructed the game from a transmission and can't translate delay.

**Today:** crew cash bonuses held one roll, released flat; a Seven-Out evaporates everything held. Simulated (`scripts/sim/emissary-delay-sim.mjs`, real engine, Floor-8 comps): cash −1.2, mixed −3.4, hype +0.2 (pass line) — soft, and a weaker copy of The Hierophant (both target crew cash). Presentation: a header readout; no barks or cinematics. His rule blurb carries a leftover line from a retired rule ("Naturals resolve normally…").

## 2. Decisions (2026-10-14)

| # | Question | Decision |
|---|---|---|
| 1 | Rule | **Signal lag + blackout:** every crew effect lands one roll late; a Seven-Out drops what's in transit and the crew go dark for 6 rolls. |
| 2 | Overlap with The Architect | The Architect will be redesigned as **Convergence** — a fight against every previous boss's rule (FB-040) — so crew demolition goes away and the blackout stays the Emissary's. |
| 3 | Mechanic drama | **The transmission line.** |
| 4 | Win | **Message Received.** |
| 5 | Loss | **Translated** (not Loss of Signal — The Commander owns that). |

## 3. The rule — signal lag + blackout

- **Signal lag:** each roll the crew fire as normal, but their effects — cash bonuses (additives), hype boosts and multipliers — are held **in transit** and **land on the next roll** (that roll's settlement uses them). Dice/rescue effects that must act on the roll itself (Lefty, the Mechanic's freeze, Floor Walker…) are not delayed.
- **Signal lost (a Seven-Out):** everything in transit (last roll's and this roll's) is dropped, and **the whole crew goes dark for the next 6 rolls** — they don't fire at all. Contact returns on the 7th roll.
- **Blackout counter** persists on the run (`boss_progress`-style column or the boss counter); it doesn't carry past the marker.
- Supersedes the current one-roll cash escrow.

**Simulated cost** (pass line, Floor-8 comps): cash −12.7, mixed −14.2, hype −17.6 pts — Executive-level for every build. Dial: blackout 3 → −6 / −8 / −12. Odds rows are larger (the sim's max-odds player over-bets).

**Context:** at Floor 8 a pass-line cash/mixed crew clears ~99.9% with no rule (the late-game economy is being audited, PR #34).

## 4. Server facts

`turn:settled` + HTTP in his fight carry `signal { transit: { cents, hype, mults }, landed: {…}, dropped: boolean, darkRolls: number }`. Receipt lines: crew effects "→ in transit", "Signal received: …", "SIGNAL LOST — crew dark for 6 rolls".

## 5. Barks

Translated alien text in brackets, cold and literal.

| Event | When | Bark | Lines |
|---|---|---|---|
| `signalLost` | a Seven-Out drops the signal | always | "[Signal lost. Your crew cannot hear you.]" · "[Contact terminated. Recalibrating.]" |
| `contactRestored` | the blackout ends | always | "[Contact restored. This changes nothing.]" · "[Your crew has returned. Briefly.]" |
| `received` | a big packet lands | 30% | "[Message received. Delayed. As intended.]" · "[Delay is a human superstition.]" |
| `win` / `loss` | fallback | chance | "[Outcome noted.]" / "[Predicted.]" |

## 6. The transmission line

Front and center under the marker progress bar: your crew (left) linked to an alien receiver (right) by a signal line. Each crew trigger sends a glowing packet down the line; it **arrives on the next roll** and pops into the bankroll / hype. A Seven-Out hits the line with static: packets scatter and vanish, the crew rail goes **dark** (greyed, static-flecked) and the line shows **"NO SIGNAL — 6"** counting down each roll until **"CONTACT RESTORED"**.

## 7. Win: Message Received

A stream of alien glyphs scrolls across a dark screen; one by one they decode into readable letters until his line resolves: *"[The entity pauses for 0.3 seconds. This is the equivalent of applause.]"* First contact, in your favour. ~7 s + ~3 s to read.

## 8. Loss: Translated

The table is translated: chips, crew portraits and bankroll dissolve into alien glyphs, which rise in a column of green light into the dark (a tractor beam), and the screen is left as a sea of untranslatable symbols — then his line. ~7–8 s.

## 9. Copy

`ruleBlurb` (remove the naturals leftover), `ruleHeaderText`, `entryLines`, `barks`, cinematics in `config.ts`; `floors.ts` intro / teaser; `boss_framework.md`, `floors.md`, PRD, CLAUDE.md.
