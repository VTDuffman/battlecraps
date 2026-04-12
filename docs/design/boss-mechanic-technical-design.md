# Boss Mechanic — Technical Design
**Feature:** FB-010
**Status:** Pending implementation
**Area:** `packages/shared/`, `apps/api/src/routes/rolls.ts`, `apps/web/src/transitions/phases/`, `apps/web/src/components/BossRoomHeader.tsx`

---

## Overview

The current boss implementation is a partial skeleton. `BossConfig` holds a name, a `BossRuleType` string, flavor text, and comp info — but almost all vibe content (rule descriptions, entry dialogue, comp names, defeat announcements) is scattered as hardcoded strings across four UI component files. Two of the three boss rules (`DISABLE_CREW`, `FOURS_INSTANT_LOSS`) exist as type stubs only — no enforcement logic. There is no single authoritative document defining what a boss is, what they say, or how their mechanic works.

This design establishes a complete, extensible boss framework: a canonical data shape, full vibe content for all three bosses, boss rule hook architecture mirroring the crew `execute()` pattern, UI components that read entirely from config, and a living reference document at `docs/frameworks/boss_framework.md`.

---

## Part 1 — Extended `BossConfig` Type

**File:** `packages/shared/src/config.ts`

### Current shape (7 fields)

```typescript
interface BossConfig {
  name, rule, compReward, compPerkId, flavorText, risingMinBets?
}
```

### Proposed shape (18 fields)

```typescript
export interface BossConfig {
  // ── Identity ─────────────────────────────────────────────
  name:  string;   // "Sarge"
  title: string;   // "The Pit Boss" — subtitle under name on dread screen

  // ── Vibe copy ─────────────────────────────────────────────
  dreadTagline:        string;                                          // 1–3 word bark on dread screen
  entryLines:          [string, string] | [string, string, string];    // 2–3 lines of boss dialogue
  ruleBlurb:           string;                                         // One sentence explaining the mechanic
  victoryQuote:        string;                                         // What boss says on defeat
  defeatAnnouncement:  string;                                         // Header on victory screen

  // ── Mechanic ──────────────────────────────────────────────
  rule:           BossRuleType;
  ruleHeaderText: string;        // Short persistent text in BossRoomHeader
  ruleParams:     BossRuleParams; // Discriminated union — see below

  // ── Comp ──────────────────────────────────────────────────
  compReward:      CompRewardType;
  compPerkId:      number;
  compName:        string;        // "MEMBER'S JACKET"
  compDescription: string;        // "+1 SHOOTER this segment..."
  compFanLabel:    string;        // Short label for CompCardFan card

  // ── Legacy ────────────────────────────────────────────────
  flavorText: string;  // Retained during migration; maps to ruleBlurb
}
```

### `BossRuleParams` discriminated union

Replaces the loose `risingMinBets?` optional field. TypeScript narrows the type inside each hook file, preventing bugs where Sarge's `startPct` is accessed on The Executive's config.

```typescript
export type BossRuleParams =
  | { rule: 'RISING_MIN_BETS';    startPct: number; incrementPct: number; capPct: number; }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS'; triggerTotal: number; };
  // New bosses: add a new union member here + one hook file — nothing else required
```

---

## Part 2 — Boss Rule Hook Architecture

**Directory:** `packages/shared/src/bossRules/`

Mirrors the `packages/shared/src/crew/` pattern. Each rule gets its own file implementing a typed hook interface. New boss rule = new file + new union variant.

### Hook interface (`bossRules/types.ts`)

```typescript
export interface BossRuleHooks {
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null;
  modifyOutcome?(ctx: TurnContext, params: BossRuleParams, state: BossRuleState): TurnContext;
  modifyCascadeOrder?(slotCount: number, params: BossRuleParams): number[];
}

export interface BossRuleState {
  bossPointHits: number;
  markerIndex:   number;
}
```

### Three rule hook files

| File | Rule | Key behavior |
|---|---|---|
| `bossRules/risingMinBets.ts` | `RISING_MIN_BETS` | `validateBet` rejects if passLine < minBet; refactors current inline logic from rolls.ts |
| `bossRules/disableCrew.ts` | `DISABLE_CREW` | `modifyCascadeOrder` returns `[]` → cascade loop fires no slots |
| `bossRules/foursInstantLoss.ts` | `FOURS_INSTANT_LOSS` | `modifyOutcome` sets `ctx.flags.instantLoss = true` when diceTotal === triggerTotal |

### Registry (`bossRules/index.ts`)

```typescript
export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  RISING_MIN_BETS:    risingMinBetsHooks,
  DISABLE_CREW:       disableCrewHooks,
  FOURS_INSTANT_LOSS: foursInstantLossHooks,
};
```

---

## Part 3 — Full Boss Data

### Sarge — Floor 1, marker index 2, $1,000 target

```typescript
name: 'Sarge',               title: 'The Pit Boss',
dreadTagline: 'FALL IN.',
entryLines: [
  "You want to shoot in MY hall?",
  "Every point you hit, the price goes up.",
  "And it never comes back down.",
],
ruleBlurb:          "Minimum Pass Line bet rises with every Point Hit — and holds on Seven Out.",
victoryQuote:       "…not bad, soldier. Dismissed.",
defeatAnnouncement: 'ENEMY NEUTRALIZED',
ruleHeaderText:     'ANTE RISES ON POINT HIT — MIN BET HOLDS ON 7-OUT',
ruleParams:         { rule: 'RISING_MIN_BETS', startPct: 0.05, incrementPct: 0.02, capPct: 0.20 },
compName:           "MEMBER'S JACKET",
compDescription:    "+1 SHOOTER this segment — they know you earned your seat.",
compFanLabel:       'JACKET',
```

**Mechanic notes:**
- Min bet starts at 5% of $1,000 target = $50
- Rises by $20 per Point Hit (2% × $1,000)
- Caps at $200 (20% × $1,000)
- Holds (does not reset) on Seven Out
- Resets to 0 on marker clear

### Mme. Le Prix — Floor 2, marker index 5, $4,000 target

```typescript
name: 'Mme. Le Prix',        title: 'Madame of the Salon Privé',
dreadTagline: 'HOW CHARMING.',
entryLines: [
  "Fresh money. How delightful.",
  "On my table, your little friends stay quiet.",
  "Let's see how well you play without them.",
],
ruleBlurb:          "No crew fires in the Salon Privé. You're on your own.",
victoryQuote:       "…improbable. You may keep your winnings.",
defeatAnnouncement: 'TABLE CLOSED',
ruleHeaderText:     'CREW IS SILENCED — CASCADE DOES NOT FIRE',
ruleParams:         { rule: 'DISABLE_CREW' },
compName:           'SEA LEGS',
compDescription:    "On Seven Out, Hype resets to 50% instead of 1.0×.",
compFanLabel:       'SEA LEGS',
```

**Mechanic notes:**
- `modifyCascadeOrder` returns `[]` — crew portraits visible but no cascade events fire
- No crew barks appear in the roll log
- Crew cooldowns do not tick (loop never executes)

### The Executive — Floor 3, marker index 8, $12,500 target

```typescript
name: 'The Executive',       title: 'CFO, High Limit Division',
dreadTagline: 'YOUR MEETING IS SCHEDULED.',
entryLines: [
  "Sit down. We've been expecting you.",
  "One rule. Roll a four — you're finished.",
  "The house has reviewed your file.",
],
ruleBlurb:          "Roll a total of 4 and your run ends immediately. No exceptions.",
victoryQuote:       "…restructuring was inevitable. Well played.",
defeatAnnouncement: 'EXECUTIVE OVERRIDE',
ruleHeaderText:     'ROLLING A 4 IS INSTANT BUST',
ruleParams:         { rule: 'FOURS_INSTANT_LOSS', triggerTotal: 4 },
compName:           'GOLDEN TOUCH',
compDescription:    "Your first come-out roll each segment is guaranteed a Natural.",
compFanLabel:       'GOLDEN',
```

**Mechanic notes:**
- Triggers on diceTotal === 4 regardless of phase (come-out or point-active)
- Affected combinations: [1,3], [3,1], [2,2] — 3/36 = 8.3% per roll
- `triggerTotal` is a param so a future boss can use a different cursed number
- `modifyOutcome` sets `ctx.flags.instantLoss = true` → server routes to GAME_OVER

---

## Part 4 — `instantLoss` Flag

**File:** `packages/shared/src/types.ts`

Add to `TurnContextFlags`:

```typescript
/**
 * Set by FOURS_INSTANT_LOSS boss rule hook when the dice total equals the
 * boss's triggerTotal. The server checks this after cascade completes and
 * transitions the run directly to GAME_OVER regardless of bankroll or shooters.
 */
instantLoss: boolean;
```

---

## Part 5 — Cascade Hook Point

**File:** `packages/shared/src/cascade.ts`

Add `modifyCascadeOrder` call before the crew loop in `resolveCascade()`:

```typescript
// Boss rule: DISABLE_CREW returns [], skipping the entire loop.
// All other rules return [0,1,2,3,4] (normal execution order).
const slotOrder = bossHooks?.modifyCascadeOrder?.(crewSlots.length, bossParams)
  ?? Array.from({ length: crewSlots.length }, (_, i) => i);

for (const i of slotOrder) {
  // ... existing loop body ...
}
```

`resolveCascade` gains two optional parameters: `bossHooks?: BossRuleHooks` and `bossParams?: BossRuleParams`.

---

## Part 6 — Server Enforcement

**File:** `apps/api/src/routes/rolls.ts`

### Before roll — bet validation hook

```typescript
// Replace the inline getBossMinBet() block with the hook:
const bossHooks = isBossMarker(run.currentMarkerIndex)
  ? BOSS_RULE_HOOKS[boss.rule]
  : undefined;

if (bossHooks?.validateBet) {
  const err = bossHooks.validateBet(incomingBets, boss.ruleParams, {
    bossPointHits: run.bossPointHits,
    markerIndex:   run.currentMarkerIndex,
  });
  if (err !== null) return reply.status(422).send({ error: err });
}
```

### After classifyRoll() — outcome modification hook

```typescript
let ctxAfterBossRule = seededCtx;
if (bossHooks?.modifyOutcome) {
  ctxAfterBossRule = bossHooks.modifyOutcome(seededCtx, boss.ruleParams, {
    bossPointHits: run.bossPointHits,
    markerIndex:   run.currentMarkerIndex,
  });
}

// Check instantLoss before cascade
if (ctxAfterBossRule.flags.instantLoss) {
  // persist GAME_OVER immediately, skip cascade + settlement
  // ... (early return path)
}
```

### Cascade invocation — pass boss hooks

```typescript
const cascadeResult = resolveCascade(crewSlots, ctxAfterBossRule, rollDice, bossHooks, boss?.ruleParams);
```

---

## Part 7 — UI Component Updates

Each component currently hardcodes strings that should come from `BossConfig`. After this change, the config is the single source of truth.

| Component | Currently hardcodes | After: reads from boss config |
|---|---|---|
| `BossEntryDreadPhase.tsx` | Boss name only | `boss.name`, `boss.title`, `boss.dreadTagline` |
| `BossEntryPhase.tsx` | `boss.flavorText` | `boss.entryLines`, `boss.ruleBlurb` |
| `BossVictoryPhase.tsx` | "ENEMY NEUTRALIZED" literal | `boss.defeatAnnouncement`, `boss.victoryQuote` |
| `BossVictoryCompPhase.tsx` | `REWARD_LABELS` + `REWARD_SUBTEXTS` local records | `boss.compName`, `boss.compDescription` |
| `BossRoomHeader.tsx` | Three rule-switch strings | `boss.ruleHeaderText` |

`REWARD_LABELS` and `REWARD_SUBTEXTS` in `BossVictoryCompPhase.tsx` and `BossVictoryModal.tsx` are deleted once data lives in config.

---

## Implementation Order

1. `docs/frameworks/boss_framework.md` — write reference doc (no code risk)
2. `packages/shared/src/config.ts` — extend `BossConfig`, add `BossRuleParams`, fill all three boss objects
3. `packages/shared/src/bossRules/` — hook files + index registry
4. `packages/shared/src/types.ts` — add `instantLoss` flag to `TurnContextFlags`
5. `packages/shared/src/cascade.ts` — add `modifyCascadeOrder` hook point
6. `apps/api/src/routes/rolls.ts` — replace inline logic with hook calls; enforce DISABLE_CREW + FOURS_INSTANT_LOSS
7. UI components (5 files) — strip hardcoded strings, read from boss config
8. `CLAUDE.md` + `feature-backlog.md` — update status

---

## Files to Create / Modify

| File | Action |
|---|---|
| `docs/frameworks/boss_framework.md` | Create |
| `packages/shared/src/config.ts` | Extend BossConfig + BossRuleParams + fill boss data |
| `packages/shared/src/bossRules/types.ts` | Create |
| `packages/shared/src/bossRules/risingMinBets.ts` | Create (refactor from inline) |
| `packages/shared/src/bossRules/disableCrew.ts` | Create (new enforcement) |
| `packages/shared/src/bossRules/foursInstantLoss.ts` | Create (new enforcement) |
| `packages/shared/src/bossRules/index.ts` | Create (registry) |
| `packages/shared/src/types.ts` | Add `instantLoss` to `TurnContextFlags` |
| `packages/shared/src/cascade.ts` | Add `modifyCascadeOrder` hook point |
| `apps/api/src/routes/rolls.ts` | Replace inline boss logic with hook calls |
| `apps/web/src/transitions/phases/BossEntryDreadPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossEntryPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossVictoryPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossVictoryCompPhase.tsx` | Read from config, delete REWARD_LABELS |
| `apps/web/src/components/BossRoomHeader.tsx` | Read `ruleHeaderText` from config |
| `CLAUDE.md` | Update architecture + current state |
| `docs/requirements/feature-backlog.md` | Add FB-010 |

---

## Key Design Decisions

**DISABLE_CREW: full suppression over reverse cascade**
Reverse cascade is mechanically interesting but nearly invisible to players — only matters when Mimic or slot-order-dependent crew are active. Full suppression is felt on every roll, tells a clear story ("she silenced your help"), and is simpler to implement. The reverse-order option is documented in `docs/frameworks/boss_framework.md` as a future variant.

**FOURS_INSTANT_LOSS: keep as-is**
3/36 rolls (8.3%) carry the risk — meaningful but not oppressive. `triggerTotal` is configurable so a future boss can use a different cursed number without a new rule type.

**`BossRuleParams` as discriminated union**
TypeScript narrows the type inside each hook file, preventing bugs where Sarge's `startPct` is accessed on The Executive's config. Identical reasoning to why crew each have their own `execute()` implementation rather than a shared switch.

**`flavorText` retained during migration**
Keeps the one existing consumer (`BossEntryPhase`) working while the new fields are being wired up. Removed once all UI components read from `entryLines`/`ruleBlurb`.

---

## Verification

1. **Sarge fight**: Min bet starts at $50, rises to $70 on first point hit, holds on seven-out. BossRoomHeader shows correct ruleHeaderText from config.
2. **Mme. Le Prix fight**: Crew portraits visible but no cascade events fire. No crew barks in the roll log.
3. **Executive fight**: Rolling [1,3] or [2,2] triggers GAME_OVER immediately. Roll log shows the cursed roll.
4. **All boss entry screens**: dreadTagline, entryLines, ruleBlurb all display correctly with no hardcoded fallbacks.
5. **All boss victory screens**: defeatAnnouncement, victoryQuote, compName, compDescription display correctly.
6. **Typecheck**: `npm run typecheck` passes with zero errors after all changes.
