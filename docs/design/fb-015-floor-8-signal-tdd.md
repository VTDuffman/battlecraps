# Floor 8 — The Signal: Technical Design Document

**Feature:** FB-015 (Expanded Gauntlet — Floor 8)
**Status:** Design — pending implementation
**Floor:** 8 (markers 21–23)
**Boss:** The Emissary
**Rule:** `FIRST_CONTACT_PROTOCOL`
**Comp:** `THE_FREQUENCY`

---

## Overview

Floor 8 adds three new gauntlet markers ($1,000,000 / $1,750,000 / $2,500,000) and introduces the `FIRST_CONTACT_PROTOCOL` boss mechanic: during The Emissary's fight, come-out rolls of 7 or 11 (normally NATURAL — a free win) are silently converted to blank rolls. No payout. No hype tick. No pass line resolution. The shooter stays in come-out and rolls again. The only path to bankroll progress is establishing and then hitting points.

The comp reward — `THE_FREQUENCY` — partially re-translates the concept: for the rest of the run, any come-out Natural (outside the boss fight, or in later floors) awards a flat bonus equal to 3% of the current marker target, on top of the normal payout.

This is architecturally more complex than Floors 5–7 because it introduces a **new TurnContextFlags member** and requires careful pipeline ordering to prevent a hype tick from firing before the outcome is suppressed.

---

## Architecture Context

| System | File | Change |
|---|---|---|
| Mechanical | `packages/shared/src/config.ts` | New types, params, GAUNTLET entries |
| Game types | `packages/shared/src/types.ts` | `naturalBlocked?: boolean` flag |
| Narrative | `packages/shared/src/floors.ts` | New atmosphere type, FLOORS entry |
| Boss rule (shared) | `packages/shared/src/bossRules/firstContactProtocol.ts` | NEW empty hooks file |
| Boss rule registry | `packages/shared/src/bossRules/index.ts` | Register `firstContactProtocolHooks` |
| Visual | `apps/web/src/lib/floorThemes.ts` | `FLOOR_8_THEME` + registry update |
| Game engine | `apps/api/src/routes/rolls.ts` | FCP inline suppression, THE_FREQUENCY comp, WS payload flag |
| Boss UI | `apps/web/src/components/BossRoomHeader.tsx` | FCP display branch |

**No DB migrations required.** `THE_FREQUENCY` (comp perk ID 8) is stored as a JSONB integer in `users.comp_perk_ids`, consistent with all other boss comps.

---

## 1. `packages/shared/src/config.ts`

### 1a. `BossRuleType` — add `'FIRST_CONTACT_PROTOCOL'`

```typescript
export type BossRuleType =
  | 'EXTORTION_FEE'
  | 'RISING_MIN_BETS'
  | 'DISABLE_CREW'
  | 'FOURS_INSTANT_LOSS'
  | 'TRIBUTE'
  | 'TIDAL_SURGE'
  | 'ORBITAL_DECAY'
  | 'FIRST_CONTACT_PROTOCOL';   // ← new
```

### 1b. `CompRewardType` — add `'THE_FREQUENCY'`

```typescript
export type CompRewardType =
  | 'THE_VIG'
  | 'EXTRA_SHOOTER'
  | 'HYPE_RESET_HALF'
  | 'GOLDEN_TOUCH'
  | 'THE_COVENANT'
  | 'POSEIDONS_FAVOR'
  | 'ZERO_POINT'
  | 'THE_FREQUENCY';   // ← new
```

### 1c. `BossRuleParams` — add FIRST_CONTACT_PROTOCOL union member

```typescript
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';           taxPct: number }
  | { rule: 'RISING_MIN_BETS';         startPct: number; incrementPct: number; capPct: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS';      triggerTotal: number }
  | { rule: 'TRIBUTE';                 tributePct: number }
  | { rule: 'TIDAL_SURGE';             cycleLength: number; surgeDuration: number; surgePct: number }
  | { rule: 'ORBITAL_DECAY';           decayAmount: number; hypeFloor: number }
  | { rule: 'FIRST_CONTACT_PROTOCOL' };  // ← new — no parameters, binary toggle
```

The rule has no tunable parameters. It either is or isn't active based on which marker the player is on.

### 1d. `COMP_PERK_IDS` — add `THE_FREQUENCY`

```typescript
export const COMP_PERK_IDS = {
  THE_VIG:                4,
  MEMBER_JACKET:          1,
  SEA_LEGS:               2,
  GOLDEN_TOUCH:           3,
  THE_COVENANT:           5,
  POSEIDONS_FAVOR:        6,
  ZERO_POINT:             7,
  THE_FREQUENCY:          8,   // ← new
} as const;
```

### 1e. `GAUNTLET` — append Floor 8 entries (indices 21–23)

Append after the Floor 7 block:

```typescript
// ── Floor 8: The Signal ───────────────────────────────────────────────────

{
  targetCents: 100_000_000,   // $1,000,000
  venue:       'The Signal',
  floor:       8,
  isBoss:      false,
},
{
  targetCents: 175_000_000,   // $1,750,000
  venue:       'The Signal',
  floor:       8,
  isBoss:      false,
},
{
  targetCents: 250_000_000,   // $2,500,000 — BOSS: The Emissary
  venue:       'The Signal — The Receiving Chamber',
  floor:       8,
  isBoss:      true,
  boss: {
    // Identity
    name:  'The Emissary',
    title: 'First Point of Contact',
    // Vibe
    dreadTagline:        'WE SHOULD NOT HAVE ANSWERED.',
    entryLines: [
      "The table is here. The felt, the chips, the dice. All correct.",
      "The geometry of the room is not correct. The light arrives from the wrong direction.",
      "It studied the game for eleven years. It could not translate one concept. That concept is the natural.",
    ],
    ruleBlurb:          "Come-out 7s and 11s are blank rolls. No payout. No hype. No resolution. The Emissary has no concept of a free win.",
    victoryQuote:       "[The entity pauses for 0.3 seconds. This is the equivalent of applause.]",
    defeatAnnouncement: 'SIGNAL LOST',
    // Mechanic
    rule:           'FIRST_CONTACT_PROTOCOL',
    ruleHeaderText: 'COME-OUT 7 / 11 IS A NULL EVENT — NO WIN, NO HYPE',
    ruleParams:     { rule: 'FIRST_CONTACT_PROTOCOL' },
    // Comp
    compReward:      'THE_FREQUENCY',
    compPerkId:      COMP_PERK_IDS.THE_FREQUENCY,
    compName:        'THE FREQUENCY',
    compDescription: 'Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run.',
    compFanLabel:    'FREQ.',
    // Legacy
    flavorText: "[Untranslatable. The entity gestures toward the table.]",
  },
},
```

Also update the comment block above `GAUNTLET` to document Floor 8:
```typescript
//   Floor 8 — The Signal:            $1,000,000 / $1,750,000 / $2,500,000
```

And update the gauntlet count in the comment from 21 to 24 markers across 8 floors.

---

## 2. `packages/shared/src/types.ts`

### 2a. `TurnContextFlags` — add `naturalBlocked`

```typescript
export interface TurnContextFlags {
  sevenOutBlocked: boolean;
  passLineProtected: boolean;
  instantLoss: boolean;
  nudgedFrom?: [number, number];
  crapsOutBlocked?: boolean;
  naturalBlocked?: boolean;   // ← new
}
```

**What it signals:** Set when `FIRST_CONTACT_PROTOCOL` converts a COME_OUT NATURAL to NO_RESOLUTION. Tells `computeNextState` to return the run to `IDLE_TABLE` / `COME_OUT` (not `POINT_ACTIVE`) and tells the client to suppress the NATURAL win animation and stay in the come-out UI state.

**Why it's needed:** The `NO_RESOLUTION` branch in `computeNextState` normally returns `POINT_ACTIVE` (it was designed for mid-point blank rolls). A COME_OUT blocked natural needs fundamentally different post-roll state: same phase (COME_OUT), same status (IDLE_TABLE), passLine stays on table, no point is set. Without this flag, `computeNextState` cannot distinguish a blocked-natural NO_RESOLUTION from a mid-point NO_RESOLUTION.

---

## 3. `packages/shared/src/floors.ts`

### 3a. `FloorAtmosphere` — add `'alien'`

```typescript
export type FloorAtmosphere =
  | 'exposed'
  | 'gritty'
  | 'elegant'
  | 'electric'
  | 'occult'
  | 'ancient'
  | 'cosmic'
  | 'alien';   // ← new — Floor 8: beautiful wrongness, organised by a non-human intelligence
```

### 3b. `FLOORS` — append Floor 8 entry

```typescript
// ── Floor 8: The Signal ───────────────────────────────────────────────────
// Void black, electric acid green, deep magenta. The table is correct.
// The room is not. The Emissary reconstructed the game from a transmission —
// faithfully, except for one concept it could not translate.
{
  id:        8,
  name:      'The Signal',
  tagline:   "We received it. We shouldn't have answered.",
  introLines: [
    'The table is here. The felt, the chips, the dice — all correct. The geometry of the room is not correct. The light arrives from the wrong direction.',
    'The Emissary studied the transmission for eleven years. It reconstructed the game faithfully, except for one concept it could not translate.',
    'That concept is the natural. Here, sevens on come-out mean nothing. You earn every dollar the hard way.',
  ],
  bossName:   'The Emissary',
  bossTitle:  'First Point of Contact',
  bossVenue:  'The Signal — The Receiving Chamber',
  bossTeaser: 'The Emissary studied the game for eleven years. It misunderstood one rule. That rule is the one that matters.',
  atmosphere: 'alien',
},
```

### 3c. `getFloorByMarkerIndex` docstring update

Add Floor 8 example:
```
*   getFloorByMarkerIndex(21) → Floor 8 (The Signal)
```

---

## 4. `packages/shared/src/bossRules/firstContactProtocol.ts` (NEW FILE)

```typescript
// =============================================================================
// BATTLECRAPS — FIRST_CONTACT_PROTOCOL BOSS RULE HOOKS
// packages/shared/src/bossRules/firstContactProtocol.ts
//
// Floor 8 — The Emissary (The Signal — The Receiving Chamber)
// Mechanic: During this boss fight, come-out rolls of 7 or 11 (normally a
// NATURAL — immediate win, pass line pays, hype ticks +0.10) are converted to
// NO_RESOLUTION blank rolls. No payout. No hype tick. The shooter stays in
// come-out with their original pass line bet still on the table.
//
// Implementation note: The conversion is applied inline in rollHandler()
// (apps/api/src/routes/rolls.ts), BEFORE the base-game hype tick (step 7b),
// so that the +0.10 NATURAL tick is never seeded. This is a deliberate
// pipeline-ordering constraint — placing the conversion after the hype tick
// (like POSEIDONS_FAVOR's position) would incorrectly award momentum for a
// roll the Emissary treated as meaningless.
//
// The naturalBlocked flag (TurnContextFlags) propagates through the cascade
// and into computeNextState, which uses it to return IDLE_TABLE / COME_OUT
// instead of the default POINT_ACTIVE return from the NO_RESOLUTION branch.
//
// No BossRuleHooks interface methods are needed here.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const firstContactProtocolHooks: BossRuleHooks = {};
```

---

## 5. `packages/shared/src/bossRules/index.ts`

Add the import and registry entry:

```typescript
import { firstContactProtocolHooks } from './firstContactProtocol.js';   // ← new

export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  EXTORTION_FEE:           extortionFeeHooks,
  RISING_MIN_BETS:         risingMinBetsHooks,
  DISABLE_CREW:            disableCrewHooks,
  FOURS_INSTANT_LOSS:      foursInstantLossHooks,
  TRIBUTE:                 tributeHooks,
  TIDAL_SURGE:             tidalSurgeHooks,
  ORBITAL_DECAY:           orbitalDecayHooks,
  FIRST_CONTACT_PROTOCOL:  firstContactProtocolHooks,   // ← new
};
```

---

## 6. `apps/api/src/routes/rolls.ts`

Three changes: FCP inline conversion in `rollHandler`, THE_FREQUENCY post-processing in `rollHandler`, and FCP handling in `computeNextState`.

### 6a. Pipeline position of the FCP conversion

The current `rollHandler` pipeline (abbreviated):

```
7a.  resolveRoll()           → initialCtx          (rollResult may be NATURAL)
7b.  baseHypeTick            → seededCtx            (+0.10 tick if NATURAL)
7c.  bossHooks.modifyOutcome → outcomeCtx
7e.  POSEIDONS_FAVOR check   → poseidonCtx
8.   resolveCascade()        → finalContext
```

The FCP conversion **must go between 7a and 7b** — before the hype tick. If placed after 7b (like POSEIDONS_FAVOR), the +0.10 NATURAL hype tick would be seeded before the conversion erases the result. That would give the player momentum for a roll that was supposed to mean nothing.

**Implementation:** After `resolveRoll()` and before the `baseHypeTick` calculation, insert:

```typescript
// ── 7a-b. FIRST_CONTACT_PROTOCOL — suppress COME_OUT naturals ───────────────
// Applied BEFORE the hype tick so the +0.10 NATURAL momentum bonus never fires
// for a blocked natural. The naturalBlocked flag propagates through cascade and
// is read by computeNextState to return IDLE_TABLE/COME_OUT instead of POINT_ACTIVE.
const activeBossRule = GAUNTLET[run.currentMarkerIndex]?.boss?.rule ?? null;
const isFirstContact = activeBossRule === 'FIRST_CONTACT_PROTOCOL'
  && isBossMarker(run.currentMarkerIndex);

const initialCtxFcp = (
  isFirstContact &&
  run.phase === 'COME_OUT' &&
  initialCtx.rollResult === 'NATURAL'
) ? {
  ...initialCtx,
  rollResult: 'NO_RESOLUTION' as const,
  flags: { ...initialCtx.flags, naturalBlocked: true },
} : initialCtx;
```

Then replace all subsequent references to `initialCtx` (in the hype tick step and beyond) with `initialCtxFcp`:

```typescript
// ── 7b. Base-game Hype tick ────────────────────────────────────────────────
const baseHypeTick =
  initialCtxFcp.rollResult === 'POINT_HIT'   ?  0.25
  : initialCtxFcp.rollResult === 'NATURAL'   ?  0.10
  : initialCtxFcp.rollResult === 'CRAPS_OUT' ? -0.05
  : 0;
const seededHype = Math.max(
  1.0,
  Math.round((initialCtxFcp.hype + baseHypeTick) * 10_000) / 10_000,
);
const seededCtx = baseHypeTick !== 0
  ? { ...initialCtxFcp, hype: seededHype }
  : initialCtxFcp;
```

For a blocked natural: `initialCtxFcp.rollResult === 'NO_RESOLUTION'`, so `baseHypeTick = 0`, `seededCtx = initialCtxFcp`. No hype added. Correct.

**Import check:** `isBossMarker` is already imported from `@battlecraps/shared`. `BossRuleParams` is already imported. No new imports needed.

### 6b. `WsTurnSettledPayload` — add `naturalBlocked`

Add the optional field to the interface:

```typescript
interface WsTurnSettledPayload {
  // ... (existing fields unchanged) ...
  crapsOutBlocked?: boolean;
  naturalBlocked?: boolean;   // ← new: FCP suppressed a COME_OUT natural
}
```

In the payload construction block (the `settledPayload` object), add:

```typescript
...(finalContext.flags.naturalBlocked && { naturalBlocked: true }),
```

The client uses this flag to skip any NATURAL win animation and display a "NULL EVENT" indicator instead of celebrating.

### 6c. `rollHandler` — THE_FREQUENCY comp post-processing

After the `tributedBankroll` computation and before `bankrollDelta`, insert:

```typescript
// ── 9c. THE_FREQUENCY comp — bonus on come-out naturals ──────────────────
// Awards a flat cash bonus (3% of marker target, rounded to nearest $1) on
// any real NATURAL during COME_OUT. "Real" means: not blocked by FCP
// (finalContext.rollResult would be NO_RESOLUTION for blocked naturals).
// Applied BEFORE computeNextState so that if the bonus pushes bankroll over
// the marker target, the marker-clear logic fires correctly.
const hasTheFrequency = (user.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_FREQUENCY);
const frequencyBonus = (
  hasTheFrequency &&
  finalContext.rollResult === 'NATURAL' &&
  run.phase === 'COME_OUT'
) ? Math.round(GAUNTLET[run.currentMarkerIndex]!.targetCents * 0.03 / 100) * 100
  : 0;
const postFrequencyBankroll = tributedBankroll + frequencyBonus;
```

Then replace every reference to `tributedBankroll` that feeds game state with `postFrequencyBankroll`:

```typescript
const bankrollDelta = postFrequencyBankroll - run.bankrollCents;

// ...
const hasSeaLegs = ...;
const nextState = computeNextState(run, viggedContext, postFrequencyBankroll, incomingBets, hasSeaLegs);

// ... ZERO_POINT guard uses nextState.hype (unchanged) ...

// DB persist:
bankrollCents: nextState.bankrollCents,  // already uses postFrequencyBankroll internally

// Personal-best update:
.set({ maxBankrollCents: postFrequencyBankroll })
.where(and(eq(users.id, userId), lt(users.maxBankrollCents, postFrequencyBankroll)))
```

**Why before `computeNextState`:** `computeNextState`'s NATURAL branch checks `newBankroll >= markerTarget` to determine if this roll cleared a marker. If the frequency bonus is applied first, that check is performed against the fully settled bankroll — consistent with how the TRIBUTE drain works (applied before `computeNextState` via `tributedBankroll`).

**THE_FREQUENCY and FCP non-interference:** During The Emissary's fight, any blocked natural has `finalContext.rollResult === 'NO_RESOLUTION'`, not `'NATURAL'`. The `THE_FREQUENCY` check is `finalContext.rollResult === 'NATURAL'`, so it simply does not fire. After the player defeats The Emissary and holds `THE_FREQUENCY`, they proceed to Floor 9 where there is no FCP boss — naturals are genuine and THE_FREQUENCY fires normally. The two systems never collide.

### 6d. `computeNextState` — naturalBlocked branch in NO_RESOLUTION

In the `case 'NO_RESOLUTION':` block, add an early return at the top, before the existing marker-check logic:

```typescript
case 'NO_RESOLUTION': {
  // ── FIRST_CONTACT_PROTOCOL: blocked COME_OUT natural ────────────────
  // Return the shooter to come-out (IDLE_TABLE) with their passLine bet
  // still on the table. The blocked natural consumed a roll but resolved
  // nothing — no point was set, no payout occurred, same phase continues.
  if (flags.naturalBlocked) {
    return {
      status:               isBelowMinBet(newBankroll, clearedBets, currentMarkerIndex)
                              ? 'GAME_OVER'
                              : 'IDLE_TABLE',
      phase:                'COME_OUT',
      bankrollCents:        newBankroll,
      shooters:             run.shooters,
      currentPoint:         null,
      hype:                 finalCtx.hype,
      bets:                 clearedBets,
      currentMarkerIndex,
      consecutivePointHits: run.consecutivePointHits,
      bossPointHits:        nextBossCounter(run.bossPointHits, rollResult, false),
      previousRollTotal:    finalCtx.diceTotal,
      shooterRollCount:     run.shooterRollCount + 1,
      pointPhaseBlankStreak: 0,
    };
  }

  // ... existing NO_RESOLUTION logic (hardway marker check etc.) unchanged ...
}
```

**`clearedBets` on a blocked natural:** The passLine bet was placed when the player rolled. `betDelta = incomingBets.passLine - 0` (come-out starts with empty bets). `newBankroll = run.bankrollCents - betDelta`. `clearedBets = finalCtx.resolvedBets` — for NO_RESOLUTION, the passLine stays on the table (it was not resolved). The next roll starts with `run.bets.passLine = incomingBets.passLine`, so `betDelta = 0`. The player's chip stays on the felt across the blocked roll. Correct behavior.

**`isBelowMinBet` check:** If the player placed their last chip as a passLine bet and the roll is blocked, `newBankroll = 0` but `sumBets(clearedBets) = passLine > 0`, so `isBelowMinBet` returns false (chips are still on the table). The player can still win those chips back. This is the right call.

---

## 7. `apps/web/src/lib/floorThemes.ts`

### 7a. Add `FLOOR_8_THEME`

Insert after `FLOOR_7_THEME`:

```typescript
// =============================================================================
// Floor 8 — The Signal (The Receiving Chamber)
// =============================================================================
// Void black felt — not space black, just void. Electric acid green
// bioluminescence. Deep magenta dimensional seam. Organised wrongness.
// The architecture tiles in patterns that shouldn't resolve.

const FLOOR_8_THEME: FloorTheme = {
  // Felt — void black (no tint, no undertone — pure absence)
  feltPrimary: '#020108',
  feltRail:    '#010106',
  feltTexture: feltTextureUri('#020108', '#010106', '#060210'),

  // Accents — electric acid green
  accentBright:  '#39ff14',
  accentPrimary: '#20cc00',
  accentDim:     '#0a5500',

  // Borders — acid green at very low opacity (space is empty; this is worse)
  borderHigh: 'rgba(32,204,0,0.28)',
  borderLow:  'rgba(32,204,0,0.18)',

  // Breathing — dim alien static / bioluminescent surge / dimensional bleed
  breatheCold: 'rgba(0,60,10,0.20)',
  breatheWarm: 'rgba(40,200,20,0.15)',
  breatheHot:  'rgba(180,10,200,0.25)',

  // Screen flash — alien green surge / deep magenta void
  flashWin:  'rgba(40,255,20,0.40)',
  flashLose: 'rgba(160,0,200,0.60)',

  // Pub — The Interface
  pubName:         'THE INTERFACE',
  pubBg:           'radial-gradient(ellipse at 50% 50%, #050210 0%, #020108 50%, #000000 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #0a5500 30%, #39ff14 50%, #0a5500 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 50%, rgba(40,255,20,0.03) 0%, transparent 70%)',
  pubTitleColor:   '#39ff14',
  pubTitleShadow:  '0 0 20px #20cc00, 0 0 40px #0a5500',
  pubSubtextColor: 'rgba(57,255,20,0.45)',

  // Boss — The Receiving Chamber (The Emissary)
  bossBg:          'radial-gradient(ellipse at 50% 40%, #081004 0%, #030806 55%, #000000 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #0a5500 30%, #20cc00 50%, #0a5500 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(40,200,20,0.07) 0%, transparent 65%)',
  bossTextColor:   '#39ff14',
  bossTitleShadow: '0 0 30px rgba(57,255,20,0.45), 0 0 80px rgba(192,38,211,0.20)',
  bossBorderColor: 'rgba(32,204,0,0.35)',
  bossStarColor:   '#39ff14',
  bossStarBg:      'rgba(10,85,0,0.40)',
  bossStarBorder:  '2px solid rgba(57,255,20,0.45)',
  bossStarGlow:    '0 0 20px 4px rgba(32,204,0,0.20)',
};
```

**Color source:** Exact values from `docs/requirements/floor-aesthetics.md` § Floor 8 palette. The magenta secondary (`#c026d3`) surfaces in `bossTitleShadow` and `flashLose` to signal dimensional wrongness on seven-outs.

### 7b. `THEMES` array — append Floor 8

```typescript
const THEMES: FloorTheme[] = [
  FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME,
  FLOOR_4_THEME, FLOOR_5_THEME, FLOOR_6_THEME,
  FLOOR_7_THEME, FLOOR_8_THEME,   // ← new
];
```

### 7c. `getFloorTheme` and `getFloorIndex` — update clamp to `[0, 7]`

```typescript
// Both functions: Math.min(6, ...) → Math.min(7, ...)
const floor = Math.max(0, Math.min(7, Math.floor(markerIndex / 3)));
```

---

## 8. `apps/web/src/components/BossRoomHeader.tsx`

### 8a. Detect FIRST_CONTACT_PROTOCOL

Alongside existing boss rule detections:

```typescript
const isTidalSurge          = boss.rule === 'TIDAL_SURGE';
const isOrbitalDecay        = boss.rule === 'ORBITAL_DECAY';
const isFirstContact        = boss.rule === 'FIRST_CONTACT_PROTOCOL';   // ← new
```

### 8b. Right panel — add FIRST_CONTACT_PROTOCOL branch

In the right-panel ternary, insert between `isOrbitalDecay` and `currentMinBet !== null`:

```tsx
) : isFirstContact ? (
  <div className="flex-none text-right">
    <div className="font-pixel text-[5px] tracking-widest leading-none"
      style={{ color: 'rgba(57,255,20,0.60)' }}>
      NULL PROTOCOL
    </div>
    <div className="font-pixel text-[8px] leading-tight"
      style={{ color: '#39ff14' }}>
      7/11 = NULL
    </div>
    <div className="font-pixel text-[5px] leading-none mt-0.5"
      style={{ color: 'rgba(57,255,20,0.45)' }}>
      POINTS ONLY
    </div>
  </div>
) : currentMinBet !== null ? (
```

**Design rationale:** The Emissary's room has no visible counter (unlike TIDAL_SURGE's tide pips or ORBITAL_DECAY's live hype readout) — its mechanic is binary and permanent. A static indicator suffices. The alien green matches the Floor 8 theme. "7/11 = NULL" communicates the rule in four characters. "POINTS ONLY" gives the strategic directive.

---

## Mechanic Deep Dive: FIRST_CONTACT_PROTOCOL

### Pipeline position

```
resolveRoll()
  ↓ rollResult = 'NATURAL'

[FCP conversion — must be HERE, before hype tick]
  rollResult → 'NO_RESOLUTION'
  flags.naturalBlocked = true

baseHypeTick calculation
  → 0 (rollResult is NO_RESOLUTION, no NATURAL branch)

seededCtx = initialCtxFcp (hype unchanged)

bossHooks.modifyOutcome
  → no FCP hook, passes through

POSEIDONS_FAVOR check
  → rollResult is already NO_RESOLUTION (not CRAPS_OUT), no effect

resolveCascade()
  → flags.naturalBlocked propagates through cascade unchanged
  → crew whose trigger is 'NATURAL' do not fire (rollResult is NO_RESOLUTION)

settleTurn()
  → returns 0 (no payout for NO_RESOLUTION)

computeNextState() / NO_RESOLUTION case
  → flags.naturalBlocked → early return: IDLE_TABLE, COME_OUT, passLine preserved
```

### State after a blocked natural

| Field | Value | Reason |
|---|---|---|
| `status` | `IDLE_TABLE` | Shooter stays at the come-out table |
| `phase` | `COME_OUT` | No point was set |
| `currentPoint` | `null` | No point set |
| `bankrollCents` | `run.bankrollCents - betDelta` | PassLine was deducted (bet was placed) |
| `bets.passLine` | unchanged (stays on table) | `clearedBets` preserves it via NO_RESOLUTION path |
| `hype` | unchanged | `finalCtx.hype` (no tick, no crew hype change) |
| `shooterRollCount` | `+1` | A real roll happened |
| `bossPointHits` | unchanged | `nextBossCounter` returns `current` for non-POINT_HIT |

### Crew interactions

Crew whose trigger conditions check `rollResult` directly will not fire because `rollResult` is `NO_RESOLUTION` at the time of the cascade. This includes:
- Any crew that triggers on `'NATURAL'` — they never see it
- Any crew that triggers on `'COME_OUT'` (like The Doorman) — this checks `rollResult !== 'SEVEN_OUT'` and the phase, so Doorman **would** still fire since the phase is still COME_OUT and the roll is not a SEVEN_OUT

The Doorman special case is intentional and acceptable: Doorman adds a bonus on any come-out action. The Emissary's rule says naturals mean nothing; it doesn't strip the player's crew bonuses entirely. If this is considered a design exploit, a future adjustment could add a `naturalBlocked` check in Doorman's `execute()`. Defer this to playtesting.

### What does NOT change

- Come-out CRAPS_OUTs (2/3/12) remain real CRAPS_OUTs. Loss, hype tick −0.05. The Emissary only misunderstood the concept of a free win — it correctly understands losing.
- Come-out POINT_SETs remain normal. The entire point mechanic is the only path forward.
- POSEIDONS_FAVOR (blocks craps-outs on first roll) is unaffected — it operates on a different trigger condition.
- GOLDEN_TOUCH (guaranteed Natural on first come-out) activates normally — it produces a NATURAL result. But because FCP is active, that NATURAL is then immediately suppressed to NO_RESOLUTION. The player's first roll produces a 7/11 but earns nothing. A trap the experienced player will recognize.
- Sea Legs (50% hype preserve on seven-out) is unaffected — SEVEN_OUT branch unchanged during FCP.
- `bossPointHits` increments on POINT_HIT during the fight (default `nextBossCounter` behavior). This is harmless — it's not read for FCP display or logic.

---

## Mechanic Deep Dive: THE_FREQUENCY Comp

### Activation condition

```typescript
hasTheFrequency AND finalContext.rollResult === 'NATURAL' AND run.phase === 'COME_OUT'
```

### Bonus formula

```typescript
frequencyBonus = Math.round(GAUNTLET[run.currentMarkerIndex]!.targetCents * 0.03 / 100) * 100
```

`Math.round(x / 100) * 100` rounds to the nearest $1.

**Examples:**
| Floor | Marker | Target | Bonus (3%) |
|---|---|---|---|
| Floor 9 | Marker 24 | $4,000,000 | $120,000 |
| Floor 9 | Marker 25 | $7,000,000 | $210,000 |
| Floor 9 | Marker 26 | $10,000,000 | $300,000 |

(THE_FREQUENCY is earned at marker 23. It first activates at marker 24.)

### Bypass of hype amplification

The frequency bonus is added directly to the bankroll **after** `settleTurn()` and `tributedBankroll`. It is not routed through `ctx.additives` and is not amplified by hype or crew multipliers. The comp description says "flat bonus" — this is intentional. At the stakes of Floor 9, a $120k–$300k flat bonus per natural is already significant without amplification.

### Marker-clear correctness

`postFrequencyBankroll` is passed to `computeNextState` as `newBankroll`. The NATURAL case checks `newBankroll >= markerTarget`. If the bonus pushes the player over the target, `computeNextState` returns TRANSITION correctly. This is the same pattern as TRIBUTE (which modifies bankroll pre-`computeNextState` via `tributedBankroll`).

---

## Interaction Summary

| Component | Effect of FCP | Effect of THE_FREQUENCY |
|---|---|---|
| NATURAL + COME_OUT | Suppressed to NO_RESOLUTION; no payout, no hype | N/A during FCP (result is NO_RESOLUTION); fires normally post-boss |
| CRAPS_OUT | Unchanged | Not triggered (only fires on NATURAL) |
| POINT_SET | Unchanged | Not triggered |
| POINT_HIT | Unchanged | Not triggered |
| SEVEN_OUT | Unchanged | Not triggered |
| Sea Legs comp | Unaffected | Unaffected |
| ORBITAL_DECAY hype | Unaffected | Unaffected |
| ZERO_POINT comp | Unaffected | Unaffected |
| GOLDEN_TOUCH comp | First natural is produced then suppressed | Bonus fires if GOLDEN_TOUCH natural survives (post-boss only) |
| POSEIDONS_FAVOR | Operates on CRAPS_OUT; no conflict | No conflict |
| THE_COVENANT (boss drain −50%) | FIRST_CONTACT_PROTOCOL does not drain bankroll; THE_COVENANT irrelevant | No interaction |

---

## Definition of Done Checklist

1. `npm run typecheck` passes with zero errors across all workspaces
2. `npm run test` passes (shared unit tests)
3. `npm run build` passes for all workspaces
4. GAUNTLET now has 24 entries (markers 0–23); FLOORS has 8 entries
5. Floor 8 markers are reachable and display the correct theme (void-black felt, acid green accents)
6. The Interface pub screen shows the correct name and acid-green palette
7. Entering marker 23 triggers the boss entry modal with The Emissary's copy
8. During The Emissary's fight, BossRoomHeader right panel shows "NULL PROTOCOL / 7/11 = NULL / POINTS ONLY"
9. A come-out roll of 7 or 11 during the fight produces NO_RESOLUTION (no payout, no hype tick, passLine stays on table)
10. The shooter stays in COME_OUT / IDLE_TABLE state after a blocked natural
11. A come-out roll of 7 or 11 outside a boss fight (or post-boss) behaves normally
12. A come-out CRAPS_OUT (2/3/12) during the fight still loses the passLine normally
13. A come-out POINT_SET during the fight still sets the point and transitions to POINT_ACTIVE
14. Clearing marker 23 awards `THE_FREQUENCY` comp (compPerkId 8) to `users.comp_perk_ids`
15. In runs with THE_FREQUENCY, each come-out NATURAL awards the 3% flat bonus on top of the normal NATURAL payout
16. THE_FREQUENCY bonus is correctly included in bankrollDelta for the turn:settled WebSocket payload
17. The `naturalBlocked: true` flag is present in the turn:settled payload for suppressed naturals
18. `naturalBlocked` is absent from the payload for all other roll results
19. The atmosphere `'alien'` is accepted by TypeScript without error
20. DB seed requires no changes (no new crew or boss-specific DB tables)

---

## Files Summary

| File | Change Type | Risk |
|---|---|---|
| `packages/shared/src/config.ts` | Additive — new types + 3 GAUNTLET entries | Low |
| `packages/shared/src/types.ts` | Additive — one new optional flag | Low |
| `packages/shared/src/floors.ts` | Additive — new atmosphere type + FLOORS entry | Low |
| `packages/shared/src/bossRules/firstContactProtocol.ts` | NEW — empty hooks object + documentation comment | None |
| `packages/shared/src/bossRules/index.ts` | Additive — register new hooks | Low |
| `apps/web/src/lib/floorThemes.ts` | Additive — new theme + clamp update | Low |
| `apps/api/src/routes/rolls.ts` | Targeted — 3 changes; pipeline ordering is critical | Medium |
| `apps/web/src/components/BossRoomHeader.tsx` | Additive — new display branch | Low |

**Total scope:** 8 files. 1 new file (+ this TDD). No DB migrations. No schema changes. No new API routes.

**Highest-risk change:** The FCP conversion in `rollHandler` must be applied before `baseHypeTick`. Verify the diff carefully — inserting it after `seededCtx` is constructed is the most common mistake.
