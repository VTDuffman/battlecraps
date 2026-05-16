# BattleCraps — Crew Member Comprehensive Test Plan

**Scope:** Individual crew member testing — one crew member per test run, no interaction testing.
**Method:** Dev bootstrap API seeded with target bankroll, hype, and crew configuration. UI observation via Chrome Extension. API response inspection for cascade events and hype values.
**Out of Scope:** Multi-crew interactions, crew ordering/slot position effects (except where position is the ability's core mechanic), full gauntlet progression.

---

## Implementation Discrepancies (Pre-Test Findings)

Before testing begins, the following discrepancies were found between in-game descriptions and actual source code. Each should be treated as a defect candidate until confirmed intentional.

| Crew | Description | Actual Code Implementation | Status |
|------|-------------|---------------------------|--------|
| "Hype-Train" Holly | "+0.3× Hype on every **Point Hit**" | Previously triggered on NATURAL (×1.2/×1.5). Fixed — now correctly triggers on POINT_HIT, additive +0.3. Description matches implementation. | ✅ Resolved |
| Big Spender | "+$100 flat to Hardway wins" | Code uses **dynamic additive: 1.5× max-bet**, scaled to current marker target. The flat "$100" description is stale from before FB-024 (Dynamic Additive Scaling). At Marker 0 ($50 target, $5 max-bet) the bonus is ~$8; at Marker 2 ($250 target, $25 max-bet) the bonus is ~$38. | ⚠ Description needs update |
| The Shark | "+$100 flat bonus on Point Hit" | Code uses **dynamic additive: 2.0× max-bet**, scaled to current marker target. Flat "$100" description is stale from before FB-024. At Marker 2 ($250 target, $25 max-bet) the bonus is ~$50. | ⚠ Description needs update |
| The Old Pro | "+1 shooter per marker cleared" | Code is a **no-op execute()**. The Old Pro's actual ability is raising the table bet ceiling from 10% to 15% of the marker target — detected server-side at bet-validation time. The "+1 shooter" description is legacy; the live implementation is the 15% ceiling. | ✅ Resolved |
| Drunk Uncle | "33% chance to add +0.5× Hype — or subtract 0.1× Hype" | Confirmed correct. d1 ≤ 2 (33%) triggers Uncle each roll; odd d2 → +0.5 hype, even d2 → −0.1 hype. **No cooldown** (`cooldownType: 'none'`). Fires every roll subject to the 33% probability. | ✅ Matches implementation |
| The Mechanic | "Set one die to 6" | Sets the **lower-valued** die to 6. Can cause a Seven Out if the other die is 1 (e.g., [1,1] → [6,1] = 7). This is a known risk, not a bug. | ✅ Matches implementation |
| Nervous Intern | "+0.2× Hype on Natural 7/11" | Matches description. Fires on NATURAL only. Additive. | ✅ Matches implementation |

---

## Test Setup Reference

All tests use the dev bootstrap endpoint with direct crew seeding:
```
POST /api/v1/dev/bootstrap
{
  "startingBankroll": <dollars>,
  "startingShooters": <n>,
  "startingCrew": [{ "crewId": <id>, "slot": 0 }],
  "startingHype": <float>
}
```

Crew is seeded directly via `startingCrew` — no need to play through the Pub flow. `startingHype` sets the initial Hype multiplier (default 1.0).

To observe cascade events: inspect the API roll response's `roll.cascadeEvents` array AND the `roll.rollResult` and `run.hype` values. Also observe UI for portrait flash animation and bark text.

**Dynamic additive formula (FB-024):** Additive crew use `Math.round(ADDITIVE_MULT × Math.floor(markerTargetCents × 0.10) / 100) × 100`. This rounds to the nearest dollar. For test cases that reference specific dollar amounts, calculate from the marker target in use.

---

## DICE CREW

---

### Crew 1 — "Lefty" McGuffin ($50)
**Stated Ability:** Re-rolls a Seven Out once per shooter.
**Actual Implementation:** Triggers on `rollResult === 'SEVEN_OUT'`. Re-rolls dice via `rollDice()`, re-classifies the outcome, and sets `sevenOutBlocked = true`. Cooldown type: `per_shooter` (resets when shooter changes).

#### Happy Path

**HP-LEFTY-01: Seven Out is re-rolled and shooter survives**
- Setup: Recruit Lefty. Set a point. Roll until Seven Out occurs.
- Expected: Lefty fires (appears in `cascadeEvents`). Dice change to re-rolled values. If re-roll is not a 7, shooter survives, Hype does NOT reset, game continues in POINT_ACTIVE or resolves per new roll result.
- Verify: `cascadeEvents[0].crewId === 1` (note: `crewName` is `'"Lefty" McGuffin'` with embedded quotes — use `crewId` for reliable matching), `run.shooters` unchanged, `run.hype` not reset to 1.0 (assuming Lefty blocked the seven out).

**HP-LEFTY-02: Lefty fires and re-roll is a winning result (Point Hit)**
- Setup: Recruit Lefty. Set a specific point (e.g., 6). Artificially trigger a Seven Out when point is 6. Lefty re-rolls.
- Expected: If re-roll happens to produce the point number, POINT_HIT should resolve — Pass Line and Odds pay out, game moves to COME_OUT.
- Verify: Roll result changes from SEVEN_OUT to POINT_HIT in the re-evaluated context. Payouts correctly computed.

**HP-LEFTY-03: Lefty fires and re-roll is another non-seven result (NO_RESOLUTION)**
- Setup: Same as HP-LEFTY-01 but re-roll produces a non-7, non-point number.
- Expected: Shooter survives, game continues in POINT_ACTIVE with NO_RESOLUTION. All bets stay active.
- Verify: `roll.rollResult === 'NO_RESOLUTION'`, shooter count unchanged, bets persist.

#### Edge Cases

**EC-LEFTY-01: Second Seven Out in same shooter does NOT trigger Lefty**
- Setup: Recruit Lefty. Get a Seven Out, Lefty fires. Shooter dies if re-roll is also a Seven (see EC-LEFTY-02 below). OR survive via re-roll, then get a second Seven Out with same shooter.
- Expected: Lefty is now on cooldown (`cooldownState: 1`). Seven Out resolves normally — all bets cleared, shooter lost, Hype resets. Lefty does NOT appear in `cascadeEvents`.
- Verify: `cascadeEvents` is empty or Lefty not present. Shooter count decrements. Hype resets to 1.0.

**EC-LEFTY-02: Lefty fires but re-roll is also a Seven**
- Setup: Recruit Lefty. Roll a Seven Out. Observe re-roll.
- Expected: Lefty fires (appears in cascade), sets `sevenOutBlocked = true`, but if re-roll is 7 — what happens? The `sevenOutBlocked` flag is set regardless, but the re-classified result will still be SEVEN_OUT. The shoot dies, hype resets, bets clear.
- Verify: Lefty consumed (cooldown: 1). Outcome should be SEVEN_OUT despite Lefty firing. Confirm shooter dies, hype resets.
- **Risk:** This needs to be tested because the code sets `sevenOutBlocked = true` but still returns SEVEN_OUT from re-roll — the upstream code must handle this flag correctly to determine if shooter gets an extra life.

**EC-LEFTY-03: Lefty per-shooter cooldown resets on new shooter**
- Setup: Recruit Lefty. Fire Lefty (Seven Out, Lefty fires). Shooter dies. New shooter begins.
- Expected: Lefty's `cooldownState` resets to 0 for the new shooter. A Seven Out with the new shooter should trigger Lefty again.
- Verify: On next Seven Out, Lefty appears in `cascadeEvents` again.

**EC-LEFTY-04: Come-out Natural 7 does NOT trigger Lefty**
- Setup: Recruit Lefty. Roll a Natural 7 (COME_OUT, no point set).
- Expected: Lefty does NOT fire. `rollResult === 'NATURAL'`, `cascadeEvents` is empty. Hype unchanged.
- Verify: No Lefty entry in `cascadeEvents`.

**EC-LEFTY-05: Lefty fires, re-roll produces a hardway**
- Setup: Recruit Lefty + Hard 8 bet placed. Seven Out occurs, Lefty re-rolls, re-roll is [4,4]=8.
- Expected: Hard 8 is now a Hard 8 hit — pays 9:1. Game resolves as POINT_HIT (if point is 8) or just a Hardway win. All bets resolved per re-roll result.
- Verify: Hardway payout is computed correctly on the re-rolled result.

---

### Crew 2 — The Physics Professor ($75)
**Stated Ability:** Modify pair values by ±1.
**Actual Implementation:** Triggers only when `dice[0] === dice[1]` (paired dice). Nudges both dice by ±1 toward the active point. Cooldown: `none` — fires on every paired roll with no restriction.

#### Happy Path

**HP-PROF-01: Pair rolled, Professor nudges toward active point**
- Setup: Recruit Physics Prof. Set a point (e.g., point 8). Roll a pair that is near point 8, e.g., [3,3]=6.
- Expected: Professor fires. Since 6+2=8 (within 1 step), dice nudge to [4,4]=8. Roll result changes to POINT_HIT if point is 8 (hard eight!).
- Verify: `cascadeEvents[0].crewName` contains Prof. `roll.dice` change from [3,3] to [4,4]. `roll.rollResult === 'POINT_HIT'`.

**HP-PROF-02: Prof fires on every paired roll (no cooldown)**
- Setup: Recruit Physics Prof. Roll several pairs across multiple rolls.
- Expected: Prof fires every time a pair comes up — no cooldown between triggers. `cooldownState` stays 0.
- Verify: `run.crewSlots[profSlot].cooldownState === 0` after every trigger. Prof in `cascadeEvents` on each paired roll.

**HP-PROF-03: Non-pair roll — Professor does not fire**
- Setup: Recruit Physics Prof (off cooldown). Roll non-pair dice (e.g., [3,4]=7).
- Expected: Prof does NOT fire. `cascadeEvents` empty.
- Verify: Roll resolves normally with original dice. Hype and bets unaffected.

#### Edge Cases

**EC-PROF-01: Pair [1,1] — can only nudge up**
- Setup: Recruit Prof. During POINT_ACTIVE with point 4, roll [1,1]=2.
- Expected: `diceTotal - 2 = 0` (not equal to point), `current value = 1` — cannot nudge down (guard: `value > 1`). Must nudge up to [2,2]=4. This would be a POINT_HIT.
- Verify: Dice become [2,2]=4. Result is POINT_HIT if point is 4.

**EC-PROF-02: Pair [6,6] — can only nudge down**
- Setup: Recruit Prof. During POINT_ACTIVE with point 10, roll [6,6]=12.
- Expected: `diceTotal + 2 = 14` (not valid point), `value >= 6` → nudge down to [5,5]=10. This is POINT_HIT (hard 10 specifically).
- Verify: Dice become [5,5]=10. Hard 10 win.

**EC-PROF-03: Pair on COME_OUT (no point set) — null activePoint**
- Setup: Recruit Prof. No point set (COME_OUT). Roll a pair e.g., [2,2]=4.
- Expected: Prof fires, activePoint is null. What nudge direction does the code take? Without an active point, the logic should still execute but "toward the point" is undefined.
- Verify: Does it crash? Does it default to nudge up/down? Check dice value in result.

**EC-PROF-04: Pair that when nudged produces a Seven Out (POINT_ACTIVE)**
- Setup: Recruit Prof. Point active (e.g., point 6). Roll [4,4]=8. Nudge toward 6: 8-2=6 → nudge to [3,3]=6 (point hit). But what about a pair [3,3]=6 with nudge down? [2,2]=4 — no issue. What about [4,4]=8 nudged down to [3,3]=6?
- Consider: Can nudge logic ever produce [x,x] where sum = 7? Pairs always produce even numbers (2,4,6,8,10,12), and 7 is odd — so pairs can never produce a natural or seven-out. This is actually a key insight: **Prof can never directly cause a Seven Out** on the re-classified result.
- Verify: This assumption — pairs sum to even numbers only, so SEVEN_OUT (sum=7) is impossible after Prof fires.

**EC-PROF-05: Prof fires on consecutive pairs**
- Setup: Recruit Prof. Roll two pairs in back-to-back rolls.
- Expected: Prof fires on both rolls (no cooldown). Dice modified on each.
- Verify: Prof in `cascadeEvents` on both rolls. `cooldownState === 0` throughout.

---

### Crew 3 — The Mechanic ($100)
**Stated Ability:** Set one die to 6 (4-roll cooldown).
**Actual Implementation:** Fires every roll when off cooldown. Sets the **lower-valued die** to 6. If the lower die is already 6 (i.e., both dice ≥ 6, meaning [6,6]), does NOT fire. Cooldown: `per_roll`, `newCooldown: 4`.

#### Happy Path

**HP-MECH-01: Normal roll — lower die set to 6**
- Setup: Recruit Mechanic. Roll [2,4]=6.
- Expected: Mechanic fires. Lower die (2) set to 6. New dice: [6,4]=10. Roll result re-classified as whatever [6,4]=10 means in context.
- Verify: `roll.dice` becomes [6,4] or [4,6]. `roll.diceTotal === 10`. Result re-classified correctly.

**HP-MECH-02: Cooldown activates after firing**
- Setup: Recruit Mechanic. Roll any non-[6,6] dice.
- Expected: Mechanic fires, cooldown = 4. Next 4 rolls Mechanic does not fire. After 4 rolls, fires again.
- Verify: Cooldown state in crew slots decrements 4→3→2→1→0.

**HP-MECH-03: Mechanic converts near-point roll to a Point Hit**
- Setup: Recruit Mechanic. Set point to 10. Roll [4,3]=7 (Seven Out!). Mechanic fires: lower die (3) → 6, new dice [4,6]=10 = Point Hit.
- Expected: SEVEN_OUT is averted, result becomes POINT_HIT (point 10). Pass Line and Odds pay out.
- **This is a key capability** — Mechanic can convert a Seven Out into a Point Hit if the other die + 6 = point.
- Verify: `roll.rollResult` changes from SEVEN_OUT to POINT_HIT. Bankroll increases.

#### Edge Cases

**EC-MECH-01: [6,6] — Mechanic does NOT fire**
- Setup: Recruit Mechanic. Roll [6,6]=12.
- Expected: Lower die is already 6 — Mechanic's guard prevents firing. `cascadeEvents` empty. Result remains 12 (Craps Out on come-out, or No Resolution during POINT_ACTIVE).
- Verify: No Mechanic in `cascadeEvents`. Dice unchanged.

**EC-MECH-02: Mechanic causes a Seven Out**
- Setup: Recruit Mechanic. Roll [1, x] where x+6=7, e.g., [1, 1]=2 → Mechanic sets lower die (1, leftmost) to 6 → [6, 1]=7 = SEVEN_OUT.
- Expected: Mechanic fires (lower die set to 6), new result is SEVEN_OUT. Shooter dies, Hype resets, all bets cleared.
- Verify: Mechanic in `cascadeEvents`. `roll.dice = [6,1]`, `roll.rollResult = 'SEVEN_OUT'`. Shooter count decrements. This is a **known risk** — the Mechanic can cause Seven Outs it was supposedly meant to prevent.

**EC-MECH-03: Mechanic fires during COME_OUT — changes come-out result**
- Setup: Recruit Mechanic. COME_OUT roll [2,5]=7 (Natural). Mechanic fires: lower (2) → 6, new dice [6,5]=11 (still Natural). Or [2,3]=5 (Point Set) → [6,3]=9 (also Point Set but different number).
- Expected: Mechanic changes come-out result. Result re-classified with new dice.
- Verify: Behavior is consistent with re-classified dice total.

**EC-MECH-04: Mechanic cooldown prevents firing on pair**
- Setup: Recruit Mechanic + Physics Prof. Mechanic fires, goes on cooldown=4. Prof is also off cooldown. Roll a pair — does Prof still fire?
- Note: This is technically interaction testing — for crew-solo testing, just verify Mechanic is on cooldown and does not fire for 4 rolls.
- Verify: Mechanic not in `cascadeEvents` during cooldown period.

**EC-MECH-05: Mechanic fire on a hardway — does it break the hardway?**
- Setup: Recruit Mechanic. Hard 8 bet active. Roll [4,4]=8 (Hard 8 hit). Mechanic fires: lower die (4) → 6, new dice [6,4]=10. Hard 8 is now NOT hit — it's a [6,4]=10 which could be Point Hit if point is 10.
- Expected: Mechanic changes what would have been a Hard 8 win into a different outcome. Hard 8 bet may clear depending on new dice value.
- Verify: Hard 8 payout does not occur. New result is resolved per [6,4]=10.

---

## TABLE CREW

---

### Crew 4 — The Mathlete ($75)
**Stated Ability:** Hardways stay up on soft rolls.
**Actual Implementation:** Triggers when: roll is NOT a Seven Out, total is a hardway number (4/6/8/10), dice are NOT a pair (soft), and a hardway bet exists. Restores the bet in `resolvedBets`. Does NOT cover Seven Out (see The Regular for that).

#### Happy Path

**HP-MATH-01: Soft roll on hardway number — bet survives**
- Setup: Recruit Mathlete. Place Hard 6 bet. Set a point. Roll a soft 6 (e.g., [5,1]=6 or [4,2]=6).
- Expected: Without Mathlete, Hard 6 bet would be cleared. With Mathlete, `resolvedBets.hardways.hard6` is restored. Bet remains active. `hardwayProtected` flag set.
- Verify: Mathlete in `cascadeEvents`. Hard 6 bet still showing in UI on next roll. Bankroll not debited for re-placement.

**HP-MATH-02: All four hardway bets survive soft rolls on their respective numbers**
- Setup: Recruit Mathlete. Place Hard 4, Hard 6, Hard 8, Hard 10 bets. Roll soft 4 ([3,1]), observe protection. Then soft 6 ([5,1]), soft 8 ([6,2] or [5,3]), soft 10 ([6,4]).
- Expected: Each soft roll triggers Mathlete protection for that hardway number. Bets persist.
- Verify: Bets survive across multiple soft rolls.

#### Edge Cases

**EC-MATH-01: Seven Out — Mathlete does NOT protect hardways**
- Setup: Recruit Mathlete. Place Hard 8 bet. Roll Seven Out.
- Expected: Mathlete does NOT fire (code explicitly excludes SEVEN_OUT). Hard 8 cleared. Mathlete not in `cascadeEvents`.
- Verify: `cascadeEvents` empty. Bankroll not refunded for Hard 8.

**EC-MATH-02: Hard roll on hardway number — Mathlete does not fire (bet wins normally)**
- Setup: Recruit Mathlete. Place Hard 8. Roll [4,4]=8 (Hard 8).
- Expected: Hard 8 pays out at 9:1 normally. Mathlete does NOT fire (the trigger requires `!isHardway`). Win is processed normally.
- Verify: Mathlete not in `cascadeEvents`. Hard 8 payout occurs.

**EC-MATH-03: Soft roll on hardway number with NO active bet — Mathlete does not fire**
- Setup: Recruit Mathlete. NO hardway bets placed. Roll soft 8 ([6,2]).
- Expected: Mathlete trigger checks `bets.hardways[key] > 0` — false, so does not fire. No protection needed.
- Verify: `cascadeEvents` empty. No-resolution proceeds normally.

**EC-MATH-04: Soft roll on non-hardway number — Mathlete does not fire**
- Setup: Recruit Mathlete. Place Hard 6 bet. Roll [4,3]=7 (SEVEN_OUT) or [5,2]=7. Actually any non-hardway-number roll like [3,4]=7 (Seven Out — EC-MATH-01 above) or [2,3]=5 (No Resolution for hardways since 5 is not 4/6/8/10).
- Expected: Mathlete does not fire because 5 is not a hardway number. Hard 6 bet unaffected (not cleared).
- Verify: Hard 6 bet unchanged, Mathlete not in cascade.

---

### Crew 5 — The Floor Walker ($75)
**Stated Ability:** First Seven Out doesn't clear Pass Line.
**Actual Implementation:** Triggers on SEVEN_OUT when Pass Line bet > 0. Refunds Pass Line stake to `baseStakeReturned`. Does NOT prevent shooter death. Does NOT protect Odds bet. Cooldown: `per_shooter`.

#### Happy Path

**HP-FW-01: First Seven Out — Pass Line stake refunded**
- Setup: Recruit Floor Walker. Set a point. Place Pass Line + Odds. Roll Seven Out.
- Expected: Floor Walker fires. Pass Line stake returned (bankroll gets back the pass line amount). Odds bet is still lost. Shooter dies. Hype resets. Floor Walker cooldown: 1.
- Verify: Floor Walker in `cascadeEvents`. Bankroll increases by Pass Line amount vs. what it would have been without Floor Walker. Shooter count decrements. Hype = 1.0 after.

**HP-FW-02: Shooter dies but Floor Walker resets for new shooter**
- Setup: Continue from HP-FW-01. Shooter died, new shooter starts.
- Expected: Floor Walker's `per_shooter` cooldown resets to 0. New shooter's first Seven Out should trigger Floor Walker again.
- Verify: On next Seven Out in new shooter, Floor Walker in `cascadeEvents`.

#### Edge Cases

**EC-FW-01: Second Seven Out in same shooter — Floor Walker does NOT fire**
- Setup: Recruit Floor Walker. Fire it on first Seven Out (shooter survives... wait — shooter DOES die even with Floor Walker). Hmm. The shooter dies on every Seven Out. So for the same shooter to have a second Seven Out, that's impossible — the shooter is already gone.
- **Clarification needed:** Since every Seven Out kills the shooter, the "per_shooter" cooldown is consumed and reset every time a new shooter starts. There is no "second Seven Out in same shooter" scenario unless the code has a bug where the shooter doesn't die. This is actually a bug surface to probe.
- Test: Verify that after Floor Walker fires, the shooter count DOES decrement (i.e., Floor Walker doesn't accidentally prevent shooter death).
- Verify: `run.shooters` decrements after Seven Out even when Floor Walker fires.

**EC-FW-02: Come-out Natural 7 does NOT trigger Floor Walker**
- Setup: Recruit Floor Walker. Roll Natural 7 on COME_OUT.
- Expected: Floor Walker trigger is SEVEN_OUT only (POINT_ACTIVE phase 7). NATURAL is different roll result. Floor Walker does not fire.
- Verify: `cascadeEvents` empty. Normal Natural payout.

**EC-FW-03: Seven Out with NO Pass Line bet — Floor Walker does not fire**
- Setup: Recruit Floor Walker. Somehow reach POINT_ACTIVE with 0 pass line (shouldn't be possible normally since pass line is required). Edge case: what if pass line was already cleared by another mechanism?
- Expected: `ctx.bets.passLine === 0` → Floor Walker trigger fails. Does not fire.
- Verify: Normal Seven Out behavior.

**EC-FW-04: Odds bet is NOT protected**
- Setup: Recruit Floor Walker. Place Pass Line + Odds. Roll Seven Out.
- Expected: Pass Line stake refunded, but Odds stake is NOT refunded (still lost).
- Verify: Bankroll delta = Pass Line stake returned, NOT (Pass Line + Odds) stake.

---

### Crew 6 — The Regular ($100)
**Stated Ability:** Grants a free Odds bonus equal to the Pass Line bet on a Natural.
**Actual Implementation:** Triggers on `rollResult === 'NATURAL'` when `bets.passLine > 0`. Adds `ctx.bets.passLine` (in cents) to `additives`. Amplified by Hype and multipliers in `settleTurn()`. No cooldown.

**Design niche:** The Shark covers POINT_HIT dynamic bonuses; The Regular covers NATURAL wins with a scaling bonus (bet-size dependent, not flat). Together they cover both positive win conditions without overlapping.

#### Happy Path

**HP-REG-01: Natural 7 — bonus equal to Pass Line bet added**
- Setup: Recruit The Regular. Place $10 Pass Line. Roll Natural 7 on COME_OUT.
- Expected: The Regular fires. `additives += 1000` (= $10 Pass Line). At Hype 1.0× with no multipliers: total payout = $10 (Pass Line 1:1) + $10 (Regular bonus) + $10 (stake returned) = $30 received.
- Verify: The Regular in `cascadeEvents`. Roll Log shows extra bonus in payout. Bankroll increases by correct amount.

**HP-REG-02: Natural 11 also triggers The Regular**
- Setup: Recruit The Regular. Place $25 Pass Line. Roll Natural 11 ([5,6] or [6,5]).
- Expected: Same as Natural 7. Bonus = $25. Total win amplified accordingly.
- Verify: The Regular fires on 11, not just 7. Bonus scales with bet size.

**HP-REG-03: Bonus scales with Pass Line bet size**
- Setup: Recruit The Regular. Test with $5, $25, and $50 Pass Line bets — roll a Natural for each.
- Expected: Bonus is exactly the Pass Line bet amount each time ($5, $25, $50).
- Verify: `additives === ctx.bets.passLine` confirmed via payout delta.

**HP-REG-04: Bonus is amplified by Hype**
- Setup: Bootstrap with Hype = 2.0×. Place $10 Pass Line. Roll Natural.
- Expected: `(basePassLinePayout + additives) × hype = ($10 + $10) × 2.0 = $40` win (plus $10 stake returned).
- Verify: Hype amplification confirmed in payout.

#### Edge Cases

**EC-REG-01: Seven Out does NOT trigger The Regular**
- Setup: Recruit The Regular. Set a point, roll Seven Out.
- Expected: `rollResult === 'SEVEN_OUT'` — Regular does not fire. Normal Seven Out (Pass Line lost, shooter dies).
- Verify: `cascadeEvents` empty. No bonus payout.

**EC-REG-02: Point Hit does NOT trigger The Regular**
- Setup: Recruit The Regular. Set a point, hit it.
- Expected: `rollResult === 'POINT_HIT'` — Regular does not fire. Normal Point Hit payout only.
- Verify: `cascadeEvents` empty. No Regular bonus on top of Pass Line/Odds payout.

**EC-REG-03: Natural with $0 Pass Line — Regular does not fire**
- Setup: Recruit The Regular. Somehow reach COME_OUT with no Pass Line bet placed (edge case — normally Pass Line is required). Roll Natural.
- Expected: `ctx.bets.passLine === 0` — early return, no bonus.
- Verify: `cascadeEvents` empty. Game proceeds normally.

---

## PAYOUT CREW

---

### Crew 7 — Big Spender ($100)
**Stated Ability:** Bonus on Hardway wins.
**Actual Implementation:** Triggers when `baseHardwaysPayout > 0`. Adds **1.5× current max-bet** to `additives` (dynamic, scaled to marker target). This bonus IS amplified by Hype and multipliers in `settleTurn()`.

**⚠ VERIFY:** In-game description may still say "+$100 flat" — this is stale from before FB-024 (Dynamic Additive Scaling). The code uses `ADDITIVE_MULT = 1.5` with `maxBet = Math.floor(markerTargetCents × 0.10)`. Expected bonus at Marker 2 ($250 target): `Math.round(1.5 × 250 / 100) × 100 = $400` (not $100).

#### Happy Path

**HP-BIG-01: Hard 8 hit — dynamic bonus added to payout**
- Setup: Recruit Big Spender. Use Marker 0 ($50 target, maxBet = $5). Place Hard 8 bet ($5 max). Roll [4,4]=8 (Hard 8).
- Expected: Hard 8 pays 9:1 = $45 on $5 bet. Big Spender adds `Math.round(1.5 × 500 / 100) × 100 = 800¢ = $8` (rounded to nearest dollar). With Hype 1.0× and no other multipliers: total win ≈ $45 + $8 = $53.
- Verify: Big Spender in `cascadeEvents`. Payout delta includes the additive.

**HP-BIG-02: Big Spender fires on any hardway hit (Hard 4, 6, 8, 10)**
- Setup: Recruit Big Spender. Test each hardway: Hard 4 ([2,2]=4), Hard 6 ([3,3]=6), Hard 10 ([5,5]=10).
- Expected: Big Spender fires for each. Dynamic additive added to each.
- Verify: Consistent bonus across all four hardways at same marker level.

**HP-BIG-03: Additive is amplified by Hype**
- Setup: Bootstrap with Hype > 1.0 (e.g., 1.5×) and verify additive amplification on Hard 8 hit.
- Expected: `(baseHardwaysPayout + additives) × hype` in settlement.
- Verify: Combined multiplier effect observed. Additive grows with Hype.

#### Edge Cases

**EC-BIG-01: No hardway bet active — Big Spender does NOT fire**
- Setup: Recruit Big Spender. No hardway bets. Roll any outcome.
- Expected: `baseHardwaysPayout === 0`, trigger fails. `cascadeEvents` empty.
- Verify: No payout bonus observed.

**EC-BIG-02: Soft hardway roll (not hard hit) — Big Spender does NOT fire**
- Setup: Recruit Big Spender. Hard 8 bet. Roll [6,2]=8 (soft 8, not hard). Hard 8 bet clears (loses).
- Expected: `baseHardwaysPayout === 0` (bet cleared, no win). Big Spender does not fire.
- Verify: `cascadeEvents` empty for Big Spender.

**EC-BIG-03: Multiple active hardway bets both hit on same roll (impossible — only one pair per roll)**
- Note: Two different hardways can't both hit on the same roll (dice produce one number). Skip this case.

---

### Crew 8 — The Shark ($100)
**Stated Ability:** Bonus on Point Hit.
**Actual Implementation:** Triggers on `rollResult === 'POINT_HIT'`. Adds **2.0× current max-bet** to `additives` (dynamic, scaled to marker target). IS amplified by Hype and multipliers.

**⚠ VERIFY:** In-game description may still say "+$100 flat" — this is stale from before FB-024 (Dynamic Additive Scaling). The code uses `ADDITIVE_MULT = 2.0`. Expected bonus at Marker 0 ($50 target, maxBet = $5): `Math.round(2.0 × 500 / 100) × 100 = 1000¢ = $10`. At Marker 2 ($250 target, maxBet = $25): `Math.round(2.0 × 2500 / 100) × 100 = 5000¢ = $50`.

#### Happy Path

**HP-SHARK-01: Point Hit — dynamic bonus added**
- Setup: Recruit The Shark. Use Marker 0 ($50 target). Set a point. Hit the point.
- Expected: Shark fires. Additive = `Math.round(2.0 × 500 / 100) × 100 = $10`. At Hype 1.0×: total payout = Pass Line win + Odds win + $10.
- Verify: Shark in `cascadeEvents`. Roll Log shows extra bonus in payout breakdown. Bankroll increases by expected amount.

**HP-SHARK-02: Shark fires on any point number**
- Setup: Test with points 4, 5, 6, 8, 9, 10 separately.
- Expected: Shark fires every time. Point number doesn't matter.
- Verify: Consistent behavior across all point values.

**HP-SHARK-03: Bonus scales with marker target**
- Setup: Bootstrap at different floors/markers (e.g., Marker 0 and Marker 6). Hit a point at each.
- Expected: Shark additive grows proportionally: 2× maxBet at each respective marker.
- Verify: Higher-floor bonus is meaningfully larger.

#### Edge Cases

**EC-SHARK-01: Natural 7/11 does NOT trigger Shark**
- Setup: Recruit Shark. Roll Natural on COME_OUT.
- Expected: `rollResult === 'NATURAL'`, not 'POINT_HIT'. Shark does NOT fire.
- Verify: `cascadeEvents` empty. No bonus.

**EC-SHARK-02: Seven Out does NOT trigger Shark**
- Setup: Recruit Shark. Roll Seven Out.
- Expected: No Shark trigger. Normal Seven Out.
- Verify: `cascadeEvents` empty.

**EC-SHARK-03: Bonus amplified at elevated Hype**
- Setup: Bootstrap with a run where Hype is 2.0× (or build Hype via naturals first). Hit a point.
- Expected: Dynamic additive (e.g., $10 at Marker 0) is effectively doubled to $20 contribution.
- Verify: `(basePassLinePayout + baseOddsPayout + additives) × hype` in settlement.

---

### Crew 9 — The Whale ($150)
**Stated Ability:** 1.2× final payout multiplier.
**Actual Implementation:** Triggers when ANY positive payout exists (`basePassLine > 0 || baseOdds > 0 || baseHardways > 0`). Pushes 1.2 into `multipliers` array. Multipliers are applied in `settleTurn()` multiplicatively with Hype.

#### Happy Path

**HP-WHALE-01: Pass Line Natural win — multiplied by 1.2×**
- Setup: Recruit Whale. Roll Natural.
- Expected: Whale fires. $5 Pass Line win at 1.0× Hype = $5. With Whale: $5 × 1.2 = $6.
- Verify: Whale in `cascadeEvents`. Payout is 1.2× normal amount. Roll Log reflects correct total.

**HP-WHALE-02: Point Hit — multiplied by 1.2×**
- Setup: Recruit Whale. Set point 8. Roll [4,4]=8. $10 Pass Line + $10 Odds (6:5).
- Expected: Base payout = $10 (Pass Line) + $12 (Odds at 6:5 = $10 × 1.2) = $22 win. With Whale: $22 × 1.2 = $26.40.
- Verify: Payout is 1.2× the base amount.

**HP-WHALE-03: Whale multiplier stacks with Hype**
- Setup: Build Hype to 1.5× (via bootstrapped Hype), then hit a point.
- Expected: `payout = base × hype × whale = base × 1.5 × 1.2 = base × 1.8`.
- Verify: Combined multiplier effect observed.

#### Edge Cases

**EC-WHALE-01: Seven Out (pure loss) — Whale does NOT fire**
- Setup: Recruit Whale. Roll Seven Out with Pass Line and Odds active.
- Expected: `basePassLinePayout === 0`, `baseOddsPayout === 0`, `baseHardwaysPayout === 0` on a loss. Whale trigger fails.
- Verify: `cascadeEvents` empty. No multiplier applied.

**EC-WHALE-02: Craps Out (come-out loss) — Whale does NOT fire**
- Setup: Recruit Whale. Roll Craps (2, 3, or 12) on COME_OUT.
- Expected: Pass Line loses. All payouts zero. Whale does not fire.
- Verify: Normal craps loss, no Whale in cascade.

**EC-WHALE-03: Hard 8 win with no Pass Line/Odds — Whale fires on hardway only**
- Setup: Recruit Whale. Place only Hard 8 bet (no Pass Line). Roll Hard 8.
- Note: Pass Line is required for COME_OUT rolls — this scenario would require the Hard 8 win happening during POINT_ACTIVE where Pass Line is already placed.
- Expected: `baseHardwaysPayout > 0` alone triggers Whale. 1.2× applied to hardway payout.
- Verify: Whale fires, multiplier applied to hardway win.

---

## HYPE CREW

---

### Crew 10 — Nervous Intern ($50)
**Stated Ability:** +0.2× Hype on Natural 7/11.
**Actual Implementation:** Triggers on `rollResult === 'NATURAL'`. Additively adds 0.2 to Hype. Fires every Natural with no cooldown.

#### Happy Path

**HP-INTERN-01: Natural 7 — Hype increases by 0.2**
- Setup: Recruit Nervous Intern. Roll Natural 7 on COME_OUT.
- Expected: Intern fires. Hype increases: 1.0 → 1.2.
- Verify: Intern in `cascadeEvents`. `run.hype === 1.2` after roll.

**HP-INTERN-02: Natural 11 also triggers Intern**
- Setup: Recruit Nervous Intern. Roll Natural 11 ([5,6] or [6,5]).
- Expected: Same as Natural 7. Hype 1.0 → 1.2.
- Verify: Fires on 11 specifically, not just 7.

**HP-INTERN-03: Hype accumulates across multiple Naturals**
- Setup: Recruit Nervous Intern. Roll 3 Naturals in sequence.
- Expected: Hype: 1.0 → 1.2 → 1.4 → 1.6.
- Verify: Hype increases additively with each Natural.

**HP-INTERN-04: Seven Out resets Hype, Intern does not prevent this**
- Setup: Recruit Nervous Intern. Build Hype to 1.4. Roll Seven Out.
- Expected: Hype resets to 1.0. Intern does NOT fire on Seven Out (trigger is NATURAL only).
- Verify: `run.hype === 1.0` after Seven Out.

#### Edge Cases

**EC-INTERN-01: Point Hit does NOT trigger Intern**
- Setup: Recruit Intern. Set point, hit point.
- Expected: Intern trigger requires NATURAL. POINT_HIT is a different rollResult. Intern does not fire.
- Verify: `cascadeEvents` empty. Hype unchanged from point hit.

**EC-INTERN-02: Hype accumulates to high values — no cap observed**
- Setup: Recruit Intern. Roll many Naturals.
- Expected: Hype keeps increasing (1.0, 1.2, 1.4, … 3.0+). No apparent cap in engine code.
- Verify: Hype continues to grow. Check if there's an undocumented cap.

---

### Crew 11 — "Hype-Train" Holly ($75)
**Stated Ability (in-game):** "+0.3× Hype on every Point Hit."
**Actual Implementation (after fix):** Triggers on `rollResult === 'POINT_HIT'`. Additive: Hype += 0.3 on each Point Hit. Rounded to 4 decimal places.

**Fix applied:** DEF-002 resolved — code previously triggered on NATURAL with multiplicative Hype (×1.2/×1.5). Corrected to match description: POINT_HIT trigger, additive +0.3.

#### Happy Path

**HP-HOLLY-01: Point Hit — Hype increases by +0.3**
- Setup: Recruit Holly. Ensure Hype = 1.0. Set a point, hit it.
- Expected: Holly fires. Hype: 1.0 + 0.3 = 1.3.
- Verify: Holly in `cascadeEvents`. `run.hype === 1.3`.

**HP-HOLLY-02: Hype accumulates across multiple Point Hits**
- Setup: Recruit Holly. Hit the point 3 times across separate shooters.
- Expected: Hype: 1.0 → 1.3 → 1.6 → 1.9.
- Verify: Additive accumulation confirmed. Hype grows with each Point Hit.

**HP-HOLLY-03: Seven Out resets Hype; Holly does not fire**
- Setup: Recruit Holly. Build Hype to 1.6 via two Point Hits. Roll Seven Out.
- Expected: Seven Out resets Hype to 1.0. Holly does NOT fire (trigger is POINT_HIT only).
- Verify: `cascadeEvents` empty on Seven Out. `run.hype === 1.0` after.

#### Edge Cases

**EC-HOLLY-01: Natural does NOT trigger Holly**
- Setup: Recruit Holly. Roll Natural 7 or 11 on COME_OUT.
- Expected: `rollResult === 'NATURAL'`, not POINT_HIT. Holly does NOT fire. Hype unchanged.
- Verify: `cascadeEvents` empty. Hype unchanged.

**EC-HOLLY-02: Rounding behavior on additive Hype**
- Setup: Recruit Holly. Hit point multiple times to accumulate Hype with potential float drift (e.g., 1.0 + 0.3 + 0.3 + 0.3 = 1.9 exactly, then 1.9 + 0.3 = 2.2).
- Expected: Hype value is rounded to 4 decimal places — no IEEE-754 accumulation artifacts.
- Verify: `run.hype` values are clean decimals at each step.

---

### Crew 12 — The Drunk Uncle ($100)
**Stated Ability:** "Has a 33% chance to add +0.5× Hype — or subtract 0.1× Hype."
**Actual Implementation:** No cooldown (`cooldownType: 'none'`). On every roll, rolls phantom dice d1 and d2. Activates when `d1 ≤ 2` (~33% chance). If active: odd d2 → Hype **+0.5**; even d2 → Hype **−0.1**. Probability split when active is ~50/50 between the two outcomes. Description matches implementation.

#### Happy Path

**HP-UNCLE-01: Uncle activates — Hype increases by +0.5**
- Setup: Recruit Drunk Uncle. Roll any outcome.
- Expected: Uncle fires when d1 ≤ 2 and d2 is odd. Hype increases by 0.5. Uncle may or may not fire on any given roll (~33% chance overall, ~16.7% for the +0.5 outcome specifically).
- Verify: When Uncle in `cascadeEvents` with a positive delta: `run.hype` increases by 0.5.

**HP-UNCLE-02: Uncle activates — Hype decreases by -0.1**
- Setup: Recruit Drunk Uncle. Roll many times until Uncle fires with even d2.
- Expected: Hype decreases by 0.1. This is expected behaviour, not a defect.
- Verify: When Uncle in `cascadeEvents` with a negative delta: `run.hype` decreases by 0.1.

**HP-UNCLE-03: Uncle does NOT fire every roll**
- Setup: Recruit Drunk Uncle. Roll 10 times.
- Expected: Uncle fires on roughly 1/3 of rolls (d1 ≤ 2). Many rolls will have no Uncle in `cascadeEvents`.
- Verify: Not every roll has Uncle in `cascadeEvents`.

**HP-UNCLE-04: Hype accumulates across multiple Uncle triggers**
- Setup: Recruit Drunk Uncle. Roll 20+ times.
- Expected: Net Hype change depends on the mix of +0.5 and −0.1 outcomes. On average, Hype trends upward (expected value per activation = 0.5×0.5 − 0.1×0.5 = +0.2).
- Verify: Hype fluctuates but generally trends upward over many rolls.

#### Edge Cases

**EC-UNCLE-01: Hype after Seven Out — Uncle fires on same roll?**
- Setup: Recruit Drunk Uncle (off cooldown). Roll Seven Out.
- Expected: Uncle may fire during the cascade (if d1 ≤ 2). The cascade runs before `computeNextState()`, so any hype change from Uncle is applied but then immediately overwritten by the Seven Out reset to 1.0.
- Verify: If Uncle in `cascadeEvents`, `run.hype === 1.0` after (Seven Out reset wins). Uncle's boost/penalty is canceled by the reset.

**EC-UNCLE-02: Hype floor — Uncle cannot reduce Hype below 0**
- Setup: Start with low Hype (1.0), roll until Uncle fires with −0.1 multiple times in a row.
- Expected: Hype decreases correctly with each −0.1 hit. No floor observed in code — Hype can theoretically reach 0 or below if −0.1 fires repeatedly without recovery.
- Verify: Hype decreases by 0.1 per negative trigger. Note if any floor behaviour is observed.

---

## WILDCARD CREW

---

### Crew 13 — The Mimic ($50)
**Stated Ability:** Copies previous crew member's ability.
**Actual Implementation:** Cascade-level logic: copies the `execute()` of the last crew who fired BEFORE Mimic's slot. If no prior crew fired, Mimic is a no-op.

**Solo testing constraint:** When testing Mimic alone, there is no prior crew — Mimic should be a no-op. This tests the graceful handling of the solo case.

#### Happy Path (Solo — No-op scenario)

**HP-MIMIC-01: Mimic alone on rail — no prior crew to copy**
- Setup: Recruit Mimic alone (no other crew slots filled). Roll any outcome.
- Expected: `lastFiredMember === null` in cascade. Mimic's execute() no-op is called. No effect. `cascadeEvents` — Mimic either doesn't appear (context unchanged) or appears with zero delta.
- Verify: No crash. Game proceeds normally. Hype/payouts unchanged.

**HP-MIMIC-02: Mimic alone — multiple roll types**
- Setup: Recruit Mimic alone. Roll Natural, Point Set, Point Hit, Seven Out in sequence.
- Expected: No effect from Mimic on any roll type. All outcomes resolved by base engine.
- Verify: Game completes without errors. No unintended payouts or Hype changes from Mimic.

#### Edge Cases

**EC-MIMIC-01: Mimic in slot 0 — cannot copy anyone (always no-op even with other crew)**
- Note: This is technically interaction testing (requires other crew) — document as out of scope for now, but note the slot position dependency for future interaction test plan.

---

### Crew 14 — The Old Pro ($250)
**Stated Ability:** Raises the table bet ceiling from 10% to 15% of the marker target.
**Actual Implementation:** No-op `execute()`. The Old Pro's ability is entirely server-side: detected in the crew slots before bet validation, passes `ceilingPct = 0.15` (instead of 0.10) to `getMaxBet()`. This allows players to bet up to 15% of marker target on Pass Line and Hardways.

#### Happy Path

**HP-OLDPRO-01: Old Pro on rail — max bet ceiling raised to 15%**
- Setup: Recruit Old Pro at Marker 0 ($50 target). Without Old Pro, max bet = $5 (10% of $50). With Old Pro, max bet should be $7.50 (15% of $50 → rounded down = $7).
- Expected: Player can place Pass Line bets up to the 15% ceiling, verified by the server accepting a bet that would otherwise be rejected.
- Verify: API accepts a bet of $7 (or the floor-rounded 15% amount). Without Old Pro, same bet is rejected as over-limit.

**HP-OLDPRO-02: Bet ceiling applies to both Pass Line and Hardway bets**
- Setup: Recruit Old Pro. Attempt to place Pass Line and Hardway bets at the elevated ceiling.
- Expected: Both Pass Line and Hardway max bets are governed by the 15% ceiling.
- Verify: Maximum bet amounts accepted by the server match `Math.floor(markerTargetCents × 0.15)`.

**HP-OLDPRO-03: Old Pro execute() is always a no-op**
- Setup: Recruit Old Pro. Roll any outcome.
- Expected: Old Pro does NOT appear in `cascadeEvents`. His ability is not per-roll; it is applied at bet-validation time only.
- Verify: `cascadeEvents` never contains Old Pro entry across Natural, Point Hit, Seven Out, etc.

#### Edge Cases

**EC-OLDPRO-01: Without Old Pro, bets above 10% are rejected**
- Setup: No Old Pro on rail. Attempt to place Pass Line bet at 12% of marker target.
- Expected: API returns validation error (bet too high).
- Verify: Bet is rejected. With Old Pro on rail, same bet is accepted.

---

### Crew 15 — The Lucky Charm ($50)
**Stated Ability:** "Locks Hype at 2.0× if alone on rail."
**Actual Implementation:** Cascade-level check. If Lucky Charm is the ONLY crew member on the rail, applies `Math.max(ctx.hype, 2.0)` — a floor of 2.0, not a hard lock. If Hype is already above 2.0, it stays at that higher value.

#### Happy Path

**HP-CHARM-01: Lucky Charm alone — Hype floored at 2.0 on every roll**
- Setup: Recruit Lucky Charm as the only crew member. Roll any outcome (Natural, Point Hit, Seven Out, etc.).
- Expected: Lucky Charm fires. Hype is set to `Math.max(currentHype, 2.0)`. Starting at 1.0, becomes 2.0.
- Verify: Lucky Charm in `cascadeEvents`. `run.hype === 2.0` after roll.

**HP-CHARM-02: Seven Out does not drop Hype below 2.0**
- Setup: Recruit Lucky Charm alone. Accumulate Hype to 2.0 via first few rolls. Roll Seven Out.
- Expected: Seven Out normally resets Hype to 1.0. But Lucky Charm fires AFTER (in cascade), applying `Math.max(1.0, 2.0) = 2.0`. Net result: Hype stays at 2.0.
- **Critical check:** Does the cascade run BEFORE or AFTER the Seven Out Hype reset? The cascade runs on `initialCtx` which has the hype from the roll resolution — if Seven Out sets hype=1.0 in `initialCtx`, Lucky Charm applies max(1.0, 2.0)=2.0. This should work.
- Verify: `run.hype === 2.0` after Seven Out with Lucky Charm solo.

**HP-CHARM-03: Hype above 2.0 — Lucky Charm preserves higher value**
- Setup: Recruit Lucky Charm alone. Somehow reach Hype > 2.0 (this may be impossible solo since Lucky Charm doesn't boost Hype above 2.0, just floors it). If Hype starts above 2.0 (bootstrapped), Lucky Charm should not reduce it.
- Expected: `Math.max(2.5, 2.0) = 2.5`. Lucky Charm fires, Hype stays at 2.5.
- Verify: Lucky Charm doesn't cap or reduce Hype if it's already high.

#### Edge Cases

**EC-CHARM-01: Lucky Charm on rail from session start — immediate 2.0× Hype**
- Setup: Recruit Lucky Charm at Pub (Marker 1). Return to table.
- Expected: On first roll, Lucky Charm fires and floors Hype at 2.0 immediately.
- Verify: `run.hype === 2.0` on first roll of new segment.

**EC-CHARM-02: Lucky Charm with another crew member — does NOT apply floor**
- Note: This is interaction testing — flagged as out of scope. Document for future test plan.
- The "alone on rail" condition means any second crew member disables the Lucky Charm floor. This is a key design constraint worth verifying in future.

---

## STARTER CREW — DICE

---

### Crew 16 — The Lookout
**Stated Ability:** +0.15 Hype whenever a 6 appears on either die.
**Actual Implementation:** Triggers when `ctx.dice[0] === 6 || ctx.dice[1] === 6`. Adds 0.15 to Hype, rounded to 4 decimal places. No cooldown. Fires on ~31% of all rolls (11 of 36 combinations include at least one 6).

#### Happy Path

**HP-LOOKOUT-01: Die shows 6 — Hype increases by 0.15**
- Setup: Recruit The Lookout. Bootstrap Hype = 1.0. Roll [6,3]=9 (NO_RESOLUTION during POINT_ACTIVE).
- Expected: Lookout fires. Hype: 1.0 + 0.15 = 1.15.
- Verify: Lookout in `cascadeEvents`. `run.hype === 1.15` after roll.

**HP-LOOKOUT-02: Both dice show 6 — still +0.15 (no double trigger)**
- Setup: Recruit The Lookout. Roll [6,6]=12 (Craps Out on come-out or NO_RESOLUTION in point phase).
- Expected: Lookout fires once, regardless of both dice being 6. Hype += 0.15 only.
- Verify: Only one Lookout entry in `cascadeEvents`. Hype increases by exactly 0.15.

**HP-LOOKOUT-03: Lookout fires on come-out rolls when a 6 appears**
- Setup: Recruit The Lookout. Roll [6,5]=11 (Natural), [6,2]=8 (Point Set to 8).
- Expected: Lookout fires on both — a 6 on either die triggers regardless of roll result (Natural, Point Set, etc.).
- Verify: Lookout in `cascadeEvents` for each. Hype increases by 0.15 on each.

**HP-LOOKOUT-04: Hype accumulates across multiple 6-die rolls**
- Setup: Recruit The Lookout. Roll 4 successive rolls each containing at least one 6.
- Expected: Hype: 1.0 → 1.15 → 1.30 → 1.45 → 1.60.
- Verify: Additive accumulation. Rounding correct to 4 decimal places at each step.

#### Edge Cases

**EC-LOOKOUT-01: No 6 on either die — Lookout does NOT fire**
- Setup: Recruit The Lookout. Roll [3,4]=7 (Seven Out or Natural 7).
- Expected: `ctx.dice[0] !== 6 && ctx.dice[1] !== 6` — Lookout trigger fails. Lookout not in `cascadeEvents`.
- Verify: `cascadeEvents` empty. Hype unchanged.

**EC-LOOKOUT-02: Seven Out with a 6 die — Lookout fires but Hype resets**
- Setup: Recruit The Lookout. During POINT_ACTIVE, roll [6,1]=7 (Seven Out).
- Expected: Lookout fires (a 6 is present), adds 0.15 to Hype during the cascade. However, the Seven Out state transition resets Hype to 1.0 after settlement.
- Verify: Lookout in `cascadeEvents`. After roll, `run.hype === 1.0` (Seven Out reset wins over Lookout's boost).

**EC-LOOKOUT-03: Rounding — four Lookout triggers accumulate cleanly**
- Setup: Recruit The Lookout. Roll 4 dice containing a 6 in sequence.
- Expected: 1.0 + 0.15 + 0.15 + 0.15 + 0.15 = 1.60 exactly — no float drift.
- Verify: `run.hype === 1.60` after 4 triggers. No rounding artifacts (code uses `Math.round(...× 10_000) / 10_000`).

---

### Crew 17 — "Ace" McGee
**Stated Ability:** Dynamic additive (0.75× max-bet) whenever a 1 appears on either die.
**Actual Implementation:** Triggers when `ctx.dice[0] === 1 || ctx.dice[1] === 1`. Adds `Math.round(0.75 × maxBet / 100) × 100` cents to `additives`. No cooldown. Fires on ~31% of all rolls (11 of 36 combinations include at least one 1). Additive is amplified by Hype and multipliers in `settleTurn()`.

#### Happy Path

**HP-ACE-01: Die shows 1 — additive added to payout**
- Setup: Recruit "Ace" McGee at Marker 0 ($50 target, maxBet = 500¢). Roll [1,4]=5 (Point Set or NO_RESOLUTION in point phase).
- Expected: Ace fires. `additive = Math.round(0.75 × 500 / 100) × 100 = Math.round(3.75) × 100 = 400¢ = $4`.
- Verify: Ace in `cascadeEvents`. `roll.cascadeEvents[n].contextDelta.additives` reflects the new total.

**HP-ACE-02: Ace fires on come-out rolls with a 1**
- Setup: Recruit "Ace" McGee. Roll [1,6]=7 (Natural) on COME_OUT.
- Expected: Ace fires — a 1 on die[0] triggers regardless of roll result. Additive added.
- Verify: Ace in `cascadeEvents`. Pass Line Natural payout includes the additive bonus.

**HP-ACE-03: Additive scales with marker target**
- Setup: Recruit "Ace" McGee. Test at Marker 0 ($50 target) and Marker 3 ($1,500 target).
- Expected: At Marker 3, maxBet = 15,000¢. Additive = `Math.round(0.75 × 15000 / 100) × 100 = Math.round(112.5) × 100 = 11300¢ = $113`.
- Verify: Additive grows proportionally with floor stakes.

#### Edge Cases

**EC-ACE-01: No 1 on either die — Ace does NOT fire**
- Setup: Recruit "Ace" McGee. Roll [3,4]=7 (Seven Out).
- Expected: `ctx.dice[0] !== 1 && ctx.dice[1] !== 1` — Ace trigger fails.
- Verify: `cascadeEvents` empty for Ace. No additive bonus.

**EC-ACE-02: Both dice show 1 — still fires once (no double bonus)**
- Setup: Recruit "Ace" McGee. Roll [1,1]=2 (Craps Out on COME_OUT).
- Expected: Ace fires once. Additive added once only, despite both dice showing 1.
- Verify: Single Ace entry in `cascadeEvents`. Additive added exactly once.

**EC-ACE-03: Seven Out with a 1 die — Ace fires but loss resolves normally**
- Setup: Recruit "Ace" McGee. Roll [1,6]=7 (Seven Out in POINT_ACTIVE, since diceTotal=7).
- Expected: Ace fires (die[0]=1), adds additive. However, since the roll is a Seven Out (basePassLinePayout=0, baseOddsPayout=0), the additive is ignored by `settleTurn()` — there are no base wins to amplify.
- ⚠ VERIFY: Does `settleTurn()` apply additives on a pure-loss roll? If gross wins are 0, additive + 0 = additive but there are no positive components for the multiplier to apply to. Confirm additive payout behavior on Seven Out.
- Verify: Check if any payout occurs despite Seven Out. Expected behavior: additive is lost along with bets.

---

### Crew 18 — The Close Call
**Stated Ability:** Dynamic additive (1.25× max-bet) whenever dice show consecutive values.
**Actual Implementation:** Triggers when `Math.abs(ctx.dice[0] - ctx.dice[1]) === 1`. Covers [1,2], [2,3], [3,4], [4,5], [5,6] in either order. Fires on ~28% of all rolls (10 of 36 combinations). Additive = `Math.round(1.25 × maxBet / 100) × 100`. Amplified by Hype and multipliers.

#### Happy Path

**HP-CLOSE-01: Consecutive dice — additive added**
- Setup: Recruit The Close Call at Marker 0 ($50 target, maxBet = 500¢). Roll [3,4]=7 (Seven Out in POINT_ACTIVE).
- Expected: Close Call fires (`Math.abs(3-4) === 1`). `additive = Math.round(1.25 × 500 / 100) × 100 = Math.round(6.25) × 100 = 600¢ = $6`.
- Verify: Close Call in `cascadeEvents`. `additives` increased by 600¢.

**HP-CLOSE-02: All five consecutive pairs trigger Close Call**
- Setup: Recruit The Close Call. Roll [1,2], [2,3], [3,4], [4,5], [5,6] in successive rolls (in either order).
- Expected: Close Call fires on each. All five combinations are valid triggers.
- Verify: Consistent behavior across all consecutive pairs.

**HP-CLOSE-03: Additive amplified by Hype**
- Setup: Bootstrap Hype = 2.0×. Recruit Close Call. Roll consecutive dice on a winning roll.
- Expected: additive × Hype multiplied into final payout.
- Verify: Payout delta reflects additive amplification.

#### Edge Cases

**EC-CLOSE-01: Non-consecutive dice — Close Call does NOT fire**
- Setup: Recruit The Close Call. Roll [2,4]=6 (difference = 2, not 1).
- Expected: `Math.abs(2-4) === 2 !== 1` — trigger fails. No Close Call in `cascadeEvents`.
- Verify: No cascade event. No additive added.

**EC-CLOSE-02: Paired dice [3,3] — difference is 0, not 1 — does NOT fire**
- Setup: Recruit The Close Call. Roll [3,3]=6 (Hard 6 — a pair).
- Expected: `Math.abs(3-3) === 0 !== 1` — trigger fails. Close Call does NOT fire on pairs.
- Verify: No Close Call entry in cascade.

**EC-CLOSE-03: [5,6]=11 is a Natural and a consecutive roll — both resolve**
- Setup: Recruit The Close Call. Roll [5,6]=11 on COME_OUT (Natural).
- Expected: Close Call fires (consecutive) AND Natural payout applies. Additive stacks onto the Natural win.
- Verify: Close Call in `cascadeEvents`. Natural Pass Line payout + additive in total payout.

**EC-CLOSE-04: Seven Out via [3,4]=7 — Close Call fires on a loss roll**
- Setup: Recruit The Close Call. POINT_ACTIVE. Roll [3,4]=7 (Seven Out, consecutive).
- Expected: Close Call fires. However, additive may not contribute to payout on a pure loss (see ⚠ from EC-ACE-03).
- ⚠ VERIFY: Confirm additive on Seven Out. Expected behavior is additive is effectively zero-value on a net-loss roll.

---

## STARTER CREW — HYPE

---

### Crew 19 — The Momentum
**Stated Ability:** +0.2 Hype whenever this roll's total is higher than the last.
**Actual Implementation:** Triggers when `ctx.previousRollTotal !== null && ctx.diceTotal > ctx.previousRollTotal`. Adds 0.2 to Hype, rounded to 4 decimal places. No cooldown. Does NOT fire on the shooter's first roll (`previousRollTotal === null`). `previousRollTotal` resets to null when a new shooter begins.

#### Happy Path

**HP-MOM-01: Roll total higher than previous — Hype increases by 0.2**
- Setup: Recruit The Momentum. Bootstrap a run already in POINT_ACTIVE. First roll: [2,3]=5. Second roll: [4,4]=8 (8 > 5).
- Expected: On second roll, Momentum fires. Hype: 1.0 → 1.2.
- Verify: Momentum in `cascadeEvents`. `run.hype === 1.2` after second roll.

**HP-MOM-02: Ascending sequence — Hype grows with each increase**
- Setup: Recruit The Momentum. Roll sequence: 5, 7, 9 (each higher than the last).
- Expected: Momentum fires on the 7 roll (7>5) and the 9 roll (9>7). Hype: 1.0 → 1.2 → 1.4.
- Verify: Momentum in `cascadeEvents` on the ascending rolls. Hype grows.

**HP-MOM-03: Momentum fires regardless of roll result**
- Setup: Recruit The Momentum. Roll 5 (NO_RESOLUTION), then roll 8 (Point Hit or NO_RESOLUTION, 8 > 5).
- Expected: Momentum fires because diceTotal increased, independent of roll result category.
- Verify: Momentum in `cascadeEvents` on any result type where total ascended.

#### Edge Cases

**EC-MOM-01: First roll of a shooter — Momentum does NOT fire**
- Setup: Recruit The Momentum. New shooter begins (previousRollTotal === null). First roll of shooter: any total.
- Expected: `ctx.previousRollTotal === null` — Momentum trigger fails. No Hype change from Momentum.
- Verify: Momentum NOT in `cascadeEvents` on first roll of shooter.

**EC-MOM-02: Equal totals — Momentum does NOT fire**
- Setup: Recruit The Momentum. Roll 7, then roll 7 again.
- Expected: `diceTotal <= previousRollTotal` (7 ≤ 7) — trigger fails. Momentum does not fire on ties.
- Verify: Momentum NOT in `cascadeEvents`. Hype unchanged.

**EC-MOM-03: Descending total — Momentum does NOT fire**
- Setup: Recruit The Momentum. Roll 9, then roll 5 (5 < 9).
- Expected: `diceTotal (5) <= previousRollTotal (9)` — trigger fails. Momentum does not fire.
- Verify: Momentum NOT in `cascadeEvents`.

**EC-MOM-04: New shooter resets previousRollTotal — Momentum cannot fire on first roll**
- Setup: Recruit The Momentum. Shooter 1 ends (Seven Out). Shooter 2 begins.
- Expected: `previousRollTotal` is reset to null on shooter change. Momentum does not fire on Shooter 2's first roll, even if its total would have been higher than Shooter 1's last roll.
- Verify: No Momentum in `cascadeEvents` on first roll of new shooter.

---

### Crew 20 — The Echo
**Stated Ability:** +0.4 Hype when the dice repeat the same total as the last roll.
**Actual Implementation:** Triggers when `ctx.previousRollTotal !== null && ctx.diceTotal === ctx.previousRollTotal`. Adds 0.4 to Hype, rounded to 4 decimal places. No cooldown. Does NOT fire on the shooter's first roll. Fires on ~17% of rolls after the first (probability of matching a specific prior total).

#### Happy Path

**HP-ECHO-01: Repeat total — Hype increases by 0.4**
- Setup: Recruit The Echo. Roll 8, then roll 8 again.
- Expected: Echo fires on second 8 roll. Hype: 1.0 → 1.4.
- Verify: Echo in `cascadeEvents`. `run.hype === 1.4`.

**HP-ECHO-02: Echo fires regardless of roll result category**
- Setup: Recruit The Echo. Roll [4,3]=7 (Seven Out), then immediately a new shooter rolls [3,4]=7 on come-out (Natural).
- Expected: On the new shooter's first roll, previousRollTotal is null — Echo does not fire. If same shooter had two successive 7s (e.g., Seven Out then... but shooter is gone), this can't happen. Instead: COME_OUT roll of 8 (POINT_SET), then next roll in POINT_ACTIVE also 8 (POINT_HIT or NO_RESOLUTION).
- Expected outcome: Echo fires on second 8.
- Verify: Echo in `cascadeEvents`. Hype += 0.4.

**HP-ECHO-03: Multiple consecutive repeat totals**
- Setup: Recruit The Echo. Roll 6, 6, 6 in succession (within same shooter).
- Expected: Echo fires on 2nd roll (6=6) and 3rd roll (6=6). Hype: 1.0 → 1.4 → 1.8.
- Verify: Echo in `cascadeEvents` on 2nd and 3rd rolls. Hype accumulates correctly.

#### Edge Cases

**EC-ECHO-01: First roll of shooter — Echo does NOT fire**
- Setup: Recruit The Echo. New shooter starts. First roll: any total.
- Expected: `ctx.previousRollTotal === null` — Echo trigger fails.
- Verify: Echo NOT in `cascadeEvents` on first roll.

**EC-ECHO-02: Ascending total — Echo does NOT fire**
- Setup: Recruit The Echo. Roll 5, then 8 (8 ≠ 5).
- Expected: `diceTotal (8) !== previousRollTotal (5)` — trigger fails.
- Verify: Echo NOT in `cascadeEvents`.

**EC-ECHO-03: Seven Out resets previousRollTotal via new shooter**
- Setup: Recruit The Echo. Last roll of Shooter 1: [4,3]=7 (Seven Out). Shooter 2 begins, rolls [3,4]=7 on come-out.
- Expected: Shooter 2's first roll has `previousRollTotal === null` — Echo does NOT fire on this roll even though both 7s match.
- Verify: Echo NOT in `cascadeEvents` on Shooter 2's first roll.

---

### Crew 21 — The Silver Lining
**Stated Ability:** +0.6 Hype on a CRAPS_OUT (come-out roll of 2, 3, or 12).
**Actual Implementation:** Triggers when `ctx.rollResult === 'CRAPS_OUT'`. Adds 0.6 to Hype, rounded to 4 decimal places. No cooldown. Fires on ~11% of come-out rolls (4 of 36 combinations: [1,1], [1,2], [2,1], [6,6]).

#### Happy Path

**HP-SILVER-01: Craps 2 on come-out — Hype increases by 0.6**
- Setup: Recruit The Silver Lining. Bootstrap Hype = 1.0. Roll [1,1]=2 on COME_OUT.
- Expected: Silver Lining fires. Hype: 1.0 → 1.6. Pass Line bet is lost (normal Craps Out behavior).
- Verify: Silver Lining in `cascadeEvents`. `run.hype === 1.6`. Bankroll reflects Pass Line loss.

**HP-SILVER-02: All Craps results trigger Silver Lining**
- Setup: Recruit The Silver Lining. Roll craps 2 ([1,1]), craps 3 ([1,2] or [2,1]), craps 12 ([6,6]) on separate COME_OUT rolls.
- Expected: Silver Lining fires on each. Hype += 0.6 on each.
- Verify: Consistent trigger across 2, 3, and 12.

**HP-SILVER-03: Silver Lining turns the worst come-out into a Hype builder**
- Setup: Recruit The Silver Lining. Start with Hype 1.0. Roll 3 craps-outs in a row.
- Expected: Hype: 1.0 → 1.6 → 2.2 → 2.8. Despite repeated losses, Hype builds significantly.
- Verify: Hype accumulates correctly. Game is still losing money but Hype grows.

#### Edge Cases

**EC-SILVER-01: Natural (7/11) does NOT trigger Silver Lining**
- Setup: Recruit The Silver Lining. Roll Natural 7 on COME_OUT.
- Expected: `rollResult === 'NATURAL'` ≠ 'CRAPS_OUT'. Silver Lining does NOT fire.
- Verify: Silver Lining NOT in `cascadeEvents`. Hype unchanged by Silver Lining.

**EC-SILVER-02: Seven Out in POINT_ACTIVE does NOT trigger Silver Lining**
- Setup: Recruit The Silver Lining. Set a point. Roll [1,6]=7 (Seven Out in POINT_ACTIVE).
- Expected: `rollResult === 'SEVEN_OUT'` ≠ 'CRAPS_OUT'. Silver Lining does NOT fire.
- Verify: Silver Lining NOT in `cascadeEvents`.

**EC-SILVER-03: CRAPS_OUT only occurs on COME_OUT — cannot trigger during POINT_ACTIVE**
- Note: By game rules, once a point is established, rolling 2/3/12 is NO_RESOLUTION (not Craps Out). So `rollResult === 'CRAPS_OUT'` is structurally limited to COME_OUT phase.
- Verify: Silver Lining does not fire during POINT_ACTIVE on rolls of 2/3/12 (they produce NO_RESOLUTION, not CRAPS_OUT).

---

### Crew 22 — The Odd Couple
**Stated Ability:** +0.2 Hype whenever both dice show odd faces (1, 3, or 5).
**Actual Implementation:** Triggers when `ctx.dice[0] % 2 === 1 && ctx.dice[1] % 2 === 1`. Adds 0.2 to Hype, rounded to 4 decimal places. No cooldown. Fires on 25% of all rolls (9 of 36 combinations: both dice odd).

#### Happy Path

**HP-ODD-01: Both dice odd — Hype increases by 0.2**
- Setup: Recruit The Odd Couple. Roll [1,3]=4 (POINT_HIT if point is 4, or NO_RESOLUTION otherwise).
- Expected: Odd Couple fires. Hype: 1.0 → 1.2.
- Verify: Odd Couple in `cascadeEvents`. `run.hype === 1.2`.

**HP-ODD-02: All nine odd-odd combinations trigger Odd Couple**
- Setup: Recruit The Odd Couple. Test: [1,1], [1,3], [1,5], [3,1], [3,3], [3,5], [5,1], [5,3], [5,5].
- Expected: All nine combinations trigger Odd Couple.
- Verify: Consistent +0.2 Hype across all nine combinations.

**HP-ODD-03: Hype accumulates across multiple odd-die rolls**
- Setup: Recruit The Odd Couple. Roll 3 rolls with both dice odd.
- Expected: Hype: 1.0 → 1.2 → 1.4 → 1.6.
- Verify: Additive accumulation confirmed.

#### Edge Cases

**EC-ODD-01: One odd die, one even die — Odd Couple does NOT fire**
- Setup: Recruit The Odd Couple. Roll [1,4]=5 (one odd, one even).
- Expected: `ctx.dice[1] % 2 === 0` — trigger fails. Odd Couple does NOT fire.
- Verify: No Odd Couple in `cascadeEvents`.

**EC-ODD-02: Both dice even — Odd Couple does NOT fire**
- Setup: Recruit The Odd Couple. Roll [2,4]=6 (both even).
- Expected: Both dice fail the odd check. Odd Couple does NOT fire.
- Verify: No Odd Couple in `cascadeEvents`. (This is where The Even Keel would fire.)

**EC-ODD-03: Natural 7 via [3,4] — one odd, one even — does NOT trigger Odd Couple**
- Setup: Recruit The Odd Couple. Roll [3,4]=7 (Natural 7 on COME_OUT).
- Expected: [3,4] has one odd (3) and one even (4). Trigger fails.
- Verify: No Odd Couple in cascade. Normal Natural payout.

**EC-ODD-04: [5,5]=10 — both odd — Odd Couple fires (also a pair)**
- Setup: Recruit The Odd Couple. Roll [5,5]=10.
- Expected: Both dice are odd (5%2===1) — Odd Couple fires. Hype += 0.2.
- Note: This is also a paired roll where Physics Professor would fire. In solo testing, only Odd Couple is present.
- Verify: Odd Couple in `cascadeEvents`. Hype += 0.2.

---

## STARTER CREW — TABLE

---

### Crew 23 — The Even Keel
**Stated Ability:** Dynamic additive (1.0× max-bet) whenever both dice show even faces.
**Actual Implementation:** Triggers when `ctx.dice[0] % 2 === 0 && ctx.dice[1] % 2 === 0`. Adds `Math.round(1.0 × maxBet / 100) × 100` cents to `additives`. No cooldown. Fires on 25% of all rolls (9 of 36: both dice even). Additive is amplified by Hype and multipliers.

#### Happy Path

**HP-KEEL-01: Both dice even — additive added**
- Setup: Recruit The Even Keel at Marker 0 ($50 target, maxBet = 500¢). Roll [2,4]=6 (NO_RESOLUTION in point phase).
- Expected: Even Keel fires. `additive = Math.round(1.0 × 500 / 100) × 100 = 500¢ = $5`.
- Verify: Even Keel in `cascadeEvents`. `additives` increased by 500¢.

**HP-KEEL-02: All nine even-even combinations trigger Even Keel**
- Setup: Recruit The Even Keel. Test: [2,2], [2,4], [2,6], [4,2], [4,4], [4,6], [6,2], [6,4], [6,6].
- Expected: All nine combinations trigger Even Keel. Consistent additive on each.
- Verify: Even Keel fires for all nine combinations.

**HP-KEEL-03: Additive scales with marker target**
- Setup: Recruit The Even Keel. Test at Marker 0 ($50 target) and Marker 6 ($250k target).
- Expected: At Marker 6, maxBet = $25,000. Additive = `Math.round(1.0 × 25000 / 100) × 100 = 25000¢ = $250`.
- Verify: Additive grows proportionally. Meaningful income at higher floors.

#### Edge Cases

**EC-KEEL-01: One even die, one odd die — Even Keel does NOT fire**
- Setup: Recruit The Even Keel. Roll [2,3]=5 (one even, one odd).
- Expected: `ctx.dice[1] % 2 !== 0` — trigger fails.
- Verify: No Even Keel in `cascadeEvents`.

**EC-KEEL-02: Both dice odd — Even Keel does NOT fire**
- Setup: Recruit The Even Keel. Roll [3,5]=8 (both odd).
- Expected: Both dice fail the even check. Even Keel does NOT fire. (This is where The Odd Couple would fire.)
- Verify: No Even Keel in `cascadeEvents`.

**EC-KEEL-03: [6,6]=12 — both even — Even Keel fires (on Craps Out)**
- Setup: Recruit The Even Keel. Roll [6,6]=12 on COME_OUT (Craps Out).
- Expected: Both dice are even. Even Keel fires, additive added. However, this is a CRAPS_OUT (Pass Line lost), and additives may not yield a net payout on a pure-loss roll.
- ⚠ VERIFY: Confirm whether additive contributes to payout on a CRAPS_OUT where basePassLinePayout = 0. Expected: additive is effectively lost since there are no positive base payouts to amplify.
- Verify: Even Keel in `cascadeEvents`. Net bankroll delta reflects loss (or minimal gain if additive is applied).

**EC-KEEL-04: [4,4]=8 — both even — Even Keel fires alongside a potential hardway win**
- Setup: Recruit The Even Keel. Hard 8 bet active. Roll [4,4]=8 (Hard 8 win, point phase).
- Expected: Even Keel fires (4%2===0 on both dice). Additive adds on top of Hard 8 payout.
- Verify: Both Hard 8 payout and Even Keel additive in final settlement. Even Keel in `cascadeEvents`.

---

### Crew 24 — The Doorman
**Stated Ability:** Dynamic additive (0.5× max-bet) on every come-out roll.
**Actual Implementation:** Triggers on any of: `NATURAL`, `CRAPS_OUT`, or `POINT_SET`. Adds `Math.round(0.5 × maxBet / 100) × 100` cents to `additives`. No cooldown. Fires on 100% of come-out rolls (all 36 combinations result in one of these three outcomes during COME_OUT).

#### Happy Path

**HP-DOOR-01: NATURAL on come-out — additive added**
- Setup: Recruit The Doorman at Marker 0 ($50 target, maxBet = 500¢). Roll [3,4]=7 (Natural on COME_OUT).
- Expected: Doorman fires. `additive = Math.round(0.5 × 500 / 100) × 100 = 200¢ = $2` (rounded to nearest dollar: `Math.round(2.5) = 3` → 300¢ = $3 — verify actual rounding behavior).
- ⚠ VERIFY: `Math.round(0.5 × 500 / 100) = Math.round(2.5) = 3` → `3 × 100 = 300¢ = $3`. Confirm whether JS `Math.round(2.5)` gives 3 (rounds half-up) or 2 (banker's rounding). Standard JS `Math.round` rounds half-up, so expect $3.
- Verify: Doorman in `cascadeEvents`. Natural Pass Line win includes the additive.

**HP-DOOR-02: CRAPS_OUT on come-out — additive added despite the loss**
- Setup: Recruit The Doorman. Roll [1,2]=3 (Craps Out on COME_OUT).
- Expected: Doorman fires. Additive added. Even though Pass Line is lost, the additive still contributes to settlement.
- ⚠ VERIFY: On a CRAPS_OUT, basePassLinePayout = 0 (loss, stake already deducted). Does the additive alone produce a positive payout? Check `settleTurn()` behavior when `additives > 0` but all base payouts are 0. Likely the additive is only meaningful when there is a base win to attach to.
- Verify: Doorman in `cascadeEvents`. Confirm net payout behavior on Craps Out + additive.

**HP-DOOR-03: POINT_SET on come-out — additive added**
- Setup: Recruit The Doorman. Roll [4,2]=6 (POINT_SET — establishes point 6).
- Expected: Doorman fires on POINT_SET. Additive added. Note: POINT_SET produces no base payout (Pass Line stays for later resolution). The additive on a POINT_SET may not contribute to net payout until a win occurs.
- ⚠ VERIFY: On POINT_SET, basePassLinePayout = 0 and no other payout. Additive behavior is ambiguous here — confirm whether it carries forward or is applied immediately.
- Verify: Doorman in `cascadeEvents`. Observe net payout (likely $0 after additive since no base wins).

**HP-DOOR-04: Doorman fires on ALL come-out roll types**
- Setup: Recruit The Doorman. Roll a Natural, then a Craps Out, then a Point Set in sequence.
- Expected: Doorman fires on all three come-out rolls. Does NOT fire on subsequent POINT_ACTIVE rolls.
- Verify: Doorman in `cascadeEvents` on all three come-out types.

#### Edge Cases

**EC-DOOR-01: NO_RESOLUTION (point phase) — Doorman does NOT fire**
- Setup: Recruit The Doorman. Set a point. Roll a number that is neither the point nor 7 (e.g., [3,2]=5 when point is 8).
- Expected: `rollResult === 'NO_RESOLUTION'` — Doorman trigger fails. No additive from Doorman.
- Verify: Doorman NOT in `cascadeEvents` during POINT_ACTIVE.

**EC-DOOR-02: POINT_HIT — Doorman does NOT fire**
- Setup: Recruit The Doorman. Set a point. Hit it.
- Expected: `rollResult === 'POINT_HIT'` — Doorman trigger fails. Doorman is come-out only.
- Verify: Doorman NOT in `cascadeEvents` on POINT_HIT.

**EC-DOOR-03: SEVEN_OUT — Doorman does NOT fire**
- Setup: Recruit The Doorman. Roll Seven Out.
- Expected: `rollResult === 'SEVEN_OUT'` — Doorman trigger fails.
- Verify: Doorman NOT in `cascadeEvents`.

---

### Crew 25 — The Grinder
**Stated Ability:** Dynamic additive (0.75× max-bet) on every NO_RESOLUTION.
**Actual Implementation:** Triggers when `ctx.rollResult === 'NO_RESOLUTION'`. Adds `Math.round(0.75 × maxBet / 100) × 100` cents to `additives`. No cooldown. `NO_RESOLUTION` can only occur during POINT_ACTIVE phase. Fires on ~65–70% of point-phase rolls.

#### Happy Path

**HP-GRIND-01: NO_RESOLUTION — additive added**
- Setup: Recruit The Grinder at Marker 0 ($50 target, maxBet = 500¢). Set point 8. Roll [3,2]=5 (NO_RESOLUTION — not a 7, not the point).
- Expected: Grinder fires. `additive = Math.round(0.75 × 500 / 100) × 100 = Math.round(3.75) × 100 = 400¢ = $4`.
- Verify: Grinder in `cascadeEvents`. `additives` increased by 400¢.

**HP-GRIND-02: Grinder fires on multiple consecutive NO_RESOLUTION rolls**
- Setup: Recruit The Grinder. Set a point. Roll 4 successive NO_RESOLUTION results.
- Expected: Grinder fires on every NO_RESOLUTION. Additives accumulate each roll (applied individually at settlement per roll, not combined).
- Verify: Grinder in `cascadeEvents` on all 4 rolls.

**HP-GRIND-03: Additive amplified by Hype**
- Setup: Bootstrap Hype = 1.5×. Recruit The Grinder. Roll NO_RESOLUTION.
- Expected: Grinder additive is amplified by 1.5× in `settleTurn()`.
- Verify: Payout delta reflects Hype amplification of the additive.

**HP-GRIND-04: Additive scales with marker target**
- Setup: Recruit The Grinder at Marker 3 ($1,500 target, maxBet = $150). Roll NO_RESOLUTION.
- Expected: `additive = Math.round(0.75 × 15000 / 100) × 100 = Math.round(112.5) × 100 = 11300¢ = $113`.
- Verify: Grinder income grows meaningfully at higher floors.

#### Edge Cases

**EC-GRIND-01: POINT_HIT — Grinder does NOT fire**
- Setup: Recruit The Grinder. Set a point. Hit it.
- Expected: `rollResult === 'POINT_HIT'` ≠ 'NO_RESOLUTION'. Grinder does NOT fire.
- Verify: Grinder NOT in `cascadeEvents`.

**EC-GRIND-02: SEVEN_OUT — Grinder does NOT fire**
- Setup: Recruit The Grinder. Roll Seven Out.
- Expected: `rollResult === 'SEVEN_OUT'` ≠ 'NO_RESOLUTION'. Grinder does NOT fire.
- Verify: Grinder NOT in `cascadeEvents`.

**EC-GRIND-03: Come-out rolls — Grinder does NOT fire (NO_RESOLUTION is point-phase only)**
- Setup: Recruit The Grinder. Roll NATURAL, CRAPS_OUT, POINT_SET on COME_OUT.
- Expected: None of these are 'NO_RESOLUTION'. Grinder does NOT fire on any come-out result.
- Verify: Grinder NOT in `cascadeEvents` on come-out rolls.

---

## STARTER CREW — PAYOUT

---

### Crew 26 — The Handicapper
**Stated Ability:** +Hype on POINT_SET — scaled to the difficulty of the point.
**Actual Implementation:** Triggers when `ctx.rollResult === 'POINT_SET' && ctx.activePoint !== null`. Hype delta is point-dependent:
- Points 4 or 10 → +0.3 Hype (hardest to hit: 3/36 probability each)
- Points 5 or 9 → +0.2 Hype (medium: 4/36 probability each)
- Points 6 or 8 → +0.1 Hype (easiest to hit: 5/36 probability each)

No cooldown. Fires on ~67% of come-out rolls (24/36 combinations establish a point).

#### Happy Path

**HP-HANDI-01: Point 4 or 10 established — Hype increases by 0.3**
- Setup: Recruit The Handicapper. Roll [2,2]=4 (POINT_SET, establishes point 4).
- Expected: Handicapper fires. Hype: 1.0 → 1.3.
- Verify: Handicapper in `cascadeEvents`. `run.hype === 1.3`. `ctx.activePoint === 4`.

**HP-HANDI-02: Point 5 or 9 established — Hype increases by 0.2**
- Setup: Recruit The Handicapper. Roll [3,2]=5 (POINT_SET, establishes point 5).
- Expected: Handicapper fires. Hype: 1.0 → 1.2.
- Verify: Handicapper in `cascadeEvents`. `run.hype === 1.2`.

**HP-HANDI-03: Point 6 or 8 established — Hype increases by 0.1**
- Setup: Recruit The Handicapper. Roll [4,2]=6 (POINT_SET, establishes point 6).
- Expected: Handicapper fires. Hype: 1.0 → 1.1.
- Verify: Handicapper in `cascadeEvents`. `run.hype === 1.1`.

**HP-HANDI-04: All six point values produce correct Hype deltas**
- Setup: Recruit The Handicapper. Establish each of the six point values in separate shooters.
- Expected: 4→+0.3, 5→+0.2, 6→+0.1, 8→+0.1, 9→+0.2, 10→+0.3.
- Verify: All six variants produce the documented Hype delta.

#### Edge Cases

**EC-HANDI-01: NATURAL on come-out — Handicapper does NOT fire**
- Setup: Recruit The Handicapper. Roll Natural 7 or 11 on COME_OUT.
- Expected: `rollResult === 'NATURAL'` ≠ 'POINT_SET'. Handicapper does NOT fire.
- Verify: Handicapper NOT in `cascadeEvents`.

**EC-HANDI-02: CRAPS_OUT on come-out — Handicapper does NOT fire**
- Setup: Recruit The Handicapper. Roll [1,2]=3 (Craps Out).
- Expected: `rollResult === 'CRAPS_OUT'` ≠ 'POINT_SET'. Handicapper does NOT fire.
- Verify: Handicapper NOT in `cascadeEvents`.

**EC-HANDI-03: POINT_HIT — Handicapper does NOT fire (fires on SET, not HIT)**
- Setup: Recruit The Handicapper. Establish a point. Hit it.
- Expected: POINT_HIT ≠ POINT_SET. Handicapper does NOT fire.
- Verify: Handicapper NOT in `cascadeEvents` on the hit.

**EC-HANDI-04: Symmetry — point 4 and point 10 both yield +0.3**
- Setup: Recruit The Handicapper. Establish point 4 in one shooter, point 10 in another.
- Expected: Both yield Hype +0.3. Symmetric by design (both have 3/36 probability).
- Verify: Identical Hype delta for both.

---

### Crew 27 — The Mirror
**Stated Ability:** +0.2 Hype on any roll totalling 7, regardless of phase.
**Actual Implementation:** Triggers when `ctx.diceTotal === 7`. Adds 0.2 to Hype, rounded to 4 decimal places. No cooldown. Fires on ~17% of all rolls (6 of 36 combinations sum to 7). Fires on both NATURAL (come-out 7) and SEVEN_OUT (point-phase 7) — Seven Outs still lose, but the shooter retains the Hype boost.

#### Happy Path

**HP-MIRROR-01: Natural 7 on come-out — Mirror fires, Hype increases**
- Setup: Recruit The Mirror. Roll [3,4]=7 on COME_OUT (Natural).
- Expected: Mirror fires. Hype: 1.0 → 1.2. Natural payout resolves normally.
- Verify: Mirror in `cascadeEvents`. `run.hype === 1.2`. Pass Line pays 1:1.

**HP-MIRROR-02: Seven Out in point phase — Mirror fires, Hype increases but then resets**
- Setup: Recruit The Mirror. Set a point. Roll [3,4]=7 (Seven Out).
- Expected: Mirror fires during cascade (diceTotal=7). Hype += 0.2 in cascade context. However, Seven Out resets Hype to 1.0 after settlement.
- ⚠ VERIFY: Confirm Hype reset on Seven Out overrides Mirror's boost. The cascade runs before the Seven Out state transition, so Mirror's boost is applied then wiped. Expected: `run.hype === 1.0` after Seven Out even when Mirror fires.
- Verify: Mirror in `cascadeEvents`. `run.hype === 1.0` after the roll (not 1.2).

**HP-MIRROR-03: Mirror fires on all six 7-combos**
- Setup: Recruit The Mirror. Test: [1,6], [2,5], [3,4], [4,3], [5,2], [6,1].
- Expected: Mirror fires on all six. Hype += 0.2 on each.
- Verify: Consistent trigger across all six dice combinations.

#### Edge Cases

**EC-MIRROR-01: Non-7 total — Mirror does NOT fire**
- Setup: Recruit The Mirror. Roll [4,4]=8 (Hard 8 or NO_RESOLUTION).
- Expected: `diceTotal (8) !== 7` — trigger fails. Mirror does NOT fire.
- Verify: Mirror NOT in `cascadeEvents`.

**EC-MIRROR-02: Phase-agnostic — Mirror fires on any 7, come-out or point phase**
- Setup: Recruit The Mirror. Roll a Natural 7 on come-out, then a Seven Out in point phase.
- Expected: Mirror fires on BOTH (both have diceTotal=7). Unlike most crew, the Mirror is entirely total-based, not result-based.
- Verify: Mirror in `cascadeEvents` on both rolls.

**EC-MIRROR-03: Hype after Seven Out with Mirror — reset wins**
- Setup: Recruit The Mirror. Hype = 1.8. Roll Seven Out ([2,5]=7).
- Expected: Mirror fires in cascade: Hype = 1.8 + 0.2 = 2.0. Then Seven Out reset: Hype → 1.0.
- Verify: `run.hype === 1.0` after. Mirror appears in cascade but Hype boost does not persist.

---

## STARTER CREW — WILDCARD

---

### Crew 28 — The Bookkeeper
**Stated Ability:** Dynamic additive (1.0× max-bet) on every 3rd roll of the shooter.
**Actual Implementation:** Triggers when `ctx.shooterRollCount % 3 === 0`. `shooterRollCount` is incremented BEFORE the cascade (1-based), so the cascade always sees the current roll's position. Fires on rolls 3, 6, 9, 12… of each shooter. Counter resets to 1 on new shooter. No cooldown. Additive = `Math.round(1.0 × maxBet / 100) × 100`. Amplified by Hype and multipliers.

#### Happy Path

**HP-BOOK-01: 3rd roll of shooter — additive added**
- Setup: Recruit The Bookkeeper at Marker 0 ($50 target, maxBet = 500¢). Shooter roll 1: any. Roll 2: any. Roll 3 (shooterRollCount = 3, 3%3===0).
- Expected: Bookkeeper fires on roll 3. `additive = Math.round(1.0 × 500 / 100) × 100 = 500¢ = $5`.
- Verify: Bookkeeper in `cascadeEvents` on roll 3. `additives` increased by 500¢. NOT in cascade on rolls 1 and 2.

**HP-BOOK-02: Pattern repeats — fires every 3 rolls**
- Setup: Recruit The Bookkeeper. Track shooterRollCount across many rolls.
- Expected: Bookkeeper fires on rolls 3, 6, 9, 12, etc. Silent on all other rolls.
- Verify: Bookkeeper in `cascadeEvents` at intervals of 3. Not in cascade on rolls 1, 2, 4, 5, 7, 8, etc.

**HP-BOOK-03: Counter resets on new shooter**
- Setup: Recruit The Bookkeeper. Shooter A makes 4 rolls, then Seven Outs. Shooter B begins.
- Expected: `shooterRollCount` resets to 1 for Shooter B. Bookkeeper does not fire on Shooter B's roll 1. Fires on Shooter B's roll 3.
- Verify: No Bookkeeper in cascade on Shooter B's rolls 1 and 2. Bookkeeper fires on roll 3.

**HP-BOOK-04: Additive scales with marker target**
- Setup: Recruit The Bookkeeper at Marker 6 ($250k target, maxBet = $25,000). Roll 3 (3rd shooter roll).
- Expected: `additive = Math.round(1.0 × 25000 / 100) × 100 = 25000¢ = $250`.
- Verify: High-floor additive is meaningful income.

#### Edge Cases

**EC-BOOK-01: Roll 1 and 2 — Bookkeeper does NOT fire**
- Setup: Recruit The Bookkeeper. New shooter. Roll 1 (shooterRollCount=1, 1%3≠0). Roll 2 (2%3≠0).
- Expected: Bookkeeper silent on rolls 1 and 2.
- Verify: Bookkeeper NOT in `cascadeEvents` on first two rolls.

**EC-BOOK-02: Roll 3 is a Seven Out — Bookkeeper fires on the losing roll**
- Setup: Recruit The Bookkeeper. Make 2 rolls (shooter still alive). Roll 3 is a Seven Out.
- Expected: Bookkeeper fires (3%3===0) on the Seven Out roll. Additive added to context. However, on a Seven Out, base payouts are 0 — additive may not yield net payout.
- ⚠ VERIFY: Confirm additive behavior on a Seven Out roll (same question as EC-ACE-03). Expected: additive is effectively lost since no base wins exist to amplify.
- Verify: Bookkeeper in `cascadeEvents`. Net bankroll delta reflects the Seven Out loss.

**EC-BOOK-03: shooterRollCount is 1-based and set before cascade**
- Setup: Recruit The Bookkeeper. Confirm via API response that `shooterRollCount` on a new shooter's first roll is 1, not 0.
- Expected: 1%3 ≠ 0 → Bookkeeper does not fire on roll 1. Confirms the 1-based counting.
- Verify: `run.shooterRollCount === 1` on first roll of shooter.

---

### Crew 29 — The Pressure Cooker
**Stated Ability:** +0.5 Hype AND dynamic additive (1.5× max-bet) after 5 consecutive blank point-phase rolls.
**Actual Implementation:** Triggers when `ctx.rollResult === 'NO_RESOLUTION' && ctx.pointPhaseBlankStreak === 4`. `pointPhaseBlankStreak` is the PREVIOUS consecutive blank count (before this roll). A value of 4 means this roll is the 5th consecutive blank. After triggering, `computeNextState()` resets `pointPhaseBlankStreak` to 0. On any non-NO_RESOLUTION result, streak also resets to 0. No cooldown.

#### Happy Path

**HP-COOK-01: 5th consecutive NO_RESOLUTION — Pressure Cooker fires**
- Setup: Recruit The Pressure Cooker at Marker 0 ($50 target, maxBet = 500¢). Set a point. Roll 5 consecutive NO_RESOLUTION results.
- Expected: Pressure Cooker does NOT fire on rolls 1–4 (streak = 0, 1, 2, 3). On roll 5 (streak = 4 entering the roll): fires. Hype += 0.5. `additive = Math.round(1.5 × 500 / 100) × 100 = Math.round(7.5) × 100 = 800¢ = $8`.
- Verify: Pressure Cooker NOT in `cascadeEvents` on rolls 1–4. Pressure Cooker IS in cascade on roll 5. `run.hype` increases by 0.5. Additive added.

**HP-COOK-02: Streak resets after firing — 5 more blanks needed for next trigger**
- Setup: Recruit The Pressure Cooker. Fire it (5 consecutive blanks). The streak resets to 0. Roll more NO_RESOLUTION results.
- Expected: Pressure Cooker does not fire again until 5 more consecutive blanks accumulate.
- Verify: No Pressure Cooker in `cascadeEvents` on rolls 6–9 after the reset. Fires again on roll 10 (rolls 6–10 as the new 5-blank sequence).

**HP-COOK-03: Additive and Hype boost both apply on trigger**
- Setup: Recruit The Pressure Cooker. Fire on 5th blank. Observe both Hype and additive changes.
- Expected: Single cascade event includes both Hype delta (+0.5) and additives delta (+additive amount). Both visible in `contextDelta`.
- Verify: Both `contextDelta.hype` and `contextDelta.additives` are present in the Pressure Cooker cascade event.

#### Edge Cases

**EC-COOK-01: Streak interrupted by POINT_HIT — resets to 0**
- Setup: Recruit The Pressure Cooker. Roll 3 NO_RESOLUTION, then hit the point (POINT_HIT). Streak resets. Roll 4 more NO_RESOLUTION.
- Expected: Pressure Cooker did not fire during the 3-blank sequence (not enough). After POINT_HIT resets streak, must accumulate 5 more blanks. Does NOT fire on the 4th blank after reset.
- Verify: No Pressure Cooker in cascade after 4 post-reset blanks.

**EC-COOK-02: Streak interrupted by SEVEN_OUT — resets to 0**
- Setup: Recruit The Pressure Cooker. Roll 4 NO_RESOLUTION (streak = 4), then roll Seven Out (SEVEN_OUT). Streak resets to 0.
- Expected: Pressure Cooker does NOT fire on the Seven Out (not NO_RESOLUTION). Streak resets. A new shooter must build from 0.
- Verify: No Pressure Cooker in cascade on Seven Out roll.

**EC-COOK-03: pointPhaseBlankStreak is a COME_OUT streak, not POINT_ACTIVE streak**
- Note: `pointPhaseBlankStreak` only counts consecutive NO_RESOLUTION within point phase. Come-out rolls (NATURAL, CRAPS_OUT, POINT_SET) reset it. This ensures the Pressure Cooker tracks sustained point-phase grinding, not overall rolls.
- Setup: Set point, roll 3 blanks (streak=3). Point hit — new come-out. Roll Natural (streak resets). Set new point. Roll 2 more blanks.
- Expected: Streak is 2 after the NATURAL reset. Pressure Cooker needs 3 more blanks to fire. Does not carry streak across come-out cycles.
- Verify: `run.pointPhaseBlankStreak` shows correct count in state.

**EC-COOK-04: Roll 4 blanks exactly (streak=4 entering roll 4) — does NOT fire unless roll 4 is also NO_RESOLUTION**
- Note: The trigger checks `ctx.pointPhaseBlankStreak === 4` (the count BEFORE this roll) AND `ctx.rollResult === 'NO_RESOLUTION'` (this roll must also be blank). If roll 5 is POINT_HIT instead, Pressure Cooker does not fire.
- Setup: Roll 4 blanks. On the 5th roll (when streak=4 entering), roll POINT_HIT instead.
- Expected: Pressure Cooker does NOT fire because `ctx.rollResult !== 'NO_RESOLUTION'`. Streak resets after POINT_HIT.
- Verify: No Pressure Cooker in cascade on the POINT_HIT.

---

### Crew 30 — The Contrarian
**Stated Ability:** Dynamic additive (1.0× max-bet) whenever this roll total is lower than the last.
**Actual Implementation:** Triggers when `ctx.previousRollTotal !== null && ctx.diceTotal < ctx.previousRollTotal`. Adds `Math.round(1.0 × maxBet / 100) × 100` cents to `additives`. No cooldown. Does NOT fire on the shooter's first roll. Fires on ~40% of rolls after the first (probability that the next roll is strictly lower than the previous).

**Design note:** Together with The Momentum (fires on ascent) and The Echo (fires on repeat), these three crew cover nearly every roll of a shooter:
- Momentum: current total > previous total (~45%)
- Echo: current total = previous total (~17%)
- Contrarian: current total < previous total (~40%)
- (Gaps: some edge distributions not covered 100% due to variance in probabilities)

#### Happy Path

**HP-CONTRA-01: Roll total lower than previous — additive added**
- Setup: Recruit The Contrarian at Marker 0 ($50 target, maxBet = 500¢). Roll 9, then roll 5 (5 < 9).
- Expected: Contrarian fires on the 5 roll. `additive = Math.round(1.0 × 500 / 100) × 100 = 500¢ = $5`.
- Verify: Contrarian in `cascadeEvents`. `additives` increased by 500¢.

**HP-CONTRA-02: Descending sequence — Contrarian fires on each drop**
- Setup: Recruit The Contrarian. Roll sequence: 10, 8, 5 (each lower than the last).
- Expected: Contrarian fires on the 8 roll (8<10) and the 5 roll (5<8). Additive added on each.
- Verify: Contrarian in `cascadeEvents` on the two descending rolls.

**HP-CONTRA-03: Contrarian fires on descending total regardless of roll result**
- Setup: Recruit The Contrarian. Roll 9 (any result), then roll 6 (if point is 8, this is NO_RESOLUTION). 6 < 9, Contrarian fires.
- Expected: Contrarian fires based on total comparison, not roll result category.
- Verify: Contrarian in `cascadeEvents`. Additive added.

**HP-CONTRA-04: Additive scales with marker target**
- Setup: Recruit The Contrarian at Marker 6 ($250k target, maxBet = $25,000). Roll a descending total.
- Expected: `additive = Math.round(1.0 × 25000 / 100) × 100 = 25000¢ = $250`.
- Verify: High-floor additive is meaningful.

#### Edge Cases

**EC-CONTRA-01: First roll of shooter — Contrarian does NOT fire**
- Setup: Recruit The Contrarian. New shooter begins. First roll: any total.
- Expected: `ctx.previousRollTotal === null` — Contrarian trigger fails.
- Verify: Contrarian NOT in `cascadeEvents` on first roll of shooter.

**EC-CONTRA-02: Equal totals — Contrarian does NOT fire**
- Setup: Recruit The Contrarian. Roll 7, then roll 7 again.
- Expected: `diceTotal (7) >= previousRollTotal (7)` (not strictly less) — trigger fails.
- Verify: Contrarian NOT in `cascadeEvents` on the repeat-7 roll. (This is where The Echo would fire.)

**EC-CONTRA-03: Ascending total — Contrarian does NOT fire**
- Setup: Recruit The Contrarian. Roll 5, then 9 (9 > 5).
- Expected: `diceTotal (9) >= previousRollTotal (5)` — trigger fails. (This is where The Momentum would fire.)
- Verify: Contrarian NOT in `cascadeEvents`.

**EC-CONTRA-04: New shooter resets previousRollTotal — Contrarian cannot fire on first roll**
- Setup: Recruit The Contrarian. Shooter 1's last roll: 10 (high). Seven Out. Shooter 2 begins, first roll: 4.
- Expected: `previousRollTotal === null` for Shooter 2's first roll — Contrarian does NOT fire on roll 1, even though 4 < 10.
- Verify: Contrarian NOT in `cascadeEvents` on Shooter 2's first roll.

---

## Test Execution Notes

### Bootstrap Setup Needed
To seed crew for testing without playing through the full Pub flow, the bootstrap API should be extended to support:
```json
{
  "startingBankroll": 395,
  "startingShooters": 5,
  "startingCrew": [{ "crewId": 11, "slot": 0 }],
  "startingHype": 1.0
}
```
This avoids replaying the full game flow for each crew member test. Work with the API bootstrap route to add these optional parameters before testing begins.

### Additive Crew Notes
Starter crew that add to `additives` (IDs 17, 18, 23, 24, 25, 28, 30) follow the FB-024 dynamic scaling formula:
```
additive = Math.round(ADDITIVE_MULT × Math.floor(markerTargetCents × 0.10) / 100) × 100
```
This rounds to the nearest $1. Calculate expected values per marker target when verifying payouts.

### Verification Method
For each test:
1. Inspect `roll.cascadeEvents` array in API response — does the target crew appear?
2. Check `run.hype` before and after.
3. Check `roll.bankrollDelta` and `roll.receipt` for payout verification.
4. Observe UI for portrait flash animation, bark text, Hype counter update.
5. Cross-reference Roll Log entry in the UI.

### Defect Logging
All defects discovered during crew testing should be appended to `crew-test-results.md` following the established DEF-NNN format.

---

## Test Case Count Summary

| Crew | ID | Happy Path | Edge Cases | Total |
|------|----|-----------|-----------|-------|
| Lefty McGuffin | 1 | 3 | 5 | 8 |
| Physics Prof | 2 | 3 | 5 | 8 |
| The Mechanic | 3 | 3 | 5 | 8 |
| The Mathlete | 4 | 2 | 4 | 6 |
| Floor Walker | 5 | 2 | 4 | 6 |
| The Regular | 6 | 4 | 3 | 7 |
| Big Spender | 7 | 3 | 3 | 6 |
| The Shark | 8 | 3 | 3 | 6 |
| The Whale | 9 | 3 | 3 | 6 |
| Nervous Intern | 10 | 4 | 2 | 6 |
| Hype-Train Holly | 11 | 3 | 2 | 5 |
| Drunk Uncle | 12 | 4 | 2 | 6 |
| The Mimic | 13 | 2 | 1 | 3 |
| The Old Pro | 14 | 3 | 1 | 4 |
| Lucky Charm | 15 | 3 | 2 | 5 |
| The Lookout | 16 | 4 | 3 | 7 |
| "Ace" McGee | 17 | 3 | 3 | 6 |
| The Close Call | 18 | 3 | 4 | 7 |
| The Momentum | 19 | 3 | 4 | 7 |
| The Echo | 20 | 3 | 3 | 6 |
| The Silver Lining | 21 | 3 | 3 | 6 |
| The Odd Couple | 22 | 3 | 4 | 7 |
| The Even Keel | 23 | 3 | 4 | 7 |
| The Doorman | 24 | 4 | 3 | 7 |
| The Grinder | 25 | 4 | 3 | 7 |
| The Handicapper | 26 | 4 | 4 | 8 |
| The Mirror | 27 | 3 | 3 | 6 |
| The Bookkeeper | 28 | 4 | 3 | 7 |
| The Pressure Cooker | 29 | 3 | 4 | 7 |
| The Contrarian | 30 | 4 | 4 | 8 |
| **TOTAL** | | **98** | **97** | **195** |
