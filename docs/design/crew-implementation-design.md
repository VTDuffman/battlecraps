# Crew Implementation — Technical Design Document

> **Status:** Draft — awaiting approval before implementation begins
> **Scope:** Full implementation of crew IDs 16–30 (Starter roster), the unlock system for crew IDs 1–15, all required new game state fields, schema migrations, and end-to-end wiring across API and client.
> **Canonical reference:** `docs/frameworks/crew_framework.md`

---

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [Scope Summary](#scope-summary)
3. [Phase 1 — Shared Types: New State Fields](#phase-1--shared-types-new-state-fields)
4. [Phase 2 — Database Schema Changes](#phase-2--database-schema-changes)
5. [Phase 3 — New Crew Implementations (IDs 16–30)](#phase-3--new-crew-implementations-ids-1630)
6. [Phase 4 — Unlock System Architecture](#phase-4--unlock-system-architecture)
7. [Phase 5 — Server Route Updates](#phase-5--server-route-updates)
8. [Phase 6 — Seed Updates](#phase-6--seed-updates)
9. [Phase 7 — Client Updates](#phase-7--client-updates)
10. [Execution Order](#execution-order)
11. [Testing Notes](#testing-notes)

---

## Overview & Goals

The crew framework document defines two classes of work:

1. **New Starter crew (IDs 16–30).** Fifteen new `CrewMember` implementations covering `DICE`, `HYPE`, `TABLE`, `PAYOUT`, and `WILDCARD` categories. All are Starter rarity — no unlock required, available from the first run. They introduce three new game state fields required by five members.

2. **Unlock system for IDs 1–15.** The original fifteen crew are currently available to all players with no gating. The framework specifies unlock conditions for each (per-run, cross-run cumulative, or achievement). This work adds the tracking, evaluation, and storage of unlock progress, and gates the Pub screen by what the player has unlocked.

Both classes of work touch the same layers (types, DB, API, client), so they are designed together and shipped together. The design is structured as sequential phases within a single implementation pass.

---

## Scope Summary

| Area | Changes |
|---|---|
| `packages/shared/src/types.ts` | Extend `TurnContext` and `GameState` with 3 new counter fields; add `rarity` to `CrewMember` |
| `packages/shared/src/crew/` | Add 15 new files (IDs 16–30) + export from `index.ts` |
| `apps/api/src/db/schema.ts` | Add columns to `runs` (3 counters), `users` (unlock progress JSONB), `crewDefinitions` (rarity, briefDescription, detailedDescription, unlockDescription) |
| `apps/api/src/db/` | New Drizzle migration file; update `seed.ts` with all 30 crew + new fields |
| `apps/api/src/lib/crewRegistry.ts` | Register 15 new crew |
| `apps/api/src/routes/rolls.ts` | Track new counters in `computeNextState()`; evaluate unlock conditions after each roll; write new unlocks to `users` |
| `apps/api/src/routes/recruit.ts` | Gate purchases by `isAvailableToUser()` |
| `apps/api/src/routes/runs.ts` | Include `unlockedCrewIds` in create/fetch responses |
| New: `apps/api/src/routes/crewRoster.ts` | `GET /crew-roster` — returns available crew for the current user |
| `apps/web/src/components/PubScreen.tsx` | Replace hard-coded `ALL_CREW` with API-fetched roster; show rarity/unlock state |
| `apps/web/src/store/useGameStore.ts` | Store and expose `unlockedCrewIds`; fetch roster on TRANSITION |

---

## Phase 1 — Shared Types: New State Fields

### 1.1 Three New Counter Fields

Five of the new Starter crew require game state that doesn't currently exist:

| Field | Type | Used By | Semantics |
|---|---|---|---|
| `previousRollTotal` | `number \| null` | Momentum (19), Echo (20), Contrarian (30) | The `diceTotal` of the immediately preceding roll this shooter. `null` on a shooter's first roll and after any shooter change. |
| `shooterRollCount` | `number` | Bookkeeper (28) | Count of rolls by the current shooter, 1-based. Incremented by `resolveRoll()` before the cascade runs so the cascade always sees the current roll's position. |
| `pointPhaseBlankStreak` | `number` | Pressure Cooker (29) | Consecutive `NO_RESOLUTION` rolls in the current point phase. Resets to 0 on `POINT_HIT`, `SEVEN_OUT`, and on any new come-out. Incremented by `computeNextState()` **after** the cascade so the crew reads the pre-roll streak value. |

**Semantics clarification for Pressure Cooker:** The crew checks `ctx.pointPhaseBlankStreak === 4` during the cascade — meaning four prior blank rolls have accumulated and THIS roll is the fifth. `computeNextState()` then resets the counter to 0. This keeps the cascade pure: the crew never modifies the counter itself.

### 1.2 TurnContext Changes

Add to `TurnContext` in `packages/shared/src/types.ts`:

```typescript
/**
 * The dice total from the immediately preceding roll this shooter.
 * null on the shooter's first roll and after any shooter change.
 * Used by Momentum (19), Echo (20), and Contrarian (30).
 */
readonly previousRollTotal: number | null;

/**
 * The roll count for the current shooter (1-based). Set before the cascade
 * runs so crew always see this roll's position within the shooter's life.
 * Used by Bookkeeper (28). Resets to 1 when a new shooter takes the table.
 */
readonly shooterRollCount: number;

/**
 * Consecutive NO_RESOLUTION rolls accumulated so far in the current
 * point phase — does NOT include the current roll. Resets on POINT_HIT,
 * SEVEN_OUT, or any come-out outcome. Used by Pressure Cooker (29).
 */
readonly pointPhaseBlankStreak: number;
```

All three are `readonly` on `TurnContext` — crew members read but never write them. The state machine manages them.

### 1.3 GameState Changes

Add the same three fields to `GameState` (persisted source for TurnContext construction):

```typescript
/** See TurnContext.previousRollTotal. */
previousRollTotal: number | null;

/** See TurnContext.shooterRollCount. */
shooterRollCount: number;

/** See TurnContext.pointPhaseBlankStreak. */
pointPhaseBlankStreak: number;
```

### 1.4 CrewMember Rarity Field

Add `rarity` to `CrewMember` for display purposes on the Pub screen and tooltips:

```typescript
/** Rarity tier of this crew member. Controls availability gating. */
readonly rarity: 'Starter' | 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
```

All 15 new crew have `rarity: 'Starter'`. The original 15 get their rarity values from the framework summary table.

---

## Phase 2 — Database Schema Changes

All schema changes require a single new Drizzle migration file.

### 2.1 `runs` Table — Three New Columns

```typescript
// Tracks the previous roll's dice total for comparison crew (Momentum/Echo/Contrarian).
previousRollTotal: smallint('previous_roll_total'),  // nullable

// 1-based roll count for the current shooter. Resets on new shooter.
shooterRollCount: smallint('shooter_roll_count').notNull().default(0),

// Consecutive NO_RESOLUTION streak in current point phase. Resets on resolution.
pointPhaseBlankStreak: smallint('point_phase_blank_streak').notNull().default(0),
```

**Default values:** `previousRollTotal = NULL`, `shooterRollCount = 0`, `pointPhaseBlankStreak = 0`. Safe defaults for in-flight runs.

### 2.2 `users` Table — Unlock Progress

Add a JSONB column for persisting progress toward unlock conditions that span multiple runs:

```typescript
/**
 * Cross-run progress counters keyed by crew ID.
 * Stores raw event counts, not percentages.
 * Example: { 5: 3, 8: 7 } means Floor Walker has 3 seven-outs logged, Shark has 7 point hits.
 */
unlockProgress: jsonb('unlock_progress')
  .$type<Record<number, number>>()
  .notNull()
  .default({}),
```

This covers the two cross-run cumulative unlocks (IDs 5 and 8) plus single-event one-time flags (store as 0 or 1).

### 2.3 `crewDefinitions` Table — New Columns

The schema needs four new columns to fully represent the framework spec:

```typescript
/**
 * Rarity tier. Determines unlock gating. 'Starter' = always available.
 */
rarity: text('rarity').notNull().default('Common'),

/**
 * One-sentence description shown on crew cards and hover tooltips. ≤ 80 chars.
 * Replaces the existing `description` column (which is renamed to this).
 */
briefDescription: text('brief_description'),

/**
 * 2–3 sentences shown in the expanded help view. ≤ 300 chars.
 */
detailedDescription: text('detailed_description'),

/**
 * Human-readable description of the unlock condition.
 * Empty string for Starter rarity (no unlock required).
 */
unlockDescription: text('unlock_description').notNull().default(''),
```

**Migration note:** The existing `description` column is kept as-is and `briefDescription` is a new column. The seed update will populate `briefDescription` and `detailedDescription` with the canonical copy from `crew_framework.md`. The old `description` column can be dropped in a follow-up cleanup migration, or kept for backwards compatibility during rollout.

### 2.4 `isStarterRoster` Semantics Correction

Currently `isStarterRoster = true` for all 15 original crew, which is misleading since those crew require unlocks. The migration should:
- Set `isStarterRoster = false` for all 15 original crew (IDs 1–15)
- `isStarterRoster = true` will be set for IDs 16–30 by the seed

The column's meaning changes from "part of MVP" to "available without unlock." This is a semantic change only — the client currently doesn't filter on it.

### 2.5 Migration File

Single file: `apps/api/src/db/migrations/migrate-crew-expansion.ts`

Operations (in order, wrapped in a transaction):
1. Add `previous_roll_total`, `shooter_roll_count`, `point_phase_blank_streak` to `runs`
2. Add `unlock_progress` to `users`
3. Update `isStarterRoster = false` for all existing crew (IDs 1–15)
4. Add `rarity`, `brief_description`, `detailed_description`, `unlock_description` to `crew_definitions`

---

## Phase 3 — New Crew Implementations (IDs 16–30)

All 15 new crew live in `packages/shared/src/crew/`. Each follows the existing pattern: a named export of a `CrewMember` object literal with an `execute()` pure function.

### 3.1 File Structure

Each file follows this template:

```typescript
// packages/shared/src/crew/{visualId}.ts
import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const {crewName}: CrewMember = {
  id:              {N},
  name:            '{Display Name}',
  abilityCategory: '{CATEGORY}',
  cooldownType:    'none',
  cooldownState:   0,
  baseCost:        {N_CENTS},
  visualId:        '{visual_id}',
  rarity:          'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Guard: return no-op if trigger condition not met
    if (!{condition}) {
      return { context: ctx, newCooldown: 0 };
    }
    // Apply effect
    return {
      context: { ...ctx, {field}: {newValue} },
      newCooldown: 0,
    };
  },
};
```

### 3.2 DICE Category (IDs 16–18)

#### ID 16 — The Lookout (`lookout.ts`)
- **Trigger:** `ctx.dice[0] === 6 || ctx.dice[1] === 6`
- **Effect:** `ctx.hype += 0.15` (rounded to 4dp)
- **Note:** Fires regardless of roll result or phase. High frequency (31% of rolls).

#### ID 17 — "Ace" McGee (`aceMcgee.ts`)
- **Trigger:** `ctx.dice[0] === 1 || ctx.dice[1] === 1`
- **Effect:** `ctx.additives += 5000` (+$50)
- **Note:** Fires regardless of roll result or phase. Frequency mirrors Lookout (31%).

#### ID 18 — The Close Call (`closeCall.ts`)
- **Trigger:** `Math.abs(ctx.dice[0] - ctx.dice[1]) === 1`
- **Effect:** `ctx.additives += 10_000` (+$100)
- **Note:** Covers [1,2], [2,3], [3,4], [4,5], [5,6] in either order. Frequency ≈28%.

### 3.3 HYPE Category (IDs 19–22)

#### ID 19 — The Momentum (`momentum.ts`)
- **Trigger:** `ctx.previousRollTotal !== null && ctx.diceTotal > ctx.previousRollTotal`
- **Effect:** `ctx.hype += 0.2` (rounded to 4dp)
- **Note:** Does not fire on shooter's first roll (`previousRollTotal === null`). Does NOT interact with roll result — fires on dice total alone.

#### ID 20 — The Echo (`echo.ts`)
- **Trigger:** `ctx.previousRollTotal !== null && ctx.diceTotal === ctx.previousRollTotal`
- **Effect:** `ctx.hype += 0.4` (rounded to 4dp)
- **Note:** Larger bonus than Momentum because repeat totals are rarer (~17% of rolls).

#### ID 21 — The Silver Lining (`silverLining.ts`)
- **Trigger:** `ctx.rollResult === 'CRAPS_OUT'`
- **Effect:** `ctx.hype += 0.6` (rounded to 4dp)
- **Note:** CRAPS_OUT is currently the only roll result where no other crew fires. This crew is the only activation on that outcome.

#### ID 22 — The Odd Couple (`oddCouple.ts`)
- **Trigger:** `ctx.dice[0] % 2 === 1 && ctx.dice[1] % 2 === 1`
- **Effect:** `ctx.hype += 0.2` (rounded to 4dp)
- **Note:** Both dice must be odd (1, 3, or 5). Frequency exactly 25% (9/36).

### 3.4 TABLE Category (IDs 23–25)

#### ID 23 — The Even Keel (`evenKeel.ts`)
- **Trigger:** `ctx.dice[0] % 2 === 0 && ctx.dice[1] % 2 === 0`
- **Effect:** `ctx.additives += 8000` (+$80)
- **Note:** Both dice must be even (2, 4, or 6). Frequency exactly 25% (9/36). Complements Odd Couple.

#### ID 24 — The Doorman (`doorman.ts`)
- **Trigger:** `ctx.rollResult === 'NATURAL' || ctx.rollResult === 'CRAPS_OUT' || ctx.rollResult === 'POINT_SET'`
- **Effect:** `ctx.additives += 4000` (+$40)
- **Note:** Fires on every come-out roll regardless of outcome. The only crew that fires on POINT_SET.

#### ID 25 — The Grinder (`grinder.ts`)
- **Trigger:** `ctx.rollResult === 'NO_RESOLUTION'`
- **Effect:** `ctx.additives += 3000` (+$30)
- **Note:** Point-phase only (NO_RESOLUTION cannot occur on come-out). Highest frequency in point phase (~65–70%).

### 3.5 PAYOUT Category (IDs 26–27)

#### ID 26 — The Handicapper (`handicapper.ts`)
- **Trigger:** `ctx.rollResult === 'POINT_SET'`
- **Effect:** Scaled hype delta based on `ctx.activePoint`:
  - Points 4 or 10 → `ctx.hype += 0.3`
  - Points 5 or 9 → `ctx.hype += 0.2`
  - Points 6 or 8 → `ctx.hype += 0.1`
  - All rounded to 4dp.
- **Note:** `ctx.activePoint` is set to the new point value by `resolveRoll()` before the cascade fires on a POINT_SET roll. Verify this is the case in `crapsEngine.ts` before implementing.

#### ID 27 — The Mirror (`mirror.ts`)
- **Trigger:** `ctx.diceTotal === 7`
- **Effect:** `ctx.hype += 0.2` (rounded to 4dp)
- **Note:** Fires on both NATURAL (come-out 7) and SEVEN_OUT (point phase 7). The "7 is always interesting" crew. Frequency 6/36 ≈ 17%.

### 3.6 WILDCARD Category (IDs 28–30)

#### ID 28 — The Bookkeeper (`bookkeeper.ts`)
- **Trigger:** `ctx.shooterRollCount % 3 === 0`
- **Effect:** `ctx.additives += 6000` (+$60)
- **Note:** `shooterRollCount` is incremented BEFORE the cascade (in `resolveRoll()` or equivalent pre-cascade step) so slot 0 always sees the current roll number. Fires on rolls 3, 6, 9, 12, etc. of each shooter.

#### ID 29 — The Pressure Cooker (`pressureCooker.ts`)
- **Trigger:** `ctx.rollResult === 'NO_RESOLUTION' && ctx.pointPhaseBlankStreak === 4`
- **Effect:** `ctx.hype += 0.5` (rounded to 4dp) AND `ctx.additives += 10_000` (+$100)
- **Note:** `pointPhaseBlankStreak` is the persisted value BEFORE this roll. A value of 4 means 4 prior consecutive NO_RESOLUTION rolls. This roll is the 5th, so the crew fires. `computeNextState()` resets the streak to 0 after this roll.

#### ID 30 — The Contrarian (`contrarian.ts`)
- **Trigger:** `ctx.previousRollTotal !== null && ctx.diceTotal < ctx.previousRollTotal`
- **Effect:** `ctx.additives += 7500` (+$75)
- **Note:** Does not fire on shooter's first roll. Together with Momentum and Echo, the trio covers ~100% of rolls (after the first) with three different reward types.

### 3.7 index.ts Update

Add 15 new barrel exports to `packages/shared/src/crew/index.ts`:

```typescript
// DICE Starter crew
export { lookout }          from './lookout.js';
export { aceMcgee }         from './aceMcgee.js';
export { closeCall }        from './closeCall.js';

// HYPE Starter crew
export { momentum }         from './momentum.js';
export { echo }             from './echo.js';
export { silverLining }     from './silverLining.js';
export { oddCouple }        from './oddCouple.js';

// TABLE Starter crew
export { evenKeel }         from './evenKeel.js';
export { doorman }          from './doorman.js';
export { grinder }          from './grinder.js';

// PAYOUT Starter crew
export { handicapper }      from './handicapper.js';
export { mirror }           from './mirror.js';

// WILDCARD Starter crew
export { bookkeeper }       from './bookkeeper.js';
export { pressureCooker }   from './pressureCooker.js';
export { contrarian }       from './contrarian.js';
```

---

## Phase 4 — Unlock System Architecture

### 4.1 Availability Model

A crew member is available to a user if **either**:
1. `crewDefinitions.isStarterRoster === true` (IDs 16–30), OR
2. `crewDefinitions.id ∈ users.unlockedCrewIds`

The recruit endpoint enforces this server-side. The client fetches the roster via a new endpoint and only renders available crew.

### 4.2 The 15 Unlock Conditions — Classification

| ID | Name | Type | Condition |
|---|---|---|---|
| 7 | Big Spender | **One-time event** | Win first Hardway bet |
| 10 | Nervous Intern | **One-time event** | Natural on shooter's very first come-out roll |
| 12 | Drunk Uncle | **One-time event** | Hype exceeds 2.0× at any point in any run |
| 6 | The Regular | **Per-run counter** | 3 Naturals in a single come-out sequence in one run |
| 4 | The Mathlete | **Per-run counter** | Lose 3 Hardway bets to soft rolls in one run |
| 11 | "Hype-Train" Holly | **Per-run counter** | Hit same point 3 consecutive times in single shooter |
| 2 | The Physics Prof | **Per-run counter** | Roll doubles (paired dice) 5 times in one run |
| 15 | The Lucky Charm | **Per-run event** | Clear any Gauntlet marker with exactly 1 crew member in slots |
| 1 | "Lefty" McGuffin | **Per-run compound** | Lose ≥3 shooters to Seven Out AND clear the floor marker |
| 13 | The Mimic | **Per-cascade event** | 4 or more distinct crew bonuses activate in single cascade |
| 3 | The Mechanic | **Existing counter** | `consecutivePointHits` reaches 4 within a single shooter (no seven-out) |
| 5 | The Floor Walker | **Cross-run cumulative** | 8 Seven Outs total across all runs |
| 8 | The Shark | **Cross-run cumulative** | 10 total Point Hits across all runs |
| 14 | The Old Pro | **Run achievement** | Clear all 9 Gauntlet markers (win the game once) |
| 9 | The Whale | **Run achievement** | Reach bankroll of $8,000 ($800,000 cents) in a single run |

### 4.3 Tracking Storage

#### Per-run counters (live on `runs` table as JSONB)

Add `perRunUnlockCounters: jsonb` to the `runs` table. Shape:

```typescript
interface PerRunUnlockCounters {
  naturalsThisRun:           number;  // crew 6
  softHardwayLossesThisRun:  number;  // crew 4
  pairedRollsThisRun:        number;  // crew 2
  sevenOutsThisRun:          number;  // crew 1 (compound: need to also clear marker)
  sevenOutShooterLostWithClearThisRun: boolean; // crew 1 compound flag
}
```

`consecutivePointHits` is already on `runs` — it serves the Mechanic (ID 3) and Hype-Train Holly (ID 11) unlock. For Holly, the condition is "same point 3 consecutive times in single shooter," which is `consecutivePointHits >= 3` at the time of a Point Hit.

#### Cross-run cumulative counters (on `users` table)

`users.unlockProgress: Record<number, number>` (already defined in Phase 2).

Initial values: `{}` (treated as 0 for any missing key).

Crew using this:
- ID 5 (Floor Walker): `unlockProgress[5]` = total seven-outs across all runs
- ID 8 (Shark): `unlockProgress[8]` = total point hits across all runs

#### One-time event flags (stored in `users.unlockProgress`)

Store as 0 or 1 in the same JSONB:
- ID 7: `unlockProgress[7]` = 1 when first hardway win occurs
- ID 10: `unlockProgress[10]` = 1 when Natural on first-ever come-out
- ID 12: `unlockProgress[12]` = 1 when hype > 2.0× first reached

#### Achievement flags

- ID 9 (Whale): derivable from `users.maxBankrollCents >= 800_000`. No extra counter needed.
- ID 14 (Old Pro): `unlockProgress[14]` = 1 when all 9 markers cleared in one run.

### 4.4 Evaluation Points in `rolls.ts`

Unlock evaluation happens at the END of the roll handler, after state persistence, as a fire-and-forget async operation (no latency impact on the hot path):

```typescript
// After persistedRun is confirmed — fire-and-forget unlock evaluation
void evaluateUnlocks(
  userId,
  user,                // current users row (pre-roll snapshot)
  finalContext,
  nextState,
  persistedRun,
  cascadeResult.events,  // for Mimic distinct-count check
).catch((err) => { request.log.error({ err }, '[unlocks] evaluation error'); });
```

#### `evaluateUnlocks()` logic (new lib file: `apps/api/src/lib/unlocks.ts`)

```
function evaluateUnlocks(userId, user, finalCtx, nextState, run, cascadeEvents):
  newUnlocks: number[] = []
  progressUpdates: Record<number, number> = {}

  // ── Cross-run cumulative (IDs 5, 8) ──────────────────────────────────────
  if (rollResult === SEVEN_OUT && sevenOutBlocked === false):
    newSevenOutCount = (unlockProgress[5] ?? 0) + 1
    progressUpdates[5] = newSevenOutCount
    if newSevenOutCount >= 8 && 5 not in unlockedCrewIds:
      newUnlocks.push(5)

  if (rollResult === POINT_HIT):
    newPointHitCount = (unlockProgress[8] ?? 0) + 1
    progressUpdates[8] = newPointHitCount
    if newPointHitCount >= 10 && 8 not in unlockedCrewIds:
      newUnlocks.push(8)

  // ── Per-run counters (IDs 2, 4, 6) ──────────────────────────────────────
  // These update perRunUnlockCounters on the run row, then check threshold.

  // ── One-time events (IDs 7, 10, 12) ─────────────────────────────────────
  if baseHardwaysPayout > 0 && unlockProgress[7] !== 1:
    progressUpdates[7] = 1
    newUnlocks.push(7)

  // ID 10: first come-out Natural — requires "is this the user's first-ever roll"
  // Simple heuristic: if user has never won a run and run.consecutivePointHits === 0
  // and run was just created (marker index 0) and rollResult === NATURAL on COME_OUT phase.
  // Note: For full correctness, track a `hasRolledComOut: boolean` on users.
  // For MVP, check unlockProgress[10] === undefined and rollResult === NATURAL
  // and run.currentMarkerIndex === 0 (first run assumption is imperfect but acceptable).

  if hype > 2.0 && unlockProgress[12] !== 1:
    progressUpdates[12] = 1
    newUnlocks.push(12)

  // ── Per-cascade event (ID 13 — Mimic) ────────────────────────────────────
  // Count distinct crewIds in cascadeEvents.
  // Mimic is excluded from the count (it copies, not a distinct ability).
  distinctFiringCrew = new Set(cascadeEvents.filter(e => e.crewId !== MIMIC_ID).map(e => e.crewId))
  if distinctFiringCrew.size >= 4 && 13 not in unlockedCrewIds:
    newUnlocks.push(13)

  // ── Mechanic (ID 3) via consecutivePointHits ─────────────────────────────
  if rollResult === POINT_HIT && nextState.consecutivePointHits >= 4 && 3 not in unlockedCrewIds:
    newUnlocks.push(3)

  // ── Holly (ID 11) via consecutivePointHits ───────────────────────────────
  if rollResult === POINT_HIT && nextState.consecutivePointHits >= 3 && 11 not in unlockedCrewIds:
    newUnlocks.push(11)

  // ── Per-run compound (ID 1 — Lefty) ──────────────────────────────────────
  // Check at TRANSITION: if sevenOutsThisRun >= 3 AND marker was just cleared.
  if nextState.status === TRANSITION && run.sevenOutsThisRun >= 3 && 1 not in unlockedCrewIds:
    newUnlocks.push(1)

  // ── Per-run event (ID 15 — Lucky Charm) ──────────────────────────────────
  // Check at TRANSITION: if exactly 1 crew member filled
  if nextState.status === TRANSITION:
    activeCrewCount = countNonNullSlots(persistedRun.crewSlots)
    if activeCrewCount === 1 && 15 not in unlockedCrewIds:
      newUnlocks.push(15)

  // ── Run achievements (IDs 9, 14) ─────────────────────────────────────────
  if persistedRun.bankrollCents >= 800_000 && 9 not in unlockedCrewIds:
    newUnlocks.push(9)

  if nextState.status === GAME_OVER (win path: all 9 markers cleared) && 14 not in unlockedCrewIds:
    newUnlocks.push(14)

  // ── Persist new unlocks (if any) ─────────────────────────────────────────
  if newUnlocks.length > 0 || Object.keys(progressUpdates).length > 0:
    await db.update(users).set({
      unlockedCrewIds: sql`array_cat(unlocked_crew_ids, ARRAY[${newUnlocks}]::integer[])`,
      unlockProgress: mergeJsonb(user.unlockProgress, progressUpdates),
    }).where(eq(users.id, userId))

    if newUnlocks.length > 0:
      emit 'unlocks:granted' event over socket to run room
```

### 4.5 `perRunUnlockCounters` Lifecycle

- **Created:** default `{}` when run is created.
- **Updated:** in `computeNextState()` inline (or a parallel helper) for IDs 1, 2, 4, 6.
- **Reset:** at the start of each `POST /runs/:id/recruit` call (new segment begins).

Per-run counter increments per roll result:
- ID 2 (Physics Prof): `pairedRollsThisRun++` when `isHardway OR both dice equal any value` (actually: `dice[0] === dice[1]`). Threshold: 5.
- ID 4 (Mathlete): `softHardwayLossesThisRun++` when a hardway bet resolves soft (a hardway number was rolled without paired dice AND the bet was non-zero). Threshold: 3.
- ID 6 (Regular): `naturalsThisRun++` when `rollResult === 'NATURAL'`. Threshold: 3.
- ID 1 (Lefty): `sevenOutsThisRun++` when `rollResult === 'SEVEN_OUT' && !flags.sevenOutBlocked`. Threshold check at TRANSITION: `sevenOutsThisRun >= 3`.

> **Note on ID 4 detection:** A "soft hardway loss" occurs when `rollResult === 'NO_RESOLUTION'`, the dice total is a hardway number (4, 6, 8, or 10), the dice are NOT paired (`!isHardway`), and `run.bets.hardways[hardN] > 0`. The `Mathlete` crew prevents this loss in-game but the unlock counter should still increment if the Mathlete would have fired (i.e., the raw dice triggered the condition). Check the raw condition before crew modification.

---

## Phase 5 — Server Route Updates

### 5.1 `rolls.ts` — Counter Management in `computeNextState()`

`computeNextState()` must maintain the three new `TurnContext` source fields. These are derived fields — their new values depend only on the roll result:

**`previousRollTotal`:**
- `POINT_SET`, `POINT_HIT`, `SEVEN_OUT`, `NATURAL`, `CRAPS_OUT`: set to `finalCtx.diceTotal`
- `NO_RESOLUTION`: set to `finalCtx.diceTotal`
- On new shooter start (after `SEVEN_OUT` or `POINT_HIT` returning to `COME_OUT`): set to `null`

Wait — `previousRollTotal` represents the total from the PRECEDING roll, which the NEXT roll's crew will read. So `computeNextState()` always sets it to `finalCtx.diceTotal`. On shooter reset (after SEVEN_OUT), the NEXT shooter's first roll should see `null`. This is naturally achieved if we reset on shooter death: after any `SEVEN_OUT` (shooter lost) or `POINT_HIT` (shooter's life continues but point phase resets) returning to `COME_OUT`, set `previousRollTotal = null`. Otherwise, set it to `finalCtx.diceTotal`.

Revised rule:
- After `SEVEN_OUT` (new shooter): `previousRollTotal = null`
- After `POINT_HIT` (same shooter, new come-out): keep as `finalCtx.diceTotal` (shooter still alive)
- All other results: `previousRollTotal = finalCtx.diceTotal`

**`shooterRollCount`:**
- After `SEVEN_OUT` (new shooter): reset to 0 (next shooter starts at 1 on their first roll)
- All other results: keep the current value (it was incremented before this cascade ran)

Wait — `shooterRollCount` is incremented BEFORE the cascade. So `computeNextState()` receives a run where `shooterRollCount` was already incremented. After `SEVEN_OUT`, set to 0. After all other results, leave as-is (the increment happened before the roll). The next roll's pre-cascade step will increment it again.

**`pointPhaseBlankStreak`:**
- `NO_RESOLUTION` (Pressure Cooker did NOT fire): `pointPhaseBlankStreak = min(prev + 1, 4)` — but actually we let it reach 5 to avoid needing clamping; after fire at 4 it resets to 0
  - More precisely: if `prev === 4` (Pressure Cooker just fired), set to 0. Else set to `prev + 1`.
  - Or even simpler: `nextStreak = rollResult === NO_RESOLUTION ? (prev >= 4 ? 0 : prev + 1) : 0`
- Any other roll result: reset to 0

**Full revised rule:**
```typescript
pointPhaseBlankStreak: rollResult === 'NO_RESOLUTION'
  ? (run.pointPhaseBlankStreak >= 4 ? 0 : run.pointPhaseBlankStreak + 1)
  : 0
```

### 5.2 `rolls.ts` — Pre-Cascade shooterRollCount Increment

Before `resolveRoll()` is called (or between `resolveRoll()` and `resolveCascade()`), increment `shooterRollCount`:

```typescript
const thisShooterRollCount = run.shooterRollCount + 1;
// Build initialCtx with thisShooterRollCount, run.previousRollTotal, run.pointPhaseBlankStreak
```

This ensures slot 0 crew see roll 1 as `shooterRollCount = 1`, roll 3 as `3`, etc.

### 5.3 New Endpoint: `GET /crew-roster`

**File:** `apps/api/src/routes/crewRoster.ts`

Returns the full roster of crew available to the authenticated user, with unlock status metadata:

```typescript
interface CrewRosterEntry {
  id:                 number;
  name:               string;
  abilityCategory:    string;
  cooldownType:       string;
  baseCostCents:      number;
  visualId:           string;
  rarity:             string;
  briefDescription:   string | null;
  detailedDescription:string | null;
  unlockDescription:  string;
  isAvailable:        boolean;  // true for Starter OR if in unlockedCrewIds
  unlockProgress:     number | null;  // current progress toward unlock (null if not tracked)
  unlockThreshold:    number | null;  // target count for unlock (null for non-counter unlocks)
}

GET /crew-roster
Response: { roster: CrewRosterEntry[] }
```

**Logic:**
1. Load `user.unlockedCrewIds` and `user.unlockProgress`
2. Query all `crewDefinitions` rows
3. For each crew: set `isAvailable = isStarterRoster || id in unlockedCrewIds`
4. Add progress data for cross-run cumulative unlocks (IDs 5, 8)
5. Return sorted by: Starter first, then by rarity tier order, then by ID

The Pub screen calls this endpoint on mount. The client caches it per session (no real-time updates needed during a run).

### 5.4 `recruit.ts` — Unlock Gate

After validating the crew def exists, add an availability check:

```typescript
const user = await resolveUserByClerkId(request.clerkId);
// ...
const isAvailable =
  crewDef.isStarterRoster ||
  (user.unlockedCrewIds ?? []).includes(crewId!);

if (!isAvailable) {
  return reply.status(403).send({
    error: `Crew member ${crewId} has not been unlocked yet.`,
  });
}
```

### 5.5 `runs.ts` — Include Unlock Data in Responses

The `POST /runs` and `GET /runs/:id` responses should include the user's `unlockedCrewIds` so the client can display unlock status without a separate fetch at game start:

```typescript
// Add to CreateRunResponse and the GET response:
unlockedCrewIds: number[];
```

---

## Phase 6 — Seed Updates

`apps/api/src/db/seed.ts` must be updated to seed all 30 crew with the new fields.

### 6.1 New Description Maps

Replace the current `DESCRIPTIONS` map (one-line) with two maps:

```typescript
const BRIEF_DESCRIPTIONS: Record<number, string> = {
  // IDs 1–15 (from crew_framework.md "Brief Description" field)
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'On any paired roll, nudges both dice ±1 to land on the active point.',
  3:  'Once per shooter: lock a die to any face for up to 4 rolls.',
  // ... (all 15 from framework)

  // IDs 16–30 (from crew_framework.md "Brief Description" field)
  16: 'Adds Hype whenever a 6 appears on either die.',
  17: 'Adds a flat bonus whenever a 1 appears on either die.',
  // ... (all 15 from framework)
};

const DETAILED_DESCRIPTIONS: Record<number, string> = {
  // All 30 from crew_framework.md "Detailed Description" field
};

const UNLOCK_DESCRIPTIONS: Record<number, string> = {
  // IDs 1–15 from crew_framework.md "Unlock Mechanism" field
  1:  'Lose 3 or more shooters to Seven Out in a single run and still clear the floor marker.',
  2:  'Roll doubles (paired dice) 5 times in a single run.',
  // ...
  // IDs 16–30 have empty string (Starter, no unlock)
};
```

### 6.2 New Rarity Map

```typescript
const RARITY: Record<number, string> = {
  1: 'Epic', 2: 'Rare', 3: 'Legendary',
  4: 'Uncommon', 5: 'Rare', 6: 'Uncommon',
  7: 'Common', 8: 'Rare', 9: 'Legendary',
  10: 'Common', 11: 'Uncommon', 12: 'Common',
  13: 'Epic', 14: 'Epic', 15: 'Rare',
  // 16–30 all 'Starter'
  16: 'Starter', 17: 'Starter', 18: 'Starter',
  19: 'Starter', 20: 'Starter', 21: 'Starter', 22: 'Starter',
  23: 'Starter', 24: 'Starter', 25: 'Starter',
  26: 'Starter', 27: 'Starter',
  28: 'Starter', 29: 'Starter', 30: 'Starter',
};
```

### 6.3 `isStarterRoster` Update

```typescript
isStarterRoster: crew.rarity === 'Starter',
```

The seed upsert is idempotent — re-running it safely updates existing rows for IDs 1–15 to `isStarterRoster = false` and inserts new rows for 16–30 with `isStarterRoster = true`.

### 6.4 Registry Update

`apps/api/src/lib/crewRegistry.ts`: add all 15 new crew to `CREW_REGISTRY`.

---

## Phase 7 — Client Updates

### 7.1 PubScreen — Replace Hard-Coded Roster

Currently `PubScreen.tsx` hard-codes `ALL_CREW` from the shared package and draws 3 random from it. This must change:

1. **On mount**, the Pub screen (or the `TRANSITION` handler in the store) fetches `GET /crew-roster`.
2. The response is stored in the Zustand store as `crewRoster: CrewRosterEntry[]`.
3. The Pub screen filters to `roster.filter(c => c.isAvailable)` and draws 3 random cards from that.
4. Cards for locked crew can be shown as a teaser (dimmed, with unlock description) — this is optional for this release but the data is available.

### 7.2 Pub Screen — Rarity Styling

Add rarity badge to `CrewCard`. The `rarity` field is now available from the roster endpoint. Use the rarity tier order for visual differentiation:
- Starter: gray/silver
- Common: white
- Uncommon: green
- Rare: blue
- Epic: purple
- Legendary: gold/amber

### 7.3 Store Updates

Add to `useGameStore`:
```typescript
unlockedCrewIds: number[];          // populated from POST /runs or GET /runs/:id responses
crewRoster: CrewRosterEntry[];      // populated on TRANSITION, cleared on game start
```

Add `fetchCrewRoster()` action: called when status transitions to `TRANSITION`.

### 7.4 WebSocket — `unlocks:granted` Event

When the server grants new unlocks, it emits a `unlocks:granted` WebSocket event with:
```typescript
{ newUnlockIds: number[], crewNames: string[] }
```

The client shows a brief unlock notification (a banner or toast) before or during the Pub screen. The store listens for this event and updates `unlockedCrewIds`.

---

## Execution Order

Implement in this sequence to keep the codebase building at every step:

| Step | Work | Notes |
|---|---|---|
| **1** | Extend `TurnContext` and `GameState` in `types.ts` with 3 new fields + `rarity` on `CrewMember` | Typecheck will fail until crew files are updated |
| **2** | Update all 15 existing crew files to add `rarity` field | Restores typecheck |
| **3** | Implement 15 new crew files (IDs 16–30) + update `index.ts` | Run unit tests after each category |
| **4** | Write Drizzle migration file; run `npm run db:migrate` | Schema change is additive; no data loss |
| **5** | Update `seed.ts` with all 30 crew, new fields; run `npm run db:seed` | Idempotent upsert |
| **6** | Update `crewRegistry.ts` with 15 new entries | Registry must stay in sync with crew files |
| **7** | Update `rolls.ts`: pass new fields to `resolveRoll()`, manage in `computeNextState()` | Typecheck will catch missing fields |
| **8** | Implement `apps/api/src/lib/unlocks.ts` (`evaluateUnlocks()`) | Unit-testable in isolation |
| **9** | Wire `evaluateUnlocks()` into `rolls.ts` as fire-and-forget | No latency impact |
| **10** | Implement `crewRoster.ts` (`GET /crew-roster`) | New route, no existing changes |
| **11** | Update `recruit.ts` with unlock gate | Breaking change — test in isolation |
| **12** | Update `runs.ts` to include `unlockedCrewIds` in responses | Additive |
| **13** | Update `PubScreen.tsx` to fetch roster from API | Breaking change from hard-coded list |
| **14** | Update store with `crewRoster` and `unlockedCrewIds` state | |
| **15** | Add `unlocks:granted` WebSocket listener + unlock notification UI | |

---

## Testing Notes

### Unit Tests (packages/shared)

Each new crew file should have a focused unit test in `packages/shared/src/__tests__/`. The existing test pattern (mock TurnContext, call execute(), assert contextDelta) applies directly. Key cases per crew:

- **Trigger fires:** assert the exact field change
- **No-op:** assert `context === ctx` (reference equality) when trigger condition is not met
- **Boundary:** test edge dice values (1,1), (6,6), adjacent faces
- **Counter-dependent crew (19, 20, 28, 29, 30):** test with null and non-null `previousRollTotal`; test Bookkeeper at rolls 1, 2, 3, 4, 6; test Pressure Cooker at streaks 3, 4

### Integration Tests

- `evaluateUnlocks()`: test each unlock condition in isolation with crafted state snapshots
- `GET /crew-roster`: assert that Starter crew are always `isAvailable: true`; assert locked crew return `isAvailable: false` for new users
- `POST /runs/:id/recruit`: assert 403 when attempting to hire a locked crew member

### Regression

After implementation, run a full game loop in dev to verify:
1. All 30 crew can be recruited in the Pub
2. Cascade fires correctly for Starter crew on every expected trigger
3. Three new state fields (`previousRollTotal`, `shooterRollCount`, `pointPhaseBlankStreak`) persist and reset correctly across rolls
4. Unlock conditions for IDs 5, 8 accumulate across run restarts
5. `isStarterRoster` flag change doesn't break existing sessions (in-flight runs unaffected — they only reference `crewSlots`, not the definition table)
