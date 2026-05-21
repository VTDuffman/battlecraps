# BattleCraps — Crew Expansion Brainstorm (IDs 31–60)

> **Status:** Brainstorm only. No implementation decisions made.
> **Goal:** Break dominant strategies, enable new archetypes, get weird.
> **Prepared:** 2026-05-19

---

## Design Intent

The current 30 crew collapse into 1–2 dominant combos (Grinder + Holly being the chief offender). These 30 new crew are designed around **eight distinct strategic archetypes** — each a viable path from floor 1 to floor 9 — with enough cross-archetype tension that no two runs feel the same. Several entries introduce mechanics that have no equivalent in the existing roster. Implementation complexity is noted where relevant.

---

## The 30 New Crew

### INCOME / ADDITIVE — New Flavors

---

**31 — The Loan Shark** 💳
- **Category:** PAYOUT
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** When the total of all active bets (pass line + odds + all hardways) equals or exceeds the current table maximum, adds **+3.0× max bet** additive. Fires every roll you're fully committed. "You're already all-in. Get paid for it."
- **Unlock:** Place a max-table pass line bet 25 times across any runs.
- **Notes:** Creates a powerful reason to always bet the ceiling. Synergizes explosively with Old Pro (raises the ceiling to 15%) — Loan Shark fires bigger while Old Pro increases what "max" means. Anti-synergy with conservative play styles.

---

**32 — The Pawnbroker** 🪙
- **Category:** TABLE
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** On any SEVEN_OUT or CRAPS_OUT, adds **30% of the lost pass line bet** to additives (amplified by hype and multipliers). Makes losing pay — just a little.
- **Unlock:** Lose 15 pass line bets across any runs.
- **Notes:** Counterintuitive crew — you actually want to be losing. Pairs with Daredevil (see #42) for a full "death pays" strategy. Diminishing returns with Floor Walker (Floor Walker refunds the whole bet; Pawnbroker gets 30% amplified by hype — at On Fire hype, Pawnbroker might actually be worth more than Floor Walker's flat refund).

---

**33 — The Sleeper** 😴
- **Category:** TABLE
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** Does **nothing** for the first 4 rolls of any shooter. From roll 5 onward: fires **+0.5× max bet** additive on every roll, regardless of outcome. Cold start, hot finish.
- **Unlock:** Have a single shooter throw 10+ rolls in one run.
- **Notes:** Mechanically uses `shooterRollCount >= 5` — already in game state. Slow-burn crew that rewards keeping shooters alive. Natural pairing with Floor Walker and Lefty (survival crew). The Sleeper does nothing if you seven-out in 4 rolls, so it punishes reckless high-risk betting that bleeds shooters fast. Direct tension with the current "burn shooters fast" meta.

---

**34 — The Timekeeper** ⏱️
- **Category:** WILDCARD
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** Accumulates **1 charge per NO_RESOLUTION** roll, stored as a counter on the run state. On the first POINT_HIT or NATURAL this shooter: releases ALL charges as **(charges × 0.3× max bet)** additive in one burst. Counter resets after firing or on SEVEN_OUT.
- **Unlock:** Accumulate 8 NO_RESOLUTION rolls before a POINT_HIT in a single shooter's life.
- **Notes:** Requires a new `timekeeperCharges` field on run state (or can piggyback on `pointPhaseBlankStreak`). The longer the grind, the bigger the payoff. Natural synergy with Grinder (both love NO_RESOLUTION) but with opposite timing — Grinder pays per roll, Timekeeper saves up and pays on the hit. Running both creates a layered reward: steady income + a big burst on the win.

---

**35 — The Roadie** 🎸
- **Category:** WILDCARD
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** Once per segment: when ALL occupied crew slots have each fired at least once during the current segment (not necessarily the same roll), awards a **+2.5× max bet** additive. "The whole band played." Fires at most once per marker attempt.
- **Unlock:** Fill all 5 crew slots and clear a marker.
- **Notes:** Requires tracking which crew IDs have fired at least once this segment — a `crewFiredThisSegment: Set<number>` flag on run state. Creates a strategic incentive for crew DIVERSITY — having all five do something means you can't just stack 5 copies of the same trigger type. The Roadie alone is worth buying just to confirm you've built a varied squad. Anti-synergy with Mechanic (whose execute() is a no-op — Mechanic's freeze happens pre-cascade, so Roadie might never count Mechanic as "fired").

---

### HYPE — New Flavors

---

**36 — The Faith Healer** ✨
- **Category:** HYPE
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** At the START of each cascade, checks `ctx.hype`. If hype is **≤ 1.0×**, fires a **+0.8 hype** boost before any other crew runs. "Heals from the floor." Does not fire above 1.0×.
- **Unlock:** Have hype fall below 1.0× and still clear the segment.
- **Notes:** Specifically designed for Floor 7's ORBITAL_DECAY boss (which can push hype below 1.0×) and as an antidote for Drunk Uncle's downside fires. Pairs with Warden (#37) for layered hype protection. Alone it's a situational defensive pick; together with ORBITAL_DECAY in the room, it becomes essential.

---

**37 — The Warden** 🔒
- **Category:** HYPE
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** On a shooter's very first roll, records the current hype value as a **personal floor** for that shooter's life. Hype cannot fall below that recorded value until the shooter seven-outs. Hype can still rise freely above it.
- **Unlock:** Beat The Commander (Floor 7 ORBITAL_DECAY boss).
- **Notes:** Requires storing a `wardenHypeFloor: number | null` on run state (reset on SEVEN_OUT). The Warden doesn't stop seven-outs — it only prevents hype erosion. Crucial against ORBITAL_DECAY (hype can't be drained below whatever you started the shooter at) and against Drunk Uncle's random -0.25 fires. If you start a shooter at hype 2.3×, the Warden locks 2.3× as the floor. Even if Drunk Uncle fires 3 bad rolls in a row, you stay at 2.3×.

---

**38 — The Meteorologist** 🌩️
- **Category:** HYPE
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** Tracks the hype direction over the last 3 rolls (stored as a `hypeHistory` window). After **3 consecutive rolls where hype increased**: awards **+0.5 hype** ("storm's here"). After **3 consecutive rolls where hype decreased**: awards **+0.3 hype** consolation ("least I called it").
- **Unlock:** Have hype increase on 5 consecutive rolls in one run.
- **Notes:** Requires a small rolling window of hype deltas — 3 booleans. Rewards sustained momentum AND softens sustained crashes. In ORBITAL_DECAY where every seven-out drops hype 0.5×, three consecutive seven-outs would trigger the consolation boost. Adds an element of "reading the table" — players who understand the hype ticking pattern will notice the Meteorologist's moments.

---

**39 — The Night Manager** 🌙
- **Category:** HYPE
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** Every roll: **+0.15 hype per empty crew slot** in the rail. With 2 empty slots: +0.30 hype/roll. With 4 empty slots: +0.60 hype/roll (solo crew + Night Manager).
- **Unlock:** Clear a marker with only 2 crew seated.
- **Notes:** Philosophically opposed to the current "fill all 5 slots" meta. Rewards restraint and deliberate roster construction. The Night Manager himself occupies a slot, so max possible bonus is +0.60 (4 empties). Running Night Manager + Whale + one other crew = 3 occupied slots, +0.30 hype per roll, Whale amplifying every win. A genuinely different feel from the default "recruit everything" approach.

---

**40 — The Statistician** 📊
- **Category:** HYPE
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** On the shooter's **7th, 11th, and 21st rolls** specifically (based on `shooterRollCount`): awards **+0.35 hype**. These are craps mythology's luckiest numbers. Fires at most 3 times per shooter.
- **Unlock:** Have a single shooter throw exactly 11 rolls (exits on the 11th, either by POINT_HIT clearing the marker or SEVEN_OUT on roll 11).
- **Notes:** Pure long-shooter-run reward. Roll 21 is the jackpot — if a shooter is still alive on roll 21, something special is happening, and the Statistician celebrates it. Synergy with Sleeper (also wants long shooters), Floor Walker (buy time for roll 7), Lefty (keep alive for roll 11 and 21). A shooter that hits all three pays out +1.05 hype from the Statistician alone, on top of everything else accumulated over 21 rolls.

---

### SHOOTER LIFECYCLE — New Mechanics

---

**41 — The Landlord** 🏠
- **Category:** TABLE
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** On every come-out roll (NATURAL, CRAPS_OUT, or POINT_SET): adds **+0.25× max bet per shooter remaining**. At 5 shooters: +1.25× max bet. At 2 shooters: +0.50× max bet. Income tied directly to how much life you have left.
- **Unlock:** Clear a boss fight with 4+ shooters remaining.
- **Notes:** Inverts the usual late-game desperation feel. With 5 shooters (early in a segment), the Landlord is your best income crew. With 1 shooter, it's almost worthless. Creates a strategic incentive to PRESERVE shooters — getting to a boss fight with 5 shooters intact means every come-out is worth 1.25× max bet. Pairs tightly with Lefty (prevents seven-out = preserves shooters = Landlord stays rich).

---

**42 — The Daredevil** 🏍️
- **Category:** WILDCARD
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** Tracks consecutive SEVEN_OUTs (across shooters, within one segment). Each sequential seven-out loads **+0.6× max bet** as a charge. On the **next non-seven-out resolution** (NATURAL, POINT_HIT, CRAPS_OUT, or NO_RESOLUTION): releases all charges as one additive burst. Max 5 charges (+3.0× max bet). Counter resets after firing.
- **Unlock:** Seven-out 4 times in a row within a single segment.
- **Notes:** Requires a `daredevilCharges` counter on run state. The "death-loop payoff" crew. If you're in a spiral of seven-outs, the Daredevil is quietly building toward an explosion. Three consecutive seven-outs = +1.8× max bet on the first sign of life. Synergy with Pawnbroker (each seven-out gives Pawnbroker cash AND loads a Daredevil charge) and Lucky Charm (each seven-out also builds hype for the eventual survivor). Full "die fast, die often, get rich" strategy.

---

**43 — The Hedge Fund Manager** 📈
- **Category:** PAYOUT
- **Rarity:** Epic | **Cost:** 7× max bet
- **Power:** Tracks the **peak hype** reached during each shooter's life (`shooterPeakHype`, reset on SEVEN_OUT). On that shooter's SEVEN_OUT: fires additives based on milestones crossed — **+0.8× max bet** per hype tier exceeded (Heating Up ≥1.5 = +0.8×, On Fire ≥2.5 = +1.6× total). Max payout: +1.6× max bet on a seven-out where On Fire was reached.
- **Unlock:** Reach hype 3.5× in a single shooter's life.
- **Notes:** Requires `shooterPeakHype: number` on run state. Makes high-hype runs that end in seven-out feel rewarding rather than tragic. The Hedge Fund Manager "cashes out" at the moment of death. Synergy with Holly and Momentum (build hype fast, inevitably die, get paid). Counter-intuitive positioning: you actually WANT to die after a big hype run, not survive. Creates tension with self-preservation crew (Lefty, Floor Walker).

---

**44 — The Bouncer** 🚪
- **Category:** TABLE
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** Once per shooter: on the **first cascade event** fired by any crew member this shooter's life (regardless of which crew or what trigger), adds **+1.0× max bet** additive. "Welcome to the floor." Fires exactly once per shooter — the next crew that fires after the Bouncer resets triggers it.
- **Unlock:** Have all 5 crew fire in a single cascade 3 times total.
- **Notes:** Cooldown type: `per_shooter`. A small but guaranteed bonus at the start of each shooter's productive life. Creates a minor incentive to have at least one crew that fires early (come-out triggers like Doorman are ideal "openers"). Pairs well with the Understudy (#54) — both reward active, firing crews rather than passive ones.

---

### DICE / OUTCOME — Weird Mechanics

---

**45 — The Coroner** ⚰️
- **Category:** DICE
- **Rarity:** Epic | **Cost:** 7× max bet
- **Power:** On a SEVEN_OUT where the dice are specifically **[1,6] or [6,1]**: fires **+5.0× max bet** additive. The rarest payout in the game — triggers on approximately 1/6 of all seven-outs (~3% of all rolls). "The dead man's hand of craps."
- **Unlock:** Roll [1,6] on a SEVEN_OUT while hype is above 2.0×.
- **Notes:** Pure flavor. The [1,6] combination has a specific cultural weight in craps — it's the "boxcars sister," the one that always feels like a sucker punch. The Coroner turns it into a dark reward. At On Fire hype, a [1,6] seven-out with the Coroner fires for 5.0 × max bet × 2.5 = 12.5× max bet in a single flash. You lose the shooter. You lose the hype reset. And you get paid. The spectacle alone justifies it.

---

**46 — The Demolition Expert** 💥
- **Category:** DICE
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** On a come-out CRAPS_OUT of **exactly 12**: all currently active hardway bets are **paid immediately at 2× their normal odds** (Hard 6/8 → 18:1, Hard 4/10 → 14:1), then cleared. The come-out still loses the pass line normally. Frequency: 1/36 of all come-outs (~0.8% of total rolls).
- **Unlock:** Win 5 hardway bets in a single segment.
- **Notes:** The 12 (double sixes) is the rarest come-out result and the most dramatic. Instead of a quiet loss, it detonates all active hardways at double payout. Requires checking `dice[0] === 6 && dice[1] === 6` during a come-out CRAPS_OUT. Pairs with Mathlete and Street Sweeper for a full hardway protection suite. When Demolition Expert fires, players should feel like they just found money in a coat they thought was ruined.

---

**47 — The Counterfeiter** 💵
- **Category:** DICE
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** On every SEVEN_OUT: **50% RNG chance** the seven-out is "counterfeit." If counterfeit: the shooter survives (no life lost), the point resets, and hype resets to 1.0× as normal — but no shooter dies. If real: normal seven-out. Uses the existing `rollDice()` RNG (d1 ≤ 3 = counterfeit).
- **Unlock:** Have Lefty fire successfully (reroll doesn't also seven-out) 5 times total across runs.
- **Notes:** Different from Lefty in three important ways: (1) probabilistic rather than guaranteed; (2) doesn't reroll dice — the seven-out happened, just didn't count; (3) no cooldown — fires on every seven-out forever. A long-game survival crew. Over 10 seven-outs, statistically saves ~5 shooter lives. Hype still resets on a "counterfeit" seven-out (the table knows something happened even if the shooter survived). Synergy with Lucky Charm: on a REAL seven-out (50% chance), Lucky Charm fires and saves hype. The two together mean no seven-out is purely bad.

---

**48 — The Joker** 🃏
- **Category:** WILDCARD
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** Once per shooter: after any crew fires in the cascade, the Joker **immediately fires that same crew member's execute() a second time** as an encore (using the same TurnContext state at that moment). Picks the **last crew that fired** this roll. Consumes the per-shooter cooldown.
- **Unlock:** Have Mimic fire in the same cascade as any other crew (Mimic + one other = two copies of the same ability in one cascade).
- **Notes:** Cooldown type: `per_shooter`. The cascade already tracks the last-fired crew member, making this implementable without new state. Effectively doubles the output of whichever crew fires last on the roll the Joker is triggered. Strategic implication: slot order matters — put your most powerful crew in slot 4 and Joker in slot 5, so the last thing to fire before the Joker gets doubled. Or put Joker earlier and let it double an income crew. Pairs with Whale (Joker doubles Whale = 1.2 × 1.2 = 1.44×). Doubles the Coroner on a [1,6] seven-out = +10.0× max bet in one flash.

---

### HARDWAY SPECIALIST — Full Archetype Support

---

**49 — The Insider** 🤫
- **Category:** DICE
- **Rarity:** Epic | **Cost:** 7× max bet
- **Power:** Player-activated (like The Mechanic — new endpoint `POST /runs/:id/insider-mark`). Once per segment, the player marks one hardway number (4, 6, 8, or 10). If that hardway bet **wins** this segment (hardway hit before 7-out), the hardway payout component gains an additional **×2.0 multiplier** for that one roll. Mark resets on segment clear or on the hardway winning.
- **Unlock:** Win 3 hardway bets in a single segment.
- **Notes:** Requires new endpoint and `insiderMarkedNumber: number | null` field on run state. Strategic commitment — you're betting the Insider's bonus on a specific number. Pairs with Mathlete (protect the marked number from soft loss), Street Sweeper (survive come-out craps without losing the bet), Demolition Expert (if 12 hits with that hardway active, it pays BEFORE the Insider would apply — interesting edge case). Rewards players who understand hardway probability well enough to commit to a specific number.

---

**50 — The Street Sweeper** 🧹
- **Category:** TABLE
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** On any come-out **CRAPS_OUT** (2, 3, or 12): all currently active hardway bets are **refunded at their placed value** (stake returned, not amplified). The come-out still loses the pass line normally. Hardway bets survive the craps-out.
- **Unlock:** Have 3 craps-outs while hardway bets are active in a single run.
- **Notes:** Cheapest hardway protection in the game. Doesn't protect against seven-out (nothing does except Mathlete's soft-loss protection, which is different). Creates a meaningful reason to keep hardway bets live through come-out rolls without fearing the craps-out wipe. Pairs with Mathlete (soft loss protection in point phase) and Street Sweeper (come-out protection) for comprehensive hardway coverage. The duo together means hardway bets only die on SEVEN_OUT.

---

**51 — The Sparks** ⚡
- **Category:** PAYOUT
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** On any POINT_HIT that is **simultaneously a hardway win** (hard 4 with point 4, hard 6 with point 6, etc. — the rarest overlap): boosts the hardway component of the payout by **×1.5** (applied to `baseHardwaysPayout` before multipliers). The hardway-point-hit is statistically rare (~2% of rolls when betting hardways).
- **Unlock:** Hit a hardway point (point number = hardway number, both dice matching) 5 times across runs.
- **Notes:** Needs `ctx.isHardway && ctx.rollResult === 'POINT_HIT' && ctx.activePoint === ctx.diceTotal` to detect. This is the moment hardway players live for — they established the point, kept the hardway bet alive through soft rolls and craps-outs, and hit it exactly hard. The Sparks turns that rare moment into an even bigger explosion. Pairs with Insider (marked that exact hardway number), Mathlete (kept the bet alive through soft rolls), Demolition Expert (for the adjacent hardway drama). A true hardway specialist reward.

---

**52 — The Cartographer** 🗺️
- **Category:** WILDCARD
- **Rarity:** Uncommon | **Cost:** 4× max bet
- **Power:** Tracks **unique point numbers hit** this segment (set of {4,5,6,8,9,10} where a POINT_HIT occurred). Each first-time unique point hit awards **+0.4× max bet** additive on that roll. Max +2.4× over a full segment if all 6 numbers are hit. Counter resets on segment clear.
- **Unlock:** Hit 4 different point numbers in a single segment.
- **Notes:** Requires `cartographerPointsHit: number[]` on run state. Rewards players who work the full table rather than grinding one lucky point number. Creates a reason to keep establishing and making different points rather than hoping for the same 6 or 8 every time. Thematically: the Cartographer fills in the map — every new territory explored is rewarded.

---

### SQUAD / META — New Mechanics

---

**53 — The Sensei** 🥋
- **Category:** WILDCARD
- **Rarity:** Epic | **Cost:** 7× max bet
- **Power:** Post-cascade: all additive contributions from other crew are multiplied by **×1.20**, all hype contributions from other crew are multiplied by **×1.20**, all multiplier contributions from other crew are multiplied by **×1.20** (rounded to 4 decimal places). The Sensei does nothing alone — he amplifies the squad.
- **Unlock:** Have all 5 crew slots occupied by non-Starter crew simultaneously in any run.
- **Notes:** Implementation: resolveCascade() would need a post-pass that detects Sensei and scales all events. Or simpler: apply 1.2× to `finalContext.additives`, `finalContext.hype` delta, and each multiplier delta after the cascade. Sensei has zero output if placed in a weak squad. In a well-built crew of 4 + Sensei, he amplifies everything by 20%. Running Sensei + Whale is effectively 1.44× on all wins. Running Sensei + 4 hype crew means every hype tick is 20% larger. The Sensei rewards build quality, not individual crew power.

---

**54 — The Understudy** 🎭
- **Category:** WILDCARD
- **Rarity:** Common | **Cost:** 3× max bet
- **Power:** On any roll where **at least one crew slot has an active per_shooter or per_roll cooldown** (cooldownState > 0): adds **+0.4× max bet** additive. "Covering while the star is resting."
- **Unlock:** Use 3 cooldown-based crew in the same run (Lefty + Floor Walker + Mechanic all seated simultaneously).
- **Notes:** Detects cooldown state from `ctx` (the cascade sees crew cooldownState). Makes the penalty of burning a per_shooter cooldown (Lefty, Floor Walker) feel productive — while they're "off," the Understudy picks up the slack. A Mechanic-heavy squad (freeze is per_shooter) means the Understudy fires every roll after the freeze is set. Subtle but meaningful for cooldown-centric builds.

---

**55 — The Maestro** 🎻
- **Category:** HYPE
- **Rarity:** Legendary | **Cost:** 9× max bet
- **Power:** Hype boost scales with **how many other crew fired before the Maestro** this cascade: 0 prior = +0.0, 1 = +0.15, 2 = +0.35, 3 = +0.60, 4 = +0.90. Slot position is everything — put Maestro in slot 5. Build a crew where slots 1–4 each fire on the current roll.
- **Unlock:** Have 4+ crew all fire in the same cascade (before unlocking Maestro, you'll need another crew combo to prove you can do it).
- **Notes:** The cascade already counts events — detecting how many fired before a given slot is straightforward. The Maestro is the capstone crew for "Symphony" builds. Combine with diverse-trigger crew: Doorman (come-out), Grinder or Timekeeper (NO_RESOLUTION), Holly (POINT_HIT), Ace McGee or Close Call (dice-based). If all 4 fire before Maestro: +0.90 hype in a single cascade event. Maestro alone is useless. Maestro with 4 firing crew is the highest single-roll hype gain in the game.

---

**56 — The Arms Dealer** 🔫
- **Category:** TABLE
- **Rarity:** Epic | **Cost:** 7× max bet
- **Power:** After defeating any **boss** (clearing a boss marker), grants **+1 bonus shooter** in the subsequent pub segment (6 total instead of 5). Stacks across bosses: beat two bosses with Arms Dealer active = +2 shooters in the next relevant segment.
- **Unlock:** Beat 3 different bosses in a single run.
- **Notes:** Implemented in `recruit.ts` where boss comp rewards are applied — a second `compShooterBonus` path that checks for Arms Dealer in crew slots. Long-game strategic crew — its value compounds across a full run. By floor 9, a player with Arms Dealer who cleared all 8 prior bosses might have 13 shooters in the Null Space segment. Pairs with Landlord (#41): more shooters = more Landlord income per come-out.

---

### MILESTONE / LONG-GAME — Snowball Mechanics

---

**57 — The Accountant** 🧮
- **Category:** PAYOUT
- **Rarity:** Legendary | **Cost:** 9× max bet
- **Power:** Tracks **total additives earned this run** (cumulative across all segments). Every time that running total crosses a multiple of **10× max bet**, fires a milestone bonus of **+3.0× max bet**. The max bet used for milestone calculation is always the CURRENT marker's max bet, so milestones scale with the floor.
- **Unlock:** Earn 100× max bet in total additives in a single run.
- **Notes:** Requires `lifetimeAdditivesCents: number` on run state. Rewards sustained additive-heavy strategies across the entire run — not just per-segment bursts. The Accountant becomes more valuable the later you are in the run (higher max bet = bigger milestone bonuses). Synergy with Taxman (#58) and Grinder/Bookkeeper/Contrarian — anything that generates additive income consistently. A Legendary crew that earns its keep over a full 9-floor campaign.

---

**58 — The Taxman** 💸
- **Category:** PAYOUT
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** At the moment a **marker is cleared** (transition to TRANSITION status): calculates **10% of all additives accumulated during that segment** and immediately adds it to the bankroll as a bonus (above and beyond the normal payout). A "tax return" for productive play.
- **Unlock:** Clear 3 consecutive markers without sevening out (pure point hits and naturals).
- **Notes:** Requires `segmentAdditivesCents: number` on run state (reset on each segment start). The Taxman is the Accountant's per-segment sibling. While the Accountant rewards the full run, the Taxman rewards each individual segment. In a segment where Grinder (post-nerf 0.28×) generates steady additive income over 20 rolls, the Taxman's 10% might be worth 2× max bet as a segment-end bonus. Scales correctly because segment additives scale with the floor.

---

**59 — The Bookie** 📓
- **Category:** PAYOUT
- **Rarity:** Rare | **Cost:** 5× max bet
- **Power:** Tracks **consecutive come-out NATURALs by the same shooter**. On the second consecutive NATURAL (back-to-back, same shooter, same come-out phase): fires **+2.5× max bet** additive. Counter resets on any non-NATURAL come-out result. Probability of two consecutive naturals: ~4.9%.
- **Unlock:** Roll 2 naturals in a row with the same shooter in any run.
- **Notes:** Simple counter on `consecutiveNaturals` (reset on POINT_SET, CRAPS_OUT, or shooter change). Back-to-back naturals are the craps equivalent of rolling a hard 8 and then immediately rolling it again — the crowd loses its mind. The Bookie captures that energy. Pairs with Nervous Intern (both fire on NATURAL — Intern builds hype on each one, Bookie pays big on the second). Pairs with Golden Touch comp (guaranteed first natural = the Bookie already has one in the bank before you even roll the second).

---

### BOSS / DEFENSIVE — The "Oh No" Crew

---

**60 — The Oracle** 🔮
- **Category:** WILDCARD
- **Rarity:** Legendary | **Cost:** 9× max bet
- **Power:** Once per boss fight: if a roll would result in **immediate GAME_OVER** (specifically from FOURS_INSTANT_LOSS triggering, or from bankroll bust on a SEVEN_OUT while at zero shooters), the Oracle **intercepts** — sets `shooters` to 1 and continues play instead of ending the run. The roll outcome still resolves normally (you still lost the bet). One reprieve per boss fight.
- **Unlock:** Beat The Executive (FOURS_INSTANT_LOSS, Floor 4) without rolling a 4.
- **Notes:** Requires a `oracleUsedThisBoss: boolean` flag on run state (reset on segment clear / boss transition). The Oracle doesn't prevent the loss — it prevents the game from ending. On Floor 4 (FOURS_INSTANT_LOSS), you roll a 4 with 3 shooters remaining — normally GAME_OVER. The Oracle converts it to 1 shooter + continue. On CONVERGENCE (Floor 9), it doesn't apply (CONVERGENCE isn't an instant-loss, it's a crew slot removal). Implementation: adds a check in the instant-loss and seven-out GAME_OVER branches of `computeNextState`. The Oracle is the most expensive insurance in the game — 9× max bet to potentially save a run. Worth it.

---

## Strategy Archetypes

These 30 new crew, combined with the existing 30, enable 8 distinct viable paths through the gauntlet. No two require the same pub draft decisions.

---

### 1. The Crash & Cash 💀📈
*Build hype fast, die gloriously, profit from the wreckage.*

**Core crew:** Hedge Fund Manager (#43) + Lucky Charm + Holly
- Holly builds hype per point hit. You WILL eventually seven-out.
- Hedge Fund Manager pays you based on peak hype at death.
- Lucky Charm hands +1.0 hype to the next shooter so the cycle continues.

**Add for depth:** Daredevil (#42) + Pawnbroker (#32). If you enter a spiral of seven-outs, Daredevil loads charges, Pawnbroker gets cash on each loss. When you finally survive one roll, the burst fires.

**Risk profile:** High variance, long-session friendly. Terrible against CONVERGENCE (The Architect strips crew as you seven-out — exactly what this build does).

---

### 2. The Marathon Runner 🏃
*Keep each shooter alive as long as physically possible.*

**Core crew:** Sleeper (#33) + Statistician (#40) + Floor Walker + Lefty
- Sleeper does nothing for 4 rolls, then fires +0.5× max bet every roll forever.
- Statistician fires +0.35 hype on rolls 7, 11, 21.
- Floor Walker and Lefty together give each shooter two reprieves before death.

**Add for depth:** Timekeeper (#34). Long shooters accumulate NO_RESOLUTION charges and release them on the first point hit — massive burst payoff for the grind.

**Risk profile:** Low variance, patience-dependent. Thrives in floors 1–6. Struggles against CONVERGENCE (long shooters mean more seven-outs = faster crew slot stripping).

---

### 3. The Skeleton Crew 💀
*Run lean. Quality over quantity.*

**Core crew:** Night Manager (#39) + Whale + one premium pick (Shark or Lefty)
- 3 crew total. Night Manager fires +0.30 hype every roll (2 empty slots).
- Whale amplifies every win by 1.2×.
- The third crew covers your primary win condition.

**Risk profile:** Low buy-in cost (can afford a Legendary third crew). Hype builds fast but no income crew — wins come from bet payouts, not additives. Weak against DISABLE_CREW (Floor 3 boss) since your only crew is Whale which fires passively — and Night Manager wants empty slots, which DISABLE_CREW doesn't change.

---

### 4. The Hardway Casino 🎰
*Bet every hardway, every roll. Protect the investment.*

**Core crew:** Insider (#49) + Mathlete + Street Sweeper (#50) + Sparks (#51)
- Insider marks your target hardway for 2× multiplier.
- Mathlete protects from soft-loss wipes.
- Street Sweeper refunds hardways on craps-outs.
- Sparks fires when you hit the hardway point simultaneously.

**Add for depth:** Big Spender. When any hardway wins, Big Spender fires PLUS Sparks fires PLUS Insider fires if it's your marked number. A hardway-point-hit with all four active is the highest single-roll payout in the game.

**Risk profile:** High capital cost (keeping hardway bets active drains bankroll). Demolition Expert (#46) as a fifth crew makes every come-out 12 feel like a jackpot instead of a loss.

---

### 5. The Symphony 🎻
*Fill every seat. Fire every roll. Let the Maestro conduct.*

**Core crew:** Maestro (#55) in slot 5 + 4 diverse-trigger crew in slots 1–4
- Slot 1: come-out trigger (Doorman or Handicapper)
- Slot 2: NO_RESOLUTION trigger (Grinder or Timekeeper)
- Slot 3: POINT_HIT trigger (Holly or Shark)
- Slot 4: dice-based trigger (Ace McGee or Close Call)
- Slot 5: Maestro (+0.90 hype when all 4 fired before it)

**Target:** Every point-phase roll fires slots 2+3+4 = 3 prior crew → Maestro gets +0.60 hype. Every POINT_HIT fires slots 1+2+3+4 = 4 prior crew → Maestro gets +0.90 hype.

**Risk profile:** High draft dependency — you need the right pub offerings. Roadie (#35) as a free sixth synergy: once per segment when all crew have fired at least once, you get a +2.5× max bet bonus.

---

### 6. The Insurance Policy 🔒
*Never die. Never lose. Bore the house into submission.*

**Core crew:** Counterfeiter (#47) + Warden (#37) + Faith Healer (#36)
- Counterfeiter gives 50% survival on every seven-out.
- Warden locks hype floor at the start of each shooter's life.
- Faith Healer rescues hype if it somehow falls below 1.0×.

**Add for depth:** Oracle (#60) for boss fights where even one GAME_OVER threat is unacceptable. Arms Dealer (#56) to accumulate bonus shooters so the Counterfeiter has more lives to save.

**Risk profile:** Low income potential (all defensive crew, no additive or multiplier crew). Designed to survive long enough for the Accountant (#57) or Taxman (#58) to compound. Strongest against ORBITAL_DECAY (Floor 7) and CONVERGENCE (Floor 9). Expensive squad — defensive crew cost 5-9× max bet each.

---

### 7. The Boss Killer ⚔️
*Optimized specifically for boss rooms. Terrible everywhere else. Worth it.*

**Core crew:** Arms Dealer (#56) + Faith Healer (#36) + Oracle (#60)
- Arms Dealer turns every boss killed into bonus shooters.
- Faith Healer neutralizes ORBITAL_DECAY's hype drain mechanic.
- Oracle prevents one GAME_OVER per boss — specifically designed for FOURS_INSTANT_LOSS (Floor 4) and desperate bankrupt moments.

**Narrative arc:** By Floor 9, having cleared all 8 prior bosses with Arms Dealer active means up to +8 bonus shooters in the Null Space. A player with 13 shooters vs. The Architect's CONVERGENCE (strips one slot per seven-out, up to 5) has massive margin.

**Risk profile:** Under-powered in non-boss markers (Arms Dealer does nothing, Faith Healer only fires below 1.0× hype, Oracle only fires once per boss). Requires filling the remaining 2 crew slots with income crew to survive regular markers.

---

### 8. The Snowball ☃️
*Play the long game. Let compounding work.*

**Core crew:** Accountant (#57) + Taxman (#58) + Roadie (#35) + Grinder + Bookkeeper
- Grinder and Bookkeeper generate steady additive income every segment.
- Roadie fires +2.5× max bet once per segment when all crew have contributed.
- Taxman refunds 10% of all that additive income at every marker clear.
- Accountant fires milestone bonuses every time cumulative additives cross 10× max bet.

**When it peaks:** Floor 8–9 with a high max bet. A segment where Grinder + Bookkeeper generate 20× max bet in additives: Taxman returns 2× max bet at marker clear, Accountant fires 2 milestone bonuses (+6× max bet). Every marker clear has a bonus payout on top of normal winnings.

**Risk profile:** Slow start (few milestones at early floors). Survives DISABLE_CREW boss (Grinder and Bookkeeper still fire even when cascade is suppressed — wait, no, DISABLE_CREW suppresses the entire cascade. Grinder and Bookkeeper would be dead in that boss room). **Clear weakness:** Floor 3 boss (Mme. Le Prix) kills this build for one marker.

---

## Highlighted Synergies & Combos

### "The Spiral" — Losing never felt so good
**Pawnbroker (#32) + Daredevil (#42) + Lucky Charm**
- Seven-out 1: Pawnbroker gets 30% of pass line, Daredevil charges (+0.6×), Lucky Charm gets +1.0 hype.
- Seven-out 2: Same. Daredevil at 2 charges (+1.2×). Lucky Charm stacks.
- Seven-out 3: Daredevil at 3 charges. Next non-seven-out fires +1.8× max bet burst.
- At On Fire hype from Lucky Charm stacking: the burst is +4.5× max bet in one shot.

---

### "The Conductor" — Slot order as strategy
**Any 4 diverse-trigger crew + Maestro (#55) in slot 5**
- The cascade order matters more than any individual crew value.
- Maestro's +0.90 on a fully-firing cascade is the highest hype gain per roll in the game.
- Combine with Sensei (#53): 4 crew fire → Sensei amplifies all their output 1.2× → Maestro fires +0.90. One roll, multiple amplification layers.

---

### "The Coroner's Gambit" — Dark payoff
**Coroner (#45) + Joker (#48) + Drunk Uncle**
- Drunk Uncle randomly fires -0.25 hype, pushing you toward bad situations.
- Coroner waits for the [1,6] seven-out.
- When it lands: Coroner fires +5.0× max bet. Joker immediately fires Coroner AGAIN for another +5.0× max bet.
- +10.0× max bet on a single seven-out roll. About 3% of all rolls. Wildly impractical. Absolutely worth building toward.

---

### "The Anti-Boss" — Floor 4 specific
**Oracle (#60) + Old Pro**
- Floor 4 boss (The Executive): rolling a 4 = instant GAME_OVER.
- Oracle intercepts that GAME_OVER and continues with 1 shooter.
- Old Pro raises the max bet, meaning every non-4 roll is generating bigger income.
- Oracle + Old Pro = one free mistake on the deadliest boss in the game, combined with higher upside on every other roll.

---

### "The Hype Immune" — Who needs multipliers?
**Night Manager (#39) + Warden (#37) + Bookie (#59)**
- Night Manager: 2–4 empty slots → +0.30–0.60 hype per roll passively.
- Warden: locks hype floor at the start of each shooter. Night Manager's constant trickle never gets erased.
- Bookie: fires +2.5× max bet on back-to-back naturals. With constant hype accumulation, those naturals are heavily amplified.
- Run 3 crew total. All 3 care about hype in different ways. Lean, fast, self-sustaining.

---

### "The Hardway Fortress" — Full investment
**Insider (#49) + Mathlete + Street Sweeper (#50) + Sparks (#51) + Demolition Expert (#46)**
- Insider marks one hardway number (e.g., Hard 8).
- Mathlete protects from soft 8 loss.
- Street Sweeper refunds all hardways on craps-out.
- Sparks fires extra when Hard 8 = point hit simultaneously.
- Demolition Expert fires 2× all hardways if a 12 comes-out.
- The Hard 8 bet survives craps-outs (Street Sweeper), soft 8s (Mathlete), and explodes on win (Sparks + Insider = ×3.0 on hardway payout). The only way to lose the Hard 8 bet is a seven-out.

---

## Implementation Complexity Notes

**New endpoint needed:**
- The Insider (`POST /runs/:id/insider-mark`) — mirrors Mechanic's freeze endpoint pattern

**New run state fields needed:**
- `timekeeperCharges: number` — The Timekeeper charge accumulator
- `daredevilCharges: number` — The Daredevil charge accumulator
- `wardenHypeFloor: number | null` — The Warden's per-shooter floor
- `shooterPeakHype: number` — The Hedge Fund Manager's peak tracker
- `insiderMarkedNumber: number | null` — The Insider's commitment
- `oracleUsedThisBoss: boolean` — The Oracle's per-boss flag
- `cartographerPointsHit: number[]` — The Cartographer's unique points set
- `roadieCrewFiredThisSegment: number[]` — The Roadie's per-segment set
- `segmentAdditivesCents: number` — The Taxman's segment accumulator
- `lifetimeAdditivesCents: number` — The Accountant's run accumulator
- `consecutiveNaturals: number` — The Bookie's back-to-back tracker
- `hypeHistory: number[]` — The Meteorologist's 3-roll direction window
- `bouncer_firedThisShooter: boolean` — could use per_shooter cooldown instead
- `joker_firedThisShooter: boolean` — per_shooter cooldown

**Post-cascade amplification pass:**
- The Sensei requires a post-cascade step that scales all deltas by 1.2× — would need to be added to `resolveCascade()` return processing in `rolls.ts`

**Standard cascade implementation (no new state):**
- Loan Shark, Pawnbroker, Sleeper, Doorman-style crew, Night Manager, Landlord, Counterfeiter, Coroner, Demolition Expert, Understudy, Sparks, Street Sweeper, Faith Healer, Bookie (simple counter)

---

## Priority Picks for First Wave

If implementing in phases, these 10 have high impact, low complexity, and cover the widest range of new strategies:

| # | Crew | Why first |
|---|---|---|
| 32 | The Pawnbroker | One-liner cascade addition, enables "death pays" archetype |
| 33 | The Sleeper | One field check (`shooterRollCount >= 5`), long-shooter archetype |
| 39 | The Night Manager | Pure hype additive with empty-slot check, Skeleton Crew archetype |
| 41 | The Landlord | Simple come-out additive based on `ctx.shooters`, Landlord archetype |
| 42 | The Daredevil | Charge counter, "Spiral" strategy enabler |
| 43 | The Hedge Fund Manager | Peak hype tracker, Crash & Cash archetype |
| 47 | The Counterfeiter | RNG check on SEVEN_OUT, probabilistic survival |
| 50 | The Street Sweeper | One condition check, full hardway archetype unlock |
| 51 | The Sparks | One condition check, hardway-point overlap reward |
| 55 | The Maestro | Cascade event count, Symphony archetype capstone |
