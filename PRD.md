Product Requirements Document: Battlecraps (v1.0)

1. Executive Summary

Battlecraps is a full-stack, 16-bit roguelike deck-builder that uses a simplified Craps framework as its core resolution engine. Instead of a deck of cards, players recruit a "Crew" of characters with unique abilities that trigger in a specific sequence to manipulate dice, payouts, and multipliers.

2. Core Game Loop

The Entry: Player starts with $250 and 5 Shooters (Lives).

The Table: Player places bets (Pass Line, Odds, Hardways) to reach a specific cash Marker.

The Roll: Dice are thrown; a 7-out ends a Shooter's life and resets "Hype" (the global multiplier).

The Cascade: Active Crew members trigger abilities clockwise (positions 1 through 5) to modify the result.

The Bar: Upon hitting a Marker, the player transitions to a recruitment phase to draft/replace Crew.

The Boss: Every 3rd Marker is a "High Limit Room" (Boss) with rule-breaking constraints.

3. Functional Requirements

3.1 Betting & Dice Engine (The Physics)

Roll Generation: Server-side RNG for two six-sided dice (2d6).

Pass Line: Standard 1:1 payout on Natural (7/11) or Point hit. Loss on 2, 3, 12 on the Come Out.

Odds: True-odds betting allowed behind the Point (4/10 @ 2:1; 5/9 @ 3:2; 6/8 @ 6:5).

Hardways: Bets on 4, 6, 8, 10 appearing as pairs. High-payout triggers for Crew abilities.

3.2 The "Clockwise Cascade" (The Logic)

The system must iterate through an array of ActiveCrew[5] starting from index 0.

Each CrewMember object must implement an execute() method that modifies a shared TurnContext (Dice values, Payout multipliers, Hype, or Bankroll).

The Calculation: FinalPayout = (BaseBet * BasePayout * CrewAdditives) * (GlobalHype * CrewMultipliers).

3.3 Persistence & Auth (The Full-Stack)

User Accounts: Secure authentication to track "Comps" (Permanent Upgrades) and "Unlocked Crew."

Run Persistence: Current run state (Bankroll, Shooters, Crew) must be saved to a database after every roll settlement to prevent loss on refresh.

4. Technical Specifications

4.1 Data Models

User: uid, unlocked_crew[], comp_perks[], lifetime_earnings.

Run: run_id, status, bankroll, shooters, current_marker_index, hype_multiplier, crew_slots[5].

CrewMember: id, name, ability_category, cooldown_state, base_cost, visual_id.

4.2 State Machine

INIT: Authenticating user and loading profile.

IDLE_TABLE: Waiting for player to place initial Pass Line bet.

POINT_ACTIVE: Point established; Odds and Hardway betting enabled.

RESOLUTION: Dice rolled; Cascade executing; Settlement pending.

TRANSITION: Marker hit; Loading "The Seven-Proof Pub" assets.

GAME_OVER: Shooters = 0; Calculating final meta-progression rewards.

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

Rising Min-Bets

Member’s Jacket: +1 Shooter

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

5.2 The Starter 15 (Archetypes)

A sample of the 15 starter crew members required for the MVP logic engine:

"Lefty" McGuffin (Dice): Re-roll a Seven Out (1x per Shooter).

The Physics Prof (Dice): Modify pair values by +/- 1.

The Mechanic (Dice): Set one die to "6" (4-roll cooldown).

The Mathlete (Table): Hardways stay up on "Soft" rolls.

The Floor Walker (Table): First Seven Out doesn't clear the Pass Line.

The Regular (Table): Resets losing Hardway bets on a Point hit.

The Big Spender (Payout): +$50 to Hardway wins.

The Shark (Payout): +$100 flat bonus on Point hit.

The Whale (Payout): 1.2x final payout multiplier.

The Nervous Intern (Hype): +0.2x Hype on Natural 7/11.

"Hype-Train" Holly (Hype): 1.5x Hype on a "Yo-leven" (11).

The Drunk Uncle (Hype): Random +0.1 to +0.5 Hype per roll.

The Mimic (Wildcard): Copies previous slot's ability.

The Old Pro (Wildcard): +1 Shooter per Marker.

The Lucky Charm (Wildcard): Locks Hype at 2.0x if they are your only Crew.

6. UI/UX Requirements

Theme: 16-bit retro, dark palette (neon on casino felt).

Dice Animation: 3D scaling effect on roll (Mode-7 style or CSS transforms) moving towards the camera.

Feedback: Successive visual highlighting for Crew triggers (Portraits flash, Barks/Text Bubbles appear).

Layout: Top-down table. Top half is the betting grid; bottom half is the "Rail" showing the 5 Crew portraits reading left to right.

7. Non-Functional Requirements

Latency: Roll resolution must feel snappy (< 200ms round trip) to maintain the "one more roll" addiction loop.

Security: Betting logic, dice rng, and bankroll updates MUST occur on the server to prevent client-side manipulation.

Scalability: System should handle simultaneous independent runs across multiple users.