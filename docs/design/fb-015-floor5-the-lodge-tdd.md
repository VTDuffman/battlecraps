# Floor 5 — The Lodge: Technical Design Document

**Feature branch:** `feature/fb-015-the-lodge`  
**Source specs:** `docs/requirements/feature-backlog.md` §FB-015, `docs/requirements/floor-aesthetics.md` §Floor 5, `docs/frameworks/floors.md` §Floor 5  
**Definition of Done:** Engine config + Boss config + Boss rule hook + Floor theme + Tutorial copy updates

---

## 1. Overview

Floor 5 adds The Lodge (markers 12–14) to the gauntlet, extending the current 4-floor / 12-marker run to 5 floors / 15 markers. The boss is **The Hierophant** with the `TRIBUTE` mechanic: every seven-out seizes an additional 15% of the player's current bankroll on top of the normal bet losses.

The `TRIBUTE` rule requires a new hook (`modifySevenOut`) that has no precedent in the existing `BossRuleHooks` interface — all current hooks operate on bets (pre-roll), outcomes (pre-cascade), cascade order, or payout (post-settle on wins). TRIBUTE fires after a losing roll settles but before the state machine runs, so it is a structurally new extension point.

The comp reward `THE_COVENANT` halves all direct-bankroll-drain mechanics for the rest of the run, requiring `BossRuleState` to carry a `covenantActive` flag so hook files can apply it without reaching into `rolls.ts`.

---

## 2. Marker Configuration

From `docs/frameworks/floors.md` §Floor 5.

| Gauntlet Index | Target | Venue | Boss? |
|---|---|---|---|
| 12 | $20,000 | The Lodge | No |
| 13 | $30,000 | The Lodge | No |
| 14 | $45,000 | The Lodge — The Inner Sanctum | **Yes** |

**Progression check (cents):**
- Floor 4 boss cleared at $12,500; Floor 5 opens at $20,000 — a 1.6× step.
- Floor 5 markers are 1.5× / 2.4× / 3.6× of the Floor 4 boss target.
- This matches the tone of the floors.md note: "design estimates — balance during implementation."

---

## 3. New Boss Rule: `TRIBUTE`

### 3.1 Mechanic

Every `SEVEN_OUT` roll seizes `tributePct` (15%) of the player's bankroll **after** bets are lost. The tribute is taken from existing cash — it is not a reduction in payout — making it structurally different from `EXTORTION_FEE`.

**Example at $10,000 bankroll with $500 Pass Line on the table:**
1. Player seven-outs.  
2. Pass Line bet ($500) was deducted at POINT_SET. `betDelta = 0` (no new bets this roll). `payout = 0`. `newBankroll = $10,000`.
3. Tribute fires: `floor($10,000 × 0.15) = $1,500`. Rounded down to the nearest dollar (the order takes whole dollars).
4. `tributedBankroll = $10,000 − $1,500 = $8,500`.
5. State machine runs with `$8,500`.

**THE_COVENANT halving:**  
If the player holds the comp, `tributePct` is halved to 7.5%: tribute = `floor($10,000 × 0.075) = $750`. `tributedBankroll = $9,250`.

### 3.2 Rounding Convention

`Math.floor(bankroll * tributePct / 100) * 100` — rounds down to the nearest dollar. The order always takes whole dollar amounts. This is the mirror of `EXTORTION_FEE` (which uses `Math.round`) — the distinction is intentional: the order charges less but in clean increments.

### 3.3 Edge Cases

| Scenario | Behavior |
|---|---|
| Tribute reduces bankroll below `getMinBet()` | `isBelowMinBet` in `computeNextState` catches it → GAME_OVER |
| Tribute reduces bankroll to exactly 0 | GAME_OVER (bankroll = 0, can't meet min bet) |
| Seven-out on a come-out (no active point bets) | Tribute still fires — 15% of current bankroll |
| THE_COVENANT active | `tributePct * 0.5 = 0.075` applied |
| Shooter blocked by Lefty (`sevenOutBlocked`) | Hook still fires — the tribute is on the event type, not whether the shooter died. The 7 was rolled; the order collects. |

---

## 4. New Hook: `modifySevenOut`

### 4.1 Addition to `BossRuleHooks`

```typescript
// packages/shared/src/bossRules/types.ts

export interface BossRuleHooks {
  validateBet?(...): string | null;
  modifyOutcome?(...): TurnContext;
  modifyCascadeOrder?(...): number[];
  modifyPayout?(...): number;

  /**
   * Called after payout settlement when rollResult === 'SEVEN_OUT',
   * before the state machine runs computeNextState().
   * Receives the bankroll after bet losses have been applied.
   * Returns the (potentially reduced) bankroll in cents.
   *
   * Only fires when rollResult === 'SEVEN_OUT'. Hook implementations must
   * guard on params.rule.
   *
   * Used by: TRIBUTE — seizes tributePct of bankroll on every seven-out.
   */
  modifySevenOut?(
    bankrollAfterLoss: number,
    params: BossRuleParams,
    state: BossRuleState,
  ): number;
}
```

### 4.2 Addition to `BossRuleState`

```typescript
// packages/shared/src/bossRules/types.ts

export interface BossRuleState {
  bossPointHits: number;
  markerIndex:   number;
  /**
   * True when the player holds THE_COVENANT comp.
   * Injected by rolls.ts before calling any hook so hook files
   * can apply the 50% reduction without reaching into the API layer.
   */
  covenantActive: boolean;
}
```

---

## 5. New File: `tribute.ts`

```typescript
// packages/shared/src/bossRules/tribute.ts

import type { BossRuleHooks } from './types.js';

export const tributeHooks: BossRuleHooks = {
  modifySevenOut(bankrollAfterLoss, params, state) {
    if (params.rule !== 'TRIBUTE') return bankrollAfterLoss;
    const effectivePct = state.covenantActive ? params.tributePct * 0.5 : params.tributePct;
    const tribute = Math.floor(bankrollAfterLoss * effectivePct / 100) * 100;
    return bankrollAfterLoss - tribute;
  },
};
```

---

## 6. Changes to Existing Files

### 6.1 `packages/shared/src/config.ts`

**A — `BossRuleType`**: add `'TRIBUTE'`  
**B — `BossRuleParams`**: add union member `{ rule: 'TRIBUTE'; tributePct: number }`  
**C — `CompRewardType`**: add `'THE_COVENANT'`  
**D — `COMP_PERK_IDS`**: add `THE_COVENANT: 5`  
**E — `GAUNTLET`**: append 3 Floor 5 markers

Full BossConfig for The Hierophant:

```typescript
{
  targetCents: 4_500_000,  // $45,000 — BOSS: The Hierophant
  venue:       'The Lodge — The Inner Sanctum',
  floor:       5,
  isBoss:      true,
  boss: {
    // Identity
    name:  'The Hierophant',
    title: 'Keeper of the Rites',
    // Vibe
    dreadTagline:        'THE ORDER COLLECTS.',
    entryLines: [
      "You were vouched for. That person is no longer welcome.",
      "Three centuries of tradition have kept this table alive.",
      "The order always takes its tribute. Especially from seven-outs.",
    ],
    ruleBlurb:          "Every seven-out seizes 15% of your current bankroll as tribute — on top of your lost bets.",
    victoryQuote:       "…the rites acknowledge your offering. Leave before the observers decide otherwise.",
    defeatAnnouncement: 'RITES CONCLUDED',
    // Mechanic
    rule:           'TRIBUTE',
    ruleHeaderText: 'SEVEN-OUT SEIZES 15% OF BANKROLL AS TRIBUTE',
    ruleParams:     { rule: 'TRIBUTE', tributePct: 0.15 },
    // Comp
    compReward:      'THE_COVENANT',
    compPerkId:      COMP_PERK_IDS.THE_COVENANT,
    compName:        'THE COVENANT',
    compDescription: 'Direct bankroll drains from boss mechanics are permanently reduced by 50%.',
    compFanLabel:    'COVENANT',
    // Legacy
    flavorText: "Three centuries of tradition. You'll respect it, or you'll fund it.",
  },
},
```

### 6.2 `packages/shared/src/bossRules/index.ts`

Add import and registry entry:

```typescript
import { tributeHooks } from './tribute.js';

export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  EXTORTION_FEE:      extortionFeeHooks,
  RISING_MIN_BETS:    risingMinBetsHooks,
  DISABLE_CREW:       disableCrewHooks,
  FOURS_INSTANT_LOSS: foursInstantLossHooks,
  TRIBUTE:            tributeHooks,         // Floor 5
};
```

### 6.3 `packages/shared/src/floors.ts`

**A — `FloorAtmosphere`**: add `'occult'`

```typescript
export type FloorAtmosphere = 'exposed' | 'gritty' | 'elegant' | 'electric' | 'occult';
```

**B — `FLOORS`**: append Floor 5 entry

```typescript
{
  id:        5,
  name:      'The Lodge',
  tagline:   "You weren't supposed to know this place existed.",
  introLines: [
    'Marble columns. Candlelight. Hooded figures standing against the walls in silence, watching.',
    "The Hierophant has kept this table running for three centuries. You're here because someone vouched for you. That person is no longer welcome.",
    'The order always collects. Win or lose, something is owed.',
  ],
  bossName:   'The Hierophant',
  bossTitle:  'Keeper of the Rites',
  bossVenue:  'The Lodge — The Inner Sanctum',
  bossTeaser: 'The order always collects. Win or lose, something is owed.',
  atmosphere: 'occult',
},
```

### 6.4 `apps/web/src/lib/floorThemes.ts`

**A — New constant `FLOOR_5_THEME`**  

Token values from `docs/requirements/floor-aesthetics.md` §Floor 5.

```typescript
const FLOOR_5_THEME: FloorTheme = {
  // Felt — aged black marble (not pure black; has warmth)
  feltPrimary: '#0f0b14',
  feltRail:    '#070509',
  feltTexture: feltTextureUri('#0f0b14', '#070509', '#1c1524'),

  // Accents — candleflame amber / ancient gold wax
  accentBright:  '#c9943a',
  accentPrimary: '#9a6f22',
  accentDim:     '#4a3510',

  // Borders — very muted (the room is understated)
  borderHigh: 'rgba(154,111,34,0.25)',
  borderLow:  'rgba(154,111,34,0.15)',

  // Breathing — stone void → candleflame → ritual crimson
  breatheCold: 'rgba(10,5,20,0.25)',
  breatheWarm: 'rgba(180,100,20,0.20)',
  breatheHot:  'rgba(140,20,50,0.28)',

  // Screen flash — candlelight bloom / cardinal blackout
  flashWin:  'rgba(200,140,40,0.30)',
  flashLose: 'rgba(80,10,25,0.60)',

  // Pub — The Anteroom
  pubName:         'THE ANTEROOM',
  pubBg:           'radial-gradient(ellipse at 50% 20%, #1a0a08 0%, #0a0506 45%, #020202 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #6a0a1a 30%, #c9943a 50%, #6a0a1a 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 0%, rgba(180,80,10,0.05) 0%, transparent 70%)',
  pubTitleColor:   '#c9943a',
  pubTitleShadow:  '0 0 20px #9a6f22, 0 0 40px #4a3510',
  pubSubtextColor: 'rgba(180,130,50,0.50)',

  // Boss — The Inner Sanctum (The Hierophant)
  bossBg:          'radial-gradient(ellipse at 50% 35%, #1a0408 0%, #0a0204 60%, #000000 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #4a0a14 30%, #7a1a2e 50%, #4a0a14 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(120,20,40,0.08) 0%, transparent 65%)',
  bossTextColor:   '#c9943a',
  bossTitleShadow: '0 0 30px rgba(201,148,58,0.50), 0 0 80px rgba(90,40,10,0.35)',
  bossBorderColor: 'rgba(90,20,35,0.45)',
  bossStarColor:   '#c9943a',
  bossStarBg:      'rgba(74,10,20,0.40)',
  bossStarBorder:  '2px solid rgba(122,26,46,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(122,26,46,0.20)',
};
```

**B — Extend `THEMES` array**

```typescript
const THEMES: FloorTheme[] = [
  FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME, FLOOR_4_THEME, FLOOR_5_THEME,
];
```

**C — Extend clamps in `getFloorTheme` and `getFloorIndex`**

```typescript
// Before:  Math.max(0, Math.min(3, Math.floor(markerIndex / 3)))
// After:   Math.max(0, Math.min(4, Math.floor(markerIndex / 3)))
```

Both functions need this change. The upper bound must grow by 1 for each new floor added.

### 6.5 `apps/api/src/routes/rolls.ts`

**A — `bossState` construction**: add `covenantActive`

```typescript
// Before:
const bossState: BossRuleState = {
  bossPointHits: run.bossPointHits,
  markerIndex:   run.currentMarkerIndex,
};

// After:
const hasTheCovenant = (user.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_COVENANT);
const bossState: BossRuleState = {
  bossPointHits:  run.bossPointHits,
  markerIndex:    run.currentMarkerIndex,
  covenantActive: hasTheCovenant,
};
```

`hasTheCovenant` must be declared before the `bossState` object, alongside the other comp checks (`hasOldPro`, `hasTheVig`, `hasSeaLegs`).

**B — `modifySevenOut` call** (insert after the existing `modifyPayout` block, before `computeNextState`)

```typescript
// After:
const newBankroll   = run.bankrollCents - betDelta + payout;
const bankrollDelta = newBankroll - run.bankrollCents;

// New block:
const tributedBankroll =
  finalContext.rollResult === 'SEVEN_OUT' && bossHooks?.modifySevenOut
    ? bossHooks.modifySevenOut(newBankroll, bossParams!, bossState)
    : newBankroll;

const tributeAmount = newBankroll - tributedBankroll;
const effectiveBankrollDelta = tributedBankroll - run.bankrollCents;
```

**C — Pass `tributedBankroll` to `computeNextState`**

```typescript
// Before:
const nextState = computeNextState(run, viggedContext, newBankroll, incomingBets, hasSeaLegs);

// After:
const nextState = computeNextState(run, viggedContext, tributedBankroll, incomingBets, hasSeaLegs);
```

**D — Update `bankrollDelta` and receipt throughout**

Replace uses of `newBankroll` and `bankrollDelta` in the WebSocket payload and HTTP response with `tributedBankroll` and `effectiveBankrollDelta`:

```typescript
// WS payload:
bankrollDelta:   effectiveBankrollDelta,
newBankroll:     persistedRun.bankrollCents,   // ← already correct (reads from persisted row)

// Receipt (add tribute to bossDeduction alongside EXTORTION_FEE):
const bossDeductionAmount = (rawPayout - payout) + tributeAmount;
```

> **Note:** `persistedRun.bankrollCents` is set from `nextState.bankrollCents` which already uses `tributedBankroll` via `computeNextState`, so the DB write and WS `newBankroll` are automatically correct. The only explicit changes are `bankrollDelta` in the response body and the receipt attribution.

**E — Import `COMP_PERK_IDS.THE_COVENANT`**  
`COMP_PERK_IDS` is already imported from `@battlecraps/shared`. After adding `THE_COVENANT: 5` to the const in `config.ts`, it is immediately available.

---

## 7. Tutorial Copy Updates

The tutorial currently says **"4 floors, 12 markers"** (updated in the Loading Dock PR). Adding Floor 5 requires updating to **"5 floors, 15 markers"**, and the boss roster copy needs The Hierophant added.

Affected files: `apps/web/src/lib/tutorialBeats.ts` (beats 8, 10, and/or 13 per the Loading Dock commit).

Search term to locate: `"4 floors"` and `"12 markers"` and `"The Foreman"` (boss roster line).

Exact replacement depends on the current string content — do a targeted grep before editing rather than assuming line numbers.

---

## 8. Feature Backlog Update

In `docs/requirements/feature-backlog.md` §FB-015, the Floor Progression Tracker row for Floor 1 reads:

```
| **1** | The Loading Dock | 🟡 Designed | 🔴 Pending | ...
```

It should already read `🟢 Implemented` — this was shipped in the Loading Dock branch. If it still shows Pending, fix it. Also add a new row for Floor 5:

```
| **5** | The Lodge | 🟢 Designed | 🟢 Implemented | Boss: The Hierophant / Rule: TRIBUTE
```

---

## 9. File Change Table

| File | Change | New / Modified |
|---|---|---|
| `packages/shared/src/config.ts` | Add `TRIBUTE` to `BossRuleType`; add `{ rule: 'TRIBUTE'; tributePct }` to `BossRuleParams`; add `THE_COVENANT` to `CompRewardType` + `COMP_PERK_IDS`; extend `GAUNTLET` with 3 Floor 5 markers | Modified |
| `packages/shared/src/bossRules/types.ts` | Add `modifySevenOut` hook to `BossRuleHooks`; add `covenantActive: boolean` to `BossRuleState` | Modified |
| `packages/shared/src/bossRules/tribute.ts` | TRIBUTE hook — implements `modifySevenOut` | **New** |
| `packages/shared/src/bossRules/index.ts` | Import and register `tributeHooks` | Modified |
| `packages/shared/src/floors.ts` | Add `'occult'` to `FloorAtmosphere`; append Floor 5 `FloorConfig` to `FLOORS` | Modified |
| `apps/web/src/lib/floorThemes.ts` | Add `FLOOR_5_THEME`; append to `THEMES`; extend both clamps to `[0, 4]` | Modified |
| `apps/api/src/routes/rolls.ts` | Inject `covenantActive` into `bossState`; call `modifySevenOut` on SEVEN_OUT; thread `tributedBankroll` through delta + receipt | Modified |
| `apps/web/src/lib/tutorialBeats.ts` | Update "4 floors, 12 markers" → "5 floors, 15 markers"; add The Hierophant to boss roster beat | Modified |
| `docs/requirements/feature-backlog.md` | Update Floor 5 tracker row to Implemented | Modified |

**No other files need changing.** All transition phase components (`FloorRevealPhase`, `BossEntryPhase`, `BossVictoryPhase`, `BossVictoryCompPhase`, `BossRoomHeader`, `MarkerIntroPhase`) read exclusively from `GAUNTLET` and `FLOORS` at runtime. No hardcoded floor counts, boss names, or comp labels exist in any phase component.

---

## 10. TypeScript Validation Checkpoints

Run after each sub-step before moving to the next:

```bash
npm run typecheck      # full workspace — catches cross-package import errors
npm run build          # confirms shared compiles before API and web pick it up
```

The critical path for type errors:
1. Adding `'TRIBUTE'` to `BossRuleType` makes `BOSS_RULE_HOOKS` stale → **must** add the registry entry in the same commit.
2. Adding `covenantActive` to `BossRuleState` (non-optional, no default) breaks existing `bossState` construction in `rolls.ts` → must update `rolls.ts` in the same commit.
3. Adding `'occult'` to `FloorAtmosphere` is purely additive — no breakage.
4. Extending `THEMES` array length — `getFloorTheme` uses `THEMES[floor]!` with a non-null assertion; extending the clamp first prevents out-of-bounds access.

**Recommended commit ordering:**
1. `shared` package changes (types, config, floors, new tribute.ts, index.ts registry) — typecheck passes.
2. `floorThemes.ts` changes — typecheck passes.
3. `rolls.ts` changes — typecheck passes.
4. Tutorial copy + backlog doc update.

---

## 11. What Is Explicitly Not Changing

- `BossRoomHeader.tsx` — The TRIBUTE rule has no live counter (it's a flat percentage). The `ruleHeaderText` string displays correctly via the existing text-only path. The `currentMinBet !== null` block simply won't render (TRIBUTE has no `risingMinBets`).
- `CompCardFan.tsx` — reads `compName`, `compDescription`, `compFanLabel` from `BossConfig`; these are set in `config.ts`. No component changes needed.
- `TransitionOrchestrator.tsx`, `App.tsx` — zero changes. All phases are data-driven.
- DB schema / seed — Floor 5 is a config-level addition. No new DB columns, no migration, no seed changes.
- Any crew file — Floor 5 does not introduce new crew or change existing ones.
