# Technical Design — Floor 6: Atlantis (FB-015)

## Overview

This document describes the full implementation of **Floor 6 — Atlantis**, the sixth floor of the
nine-floor gauntlet. Atlantis is guarded by **The Sovereign** with the `TIDAL_SURGE` boss rule: a
cyclical minimum bet that predictably surges to 15% of the marker target every 5 rolls for 2 rolls,
then recedes. Unlike RISING_MIN_BETS which ratchets and holds, the tide is readable and repeating —
it rewards preparation and punishes passivity.

Defeating The Sovereign awards the **POSEIDONS_FAVOR** comp: the first come-out roll of each new
shooter can never be a craps-out. Any come-out that would have crapped out is treated as a blank
re-roll (NO_RESOLUTION) instead.

---

## Scope at a Glance

| File | Change |
|---|---|
| `packages/shared/src/config.ts` | Add `TIDAL_SURGE` to `BossRuleType`; add `TidalSurgeParams` to `BossRuleParams`; add `POSEIDONS_FAVOR` to `CompRewardType` + `COMP_PERK_IDS`; extend `getBossMinBet` for TIDAL_SURGE; append 3 new markers to `GAUNTLET` |
| `packages/shared/src/bossRules/tidalSurge.ts` | **New** — `validateBet` hook |
| `packages/shared/src/bossRules/index.ts` | Import and register `tidalSurgeHooks` |
| `packages/shared/src/floors.ts` | Add `'ancient'` to `FloorAtmosphere`; append Floor 6 entry to `FLOORS` |
| `packages/shared/src/types.ts` | Add `crapsOutBlocked?: boolean` to `TurnContextFlags` |
| `apps/api/src/routes/rolls.ts` | Tide counter increment in `computeNextState`; `POSEIDONS_FAVOR` enforcement |
| `apps/web/src/lib/floorThemes.ts` | Add `FLOOR_6_THEME`; widen `getFloorTheme` / `getFloorIndex` clamp to `5` |
| `apps/web/src/components/BossRoomHeader.tsx` | Tide counter display for `TIDAL_SURGE` rule |

---

## 1. New Boss Rule: `TIDAL_SURGE`

### 1.1 Mechanic Design

The tide cycle is a fixed loop of `cycleLength + surgeDuration` rolls. For The Sovereign this is
**5 + 2 = 7 rolls per cycle**. The table-minimum state at the start of each roll is:

| Roll in cycle (0-based) | Tide position | Min bet |
|---|---|---|
| 0–4 | Normal | Standard table min |
| 5–6 | **SURGE** | 15% of marker target |
| 7+ | Wraps → Normal | Standard table min |

The cycle counter is visible to the player at all times via the BossRoomHeader. This distinguishes
TIDAL_SURGE from RISING_MIN_BETS: the surge is **predictable**, not punitive. A player who
watches the counter can pre-load their passLine bet before roll 5.

**Important:** the tide counter advances on **every roll** regardless of outcome — NATURAL,
CRAPS_OUT, POINT_SET, POINT_HIT, SEVEN_OUT, NO_RESOLUTION all tick the counter. The tide does not
care about dice outcomes; it cares about time.

### 1.2 State Storage: Reusing `bossPointHits`

TIDAL_SURGE requires a per-roll counter. Rather than adding a new DB column, the existing
`bossPointHits` field (DB column: `boss_roll_count`) is repurposed:

| Active rule | Semantic of `bossPointHits` |
|---|---|
| `RISING_MIN_BETS` (Floor 2) | Count of Point Hits in the current boss fight |
| `TIDAL_SURGE` (Floor 6) | Count of total rolls in the current tide cycle (0 to 6, wrapping mod 7) |

These rules are mutually exclusive (different floors), so no conflict exists. The DB column name
`boss_roll_count` is already semantically correct for the roll-counter use case.

**No DB migration required.**

The counter resets to `0` on boss defeat (marker clear), exactly as it does today.

### 1.3 `BossRuleParams` Extension

Add a new union member to `BossRuleParams` in `packages/shared/src/config.ts`:

```typescript
| { rule: 'TIDAL_SURGE'; cycleLength: number; surgeDuration: number; surgePct: number }
```

The Sovereign's params: `{ rule: 'TIDAL_SURGE', cycleLength: 5, surgeDuration: 2, surgePct: 0.15 }`.

`surgePct` is expressed as a fraction (0.15 = 15% of marker target).

### 1.4 `getBossMinBet` Extension

The existing `getBossMinBet(markerIndex, bossPointHits)` function is extended to handle
TIDAL_SURGE. When the active rule is TIDAL_SURGE:

1. Check if `bossPointHits >= cycleLength` (surge is active).
2. If yes, return `Math.ceil(targetCents × surgePct / 100) * 100` (rounded up to nearest dollar).
3. If no (normal tide), return `null` (no boss minimum; normal table minimum applies).

`getMaxBet` already calls `getBossMinBet` to compute the dynamic table-max floor during boss
fights. Because TIDAL_SURGE's surge minimum is only sometimes active, `getMaxBet` will correctly
apply the 5× floor during surge rolls and fall back to normal when the tide is out.

Full updated logic for the TIDAL_SURGE branch inside `getBossMinBet`:

```typescript
if (boss.rule === 'TIDAL_SURGE') {
  const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
  if (bossPointHits >= params.cycleLength) {
    // In surge window — return the surge minimum
    return Math.ceil(targetCents * params.surgePct / 100) * 100;
  }
  return null; // Normal tide — no elevated minimum
}
```

### 1.5 New Hook File: `packages/shared/src/bossRules/tidalSurge.ts`

Implements the `validateBet` hook. This is the only hook TIDAL_SURGE needs — all other behavior
(counter advancement, display) is handled elsewhere.

```typescript
// tidalSurge.ts
import type { BossRuleHooks } from './types.js';
import { GAUNTLET } from '../config.js';

export const tidalSurgeHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'TIDAL_SURGE') return null;
    if (state.bossPointHits < params.cycleLength) return null; // Not in surge

    const markerConfig = GAUNTLET[state.markerIndex];
    if (!markerConfig) return null;

    const surgeMinCents = Math.ceil(markerConfig.targetCents * params.surgePct / 100) * 100;
    if (bets.passLine < surgeMinCents) {
      return `Tide surge active — Pass Line minimum is $${surgeMinCents / 100}. Current bet: $${bets.passLine / 100}.`;
    }
    return null;
  },
};
```

**Note on THE_COVENANT interaction:** TIDAL_SURGE does not drain the bankroll directly (it is a
minimum bet enforcement, not a drain). THE_COVENANT's `covenantActive` flag has no effect on
TIDAL_SURGE. No interaction needed.

### 1.6 Registry Update: `packages/shared/src/bossRules/index.ts`

Add `TIDAL_SURGE` to the registry:

```typescript
import { tidalSurgeHooks } from './tidalSurge.js';

export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  EXTORTION_FEE:      extortionFeeHooks,
  RISING_MIN_BETS:    risingMinBetsHooks,
  DISABLE_CREW:       disableCrewHooks,
  FOURS_INSTANT_LOSS: foursInstantLossHooks,
  TRIBUTE:            tributeHooks,
  TIDAL_SURGE:        tidalSurgeHooks,  // ← add
};
```

### 1.7 `computeNextState` Changes in `rolls.ts`

TIDAL_SURGE is the first boss rule requiring the counter to advance on **every roll**, not just
POINT_HIT. `computeNextState` must detect when TIDAL_SURGE is active and use a different increment
path.

**Helper logic to add at the top of `computeNextState`:**

```typescript
const activeBossRule = GAUNTLET[currentMarkerIndex]?.boss?.rule ?? null;
const isTidalSurge   = activeBossRule === 'TIDAL_SURGE';

// Derive cycle length from params for the mod wrap.
// Default 7 (5+2) is only used when isTidalSurge is true, so the cast is safe.
const tidalCycleTotal = isTidalSurge
  ? (() => {
      const p = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
        Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
      return p.cycleLength + p.surgeDuration;
    })()
  : 0;
```

**`nextBossCounter` helper (local inline function or inlined expression):**

```typescript
// Returns the next bossPointHits value for the given roll.
// TIDAL_SURGE: increment + wrap every roll; reset to 0 on boss defeat.
// RISING_MIN_BETS: only increment on POINT_HIT (unchanged from today).
// All other rules: bossPointHits is irrelevant; hold unchanged.
function nextBossCounter(current: number, rollResult: RollResult, hitMarker: boolean): number {
  if (hitMarker) return 0; // Boss defeated — always reset
  if (isTidalSurge) return isBossMarker(currentMarkerIndex)
    ? (current + 1) % tidalCycleTotal
    : 0;
  // RISING_MIN_BETS: only increment on POINT_HIT mid-boss-fight
  if (rollResult === 'POINT_HIT' && isBossMarker(currentMarkerIndex)) return current + 1;
  return current;
}
```

**Apply this helper in every `bossPointHits` field across all result branches in `computeNextState`.**

The current code has six spread-points for `bossPointHits` across the switch/if structure. Each
one is replaced with `nextBossCounter(run.bossPointHits, rollResult, hitMarker)`.

Specific branches and the change from today:

| Branch | Today | After this change |
|---|---|---|
| NATURAL (no marker clear) | `run.bossPointHits` (hold) | `nextBossCounter(...)` → increments if TIDAL_SURGE |
| NATURAL (marker clear) | `0` (reset) | `0` (unchanged — hitMarker = true handles this) |
| CRAPS_OUT | `run.bossPointHits` (hold) | `nextBossCounter(...)` → increments if TIDAL_SURGE |
| POINT_SET | `run.bossPointHits` (hold) | `nextBossCounter(...)` → increments if TIDAL_SURGE |
| POINT_HIT (no marker clear) | `run.bossPointHits + 1` if boss | `nextBossCounter(...)` → increments every roll if TIDAL_SURGE, increments on HIT if RISING_MIN_BETS |
| POINT_HIT (marker clear) | `0` (reset) | `0` (unchanged — hitMarker = true) |
| SEVEN_OUT (no marker clear) | `run.bossPointHits` (hold) | `nextBossCounter(...)` → increments if TIDAL_SURGE |
| SEVEN_OUT (marker clear/GAME_OVER) | `0` (reset) | `0` (unchanged) |
| NO_RESOLUTION | `run.bossPointHits` (hold) | `nextBossCounter(...)` → increments if TIDAL_SURGE |

**This is a targeted change to `computeNextState` only.** The bossState built at the top of
the route handler (`bossState: { bossPointHits: run.bossPointHits, ... }`) is unchanged — it
still reads the DB value before the roll, which is the current tide position, which is exactly
what `validateBet` needs.

---

## 2. New Comp: `POSEIDONS_FAVOR`

### 2.1 Effect

> "The first come-out roll of each new shooter can never be a craps-out. Any roll that would have
> crapped out is treated as a blank re-roll instead."

This fires when all three conditions are true:
1. Player holds the comp (`user.compPerkIds.includes(COMP_PERK_IDS.POSEIDONS_FAVOR)`)
2. `run.shooterRollCount === 0` (this is the very first roll of the current shooter)
3. The classified roll result is `CRAPS_OUT` (come-out total of 2, 3, or 12)

When triggered, the classified result is overridden to `NO_RESOLUTION`. The dice values are NOT
changed — the craps total is still sent to the client (the player sees the bad number), but the
game treats it as a blank come-out roll (no bets change, come-out phase continues).

### 2.2 `TurnContextFlags` Addition (`packages/shared/src/types.ts`)

Add `crapsOutBlocked?: boolean` to `TurnContextFlags`:

```typescript
export interface TurnContextFlags {
  instantLoss?:     boolean;
  sevenOutBlocked?: boolean;
  nudgedFrom?:      number;
  crapsOutBlocked?: boolean;  // ← add: POSEIDONS_FAVOR suppressed a craps-out
}
```

This flag allows the client to display appropriate feedback (e.g., "BLESSED" overlay, or just
show the dice without the CRAPS_OUT popup). It follows the same pattern as `sevenOutBlocked`.

### 2.3 Enforcement Location in `rolls.ts`

Insert the POSEIDONS_FAVOR check **after `classifyRoll()` and before the cascade**, in the same
region where `FOURS_INSTANT_LOSS` modifies the outcome (after `modifyOutcome` hook call):

```typescript
// ── POSEIDONS_FAVOR — block craps-out on first shooter roll ───────────────
const hasPoseidonsFavor = (user.compPerkIds as number[]).includes(COMP_PERK_IDS.POSEIDONS_FAVOR);
if (
  hasPoseidonsFavor &&
  run.shooterRollCount === 0 &&
  viggedContext.rollResult === 'CRAPS_OUT'
) {
  viggedContext = {
    ...viggedContext,
    rollResult: 'NO_RESOLUTION',
    flags:      { ...viggedContext.flags, crapsOutBlocked: true },
  };
}
```

**Why before the cascade:** The cascade receives `TurnContext` including the final `rollResult`.
Crew that fire on `CRAPS_OUT` should NOT fire on a blocked craps-out (it became NO_RESOLUTION).

**Why `run.shooterRollCount === 0`:** This is the per-shooter roll index. It is reset to 0 when
a new shooter steps up, and incremented in `computeNextState` every roll. A value of 0 means
this is the shooter's first roll ever.

### 2.4 `COMP_PERK_IDS` and `CompRewardType`

In `config.ts`:

```typescript
export type CompRewardType =
  | 'THE_VIG'
  | 'EXTRA_SHOOTER'
  | 'HYPE_RESET_HALF'
  | 'GOLDEN_TOUCH'
  | 'THE_COVENANT'
  | 'POSEIDONS_FAVOR';  // ← add

export const COMP_PERK_IDS = {
  THE_VIG:          4,
  MEMBER_JACKET:    1,
  SEA_LEGS:         2,
  GOLDEN_TOUCH:     3,
  THE_COVENANT:     5,
  POSEIDONS_FAVOR:  6,  // ← add
} as const;
```

---

## 3. Floor 6 Narrative (`packages/shared/src/floors.ts`)

### 3.1 New `FloorAtmosphere` variant

```typescript
export type FloorAtmosphere =
  | 'exposed'
  | 'gritty'
  | 'elegant'
  | 'electric'
  | 'occult'
  | 'ancient';   // ← add: Floor 6 (Atlantis) — bioluminescent warmth, stone age
```

### 3.2 Floor 6 entry in `FLOORS`

Append to `FLOORS` array:

```typescript
{
  id:        6,
  name:      'Atlantis',
  tagline:   "It didn't sink. It descended on purpose.",
  introLines: [
    'Marble columns still standing. Mosaic floors intact. Three thousand years of coral grown through the stone, lit from within by creatures that have never seen the sun.',
    "The Sovereign never left. He watched every empire above collapse from this room, and he is not impressed by yours.",
    'The tides here answer to him. He will set them against you.',
  ],
  bossName:   'The Sovereign',
  bossTitle:  'Last King of Atlantis',
  bossVenue:  'Atlantis — The Throne Room',
  bossTeaser: 'The tides have always obeyed the Sovereign. So will your minimum bets.',
  atmosphere: 'ancient',
},
```

### 3.3 Update `getFloorByMarkerIndex` comment

The example list at the bottom of `floors.ts` should be updated to show Floor 6:
```
//   getFloorByMarkerIndex(15) → Floor 6 (Atlantis)
```

---

## 4. Floor 6 Config (`packages/shared/src/config.ts`)

### 4.1 Gauntlet update comment block

Update the comment above `GAUNTLET`:
```typescript
// Targets:
//   Floor 1 — The Loading Dock: $50 / $100 / $250
//   Floor 2 — VFW Hall:         $300 / $600 / $1,000
//   Floor 3 — Riverboat:        $1,500 / $2,500 / $4,000
//   Floor 4 — The Strip:        $6,000 / $9,000 / $12,500
//   Floor 5 — The Lodge:        $20,000 / $30,000 / $45,000
//   Floor 6 — Atlantis:         $70,000 / $120,000 / $175,000
//
// Boss at every 3rd marker (0-based indices 2, 5, 8, 11, 14, 17).
```

### 4.2 Three new `GAUNTLET` entries (markers 15, 16, 17)

Append after the existing Floor 5 entries:

```typescript
// ── Floor 6: Atlantis ─────────────────────────────────────────────────────

{
  targetCents: 7_000_000,   // $70,000
  venue:       'Atlantis',
  floor:       6,
  isBoss:      false,
},
{
  targetCents: 12_000_000,  // $120,000
  venue:       'Atlantis',
  floor:       6,
  isBoss:      false,
},
{
  targetCents: 17_500_000,  // $175,000 — BOSS: The Sovereign
  venue:       'Atlantis — The Throne Room',
  floor:       6,
  isBoss:      true,
  boss: {
    // Identity
    name:  'The Sovereign',
    title: 'Last King of Atlantis',
    // Vibe
    dreadTagline:        'THE TIDE TURNS.',
    entryLines: [
      "Three thousand years. Every empire above you has collapsed from here.",
      "My table runs on a tide. Five rolls calm, two rolls flood.",
      "You can see it coming. That was never the point.",
    ],
    ruleBlurb:          "Every 5 rolls the minimum Pass Line bet floods to 15% of the marker target for 2 rolls, then recedes. The tide is visible. The tide is inevitable.",
    victoryQuote:       "…the tide will return. It always does.",
    defeatAnnouncement: 'THE TIDE RECEDES',
    // Mechanic
    rule:           'TIDAL_SURGE',
    ruleHeaderText: 'TIDE SURGES EVERY 5 ROLLS — MIN BET 15% OF TARGET FOR 2 ROLLS',
    ruleParams:     { rule: 'TIDAL_SURGE', cycleLength: 5, surgeDuration: 2, surgePct: 0.15 },
    // Comp
    compReward:      'POSEIDONS_FAVOR',
    compPerkId:      COMP_PERK_IDS.POSEIDONS_FAVOR,
    compName:        "POSEIDON'S FAVOR",
    compDescription: "First come-out roll of each shooter can never craps-out — treated as a blank re-roll instead.",
    compFanLabel:    "POSEIDON",
    // Legacy
    flavorText: "My kingdom has stood for three thousand years. Your run will not outlast this tide.",
  },
},
```

---

## 5. Floor 6 Visual Theme (`apps/web/src/lib/floorThemes.ts`)

### 5.1 New `FLOOR_6_THEME` constant

Drawn directly from `docs/requirements/floor-aesthetics.md` — Floor 5 Atlantis section:

```typescript
const FLOOR_6_THEME: FloorTheme = {
  // Felt — deep sea-teal
  feltPrimary: '#062535',
  feltRail:    '#031520',
  feltTexture: feltTextureUri('#062535', '#041d2a', '#0a3a4a'),

  // Accents — warm aquamarine bioluminescence
  accentBright:  '#00c9a0',
  accentPrimary: '#009070',
  accentDim:     '#004840',

  // Borders — aquamarine at low opacity
  borderHigh: 'rgba(0,144,112,0.30)',
  borderLow:  'rgba(0,144,112,0.20)',

  // Breathing — abyssal teal / bioluminescent bloom / thermal vent orange
  breatheCold: 'rgba(0,60,80,0.22)',
  breatheWarm: 'rgba(0,160,120,0.18)',
  breatheHot:  'rgba(200,80,20,0.25)',

  // Screen flash — bioluminescent surge / total depth darkness
  flashWin:  'rgba(0,200,160,0.35)',
  flashLose: 'rgba(0,30,50,0.70)',

  // Pub — The Hall of Records
  pubName:         'THE HALL OF RECORDS',
  pubBg:           'radial-gradient(ellipse at 50% 20%, #0a2535 0%, #041520 45%, #010810 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #005840 30%, #00c9a0 50%, #005840 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 50%, rgba(0,150,100,0.05) 0%, transparent 70%)',
  pubTitleColor:   '#00c9a0',
  pubTitleShadow:  '0 0 20px #009070, 0 0 40px #004840',
  pubSubtextColor: 'rgba(0,201,160,0.48)',

  // Boss — The Throne Room (The Sovereign)
  bossBg:          'radial-gradient(ellipse at 50% 30%, #082535 0%, #031520 55%, #010810 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #5a4020 30%, #c9a06a 50%, #5a4020 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(0,160,120,0.08) 0%, transparent 65%)',
  bossTextColor:   '#c9a06a',
  bossTitleShadow: '0 0 30px rgba(201,160,106,0.50), 0 0 80px rgba(0,100,80,0.35)',
  bossBorderColor: 'rgba(0,100,80,0.45)',
  bossStarColor:   '#c9a06a',
  bossStarBg:      'rgba(0,80,60,0.40)',
  bossStarBorder:  '2px solid rgba(0,160,120,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(0,160,120,0.20)',
};
```

### 5.2 Registry and clamp update

```typescript
// Before:
const THEMES: FloorTheme[] = [FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME, FLOOR_4_THEME, FLOOR_5_THEME];

export function getFloorTheme(markerIndex: number): FloorTheme {
  const floor = Math.max(0, Math.min(4, Math.floor(markerIndex / 3)));
  return THEMES[floor]!;
}

export function getFloorIndex(markerIndex: number): number {
  return Math.max(0, Math.min(4, Math.floor(markerIndex / 3)));
}

// After:
const THEMES: FloorTheme[] = [
  FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME,
  FLOOR_4_THEME, FLOOR_5_THEME, FLOOR_6_THEME,  // ← add
];

export function getFloorTheme(markerIndex: number): FloorTheme {
  const floor = Math.max(0, Math.min(5, Math.floor(markerIndex / 3)));  // ← 4→5
  return THEMES[floor]!;
}

export function getFloorIndex(markerIndex: number): number {
  return Math.max(0, Math.min(5, Math.floor(markerIndex / 3)));  // ← 4→5
}
```

---

## 6. BossRoomHeader: Tide Counter Display

The boss header must show the player where they are in the tide cycle so they can anticipate
surges. The tide display replaces the "min bet" display area when the active rule is TIDAL_SURGE.

### 6.1 Reading Tide State

The component already reads `bossPointHits` from the store. For TIDAL_SURGE:

```typescript
const boss = markerConfig?.boss;
const isTidalSurge = boss?.rule === 'TIDAL_SURGE';
```

For the tide counter, derive the display values from `boss.ruleParams`:

```typescript
// Only when isTidalSurge:
const params = boss!.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
const tidePos = bossPointHits; // already wraps in computeNextState
const inSurge = tidePos >= params.cycleLength;
const rollsUntilSurge = inSurge ? 0 : params.cycleLength - tidePos;
const surgeRollsLeft  = inSurge ? (params.cycleLength + params.surgeDuration) - tidePos : 0;
```

### 6.2 Display Layout

For TIDAL_SURGE, replace the `{currentMinBet !== null && (...)}` block with a tide status block:

**Normal tide (not in surge):**
```
TIDE
── ── ── ── □ □ □          ← 7 pips: 5 normal + 2 surge
SURGE IN 3
```

**Surge active:**
```
TIDE  ⚠ SURGE
── ── ── ── ■ ■ □          ← filled pips = current position; red = surge
$26,250 MIN / 2 ROLLS
```

The pip row is a `flex` of 7 small squares: first `cycleLength` in normal color (aquamarine dim),
last `surgeDuration` in surge warning color. A filled indicator tracks `tidePos`.

**Minimum UI spec** (exact visuals can be iterated, but these fields are required):
1. Label: `"TIDE"` + surge warning badge `"⚠ SURGE"` when active
2. Pip counter showing position in the cycle
3. When NOT in surge: `"SURGE IN N"` countdown label
4. When IN surge: surge minimum in dollars + rolls remaining

### 6.3 Component Change Scope

The component currently has an `if (currentMinBet !== null)` block for the min-bet display.
Add a new `if (isTidalSurge)` block to render the tide display instead. The existing
`currentMinBet` block remains for RISING_MIN_BETS — the two blocks are mutually exclusive.

The component does not need to import anything new; `boss.rule` is already accessible via the
existing `markerConfig` / `boss` references.

---

## 7. Implementation Order

Follow this sequence to keep the build green at each step:

1. **`packages/shared/src/types.ts`** — add `crapsOutBlocked?: boolean` to `TurnContextFlags`
2. **`packages/shared/src/config.ts`** — add `TIDAL_SURGE` type, `TidalSurgeParams`, `POSEIDONS_FAVOR` comp, extend `getBossMinBet`, append 3 GAUNTLET entries
3. **`packages/shared/src/bossRules/tidalSurge.ts`** — create hook file
4. **`packages/shared/src/bossRules/index.ts`** — register hook
5. **`packages/shared/src/floors.ts`** — add `'ancient'`, append Floor 6
6. **`npm run typecheck -w @battlecraps/shared`** ← verify shared compiles clean
7. **`apps/api/src/routes/rolls.ts`** — tide counter in `computeNextState`; POSEIDONS_FAVOR enforcement
8. **`npm run typecheck -w @battlecraps/api`** ← verify api compiles clean
9. **`apps/web/src/lib/floorThemes.ts`** — add FLOOR_6_THEME; widen clamps
10. **`apps/web/src/components/BossRoomHeader.tsx`** — add tide counter display
11. **`npm run typecheck -w @battlecraps/web`** ← verify web compiles clean
12. **`npm run build`** ← full build must pass before declaring done

---

## 8. Edge Cases & Interaction Notes

### Surge on the very first roll
`bossPointHits` starts at 0, which is `< cycleLength (5)`. The first roll is never in a surge.
The earliest a surge can occur is roll 6 (0-indexed roll 5, `bossPointHits = 5`). This is
consistent with "every 5 rolls" — the player gets 5 free rolls before the first surge.

### Surge during SEVEN_OUT
If the player seven-outs while a surge is active, the surge continues until it naturally ends.
The tide counter still advances (SEVEN_OUT is still a roll). A seven-out does not "escape" the
surge — the next roll after seven-out may still be in the surge window if the counter hasn't
wrapped yet.

### POSEIDONS_FAVOR + blocked craps-out on come-out
The `crapsOutBlocked` flag is set in `TurnContextFlags` and emitted to the client via
`turn:settled`. The client can optionally show feedback (e.g., a "BLESSED" flash or muted dice
animation). The minimum requirement: the result popup does NOT show CRAPS_OUT — no out animation,
no hype loss, no payout loss. The come-out phase continues as if the roll were blank.

**Interaction with Doorman (crew):** Doorman fires on any come-out (NATURAL / CRAPS_OUT /
POINT_SET). A blocked craps-out becomes NO_RESOLUTION, which is NOT a come-out event —
Doorman would NOT fire on a POSEIDONS_FAVOR-blocked roll. This is correct and expected.

### THE_COVENANT + TIDAL_SURGE
THE_COVENANT halves "direct bankroll drains from boss mechanics." TIDAL_SURGE does not drain
the bankroll directly (it enforces a minimum bet — player can bet more than min, and gets paid
normally). THE_COVENANT has zero effect on TIDAL_SURGE. The `covenantActive` flag in
`BossRuleState` is irrelevant for this boss rule.

### TIDAL_SURGE counter reset on TRANSITION
When the player clears any marker (including defeating The Sovereign), `bossPointHits` resets to
`0` in `computeNextState`. This is handled by the `hitMarker = true` case in `nextBossCounter`.
No special handling required.

### `getMaxBet` during surge
When the tide is in surge (`bossPointHits >= cycleLength`), `getBossMinBet` returns a non-null
surge minimum. `getMaxBet` floors the table max at `5 × surgeMin`. At the Sovereign's $175,000
marker, surge min = $26,250 (`175,000 × 0.15`), so table max floors at $131,250. The normal
table max (10% = $17,500) is well below this, so the floor dominates — the table max during surge
is $131,250. This is intentional: betting the minimum still leaves headroom for full 5× odds.

---

## 9. What Is NOT Changing

- `db/schema.ts` — no new columns; `boss_roll_count` is reused
- `routes/recruit.ts` — no changes
- `cascade.ts` — no changes (TIDAL_SURGE has no `modifyCascadeOrder` hook)
- All transition phase components — they read from `BossConfig` fields which are now populated
- `BossEntryDreadPhase`, `BossEntryPhase`, `BossVictoryPhase`, `BossVictoryCompPhase` — no changes
- `FloorRevealPhase` — reads from `FloorConfig` which is now populated
- Tutorial beats — do not reference specific floor numbers post-FB-015 fix; no changes needed
- `tutorialBeats.ts` — no changes (Floor 6 is beyond the tutorial scope)
