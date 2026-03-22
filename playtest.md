# BattleCraps — Smoke Test Playtest Report

**Date:** 2026-03-22
**Tester:** Claude (automated via Chrome Extension + API)
**Build:** main branch — commit a3a8e08
**Method:** UI interaction via Chrome Extension for all observable tests; dev bootstrap API used to seed scenario-specific bankroll values.

---

## Test Results Summary

| # | Test | Status | Defects |
|---|------|--------|---------|
| 1 | App Load & Bootstrap | ✅ Pass | — |
| 2 | Place a Bet & Roll (COME_OUT) | ✅ Pass | — |
| 3 | Point Set → POINT_ACTIVE | ✅ Pass | — |
| 4 | Roll to Resolution | ✅ Pass | — |
| 5 | Hit a Marker → Pub Screen | ✅ Pass | — |
| 6 | Recruit a Crew Member | ⚠️ Pass w/ Defect | DEF-001 |
| 7 | Crew Fires in Cascade | ❌ Fail | DEF-002 |
| 8 | Game Over Screen | ✅ Pass | — |
| 9 | Play Again | ✅ Pass | — |

---

## Defect Log

### DEF-001 — Bankroll Incorrect After Crew Recruitment
**Test:** Test 6 — Recruit a Crew Member
**Severity:** Medium
**Context:** After clearing Marker 1 with a bankroll of $418.00, the Pub screen correctly showed $418.00. "Hype-Train" Holly was hired for $100.00. The game returned to the Table Board showing Marker 2.
**Expected Behavior:** Bankroll should be $418.00 − $100.00 = **$318.00**.
**Actual Behavior:** Bankroll displayed as **$278.00** — $40 short of the expected value.
**Notes:** The $40 discrepancy exactly matches the Table Max bet size at the time ($40 for Marker 1). This may indicate that the final winning roll's Pass Line bet is being double-deducted, or that outstanding bets are not being fully returned during the TRANSITION state settlement. Reproducibility should be confirmed with a pure UI test run (no API-direct rolls).

---

### DEF-002 — "Hype-Train" Holly Does Not Fire on Point Hit ✅ FIXED
**Test:** Test 7 — Crew Fires in Cascade
**Severity:** High (crew ability is entirely non-functional)
**Context:** "Hype-Train" Holly (HYPE crew, $100) was recruited to slot 1. Holly's stated ability is "+0.3× Hype on every Point Hit." A Point Hit was rolled ([5,3]=8 on point 8).
**Expected Behavior:**
- Holly's portrait should flash with a cascade animation
- A bark text should appear above her portrait
- Hype multiplier should increase from 1.0× to 1.3×
- The roll API response `cascadeEvents` array should contain an entry for Holly

**Actual Behavior:**
- `cascadeEvents` array was **empty** (`[]`) on the Point Hit roll
- Hype remained at **1.0×** (no change)
- No portrait flash or bark text observed in the UI
- Holly appears seated on the rail but never activates

**Root Cause:** Code was triggering on `NATURAL` with multiplicative Hype (×1.2 on 7, ×1.5 on 11) — a design that diverged from the description at some point during development.
**Fix:** `hypeTrainHolly.ts` updated to trigger on `POINT_HIT` with additive `+0.3` Hype, matching the description. The description was the source of truth.

---

## Test Detail

### Test 1 — App Load & Bootstrap ✅
**Scenario:** Navigate to `http://localhost:5173`, observe initial game state.
**Expected:** $250 bankroll, 5 shooters, empty crew rail, COME_OUT phase, WebSocket connected.
**Actual:** All correct. WebSocket showed "SUBSCRIBED" indicator (green, top-right). Table Max $40 shown (10% of Marker 1 target $400). Roll Log empty ("No rolls yet."). ✅

---

### Test 2 — Place a Bet & Roll (COME_OUT) ✅
**Scenario:** Select $5 chip, click Pass Line zone, click Roll.
**Expected:** Bankroll decreases by bet amount immediately on placement. Dice display updates after roll. Roll result label appears. Roll Log entry created.
**Actual:** $250 → $245 on placement. Dice rendered as dot-pattern. "POINT SET" label appeared. Roll Log entry: "Roll: 8 [6, 2] — Easy — Point Set: 8". ✅

**Bonus observation:** CRAPS_OUT scenario also observed in later testing — [1,2]=3 correctly showed "CRAPS OUT" label in red and deducted the Pass Line bet. ✅

---

### Test 3 — Point Set → POINT_ACTIVE ✅
**Scenario:** Observe state after a point-setting roll (8 on [6,2]).
**Expected:** Point puck flips ON showing the point number, Odds zone unlocks with correct odds ratio, Pass Line zone locks.
**Actual:** Puck showed "8 POINT ACTIVE". Odds zone showed "6:5" (correct for point 8). Pass Line zone greyed out. ✅

---

### Test 4 — Roll to Resolution ✅

**Scenario A — POINT_HIT:** $5 Pass Line + $5 Odds (point 8). Rolled [5,3]=8.
**Expected:** "POINT HIT!" label, Pass Line and Odds pay out correctly, puck resets to OFF/COME_OUT.
**Actual:** "POINT HIT!" shown in gold. Roll Log: "Pass Line Won $5.00 (1:1) + Odds Won $6.00 (6:5 on Point 8). Net: +$16.00". Bankroll $240 → $261 (+$21 total returned). Puck reset to OFF. ✅

**Scenario B — SEVEN_OUT:** Rolled [1,6]=7 during POINT_ACTIVE (point 10).
**Expected:** "SEVEN OUT" label in red, all bets cleared, shooter count decrements, Hype resets to 1.0×.
**Actual:** "SEVEN OUT" in red. Roll Log showed Pass Line Lost and Odds Lost (both "cleared by Seven Out"). Shooter count dropped 5→4. Hype remained 1.0×. Phase reset to COME_OUT. ✅

**Scenario C — NATURAL:** Rolled [5,2]=7 on COME_OUT.
**Expected:** "NATURAL!" label, Pass Line wins 1:1, no shooter change.
**Actual:** "NATURAL!" shown. Pass Line Won $25.00 (1:1). Net: +$25.00. ✅

**Scenario D — NO_RESOLUTION:** Multiple rolls during POINT_ACTIVE that were neither the point nor 7.
**Expected:** Dice update, label updates to indicate no resolution, bets persist, bankroll unchanged.
**Actual:** Roll Log showed "No Resolution (Point: X)" with Net: — (neutral). Bets remained on table. ✅

---

### Test 5 — Hit a Marker → Pub Screen ✅
**Scenario:** Bootstrapped run with $390 bankroll (10 short of Marker 1 target). Played until bankroll ≥ $400.
**Expected:** Marker Cleared celebration modal appears with flavor text and "VISIT THE PUB" button.
**Actual:** Modal appeared with header "MARKER CLEARED ✦", title "NICE ROLL!", text "You've hit the marker target. A new shooter and 5 fresh lives await. Head to the pub to hire your next crew member." and "VISIT THE PUB" button. Gold glow border effect shown. ✅

Clicking "VISIT THE PUB" loaded the Seven-Proof Pub screen:
- Title: "THE SEVEN-PROOF PUB / Hire a hand before the next marker…" ✅
- Bankroll and Shooters shown ($418.00, 5 +++++) ✅
- 3 crew cards rendered with name, category badge (DICE / HYPE / WILD), ability text, and cost ✅
- "REST & SKIP TO TABLE" button present ✅
- Shooter count reset to 5 ✅
- Marker advanced to Marker 2 ($600 target) after pub ✅
- Table Max updated to $60 (10% of $600) ✅

---

### Test 6 — Recruit a Crew Member ⚠️ (Pass w/ Defect)
**Scenario:** In the Pub, select "Hype-Train" Holly ($100 HYPE crew), choose slot 0.
**Expected:** Slot selector appears, crew placed in chosen slot, $100 deducted from bankroll, game returns to Table Board with crew portrait visible.
**Actual:**
- Clicking Holly card revealed slot selector panel with 5 empty slot buttons and greyed "SELECT A SLOT" button ✅
- Clicking slot 0 highlighted it in orange and enabled "HIRE FOR $100.00" button ✅
- Clicking confirm transitioned to Table Board ✅
- Holly's portrait visible in crew slot 1 with `{Hype}` label ✅
- Bankroll deducted ✅ (though amount incorrect — see DEF-001)

**→ DEF-001 filed (bankroll $40 short after hire)**

---

### Test 7 — Crew Fires in Cascade ❌
**Scenario:** With Holly seated in slot 1, roll until a Point Hit occurs. Observe cascade.
**Expected:** On Point Hit, Holly's portrait flashes, bark text appears, Hype increases from 1.0× to 1.3×. API `cascadeEvents` contains a Holly entry.
**Actual:** Point Hit confirmed ([5,3]=8 on point 8). `cascadeEvents: []` (empty). Hype remained 1.0×. No visual animation observed. Holly is non-functional.

**→ DEF-002 filed (Holly never fires)**

---

### Test 8 — Game Over Screen ✅
**Scenario:** App loaded with prior session already in GAME_OVER state.
**Expected:** Screen shows Final Bankroll, Markers Cleared, Crew on Rail, Last Crew Standing display, Play Again button.
**Actual:** Showed $0.00 bankroll, 1/4 markers cleared, 1/5 crew on rail, "The Mathlete" as last crew standing. Play Again button present. ✅

---

### Test 9 — Play Again ✅
**Scenario:** Click Play Again from Game Over screen.
**Expected:** Game resets to fresh state — $250 bankroll, 5 shooters, empty crew rail, COME_OUT phase.
**Actual:** Table Board loaded with $250.00, 5 shooters, empty crew rail, COME_OUT, Hype 1.0×, Table Max $40. Roll Log showed "No rolls yet." ✅

---

## Observations (Non-Defect)

- **Roll Log** works correctly across all scenarios tested — every roll produces a timestamped entry with dice, result type, payout breakdown, and net delta.
- **Marker progress bar** updates correctly as bankroll approaches target.
- **Table Max** correctly updates between markers (Marker 1: $40, Marker 2: $60).
- **WebSocket** connected and showed "SUBSCRIBED" throughout; no disconnects observed.
- **Odds zone** correctly locks/unlocks based on phase (COME_OUT vs POINT_ACTIVE).
- **Chip denominations** ($1, $5, $10, $25, $50) all selectable; bet deduction is immediate on click.
- **Hardway zones** (Hard 4/6/8/10) display correct payout ratios (7:1 / 9:1 / 9:1 / 7:1).
