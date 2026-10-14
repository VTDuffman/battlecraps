# FB-036: The Hierophant Boss Moments (Design)

**Status:** Design agreed 2026-10-14. Ready for implementation.
**Pattern:** boss #5 of the per-boss "moments" roll-out (FB-032 Foreman, FB-033 Sarge, FB-034 Le Prix, FB-035 Executive). Big wins, big losses. Also absorbs **FB-029** (The Covenant comp redesign).

---

## 1. Summary

The Hierophant (Floor 5, The Lodge — The Inner Sanctum, `TRIBUTE`). Mechanic unchanged: crew cash bonuses (additives) are held in escrow (`runs.pending_additive_cents`) and released on the next roll; on a Seven-Out the whole escrow settles at once with 25% seized as tribute; a marker-clearing roll pays out what it held.

**Today vs. the pattern:**

| Piece | Today | Gap |
|---|---|---|
| Barks | None | Missing |
| Mechanic drama | **Invisible** — the client never learns what's held, released or seized; the `tribute` boss deduction in the payout breakdown is computed as `newBankroll − tributedBankroll`, which is always 0 | Biggest gap of any boss |
| Win | None | Missing |
| Loss | None | Missing |
| Comp | The Covenant halves *his* seizure — but you only earn it by beating him, so it does nothing (FB-029) | Dead comp |

## 2. Decisions (2026-10-14)

| # | Question | Decision |
|---|---|---|
| 1 | Barks | Solemn, liturgical, unhurried — he speaks for *the order*. Event-driven on the shared system. |
| 2 | Mechanic drama | **The offering bowl.** |
| 3 | Win moment | **The Eye Closes.** |
| 4 | Loss moment | **The Order Collects.** |
| 5 | Comp | Redesign The Covenant now as **The Order Protects** (FB-029 folded in). |

## 3. Server: escrow facts

`turn:settled` + HTTP roll gain, during an escrow fight (Hierophant; generic so The Emissary can use it later):
- `escrow: { heldCents, releasedCents, seizedCents }` — `heldCents` = what's now in the bowl after this roll; `releasedCents` = paid to bankroll this roll from escrow; `seizedCents` = taken as tribute this roll.
- Fix the dead `tribute` boss deduction: use the real seized amount so the payout breakdown / receipt shows "−$X tribute".

## 4. Barks (shared `bossBarks.ts`, `TRIBUTE` case)

| Event | When | Bark | Lines |
|---|---|---|---|
| `tributeSeized` | `seizedCents > 0` | always | "The order receives." · "Every offering is remembered." |
| `bigOffering` | `heldCents` ≥ 10% of the marker target, newly | 50% | "A generous offering." · "The order is pleased." |
| `escrowReleased` | `releasedCents > 0` | 30% | "The rites permit it." · "Go. It is yours… for now." |
| `win` / `loss` | fallback | chance | "The observers take note." / "As it was written." |

## 5. The offering bowl

`OfferingBowl` front and center under the marker progress bar in his fight (he clears on bankroll, so the bar stays), flanked by candles:
- **"HELD $X"** readout (rolling digits like the Foreman's register).
- **Held:** coins drop into the bowl with a soft chime.
- **Released:** coins rise out and drift toward the bankroll; "RELEASED +$X".
- **Seized:** candles flare, a quarter of the coins burn to embers + smoke, **"TRIBUTE −$X"** sears across; a bell tolls under a low choir chord.
- Reduced motion: numbers + labels, no particles.

## 6. Win moment: The Eye Closes

On the clearing roll (celebration hold): his **👁️ fills the screen** inside a ring of candles, staring; it **slowly closes**; the candles **go out one by one** in a sweep; the heavy **sanctum doors part** and light floods in. Line: *"…the rites acknowledge your offering. Leave before the observers decide otherwise."* ~5.5–6 s. `victoryCinematic { id: 'THE_EYE_CLOSES', line }`.

## 7. Loss moment: The Order Collects

On any run-ending roll in his fight: **hooded silhouettes** close in from the edges; your **bankroll drains** into the offering bowl as a stream of coins; the **👁️ opens wide** and glows; a **bell tolls three times**; the candles **snuff out one by one** to black. Line: *"The order always collects."* ~7 s. `defeatCinematic { id: 'THE_ORDER_COLLECTS', line }`.

## 8. The Covenant → The Order Protects (FB-029)

- **Effect:** once per marker, the first Seven-Out **doesn't cost a shooter** (bets are still lost, Hype still resets, the point clears; other seven-out consequences — Architect demolition, Emissary evaporation — still apply). Applies on Floors 6–9 (earned after Floor 5).
- **Server:** new `runs.covenant_spent_marker` (smallint, nullable) — the marker index where it was used; the save is available when it ≠ `currentMarkerIndex`. Applied in `computeNextState` SEVEN_OUT (`shooterLost = !sevenOutBlocked && !covenantSaves`). `turn:settled` gains `covenantSaved: true`. Retire the old 12.5% seizure halving.
- **Client:** a "THE ORDER PROTECTS" flash + roll-log note; CompCard copy + icon.
- **Copy:** name stays **The Covenant**. Description: *"The order protects its own. Once per marker, your first Seven Out doesn't cost a shooter."* Update `config.ts`, `CompCard.tsx`, `boss_framework.md`, `floors.md`, `PRD.md`, `CLAUDE.md`; close FB-029.

## 9. Out of scope

His mechanic numbers; the remaining four bosses (The Emissary will reuse the escrow facts + a variant of the bowl).
