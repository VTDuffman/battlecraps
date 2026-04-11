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

### SM-06 — Boss entry modal renders at boss marker

**Setup:** `POST /api/v1/dev/bootstrap` with `{ "startingBankroll": 99000, "startingMarkerIndex": 2 }`.
*(Note: `startingMarkerIndex` is a required bootstrap param for this test — add to the dev endpoint if not yet supported.)*
**Expected:**
- `BossEntryModal` renders instead of `TableBoard`
- Shows "THE HIGH LIMIT ROOM" header and "SARGE" boss name
- "ENTER THE ROOM" button is present and clickable
- Clicking the button dismisses the modal and shows `TableBoard` with `BossRoomHeader` pinned at the top

---

## L2 — Sanity Tests (31 tests)

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

**BV-01 — Chip clamped to table max**
- Bootstrap $500 starting bankroll. At Marker 1 (table max $40), select $50 chip. Click Pass Line.
- Expected: Bet placed at $40 (clamped to max), not $50. Bankroll decreases by $40. Clicking Pass Line again is a no-op (room = 0, already at max). Bankroll unchanged on 2nd click.

**BV-02 — Insufficient funds**
- Bootstrap $10 starting bankroll. Attempt to place $25 Pass Line.
- Expected: Error shown. Bet not accepted.

**BV-03 — Bets cannot be reduced mid-turn**
- Place $10 Pass Line (point not yet set). Attempt to place $5 Pass Line (reducing it).
- Expected: The deduct-on-placement model means the $10 is already deducted. The UI should not allow reducing. Verify the roll endpoint returns 422 if attempted via API.

**BV-04 — Partial chip placed when near table max**
- At Marker 1 (table max $40). Place $25 Pass Line (bankroll −$25). Select $25 chip. Click Pass Line again.
- Expected: Second click places $15 (the remaining room to $40), not $25. Pass Line total = $40. Bankroll decreases by $15 on the second click. A third click is a no-op.

**BV-05 — Odds bet clamped to 3-4-5x cap**
- Establish a point of 6 (5x odds cap). Place $25 Pass Line (max odds = $125). Place $100 Odds. Select $50 chip. Click Odds.
- Expected: Odds placed at $25 (remaining room to $125 cap), not $50. Odds total = $125. Bankroll decreases by $25. A further click is a no-op.

---

### BOSS FIGHT

**BOS-01 — Boss entry modal appears on entering boss marker**
- Bootstrap to Marker 3 (boss, `startingMarkerIndex: 2`). Navigate to `http://localhost:5173`.
- Expected: `BossEntryModal` is shown. `TableBoard` is **not** visible. Normal `MarkerCelebration` is **not** shown.

**BOS-02 — Boss entry modal content is correct**
- From BOS-01, inspect the modal.
- Expected: Shows "THE HIGH LIMIT ROOM", "SARGE", Sarge's flavor text in quotes, RISING_MIN_BETS house rules block listing: starting min-bet $50, +2% increment **per Point Hit** (not per roll), holds on Seven Out, cap $200. "ENTER THE ROOM" button present.

**BOS-03 — Acknowledging entry shows table with BossRoomHeader**
- From BOS-01. Click "ENTER THE ROOM".
- Expected: Modal dismisses. `TableBoard` renders. `BossRoomHeader` is pinned at the top showing "HIGH LIMIT ROOM", "SARGE", current MIN BET ($50), and "→ $70 next" projection. Rule reminder "⚔ ANTE RISES ON POINT HIT — MIN BET HOLDS ON 7-OUT" visible.

**BOS-04 — Min-bet banner shows red warning and Roll button is disabled when bet is below minimum**
- From BOS-03. Select $25 chip. Click Pass Line (total $25, below $50 min).
- Expected: Min-bet banner in `BettingGrid` shows red background, "⚔ MIN BET", "$50", "← ADD MORE". Roll button is **definitively disabled** (greyed out, `disabled` attribute set) — it will not become enabled until the Pass Line meets the minimum. No server call is made.

**BOS-05 — Min-bet banner clears to met state when threshold is reached**
- From BOS-04. Add another $25 to Pass Line (total $50, meets min-bet).
- Expected: Banner background shifts to amber/olive, label changes to "✓ MET". Roll proceeds normally.

**BOS-06 — Defeating boss shows BossVictoryModal, not MarkerCelebration**
- Bootstrap near Sarge's target. Play until bankroll ≥ $1,000 (boss defeated).
- Expected: `BossVictoryModal` appears — NOT the normal "NICE ROLL!" `MarkerCelebration`. Shows "SARGE" / "DEFEATED", comp reward box reading "MEMBER'S JACKET", subtext "+1 SHOOTER this segment — they know you earned your seat.", "COLLECT & VISIT THE PUB" button.

**BOS-07 — Comp reward (+1 shooter) applied in Pub after boss victory**
- From BOS-06. Click "COLLECT & VISIT THE PUB".
- Expected: Pub screen shows **6 shooters** (5 base + 1 Member's Jacket bonus). Table starts the next segment with 6 lives.

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

**PRG-05 — Marker clear triggered by a Natural (come-out win)**
- Bootstrap $390. Place $10 Pass Line. Roll until a Natural (7 or 11 on COME_OUT) that pushes bankroll ≥ $400.
- Expected: `MarkerCelebration` modal appears immediately after the Natural resolves — same as a Point Hit clear. Game does NOT continue rolling. *(Regression: server previously only checked for marker threshold on POINT_HIT, not NATURAL.)*

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
- At Marker 1: Table max = $40 (10% of $400). Advance to Marker 2: Table max = $60 (10% of $600). Advance to Marker 3 (Sarge): Table max = $100 (10% of $1,000).
- Expected: Max bet display updates correctly after each marker clear. Chips that would exceed the current max are clamped to the remaining room.

**BL-02 — Table max applies to hardway bets independently**
- At Marker 1 (max $40). Select $50 chip. Click Hard 8.
- Expected: Hard 8 bet placed at $40 (clamped to max). Bankroll decreases by $40. Clicking Hard 8 again is a no-op.

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
- Expected: TRANSITION. Pub screen. Marker 3 target shows $1,000 (boss marker — red ★ BOSS label).

**MP-03 — Marker advance increments table max**
- Verify table max is 10% of the CURRENT marker target:
  - Marker 1 ($400 target) → max $40
  - Marker 2 ($600 target) → max $60
  - Marker 3 / Sarge ($1,000 target) → max $100

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

### BOSS FIGHT — RISING MIN-BETS

**BF-01 — `bossPointHits` increments ONLY on Point Hit (not on other roll outcomes)**
- Bootstrap to Sarge (`startingMarkerIndex: 2`). Acknowledge entry. Roll a Natural, then a Craps Out, then a Point Set + No Resolution (4 rolls total, zero Point Hits yet).
- Expected: Inspect `newBossPointHits` in each WS `turn:settled` payload. Values should remain **0** for all 4 rolls. Then engineer a POINT_HIT (without marker clear). Expected: `newBossPointHits` = 1 in that payload.

**BF-02 — Min-bet escalates only on Point Hit**
- From BF-01 state (1 Point Hit). Verify `BossRoomHeader` min-bet values against the formula: `$1,000 × (0.05 + 0.02 × pointHits)`, rounded up to nearest dollar.
  - 0 Point Hits (entry): $50 current, "→ $70 next"
  - 1 Point Hit: $70 current, "→ $90 next"
  - Natural / Craps Out / Seven Out between hits: min-bet **does not change**.
- Expected: Header values advance by $20 only after a confirmed Point Hit. Naturals, Craps Outs, Seven Outs, and Point Sets never move the counter.

**BF-03 — Min-bet holds on Seven Out (does not reset)**
- Enter Sarge fight. Score 3 Point Hits (bossPointHits = 3, min-bet = $110). Roll a Seven Out.
- Expected: `newBossPointHits` in the Seven Out WS event is **3** (unchanged — not reset to 0, not incremented). On the next come-out, `BossRoomHeader` still shows $110 minimum.

**BF-04 — Min-bet caps at $200 (20% of $1,000 target)**
- Enter Sarge fight. Score 8+ Point Hits without clearing or busting (use a high bankroll).
- Expected: Min-bet never exceeds $200. At `bossPointHits ≥ 8` (where 5% + 2%×8 = 21% > 20% cap), header shows $200 and the "→ $X next" projection **disappears** (already at cap).

**BF-05 — `bossPointHits` resets to 0 on boss victory**
- Defeat Sarge (bankroll ≥ $1,000). Collect comp and enter Pub. Return to table (Marker 4, non-boss).
- Expected: No `BossRoomHeader` visible. No min-bet banner in `BettingGrid`. `newBossPointHits` in subsequent rolls is 0.

**BF-06 — Boss entry modal shows only once per boss marker visit**
- Bootstrap to Sarge. Acknowledge entry ("ENTER THE ROOM"). Play several rolls including a Seven Out. Observe.
- Expected: Modal does **not** reappear after the Seven Out or any subsequent roll. Once acknowledged per session, it stays dismissed for the entire boss segment.
- **Sub-case (page refresh):** After acknowledging entry, refresh the page (F5). Expected: `BossEntryModal` reappears — acknowledgement is local state and correctly resets on page load. This is expected behavior.

**BF-07 — BossRoomHeader and min-bet banner absent on non-boss markers**
- Start a fresh run (Marker 1, non-boss).
- Expected: No `BossRoomHeader` visible anywhere in the layout. No min-bet warning banner in `BettingGrid`. Verify at Marker 1 and Marker 2.

**BF-08 — MarkerProgress shows `★ BOSS` label at all three boss markers**
- Advance to each boss marker (indices 2, 5, 8). Observe the progress bar label.
- Expected: At Marker 3 (index 2), Marker 6 (index 5), and Marker 9 (index 8), the label reads "★ BOSS" in red. All non-boss markers show the normal gold "MARKER N" label.

**BF-09 — Page refresh during boss fight restores correct min-bet state**
- Bootstrap to Sarge. Score 4 Point Hits (min-bet should now be $130). Refresh the page (F5).
- Expected (visual): `BossRoomHeader` re-renders showing $130 current minimum, not the $50 starting value.
- Expected (API): `GET /api/v1/runs/:id` response includes `"bossPointHits": 4`. Verify via browser DevTools Network tab or curl.

**BF-10 — API rejects roll when Pass Line is below boss min-bet**
- Bootstrap to Sarge. Via curl or DevTools, send `POST /api/v1/runs/:id/roll` with `passLine: 2500` (¢25, below the $50 = 5000¢ minimum).
- Expected: API returns `422 Unprocessable Entity`. Response body contains an error message referencing the minimum bet amount (e.g. "Minimum bet is 5000¢").

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
| L1 Smoke | — | 6 |
| L2 Sanity | Come-Out Phase | 6 |
| L2 Sanity | Point Active Phase | 8 |
| L2 Sanity | Betting Validation | 3 |
| L2 Sanity | Boss Fight | 7 |
| L2 Sanity | Progression & Pub | 5 |
| L2 Sanity | Game Over | 2 |
| **L2 Total (excluding L1)** | | **31** |
| L3 Full Regression | Hype System | 5 |
| L3 Full Regression | Crew Cascade | 6 |
| L3 Full Regression | Table Max & Bet Limits | 3 |
| L3 Full Regression | Marker Progression | 5 |
| L3 Full Regression | Game Over Scenarios | 3 |
| L3 Full Regression | Persistence & Session | 3 |
| L3 Full Regression | Roll Log | 3 |
| L3 Full Regression | UI Fidelity | 5 |
| L3 Full Regression | Boss Fight — Rising Min-Bets | 10 |
| **L3 Total (excluding L1+L2)** | | **43** |
| **GRAND TOTAL** | | **80** |
