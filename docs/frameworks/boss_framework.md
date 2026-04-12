# BattleCraps Boss Framework — Reference

> Canonical reference for boss design. All vibe copy, mechanic parameters, and comp data live in `packages/shared/src/config.ts` — this document explains the architecture and serves as the design record for adding new bosses.

---

## Overview

Bosses appear at every 3rd marker in the gauntlet (0-based indices 2, 5, 8 — the final marker of each floor). A boss fight is a normal craps session with one additional mechanical modifier active for its entire duration. The modifier is defined by the boss's `rule` field and enforced server-side via the boss rule hook architecture.

There are three bosses in the current gauntlet:

| Index | Floor | Target | Boss | Rule |
|---|---|---|---|---|
| 2 | 1 — VFW Hall | $1,000 | Sarge | `RISING_MIN_BETS` |
| 5 | 2 — Riverboat | $4,000 | Mme. Le Prix | `DISABLE_CREW` |
| 8 | 3 — The Strip | $12,500 | The Executive | `FOURS_INSTANT_LOSS` |

---

## Data Shape — `BossConfig`

Every boss is fully described by a `BossConfig` object stored in `GAUNTLET[i].boss` in `packages/shared/src/config.ts`. No boss data lives anywhere else — UI components read directly from this config.

```
BossConfig
├── Identity
│   ├── name            "Sarge"
│   └── title           "The Pit Boss"
│
├── Vibe copy
│   ├── dreadTagline    1–3 word bark on the dread screen
│   ├── entryLines      2–3 lines of boss dialogue
│   ├── ruleBlurb       One sentence explaining the mechanic
│   ├── victoryQuote    What the boss says when defeated
│   └── defeatAnnouncement  Header on the victory screen
│
├── Mechanic
│   ├── rule            BossRuleType — which hook fires
│   ├── ruleHeaderText  Short persistent text in BossRoomHeader during fight
│   └── ruleParams      Discriminated union — typed params for the hook
│
└── Comp
    ├── compReward       CompRewardType enum
    ├── compPerkId       Numeric ID written to users.comp_perk_ids on defeat
    ├── compName         "MEMBER'S JACKET"
    ├── compDescription  One-sentence description of the comp effect
    └── compFanLabel     Short label on the CompCardFan victory card
```

---

## Boss Rule Hook Architecture

Boss rules mirror the crew `execute()` pattern. Each rule type has its own hook file implementing the `BossRuleHooks` interface. The registry in `packages/shared/src/bossRules/index.ts` maps every `BossRuleType` to its implementation.

### Hook interface (`bossRules/types.ts`)

```typescript
export interface BossRuleHooks {
  // Called pre-roll. Return an error string to reject the bet, or null to allow.
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null;

  // Called post-classifyRoll, pre-cascade. Returns a (possibly modified) TurnContext.
  modifyOutcome?(ctx: TurnContext, params: BossRuleParams, state: BossRuleState): TurnContext;

  // Called at the start of resolveCascade(). Returns the ordered list of slot indices
  // to execute. Return [] to skip the entire crew loop.
  modifyCascadeOrder?(slotCount: number, params: BossRuleParams): number[];
}

export interface BossRuleState {
  bossPointHits: number;   // point hits scored so far this boss segment
  markerIndex:   number;   // 0-based index into GAUNTLET
}
```

### Hook files

| File | Rule | Hook(s) used | Behavior |
|---|---|---|---|
| `bossRules/risingMinBets.ts` | `RISING_MIN_BETS` | `validateBet` | Rejects if passLine < dynamic minimum |
| `bossRules/disableCrew.ts` | `DISABLE_CREW` | `modifyCascadeOrder` | Returns `[]` — no crew slots fire |
| `bossRules/foursInstantLoss.ts` | `FOURS_INSTANT_LOSS` | `modifyOutcome` | Sets `ctx.flags.instantLoss = true` when diceTotal === triggerTotal |

### Server execution order (`apps/api/src/routes/rolls.ts`)

```
1. Validate incoming bets        →  bossHooks.validateBet()
2. RNG + classifyRoll()          →  pure function, no boss involvement
3. Apply boss outcome modifier   →  bossHooks.modifyOutcome()
4. Check ctx.flags.instantLoss   →  early exit to GAME_OVER if true
5. resolveCascade()              →  bossHooks.modifyCascadeOrder() called internally
6. settleTurn()                  →  pure function, no boss involvement
7. Persist + emit WebSocket      →  no boss involvement
```

---

## The Three Bosses

### Sarge — Floor 1

**Rule:** `RISING_MIN_BETS`

The minimum Pass Line bet starts at 5% of the $1,000 marker target ($50) and rises by $20 (2%) after every Point Hit. It never drops back down — Seven Out holds the pressure. The cap is $200 (20%).

| Event | Effect on min bet |
|---|---|
| Point Hit | +$20 (rises) |
| Seven Out | No change (holds) |
| Marker clear | Resets to $50 |

**Mechanic parameters:**

```typescript
ruleParams: { rule: 'RISING_MIN_BETS', startPct: 0.05, incrementPct: 0.02, capPct: 0.20 }
```

**Comp:** Member's Jacket — +1 Shooter this segment on boss defeat.

---

### Mme. Le Prix — Floor 2

**Rule:** `DISABLE_CREW`

The entire crew cascade is suppressed for the duration of the fight. Crew portraits remain visible but produce no events, no barks, and no cooldown ticks. Players must reach $4,000 on pure craps mechanics alone.

**Implementation note:** `modifyCascadeOrder` returns `[]`. The `for (const i of slotOrder)` loop in `resolveCascade()` simply never executes. This is the simplest and most legible implementation — a reversal-order variant (crew fires 4→0) was considered but rejected: it would be mechanically meaningful only when Mimic or slot-order-dependent crew are active, and is nearly invisible to most players. If a future boss requires partial or reversed cascade, that variant can be introduced as a new `BossRuleType` without touching any existing hook files.

**Comp:** Sea Legs — On Seven Out, Hype resets to 50% instead of 1.0×.

---

### The Executive — Floor 3

**Rule:** `FOURS_INSTANT_LOSS`

Rolling a dice total of 4 — combinations [1,3], [3,1], [2,2] — ends the entire run immediately regardless of bankroll, remaining shooters, or roll phase. This is 3/36 ≈ 8.3% per roll.

**Implementation note:** `modifyOutcome` sets `ctx.flags.instantLoss = true`. The server checks this flag after `modifyOutcome` returns and before the cascade fires. An early-exit path persists the `GAME_OVER` status and emits the final WebSocket event without settling bets. The `triggerTotal` field is configurable so a future boss could curse a different number without needing a new rule type.

**Comp:** Golden Touch — First come-out roll each segment is guaranteed a Natural (7 or 11).

---

## `BossRuleParams` Discriminated Union

```typescript
export type BossRuleParams =
  | { rule: 'RISING_MIN_BETS';    startPct: number; incrementPct: number; capPct: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS'; triggerTotal: number };
```

TypeScript narrows the type inside each hook file via `if (params.rule !== 'RISING_MIN_BETS') return null`. This prevents cross-boss param access bugs (e.g. accidentally reading Sarge's `startPct` when the active boss is The Executive).

---

## Adding a New Boss

1. **Add a union member to `BossRuleParams`** in `packages/shared/src/config.ts`
2. **Create a hook file** in `packages/shared/src/bossRules/` implementing `BossRuleHooks`
3. **Register it** in `packages/shared/src/bossRules/index.ts` — nothing else in `packages/shared` needs to change
4. **Add or extend a `MarkerConfig`** in `GAUNTLET` with `isBoss: true` and a full `BossConfig` object
5. **Add a `CompRewardType`** and `COMP_PERK_IDS` entry if the new boss awards a new comp type
6. **Server:** enforce the new hook via the existing hook-call chain in `rolls.ts` — no structural changes needed
7. **UI:** no changes needed — all boss screens read from `BossConfig` fields

---

## Verification Checklist

| Scenario | Expected |
|---|---|
| Sarge fight, 0 point hits | Min bet $50; `validateBet` rejects passLine < 5000 |
| Sarge fight, 1 point hit | Min bet $70; holds if next roll is Seven Out |
| Sarge fight, capped | Min bet $200; no further increase |
| Mme. Le Prix fight | No crew events in roll log; no barks; cooldowns unchanged |
| Executive fight, diceTotal = 4 | `ctx.flags.instantLoss = true`; run transitions to GAME_OVER |
| Executive fight, diceTotal ≠ 4 | Normal resolution |
| All boss entry screens | `dreadTagline`, `entryLines`, `ruleBlurb` from config; no hardcoded strings |
| All boss victory screens | `defeatAnnouncement`, `victoryQuote`, `compName`, `compDescription` from config |
| `npm run typecheck` | Zero errors |
