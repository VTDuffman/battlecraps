# Battlecraps Crew Framework — Baseline Values

> Values and descriptions sourced from code. Rarity and unlock mechanism fields intentionally left blank — not yet implemented.
> Brief and detailed descriptions are the canonical player-facing copy; code UI strings should be updated to match.

---

## Framework Overview

Crew members fire sequentially in slots 0→4 during a **cascade**. Each receives and returns a `TurnContext` — an immutable scratchpad containing dice state, roll classification, base payouts, and cascade modifiers. The cascade is resolved server-side only; clients receive WebSocket events for animation.

### Payout Settlement Formula

```
GrossProfit      = basePassLinePayout + baseOddsPayout + baseHardwaysPayout
BoostedProfit    = GrossProfit + additives
CrewMultiplier   = product(multipliers)          ← stacks multiplicatively
FinalMultiplier  = hype × CrewMultiplier
AmplifiedProfit  = floor(BoostedProfit × FinalMultiplier)
FinalPayout      = baseStakeReturned + AmplifiedProfit
```

Stakes (1:1 returns) are **never** amplified — only profit above stake is multiplied.

### Cooldown Types

| Type | Behavior |
|---|---|
| `none` | Always ready; fires every qualifying roll |
| `per_roll` | Countdown; cascade decrements each roll |
| `per_shooter` | Binary (0=ready / 1=spent); resets when new shooter begins after SEVEN_OUT |

### Description Fields

Two player-facing copy fields are defined per crew member. These are the canonical strings; all UI components (PubScreen cards, CrewPortrait tooltips, database seed, etc.) should derive from these.

| Field | Purpose | Length guidance |
|---|---|---|
| **Brief Description** | One sentence shown on crew cards and hover tooltips. States the trigger and effect plainly. | ≤ 80 characters |
| **Detailed Description** | Two–three sentences shown in an expanded or help view. Adds numbers, edge cases, and slot-order notes relevant to strategy. | ≤ 300 characters |

---

## Crew Member Baseline Values

### Category: DICE
*Manipulate dice or outcomes before resolution*

---

#### 1. "Lefty" McGuffin
| Field | Value |
|---|---|
| **ID** | 1 |
| **Visual ID** | `lefty` |
| **Category** | DICE |
| **Cost** | $150.00 (15,000 cents) |
| **Cooldown** | `per_shooter` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Re-rolls a Seven Out once per shooter. |
| **Detailed Description** | When the shooter rolls a Seven Out, Lefty steps in with a second chance. The dice are re-rolled — if the new roll isn't a 7, the shooter lives and play continues. Any Hype or bonuses already built up in the cascade carry through. One use per shooter. |

**Ability:** On `SEVEN_OUT`, re-rolls new dice and reclassifies the outcome. If the new roll escapes a 7, the shooter survives. Sets flag `sevenOutBlocked` regardless of result. Preserves cascade modifiers (additives, multipliers, hype) from any earlier crew in the same cascade.

---

#### 2. The Physics Prof
| Field | Value |
|---|---|
| **ID** | 2 |
| **Visual ID** | `physics_prof` |
| **Category** | DICE |
| **Cost** | $120.00 (12,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | On any paired roll, nudges both dice ±1 to land on the active point. |
| **Detailed Description** | Whenever both dice show the same face, the Physics Prof shifts each die by one pip toward the active point, turning a near-miss into a Point Hit. Because the dice stay paired after the shift, any active Hardway bet also pays out. Fires on every paired roll; no cooldown. |

**Ability:** On paired dice rolls (both faces equal), shifts both dice ±1 toward the active point, turning near-misses into `POINT_HIT`. Safety-checks die bounds (1–6); recalculates outcome and payouts after shift. *Example: Point=8, dice=[3,3]=6 → [4,4]=8 POINT_HIT.*

---

#### 3. The Mechanic
| Field | Value |
|---|---|
| **ID** | 3 |
| **Visual ID** | `mechanic` |
| **Category** | DICE |
| **Cost** | $250.00 (25,000 cents) |
| **Cooldown** | `per_shooter` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Once per shooter: lock a die to any face for up to 4 rolls. |
| **Detailed Description** | Tap the Mechanic to choose a die face (1–6). That value is held on one die for the next 4 rolls or until the shooter sevens out. The lock is applied before any other crew fires, so the rest of your crew sees it. One use per shooter. |

**Ability:** Once per shooter, the player locks one die face (1–6) for the next 4 rolls via `POST /runs/:id/mechanic-freeze`. The freeze is applied in `resolveRoll()` before the cascade fires. `execute()` is an intentional no-op — the cooldown blocks re-activation within the same shooter's life.

---

### Category: TABLE
*Modify bet resolution or protection rules*

---

#### 4. The Mathlete
| Field | Value |
|---|---|
| **ID** | 4 |
| **Visual ID** | `mathlete` |
| **Category** | TABLE |
| **Cost** | $120.00 (12,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Active Hardway bets survive a soft-number hit. |
| **Detailed Description** | When a roll hits a hardway total (4, 6, 8, or 10) with unmatched dice — a soft result that would normally wipe your Hardway bet — the Mathlete cancels that loss and keeps the bet alive. Doesn't protect against a Seven Out, and doesn't interfere with hardway wins. Fires every qualifying roll; no cooldown. |

**Ability:** Protects Hardways bets from "soft" rolls. When a non-paired roll of a hardway number would clear the bet, Mathlete negates the loss and keeps the bet alive (restores value in `resolvedBets`, sets flag `hardwayProtected`). Does **not** fire on `SEVEN_OUT` (seven-out clears everything) or on hardway wins.

---

#### 5. The Floor Walker
| Field | Value |
|---|---|
| **ID** | 5 |
| **Visual ID** | `floor_walker` |
| **Category** | TABLE |
| **Cost** | $150.00 (15,000 cents) |
| **Cooldown** | `per_shooter` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | The first Seven Out of a shooter refunds your Pass Line bet. |
| **Detailed Description** | When the shooter sevens out, the Floor Walker gets your Pass Line stake back instead of losing it. Your Odds bet is not covered. Protection is used once per shooter and resets when a new shooter takes the table. |

**Ability:** The first `SEVEN_OUT` per shooter does not lose the Pass Line bet — the stake is refunded instead of forfeited. Does **not** protect the Odds bet. Implementation adds stake to `baseStakeReturned` and sets flag `passLineProtected`.

---

#### 6. The Regular
| Field | Value |
|---|---|
| **ID** | 6 |
| **Visual ID** | `regular` |
| **Category** | TABLE |
| **Cost** | $100.00 (10,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Grants a free Odds bet equal to your Pass Line on a Natural. |
| **Detailed Description** | Every time the come-out roll is a Natural (7 or 11), the Regular adds a bonus to your payout equal to your Pass Line bet — treated like an Odds win and amplified by Hype and any active multipliers. Fires on every Natural; no cooldown. |

**Ability:** On `NATURAL` (7 or 11 on come-out), grants a free Odds-style bonus equal to the Pass Line bet amount. Implementation adds the Pass Line bet amount to `additives` (amplified by Hype + multipliers, just like real Odds).

---

### Category: PAYOUT
*Add flat bonuses or multipliers to winning payouts*

---

#### 7. The Big Spender
| Field | Value |
|---|---|
| **ID** | 7 |
| **Visual ID** | `big_spender` |
| **Category** | PAYOUT |
| **Cost** | $80.00 (8,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds a flat $100 bonus to every Hardway win. |
| **Detailed Description** | Whenever a Hardway bet pays out, the Big Spender throws in an extra $100. That bonus enters the payout pool before Hype is applied, so it scales up with your multiplier stack. Fires on every Hardway win; no cooldown. |

**Ability:** +$100 (10,000 cents) flat bonus on any Hardway win. Fires when `baseHardwaysPayout > 0`; adds 10,000 cents to `additives`.

---

#### 8. The Shark
| Field | Value |
|---|---|
| **ID** | 8 |
| **Visual ID** | `shark` |
| **Category** | PAYOUT |
| **Cost** | $180.00 (18,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds a flat $100 bonus to every Point Hit. |
| **Detailed Description** | Every time the shooter hits their point, the Shark adds $100 to the payout pool. The bonus is applied before Hype and multipliers, so it gets amplified along with everything else. Fires on every Point Hit regardless of bet size; no cooldown. |

**Ability:** +$100 (10,000 cents) flat bonus on any `POINT_HIT`, regardless of bet size. Fires on `POINT_HIT`; adds 10,000 cents to `additives`.

---

#### 9. The Whale
| Field | Value |
|---|---|
| **ID** | 9 |
| **Visual ID** | `whale` |
| **Category** | PAYOUT |
| **Cost** | $300.00 (30,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Multiplies all winning payouts by 1.2×. |
| **Detailed Description** | On any roll that produces a winning payout, the Whale applies a 1.2× multiplier to the final result. Multiple multipliers from different crew stack by product — pair the Whale with the Mimic for a 1.44× combined boost. Does not fire on rolls where nothing wins. |

**Ability:** 1.2× multiplicative multiplier on all winning payouts. Fires when any payout component > 0; pushes `1.2` onto `multipliers`. Does **not** fire on pure-loss rolls. Stacks multiplicatively with Hype: `FinalMult = ctx.hype × product(ctx.multipliers)`.

---

### Category: HYPE
*Boost the global hype multiplier*

---

#### 10. The Nervous Intern
| Field | Value |
|---|---|
| **ID** | 10 |
| **Visual ID** | `nervous_intern` |
| **Category** | HYPE |
| **Cost** | $50.00 (5,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds +0.2× Hype on every Natural. |
| **Detailed Description** | Each come-out Natural (7 or 11) pumps global Hype up by 0.2×. Hype persists across rolls and amplifies every payout, so a steady stream of Naturals quietly compounds into a serious multiplier. No cooldown; fires on every Natural. |

**Ability:** +0.2× Hype on `NATURAL` (7 or 11 on come-out). Adds `0.2` to `ctx.hype`.

---

#### 11. "Hype-Train" Holly
| Field | Value |
|---|---|
| **ID** | 11 |
| **Visual ID** | `hype_train_holly` |
| **Category** | HYPE |
| **Cost** | $100.00 (10,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds +0.3× Hype on every Point Hit. |
| **Detailed Description** | Every time the shooter hits their point, Holly adds 0.3× to global Hype. A run of consecutive Point Hits can stack Hype fast, turning every subsequent win into a bigger payout. No cooldown; fires on every Point Hit. |

**Ability:** +0.3× Hype on any `POINT_HIT`. Adds `0.3` to `ctx.hype`; rounds to 4 decimal places to prevent IEEE-754 accumulation errors.

---

#### 12. The Drunk Uncle
| Field | Value |
|---|---|
| **ID** | 12 |
| **Visual ID** | `drunk_uncle` |
| **Category** | HYPE |
| **Cost** | $60.00 (6,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | 33% chance per roll: +0.5× Hype or −0.1× Hype. |
| **Detailed Description** | Each roll, the Drunk Uncle secretly rolls his own dice. He fires roughly one roll in three — when he does, an odd second die means +0.5× Hype; an even second die means −0.1× Hype. The upside is big, the downside is small, but he's unpredictable. His dice are separate from the game roll. |

**Ability:** 33% chance per roll to fire (d1 ∈ {1,2}). When it fires: if d2 is odd → +0.5 Hype; if d2 is even → −0.1 Hype. Uses a separate `rollDice()` call (logged in RNG audit, not the main game dice). Rounds `ctx.hype` to 4 decimal places.

---

### Category: WILDCARD
*Meta-progression or special cascade effects*

---

#### 13. The Mimic
| Field | Value |
|---|---|
| **ID** | 13 |
| **Visual ID** | `mimic` |
| **Category** | WILDCARD |
| **Cost** | $220.00 (22,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Special Constant** | `MIMIC_ID = 13` |
| **Brief Description** | Copies the ability of the last crew member that fired. |
| **Detailed Description** | The Mimic repeats the exact action of whichever crew member fired immediately before it in the cascade. Place it after your most valuable crew to double that effect. In slot 0 the Mimic does nothing — there's no prior crew to copy. Slot 4 is the sweet spot. |

**Ability:** Copies the previous crew member's `execute()` call during the cascade. `execute()` is an intentional no-op; `cascade.ts` detects `member.id === MIMIC_ID` and substitutes `lastFiredMember.execute()`. Mimic in slot 0 does nothing (no prior crew). Best placed in slot 4 to double a high-value crew member.

---

#### 14. The Old Pro
| Field | Value |
|---|---|
| **ID** | 14 |
| **Visual ID** | `old_pro` |
| **Category** | WILDCARD |
| **Cost** | $250.00 (25,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Special Constant** | `OLD_PRO_ID = 14` |
| **Brief Description** | Earn +1 Shooter life each time you clear a Marker. |
| **Detailed Description** | Each time you hit a Gauntlet Marker and advance to the next floor, the Old Pro grants an extra Shooter — so you enter the next stretch with one more life than normal. Fires at the Transition state between floors, not during rolls. No cooldown; applies every Marker you clear. |

**Ability:** Grants +1 Shooter (extra life) when a Marker is reached. `execute()` is a no-op; the server-side `TRANSITION` state handler detects `OLD_PRO_ID` in crew slots and increments `GameState.shooters += 1`.

---

#### 15. The Lucky Charm
| Field | Value |
|---|---|
| **ID** | 15 |
| **Visual ID** | `lucky_charm` |
| **Category** | WILDCARD |
| **Cost** | $200.00 (20,000 cents) |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Special Constant** | `LUCKY_CHARM_ID = 15` |
| **Brief Description** | When alone on the rail, your Hype can't drop below 2.0×. |
| **Detailed Description** | If the Lucky Charm is the only crew member in your five slots, global Hype is prevented from falling below 2.0× — guaranteeing every payout is at least doubled. The moment any other crew occupies a slot, the floor effect is inactive. Hype can still rise above 2.0× from point streaks and other sources. |

**Ability:** Locks Hype floor at 2.0× when it is the **only** active crew member. `execute()` is a no-op; `cascade.ts` pre-computes `isLuckyCharmSolo` before the loop. When true and `member.id === LUCKY_CHARM_ID`, injects the hype floor: `ctx.hype = ctx.hype < 2.0 ? ctx.hype + 1.0 : ctx.hype` (preserves bonuses above 1.0 baseline). Trade-off: no crew synergies, but guarantees 2.0× amplification on all payouts.

---

## Summary Table

| # | Name | Category | Cost | Cooldown | Trigger | Effect |
|---|---|---|---|---|---|---|
| 1 | "Lefty" McGuffin | DICE | $150 | per_shooter | SEVEN_OUT | Re-rolls dice; may save shooter |
| 2 | The Physics Prof | DICE | $120 | none | Paired dice | Shifts both dice ±1 toward point |
| 3 | The Mechanic | DICE | $250 | per_shooter | Manual (API) | Lock one die face for 4 rolls |
| 4 | The Mathlete | TABLE | $120 | none | Soft hardway roll | Prevents hardway bet loss |
| 5 | The Floor Walker | TABLE | $150 | per_shooter | SEVEN_OUT | Refunds Pass Line stake once |
| 6 | The Regular | TABLE | $100 | none | NATURAL | Free Odds-style bonus on come-out 7/11 |
| 7 | The Big Spender | PAYOUT | $80 | none | Hardway win | +$100 flat bonus |
| 8 | The Shark | PAYOUT | $180 | none | POINT_HIT | +$100 flat bonus |
| 9 | The Whale | PAYOUT | $300 | none | Any winning payout | ×1.2 multiplier on all payouts |
| 10 | The Nervous Intern | HYPE | $50 | none | NATURAL | +0.2× Hype |
| 11 | "Hype-Train" Holly | HYPE | $100 | none | POINT_HIT | +0.3× Hype |
| 12 | The Drunk Uncle | HYPE | $60 | none | 33% per roll | ±Hype (random: +0.5 or −0.1) |
| 13 | The Mimic | WILDCARD | $220 | none | After any firing crew | Copies previous crew's execute() |
| 14 | The Old Pro | WILDCARD | $250 | none | Marker reached | +1 Shooter (extra life) |
| 15 | The Lucky Charm | WILDCARD | $200 | none | Solo only | Hype floor locked at 2.0× |

---

## TurnContext Reference

| Field | Type | Description |
|---|---|---|
| `dice` | `[number, number]` | Current dice values (may be modified by DICE crew) |
| `diceTotal` | `number` | Convenience sum, kept in sync with `dice` |
| `isHardway` | `boolean` | Both dice equal and total ∈ {4,6,8,10} |
| `rollResult` | `RollResult` | NATURAL / CRAPS_OUT / POINT_SET / POINT_HIT / SEVEN_OUT / NO_RESOLUTION |
| `activePoint` | `number \| null` | Active point; null during come-out |
| `bets` | `Readonly<Bets>` | Original bet amounts (read-only) |
| `basePassLinePayout` | `number` | Pass Line profit in cents |
| `baseOddsPayout` | `number` | True-odds profit in cents |
| `baseHardwaysPayout` | `number` | Gross hardway profit in cents |
| `baseStakeReturned` | `number` | Stake amount (1:1, never amplified) |
| `additives` | `number` | Flat currency bonuses (applied before multiplier stack) |
| `multipliers` | `number[]` | Multiplicative modifiers (product stacks) |
| `hype` | `number` | Global multiplier (persisted post-cascade) |
| `flags.sevenOutBlocked` | `boolean` | Set by Lefty on re-roll |
| `flags.passLineProtected` | `boolean` | Set by Floor Walker on first seven-out |
| `flags.hardwayProtected` | `boolean` | Set by Mathlete on soft roll protection |
| `resolvedBets` | `Bets` | Bets remaining after this roll |
| `mechanicLockedValue` | `number \| null` | Die face locked by The Mechanic |
