Product Requirements Document: Battlecraps (v1.1)

1. Executive Summary

Battlecraps is a full-stack, 16-bit roguelike deck-builder that uses a simplified Craps framework as its core resolution engine. Instead of a deck of cards, players recruit a "Crew" of characters with unique abilities that trigger in a specific sequence to manipulate dice, payouts, and multipliers.

2. Core Game Loop

The Entry: Player starts with $250, 5 Shooters (Lives), 1.0x Hype, and all Crew slots empty.

Starting Conditions:
- Bankroll: $250 (25,000 cents internally)
- Shooters: 5
- Hype: 1.0x
- Crew Slots: 5 (all empty at run start)
- Starting Marker: Floor 1, Marker 0

The Table: Player places bets (Pass Line, Odds, Hardways) to reach a specific cash Marker. Bets are deducted from the bankroll at placement (deduct-on-placement model); losses are already reflected before dice roll.

The Roll: Dice are thrown; a 7-out ends a Shooter's life and resets Hype to 1.0x.

The Cascade: Active Crew members trigger abilities clockwise (positions 1 through 5) to modify the result.

The Bar: Upon hitting a Marker, the player transitions to a recruitment phase to draft/replace Crew.

The Boss: Every 3rd Marker is a "High Limit Room" (Boss) with rule-breaking constraints.

3. Functional Requirements

3.1 Betting & Dice Engine (The Physics)

Roll Generation: Server-side RNG for two six-sided dice (2d6).

Pass Line: Standard 1:1 payout on Natural (7/11) or Point hit. Loss on 2, 3, 12 on the Come Out. A minimum Pass Line bet is required before any come-out roll may occur.

Odds: True-odds betting allowed behind the Point (4/10 @ 2:1; 5/9 @ 3:2; 6/8 @ 6:5). Maximum Odds allowed: 3-4-5x the Pass Line bet (3x on points 4/10, 4x on 5/9, 5x on 6/8). Odds bets are only available during POINT_ACTIVE phase.

Hardways: Bets on 4, 6, 8, 10 appearing as pairs. Payouts: Hard 4/10 @ 7:1; Hard 6/8 @ 9:1. Hardway bets are cleared on a Seven Out or when the matching number rolls "soft" (non-paired). High-payout triggers for Crew abilities.

Bet Constraints:
- Maximum bet per type: 10% of the current Marker target. Placing a chip that would exceed the maximum tops the bet out at the maximum rather than rejecting the click — the player always gets the most out of each chip placement.
- Bets are deducted from bankroll at placement; losses require no further deduction at resolution.
- Odds bets are only valid while a point is active.

3.2 The "Clockwise Cascade" (The Logic)

The system must iterate through an array of ActiveCrew[5] starting from index 0.

Each CrewMember object must implement an execute() method that modifies a shared TurnContext (Dice values, Payout multipliers, Hype, or Bankroll).

The Calculation:
- GrossProfit = basePassLinePayout + baseOddsPayout + baseHardwaysPayout
- BoostedProfit = GrossProfit + CrewAdditives (flat bonuses added before multiplication)
- CrewMultiplier = product of all crew multipliers (stacks multiplicatively)
- FinalMultiplier = Hype × CrewMultiplier (rounded to 4 decimal places)
- AmplifiedProfit = floor(BoostedProfit × FinalMultiplier)
- FinalPayout = BaseStakeReturned + AmplifiedProfit

Note: Stake returns (1:1) are NOT amplified by Hype or crew multipliers. Only profit above the returned stake is amplified. Crew additives (flat bonuses) ARE subject to Hype amplification.

3.3 Hype (The Global Multiplier)

Hype is a persistent per-run multiplier that scales all profits above the base stake return.

Hype Lifecycle:
- Starts at 1.0x at run start.
- Increased by crew abilities and point streaks (see 3.4).
- Resets to 1.0x on any Seven Out.
- Resets to 1.0x on any Marker clear (Hype does not carry between segments).

Hype escalation occurs in two layers:
1. Base-game streak ticks (Section 3.4), applied before the Crew cascade fires.
2. Crew ability contributions (Section 3.2), applied during the cascade.

3.4 Hype Escalation (Point Streak System)

Consecutive Point Hits grant a base-game Hype tick before the Crew cascade executes. This creates a "hot streak" feel independent of crew composition.

Streak thresholds:
- 1st consecutive Point Hit: +0.05x Hype
- 2nd consecutive Point Hit: +0.10x Hype
- 3rd+ consecutive Point Hit: +0.20x Hype per hit

Streak counter resets to 0 on any Seven Out or Marker clear.

3.5 Persistence & Auth (The Full-Stack)

User Accounts: Secure authentication (JWT) to track "Comps" (Permanent Upgrades) and "Unlocked Crew." Auth layer is currently a placeholder (x-user-id header) pending full JWT implementation.

Run Persistence: Complete run state (Bankroll, Shooters, Hype, Crew, point streak, bets) must be saved to a database after every roll settlement to prevent loss on refresh.

4. Technical Specifications

4.1 Data Models

User: uid, username, email, password_hash, unlocked_crew[], comp_perks[], lifetime_earnings.

Run: run_id, user_id, status, phase, bankroll, shooters, current_marker_index, floor, current_point, hype, consecutive_point_hits, bets (jsonb), crew_slots[5] (jsonb), rewards_finalised.

CrewMember: id, name, ability_category, cooldown_type, cooldown_state, base_cost, visual_id, description, is_starter_roster.

TurnContext (runtime, not persisted): dice, dice_total, is_hardway, roll_result, active_point, base_payouts, additives[], multipliers[], hype, flags (sevenOutBlocked, passLineProtected, hardwayProtected), resolved_bets.

4.2 State Machine

INIT: Authenticating user and loading profile.

IDLE_TABLE (phase: COME_OUT): Waiting for player to place initial Pass Line bet and initiate come-out roll.

POINT_ACTIVE (phase: POINT_ACTIVE): Point established; Odds and Hardway betting enabled.

RESOLUTION: Dice rolled; Cascade executing; Settlement pending. Transient — immediately advances to next stable state.

TRANSITION: Marker hit; Loading "The Seven-Proof Pub" (recruitment screen). Shooters reset to 5. Hype resets to 1.0x.

GAME_OVER: Shooters = 0 or final Marker cleared. No further rolls permitted. Meta-progression rewards calculated.

4.3 Real-Time Event Model (WebSocket)

Roll resolution streams granular events over WebSocket to support sequential UI animations:

cascade:trigger — Emitted once per Crew member that fires during a cascade. Includes a contextDelta (sparse diff of only the TurnContext fields changed by that member) to drive sequential portrait flash animations client-side without redundant data.

turn:settled — Emitted once after all cascade events, with the final RollReceipt (see 4.4).

WebSocket authentication uses the userId in the socket handshake payload.

4.4 Roll Receipt

Every roll produces a fully itemized RollReceipt:
- Per-bet breakdown (Pass Line, Odds, each Hardway): stake returned + profit.
- Crew contributions: which members fired, what they added/multiplied.
- Hype multiplier applied at settlement.
- Final net result (positive = win, negative = loss).

Displayed in the Roll Log UI component (see Section 6).

5. Content & Progression (MVP Scope)

5.1 The Gauntlet

Floor

Venue

Marker Targets

Boss

Boss Rule

Comp Reward

1

VFW Hall

$300 / $600 / $1k

Sarge

Rising Min-Bets (escalates on Point Hit)

Member's Jacket: +1 Shooter

2

Riverboat

$1.5k / $2.5k / $4k

Mme. Le Prix

Disables Crew Clockwise

Sea Legs: Hype resets 50%

3

The Strip

$6k / $9k / $12.5k

The Executive

4s = Instant Loss

Golden Touch: 1st Roll is 7/11

5.1.1 Rising Min-Bets Mechanics (Sarge — Floor 1 Boss)

The Pass Line minimum bet starts at 5% of the marker target and rises by 2% per Point Hit scored during the fight, capped at 20%.

Formula: minBet = targetCents × clamp(0.05 + 0.02 × bossPointHits, 0, 0.20), rounded up to the nearest dollar.

Escalation trigger: the counter (bossPointHits) increments ONLY on a POINT_HIT that does not clear the marker. All other outcomes — NATURAL, CRAPS_OUT, POINT_SET, SEVEN_OUT, NO_RESOLUTION — leave the counter unchanged.

Seven Out behaviour: the min-bet HOLDS at its current level on a Seven Out. Sarge does not let the pressure drop just because the shooter changed.

Cap / reset: the min-bet never exceeds 20% of the target ($200 for the $1k Marker 2 boss). The counter resets to 0 when the player clears the marker and enters TRANSITION.

Example (Marker 2, $1,000 target): Roll 1 = $50 min. Hit the point twice → $90 min. Hit it again → $110 min. Seven Out → still $110. Cap reached at 8 Point Hits → $200 max thereafter.

5.2 The Starter 15 (Archetypes)

The 15 starter crew members required for the MVP logic engine:

"Lefty" McGuffin (Dice): Re-rolls a Seven Out (1x per Shooter).

The Physics Prof (Dice): Shifts both dice ±1 toward the active Point value. No effect during Come Out.

The Mechanic (Dice): Sets the lower die to 6 (4-roll cooldown). Note: if the other die shows 1, this will produce a Seven Out.

The Mathlete (Table): Hardways stay up on "Soft" rolls (non-paired matching totals).

The Floor Walker (Table): First Seven Out per Shooter refunds the Pass Line stake (no payout, but bet returned to bankroll).

The Regular (Payout): Grants a free Odds bonus equal to the Pass Line bet on a Natural.

The Big Spender (Payout): +$100 flat bonus on Hardway wins. Amplified by Hype.

The Shark (Payout): +$100 flat bonus on any Point hit. Amplified by Hype.

The Whale (Payout): 1.2x multiplier on all winning payouts. Stacks multiplicatively with other crew multipliers.

The Nervous Intern (Hype): +0.2x Hype on Natural 7/11.

"Hype-Train" Holly (Hype): +0.3x Hype on any Point Hit.

The Drunk Uncle (Hype): 33% chance per roll to randomly add or subtract up to 0.5x Hype. Unreliable but affordable.

The Mimic (Wildcard): Copies the previous slot's ability. Requires an occupied slot to the left; handled outside the standard execute() pipeline.

The Old Pro (Wildcard): +1 Shooter per Marker reached. Fires on TRANSITION state.

The Lucky Charm (Wildcard): Locks Hype floor at 2.0x if they are the only Crew member in any slot. Handled outside the standard execute() pipeline (hype floor injected before execute runs).

6. UI/UX Requirements

Theme: 16-bit retro, dark palette (neon on casino felt).

Dice Animation: 3D scaling effect on roll (Mode-7 style or CSS transforms) moving towards the camera. Throw sequence: idle → throwing → tumbling → landing → result.

Feedback: Successive visual highlighting for Crew triggers (Portraits flash, Barks/Text Bubbles appear). One portrait fires per cascade:trigger event.

Layout: Top-down table. Top half is the betting grid; bottom half is the "Rail" showing the 5 Crew portraits reading left to right. Bankroll, Shooter count, and Hype meter displayed on the table.

Roll Log: Itemized transaction receipt displayed after each roll, showing per-bet breakdowns, crew contributions, Hype multiplier applied, and final net. Color-coded by outcome type (win = green, loss = red, info = blue).

Celebration: Chip rain particle effect on large wins.

Recruitment Screen ("The Seven-Proof Pub"): Modal displayed during TRANSITION state. Shows available crew with costs and ability descriptions. Supports slot selection and a skip option.

7. Non-Functional Requirements

Latency: Roll resolution must feel snappy (< 200ms round trip) to maintain the "one more roll" addiction loop.

Security: Betting logic, dice RNG, and bankroll updates MUST occur on the server to prevent client-side manipulation. Crew execute() logic runs server-side only.

Scalability: System should handle simultaneous independent runs across multiple users.

Concurrency: Run state updates use optimistic locking (updatedAt timestamp comparison) to detect and reject race conditions.
