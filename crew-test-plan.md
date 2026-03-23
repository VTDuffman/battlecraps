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
| Big Spender | "+$100 flat to Hardway wins" | Code adds **10,000¢ = $100**. Both `seed.ts` and `PubScreen.tsx` correctly say $100. No mismatch. | ✅ Matches implementation |
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

**Design niche:** The Shark covers POINT_HIT flat bonuses; The Regular covers NATURAL wins with a scaling bonus (bet-size dependent, not flat). Together they cover both positive win conditions without overlapping.

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
**Stated Ability:** "+$100 flat to Hardway wins."
**Actual Implementation:** Triggers when `baseHardwaysPayout > 0`. Adds **10,000 cents ($100)** to `additives`. This bonus IS amplified by Hype and multipliers in `settleTurn()`.

#### Happy Path

**HP-BIG-01: Hard 8 hit — flat $100 bonus added to payout**
- Setup: Recruit Big Spender. Place Hard 8 bet ($10). Roll [4,4]=8 (Hard 8).
- Expected: Hard 8 pays 9:1 = $90 on $10 bet. Big Spender adds $100. With Hype 1.0× and no multipliers: total win = $90 + $100 = $190.
- Verify: Big Spender in `cascadeEvents`. Payout delta = $190.

**HP-BIG-02: Big Spender fires on any hardway hit (Hard 4, 6, 8, 10)**
- Setup: Recruit Big Spender. Test each hardway: Hard 4 ([2,2]=4), Hard 6 ([3,3]=6), Hard 10 ([5,5]=10).
- Expected: Big Spender fires for each. Flat bonus added to each.
- Verify: Consistent bonus across all four hardways.

**HP-BIG-03: Flat bonus is amplified by Hype**
- Setup: Recruit Big Spender + Nervous Intern (to build Hype). After 2 Naturals (Hype = 1.4×), hit Hard 8.
- Note: Technically interaction testing — skip this or use a bootstrapped Hype value.
- Alternative: Bootstrap with Hype > 1.0 (if the bootstrap API supports it) and verify bonus amplification.
- Verify: `(baseHardwaysPayout + additives) × hype` in settlement.

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
**Stated Ability:** "+$100 flat bonus on Point Hit."
**Actual Implementation:** Triggers on `rollResult === 'POINT_HIT'`. Adds 10,000¢ ($100) to `additives`. IS amplified by Hype and multipliers.

#### Happy Path

**HP-SHARK-01: Point Hit — flat $100 bonus**
- Setup: Recruit The Shark. Set a point. Hit the point.
- Expected: Shark fires. Flat $100 added to payout. At Hype 1.0×: total payout = Pass Line win + Odds win + $100.
- Verify: Shark in `cascadeEvents`. Roll Log shows extra $100 in payout breakdown. Bankroll increases by expected amount.

**HP-SHARK-02: Shark fires on any point number**
- Setup: Test with points 4, 5, 6, 8, 9, 10 separately.
- Expected: Shark fires every time. Point number doesn't matter.
- Verify: Consistent behavior across all point values.

#### Edge Cases

**EC-SHARK-01: Natural 7/11 does NOT trigger Shark**
- Setup: Recruit Shark. Roll Natural on COME_OUT.
- Expected: `rollResult === 'NATURAL'`, not 'POINT_HIT'. Shark does NOT fire.
- Verify: `cascadeEvents` empty. No $100 bonus.

**EC-SHARK-02: Seven Out does NOT trigger Shark**
- Setup: Recruit Shark. Roll Seven Out.
- Expected: No Shark trigger. Normal Seven Out.
- Verify: `cascadeEvents` empty.

**EC-SHARK-03: Bonus amplified at elevated Hype**
- Setup: Bootstrap with a run where Hype is 2.0× (or build Hype via naturals first). Hit a point.
- Expected: Flat $100 bonus is doubled to $200 effective contribution.
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
**Stated Ability:** "+1 shooter per marker cleared."
**Actual Implementation:** Server-side check in `computeNextState()` — when status transitions to TRANSITION, if Old Pro is on the rail, `shooters += 1`. Executed BEFORE Pub screen loads.

#### Happy Path

**HP-OLDPRO-01: Marker cleared — receive 6 shooters instead of 5**
- Setup: Recruit Old Pro. Clear Marker 1 (bankroll ≥ $400).
- Expected: Instead of normal 5-shooter reset at Pub, player gets 6 shooters. Pub screen shows 6 shooters.
- Verify: `run.shooters === 6` in the transition. Pub screen displays 6 ++++++.

**HP-OLDPRO-02: Pub screen after Old Pro bonus — start next segment with 6**
- Setup: Continue from HP-OLDPRO-01. Skip Pub or hire crew. Return to table.
- Expected: Table shows 6 shooter indicators (not 5).
- Verify: Shooter display in HUD shows 6 filled circles.

#### Edge Cases

**EC-OLDPRO-01: Known implementation issue — verify Old Pro bonus actually applies**
- Note: From code inspection, the Old Pro check IS implemented in rolls.ts (lines 303-311). It does add the +1. Earlier code review notes said it was "unimplemented" — this should be re-verified.
- Setup: Recruit Old Pro. Clear a marker.
- Expected: `run.shooters` in transition state reflects +1 bonus.
- Verify: Confirm the fix is working or whether the "unimplemented" note was stale.

**EC-OLDPRO-02: Multiple markers cleared with Old Pro — cumulative?**
- Setup: Recruit Old Pro early (Marker 1 Pub). Keep Old Pro for Marker 2 clear.
- Expected: Each marker clear grants +1. After 2 clears: does the Pub reset to 5+1=6, then 6+1=7? Or just 5+1=6 each time?
- Verify: Whether the +1 is applied to the reset value (5+1=6 each time) or cumulative (5, 6, 7, 8…).
- Note: Interaction with multiple markers is out of scope for this plan but worth noting for a future test.

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

| Crew | Happy Path | Edge Cases | Total |
|------|-----------|-----------|-------|
| Lefty McGuffin | 3 | 5 | 8 |
| Physics Prof | 3 | 5 | 8 |
| The Mechanic | 3 | 5 | 8 |
| The Mathlete | 2 | 4 | 6 |
| Floor Walker | 2 | 4 | 6 |
| The Regular | 4 | 3 | 7 |
| Big Spender | 3 | 3 | 6 |
| The Shark | 2 | 3 | 5 |
| The Whale | 3 | 3 | 6 |
| Nervous Intern | 4 | 2 | 6 |
| Hype-Train Holly | 3 | 2 | 5 |
| Drunk Uncle | 4 | 2 | 6 |
| The Mimic | 2 | 1 | 3 |
| The Old Pro | 2 | 2 | 4 |
| Lucky Charm | 3 | 2 | 5 |
| **TOTAL** | **43** | **46** | **89** |
