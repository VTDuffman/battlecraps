# Floor 7 — The Station: Technical Design Document

**Feature:** FB-015 (Expanded Gauntlet — Floor 7)
**Status:** Design — pending implementation
**Floor:** 7 (markers 18–20)
**Boss:** The Commander
**Rule:** `ORBITAL_DECAY`
**Comp:** `ZERO_POINT`

---

## Overview

Floor 7 adds three new gauntlet markers ($250k / $425k / $650k) and introduces the `ORBITAL_DECAY` boss mechanic: hype is no longer floored at 1.0× during The Commander's fight. Every seven-out subtracts 0.5× from the current hype multiplier, down to a floor of 0.5×. Below 1.0×, the multiplier penalizes payouts rather than boosting them.

The comp reward — `ZERO_POINT` — permanently floors hype at 1.25× for the rest of any run where the player holds it, making future seven-outs significantly less catastrophic.

This TDD covers all seven files that need to change.

---

## Architecture Context

Floor content is split across three systems that must stay in sync:

| System | File | Change |
|---|---|---|
| Mechanical | `packages/shared/src/config.ts` | New types, params, GAUNTLET entries |
| Narrative | `packages/shared/src/floors.ts` | New atmosphere type, FLOORS entry |
| Visual | `apps/web/src/lib/floorThemes.ts` | `FLOOR_7_THEME` + registry update |
| Boss rule (shared) | `packages/shared/src/bossRules/orbitalDecay.ts` | NEW empty hooks file |
| Boss rule registry | `packages/shared/src/bossRules/index.ts` | Register `orbitalDecayHooks` |
| Game engine | `apps/api/src/routes/rolls.ts` | ORBITAL_DECAY hype logic + ZERO_POINT comp |
| Boss UI | `apps/web/src/components/BossRoomHeader.tsx` | ORBITAL_DECAY display branch |

---

## 1. `packages/shared/src/config.ts`

### 1a. `BossRuleType` — add `'ORBITAL_DECAY'`

```typescript
export type BossRuleType =
  | 'EXTORTION_FEE'
  | 'RISING_MIN_BETS'
  | 'DISABLE_CREW'
  | 'FOURS_INSTANT_LOSS'
  | 'TRIBUTE'
  | 'TIDAL_SURGE'
  | 'ORBITAL_DECAY';   // ← new
```

### 1b. `CompRewardType` — add `'ZERO_POINT'`

```typescript
export type CompRewardType =
  | 'THE_VIG'
  | 'EXTRA_SHOOTER'
  | 'HYPE_RESET_HALF'
  | 'GOLDEN_TOUCH'
  | 'THE_COVENANT'
  | 'POSEIDONS_FAVOR'
  | 'ZERO_POINT';      // ← new
```

### 1c. `BossRuleParams` — add ORBITAL_DECAY union member

```typescript
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';      taxPct: number }
  | { rule: 'RISING_MIN_BETS';    startPct: number; incrementPct: number; capPct: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS'; triggerTotal: number }
  | { rule: 'TRIBUTE';            tributePct: number }
  | { rule: 'TIDAL_SURGE';        cycleLength: number; surgeDuration: number; surgePct: number }
  | { rule: 'ORBITAL_DECAY';      decayAmount: number; hypeFloor: number };   // ← new
```

**Parameters:**
- `decayAmount: 0.5` — subtracted from hype on every seven-out
- `hypeFloor: 0.5` — absolute minimum hype can reach (cannot go below this)

### 1d. `COMP_PERK_IDS` — add `ZERO_POINT`

```typescript
export const COMP_PERK_IDS = {
  THE_VIG:         4,
  MEMBER_JACKET:   1,
  SEA_LEGS:        2,
  GOLDEN_TOUCH:    3,
  THE_COVENANT:    5,
  POSEIDONS_FAVOR: 6,
  ZERO_POINT:      7,   // ← new
} as const;
```

### 1e. `GAUNTLET` — append Floor 7 entries (indices 18–20)

Append after the Floor 6 block:

```typescript
// ── Floor 7: The Station ──────────────────────────────────────────────────

{
  targetCents: 25_000_000,   // $250,000
  venue:       'The Station',
  floor:       7,
  isBoss:      false,
},
{
  targetCents: 42_500_000,   // $425,000
  venue:       'The Station',
  floor:       7,
  isBoss:      false,
},
{
  targetCents: 65_000_000,   // $650,000 — BOSS: The Commander
  venue:       'The Station — The Command Module',
  floor:       7,
  isBoss:      true,
  boss: {
    // Identity
    name:  'The Commander',
    title: 'Station Chief, Table Authority',
    // Vibe
    dreadTagline:        'MOMENTUM DECAYS.',
    entryLines: [
      "Eleven months up here. I don't miss the ground.",
      "Your hype is a resource. And resources decay in this environment.",
      "Every time you seven-out, your multiplier drops. There is no floor — until there is.",
    ],
    ruleBlurb:          "Every seven-out subtracts 0.5× from your Hype multiplier, which can fall below 1.0×. Below 1.0×, your payouts are penalized.",
    victoryQuote:       "…orbital mechanics didn't account for you. Gravity's compliments.",
    defeatAnnouncement: 'ORBITAL AUTHORITY LOST',
    // Mechanic
    rule:           'ORBITAL_DECAY',
    ruleHeaderText: 'SEVEN-OUT DRAINS HYPE BY 0.5× — CAN FALL BELOW 1.0×',
    ruleParams:     { rule: 'ORBITAL_DECAY', decayAmount: 0.5, hypeFloor: 0.5 },
    // Comp
    compReward:      'ZERO_POINT',
    compPerkId:      COMP_PERK_IDS.ZERO_POINT,
    compName:        'ZERO POINT',
    compDescription: 'Hype multiplier is permanently floored at 1.25× for all future runs.',
    compFanLabel:    'ZERO PT',
    // Legacy
    flavorText: "Gravity is a courtesy I extend to paying customers. So is generosity.",
  },
},
```

Also update the comment block above `GAUNTLET` to document Floor 7:
```typescript
//   Floor 7 — The Station:         $250,000 / $425,000 / $650,000
```

And update the gauntlet count in the comment from 18 to 21 markers across 7 floors.

---

## 2. `packages/shared/src/floors.ts`

### 2a. `FloorAtmosphere` — add `'cosmic'`

```typescript
export type FloorAtmosphere =
  | 'exposed'
  | 'gritty'
  | 'elegant'
  | 'electric'
  | 'occult'
  | 'ancient'
  | 'cosmic';   // ← new — Floor 7: vast, cold, orbital
```

### 2b. `FLOORS` — append Floor 7 entry

```typescript
// ── Floor 7: The Station ─────────────────────────────────────────────────
// Privately-funded orbital casino. Deep space black, nebula purple, cold
// starlight silver. Through the viewport, the Earth turns below. The
// Commander has been up here for eleven months — she does not miss gravity.
{
  id:        7,
  name:      'The Station',
  tagline:   'Closest to everything. Furthest from anywhere.',
  introLines: [
    "Through the viewport, the Earth turns below — a circuit board of city lights against the dark. Up here, light takes eight minutes to arrive from the sun.",
    "The Commander has been on this station for eleven months. She does not miss the ground. She does not miss anything.",
    "Up here, she decides which physics apply. That includes yours.",
  ],
  bossName:   'The Commander',
  bossTitle:  'Station Chief, Table Authority',
  bossVenue:  'The Station — The Command Module',
  bossTeaser: "The Commander removed gravity. She can remove momentum too.",
  atmosphere: 'cosmic',
},
```

### 2c. `getFloorByMarkerIndex` docstring update

Update the examples in the JSDoc comment to include Floor 7:
```
*   getFloorByMarkerIndex(18) → Floor 7 (The Station)
```

---

## 3. `packages/shared/src/bossRules/orbitalDecay.ts` (NEW FILE)

```typescript
// =============================================================================
// BATTLECRAPS — ORBITAL_DECAY BOSS RULE HOOKS
// packages/shared/src/bossRules/orbitalDecay.ts
//
// Floor 7 — The Commander (The Station — The Command Module)
// Mechanic: Every seven-out subtracts decayAmount (0.5×) from the player's
// current hype multiplier, which can fall below 1.0× to a floor of hypeFloor
// (0.5×). Below 1.0×, the multiplier penalizes payouts instead of boosting them.
//
// Implementation note: the hype modification is handled directly inside
// computeNextState() in apps/api/src/routes/rolls.ts (the SEVEN_OUT branch),
// using the same inline detection pattern as TIDAL_SURGE. No pre-roll, cascade,
// or payout hooks are needed here.
//
// This file exists to satisfy the BOSS_RULE_HOOKS registry type requirement
// and to document where the logic lives.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const orbitalDecayHooks: BossRuleHooks = {};
```

---

## 4. `packages/shared/src/bossRules/index.ts`

Add the import and registry entry:

```typescript
import { orbitalDecayHooks }   from './orbitalDecay.js';   // ← new import

export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  EXTORTION_FEE:      extortionFeeHooks,
  RISING_MIN_BETS:    risingMinBetsHooks,
  DISABLE_CREW:       disableCrewHooks,
  FOURS_INSTANT_LOSS: foursInstantLossHooks,
  TRIBUTE:            tributeHooks,
  TIDAL_SURGE:        tidalSurgeHooks,
  ORBITAL_DECAY:      orbitalDecayHooks,   // ← new entry
};
```

---

## 5. `apps/api/src/routes/rolls.ts`

Two changes: ORBITAL_DECAY detection in `computeNextState`, and ZERO_POINT comp in `rollHandler`.

### 5a. `computeNextState` — inline ORBITAL_DECAY detection

At the top of `computeNextState`, alongside the existing TIDAL_SURGE detection block:

```typescript
// ── TIDAL_SURGE: per-roll tide counter ────────────────────────────────────
const activeBossRule  = GAUNTLET[currentMarkerIndex]?.boss?.rule ?? null;
const isTidalSurge   = activeBossRule === 'TIDAL_SURGE';
// ... (existing TIDAL_SURGE logic unchanged) ...

// ── ORBITAL_DECAY: hype-drain-on-seven-out ───────────────────────────────
const isOrbitalDecay = activeBossRule === 'ORBITAL_DECAY' && isBossMarker(currentMarkerIndex);
```

### 5b. `computeNextState` — SEVEN_OUT branch hype calculation

In the `case 'SEVEN_OUT':` block, replace the hype calculation:

**Before:**
```typescript
const cascadeHypeDelta = Math.max(0, finalCtx.hype - run.hype);
const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
const nextHype = Math.max(1.0, seaLegsBaseline + cascadeHypeDelta);
```

**After:**
```typescript
const cascadeHypeDelta = Math.max(0, finalCtx.hype - run.hype);

let nextHype: number;
if (isOrbitalDecay) {
  // ORBITAL_DECAY: subtract decayAmount from pre-roll hype, add back any
  // crew cascade gains, floor at hypeFloor. Sea Legs is bypassed — the
  // decay is the mechanic, not a reset-to-baseline.
  const decayParams = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
    Extract<BossRuleParams, { rule: 'ORBITAL_DECAY' }>;
  nextHype = Math.max(
    decayParams.hypeFloor,
    run.hype - decayParams.decayAmount + cascadeHypeDelta,
  );
} else {
  const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
  nextHype = Math.max(1.0, seaLegsBaseline + cascadeHypeDelta);
}
```

**Why Sea Legs is bypassed:** Sea Legs preserves 50% of accumulated hype on reset (calibrated for Floor 3 / Mme. Le Prix). ORBITAL_DECAY's design intent is that momentum can work against the player — the Commander actively removes it. Applying Sea Legs on top of ORBITAL_DECAY would partially negate the mechanic. This also matches the comp reward for ORBITAL_DECAY (ZERO_POINT), which provides a persistent floor that is strictly better than Sea Legs in this context.

**Import addition:** `BossRuleParams` is already imported in `rolls.ts`. The `Extract<>` narrowing requires no new imports.

### 5c. `rollHandler` — ZERO_POINT comp post-processing

After the `computeNextState` call, insert the ZERO_POINT floor guard:

```typescript
const nextState = computeNextState(run, viggedContext, tributedBankroll, incomingBets, hasSeaLegs);

// ── ZERO_POINT comp — permanently floors hype at 1.25× ───────────────────
// Applied post-computeNextState so it covers all result branches (NATURAL,
// CRAPS_OUT, SEVEN_OUT, etc.) without threading the flag into the function.
const hasZeroPoint = (user.compPerkIds as number[]).includes(COMP_PERK_IDS.ZERO_POINT);
if (hasZeroPoint && nextState.hype < 1.25) {
  nextState.hype = 1.25;
}
```

**Why this approach:** `nextState` is a plain object returned by value from `computeNextState`. Mutating `nextState.hype` here is safe and mirrors how Sea Legs is already threaded as a flag (`hasSeaLegs`). Adding `hasZeroPoint` as another parameter to `computeNextState` would require touching every branch — the post-processing override is simpler and lower risk.

**Scope:** fires after every roll. On non-seven-out rolls, hype can only increase (CRAPS_OUT ticks −0.05 but is already floored at 1.0 in the base tick), so the guard is effectively a no-op on winning and point-setting rolls. It primarily activates on seven-out.

### 5d. Import update

`COMP_PERK_IDS.ZERO_POINT` is already available once added to config.ts — `COMP_PERK_IDS` is already imported from `@battlecraps/shared`.

---

## 6. `apps/web/src/lib/floorThemes.ts`

### 6a. Add `FLOOR_7_THEME`

Insert after `FLOOR_6_THEME`:

```typescript
// =============================================================================
// Floor 7 — The Station (The Command Module)
// =============================================================================
// Privately-funded orbital casino. Deep space black with violet undertone.
// Cold starlight silver accents. Nebula purple secondary. No organic warmth —
// everything is precision, vastness, and the hum of life support at 400km up.

const FLOOR_7_THEME: FloorTheme = {
  // Felt — deep space black with violet undertone
  feltPrimary: '#080412',
  feltRail:    '#04020a',
  feltTexture: feltTextureUri('#080412', '#050210', '#100820'),

  // Accents — cold starlight silver
  accentBright:  '#c8d8e8',
  accentPrimary: '#90a8c0',
  accentDim:     '#405060',

  // Borders — silver at low opacity (space is empty)
  borderHigh: 'rgba(144,168,192,0.28)',
  borderLow:  'rgba(144,168,192,0.18)',

  // Breathing — nebula void / orbital blue / solar-flare purple
  breatheCold: 'rgba(30,20,60,0.18)',
  breatheWarm: 'rgba(60,100,160,0.16)',
  breatheHot:  'rgba(120,60,200,0.22)',

  // Screen flash — starlight burst / vacuum purple
  flashWin:  'rgba(200,220,255,0.40)',
  flashLose: 'rgba(60,20,120,0.65)',

  // Pub — The Observation Deck
  pubName:         'THE OBSERVATION DECK',
  pubBg:           'radial-gradient(ellipse at 50% 15%, #100820 0%, #060412 50%, #000000 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #4a3870 30%, #c8d8e8 50%, #4a3870 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 100%, rgba(30,60,120,0.04) 0%, transparent 70%)',
  pubTitleColor:   '#c8d8e8',
  pubTitleShadow:  '0 0 20px rgba(200,216,232,0.40), 0 0 40px rgba(123,94,167,0.25)',
  pubSubtextColor: 'rgba(200,216,232,0.45)',

  // Boss — The Command Module (The Commander)
  bossBg:          'radial-gradient(ellipse at 50% 25%, #0c0820 0%, #050412 50%, #000000 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #403060 30%, #c8d8e8 50%, #403060 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(60,40,120,0.06) 0%, transparent 65%)',
  bossTextColor:   '#c8d8e8',
  bossTitleShadow: '0 0 30px rgba(200,216,232,0.50), 0 0 80px rgba(100,80,160,0.35)',
  bossBorderColor: 'rgba(100,80,160,0.35)',
  bossStarColor:   '#c8d8e8',
  bossStarBg:      'rgba(80,60,140,0.35)',
  bossStarBorder:  '2px solid rgba(200,216,232,0.40)',
  bossStarGlow:    '0 0 20px 4px rgba(123,94,167,0.25)',
};
```

### 6b. `THEMES` array — append Floor 7

```typescript
const THEMES: FloorTheme[] = [
  FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME,
  FLOOR_4_THEME, FLOOR_5_THEME, FLOOR_6_THEME,
  FLOOR_7_THEME,   // ← new
];
```

### 6c. `getFloorTheme` and `getFloorIndex` — update clamp

```typescript
// Before:
const floor = Math.max(0, Math.min(5, Math.floor(markerIndex / 3)));

// After:
const floor = Math.max(0, Math.min(6, Math.floor(markerIndex / 3)));
```

Both `getFloorTheme` and `getFloorIndex` use the same clamp — update both.

---

## 7. `apps/web/src/components/BossRoomHeader.tsx`

### 7a. Read current hype from store

Add `hype` to the selectors at the top of the component:

```typescript
const currentHype = useGameStore((s) => s.hype);
```

### 7b. Detect ORBITAL_DECAY

Alongside the existing `isTidalSurge` detection:

```typescript
const isOrbitalDecay = boss.rule === 'ORBITAL_DECAY';
```

### 7c. Right panel — add ORBITAL_DECAY branch

In the JSX where the right panel is rendered (the ternary between `isTidalSurge`, `currentMinBet !== null`, and `null`):

```tsx
{isTidalSurge && tidalParams !== null ? (
  // ... existing TIDAL_SURGE display (unchanged) ...
) : isOrbitalDecay ? (
  // ORBITAL_DECAY: show current hype value with color-coded warning
  (() => {
    const hypeStr   = currentHype.toFixed(2) + '×';
    const isBelow1  = currentHype < 1.0;
    const isWarning = currentHype < 1.25 && currentHype >= 1.0;
    const hypeColor = isBelow1  ? '#ef4444'   // red — below 1.0 is penalty territory
                    : isWarning ? '#fbbf24'   // amber — approaching danger
                    : '#c8d8e8';              // silver — nominal
    return (
      <div className="flex-none text-right">
        <div className="font-pixel text-[5px] tracking-widest leading-none"
          style={{ color: 'rgba(200,216,232,0.60)' }}>
          HYPE DECAY
        </div>
        <div className="font-pixel text-[10px] leading-tight"
          style={{ color: hypeColor }}>
          {hypeStr}
        </div>
        <div className="font-pixel text-[5px] leading-none mt-0.5"
          style={{ color: isBelow1 ? '#ef4444' : 'rgba(200,216,232,0.45)' }}>
          {isBelow1 ? '⚠ PENALTY MODE' : '−0.5× ON 7-OUT'}
        </div>
      </div>
    );
  })()
) : currentMinBet !== null ? (
  // ... existing min-bet display (unchanged) ...
) : null}
```

**Color thresholds:**
- `>= 1.25×` — silver (`#c8d8e8`): nominal — player is not in danger
- `1.0× – 1.25×` — amber (`#fbbf24`): approaching penalty territory; one more seven-out will cross 1.0
- `< 1.0×` — red (`#ef4444`): **PENALTY MODE** — payouts are being reduced; urgent warning

**IIFE pattern:** The ternary uses an IIFE (`(() => { ... })()`) to compute the color constants inline, avoiding a separate memoized value for a small component. If this pattern feels awkward in review, the color logic can be extracted to a `const` above the return.

---

## Mechanic Deep Dive: ORBITAL_DECAY

### Formula

On every seven-out during The Commander's fight:

```
nextHype = Math.max(hypeFloor, run.hype − decayAmount + cascadeHypeDelta)
```

| Variable | Source | Value |
|---|---|---|
| `run.hype` | Pre-roll hype from DB | varies |
| `decayAmount` | `ruleParams.decayAmount` | `0.5` |
| `hypeFloor` | `ruleParams.hypeFloor` | `0.5` |
| `cascadeHypeDelta` | `Math.max(0, finalCtx.hype − run.hype)` | crew gains only |

**Why `run.hype` not `finalCtx.hype`?** The base-game hype tick is 0 on SEVEN_OUT (no NATURAL / POINT_HIT / CRAPS_OUT tick). So `finalCtx.hype - run.hype` equals only crew cascade gains — there's no double-counting. The decay applies to the starting hype, and crew gains stack on top.

### Interaction with existing comps

| Comp | Interaction |
|---|---|
| Sea Legs (50% preserve) | **Bypassed during ORBITAL_DECAY.** The decay formula replaces the reset-to-baseline calculation entirely. This is intentional: the Commander removes momentum, not just resets it. |
| ZERO_POINT (1.25× floor) | **Applied after ORBITAL_DECAY** in `rollHandler`. If decay would produce < 1.25× and the player holds ZERO_POINT, hype is raised to 1.25×. Since ZERO_POINT is awarded for *beating* The Commander, it only activates on subsequent floors (8, 9). |
| Golden Touch (guaranteed first Natural) | No interaction — activates on come-out, not seven-out. |
| The Covenant (boss drain −50%) | No interaction — ORBITAL_DECAY does not drain bankroll, only hype. |
| Poseidon's Favor (no craps-out on first roll) | No interaction. |

### `bossPointHits` field behavior

`bossPointHits` is reused by TIDAL_SURGE as a per-roll tide counter. For ORBITAL_DECAY, this field is not semantically meaningful — the relevant state is `run.hype` itself.

The existing `nextBossCounter` fallthrough (`if (result === 'POINT_HIT' && isBossMarker(...)) return current + 1`) would increment `bossPointHits` on point hits during The Commander's fight. This is harmless — `bossPointHits` is not read for any ORBITAL_DECAY display or mechanic. The counter is emitted in `newBossPointHits` on the WebSocket payload and stored in the DB, but neither the client nor the server reads it back for ORBITAL_DECAY logic.

**Future cleanup (not required now):** Add `if (isOrbitalDecay) return 0;` to `nextBossCounter` for clarity. Deferred to avoid scope creep.

---

## Mechanic Deep Dive: ZERO_POINT Comp

### Implementation location

`rollHandler` in `rolls.ts`, immediately after `computeNextState`. Applied unconditionally to `nextState.hype`:

```typescript
const hasZeroPoint = (user.compPerkIds as number[]).includes(COMP_PERK_IDS.ZERO_POINT);
if (hasZeroPoint && nextState.hype < 1.25) {
  nextState.hype = 1.25;
}
```

### Scope

Fires after every roll result (NATURAL, CRAPS_OUT, POINT_SET, POINT_HIT, SEVEN_OUT, NO_RESOLUTION). On non-seven-out results, hype normally only increases — this guard is a no-op except on seven-outs where hype would otherwise reset to 1.0 or below.

### User-level persistence

`ZERO_POINT` is stored in `users.comp_perk_ids`, consistent with all other boss comp rewards. Once earned (by defeating The Commander, marker 20), it persists across all future runs. This makes Floor 8 and 9's seven-outs permanently less damaging for players who completed Floor 7.

---

## Definition of Done Checklist

1. `npm run typecheck` passes with zero errors
2. `npm run test` passes (shared unit tests)
3. `npm run build` passes for all workspaces
4. GAUNTLET now has 21 entries (markers 0–20); FLOORS has 7 entries
5. Floor 7 markers are reachable and display the correct theme (space-black felt, starlight silver accents)
6. The Observation Deck pub screen shows the correct name and palette
7. Entering marker 20 triggers the boss entry modal with The Commander's copy
8. During The Commander's fight, BossRoomHeader shows the hype decay display (right panel)
9. Seven-out during the fight reduces hype by 0.5, down to a floor of 0.5×
10. A seven-out that would reduce hype below 0.5 is clamped to 0.5
11. Hype below 1.0× correctly reduces payouts (no engine change needed — existing formula handles this)
12. Clearing marker 20 awards `ZERO_POINT` comp (compPerkId 7) to `users.comp_perk_ids`
13. In subsequent runs with ZERO_POINT, hype never goes below 1.25× after any seven-out
14. Sea Legs is correctly bypassed during ORBITAL_DECAY seven-outs
15. DB seed includes no changes (ORBITAL_DECAY has no new crew or boss-specific DB state)
16. The atmosphere `'cosmic'` is accepted by TypeScript without error

---

## Files Summary

| File | Change Type | Risk |
|---|---|---|
| `packages/shared/src/config.ts` | Additive — new types + 3 GAUNTLET entries | Low |
| `packages/shared/src/floors.ts` | Additive — new atmosphere type + FLOORS entry | Low |
| `packages/shared/src/bossRules/orbitalDecay.ts` | NEW — empty hooks object | None |
| `packages/shared/src/bossRules/index.ts` | Additive — register new hooks | Low |
| `apps/api/src/routes/rolls.ts` | Targeted — new `isOrbitalDecay` branch in SEVEN_OUT + post-processing | Medium |
| `apps/web/src/lib/floorThemes.ts` | Additive — new theme + clamp update | Low |
| `apps/web/src/components/BossRoomHeader.tsx` | Targeted — new display branch | Low |

**Total scope:** 7 files. 2 new files. No DB migrations. No schema changes. No new API routes.
