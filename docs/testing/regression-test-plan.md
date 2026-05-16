# BattleCraps — Manual Regression Test Plan

**Scope:** Full game — UI, API, betting engine, crew cascade, progression, and persistence.
**Out of Scope:** Crew ability internals (covered by `crew-test-plan.md`), multi-user scenarios, production auth.

---

## Test Layers

Choose the layer based on the size and risk of the change being delivered.

| Layer | When to Use | Approx. Time |
|-------|------------|--------------|
| **L1 — Smoke** | Every merge to main. Verifies the app starts and the core loop isn't broken. | ~5 min |
| **L2 — Sanity** | Any feature change or non-trivial bug fix. Covers all happy paths. | ~30 min |
| **L3 — Full Regression** | Major features, engine changes, or pre-release. Covers edge cases and full progression. | ~90 min |

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
  "startingHype":  <float>,
  "startingMarkerIndex": <n>
}
```

**Crew IDs (original 15, unlock-gated):** 1 Lefty · 2 Physics Prof · 3 Mechanic · 4 Mathlete · 5 Floor Walker · 6 Regular · 7 Big Spender · 8 Shark · 9 Whale · 10 Nervous Intern · 11 Holly · 12 Drunk Uncle · 13 Mimic · 14 Old Pro · 15 Lucky Charm

**Crew IDs (Starter roster, always available):** 16 Lookout · 17 Ace McGee · 18 Close Call · 19 Momentum · 20 Echo · 21 Silver Lining · 22 Odd Couple · 23 Even Keel · 24 Doorman · 25 Grinder · 26 Handicapper · 27 Mirror · 28 Bookkeeper · 29 Pressure Cooker · 30 Contrarian

---

## Gauntlet Quick Reference (marker indices 0–26)

| Floor | Venue | Marker 0 | Marker 1 | Marker 2 (BOSS) |
|-------|-------|----------|----------|-----------------|
| F1 | The Loading Dock | $50 | $100 | $250 (The Foreman / EXTORTION_FEE) |
| F2 | VFW Hall | $300 | $600 | $1,000 (Sarge / RISING_MIN_BETS) |
| F3 | The Riverboat | $1,500 | $2,500 | $4,000 (Mme. Le Prix / DISABLE_CREW) |
| F4 | The Strip | $6,000 | $9,000 | $12,500 (The Executive / FOURS_INSTANT_LOSS) |
| F5 | The Lodge | $20,000 | $30,000 | $45,000 (The Hierophant / TRIBUTE) |
| F6 | Atlantis | $70,000 | $120,000 | $175,000 (The Sovereign / TIDAL_SURGE) |
| F7 | The Station | $250,000 | $425,000 | $650,000 (The Commander / ORBITAL_DECAY) |
| F8 | The Signal | $1,000,000 | $1,750,000 | $2,500,000 (The Emissary / FIRST_CONTACT_PROTOCOL) |
| F9 | The Null Space | $5,000,000 | $10,000,000 | $20,000,000 (The Architect / CONVERGENCE) |

Boss markers are at 0-based gauntlet indices 2, 5, 8, 11, 14, 17, 20, 23, 26.

---

## L1 — Smoke Tests (6 tests)

Run these after every merge. If any L1 test fails, the build is broken.

---

### SM-01 — App loads and renders the table

**Setup:** Navigate to `http://localhost:5173`. Sign in. Create a new run.
**Expected:**
- Table Board visible within 3 seconds
- Bankroll shows $30.00 (starting bankroll per `runs.ts`: `bankrollCents: 3000`)
- Shooter count shows 5
- Hype shows 1.0×
- Pass Line bet zone visible and clickable
- Roll button disabled (no bet placed)
- Roll Log shows "No rolls yet."

---

### SM-02 — Place a bet and roll

**Setup:** From SM-01. Select a chip. Click Pass Line zone.
**Expected:**
- Bankroll decreases by the chip amount immediately
- Roll button becomes enabled
- Click Roll. Dice animate and show a result.
- Roll Log gains one entry with dice, result type, and net delta.
- Phase label updates (COME_OUT result, or POINT_ACTIVE if point set).

---

### SM-03 — Come-out Natural pays out

**Setup:** NEW RUN. Place $5 Pass Line. Roll until a Natural (7 or 11 on COME_OUT).
**Expected:**
- "NATURAL!" label shown
- Bankroll increases by $5 (1:1 payout + stake return)
- Phase stays COME_OUT (pass line clears, can bet again)
- Roll Log: "Pass Line Won $5.00 (1:1)"

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
- Bankroll: $30.00
- Shooters: 5
- Hype: 1.0×
- Crew rail: empty
- Roll Log: "No rolls yet."

---

### SM-06 — Boss entry modal renders at boss marker

**Setup:** `POST /api/v1/dev/bootstrap` with `{ "startingBankroll": 230, "startingMarkerIndex": 2 }`.
*(Floor 1 boss — The Foreman at $250 target)*
**Expected:**
- `BossEntryModal` renders instead of `TableBoard`
- Shows "THE FOREMAN" boss name and EXTORTION_FEE house rules block
- "ENTER THE ROOM" button is present and clickable
- Clicking the button dismisses the modal and shows `TableBoard` with `BossRoomHeader` pinned at the top

---

## L2 — Sanity Tests

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
- Expected: POINT_HIT result. Pass Line pays 1:1 ($10). Puck resets to OFF. Phase returns to COME_OUT.

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
- Expected: Hard 8 bet cleared (lost). Result is NO_RESOLUTION (if point 8 not hit by soft roll during PA). No payout for Hard 8.

**PA-08 — Seven Out clears all bets**
- Place $10 Pass Line + $10 Odds + $10 Hard 8. Set a point. Roll Seven Out.
- Expected: All three bets cleared. Bankroll decreases by total bet amount placed (less prior stake deductions). Shooter count decrements. Hype resets to 1.0×.

---

### BETTING VALIDATION

**BV-01 — Chip clamped to table max**
- Bootstrap sufficient bankroll. At Marker 0 (F1, table max $5 = 10% of $50), select a chip > $5. Click Pass Line.
- Expected: Bet placed at $5 (clamped to max). Clicking Pass Line again is a no-op. Bankroll unchanged on 2nd click.

**BV-02 — Insufficient funds**
- Bootstrap $3 starting bankroll. Attempt to place a bet larger than $3.
- Expected: Error shown. Bet not accepted.

**BV-03 — Bets cannot be reduced mid-turn**
- Place $10 Pass Line (point not yet set). Attempt to reduce it via API.
- Expected: The API returns 422 with "Pass Line bets cannot be reduced."

**BV-04 — Partial chip placed when near table max**
- At Marker 1 (F1, table max $10). Place $7 Pass Line. Select $10 chip. Click Pass Line again.
- Expected: Second click places $3 (the remaining room to $10), not $10. Pass Line total = $10. A third click is a no-op.

**BV-05 — Odds bet clamped to 3-4-5x cap**
- Establish a point of 6 (5x odds cap). Place $10 Pass Line (max odds = $50). Place $40 Odds. Select $25 chip. Click Odds.
- Expected: Odds placed at $10 (remaining room to $50), not $25. Odds total = $50. A further click is a no-op.

---

### BOSS FIGHT — OVERVIEW

**BOS-01 — Boss entry modal appears on entering boss marker**
- Bootstrap to a boss marker (e.g. `startingMarkerIndex: 2`). Navigate to `http://localhost:5173`.
- Expected: `BossEntryModal` is shown. `TableBoard` is **not** visible. Normal `MarkerCelebration` is **not** shown.

**BOS-02 — Acknowledging entry shows table with BossRoomHeader**
- From BOS-01. Click "ENTER THE ROOM".
- Expected: Modal dismisses. `TableBoard` renders. `BossRoomHeader` is pinned at the top showing "HIGH LIMIT ROOM", the boss name, and the active rule reminder.

**BOS-03 — Defeating boss shows BossVictoryModal, not MarkerCelebration**
- Bootstrap near a boss marker target. Play until bankroll ≥ target (boss defeated).
- Expected: `BossVictoryModal` appears — NOT the normal "NICE ROLL!" `MarkerCelebration`. Shows boss name / "DEFEATED" and comp reward. "COLLECT & VISIT THE PUB" button is present.

**BOS-04 — Boss entry modal shows only once per boss marker visit**
- Bootstrap to a boss marker. Acknowledge entry. Play several rolls including a Seven Out.
- Expected: Modal does **not** reappear after the Seven Out or any subsequent roll. Once acknowledged per session, it stays dismissed.
- **Sub-case (page refresh):** After acknowledging entry, refresh the page (F5). Expected: `BossEntryModal` reappears — acknowledgement is local state and correctly resets on page load. This is expected behavior.

**BOS-05 — BossRoomHeader and min-bet banner absent on non-boss markers**
- Start a fresh run (Marker 0, non-boss).
- Expected: No `BossRoomHeader` visible. No min-bet warning banner in `BettingGrid`. Verify at Markers 0 and 1.

**BOS-06 — MarkerProgress shows `★ BOSS` label at all nine boss markers**
- Advance to each boss marker (0-based gauntlet indices 2, 5, 8, 11, 14, 17, 20, 23, 26).
- Expected: At each boss marker the label reads "★ BOSS" in red. All non-boss markers show the normal gold "MARKER N" label.

---

### PROGRESSION & PUB

**PRG-01 — Marker 0 clear triggers celebration**
- Bootstrap $40. Play until bankroll ≥ $50.
- Expected: Marker Cleared modal appears ("NICE ROLL!", "VISIT THE PUB" button). No immediate pub snap.

**PRG-02 — Pub screen after marker clear**
- From PRG-01. Click "VISIT THE PUB".
- Expected: Pub screen shows correct bankroll, 5 shooters (reset), crew cards with names/costs/abilities, "REST & SKIP TO TABLE" button.

**PRG-03 — Hire a crew member**
- In Pub, click any crew card. Select slot 0. Click confirm.
- Expected: Cost deducted from bankroll. Game returns to Table Board. Crew portrait visible in slot 0. Marker 1 target shown.

**PRG-04 — Skip pub (REST & SKIP TO TABLE)**
- In Pub, click "REST & SKIP TO TABLE".
- Expected: Game returns to Table Board with no crew hired. Bankroll unchanged. Marker 1 target shown.

**PRG-05 — Marker clear triggered by a Natural (come-out win)**
- Bootstrap near a marker threshold. Place Pass Line bet. Roll until a Natural that pushes bankroll ≥ target.
- Expected: `MarkerCelebration` modal appears immediately after the Natural resolves — same as a Point Hit clear. Game does NOT continue rolling. *(Regression: server previously only checked for marker threshold on POINT_HIT, not NATURAL.)*

---

### GAME OVER

**GO-01 — Bust on last shooter**
- Bootstrap $10, 1 shooter. Place bets, roll until Seven Out.
- Expected: GAME_OVER screen appears. Shows Final Bankroll, Markers Cleared, Crew on Rail, Last Crew Standing. "PLAY AGAIN" button present.

**GO-02 — Play Again resets to fresh run**
- From GO-01. Click "PLAY AGAIN".
- Expected: Table Board loads with $30, 5 shooters, empty crew rail, COME_OUT, Hype 1.0×.

---

## L3 — Full Regression Tests

Run these for major features, engine changes, or pre-release. Includes all L1 + L2 tests plus the following.

---

### HYPE SYSTEM

**HY-01 — POINT_HIT base hype tick is +0.25**
- Bootstrap Hype 1.0. Place Pass Line. Set a point. Hit the point (no crew on rail).
- Expected: Hype increases to 1.25 (base tick from rolls.ts: +0.25 for POINT_HIT). Verify `newHype` in `turn:settled` WS payload.

**HY-02 — NATURAL base hype tick is +0.10**
- Bootstrap Hype 1.0. Roll a Natural (no crew on rail).
- Expected: Hype increases to 1.10 (base tick +0.10 for NATURAL). Verify in WS payload.

**HY-03 — CRAPS_OUT base hype tick is −0.05 (floored at 1.0)**
- Bootstrap Hype 1.0. Roll a Craps Out (no crew on rail).
- Expected: Hype stays at 1.0 (floor applied: 1.0 − 0.05 = 0.95 → clamped to 1.0). Verify in WS payload.

**HY-04 — CRAPS_OUT tick reduces hype above 1.0**
- Bootstrap Hype 1.5. Roll a Craps Out.
- Expected: Hype reduces to 1.45 (1.5 − 0.05 = 1.45). No floor clamp needed here.

**HY-05 — Hype resets to 1.0 on Seven Out (base game)**
- Bootstrap Hype 1.8. Set a point. Roll Seven Out.
- Expected: Hype = 1.0 after Seven Out.

**HY-06 — Hype tier thresholds render correctly (Heating Up / On Fire)**
- Build Hype to ≥1.5×. Verify dice turn yellow and heat-glow animation activates (Heating Up tier).
- Build Hype to ≥2.5×. Verify dice turn red and fire-glow animation activates (On Fire tier).
- Expected: Thresholds are ≥1.5 = Heating Up, ≥2.5 = On Fire. At exactly 1.5 it is Heating Up. At exactly 2.5 it is On Fire.

**HY-07 — Hype amplifies payout**
- Bootstrap `startingHype: 2.0`, Nervous Intern (crewId: 10). Place $10 Pass Line. Roll Natural.
- Expected: Base hype tick (+0.10) → 2.10. Intern fires (+0.2) → 2.30. Payout = floor($10 × 2.30 / 100) × 100 = $23 profit + $10 stake = $33 received.
- Verify bankroll delta.

---

### CREW CASCADE

**CR-01 — Cascade event appears in API response**
- Bootstrap with Nervous Intern (crewId: 10). Roll Natural. Inspect the roll API response.
- Expected: `roll.cascadeEvents` contains one entry with `crewId: 10` and `contextDelta.hype` showing the new hype value.

**CR-02 — Multiple crew fire in slot order**
- Bootstrap with Intern (slot 0) + Holly (slot 1). Set a point, hit it.
- Expected: Holly fires (POINT_HIT trigger). Intern silent (POINT_HIT ≠ NATURAL). Only one event. Then on next come-out Natural: Intern fires, Holly silent.

**CR-03 — Whale multiplier stacks with Hype**
- Bootstrap `startingHype: 1.5`, Whale (crewId: 9) in slot 0. Place $10 Pass Line. Roll Natural.
- Expected: Base hype tick (+0.10) → 1.60. Whale fires (1.2× multiplier). Payout = floor($10 × 1.60 × 1.2 / 100) × 100 = $19 profit + $10 stake = $29 received. Verify bankroll delta.

**CR-04 — Crew portrait visible on table after hire**
- Hire any crew member from Pub. Return to table.
- Expected: Crew portrait renders in the correct slot position. Portrait shows category color/icon.

**CR-05 — Per-shooter cooldown resets on new shooter**
- Bootstrap with Lefty (crewId: 1). Get a Seven Out (Lefty fires). Shooter dies. Roll Seven Out again on new shooter.
- Expected: Lefty fires on new shooter's Seven Out (cooldown reset). Appears in `cascadeEvents`.

**CR-06 — Physics Prof fires on every paired roll (no cooldown)**
- Bootstrap with Physics Prof (crewId: 2). Roll until two pairs occur in separate rolls.
- Expected: Prof fires on both paired rolls with no cooldown between them.

---

### TABLE MAX & BET LIMITS

**BL-01 — Table max updates between markers**
- At Marker 0 (F1): Table max = $5 (10% of $50 target). Advance to Marker 1: Table max = $10 (10% of $100). Advance to Marker 2 (Foreman boss): Table max = $25 (10% of $250).
- Expected: Max bet display updates correctly after each marker clear.

**BL-02 — Table max applies to hardway bets independently**
- At Marker 0 (max $5). Select $10 chip. Click Hard 8.
- Expected: Hard 8 bet placed at $5 (clamped to max). Clicking Hard 8 again is a no-op.

**BL-03 — Odds bet not subject to table max**
- Verify that the Odds bet zone does not enforce the table max (odds are capped only by 3-4-5x rule).
- Expected: Can place Odds greater than the table max (subject to the pass-line multiplier cap).

---

### MARKER PROGRESSION

**MP-01 — Marker 0 target ($50)**
- Bootstrap $40. Play to $50+.
- Expected: TRANSITION after bankroll ≥ $50. Pub resets to 5 shooters. Marker 1 target shows $100.

**MP-02 — Marker 1 target ($100)**
- Continue from MP-01 or bootstrap $90. Play to $100+.
- Expected: TRANSITION. Pub screen. Marker 2 target shows $250 (boss marker — red ★ BOSS label).

**MP-03 — Marker advance increments table max**
- Verify table max is 10% of the CURRENT marker target:
  - Marker 0 ($50 target) → max $5
  - Marker 1 ($100 target) → max $10
  - Marker 2 / Foreman ($250 target) → max $25
  - Marker 3 / F2 start ($300 target) → max $30
  - Marker 5 / Sarge ($1,000 target) → max $100

**MP-04 — Old Pro grants +1 shooter on marker clear**
- Bootstrap with Old Pro (crewId: 14). Clear Marker 0.
- Expected: Pub screen shows 6 shooters (not 5). Table starts next segment with 6 lives.

**MP-05 — GAME_OVER on final marker clear**
- Bootstrap near the final marker target ($20,000,000 = gauntlet index 26). Clear it.
- Expected: GAME_OVER screen (not TRANSITION/Pub). Final bankroll shown. Leaderboard entry submitted.

---

### GAME OVER SCENARIOS

**GV-01 — Bust with no shooters remaining**
- Bootstrap $5, 1 shooter. Place $5 Pass Line. Roll until Seven Out.
- Expected: GAME_OVER. Final bankroll ≈ $0.

**GV-02 — Bust with bankroll below min bet and shooters remaining**
- Bootstrap such that after a loss the bankroll falls below `getMinBet()` with no bets on the table.
- Expected: GAME_OVER triggered (isBelowMinBet condition). Game does not leave player stuck.

**GV-03 — Game Over screen content**
- Reach GAME_OVER by any path.
- Expected: Screen shows: Final Bankroll, Markers Cleared (n/27), Crew on Rail count, Last Crew Standing name. "PLAY AGAIN" button present.

---

### PERSISTENCE & SESSION

**PS-01 — Page refresh reconnects to existing run**
- Start a run, place bets, roll several times. Note run state (bankroll, point, bets). Refresh the page (F5).
- Expected: Same run reloads. Bankroll, phase, point, bets, crew, and Hype all match the pre-refresh state. No new run created.

**PS-02 — NEW RUN creates a fresh run**
- Mid-run, click NEW RUN. Observe.
- Expected: Table resets to $30, 5 shooters, no crew, COME_OUT, Hype 1.0×.

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
- Expected: Roll Log entry includes a line for Shark's bonus alongside the Pass Line and Odds payout lines. Boss deductions (when applicable) appear as a separate loss line.

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
- Expected: Bar fills proportionally as bankroll increases. Updates after every roll. Shows current bankroll vs. target.

---

### BOSS FIGHT — THE FOREMAN (EXTORTION_FEE)

**BF-F01 — 20% tax deducted from winning payout profit**
- Bootstrap to The Foreman fight (startingMarkerIndex: 2). Place $100 Pass Line. Roll Natural (profit would be $100 before tax).
- Expected: Tax = floor($100 × 0.20 / 100) × 100 = $20. Net profit received = $80. Roll Log shows a "The Foreman: $20.00 extortion fee" loss line.
- Verify: `bankrollDelta` = $80 (profit after tax) + $100 (stake returned) − $100 (bet placed) = $80 net gain.

**BF-F02 — Tax applies to Odds and Hardway profits too**
- Bootstrap to Foreman fight. Place Pass Line + Odds. Hit point. Verify that the tax is computed against the total gross profit (passLine + odds), not just the pass line.
- Expected: Tax = 20% of total profit. Both bet categories taxed together.

**BF-F03 — Tax does NOT apply on losing rolls**
- Bootstrap to Foreman fight. Roll a Seven Out or Craps Out.
- Expected: No tax deducted. Loss is only the bets already placed. No extortion fee line in Roll Log.

**BF-F04 — BossRoomHeader shows correct rule text for The Foreman**
- Enter The Foreman fight. Observe `BossRoomHeader`.
- Expected: Header shows "THE FOREMAN" and rule reminder "⚔ THE FOREMAN TAKES 20% OF ALL WINNING PAYOUTS".

**BF-F05 — Comp reward (THE VIG) applied after Foreman defeat**
- Defeat The Foreman (bankroll ≥ $250). Collect comp. Play next segment.
- Expected: Pub screen and BossVictoryComp screen show "THE VIG" comp. Crew additive bonuses in the next segment are increased by 20%.

---

### BOSS FIGHT — SARGE (RISING_MIN_BETS)

**BF-S01 — `bossPointHits` increments ONLY on Point Hit (not on other roll outcomes)**
- Bootstrap to Sarge (startingMarkerIndex: 5). Acknowledge entry. Roll a Natural, then a Craps Out, then a Point Set + No Resolution (4 rolls total, zero Point Hits yet).
- Expected: Inspect `newBossPointHits` in each WS `turn:settled` payload. Values remain **0** for all 4 rolls. Engineer a POINT_HIT (without marker clear). Expected: `newBossPointHits` = 1.

**BF-S02 — Min-bet escalates only on Point Hit**
- From BF-S01 state (1 Point Hit). Verify `BossRoomHeader` min-bet against formula: `$1,000 × clamp(0.05 + 0.02 × pointHits, 0, 0.20)`, rounded up to nearest dollar.
  - 0 Point Hits: $50 current, "→ $70 next"
  - 1 Point Hit: $70 current, "→ $90 next"
  - Natural / Craps Out / Seven Out between hits: min-bet **does not change**.
- Expected: Header values advance by $20 only after a confirmed Point Hit.

**BF-S03 — Min-bet holds on Seven Out (does not reset)**
- Enter Sarge fight. Score 3 Point Hits (bossPointHits = 3, min-bet = $110). Roll a Seven Out.
- Expected: `newBossPointHits` in the Seven Out WS event is **3** (unchanged — not reset to 0, not incremented). `BossRoomHeader` still shows $110 minimum.

**BF-S04 — Min-bet caps at $200 (20% of $1,000 target)**
- Enter Sarge fight. Score 8+ Point Hits without clearing or busting.
- Expected: Min-bet never exceeds $200. At `bossPointHits ≥ 8` (where 5% + 2%×8 = 21% > 20% cap), header shows $200 and the "→ $X next" projection **disappears** (already at cap).

**BF-S05 — API rejects roll when Pass Line is below boss min-bet**
- Bootstrap to Sarge. Via curl or DevTools, send `POST /api/v1/runs/:id/roll` with `passLine: 2500` (¢25, below the $50 = 5000¢ minimum).
- Expected: API returns `422 Unprocessable Entity`. Response body contains "Sarge demands a minimum Pass Line bet of $50."

**BF-S06 — Page refresh during boss fight restores correct min-bet state**
- Bootstrap to Sarge. Score 4 Point Hits (min-bet should now be $130). Refresh the page (F5).
- Expected (visual): `BossRoomHeader` re-renders showing $130 current minimum, not the $50 starting value.
- Expected (API): `GET /api/v1/runs/:id` response includes `"bossPointHits": 4`.

**BF-S07 — Comp reward (MEMBER'S JACKET) applied after Sarge defeat**
- Defeat Sarge (bankroll ≥ $1,000). Click "COLLECT & VISIT THE PUB".
- Expected: Pub screen shows **6 shooters** (5 base + 1 Member's Jacket bonus). Table starts the next segment with 6 lives.

---

### BOSS FIGHT — MME. LE PRIX (DISABLE_CREW)

**BF-D01 — Cascade does not fire any crew ability during fight**
- Bootstrap to Mme. Le Prix (startingMarkerIndex: 8). Recruit several crew. Enter the fight.
- Roll various outcomes (Natural, Point Hit, Seven Out).
- Expected: `roll.cascadeEvents` is empty `[]` on every roll. Crew portraits are visible but no flash animations occur. No crew barks appear. No additives, no multipliers, no hype boosts from crew.

**BF-D02 — Cooldowns do not tick during Mme. Le Prix fight**
- Bootstrap to Mme. Le Prix with a per_roll cooldown crew (e.g. Mechanic). Roll 5 times.
- Expected: Since `modifyCascadeOrder` returns `[]`, the crew loop is entirely skipped — cooldowns are NOT decremented. Mechanic's cooldown state should remain unchanged after each roll.
- ⚠ VERIFY: Confirm in code that the cascade loop is skipped entirely (not just crew execute() calls bypassed) so cooldowns freeze.

**BF-D03 — BossRoomHeader shows correct rule text for Mme. Le Prix**
- Expected: Header shows "MME. LE PRIX" and rule reminder "⚔ CREW IS SILENCED — CASCADE DOES NOT FIRE".

**BF-D04 — Crew reactivates after beating Mme. Le Prix**
- Defeat Mme. Le Prix (bankroll ≥ $4,000). Enter Pub. Return to table (next floor, non-boss marker).
- Roll with crew present.
- Expected: `cascadeEvents` is non-empty again. Crew abilities fire normally. `BossRoomHeader` is absent.

**BF-D05 — Comp reward (SEA LEGS) applied after Mme. Le Prix defeat**
- Defeat Mme. Le Prix. Collect comp. Play next segment.
- Expected: BossVictoryComp shows "SEA LEGS". On the next Seven Out: Hype resets to 50% of its current value rather than resetting to 1.0×. (e.g., Hype was 2.0× before seven-out → resets to 1.5× with Sea Legs).

---

### BOSS FIGHT — THE EXECUTIVE (FOURS_INSTANT_LOSS)

**BF-E01 — Rolling a 4 triggers GAME_OVER regardless of bankroll or shooters**
- Bootstrap to The Executive (startingMarkerIndex: 11) with 5 shooters and high bankroll ($10,000).
- Roll until dice total 4 ([1,3], [3,1], or [2,2]).
- Expected: Run transitions directly to `GAME_OVER`. Shooter count and bankroll are irrelevant — one roll of 4 ends the run. `runStatus === 'GAME_OVER'` in WS `turn:settled` payload. Leaderboard entry submitted.

**BF-E02 — 4 triggers on both COME_OUT and POINT_ACTIVE phases**
- Bootstrap to The Executive. Test once during COME_OUT and once during POINT_ACTIVE (with a point set).
- Expected: Instant loss on 4 regardless of phase. No exceptions.

**BF-E03 — All other totals proceed normally**
- Bootstrap to The Executive. Roll totals 5, 6, 7, 8, 9, 10, 11, 12 — verify none trigger GAME_OVER unexpectedly.
- Expected: Only total 4 triggers instant loss. All other totals resolve per normal craps rules.

**BF-E04 — BossRoomHeader shows correct rule text for The Executive**
- Expected: Header shows "THE EXECUTIVE" and rule reminder "⚔ ROLLING A 4 IS INSTANT BUST".

**BF-E05 — Comp reward (GOLDEN TOUCH) applied after The Executive defeat**
- Defeat The Executive (bankroll ≥ $12,500). Collect comp. Play next segment.
- Expected: BossVictoryComp shows "GOLDEN TOUCH". First come-out roll of each segment is guaranteed a Natural.

---

### BOSS FIGHT — THE HIEROPHANT (TRIBUTE)

**BF-H01 — 15% bankroll tribute seized on every Seven Out**
- Bootstrap to The Hierophant (startingMarkerIndex: 14). Set bankroll to $10,000. Roll until Seven Out.
- Expected: After bets are lost and bankroll reduced to (e.g.) $9,900, the tribute seizes: `floor($9,900 × 0.15 / 100) × 100 = $1,400` (rounded to nearest dollar). New bankroll ≈ $8,500.
- Verify via `newBankroll` in WS `turn:settled` payload.

**BF-H02 — Tribute is in addition to lost bets (not replacing)**
- Bootstrap to Hierophant with $10,000 bankroll, $500 Pass Line active. Roll Seven Out.
- Expected: (1) Pass Line and odds are lost at placement time. (2) tribute seizes 15% of the post-bet-loss bankroll. The tribute is a separate drain layered on top.

**BF-H03 — THE_COVENANT comp halves the tribute (7.5%)**
- Bootstrap to Hierophant with the THE_COVENANT comp active (grant via dev endpoint if available). Set bankroll to $10,000. Roll Seven Out.
- Expected: Effective tribute = $10,000 × 0.075 = $750. Bankroll reduced by $750 from tribute (instead of 15%).
- ⚠ VERIFY: Confirm that `state.covenantActive` is correctly set when the user holds THE_COVENANT comp perk ID.

**BF-H04 — Tribute does NOT fire on Natural or Craps Out**
- Bootstrap to Hierophant. Roll Natural and Craps Out. Observe bankroll.
- Expected: No tribute deducted on non-Seven-Out outcomes.

**BF-H05 — BossRoomHeader shows correct rule text for The Hierophant**
- Expected: Header shows "THE HIEROPHANT" and rule reminder "⚔ SEVEN-OUT SEIZES 15% OF BANKROLL AS TRIBUTE".

**BF-H06 — Comp reward (THE COVENANT) applied after Hierophant defeat**
- Defeat The Hierophant (bankroll ≥ $45,000). Collect comp.
- Expected: BossVictoryComp shows "THE COVENANT".

---

### BOSS FIGHT — THE SOVEREIGN (TIDAL_SURGE)

**BF-T01 — Tide counter advances on every roll**
- Bootstrap to The Sovereign (startingMarkerIndex: 17). Observe the tide pip display in `BossRoomHeader`.
- Roll 7 times (5 calm + 2 surge). Verify the current pip indicator advances one position per roll.
- Expected: Rolls 1–5 show normal tide (green pips). Rolls 6–7 show surge warning (yellow pips, "SURGE" label). Roll 8 wraps back to position 0 (calm).

**BF-T02 — Minimum bet enforced during surge window only**
- Enter The Sovereign fight. Roll until surge window (rolls 6–7 of the 7-roll cycle).
- Expected during surge: `validateBet` hook rejects a Pass Line below 15% of $175,000 target = `ceil($175,000 × 0.15 / 100) × 100 = $26,300`. API returns 422 with surge error message if bet is below this.
- Expected during calm: No minimum bet enforced by this boss rule (normal minimum applies).

**BF-T03 — `bossPointHits` counter used as tide position counter (not point hit counter)**
- Roll multiple times. Observe `newBossPointHits` in WS payloads.
- Expected: Counter increments by 1 on every roll (including Naturals, Craps Outs, No Resolutions). Wraps modulo 7 (cycleLength=5 + surgeDuration=2). This is different from other bosses where it only increments on POINT_HIT.

**BF-T04 — BossRoomHeader shows tide pip visualization**
- Expected: Header shows 7 pips (5 calm + 2 surge), current position highlighted, surge label "TIDE ⚠ SURGE" during surge, roll countdown "SURGE IN N" during calm.

**BF-T05 — Comp reward (POSEIDON'S FAVOR) applied after Sovereign defeat**
- Defeat The Sovereign (bankroll ≥ $175,000). Collect comp.
- Expected: BossVictoryComp shows "POSEIDON'S FAVOR". On the next segment: shooter's first come-out roll cannot craps-out (treated as NO_RESOLUTION blank roll; `crapsOutBlocked: true` in WS payload).

---

### BOSS FIGHT — THE COMMANDER (ORBITAL_DECAY)

**BF-O01 — Seven Out drains hype by 0.5×**
- Bootstrap to The Commander (startingMarkerIndex: 20) with Hype 2.0×. Roll Seven Out.
- Expected: Hype decreases by 0.5×. New hype = `max(decayFloor, 2.0 − 0.5) = max(0.5, 1.5) = 1.5×`. Verify `newHype` in WS payload.

**BF-O02 — Hype can fall below 1.0× (no floor guard for base game)**
- Bootstrap to The Commander with Hype 1.0×. Roll Seven Out.
- Expected: Hype = max(0.5, 1.0 − 0.5) = 0.5×. Hype is below 1.0×. Normal base-game floor of 1.0 does NOT apply during ORBITAL_DECAY.
- Verify: `newHype === 0.5` in WS payload. BossRoomHeader shows "⚠ PENALTY MODE" (hype below 1.0).

**BF-O03 — Hype below 1.0× penalizes payouts**
- With Hype = 0.5×. Roll a winning result ($100 profit before hype).
- Expected: Payout = floor($100 × 0.5 / 100) × 100 = $50. Profit is halved. Hype below 1.0× acts as a payout penalty.

**BF-O04 — Hype floor at 0.5× (cannot decay further)**
- Bootstrap to The Commander with Hype 0.5× (at the floor). Roll Seven Out.
- Expected: Hype stays at 0.5× (floor applied by `Math.max(decayFloor, ...)` where `decayFloor = 0.5`). Does not go to 0 or negative.

**BF-O05 — BossRoomHeader shows current hype value for The Commander**
- Expected: Header shows "HYPE DECAY" label and current hype value. Yellow warning when hype < 1.25 and ≥ 1.0. Red "⚠ PENALTY MODE" when hype < 1.0.

**BF-O06 — Comp reward (ZERO POINT) applied after Commander defeat**
- Defeat The Commander (bankroll ≥ $650,000). Collect comp.
- Expected: BossVictoryComp shows "ZERO POINT". Hype is permanently floored at 1.25× for all future segments.

---

### BOSS FIGHT — THE EMISSARY (FIRST_CONTACT_PROTOCOL)

**BF-FC01 — Come-out 7 or 11 are blank rolls (no payout, no hype tick)**
- Bootstrap to The Emissary (startingMarkerIndex: 23). Roll a Natural (7 or 11) on COME_OUT.
- Expected: `rollResult` in response is `NO_RESOLUTION` (not NATURAL). `naturalBlocked: true` in WS `turn:settled` payload. No Pass Line payout. Hype does NOT tick +0.10. Pass Line bet remains on the table. Shooter stays in COME_OUT phase.

**BF-FC02 — Blocked natural does NOT increment bossPointHits**
- Roll several blocked naturals. Observe `newBossPointHits` in WS payloads.
- Expected: `newBossPointHits` stays at 0 (tidal surge counter — not applicable here; for Emissary the counter is not used, so it remains 0 or whatever it was).

**BF-FC03 — Point Hits still work normally during Emissary fight**
- Bootstrap to Emissary. Set a point. Roll POINT_HIT.
- Expected: Normal POINT_HIT resolution — Pass Line pays, Odds pays. Hype ticks +0.25. No blocked behavior.

**BF-FC04 — CRAPS_OUT still works normally during Emissary fight**
- Bootstrap to Emissary. Roll Craps Out (2, 3, 12).
- Expected: Normal CRAPS_OUT — Pass Line lost, hype ticks −0.05. Not blocked.

**BF-FC05 — BossRoomHeader shows correct rule text for The Emissary**
- Expected: Header shows "THE EMISSARY" and rule reminder "⚔ COME-OUT 7 / 11 IS A NULL EVENT — NO WIN, NO HYPE". Right panel shows "7/11 = NULL" and "POINTS ONLY".

**BF-FC06 — Comp reward (THE FREQUENCY) applied after Emissary defeat**
- Defeat The Emissary (bankroll ≥ $2,500,000). Collect comp.
- Expected: BossVictoryComp shows "THE FREQUENCY". In subsequent segments: come-out Naturals award a bonus equal to 3% of the current marker target.

---

### BOSS FIGHT — THE ARCHITECT (CONVERGENCE)

**BF-CV01 — First Seven Out removes one crew slot (slot 4 / rightmost)**
- Bootstrap to The Architect (startingMarkerIndex: 26) with 5 crew slots filled. Roll Seven Out (first).
- Expected: `bossPointHits` increments from 0 to 1. `modifyCascadeOrder` now returns `[0,1,2,3]` (4 active slots). On subsequent rolls, crew in slot 4 does NOT fire. Crew in slots 0–3 fire normally.
- Verify via `cascadeEvents` — slot 4 crew never appears.

**BF-CV02 — Each subsequent Seven Out removes another slot**
- Continue from BF-CV01. Roll more Seven Outs.
- Expected: After 2nd Seven Out: `bossPointHits=2`, active slots `[0,1,2]`. After 3rd: `[0,1]`. After 4th: `[0]`. After 5th: `[]` (naked craps).
- Verify cascade order progressively shrinks.

**BF-CV03 — After 5 Seven Outs, cascade is fully suppressed (naked craps)**
- Accumulate 5 Seven Outs (bossPointHits=5). Roll any outcome.
- Expected: `cascadeEvents` is empty `[]`. No crew fires. `BossRoomHeader` shows "⌀ NAKED CRAPS" / "RAW CRAPS — NO CREW".

**BF-CV04 — Crew slots on the rail DB record are NOT removed (ephemeral only)**
- After 3 Seven Outs. Refresh the page. Inspect `GET /runs/:id` response.
- Expected: `crewSlots` in the DB still contains all 5 crew definitions. The slot suppression is ephemeral per-roll only. After refresh, `bossPointHits=3` is restored so the cascade suppression resumes correctly.

**BF-CV05 — POINT_HIT does NOT increment bossPointHits during CONVERGENCE**
- Bootstrap to Architect. Roll several Point Hits without Seven Outs.
- Expected: `newBossPointHits` stays at its current count. Only Seven Outs increment the counter.

**BF-CV06 — BossRoomHeader shows crew slot count for The Architect**
- Expected: Header shows "CONVERGENCE" label and active crew count (e.g. "4/5 CREW"). Shows "−1 ON 7-OUT". At 5 seven-outs: shows "⌀ NAKED CRAPS".

**BF-CV07 — No comp awarded after defeating The Architect (NONE sentinel)**
- Defeat The Architect (bankroll ≥ $20,000,000). Observe transition.
- Expected: `BossVictoryCompPhase` skips immediately via `useEffect` (calls `onAdvance()` without rendering the comp card). No comp screen displayed. `boss.compReward === 'NONE'`.

---

### DRAG-AND-DROP CREW RAIL (FB-022)

**DND-01 — Reorder endpoint happy path**
- Recruit crew into multiple slots. Send `POST /runs/:id/crew/reorder` with a valid permutation `[2,0,1,3,4]`.
- Expected: API returns 200 with updated `crewSlots`. Slot positions reflect the new order. Cooldown values are unchanged (server owns cooldownState; client cannot inject modified values).

**DND-02 — Optimistic UI updates before server confirmation**
- Drag a crew portrait to a new slot position in the UI.
- Expected: Rail reorders immediately on drop (optimistic update). Server request fires in the background. If server responds 200, the reorder persists across page refresh.

**DND-03 — Rail locked during rolls and cascade animations**
- While a roll is in progress (waiting for WS events). Attempt to drag a crew portrait.
- Expected: Drag is rejected or rail is locked. `sensors=[]` on the `DndContext` prevents activation during `isRolling || isCascading`. No drag activation occurs.

**DND-04 — Rollback on server failure**
- Simulate a 4xx or network failure on the reorder endpoint (e.g., inject a conflict). Drag crew to a new position.
- Expected: UI reverts to the pre-drag slot order after the error response arrives. No permanent reorder is applied. Error logged or shown to user.

**DND-05 — Reorder rejected on invalid permutation**
- Send `POST /runs/:id/crew/reorder` with duplicate indices `[0,0,1,2,3]`.
- Expected: API returns 422. Response body: "slotOrder must be a valid permutation of [0,1,2,3,4] with no duplicates."

**DND-06 — Reorder rejected on completed run**
- Send `POST /runs/:id/crew/reorder` on a run with `status === 'GAME_OVER'`.
- Expected: API returns 409 "Cannot reorder crew on a completed run."

---

### LEADERBOARD (FB-014)

**LB-01 — `GET /leaderboard?view=global` returns winners and nonWinners arrays**
- Send unauthenticated `GET /api/v1/leaderboard?view=global`.
- Expected: 200 response with `{ winners: [...], nonWinners: [...] }`. Each array contains up to 25 entries. Winners ordered by `finalBankrollCents DESC, shootersRemaining DESC`. Non-winners ordered by `highestMarkerIndex DESC, finalBankrollCents DESC`.

**LB-02 — `GET /leaderboard?view=personal` requires auth**
- Send `GET /api/v1/leaderboard?view=personal` without Authorization header.
- Expected: 401 "Authorization header required for personal view."

**LB-03 — `GET /leaderboard?view=personal` returns caller's entries**
- Send authenticated `GET /api/v1/leaderboard?view=personal`.
- Expected: 200 response with `{ entries: [...] }`. All entries belong to the authenticated user. Ordered by `finalBankrollCents DESC`. Max 25 entries.

**LB-04 — LeaderboardScreen renders entries**
- Navigate to the leaderboard from TitleLobbyScreen.
- Expected: Leaderboard screen loads. Winners section and Non-Winners section both render. Each entry shows: display name, final bankroll, markers cleared, and crew layout.

**LB-05 — Leaderboard entry expansion drawer**
- Click on a leaderboard entry.
- Expected: Expansion drawer opens showing additional detail (crew layout, shooters remaining, highest roll). Clicking again or pressing ESC collapses it.

**LB-06 — Leaderboard empty state**
- ⚠ VERIFY: Confirm that the LeaderboardScreen renders a meaningful empty state when no entries exist for the selected view (not a blank or crashed UI).

---

### FEEDBACK SYSTEM (FB-018)

**FEED-01 — `POST /feedback` happy path**
- Send authenticated `POST /api/v1/feedback` with valid `{ type, rating, comment, context }`.
- Expected: 200 or 201 response. Feedback recorded in `feedback_submissions` table.

**FEED-02 — `POST /feedback` auth failure**
- Send `POST /api/v1/feedback` without Authorization header.
- Expected: 401. Feedback not recorded.

**FEED-03 — FeedbackModal opens from HUD bug icon (in-game context)**
- During an active run, click the bug icon in the TableBoard HUD.
- Expected: `FeedbackModal` opens portaled to `document.body`. Context snapshot captures current game state (bankroll, marker, phase, crew).

**FEED-04 — FeedbackModal opens from TitleLobbyScreen "SUBMIT FEEDBACK" button**
- From the title lobby (no active run), click "SUBMIT FEEDBACK".
- Expected: `FeedbackModal` opens. Context is post-session (no active run data — `snapshotForFeedback()` returns snapshot of last run state before `disconnect()` cleared it).

**FEED-05 — Feedback submitted successfully closes modal**
- Open FeedbackModal. Fill out form. Submit.
- Expected: Modal closes after successful submission. No error displayed.

---

### RELEASE NOTES / VERSIONING (FB-019)

**VER-01 — VersionDisplay renders a version string**
- Load the game. Find the VersionDisplay component in the bottom corner or HUD.
- Expected: A version string (e.g., "v1.2.3") is rendered. Not blank. Matches the build script output.

**VER-02 — "New" badge appears on first view**
- Clear localStorage. Load the game.
- Expected: A "New" badge or indicator is visible near the version string or release notes button, signaling unread release notes.

**VER-03 — "New" badge dismisses after viewing release notes**
- From VER-02. Click to open the ReleaseNotesModal.
- Expected: Modal opens with release notes. Closing the modal dismisses the "New" badge. The badge does NOT re-appear on subsequent loads (persisted to localStorage).

**VER-04 — ReleaseNotesModal opens and closes**
- Click the version string or "What's New" control.
- Expected: ReleaseNotesModal opens. Shows a list of recent changes. Pressing the close button or clicking outside dismisses it.

---

### UNLOCK SYSTEM (FB-012)

**UNL-01 — `GET /crew-roster` returns availability-filtered roster**
- Send authenticated `GET /api/v1/crew-roster`.
- Expected: 200 response with `{ roster: [...] }`. Each entry includes `isAvailable` field. Starter crew (IDs 16–30) always have `isAvailable: true`. Locked unlock-gated crew (IDs 1–15 not yet unlocked) have `isAvailable: false`.

**UNL-02 — `GET /crew-roster` includes `hireCostCents` for each entry**
- ⚠ VERIFY: The route as implemented in `crewRoster.ts` does NOT currently include `hireCostCents` in the response (it is added by `recruit.ts` at hire time). Confirm that the client reads hire cost from the recruit endpoint response, not from the roster response. Update this test accordingly once the architecture is confirmed.

**UNL-03 — Unlock gating on recruit endpoint**
- Attempt to `POST /runs/:id/recruit` with a `crewId` for a locked crew member (one not in `user.unlockedCrewIds` and not a starter).
- Expected: API returns 403 "Crew member X has not been unlocked yet." Bankroll unchanged.

**UNL-04 — Unlock notification emitted via WebSocket**
- Trigger an unlock condition (e.g., roll 3 Naturals in a single run to unlock The Regular / ID 6).
- Expected: `unlocks:granted` WS event emitted to the run room after the qualifying roll. Event contains `{ newUnlockIds: [6], crewNames: ['The Regular'] }`. UI shows an unlock notification banner.

**UNL-05 — Previously unlocked crew appear in Pub roster**
- Unlock a crew member. Visit the Pub (clear a marker).
- Expected: The newly unlocked crew member appears as an available card in the Pub recruitment options (in addition to standard Starter crew).

---

### TITLE LOBBY SCREEN (FB-011)

**TLS-01 — New Run flow**
- From the title lobby, click "NEW RUN".
- Expected: A new run is created via `POST /runs`. Redirects to table. Bankroll: $30. Shooters: 5. Marker 0 target shown.

**TLS-02 — Continue Run flow (existing active run)**
- Close and reopen the browser (or navigate away and back). Existing run in progress.
- Expected: Title lobby detects existing run and shows "CONTINUE" option. Clicking it loads the existing run state (bankroll, crew, marker, phase all restored from `GET /runs/:id`).

**TLS-03 — Inline confirmation guard before abandoning active run**
- From title lobby with an active run. Click "NEW RUN".
- Expected: An inline confirmation prompt appears (not a browser dialog). Requires explicit confirmation before abandoning the active run. Cancelling the confirmation leaves the current run intact.

**TLS-04 — Leaderboard accessible from title lobby**
- From title lobby, navigate to the leaderboard.
- Expected: LeaderboardScreen loads. Global view shown by default. Back navigation returns to title lobby.

---

### TUTORIAL (cheat_dice gate)

**TUT-01 — `cheat_dice` accepted when `tutorial_completed = false`**
- Use a test user whose `tutorialCompleted` is false. Send `POST /runs/:id/roll` with `cheat_dice: [3, 4]` in the body.
- Expected: API accepts the cheat dice. Roll resolves with dice [3,4] (total 7, classified per phase). Server uses the predetermined values instead of RNG.

**TUT-02 — `cheat_dice` rejected (ignored) when `tutorial_completed = true`**
- Use a test user whose `tutorialCompleted` is true. Send `POST /runs/:id/roll` with `cheat_dice: [3, 4]`.
- Expected: API ignores `cheat_dice` field. Roll uses server-side RNG. Dice are not predetermined to [3,4]. *(The server silently ignores the field — it does not return a 400 error; it simply falls back to `rollDice()`.)*
- Note: Full tutorial flow testing (beat sequencing, KnowledgeGate, SalDialog) is out of scope for this plan.

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
| KI-013 | High | Global text still too small on mobile despite typography overhaul | L1 (SM-01) |
| KI-014 | Medium | Typography overhaul missing from Title and Transition screens | L2 (TLS-*) |

---

## Test Case Count Summary

| Layer | Section | Tests |
|-------|---------|-------|
| L1 Smoke | — | 6 |
| L2 Sanity | Come-Out Phase | 6 |
| L2 Sanity | Point Active Phase | 8 |
| L2 Sanity | Betting Validation | 5 |
| L2 Sanity | Boss Fight — Overview | 6 |
| L2 Sanity | Progression & Pub | 5 |
| L2 Sanity | Game Over | 2 |
| **L2 Total (excluding L1)** | | **32** |
| L3 Full Regression | Hype System | 7 |
| L3 Full Regression | Crew Cascade | 6 |
| L3 Full Regression | Table Max & Bet Limits | 3 |
| L3 Full Regression | Marker Progression | 5 |
| L3 Full Regression | Game Over Scenarios | 3 |
| L3 Full Regression | Persistence & Session | 3 |
| L3 Full Regression | Roll Log | 3 |
| L3 Full Regression | UI Fidelity | 5 |
| L3 Full Regression | Boss Fight — The Foreman (EXTORTION_FEE) | 5 |
| L3 Full Regression | Boss Fight — Sarge (RISING_MIN_BETS) | 7 |
| L3 Full Regression | Boss Fight — Mme. Le Prix (DISABLE_CREW) | 5 |
| L3 Full Regression | Boss Fight — The Executive (FOURS_INSTANT_LOSS) | 5 |
| L3 Full Regression | Boss Fight — The Hierophant (TRIBUTE) | 6 |
| L3 Full Regression | Boss Fight — The Sovereign (TIDAL_SURGE) | 5 |
| L3 Full Regression | Boss Fight — The Commander (ORBITAL_DECAY) | 6 |
| L3 Full Regression | Boss Fight — The Emissary (FIRST_CONTACT_PROTOCOL) | 6 |
| L3 Full Regression | Boss Fight — The Architect (CONVERGENCE) | 7 |
| L3 Full Regression | Drag-and-Drop Crew Rail | 6 |
| L3 Full Regression | Leaderboard | 6 |
| L3 Full Regression | Feedback System | 5 |
| L3 Full Regression | Release Notes / Versioning | 4 |
| L3 Full Regression | Unlock System | 5 |
| L3 Full Regression | Title Lobby Screen | 4 |
| L3 Full Regression | Tutorial (cheat_dice gate) | 2 |
| **L3 Total (excluding L1+L2)** | | **135** |
| **GRAND TOTAL** | | **173** |
