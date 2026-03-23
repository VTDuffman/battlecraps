# BattleCraps — Manual Regression Test Plan

**Scope:** Full game — UI, API, betting engine, crew cascade, progression, and persistence.
**Out of Scope:** Crew ability internals (covered by `crew-test-plan.md`), multi-user scenarios, production auth.

---

## Test Layers

Choose the layer based on the size and risk of the change being delivered.

| Layer | When to Use | Approx. Time |
|-------|------------|--------------|
| **L1 — Smoke** | Every merge to main. Verifies the app starts and the core loop isn't broken. | ~5 min |
| **L2 — Sanity** | Any feature change or non-trivial bug fix. Covers all happy paths. | ~20 min |
| **L3 — Full Regression** | Major features, engine changes, or pre-release. Covers edge cases and full progression. | ~60 min |

Each layer is cumulative — L2 includes all L1 tests, L3 includes all L1 and L2 tests.

---

## Setup

```
npm run dev          # starts shared watcher, API (:3001), web (:5173)
```

All tests run against `http://localhost:5173` unless noted. Use the **NEW RUN** button (top-left) to reset between tests. Use the dev bootstrap API for scenario-specific setups:

```
POST /api/v1/dev/bootstrap
{
  "startingBankroll": <dollars>,
  "startingShooters": <n>,
  "startingCrew":  [{ "crewId": <id>, "slot": 0 }],
  "startingHype":  <float>
}
```

**Crew IDs:** 1 Lefty · 2 Physics Prof · 3 Mechanic · 4 Mathlete · 5 Floor Walker · 6 Regular · 7 Big Spender · 8 Shark · 9 Whale · 10 Nervous Intern · 11 Holly · 12 Drunk Uncle · 13 Mimic · 14 Old Pro · 15 Lucky Charm

---

## L1 — Smoke Tests (5 tests)

Run these after every merge. If any L1 test fails, the build is broken.

---

### SM-01 — App loads and renders the table

**Setup:** Navigate to `http://localhost:5173`. No prior action.
**Expected:**
- Table Board visible within 3 seconds
- Bankroll shows $250.00
- Shooter count shows 5
- Hype shows 1.0×
- Pass Line bet zone visible and clickable
- Roll button disabled (no bet placed)
- Roll Log shows "No rolls yet."

---

### SM-02 — Place a bet and roll

**Setup:** From SM-01. Select $5 chip. Click Pass Line zone.
**Expected:**
- Bankroll decreases by $5 immediately ($250 → $245)
- Roll button becomes enabled
- Click Roll. Dice animate and show a result.
- Roll Log gains one entry with dice, result type, and net delta.
- Phase label updates (COME_OUT result, or POINT_ACTIVE if point set).

---

### SM-03 — Come-out Natural pays out

**Setup:** NEW RUN. Place $10 Pass Line. Roll until a Natural (7 or 11 on COME_OUT).
**Expected:**
- "NATURAL!" label shown
- Bankroll increases by $10 (1:1 payout + stake return)
- Phase stays COME_OUT (pass line clears, can bet again)
- Roll Log: "Pass Line Won $10.00 (1:1)"

---

### SM-04 — Seven Out ends shooter, Hype resets

**Setup:** NEW RUN. Place $5 Pass Line. Roll until Point Set, then roll until Seven Out.
**Expected:**
- "SEVEN OUT" label shown
- Shooter count decrements by 1 (5 → 4)
- Hype resets to 1.0×
- Pass Line and Odds cleared from table
- Phase returns to COME_OUT

---

### SM-05 — New Run resets all state

**Setup:** Play several rolls. Click the NEW RUN button (top-left).
**Expected:**
- Table Board reloads
- Bankroll: $250.00
- Shooters: 5
- Hype: 1.0×
- Crew rail: empty
- Roll Log: "No rolls yet."
- localStorage `bc_dev_run_id` updated to new value

---

## L2 — Sanity Tests (24 tests)

Run these for any feature change or bug fix. Covers all major happy paths.

---

### COME-OUT PHASE

**CO-01 — Natural 7**
- Place $10 Pass Line. Roll COME_OUT 7.
- Expected: NATURAL result. Pass Line pays 1:1 ($10). Stake returned. Phase stays COME_OUT.

**CO-02 — Natural 11**
- Place $10 Pass Line. Roll COME_OUT 11 ([5,6] or [6,5]).
- Expected: Same as CO-01. Confirm 11 is treated identically to 7 (both are NATURAL).

**CO-03 — Craps Out (2)**
- Place $10 Pass Line. Roll COME_OUT 2 ([1,1]).
- Expected: CRAPS_OUT result. Pass Line lost ($10). Shooter count unchanged. Hype unchanged. Phase stays COME_OUT.

**CO-04 — Craps Out (3)**
- Place $10 Pass Line. Roll COME_OUT 3 ([1,2] or [2,1]).
- Expected: Same as CO-03.

**CO-05 — Craps Out (12)**
- Place $10 Pass Line. Roll COME_OUT 12 ([6,6]).
- Expected: Same as CO-03.

**CO-06 — Point Set**
- Place $10 Pass Line. Roll COME_OUT 4, 5, 6, 8, 9, or 10.
- Expected: POINT_SET result. Phase changes to POINT_ACTIVE. Point puck shows the number. Pass Line zone locks (greyed out). Odds zone unlocks.

---

### POINT ACTIVE PHASE

**PA-01 — Point Hit**
- Place $10 Pass Line. Set any point. Roll until Point Hit.
- Expected: POINT_HIT result. Pass Line pays 1:1 ($10). Puck resets to OFF. Phase returns to COME_OUT. Hype unchanged.

**PA-02 — Odds payout (Point 8, 6:5)**
- Place $10 Pass Line + $10 Odds. Set point 8. Roll [4,4]=8.
- Expected: Pass Line pays $10. Odds pays $12 (6:5). Total payout $22 + $20 stake = $42 received.

**PA-03 — Odds payout (Point 5, 3:2)**
- Place $10 Pass Line + $10 Odds. Set point 5. Hit point 5.
- Expected: Odds pays $15 (3:2 = $10 × 1.5).

**PA-04 — Odds payout (Point 4, 2:1)**
- Place $10 Pass Line + $10 Odds. Set point 4. Hit point 4.
- Expected: Odds pays $20 (2:1 = $10 × 2).

**PA-05 — No Resolution**
- Place $10 Pass Line + $10 Odds. Set any point. Roll a number that is neither the point nor 7.
- Expected: NO_RESOLUTION result. Bankroll unchanged. Bets persist (Pass Line and Odds remain on table). Phase stays POINT_ACTIVE.

**PA-06 — Hardway win (Hard 8)**
- Place $10 Pass Line + $10 Hard 8. Set point 8. Roll [4,4]=8.
- Expected: Hard 8 pays 9:1 ($90). Pass Line also pays ($10). Hard 8 bet cleared after win.

**PA-07 — Hardway soft loss**
- Place $10 Hard 8. Set point 8. Roll soft 8 ([6,2] or [5,3]).
- Expected: Hard 8 bet cleared (lost). Result is NO_RESOLUTION (if point 8 not hit by soft roll during PA — soft 8 loses hardway only). No payout for Hard 8.

**PA-08 — Seven Out clears all bets**
- Place $10 Pass Line + $10 Odds + $10 Hard 8. Set a point. Roll Seven Out.
- Expected: All three bets cleared. Bankroll decreases by total bet amount placed (less prior stake deductions). Shooter count decrements. Hype resets to 1.0×.

---

### BETTING VALIDATION

**BV-01 — Table max enforced**
- Bootstrap $500 starting bankroll. At Marker 1 (table max $40), attempt to place $50 Pass Line.
- Expected: Error shown. Bet not accepted. Bankroll unchanged.

**BV-02 — Insufficient funds**
- Bootstrap $10 starting bankroll. Attempt to place $25 Pass Line.
- Expected: Error shown. Bet not accepted.

**BV-03 — Bets cannot be reduced mid-turn**
- Place $10 Pass Line (point not yet set). Attempt to place $5 Pass Line (reducing it).
- Expected: The deduct-on-placement model means the $10 is already deducted. The UI should not allow reducing. Verify the roll endpoint returns 422 if attempted via API.

---

### PROGRESSION & PUB

**PRG-01 — Marker 1 clear triggers celebration**
- Bootstrap $390. Play until bankroll ≥ $400.
- Expected: Marker Cleared modal appears ("NICE ROLL!", "VISIT THE PUB" button). No immediate pub snap.

**PRG-02 — Pub screen after marker clear**
- From PRG-01. Click "VISIT THE PUB".
- Expected: Pub screen shows correct bankroll, 5 shooters (reset), 3 crew cards with names/costs/abilities, "REST & SKIP TO TABLE" button.

**PRG-03 — Hire a crew member**
- In Pub, click any crew card. Select slot 0. Click confirm.
- Expected: Cost deducted from bankroll. Game returns to Table Board. Crew portrait visible in slot 0. Marker 2 target shown.

**PRG-04 — Skip pub (REST & SKIP TO TABLE)**
- In Pub, click "REST & SKIP TO TABLE".
- Expected: Game returns to Table Board with no crew hired. Bankroll unchanged. Marker 2 target shown.

---

### GAME OVER

**GO-01 — Bust on last shooter**
- Bootstrap $50, 1 shooter. Place $50 Pass Line. Roll until Seven Out.
- Expected: GAME_OVER screen appears. Shows Final Bankroll, Markers Cleared, Crew on Rail, Last Crew Standing. "PLAY AGAIN" button present.

**GO-02 — Play Again resets to fresh run**
- From GO-01. Click "PLAY AGAIN".
- Expected: Table Board loads with $250, 5 shooters, empty crew rail, COME_OUT, Hype 1.0×.

---

## L3 — Full Regression Tests (38 tests)

Run these for major features, engine changes, or pre-release. Includes all L1 + L2 tests plus the following.

---

### HYPE SYSTEM

**HY-01 — Hype amplifies payout**
- Bootstrap with `startingHype: 2.0`, crew: Nervous Intern (crewId: 10). Place $10 Pass Line. Roll Natural.
- Expected: Intern fires (+0.2 Hype → 2.2). Payout = $10 × 2.2 = $22 win (not $10). Verify bankroll delta.

**HY-02 — Hype accumulates across Naturals (Nervous Intern)**
- Bootstrap with Intern in slot 0. Roll 3 Naturals.
- Expected: Hype: 1.0 → 1.2 → 1.4 → 1.6. Each Natural adds +0.2.

**HY-03 — Hype resets to 1.0 on Seven Out**
- Bootstrap with Intern. Build Hype to 1.6 via 3 Naturals. Roll until Seven Out.
- Expected: Hype = 1.0 after Seven Out. Intern does not fire on Seven Out.

**HY-04 — Hype accumulates across Point Hits (Holly)**
- Bootstrap with Holly (crewId: 11). Set a point and hit it 3 times.
- Expected: Hype: 1.0 → 1.3 → 1.6 → 1.9. Each Point Hit adds +0.3.

**HY-05 — Hype persists across shooters (no reset on Point Hit or Natural)**
- Bootstrap with Holly. Hit point (Hype 1.3). Shoot dies (Seven Out, Hype resets). New shooter starts, hits point.
- Expected: After first Point Hit: 1.3. After Seven Out: 1.0. After next Point Hit: 1.3.

---

### CREW CASCADE

**CR-01 — Cascade event appears in API response**
- Bootstrap with Nervous Intern (crewId: 10). Roll Natural. Inspect the roll API response.
- Expected: `roll.cascadeEvents` contains one entry with `crewId: 10` and `contextDelta.hype: 1.2`.

**CR-02 — Multiple crew fire in slot order**
- Bootstrap with Intern (slot 0) + Holly (slot 1). Set a point, hit it.
- Expected: Holly fires (slot 1) in `cascadeEvents`. Intern silent (POINT_HIT ≠ NATURAL). Only one event. Hype → 1.3.
- Then on next come-out Natural: Intern fires (slot 0), Holly silent. Hype → 1.6.

**CR-03 — Whale multiplier stacks with Hype**
- Bootstrap `startingHype: 1.5`, Whale (crewId: 9) in slot 0. Place $10 Pass Line. Roll Natural.
- Expected: Whale fires. Payout = $10 × 1.5 × 1.2 = $18. Verify bankroll delta.

**CR-04 — Crew portrait visible on table after hire**
- Hire any crew member from Pub. Return to table.
- Expected: Crew portrait renders in the correct slot position. Portrait shows category color/icon.

**CR-05 — Per-shooter cooldown resets on new shooter**
- Bootstrap with Lefty (crewId: 1). Get a Seven Out (Lefty fires). Shooter dies. Roll Seven Out again on new shooter.
- Expected: Lefty fires on new shooter's Seven Out (cooldown reset). Appears in `cascadeEvents`.

**CR-06 — Physics Prof fires on every paired roll (no cooldown)**
- Bootstrap with Physics Prof (crewId: 2). Roll until two pairs occur in separate rolls.
- Expected: Prof fires on both paired rolls with no cooldown between them. `cooldownState === 0` after each trigger.

---

### TABLE MAX & BET LIMITS

**BL-01 — Table max updates between markers**
- At Marker 1: Table max = $40 (10% of $400). Advance to Marker 2: Table max = $60 (10% of $600). Advance to Marker 3: Table max = $150 (10% of $1,500).
- Expected: Max bet display updates correctly after each marker clear. Bets above new max are rejected.

**BL-02 — Table max applies to hardway bets independently**
- At Marker 1 (max $40). Attempt Hard 8 bet of $50.
- Expected: Rejected with error. $40 Hard 8 accepted.

**BL-03 — Odds bet not subject to table max**
- Verify that the Odds bet zone does not enforce the table max (odds are uncapped by design).
- Expected: Can place Odds greater than the table max.

---

### MARKER PROGRESSION

**MP-01 — Marker 1 target ($400)**
- Bootstrap $390. Play to $400+.
- Expected: TRANSITION after bankroll ≥ $400. Pub resets to 5 shooters. Marker 2 target shows $600.

**MP-02 — Marker 2 target ($600)**
- Continue from MP-01 or bootstrap $590. Play to $600+.
- Expected: TRANSITION. Pub screen. Marker 3 target shows $1,500.

**MP-03 — Marker advance increments table max**
- Verify table max is 10% of the CURRENT marker target:
  - Marker 1 ($400 target) → max $40
  - Marker 2 ($600 target) → max $60
  - Marker 3 ($1,500 target) → max $150

**MP-04 — Old Pro grants +1 shooter on marker clear**
- Bootstrap with Old Pro (crewId: 14). Clear Marker 1.
- Expected: Pub screen shows 6 shooters (not 5). Table starts next segment with 6 lives.

**MP-05 — GAME_OVER on last marker clear**
- Bootstrap $12,400, enough crew and shooters to hit the final marker ($12,500). Clear it.
- Expected: GAME_OVER screen (not TRANSITION/Pub). Final bankroll shown.

---

### GAME OVER SCENARIOS

**GV-01 — Bust with no shooters remaining**
- Bootstrap $5, 1 shooter. Place $5 Pass Line. Roll until Seven Out.
- Expected: GAME_OVER. Final bankroll ≈ $0.

**GV-02 — Bust with bankroll = $0 and shooters remaining**
- Bootstrap $5, 5 shooters. Place $5 Pass Line. Roll until bankroll hits 0 during POINT_ACTIVE.
- Expected: GAME_OVER triggered when bankroll reaches 0 (cannot place any more bets). Game does not leave player stuck.

**GV-03 — Game Over screen content**
- Reach GAME_OVER by any path.
- Expected: Screen shows: Final Bankroll, Markers Cleared (n/4), Crew on Rail count, Last Crew Standing name. "PLAY AGAIN" button present.

---

### PERSISTENCE & SESSION

**PS-01 — Page refresh reconnects to existing run**
- Start a run, place bets, roll several times. Note run state (bankroll, point, bets). Refresh the page (F5).
- Expected: Same run reloads. Bankroll, phase, point, bets, crew, and Hype all match the pre-refresh state. No new run created.

**PS-02 — NEW RUN creates a fresh run**
- Mid-run, click NEW RUN. Observe.
- Expected: Table resets to $250, 5 shooters, no crew, COME_OUT, Hype 1.0×. `bc_dev_run_id` in localStorage changes to a new value.

**PS-03 — Cannot roll when run is not in a rollable state**
- Use the API to attempt a roll while run status is TRANSITION.
- Expected: API returns 409. The frontend Roll button should be inaccessible during TRANSITION (Pub screen is shown instead of Table).

---

### ROLL LOG

**RL-01 — Roll Log entry structure**
- Roll any outcome. Inspect the Roll Log entry.
- Expected: Entry contains: timestamp, dice values and total, result type label, breakdown of each payout line (bet type, win/loss, amount, ratio), and net delta (+/−$X.XX).

**RL-02 — Roll Log accumulates without losing entries**
- Roll 10 times. Verify all 10 entries are present in the Roll Log (scroll if needed).
- Expected: Entries are in reverse-chronological order (newest at top). No entries disappear.

**RL-03 — Roll Log shows crew bonus line when crew fires**
- Bootstrap with Shark (crewId: 8). Get to POINT_ACTIVE. Roll POINT_HIT.
- Expected: Roll Log entry includes a line for Shark's $100 bonus alongside the Pass Line and Odds payout lines.

---

### UI FIDELITY

**UI-01 — Point puck ON/OFF state**
- COME_OUT: Puck shows OFF (or is hidden). After Point Set: Puck shows the point number and "POINT ACTIVE". After Point Hit or Seven Out: Puck returns to OFF.
- Expected: Puck state is correct at each phase transition.

**UI-02 — Odds zone lock/unlock**
- COME_OUT: Odds zone is greyed out / disabled. After Point Set: Odds zone is active with correct ratio label (e.g. "6:5" for point 8). After Seven Out: Odds zone locks again.
- Expected: Odds zone correctly reflects phase.

**UI-03 — Hardway payout ratios displayed correctly**
- Verify hardway labels in the betting grid:
  - Hard 4 and Hard 10: 7:1
  - Hard 6 and Hard 8: 9:1
- Expected: Labels match the above.

**UI-04 — Crew portrait cascade flash animation**
- Bootstrap with Nervous Intern. Roll Natural.
- Expected: Intern's portrait flashes (brief highlight or glow). Bark text or indicator appears above the portrait. Animation completes within ~1 second.

**UI-05 — Marker progress bar**
- During a run, observe the bankroll progress bar toward the current marker target.
- Expected: Bar fills proportionally as bankroll increases. Updates after every roll. Shows current bankroll vs. target (e.g. "$350 / $400").

---

## Defect Logging

All defects found during regression testing should be appended to the relevant results file:
- Crew-specific defects → `crew-test-results.md`
- All other defects → a new timestamped section in `playtest.md`

Follow the established DEF-NNN format.

---

## Known Open Defects

| ID | Severity | Summary | Affects Layers |
|----|----------|---------|----------------|
| DEF-001 | Medium | Bankroll $40 short after crew recruitment from Pub | L2 (PRG-03) |

---

## Test Case Count Summary

| Layer | Section | Tests |
|-------|---------|-------|
| L1 Smoke | — | 5 |
| L2 Sanity | Come-Out Phase | 6 |
| L2 Sanity | Point Active Phase | 8 |
| L2 Sanity | Betting Validation | 3 |
| L2 Sanity | Progression & Pub | 4 |
| L2 Sanity | Game Over | 2 |
| **L2 Total (excluding L1)** | | **23** |
| L3 Full Regression | Hype System | 5 |
| L3 Full Regression | Crew Cascade | 6 |
| L3 Full Regression | Table Max & Bet Limits | 3 |
| L3 Full Regression | Marker Progression | 5 |
| L3 Full Regression | Game Over Scenarios | 3 |
| L3 Full Regression | Persistence & Session | 3 |
| L3 Full Regression | Roll Log | 3 |
| L3 Full Regression | UI Fidelity | 5 |
| **L3 Total (excluding L1+L2)** | | **33** |
| **GRAND TOTAL** | | **61** |
