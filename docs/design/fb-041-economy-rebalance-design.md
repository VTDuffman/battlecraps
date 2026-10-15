# FB-041 — Economy Rebalance: Opening Fix, Crew-Cash Taper, Crew Hype ×1.5

> **Status:** Planned (2026-10-15). Not started.
> **Evidence:** `docs/design/gauntlet-difficulty-audit.md` (all numbers below come from it) and the sim at `scripts/sim/gauntlet-economy-sim.mjs`.
> **Manifest:** `docs/manifests/fb-041-economy-rebalance-manifest.md`

---

## Goals

1. **Fix the opening.** Playtesters say Floors 1–3 are too hard. The sim agrees, but the wall is the first two markers, not the bosses: a new run clears marker 0 **36%** and marker 1 **53%** of the time, and only ~11–13% reach Floor 4. **Target:** ~40% of post-tutorial runs reach Floor 4.
2. **Make mixed crews the best build.** Today all-in cash is as strong as mixed (from Floor 5: 72% vs 73%). **Target** finish rate from Floor 5: mixed **55–65%**, pure cash **40–50%**.
3. **Keep the late game meaningful.** Late markers clear 99–100% with boss rules off, because crew cash scales with the target and pays even on losing rolls.

**Decided, not a goal:**
- **Pure hype builds** aren't a balance target (2026-10-15). Hype multiplies profit, and a cash-less crew has nothing to multiply.
- **Out of scope:** comp trims (The Vig / Member's Jacket), lowering the table max, and steeper targets. The audit shows these either overshoot or mostly punish Hype.

---

## Projected outcome

Whole runs from a new run. Cells: reach Floor 4 / finish given Floor 5 / finish the run.

| | Cash crew · pass | Mixed crew · pass | Mixed crew · 1× odds |
|---|---|---|---|
| **Today** | 12% / 70% / 7% | 11% / 71% / 6% | 15% / 62% / 7% |
| **After FB-041** | 41% / 48% / 15% | 39% / 63% / 20% | 35% / 54% / 15% |

---

## Change 1 — The opening: "First Round's on the House"

**Rule:** every run **after the tutorial** starts with:
- **$40** instead of $30;
- one **free Starter crew member**, picked from a Starter-only pub draft before marker 0.

The tutorial run is unchanged ($30, no crew, scripted dice). Its $30 start exists because $40 broke its beat flow; see memory and `runs.ts`.

**Simulated:** marker 0 36% → ~75%, marker 1 53% → ~78%, reach Floor 4 11–13% → 37–42%. Floors 2–3 are unchanged.

### Design: reuse the pub, at marker 0
- **`POST /runs`:** when `user.tutorialCompleted`, create the run with `bankrollCents: 4000`, `status: 'TRANSITION'`, `currentMarkerIndex: 0`. The client then opens the existing PubScreen before the table.
- **`GET /runs/:id/pub-draft`:** at marker 0 (no cleared marker), draft **Starters only**, three offers like a normal visit. Nothing is guaranteed.
- **`POST /runs/:id/recruit`:** at marker 0, **hire cost is 0**.
  - Skip everything that keys off `currentMarkerIndex - 1`: the cleared marker, comp slot grants, boss entry and the Le Prix charm.
  - Skipping is allowed (the player keeps the $40, no crew).
  - Exit goes to IDLE_TABLE at marker 0, like any pub exit.
- **Client:** a new run that comes back as TRANSITION at marker 0 shows PubScreen with "FIRST ROUND'S ON THE HOUSE" copy and a FREE price tag, then the marker 0 intro.
  - Verify the TransitionOrchestrator order: today a new run plays the title → marker intro.
- **Copy:** `GameOverScreen` "NEW RUN · $30 BANKROLL" → $40 · ONE CREW ON THE HOUSE; How to Play "Starting bankroll $30.00". Sal's tutorial text is unchanged; the tutorial still starts at $30.

**Fallback (decision D1):** if a marker-0 pub is too disruptive for the transition flow, seat a random Starter automatically and announce it with a toast. Simpler, but the player doesn't choose. The sim's numbers assume the player gets a useful first crew member; a random Starter may land a little lower.

---

## Change 2 — Crew-cash taper (Floors 5–9)

**Rule:** floor-scaled crew cash uses a shrinking share of the table max from Floor 5.

| Floor | 1–4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|
| Crew cash scale | ×1.0 | ×0.8 | ×0.7 | ×0.6 | ×0.5 | ×0.45 |

**Simulated** (finish given Floor 5): cash 72% → 45%, mixed 73% → 53%. With Change 3: mixed 63%, cash 45%. Use the steeper A+ curve (×0.7 / 0.6 / 0.5 / 0.45 / 0.4) only if the playtest shows the late game still soft (decision D3).

### Design: one shared number, injected into the cascade
- **Shared `config.ts`:**
  - `CREW_CASH_SCALE_BY_FLOOR` (the table above);
  - `getCrewCashBaseCents(markerIndex)` = `floor(target × 0.10 × scale(floor))`.
  - This is the one place the taper lives.
- **`TurnContext`:** a new `crewCashBaseCents`. `resolveRoll()` takes it in its state argument; `rolls.ts` (the only call site) passes `getCrewCashBaseCents(run.currentMarkerIndex)`.
- **Crew files:** the 12 floor-scaled cash crew replace `Math.floor(ctx.markerTargetCents * 0.10)` with `ctx.crewCashBaseCents`. Each keeps its own `ADDITIVE_MULT`.
  - Starters: Doorman, Grinder, Ace McGee, Close Call, Even Keel, Bookkeeper, Contrarian, Pressure Cooker.
  - Unlockables: Big Spender, Regular, Shark, Mathlete.
  - `markerTargetCents` stays in `TurnContext` for anything else that reads it.
- **Client:** `CrewPortrait.getAbilityDesc` shows dollar amounts. It must call `getCrewCashBaseCents(currentMarkerIndex)` instead of computing 10% of the target.
- **Unchanged:** hire costs (`getCrewHireCost`), max/min bet, The Vig, The Frequency, boss escrows. The taper only changes what crew add.

---

## Change 3 — Crew Hype ×1.5 (all floors)

**Rule:** every Hype crew member adds 1.5× their current boost.

**Simulated** (finish given Floor 5): mixed 73% → 80% alone, 63% with Change 2; cash unchanged. It barely moves Floors 1–3 (reach Floor 4 +1 point), so it doesn't stack with Change 1.

| Crew (rarity) | Today | Proposed | Note |
|---|---|---|---|
| The Lookout (Starter) | +0.20 | +0.30 | |
| The Momentum (Starter) | +0.20 | +0.30 | |
| The Echo (Starter) | +0.40 | +0.60 | |
| The Handicapper (Starter) | +0.30 / 0.20 / 0.10 | +0.45 / 0.30 / 0.15 | 4·10 / 5·9 / 6·8 |
| The Odd Couple (Starter) | +0.20 | +0.30 | |
| The Mirror (Starter) | +0.20 | +0.30 | |
| The Silver Lining (Starter) | +0.40 | +0.60 | |
| The Pressure Cooker (Starter) | +0.50 Hype (+0.75× max bet) | +0.75 Hype | cash part follows Change 2 |
| Hype-Train Holly (Uncommon) | +0.15 | +0.25 | rounded up from 0.225 (D2) |
| The Nervous Intern (Common) | +0.30 | +0.45 | |
| The Drunk Uncle (Rare) | +0.50 / −0.25 | +0.75 / −0.25 | downside stays (memory: intentionally uncapped) (D2) |
| Lucky Charm (Rare) | +1.0 before the 7-out reset | unchanged | a rescue, not a ramp (D2) |

**Unchanged:** the base Hype ticks (point hit / natural / craps), Hype tier thresholds (Heating Up ≥ 1.5×, On Fire ≥ 2.5×), and The Whale's ×1.2 multiplier.

**Side effect:** players reach the Heating Up / On Fire visuals (FB-021) more often. That's acceptable and arguably good feedback.

---

## Decisions for Mike (Phase 0)

| # | Question | Recommendation |
|---|---|---|
| D1 | Opening pick: player chooses from a Starter draft (pub at marker 0), or a random free Starter? | Player chooses (reuses the pub) |
| D2 | Unlockable Hype crew values (Holly, Drunk Uncle, Lucky Charm) | As in the table; keep Drunk Uncle's −0.25 and Lucky Charm's +1.0 |
| D3 | Taper curve: A (×0.8 → ×0.45) or the steeper A+ (×0.7 → ×0.4)? | A; revisit after playtests |
| D4 | Ship together or in two releases? | Two: Change 1 first (playtesters' pain), then Changes 2 + 3 together. Change 3 without Change 2 makes the late game easier. |

---

## Validation

- **Unit:** crew tests use the new `crewCashBaseCents` and the new Hype values, plus a config test for `getCrewCashBaseCents` at a Floor 4 and a Floor 9 marker.
- **API integration:**
  - A post-tutorial `POST /runs` gives $40 + TRANSITION at marker 0; a tutorial-pending run gives $30 + IDLE_TABLE.
  - A free hire at marker 0 costs $0; skipping keeps $40; a Starter-only draft at marker 0.
  - A Floor 6 roll pays crew cash at ×0.7.
- **Sim acceptance** (`gauntlet-economy-sim.mjs` with its defaults updated to the new game). At N=4000, ±3:
  - `early`: reach Floor 4 35–45% for cash/mixed crews.
  - `options` (Today row): finish given Floor 5 — mixed 55–65%, cash 40–50%.
  - `packages`: whole-run finish ~15–20% for cash/mixed crews.
- **Playtest:** a local fresh-account run (tutorial → $30 unchanged), then a post-tutorial run (pub at marker 0). Dev Mode jumps to Floors 5/8 to see tooltips show tapered amounts.

---

## Guidance carried forward (no code in FB-041)

- **Boss design rule (applies to FB-040 The Architect):** a boss meant to threaten cash or mixed crews must take crew cash or end the run, as The Hierophant, The Emissary and The Executive do. Rules that only touch Hype or wait for a Seven-Out cost those builds 0–5 points. Measure every rule with `isolated` mode (rule on vs off).
- **Later spike:** make crew cash *at risk* game-wide (e.g. crew cash on a Seven-Out roll is lost). The Emissary shows how effective it is. Simulate before designing; not part of FB-041.
- **Leaderboard:** post-FB-041 runs start with $40 and can't be compared directly with older runs. Consider tagging entries with a balance version (decision for later).
