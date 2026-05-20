# BattleCraps — Crew & Level Scaling Balance Analysis

> **Status:** Brainstorm / pre-implementation. No numbers in this doc have been applied to the codebase.
> **Prepared by:** Game design review session, 2026-05-19.

---

## The Root Problem Before Individual Crew

Before rating anyone in isolation, it's important to understand **why the game is easy** structurally, because it affects every number below.

The payout formula is: `floor((GrossProfit + additives) × hype × ∏multipliers)`

The fatal interaction is that **additives are multiplied by hype**. Additive crew were designed to generate steady income at a modest fraction of `maxBet`. But that fraction gets multiplied by hype before paying out. At On Fire tier (2.5×), Grinder's 0.75× becomes effectively 1.875× before Whale or any other multiplier is applied. The individual numbers look conservative; the multiplication turns them into game-breakers.

The second structural problem: **there's no drain mechanic to counteract hype accumulation at early/mid floors**. ORBITAL_DECAY (floor 7 boss) is the only rule that pushes hype below 1.0×, but by the time players reach it they're already clearing markers in 3–4 rolls. Hype just keeps climbing with no pressure.

---

## Crew-by-Crew Assessment

### NERF — Urgently Overtuned

---

**The Grinder** *(Starter, TABLE)*
`0.75× maxBet on NO_RESOLUTION (~65–70% of point-phase rolls)`

The worst offender in the game. NO_RESOLUTION is the single most common roll outcome in the point phase. You cannot avoid triggering Grinder — it fires by default. At On Fire hype, a single Grinder fire is worth `0.75 × 0.10 × target × 2.5 = 18.75% of the marker target`. Five consecutive blank rolls generates ~94% of the target from Grinder alone. This is a Starter crew. There is no scenario where this is appropriately tuned.

**Recommendation:** `0.75 → 0.25–0.30`. You want Grinder to feel like a slow drip reward for surviving the grind, not a primary income engine. At 0.25× it contributes 6.25% of target per trigger at On Fire — useful and satisfying, but you still need to actually win rolls.

---

**The Contrarian** *(Starter, WILDCARD)*
`1.0× maxBet when dice total < last (~40% of rolls after the first)`

Contrarian + Momentum together cover ~85% of non-first-rolls — descent and ascent. With both in your crew, nearly every roll is generating additives. 1.0× at 40% frequency is too rich. The concept is clever (rewarding descending luck) but the value needs to reflect the frequency.

**Recommendation:** `1.0 → 0.45–0.50`. At half value it's still a compelling pickup, especially paired with Echo (same-value trigger covering the remaining ~15%).

---

**"Hype-Train" Holly** *(Uncommon, HYPE)*
`+0.3 hype on POINT_HIT`

POINT_HIT already has a base tick of +0.25. Holly brings it to +0.55 per point hit. Two point hits = +1.10 hype. A player reaches On Fire (2.5×) in 3 point cycles from a cold start. That's too fast. The entire ORBITAL_DECAY boss mechanic (0.5× drain per seven-out) becomes trivial when hype is recovered in a single point hit cycle.

**Recommendation:** `+0.3 → +0.15`. Total POINT_HIT tick becomes +0.40. You'd need 4–5 point hits to reach On Fire from baseline, which gives boss mechanics time to bite.

---

**The Shark** *(Rare, PAYOUT)*
`2.0× maxBet on POINT_HIT`

The Shark is the highest ADDITIVE_MULT in the game. At floor 5 boss ($45k target), a POINT_HIT fires Shark for `2.0 × $4,500 = $9,000 additive`. At On Fire hype that's $22,500 from the Shark alone on a single point hit — nearly half the marker target. A Rare crew should feel powerful, not decisive.

**Recommendation:** `2.0 → 1.25`. Still the best POINT_HIT additive, but no longer a single-roll win button.

---

**The Bookkeeper** *(Starter, WILDCARD)*
`1.0× maxBet every 3rd roll (33% frequency)`

Expected value of 0.33× maxBet per roll. That's higher than Close Call (0.35×) and Even Keel (0.25×) for a Starter — and its trigger is completely roll-agnostic. The Bookkeeper cares about nothing: no dice pattern, no game state, just "was this roll 3, 6, 9, 12…" It should be the lowest-EV additive crew given its simplicity.

**Recommendation:** `1.0 → 0.50`. Expected EV drops to 0.165× per roll. Still useful, fits Starter power level.

---

**The Close Call** *(Starter, DICE)*
`1.25× maxBet on consecutive dice values (~28% frequency)`

EV: 0.35× per roll. For a Starter, that's too high. There's also an aesthetic contradiction: consecutive dice include [3,4] and [4,3], which total 7. On a come-out that's a NATURAL win; in point phase it's a SEVEN_OUT. The Starter that pays extra on seven-out dice feels thematically odd.

**Recommendation:** `1.25 → 0.65`. Or reconsider the trigger to specifically reward non-7 consecutive totals. At 0.65× it's still a nice Starter pickup.

---

### NERF — Mildly Overtuned

---

**The Echo** *(Starter, HYPE)*
`+0.4 hype on repeated dice total (~17% frequency)`

+0.4 is the second-highest single-trigger hype boost. At 17% frequency, Echo has expected +0.068 hype/roll. Reasonable in isolation but Echo + Momentum + Holly creates a trio that fires on ~62% of all rolls and generates substantial hype. Echo is less the problem and more the last straw that makes the combo degenerate.

**Recommendation:** `+0.4 → +0.25–0.30`. Or leave it and tune the others. The design (repetition = crowd excitement) is good enough to preserve.

---

**The Lucky Charm** *(Rare, HYPE)*
`+1.0 hype on SEVEN_OUT (carries to next shooter via cascadeHypeDelta)`

Lucky Charm fires on *every* seven-out. The +1.0 delta carries forward so the next shooter always starts at ≥2.0× hype. Combined with Sea Legs (comp) — which preserves half the accumulated hype above 1.0× — after a big hype run you might start the next shooter at 2.5× or 3.0×. Lucky Charm turns losing a shooter into a free On Fire ramp. The fire-and-forget nature (every seven-out, no cooldown) means it never stops contributing positively.

**Recommendation:** Add a **per-shooter cooldown**. Lucky Charm fires on the first seven-out per shooter, then goes cold. This preserves the great "silver lining on your worst moment" feel but stops it from being a free 2.0× floor on every single shooter change.

---

**The Silver Lining** *(Starter, HYPE)*
`+0.6 hype on CRAPS_OUT`

+0.6 is the highest single-trigger hype boost in the game, and it fires on craps-out — a losing roll. The compensation logic makes thematic sense, but it's generous. CRAPS_OUT only happens ~11% of come-out rolls so the EV is modest, but when it fires it creates a disproportionate swing. Combined with Doorman and Handicapper, every come-out roll (win or lose) is a net positive.

**Recommendation:** `+0.6 → +0.4`. Still the highest single-trigger boost, still feels dramatic on a craps-out, but less likely to launch a hype run off a bad streak.

---

### FINE — Working as Designed

| Crew | Notes |
|---|---|
| **"Ace" McGee** (Starter, DICE) | `0.75× maxBet on any 1 (~31%)`. EV: 0.23× maxBet/roll. Moderate, dice-flavor appropriate. Fine. |
| **The Doorman** (Starter, TABLE) | `0.5× maxBet on every come-out`. Come-outs ~20-25% of total rolls. EV: ~0.11× maxBet/roll. Steady and thematic. Fine. |
| **The Even Keel** (Starter, TABLE) | `1.0× maxBet on both dice even (25%)`. EV: 0.25× maxBet/roll. Reasonable. Nice design pairing with Odd Couple. Fine. |
| **The Handicapper** (Starter, PAYOUT) | `+0.1–0.3 hype on POINT_SET`. Fires ~67% of come-outs, average +0.2 hype. Rewards risky points. Good design. Fine. |
| **The Floor Walker** (Uncommon, TABLE) | Refunds passLine on first seven-out per shooter. Underrated defensive pick. Scales well with bet size. Fine. |
| **"Lefty" McGuffin** (Epic, DICE) | Re-roll seven-out once per shooter. High cost, high impact, probabilistic outcome. Priced correctly. Fine. |
| **The Physics Professor** (Rare, DICE) | Nudges paired dice toward point. Narrow trigger, dramatic when it fires. Fine. |
| **The Mimic** (Epic, WILDCARD) | Copies previous slot. Powerful by design — doubles whatever precedes it. Re-evaluate after additive nerfs to see if any synergies are still degenerate. |
| **The Old Pro** (Epic, WILDCARD) | 15% bet ceiling instead of 10%. Makes all additive crew 50% more powerful. Correct as a meta-play / leaderboard-chaser pick. Fine after other nerfs. |
| **The Mechanic** (Legendary, DICE) | Freeze a die for 4 rolls. Highest skill floor in the game. Correctly Legendary. Fine. |
| **The Whale** (Legendary, PAYOUT) | 1.2× multiplier on all wins. Powerful but correctly priced. Terrifying with broken additives — should feel premium but not dominant after the nerfs. Fine. |
| **The Drunk Uncle** (Rare, HYPE) | 33% chance ±hype each roll. Positive EV but low. Chaos is the point. Fine. |
| **The Pressure Cooker** (Starter, WILDCARD) | +0.5 hype + 1.5× maxBet after 5 blank rolls. Conditional enough that the large payout is justified. Design success — makes long stalemates tense and rewarding. Fine. |
| **The Mirror** (Starter, PAYOUT) | +0.2 hype on any 7 (~17%). Tiny silver lining on seven-outs. Fine. |
| **The Odd Couple** (Starter, HYPE) | +0.2 hype on both dice odd (25%). EV: 0.05× hype/roll. Modest. Fine. |
| **The Momentum** (Starter, HYPE) | +0.2 hype when dice > last (~45%). The Contrarian combo is the problem, not Momentum itself. Fine on its own after Contrarian nerf. |
| **The Mathlete** (Rare, TABLE) | See buff candidates below. |
| **The Regular** (Uncommon, PAYOUT) | See buff candidates below. |
| **The Lookout** (Starter, DICE) | See buff candidates below. |
| **The Nervous Intern** (Common, HYPE) | See buff candidates below. |

---

### BUFF — Underpowered

---

**The Mathlete** *(Rare, TABLE)*

For a Rare, the value proposition is weak unless you're playing hardways actively. Hardway bets require extra capital and Mathlete only fires if the hardway number rolls soft AND you have money on it. In practice he's often sleeping. The protection is unique and mechanically interesting, but it needs upside to justify the slot cost.

**Recommendation:** When Mathlete fires (protection triggered), also add `+0.25× maxBet` additive for saving the bet. You got lucky — Mathlete should celebrate it.

---

**The Lookout** *(Starter, DICE)*
`+0.15 hype at 31% frequency — weakest hype crew in the game`

Compare: Odd Couple (+0.2 at 25%), Mirror (+0.2 at 17%), Nervous Intern (+0.2 at ~6% of all rolls). Lookout has the highest frequency of any pure-hype Starter but the lowest boost value. There's no mechanical justification for this — a 6 appearing on a die is neither rarer nor more meaningful than both dice being odd.

**Recommendation:** `+0.15 → +0.20`. Aligns with other Starter hype crew values.

---

**The Nervous Intern** *(Common, HYPE)*
`+0.2 hype on NATURAL (~6% of all rolls)`

NATURAL is already a win, so this boost isn't celebrating a near-miss — it's gilding a lily. +0.2 on a 6% trigger is low EV. For a Common-tier crew, the value should be slightly above Starter.

**Recommendation:** `+0.2 → +0.30`. Or add a small cash additive (`+0.25× maxBet`) alongside the hype bump, making the Nervous Intern feel like he's losing his mind on a good roll rather than just mildly pleased.

---

**The Regular** *(Uncommon, PAYOUT)*
`passLine bet as additive on NATURAL`

The scale-with-passLine design makes Regular feel proportional but never punchy. At early floors where passLine is $5, the additive is $5 — trivial. At late floors the passLine cap is `maxBet = 10% of target`, so Regular caps at the same as a 1.0× additive crew anyway. The scaling bottoms out at early game where it matters least.

**Recommendation:** Change to a fixed `0.75× maxBet` additive on NATURAL (dropping the passLine scaling). More predictable, always meaningful, properly distinguishes it from the Nervous Intern. NATURAL fires ~6–7% of total rolls, so EV is 0.05× maxBet/roll — modest but consistent.

---

## Level Scaling Analysis

### Floor Transition Jumps

| Transition | Targets | Jump |
|---|---|---|
| F1 boss → F2 marker 1 | `$250 → $300` | **+20%** ⚠️ |
| F2 boss → F3 marker 1 | `$1k → $1.5k` | +50% |
| F3 boss → F4 marker 1 | `$4k → $6k` | +50% |
| F4 boss → F5 marker 1 | `$12.5k → $20k` | +60% |
| F5 boss → F6 marker 1 | `$45k → $70k` | +56% |
| F6 boss → F7 marker 1 | `$175k → $250k` | +43% |
| F7 boss → F8 marker 1 | `$650k → $1M` | +54% |
| F8 boss → F9 marker 1 | `$2.5M → $5M` | **+100%** ✅ (intentional) |

### Within-Floor Scaling

| Floor | Marker 1→2 | Marker 2→Boss |
|---|---|---|
| F1 | 2.0× | 2.5× |
| F2 | 2.0× | 1.67× |
| F3 | 1.67× | 1.60× |
| F4 | 1.50× | 1.39× |
| F5 | 1.50× | 1.50× |
| F6 | 1.71× | 1.46× |
| F7 | 1.70× | 1.53× |
| F8 | 1.75× | 1.43× |
| F9 | 2.00× | 2.00× |

---

### Problem 1 — F1→F2 transition is trivially gentle (+20%)

The F1 boss is at $250. The first marker of F2 is $300. A player who just cleared the F1 boss likely has $250+ bankroll *before* their pub stop. After the pub stop, they walk into F2 with $250+ in cash. The first marker is already nearly met. This makes the entire first floor of F2 feel like an afterthought — and Sarge's RISING_MIN_BETS boss mechanic never has time to escalate before the markers fall.

**Recommendation:** Raise F2's first marker from `$300 → $400–500`. This creates a 60–100% jump from the F1 boss, more in line with the rest of the curve.

---

### Problem 2 — F8→F9 transition (+100%) is intentionally brutal — keep it

The Null Space is designed as the endgame gauntlet with no comp, crew slots being stripped, and the steepest floor-entry jump. This is correct. It should only feel proportionate once earlier floors have been tightened.

---

### Problem 3 — Within-floor scaling compresses in the middle

F3–F5 within-floor multipliers sit in the 1.4–1.5× range, which is the flattest section of the gauntlet. F6–F8 actually *loosen* slightly (1.7× on marker 1→2) before tightening at the boss. F9 returns to 2.0× for its clean climactic feel. The compression in F3–F5 is worth watching — that's the crew unlock window, and the flattest scaling coincides with the most powerful new tools entering the draft.

---

### Problem 4 — Additive crew scale with the target, which defeats the difficulty curve

Every additive crew uses `N × floor(markerTarget × 0.10)`. The marker targets are the difficulty scale. But because additives scale *proportionally* with the target, a player with Grinder at F2 and at F9 faces the **same relative challenge** — Grinder is always earning ~7.5% of the target per trigger regardless of floor. The bosses get harder mechanically, but crew income keeps up automatically.

This was the intent of FB-024 (dynamic additive scaling), and the concept is correct. The problem is that the `N` multipliers are too high, so additive crew *outpace* difficulty rather than track it. The fix is in the `N` values, not the scaling mechanism.

---

## Priority Summary

| Priority | Change | Impact |
|---|---|---|
| 🔴 Critical | Grinder: `0.75 → 0.28` | Breaks the primary degenerate combo |
| 🔴 Critical | Holly: `+0.3 → +0.15` | Slows On Fire ramp; makes boss hype mechanics relevant |
| 🔴 Critical | Contrarian: `1.0 → 0.45` | Breaks Momentum+Contrarian dominance |
| 🟠 High | Shark: `2.0 → 1.25` | POINT_HIT should feel great, not decisive |
| 🟠 High | Bookkeeper: `1.0 → 0.50` | Starter should be modest income |
| 🟠 High | F2 marker 1: `$300 → $450` | Closes the trivially easy F1→F2 gap |
| 🟡 Medium | Close Call: `1.25 → 0.65` | Right-size for Starter; reconsider 7-total trigger |
| 🟡 Medium | Lucky Charm: add per-shooter cooldown | Prevents free 2.0× floor on every shooter |
| 🟡 Medium | Silver Lining: `+0.6 → +0.4` | Still highest single-trigger boost, just not by as much |
| 🟢 Low | Lookout: `+0.15 → +0.20` | Aligns with other Starter hype crew |
| 🟢 Low | Mathlete: add `+0.25× maxBet` when firing | Rare crew deserves upside, not just protection |
| 🟢 Low | Nervous Intern: `+0.2 → +0.30` | Common should feel slightly above Starter |
| 🟢 Low | Regular: change to `0.75× maxBet` on NATURAL | Predictable and always meaningful |
