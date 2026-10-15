# FB-038: The Commander Boss Moments (Design)

**Status:** Design agreed 2026-10-14. Ready for implementation.
**Pattern:** boss #7 of the per-boss "moments" roll-out (FB-032 Foreman → FB-037 Sovereign). Big wins, big losses. Includes a rule redesign, tuned by simulation.
**Theme thread:** *"In space, no one can hear you scream."* Hype is the table screaming; he's the boss who takes the air out of the room.

---

## 1. Summary

The Commander (Floor 7, The Station, `ORBITAL_DECAY`). Meant to be the counter to **hype builds** (The Hierophant counters cash builds).

**Today:** a Seven-Out drains hype by a fixed −0.4 / −0.6 / −0.8 (by tier) instead of resetting, floored at 0.25×; a "death spiral" below 0.75× (−1 cascade slot) and 0.5× (max bet halved). Simulated (`scripts/sim/commander-decay-sim.mjs`, real engine, Floor-7 comps) — **backwards**: cash crew −18 pts (hype pushed below 1×, 67% of the fight in the spiral), mixed −0.4, **hype crew +3** (subtracting 0.8 from 3.0× keeps more than a reset). Presentation: a corner readout in the header; no barks or cinematics.

## 2. Decisions (2026-10-14)

| # | Question | Decision |
|---|---|---|
| 1 | Rule | **Orbital bleed:** every roll, hype above 1.0× loses 20% of its height; a Seven-Out resets to 1.0× (no Keepsake in his fight). Death spiral and sub-1× hype removed. |
| 2 | Mechanic drama | **The orbit gauge.** |
| 3 | Win | **Escape Velocity.** |
| 4 | Loss | **Re-entry → LOSS OF SIGNAL**, ending in silence. |
| 5 | Theme | **"In space, no one can hear you scream"** — dread tagline, muffled crowd, guttering flames, a bark, the defeat line. |

## 3. The rule — orbital bleed

- After each roll's settlement (not on a Seven-Out): `hype = 1 + (hype − 1) × (1 − bleedPct)` when hype > 1.0, `bleedPct = 0.20`, rounded to 4 dp. The bleed applies to the hype carried to the next roll (this roll paid at its full hype).
- Seven-Out: hype resets to 1.0× (plus crew hype gained that roll, as everywhere). The Keepsake doesn't apply in his fight (unchanged).
- Removed: tiered decay, `hypeFloor`, the death-spiral slot loss and max-bet halving.

**Simulated cost** (pass line, Floor-7 comps): hype crew ≈ −16 pts (bleed 15% −14.0, 25% −18.1), mixed ≈ −1.5, cash 0. With heavy odds the spread narrows (odds rows are noisy — the sim's max-odds player over-bets).

## 4. Server facts

`turn:settled` + HTTP in his fight carry `orbit { bleed }` — the hype lost to the bleed this roll (for the gauge and barks). Receipt note: "Orbital decay: −0.12× → 1.48×".

## 5. Barks

Clipped mission-control speak.

| Event | When | Bark | Lines |
|---|---|---|---|
| `orbitLost` | Seven-Out from ≥ 1.5× (a big fall) | always | "Mission control, we have a problem." · "In space, no one can hear you scream." |
| `peakHype` | hype reaches On Fire (≥ 2.5×) | always | "Cheer all you like. There's no air up here." · "Enjoy the view. It won't last." |
| `decaying` | the bleed takes ≥ 0.2× | 35% | "Orbit decaying." · "You're losing altitude." |
| `win` / `loss` | fallback | chance | "Acceptable trajectory." / "Gravity always wins." |

## 6. The orbit gauge + "no one can hear you scream"

- **Orbit gauge** (front and center under the marker progress bar): a curved planet horizon; a small ship at an altitude = your hype (1.0× = skimming the atmosphere). Each roll it visibly sinks by the bleed ("−0.12×"); hype gains fire its thrusters and lift it. Altitude bands mark Heating Up / On Fire.
- **Muffled crowd:** in his fight the win/lose crowd stings play low-passed and quiet — as if through a helmet in a vacuum — and quieter the lower your hype. (Distinct from The Null Space, Floor 9, which is fully silent.)
- **Guttering flames:** at On Fire the dice fire effect sputters — fewer, shorter-lived particles.

## 7. Win: Escape Velocity

Your ship breaks orbit: thrusters roar and flare, the planet drops away below, the stars stretch into streaks. "…orbital mechanics didn't account for you. Gravity's compliments." ~6–7 s + ~3 s to read.

## 8. Loss: Re-entry → Loss of Signal

The orbit fails: the screen falls into the atmosphere — edges glowing orange, flames streaming up, the HUD shaking apart, a rising roar — then **every sound cuts out at once**. Dead silence, static, **LOSS OF SIGNAL**, and in the silence: *"In space, no one can hear you scream."* ~7–8 s (inside the 9 s defeat net).

## 9. Copy

`dreadTagline` → **"IN SPACE, NO ONE CAN HEAR YOU SCREAM."**; `ruleBlurb`, `ruleHeaderText`, `entryLines` (no more "there is no floor"), `barks`, cinematics in `config.ts`; `boss_framework.md`, `floors.md`, PRD, CLAUDE.md (Keepsake note).
