Product Requirements Document: Battlecraps (v1.2 — synced with the beta build, 2026-10-13)

1. Executive Summary

Battlecraps is a full-stack, 16-bit roguelike deck-builder that uses a simplified Craps framework as its core resolution engine. Instead of a deck of cards, players recruit a "Crew" of characters with unique abilities that trigger in a specific sequence to manipulate dice, payouts, and multipliers.

2. Core Game Loop

The Entry: Player starts with $30, 5 Shooters (Lives), 1.0x Hype, and 3 empty Crew slots.

Starting Conditions:
- Bankroll: $30 (3,000 cents internally) — below the $50 first marker
- Shooters: 5 (refilled to 5 at every marker; 6 with the Member's Jacket comp)
- Hype: 1.0x
- Crew Slots: 3 active of 5 (Board Seat comp unlocks the 4th, Cargo Hold the 5th)
- Starting Marker: Floor 1 (The Loading Dock), Marker 0

The Table: Player places bets (Pass Line, Odds, Hardways) to reach a specific cash Marker. Bets are deducted from the bankroll at placement (deduct-on-placement model); losses are already reflected before dice roll.

The Roll: Dice are thrown; a 7-out ends a Shooter's life and resets Hype to 1.0x (Sea Legs, Lucky Charm and The Commander change this).

The Cascade: After the dice land, active Crew members trigger abilities left-to-right (slot 1 through the last unlocked slot) to modify the result.

The Bar: Upon hitting a Marker, the player transitions to a recruitment phase to draft/replace Crew.

The Boss: Every 3rd Marker is a "High Limit Room" (Boss) with rule-breaking constraints. 27 markers across 9 floors; beating the Floor 9 boss wins the run.

3. Functional Requirements

3.1 Betting & Dice Engine (The Physics)

Roll Generation: Server-side RNG for two six-sided dice (2d6).

Pass Line: Standard 1:1 payout on Natural (7/11) or Point hit. Loss on 2, 3, 12 on the Come Out. A minimum Pass Line bet is required before any come-out roll may occur.

Odds: True-odds betting allowed behind the Point (4/10 @ 2:1; 5/9 @ 3:2; 6/8 @ 6:5). Maximum Odds allowed: 3-4-5x the Pass Line bet (3x on points 4/10, 4x on 5/9, 5x on 6/8). Odds bets are only available during POINT_ACTIVE phase.

Hardways: Bets on 4, 6, 8, 10 appearing as pairs. Payouts: Hard 4/10 @ 7:1; Hard 6/8 @ 9:1. Hardway bets are cleared on a Seven Out or when the matching number rolls "soft" (non-paired). High-payout triggers for Crew abilities.

Bet Constraints:
- Maximum bet per type: 10% of the current Marker target (15% with The Old Pro). In The Sovereign's fight the max is floored at 5× the tide minimum; The Commander's death spiral halves it. Placing a chip that would exceed the maximum tops the bet out at the maximum rather than rejecting the click.
- Minimum come-out Pass Line bet: ~1/6 of the table max, snapped to $5, never below $5 (`getMinBet`). The Sovereign's tide raises it during that fight.
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
- Increased by crew abilities and base-game ticks (see 3.4).
- Resets to 1.0x on any Seven Out — except: Sea Legs keeps half the Hype above 1.0x; crew Hype gained on the seven-out roll (e.g. Lucky Charm +1.0) carries to the next shooter; The Commander's fight replaces the reset with a tiered drain that can go below 1.0x.
- Resets to 1.0x on any Marker clear (Hype does not carry between markers).
- Tiers: ≥1.5x Heating Up, ≥2.5x On Fire (visual effects).

Hype escalation occurs in two layers:
1. Base-game streak ticks (Section 3.4), applied before the Crew cascade fires.
2. Crew ability contributions (Section 3.2), applied during the cascade.

3.4 Hype Escalation (Point Streak System)

Base-game Hype ticks are applied before the Crew cascade executes. Consecutive Point Hits create a "hot streak" feel independent of crew composition.

- Point Hit: +0.15x (1st), +0.20x (2nd consecutive), +0.25x (3rd), +0.30x (4th+, capped) — `getBaseHypeTick()`
- Natural: +0.10x
- Craps Out: −0.05x (never below 1.0x)

Streak counter resets to 0 on any Seven Out or Marker clear.

3.5 Persistence & Auth (The Full-Stack)

User Accounts: Clerk authentication (Google OAuth) with JWT verification on every API route. The user record tracks unlocked crew, unlock progress, tutorial completion, and personal bests. Comp perks are scoped to a single run (`runs.comp_perk_ids`).

Run Persistence: Complete run state (Bankroll, Shooters, Hype, Crew, point streak, bets) must be saved to a database after every roll settlement to prevent loss on refresh.

4. Technical Specifications

4.1 Data Models

Authoritative schema: `apps/api/src/db/schema.ts`. Summary:

User: id, clerk_id, username, email, unlocked_crew_ids[], unlock_progress (jsonb), tutorial_completed, max_bankroll_cents, highest_marker_reached.

Run: id, user_id, status, phase, bankroll_cents, shooters, current_marker_index, current_point, hype, consecutive_point_hits, boss_roll_count (`bossPointHits` in code — the per-boss counter), bets (jsonb), crew_slots[5] (jsonb), unlocked_slots, comp_perk_ids[], pending_additive_cents (boss escrow), mechanic_freeze, is_dev_run.

CrewDefinition: id, name, ability_category, cooldown_type, rarity, visual_id, brief/detailed/unlock descriptions, unlock_quote, is_starter_roster. Hire cost is computed at recruit time from rarity (no stored cost).

TurnContext (runtime, not persisted): dice, dice_total, is_hardway, roll_result, active_point, base_payouts, additives[], multipliers[], hype, flags (sevenOutBlocked, passLineProtected, hardwayProtected), resolved_bets.

4.2 State Machine

INIT: Authenticating user and loading profile.

IDLE_TABLE (phase: COME_OUT): Waiting for player to place initial Pass Line bet and initiate come-out roll.

POINT_ACTIVE (phase: POINT_ACTIVE): Point established; Odds and Hardway betting enabled.

RESOLUTION: Dice rolled; Cascade executing; Settlement pending. Transient — immediately advances to next stable state.

TRANSITION: Marker hit; Loading "The Seven-Proof Pub" (recruitment screen). Shooters reset to 5 (6 with Member's Jacket). Hype resets to 1.0x.

GAME_OVER: Shooters = 0 below the marker target, bankroll below the minimum bet with no chips on the table, an Executive PIP termination, or the final Marker cleared (victory). No further rolls permitted. Leaderboard entry submitted.

4.3 Real-Time Event Model (WebSocket)

Roll resolution streams granular events over WebSocket to support sequential UI animations:

cascade:trigger — Emitted once per Crew member that fires during a cascade. Includes a contextDelta (sparse diff of only the TurnContext fields changed by that member) to drive sequential portrait flash animations client-side without redundant data.

turn:settled — Emitted once after all cascade events, with the final RollReceipt (see 4.4).

WebSocket clients join a per-run room (`run:<id>`). Unlock grants are pushed as `unlocks:granted`.

4.4 Roll Receipt

Every roll produces a fully itemized RollReceipt:
- Per-bet breakdown (Pass Line, Odds, each Hardway): stake returned + profit.
- Crew contributions: which members fired, what they added/multiplied.
- Hype multiplier applied at settlement.
- Final net result (positive = win, negative = loss).

Displayed in the Roll Log UI component (see Section 6).

5. Content & Progression (MVP Scope)

5.1 The Gauntlet

27 markers across 9 floors; the third marker of each floor is a boss. Authoritative data: `GAUNTLET` in `packages/shared/src/config.ts`. Boss mechanics: `docs/frameworks/boss_framework.md`.

| Floor | Venue | Marker Targets | Boss | Boss Rule | Comp Reward |
|---|---|---|---|---|---|
| 1 | The Loading Dock | $50 / $100 / $200 | The Foreman | 20% tax on winning profit | The Vig: crew cash bonuses +20% |
| 2 | VFW Hall | $300 / $500 / $1k | Sarge | Double Time: hit the point within 6 rolls or it's a Seven-Out | Member's Jacket: +1 shooter every marker |
| 3 | The Riverboat | $1.5k / $2k / $4k | Mme. Le Prix | One crew charmed per come-out | Sea Legs: keep half the Hype above 1.0x on Seven Out |
| 4 | The Strip | $5k / $7.5k / $15k | The Executive | Performance Review rating; PIP termination | Board Seat: 4th crew slot |
| 5 | The Lodge | $30k / $50k / $100k | The Hierophant | Crew cash held one roll; 25% seized on Seven Out | The Covenant: halves that seizure (redesign pending, FB-029) |
| 6 | Atlantis | $150k / $250k / $500k | The Sovereign | Tide LOW/EBB/HIGH/FLOW min bet (1×/2×/3×/2×) | Poseidon's Favor: first-roll craps-out doesn't count |
| 7 | The Station | $1M / $1.5M / $3M | The Commander | Tiered Seven-Out Hype drain + death spiral | Cargo Hold: 5th crew slot |
| 8 | The Signal | $5M / $7.5M / $15M | The Emissary | Crew cash held one roll; evaporates on Seven Out | The Frequency: Naturals pay 3% of target |
| 9 | The Null Space | $20M / $30M / $60M | The Architect | Seven Out removes the last crew to fire | None (victory) |

5.1.1 Double Time Mechanics (Sarge — Floor 2 Boss) — FB-030

Once a point is set, the shooter has 6 point-phase rolls (`rollLimit`) to hit it. The clock starts on the first roll after the point-setting roll; come-out rolls never tick it.

Time's up: if the 6th point-phase roll is a blank (no Point Hit, no 7), it counts as a Seven-Out — Pass Line and Odds lost, all Hardways cleared (a Hardway that won on that roll still pays), shooter lost, Hype reset.

Crew interactions: the timeout is applied after the crew cascade. Crew that pay on blank rolls (the Grinder) still pay; crew that react to a dice Seven-Out (Lefty, Floor Walker, Lucky Charm) do not trigger.

Odds with a 6-roll clock: points time out 18% (4/10), 14% (5/9) and 11% (6/8) of the time.

5.2 The Crew (30)

30 crew members: 15 Starter crew (IDs 16–30, always available) and 15 unlockable crew (IDs 1–15, earned via in-game achievements). Full abilities, numbers, unlock conditions and player-facing copy: `docs/frameworks/crew_framework.md` (copy mirrors `apps/api/src/db/seed.ts`).

Hire cost scales with rarity and the marker just cleared (2× max bet for Starter up to 9× for Legendary). Cash-bonus crew scale with the current marker's max bet.

6. UI/UX Requirements

Theme: 16-bit retro, dark palette (neon on casino felt).

Dice Animation: 3D scaling effect on roll (Mode-7 style or CSS transforms) moving towards the camera. Throw sequence: idle → throwing → tumbling → landing → result.

Feedback: Successive visual highlighting for Crew triggers (Portraits flash, Barks/Text Bubbles appear). One portrait fires per cascade:trigger event.

Layout: Top-down table. Top half is the betting grid; bottom half is the "Rail" showing the Crew portraits (3–5 slots) reading left to right, reorderable by drag-and-drop. Bankroll, Shooter count, and Hype meter displayed on the table.

Roll Log: Itemized transaction receipt displayed after each roll, showing per-bet breakdowns, crew contributions, Hype multiplier applied, and final net. Color-coded by outcome type (win = green, loss = red, info = blue).

Celebration: Chip rain particle effect on large wins.

Recruitment Screen ("The Seven-Proof Pub"): Modal displayed during TRANSITION state. Shows available crew with costs and ability descriptions. Supports slot selection and a skip option.

7. Non-Functional Requirements

Latency: Roll resolution must feel snappy (< 200ms round trip) to maintain the "one more roll" addiction loop.

Security: Betting logic, dice RNG, and bankroll updates MUST occur on the server to prevent client-side manipulation. Crew execute() logic runs server-side only.

Scalability: System should handle simultaneous independent runs across multiple users.

Concurrency: Run state updates use optimistic locking (updatedAt timestamp comparison) to detect and reject race conditions.
