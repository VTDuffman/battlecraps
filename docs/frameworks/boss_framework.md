# BattleCraps Boss Framework — Reference

> Canonical reference for boss design. All vibe copy, mechanic parameters, and comp data live in `packages/shared/src/config.ts` — this document explains the architecture and serves as the design record for adding new bosses.

---

## Overview

Bosses appear at every 3rd marker in the gauntlet (0-based indices 2, 5, 8, 11, …, 26 — the final marker of each floor). A boss fight is a normal craps session with one additional mechanical modifier active for its entire duration. The modifier is defined by the boss's `rule` field and enforced server-side via the boss rule hook architecture.

There are nine bosses across the 9-floor gauntlet:

| Index | Floor | Target | Boss | Rule |
|---|---|---|---|---|
| 2  | 1 — The Loading Dock | $200 | The Foreman | `EXTORTION_FEE` |
| 5  | 2 — VFW Hall | $1,000 | Sarge | `RISING_MIN_BETS` |
| 8  | 3 — Riverboat | $4,000 | Mme. Le Prix | `DISABLE_CREW` |
| 11 | 4 — The Strip | $15,000 | The Executive | `FOURS_INSTANT_LOSS` |
| 14 | 5 — The Lodge | $100,000 | The Hierophant | `TRIBUTE` |
| 17 | 6 — Atlantis | $500,000 | The Sovereign | `TIDAL_SURGE` |
| 20 | 7 — The Station | $3,000,000 | The Commander | `ORBITAL_DECAY` |
| 23 | 8 — The Signal | $15,000,000 | The Emissary | `FIRST_CONTACT_PROTOCOL` |
| 26 | 9 — The Null Space | $60,000,000 | The Architect | `CONVERGENCE` |

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
  // The optional `state` arg lets CONVERGENCE read bossPointHits without coupling to TurnContext.
  modifyCascadeOrder?(slotCount: number, params: BossRuleParams, state?: BossRuleState): number[];

  // Called after settleTurn() returns the raw payout, before bankroll credit.
  // Return the (possibly reduced) payout in cents. Only fires on winning rolls.
  modifyPayout?(
    payoutCents: number,
    baseStakeReturned: number,
    params: BossRuleParams,
    state: BossRuleState,
  ): number;

  // Called after bet-loss bankroll deduction on a SEVEN_OUT, before computeNextState.
  // Return the (possibly further reduced) bankroll in cents.
  modifySevenOut?(
    bankrollAfterLoss: number,
    params: BossRuleParams,
    state: BossRuleState,
  ): number;
}

export interface BossRuleState {
  bossPointHits:  number;   // point hits scored so far (or seven-out count for CONVERGENCE)
  markerIndex:    number;   // 0-based index into GAUNTLET
  covenantActive: boolean;  // true if player holds THE_COVENANT comp (halves TRIBUTE drain)
}
```

### Hook files

| File | Rule | Hook(s) used | Behavior |
|---|---|---|---|
| `bossRules/extortionFee.ts` | `EXTORTION_FEE` | `modifyPayout` | Deducts `floor(profit × taxPct)` from winning payouts |
| `bossRules/risingMinBets.ts` | `RISING_MIN_BETS` | `validateBet` | Rejects if passLine < dynamic minimum |
| `bossRules/disableCrew.ts` | `DISABLE_CREW` | `modifyCascadeOrder` | Returns `[]` — no crew slots fire |
| `bossRules/foursInstantLoss.ts` | `FOURS_INSTANT_LOSS` | `modifyOutcome` | Sets `ctx.flags.instantLoss = true` when diceTotal === triggerTotal |
| `bossRules/tribute.ts` | `TRIBUTE` | `modifySevenOut` | Seizes `floor(bankroll × tributePct)` on each seven-out; halved if `state.covenantActive` |
| `bossRules/tidalSurge.ts` | `TIDAL_SURGE` | *(none)* | Tide counter tracked inline in `rolls.ts` via `bossPointHits`; min-bet validated inline |
| `bossRules/orbitalDecay.ts` | `ORBITAL_DECAY` | *(none)* | Hype decay applied inline in `computeNextState` SEVEN_OUT branch |
| `bossRules/firstContactProtocol.ts` | `FIRST_CONTACT_PROTOCOL` | *(none)* | Natural nullification applied inline in `rollHandler()` before hype tick |
| `bossRules/convergence.ts` | `CONVERGENCE` | `modifyCascadeOrder` | Returns `[0..N-1]` where N = `Math.max(0, 5 - state.bossPointHits)`; empty at 5 seven-outs |

### Server execution order (`apps/api/src/routes/rolls.ts`)

```
1. Validate incoming bets              →  bossHooks.validateBet()
2. FIRST_CONTACT_PROTOCOL nullification→  inline: NATURAL on 7/11 → NO_RESOLUTION (before hype tick)
3. RNG + classifyRoll()                →  pure function, no boss involvement
4. Apply boss outcome modifier         →  bossHooks.modifyOutcome()
5. Check ctx.flags.instantLoss         →  early exit to GAME_OVER if true
6. Inject bossSevenOutCount (CONV.)    →  TurnContext extended pre-cascade for CONVERGENCE only
7. resolveCascade(…, bossState)        →  bossHooks.modifyCascadeOrder() called internally
8. settleTurn()                        →  pure function, no boss involvement
9. Apply payout modifier               →  bossHooks.modifyPayout() (winning rolls only)
10. Apply seven-out bankroll modifier  →  bossHooks.modifySevenOut() (SEVEN_OUT branch)
11. Persist + emit WebSocket           →  no boss involvement
```

---

## The Nine Bosses

### The Foreman — Floor 1

**Rule:** `EXTORTION_FEE` | **Target:** $200 | **Index:** 2

Every winning payout is taxed 20% — the Foreman takes his cut before the money hits your stack.

**Implementation note:** `modifyPayout` computes the tax as `Math.floor(profit × taxPct)` and deducts it from the return value. The hook only fires on rolls where `payoutCents > baseStakeReturned` (i.e. a genuine win). Called in `rolls.ts` immediately after `settleTurn()`.

```typescript
ruleParams: { rule: 'EXTORTION_FEE', taxPct: 0.20 }
```

**Comp:** The Vig — Crew cash abilities pay out 20% more.

---

### Sarge — Floor 2

**Rule:** `RISING_MIN_BETS` | **Target:** $1,000 | **Index:** 5

The minimum Pass Line bet starts at 4% of the $1,000 marker target ($40) and rises by $20 (2%) after every Point Hit. It never drops — Seven Out holds the pressure. The cap is $200 (20%).

| Event | Effect on min bet |
|---|---|
| Point Hit | +$20 (rises) |
| Seven Out | No change (holds) |
| Marker clear | Resets to $40 |

```typescript
ruleParams: { rule: 'RISING_MIN_BETS', startPct: 0.04, incrementPct: 0.02, capPct: 0.20 }
```

**Comp:** Member's Jacket — +1 Shooter this segment on boss defeat.

---

### Mme. Le Prix — Floor 3

**Rule:** `DISABLE_CREW` | **Target:** $4,000 | **Index:** 8

The entire crew cascade is suppressed for the duration of the fight. Crew portraits remain visible but produce no events, no barks, and no cooldown ticks. Players must reach $4,000 on pure craps mechanics alone.

**Implementation note:** `modifyCascadeOrder` returns `[]`. The `for (const i of slotOrder)` loop in `resolveCascade()` simply never executes.

**Comp:** Sea Legs — On Seven Out, Hype resets to 50% instead of 1.0×.

---

### The Executive — Floor 4

**Rule:** `FOURS_INSTANT_LOSS` | **Target:** $15,000 | **Index:** 11

Rolling a dice total of 4 — combinations [1,3], [3,1], [2,2] — ends the entire run immediately. This is 3/36 ≈ 8.3% per roll.

**Implementation note:** `modifyOutcome` sets `ctx.flags.instantLoss = true`. The server checks this flag after `modifyOutcome` returns and before the cascade fires. An early-exit path persists the `GAME_OVER` status and emits the final WebSocket event without settling bets.

```typescript
ruleParams: { rule: 'FOURS_INSTANT_LOSS', triggerTotal: 4 }
```

**Comp:** Golden Touch — First come-out roll each segment is guaranteed a Natural (7 or 11).

---

### The Hierophant — Floor 5

**Rule:** `TRIBUTE` | **Target:** $100,000 | **Index:** 14

Every seven-out seizes 15% of the player's current bankroll as tribute — on top of the normal bet loss. THE_COVENANT comp (earned here) permanently halves this drain.

**Implementation note:** `modifySevenOut` computes `Math.floor(bankrollAfterLoss × tributePct)` and deducts it. If `state.covenantActive` is true, `tributePct` is halved. Called in `rolls.ts` in the SEVEN_OUT branch after bet resolution, before `computeNextState`.

```typescript
ruleParams: { rule: 'TRIBUTE', tributePct: 0.15 }
```

**Comp:** The Covenant — Direct bankroll drains from boss mechanics permanently reduced by 50%.

---

### The Sovereign — Floor 6

**Rule:** `TIDAL_SURGE` | **Target:** $500,000 | **Index:** 17

The table runs on a tide. Every 5 rolls, the minimum Pass Line bet floods to 15% of the marker target for 2 rolls, then recedes. The cycle is visible in the `BossRoomHeader` pip track.

**Implementation note:** No hook file. Tide counter is tracked via `bossPointHits` inline in `rolls.ts` — increments on every roll result (POINT_HIT, SEVEN_OUT, NATURAL, etc.) rather than only point hits. At `cycleLength` (5) the surge window opens; min-bet validation is applied inline matching the `validateBet` pattern. `BossRuleParams` carry `cycleLength`, `surgeDuration`, and `surgePct`.

```typescript
ruleParams: { rule: 'TIDAL_SURGE', cycleLength: 5, surgeDuration: 2, surgePct: 0.15 }
```

**Comp:** Poseidon's Favor — First come-out roll of each shooter can never craps-out (treated as a blank re-roll instead).

---

### The Commander — Floor 7

**Rule:** `ORBITAL_DECAY` | **Target:** $3,000,000 | **Index:** 20

Every seven-out subtracts 0.5× from the Hype multiplier. The multiplier has no floor — it can fall below 1.0×. Below 1.0×, payouts are penalized (the hype factor shrinks gross profit).

**Implementation note:** No hook file. Hype decay is applied inline in `computeNextState` SEVEN_OUT branch: `newHype = Math.max(hypeFloor, prevHype - decayAmount)`. `BossRoomHeader` shows the current hype with yellow warning at <1.25× and red "PENALTY MODE" at <1.0×.

```typescript
ruleParams: { rule: 'ORBITAL_DECAY', decayAmount: 0.5, hypeFloor: 0.5 }
```

**Comp:** Zero Point — Hype multiplier is permanently floored at 1.25× for all future floors.

---

### The Emissary — Floor 8

**Rule:** `FIRST_CONTACT_PROTOCOL` | **Target:** $15,000,000 | **Index:** 23

Come-out rolls that would be a Natural (7 or 11) are converted to blank NO_RESOLUTION rolls. No payout. No hype tick. The shooter stays in come-out phase.

**Implementation note:** No hook file. Nullification is applied inline in `rollHandler()` in `rolls.ts`, *before* the base-game hype tick (step 2 in the execution order). The `naturalBlocked: true` flag is set on `TurnContextFlags` and propagates through the cascade into `computeNextState`, which returns IDLE_TABLE / COME_OUT (not POINT_ACTIVE) on the NO_RESOLUTION branch when this flag is set. Placement before the hype tick is critical — moving it after would incorrectly award +0.10 momentum.

```typescript
ruleParams: { rule: 'FIRST_CONTACT_PROTOCOL' }
```

**Comp:** The Frequency — Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run.

---

### The Architect — Floor 9 (Final Boss)

**Rule:** `CONVERGENCE` | **Target:** $60,000,000 | **Index:** 26

Every seven-out permanently removes one crew slot from the cascade, starting with slot 5. After five seven-outs, the player rolls naked craps — no crew fires at all. No comp is awarded on defeat; The Null Space is the end of the line.

**Implementation note:** `modifyCascadeOrder(slotCount, params, state)` returns `Array.from({ length: Math.max(0, 5 - sevenOutCount) }, (_, i) => i)`. The `state.bossPointHits` value is the seven-out count for this boss (not point hits — see counter behavior below).

**Counter behavior for CONVERGENCE** (differs from all other bosses):
- `bossPointHits` tracks seven-out count (0–5), not point hits.
- Increments on SEVEN_OUT (capped at 5). Held on POINT_HIT. Resets to 0 on marker clear.
- Pre-roll value is injected into `TurnContext` as `bossSevenOutCount` and passed to `resolveCascade` as `bossState`.

**CONVERGENCE also ends the game:** Index 26 is the final marker in the gauntlet. A boss victory at index 26 transitions to `GAME_OVER` (not `TRANSITION`), so the recruit/comp phase is never reached. The `compReward: 'NONE'` sentinel and the `BossVictoryCompPhase` early-return are defensive guards only.

```typescript
ruleParams: { rule: 'CONVERGENCE' }
```

**Comp:** None. `compReward: 'NONE'`.

---

## `BossRuleParams` Discriminated Union

```typescript
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';          taxPct: number }
  | { rule: 'RISING_MIN_BETS';        startPct: number; incrementPct: number; capPct: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS';     triggerTotal: number }
  | { rule: 'TRIBUTE';                tributePct: number }
  | { rule: 'TIDAL_SURGE';            cycleLength: number; surgeDuration: number; surgePct: number }
  | { rule: 'ORBITAL_DECAY';          decayAmount: number; hypeFloor: number }
  | { rule: 'FIRST_CONTACT_PROTOCOL' }
  | { rule: 'CONVERGENCE' };
```

TypeScript narrows the type inside each hook file via the `rule` discriminant. This prevents cross-boss param access bugs (e.g. accidentally reading Sarge's `startPct` when the active boss is The Hierophant).

---

## Adding a New Boss

1. **Add a union member to `BossRuleType`** in `packages/shared/src/config.ts`
2. **Add a union member to `BossRuleParams`** in `packages/shared/src/config.ts`
3. **Create a hook file** in `packages/shared/src/bossRules/` implementing `BossRuleHooks`. If the mechanic is handled entirely inline in `rolls.ts` (like TIDAL_SURGE or ORBITAL_DECAY), the file may export an empty `{}` hooks object — it still must be registered.
4. **Register it** in `packages/shared/src/bossRules/index.ts`
5. **Add or extend a `MarkerConfig`** in `GAUNTLET` with `isBoss: true` and a full `BossConfig` object
6. **Add a `CompRewardType`** and `COMP_PERK_IDS` entry if the new boss awards a new comp type; use `compReward: 'NONE'` if no comp should be awarded
7. **Add a floor entry** to `FLOORS[]` in `packages/shared/src/floors.ts` with the correct `FloorAtmosphere` type
8. **Add a floor theme** to `apps/web/src/lib/floorThemes.ts` and update the `THEMES` array and index clamp in `getFloorTheme`/`getFloorIndex`
9. **Server:** wire any inline mechanic logic into `rolls.ts` (e.g. pre-hype-tick nullification, tide counter, hype decay). Hook calls are already plumbed — no structural changes needed for hook-based mechanics.
10. **UI (BossRoomHeader):** add a display branch for the new rule's HUD indicator if it has a visual counter (like TIDAL_SURGE pips, ORBITAL_DECAY hype display, CONVERGENCE crew count)
11. **UI (other):** all boss entry/victory/comp screens read from `BossConfig` fields — no changes needed there

---

## Verification Checklist

| Scenario | Expected |
|---|---|
| Foreman fight, winning roll | Payout taxed 20%; net payout visible in roll log |
| Sarge fight, 0 point hits | Min bet $40; `validateBet` rejects passLine < 4000 |
| Sarge fight, 1 point hit | Min bet $60; holds if next roll is Seven Out |
| Sarge fight, capped | Min bet $200; no further increase |
| Mme. Le Prix fight | No crew events in roll log; no barks; cooldowns unchanged |
| Executive fight, diceTotal = 4 | `ctx.flags.instantLoss = true`; run transitions to GAME_OVER |
| Executive fight, diceTotal ≠ 4 | Normal resolution |
| Hierophant fight, seven-out | 15% of bankroll seized (7.5% with THE_COVENANT) |
| Sovereign fight, roll 5 | Surge window opens; min-bet spikes to 15% of target |
| Sovereign fight, roll 7 | Surge ends; min-bet returns to 0 |
| Commander fight, seven-out at 1.0× hype | Hype drops to 0.5×; PENALTY MODE shown in header |
| Emissary fight, come-out 7 or 11 | NO_RESOLUTION blank; no payout; no +0.10 hype tick |
| Architect fight, 0 seven-outs | All 5 crew slots active |
| Architect fight, 3 seven-outs | 2 crew slots active (slots 0 and 1 only) |
| Architect fight, 5 seven-outs | 0 crew slots — naked craps; "⌀ NAKED CRAPS" in header |
| Architect boss defeat | Transitions to GAME_OVER (no comp awarded, no pub visit) |
| All boss entry screens | `dreadTagline`, `entryLines`, `ruleBlurb` from config; no hardcoded strings |
| All boss victory screens | `defeatAnnouncement`, `victoryQuote`, `compName`, `compDescription` from config |
| Floor 9 boss victory comp screen | `BossVictoryCompPhase` calls `onAdvance()` immediately via `useEffect`; returns `null` |
| `npm run typecheck` | Zero errors |
