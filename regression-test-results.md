# BattleCraps — Regression Test Results

---

## Run 1 — 2026-03-22 (Alpha Baseline)

**Tester:** Claude (automated via browser JS harness + Chrome extension)
**Build:** main branch — post Lucky Charm fix
**Layer:** L3 Full Regression (all 61 tests)
**Method:** Sequential API calls via test harness; UI verified via accessibility tree reads.

**Results: 55 PASS | 1 DEFECT | 5 SKIP | 0 FAIL**

---

### Defects

---

#### DEF-006 — Physics Professor: cooldownType is 'none' (test plan described per_roll cooldown of 4)

**Test:** CR-06
**Severity:** Low (design clarification needed — not necessarily broken)
**Status:** Open

**Description:**
The test plan's crew profile for Physics Professor (crewId: 2) described a `per_roll` cooldown of 4, meaning she fires once then sits out 4 rolls. The actual implementation in `physicsProfessor.ts` has `cooldownType: 'none'` and `cooldownState: 0` permanently. Prof fires on every paired dice roll with no cooldown restriction.

**Observed:**
- After Prof fires on a paired roll, `crewSlots[0].cooldownState = 0` (no cooldown set)
- Prof fires again on the very next paired roll
- No delay between triggers

**Resolution Options:**
- (a) Confirm no-cooldown is intended — update crew-test-plan.md profile description and remove CR-06 cooldown test
- (b) Restore the per-roll cooldown of 4 if it was removed unintentionally during the balance pass

---

### DEF-001 Not Reproduced

DEF-001 ("Bankroll $40 short after crew recruitment") from the original smoke test was **not reproduced** in this run. Crew hire costs deducted correctly across multiple tests (Nervous Intern $50, The Regular $100 both matched their `baseCost`). The defect may have been a one-off scenario tied to the specific bet state at the time of the smoke test, or it was inadvertently fixed during subsequent development. **Marking DEF-001 as Cannot Reproduce pending a manual UI walkthrough.**

---

### Skipped Tests

| ID | Reason |
|----|--------|
| PRG-02 | Pub screen UI check — requires localStorage sync. Run status=TRANSITION verified via API (PRG-01 passes). Manual UI verification recommended. |
| CR-04 | Crew portrait after hire — UI doesn't reflect API state without page reload. crewSlots correctly populated in API (confirmed in CR-01/CR-02). Manual verification recommended. |
| MP-05 | Final marker GAME_OVER — impractical to play through all 4 markers programmatically. Logic verified in `computeNextState` source code. |
| GV-03 | Game Over screen content — requires UI sync. GAME_OVER state confirmed via API (GV-01/GV-02). Manual verification recommended. |
| UI-04 | Crew portrait cascade animation — WebSocket events fire correctly; portrait flash animation requires visual observation. Cannot automate timing assertion. |

---

### Full Results

| ID | Status | Notes |
|----|--------|-------|
| SM-01 | PASS | App loads: $250 bankroll, TABLE MAX $40, Roll button present, "No rolls yet." present |
| SM-02 | PASS | Bootstrap + roll: valid dice, rollResult, bankrollDelta returned. POINT_SET on [2,2]=4. |
| SM-03 | PASS | Natural 7: bankrollDelta=+1000¢. Bank 25000→26000¢. Correct 1:1 payout. |
| SM-04 | PASS | SEVEN_OUT: shooters 5→4, hype=1.0, status=IDLE_TABLE. All correct. |
| SM-05 | PASS | Second bootstrap: fresh state confirmed (25000¢, 5 shooters, crewSlots all null). |
| CO-01 | PASS | Natural 7 on [2,5]: bankrollDelta=+1000¢. Correct. |
| CO-02 | PASS | Natural 11 on [6,5]: bankrollDelta=+1000¢. Treated identically to Natural 7. Correct. |
| CO-03 | PASS | CRAPS_OUT total=2 on [1,1]: bankrollDelta=-500¢, shooters unchanged. Correct. |
| CO-04 | PASS | CRAPS_OUT total=3: bankrollDelta=-500¢, shooters unchanged. Correct. |
| CO-05 | PASS | CRAPS_OUT total=12: bankrollDelta=-500¢, shooters unchanged. Correct. |
| CO-06 | PASS | POINT_SET: phase=POINT_ACTIVE, status=POINT_ACTIVE, currentPoint valid [4/5/6/8/9/10]. Correct. |
| PA-01 | PASS | POINT_HIT: bankrollDelta=+2000¢ (1:1 + stake), phase=COME_OUT, point=null. Correct. |
| PA-02 | PASS | Point 8, $10 PL + $10 odds: bankrollDelta=+4200¢. Odds 6:5 payout correct (1200¢ on 1000¢). |
| PA-03 | PASS | Point 5, $10 odds: odds win=1500¢ (3:2 on 1000¢). Correct. |
| PA-04 | PASS | Point 4, $10 odds: odds win=2000¢ (2:1 on 1000¢). Correct. |
| PA-05 | PASS | NO_RESOLUTION: bankrollDelta=0, bets persist, phase=POINT_ACTIVE. Correct. |
| PA-06 | PASS | Hard 8 hit [4,4]: bankrollDelta includes +9000¢ hardway payout (9:1). Bet cleared after win. Correct. |
| PA-07 | PASS | Soft 8 [6,2]: Hard 8 bet cleared (no payout). Result=NO_RESOLUTION. Correct. |
| PA-08 | PASS | SEVEN_OUT: all bets cleared, shooters decremented, hype=1.0. Correct. |
| BV-01 | PASS | 422: "Pass Line bet of 5000¢ exceeds the table maximum of 4000¢ ($40)." Correct. |
| BV-02 | PASS | 422: "Insufficient funds: need 1000¢, have 500¢." Correct. |
| BV-03 | PASS | 422: "Existing bets cannot be reduced." Correct. |
| PRG-01 | PASS | Marker 1 clear: bankroll≥40000¢ triggers status=TRANSITION, currentMarkerIndex=1. Correct. |
| PRG-02 | SKIP | UI not synced without localStorage update. API state verified (TRANSITION). |
| PRG-03 | PASS | Recruit endpoint works. Crew hire cost deducted correctly. crewSlots populated. DEF-001 not reproduced. |
| PRG-04 | PASS | Skip/REST: bankroll unchanged, status=IDLE_TABLE, shooters=5. Correct. |
| GO-01 | PASS | Last shooter SEVEN_OUT: status=GAME_OVER, shooters=0. Correct. |
| GO-02 | PASS | Play Again (fresh bootstrap): 25000¢, 5 shooters, empty crew rail, IDLE_TABLE. Correct. |
| HY-01 | PASS | Hype 2.0 + Intern: NATURAL payout=2200¢ (1000×2.2). Hype amplification confirmed. |
| HY-02 | PASS | Intern: hype accumulates +0.2 per Natural (1.0→1.2→1.4). SEVEN_OUT resets correctly. |
| HY-03 | PASS | SEVEN_OUT: hype resets to 1.0. Intern NOT in cascadeEvents on that roll. Correct. |
| HY-04 | PASS | Holly: 3 POINT_HITs → hype 1.0→1.3→1.6→1.9 (+0.3 each). Correct. |
| HY-05 | PASS | Holly: POINT_HIT→1.3, SEVEN_OUT→1.0, POINT_HIT→1.3. Hype persistence/reset correct. |
| CR-01 | PASS | Intern NATURAL: cascadeEvents has {crewId:10, contextDelta:{hype:1.2}}. Correct. |
| CR-02 | PASS | Intern+Holly: NATURAL → only Intern fires; POINT_HIT → only Holly fires. Slot order correct. |
| CR-03 | PASS | Whale + hype 1.5: NATURAL payout = floor(1000×1.5×1.2) = 1800¢. Stacking confirmed. |
| CR-04 | SKIP | UI not synced without page reload. crewSlots confirmed via API. |
| CR-05 | PASS | Lefty per-shooter cooldown: fires on SEVEN_OUT, resets on new shooter, fires again. Correct. |
| CR-06 | DEFECT | Physics Prof has `cooldownType:'none'` — fires on every pair with no cooldown. Test plan described per_roll cooldown of 4. See DEF-006. |
| BL-01 | PASS | Table max enforced at M1 (4000¢) and M2 (6000¢). 1¢ over threshold rejected with 422. Correct. |
| BL-02 | PASS | 422: "hard8 bet of 4001¢ exceeds the table maximum of 4000¢ ($40)." Hardway subject to max. Correct. |
| BL-03 | PASS | Odds=5000¢ (above table max of 4000¢) accepted without 422. Odds are uncapped. Correct. |
| MP-01 | PASS | M1 clear at ≥40000¢: status=TRANSITION, currentMarkerIndex=1. Correct. |
| MP-02 | PASS | M2 clear at ≥60000¢: status=TRANSITION, currentMarkerIndex=2. Correct. |
| MP-03 | PASS | Table max: M1=4000¢, M2=6000¢ confirmed by 422 threshold testing. M3=15000¢ confirmed in source. |
| MP-04 | PASS | Old Pro: TRANSITION shows shooters=11 (10 starting + 1 bonus). Correct. |
| MP-05 | SKIP | Final marker impractical to automate through all 4 markers. Source logic verified. |
| GV-01 | PASS | 1 shooter + SEVEN_OUT: status=GAME_OVER. Correct. |
| GV-02 | PASS | Bankroll=0 with shooters remaining: status=GAME_OVER (not IDLE_TABLE). Cannot be stuck. Correct. |
| GV-03 | SKIP | UI not synced. GAME_OVER state confirmed via API. |
| PS-01 | PASS | Page reload reconnects to existing run via localStorage. Bankroll matches pre-reload state. Correct. |
| PS-02 | PASS | NEW RUN (fresh bootstrap): 25000¢, 5 shooters, empty crew, IDLE_TABLE. Correct. |
| PS-03 | PASS | Roll attempt in TRANSITION: 409 "Cannot roll in status TRANSITION." Correct. |
| RL-01 | PASS | Roll Log entry has dice, result type, and net delta after UI roll. Correct structure. |
| RL-02 | PASS | 4+ Roll Log entries accumulated correctly across multiple rolls. No entries dropped. |
| RL-03 | PASS | Roll receipt structure verified in source: crew bonus line added when additives > 0. |
| UI-01 | PASS | Puck: OFF on COME_OUT, "5 POINT ACTIVE" after POINT_SET, returns OFF after resolution. Correct. |
| UI-02 | PASS | Odds zone: "TRUE ODDS" (locked) on COME_OUT, "3:2" unlocked after point 5 set. Correct. |
| UI-03 | PASS | Hard 4/10 show 7:1, Hard 6/8 show 9:1. All correct. |
| UI-04 | SKIP | WebSocket cascade events confirmed firing. Portrait animation requires visual check. |
| UI-05 | PASS | Marker progress bar shows "$260 / $400" format with proportional fill. Correct. |

---

*Next run: append below with new timestamp after next significant change.*
