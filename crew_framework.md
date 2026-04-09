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
| **Emoji** | 🎰 |
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
| **Emoji** | 🧪 |
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
| **Emoji** | 🔧 |
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
| **Emoji** | 🧮 |
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
| **Emoji** | 🪬 |
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
| **Emoji** | 🪑 |
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
| **Emoji** | 💸 |
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
| **Emoji** | 🦈 |
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
| **Emoji** | 🐋 |
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
| **Emoji** | 🫣 |
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
| **Emoji** | 📣 |
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
| **Emoji** | 🍺 |
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
| **Emoji** | 👥 |
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
| **Emoji** | 🦯 |
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
| **Emoji** | 🍀 |
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

## Original 15 — Summary Table

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

---

## New Starter Crew — Proposed Design (IDs 16–30)

> These 15 crew members are design proposals, not yet implemented. Costs and values are estimates for balance discussion. All have `cooldownType: none`. Members marked ⚠️ require new game state fields.
>
> **Design goal:** Trigger on dice values and roll patterns rather than bet outcomes, eliminating dead space between resolutions.

---

### Category: DICE
*Trigger on dice face patterns regardless of game outcome*

---

#### 16. The Lookout
| Field | Value |
|---|---|
| **ID** | 16 *(proposed)* |
| **Visual ID** | `lookout` |
| **Emoji** | 🔭 |
| **Category** | DICE |
| **Cost** | $65.00 (6,500 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds Hype whenever a 6 appears on either die. |
| **Detailed Description** | The Lookout watches for the big number — any roll where at least one die lands on 6 generates +0.15 Hype. Fires on roughly 1 in 3 rolls, making it one of the most consistently active crew members. No conditions beyond the die face; no cooldown. |

**Design Intent:** Trigger on `ctx.dice[0] === 6 || ctx.dice[1] === 6`. Frequency: 11/36 ≈ 31%. Pairs with Ace McGee for 56% combined roll coverage.

---

#### 17. "Ace" McGee
| Field | Value |
|---|---|
| **ID** | 17 *(proposed)* |
| **Visual ID** | `ace_mcgee` |
| **Emoji** | 🎯 |
| **Category** | DICE |
| **Cost** | $60.00 (6,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds a flat bonus whenever a 1 appears on either die. |
| **Detailed Description** | Snake eyes feel lucky now. Any roll where at least one die shows a 1 adds $50 to your payout pool. Fires on roughly 1 in 3 rolls regardless of game phase or outcome. Pairs with The Lookout to cover more than half of all rolls between them. |

**Design Intent:** Trigger on `ctx.dice[0] === 1 || ctx.dice[1] === 1`. Frequency: 11/36 ≈ 31%.

---

#### 18. The Close Call
| Field | Value |
|---|---|
| **ID** | 18 *(proposed)* |
| **Visual ID** | `close_call` |
| **Emoji** | 😬 |
| **Category** | DICE |
| **Cost** | $110.00 (11,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pays out whenever the dice show consecutive face values. |
| **Detailed Description** | When dice land on adjacent values — [1,2], [2,3], [3,4], [4,5], or [5,6] in either order — the Close Call adds $100 to the payout pool. So close to a pair. Fires on roughly 1 in 4 rolls regardless of outcome or phase. |

**Design Intent:** Trigger on `Math.abs(ctx.dice[0] - ctx.dice[1]) === 1`. Frequency: 10/36 ≈ 28%.

---

### Category: HYPE
*Build the multiplier through roll patterns, not just wins*

---

#### 19. The Momentum
| Field | Value |
|---|---|
| **ID** | 19 *(proposed)* |
| **Visual ID** | `momentum` |
| **Emoji** | 📈 |
| **Category** | HYPE |
| **Cost** | $90.00 (9,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds Hype whenever this roll's total is higher than the last. |
| **Detailed Description** | When the dice climb — any roll whose total beats the previous roll's total — the Momentum adds +0.2 Hype. The table reads the dice like a scoreboard. Fires on roughly 45% of rolls after the first of a shooter. Partners with The Echo and The Contrarian to cover nearly every roll with distinct rewards. |

**Design Intent:** Trigger on `ctx.diceTotal > ctx.previousRollTotal`. ⚠️ *Requires new game state: `previousRollTotal: number | null`.*

---

#### 20. The Echo
| Field | Value |
|---|---|
| **ID** | 20 *(proposed)* |
| **Visual ID** | `echo` |
| **Emoji** | 🔁 |
| **Category** | HYPE |
| **Cost** | $85.00 (8,500 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pops Hype when the dice repeat the same total as the last roll. |
| **Detailed Description** | When the total matches the previous roll exactly, the Echo fires a +0.4 Hype burst — bigger than most Hype crew because repetition is rarer. Fires roughly 17% of rolls. Works alongside Momentum and Contrarian to cover almost every roll of a shooter with different rewards. |

**Design Intent:** Trigger on `ctx.diceTotal === ctx.previousRollTotal`. ⚠️ *Requires new game state: `previousRollTotal: number | null`.*

---

#### 21. The Silver Lining
| Field | Value |
|---|---|
| **ID** | 21 *(proposed)* |
| **Visual ID** | `silver_lining` |
| **Emoji** | 🌤️ |
| **Category** | HYPE |
| **Cost** | $75.00 (7,500 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Converts a Craps Out into a Hype bump. |
| **Detailed Description** | When the come-out craps out (2, 3, or 12), the Silver Lining adds +0.6 Hype as consolation. CRAPS_OUT is currently the only outcome where no crew fires at all. The Silver Lining makes the worst come-out result build toward something — turning grief into momentum for the next roll. |

**Design Intent:** Trigger on `ctx.rollResult === 'CRAPS_OUT'`. Frequency: 4/36 ≈ 11% of come-out rolls.

---

#### 22. The Odd Couple
| Field | Value |
|---|---|
| **ID** | 22 *(proposed)* |
| **Visual ID** | `odd_couple` |
| **Emoji** | 🤪 |
| **Category** | HYPE |
| **Cost** | $80.00 (8,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds Hype whenever both dice show odd faces. |
| **Detailed Description** | When both dice land on odd values (1, 3, or 5), the Odd Couple adds +0.2 Hype. Fires on 25% of all rolls regardless of phase or outcome. Pairs with The Even Keel to cover 50% of rolls between them — Hype on odd rolls, cash on even ones. |

**Design Intent:** Trigger on `ctx.dice[0] % 2 === 1 && ctx.dice[1] % 2 === 1`. Frequency: 9/36 = 25%.

---

### Category: TABLE
*Steady income and phase coverage*

---

#### 23. The Even Keel
| Field | Value |
|---|---|
| **ID** | 23 *(proposed)* |
| **Visual ID** | `even_keel` |
| **Emoji** | ⚖️ |
| **Category** | TABLE |
| **Cost** | $90.00 (9,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pays a flat bonus whenever both dice show even faces. |
| **Detailed Description** | When both dice land on even values (2, 4, or 6), the Even Keel adds $80 to the payout pool. Smooth and steady — fires on 25% of rolls. Partners with The Odd Couple to cover half of all rolls: Even Keel provides cash income while Odd Couple builds Hype. |

**Design Intent:** Trigger on `ctx.dice[0] % 2 === 0 && ctx.dice[1] % 2 === 0`. Frequency: 9/36 = 25%.

---

#### 24. The Doorman
| Field | Value |
|---|---|
| **ID** | 24 *(proposed)* |
| **Visual ID** | `doorman` |
| **Emoji** | 🚪 |
| **Category** | TABLE |
| **Cost** | $80.00 (8,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pays a small bonus on every come-out roll regardless of outcome. |
| **Detailed Description** | Every time a come-out roll happens — Natural, Craps Out, or Point Set — the Doorman adds $40 to the payout pool. Come-out rolls that aren't Naturals currently feel ignored by most crew. The Doorman means every new come-out earns something, making the transition between shooters feel productive. |

**Design Intent:** Trigger on `ctx.rollResult === 'NATURAL' || ctx.rollResult === 'CRAPS_OUT' || ctx.rollResult === 'POINT_SET'`.

---

#### 25. The Grinder
| Field | Value |
|---|---|
| **ID** | 25 *(proposed)* |
| **Visual ID** | `grinder` |
| **Emoji** | ⚙️ |
| **Category** | TABLE |
| **Cost** | $130.00 (13,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Earns a steady bonus on every in-between point-phase roll. |
| **Detailed Description** | Every point-phase roll that doesn't resolve — no Point Hit, no Seven Out — the Grinder adds $30 to the payout pool. These blank rolls currently feel like dead air. At 65–70% of point-phase roll frequency, the Grinder turns the longest stretches of waiting into the most consistent earners. |

**Design Intent:** Trigger on `ctx.rollResult === 'NO_RESOLUTION'`. Frequency: ~65–70% of point-phase rolls.

---

### Category: PAYOUT
*Rewards on currently underserved triggers*

---

#### 26. The Handicapper
| Field | Value |
|---|---|
| **ID** | 26 *(proposed)* |
| **Visual ID** | `handicapper` |
| **Emoji** | 📊 |
| **Category** | PAYOUT |
| **Cost** | $100.00 (10,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds Hype when a point is set — more for harder points. |
| **Detailed Description** | Every time the come-out establishes a point, the Handicapper adds Hype scaled to difficulty: Point 6 or 8 gives +0.1 Hype, Point 5 or 9 gives +0.2, and Points 4 or 10 give +0.3. POINT_SET is currently ignored by every crew member. The Handicapper makes hard points feel like an opportunity instead of a threat. |

**Design Intent:** Trigger on `ctx.rollResult === 'POINT_SET'`. Scale Hype delta on `ctx.activePoint`: {4,10} → 0.3, {5,9} → 0.2, {6,8} → 0.1. Frequency: 24/36 ≈ 67% of come-out rolls.

---

#### 27. The Mirror
| Field | Value |
|---|---|
| **ID** | 27 *(proposed)* |
| **Visual ID** | `mirror` |
| **Emoji** | 🪞 |
| **Category** | PAYOUT |
| **Cost** | $85.00 (8,500 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Adds Hype on any roll totalling 7, regardless of phase. |
| **Detailed Description** | Opposite faces of a real die always sum to 7. When the dice show that balance — Natural on come-out or Seven Out in point phase — the Mirror banks +0.2 Hype regardless. Seven Outs are still costly, but you carry Hype into the next shooter. Naturals get an extra Hype bump on top of the win. Fires on roughly 1 in 6 rolls. |

**Design Intent:** Trigger on `ctx.diceTotal === 7`. Frequency: 6/36 ≈ 17%.

---

### Category: WILDCARD
*Meta, rhythm, and cross-roll synergy*

---

#### 28. The Bookkeeper
| Field | Value |
|---|---|
| **ID** | 28 *(proposed)* |
| **Visual ID** | `bookkeeper` |
| **Emoji** | 📒 |
| **Category** | WILDCARD |
| **Cost** | $100.00 (10,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pays out on every 3rd roll of the current shooter, like clockwork. |
| **Detailed Description** | Every third roll — regardless of outcome, phase, or dice values — the Bookkeeper adds $60 to the payout pool. The predictability is the design: players count rolls out loud. "One, two, THREE." This is the most deliberately Pavlovian crew member in the set. Counter resets per shooter. |

**Design Intent:** Trigger on `ctx.shooterRollCount % 3 === 0`. ⚠️ *Requires new game state: `shooterRollCount: number` (increments each roll, resets on new shooter).*

---

#### 29. The Pressure Cooker
| Field | Value |
|---|---|
| **ID** | 29 *(proposed)* |
| **Visual ID** | `pressure_cooker` |
| **Emoji** | 🌡️ |
| **Category** | WILDCARD |
| **Cost** | $120.00 (12,000 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Releases a big payout after 5 consecutive blank point-phase rolls. |
| **Detailed Description** | Every fifth consecutive NO_RESOLUTION roll in the point phase triggers a release: +0.5 Hype and +$100 additive. Long point phases feel like purgatory without this — the Pressure Cooker makes players actively want them. Each blank roll builds pressure; every five rolls it releases. Counter resets on any resolution. |

**Design Intent:** Track `pointPhaseBlankStreak` (increment on NO_RESOLUTION, reset on POINT_HIT or SEVEN_OUT). Fire when streak reaches 5, reset to 0. ⚠️ *Requires new game state: `pointPhaseBlankStreak: number`.*

---

#### 30. The Contrarian
| Field | Value |
|---|---|
| **ID** | 30 *(proposed)* |
| **Visual ID** | `contrarian` |
| **Emoji** | 📉 |
| **Category** | WILDCARD |
| **Cost** | $85.00 (8,500 cents) *(proposed)* |
| **Cooldown** | `none` |
| **Rarity** | — |
| **Unlock Mechanism** | — |
| **Brief Description** | Pays cash whenever this roll's total is lower than the last. |
| **Detailed Description** | When the dice fall — any roll whose total is below the previous roll's total — the Contrarian adds $75 to the payout pool. Going down? Bank some cash. Different reward from The Momentum (Hype on ascent) and The Echo (big Hype on repeat) — together the three cover nearly every roll of a shooter with distinct rewards for every direction. |

**Design Intent:** Trigger on `ctx.diceTotal < ctx.previousRollTotal`. ⚠️ *Requires new game state: `previousRollTotal: number | null`.*

---

## New Starter Crew — Summary (IDs 16–30)

| # | Name | Emoji | Category | Cost | Trigger | Freq. | Effect |
|---|---|---|---|---|---|---|---|
| 16 | The Lookout | 🔭 | DICE | $65 | Any die = 6 | 31% | +0.15 Hype |
| 17 | "Ace" McGee | 🎯 | DICE | $60 | Any die = 1 | 31% | +$50 additive |
| 18 | The Close Call | 😬 | DICE | $110 | Consecutive faces | 28% | +$100 additive |
| 19 | The Momentum | 📈 | HYPE | $90 | Total > last roll ⚠️ | ~45% | +0.2 Hype |
| 20 | The Echo | 🔁 | HYPE | $85 | Total = last roll ⚠️ | ~17% | +0.4 Hype |
| 21 | The Silver Lining | 🌤️ | HYPE | $75 | CRAPS_OUT | 11%† | +0.6 Hype |
| 22 | The Odd Couple | 🤪 | HYPE | $80 | Both dice odd | 25% | +0.2 Hype |
| 23 | The Even Keel | ⚖️ | TABLE | $90 | Both dice even | 25% | +$80 additive |
| 24 | The Doorman | 🚪 | TABLE | $80 | Every come-out | ~20%‡ | +$40 additive |
| 25 | The Grinder | ⚙️ | TABLE | $130 | NO_RESOLUTION point phase | ~67%§ | +$30 additive |
| 26 | The Handicapper | 📊 | PAYOUT | $100 | POINT_SET | 67%† | +Hype by difficulty |
| 27 | The Mirror | 🪞 | PAYOUT | $85 | Any total = 7 | 17% | +0.2 Hype |
| 28 | The Bookkeeper | 📒 | WILDCARD | $100 | Every 3rd roll ⚠️ | 33% sched. | +$60 additive |
| 29 | The Pressure Cooker | 🌡️ | WILDCARD | $120 | 5 blank point-phase rolls ⚠️ | per streak | +0.5 Hype + $100 |
| 30 | The Contrarian | 📉 | WILDCARD | $85 | Total < last roll ⚠️ | ~40% | +$75 additive |

*⚠️ = requires new game state field; †of come-out rolls; ‡of all rolls (come-out phase proportion); §of point-phase rolls*

### Synergy Clusters

| Cluster | Members | Coverage / Effect |
|---|---|---|
| **Dice Watchers** | Lookout + Ace McGee | 56% of all rolls between two crew |
| **Parity Split** | Odd Couple + Even Keel | 50% coverage; Hype vs. cash split |
| **The Counter** | Momentum + Echo + Contrarian | ~100% of rolls after first; three different rewards |
| **Dead Space Killers** | Doorman + Grinder + Bookkeeper | Income on come-outs, blank rolls, and every 3rd |
| **Long Game** | Handicapper + Grinder + Pressure Cooker | Hard-point long shoots become jackpot events |
| **7 Redemption** | Silver Lining + Mirror | Bad outcomes (CRAPS_OUT, SEVEN_OUT) generate Hype |

### New State Fields Required

| Field | Type | Used By |
|---|---|---|
| `previousRollTotal` | `number \| null` | Momentum, Echo, Contrarian |
| `shooterRollCount` | `number` | Bookkeeper |
| `pointPhaseBlankStreak` | `number` | Pressure Cooker |
