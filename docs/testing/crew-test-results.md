# BattleCraps — Crew Test Results

---

## Run 1 — 2026-03-22

**Tester:** Claude (automated via browser JS harness)
**Method:** Sequential API calls via `/api/v1/dev/bootstrap` + `/api/v1/runs/:id/roll`
**Tests Executed:** 50 of 90 (happy path + selected edge cases per crew)
**Results:** 46 PASS | 4 DEFECT | 0 FAIL | 0 SKIP

---

### Defects

---

#### DEF-003 — Drunk Uncle: Negative Hype IS implemented (contradicts test plan expectation)

**Test(s):** EC-UNCLE-01
**Severity:** Low (design clarification needed — not necessarily broken)
**Status:** Open

**Description:**
The test plan stated: "Per code, all bonuses are positive — Hype should never decrease due to Uncle." The crew-test-plan.md pre-test discrepancy table also noted "Code only produces positive bonuses."

However, the actual `drunkUncle.ts` source (post-rework) DOES implement negative hype. The redesigned Drunk Uncle uses a phantom d2 roll: odd d2 → +0.5 hype; even d2 → -0.1 hype. The activation condition is d1 ≤ 2 (33% chance).

**Observed:**
Hype progression over 20 rolls with Uncle: `[1.5, 1.4, 1.9, 1.8, 1.7, 1.6, 2.1, 2.6, 1.6, 1.5]`. Hype clearly decreasing between some Uncle trigger events (not just from SEVEN_OUT resets).

**Root Cause:**
The test plan's pre-test discrepancy table was written against the OLD Drunk Uncle implementation (cooldown-based, always-positive). The redesign introduced the -0.1 path intentionally. The test plan expectation is stale.

**Resolution Options:**
- (a) Confirm the -0.1 path is intended and update the in-game description to mention it ("or -0.1×" is already in the seed.ts description — "Has a 33% chance to add +0.5× Hype — or subtract 0.1× Hype.")
- (b) Remove the -0.1 path if it was not intended.

**Recommendation:** This is likely working as designed. The seed.ts description says "or subtract 0.1× Hype" which matches the code. The test plan expectation was based on stale code. No code change needed — update test plan.

---

#### DEF-004 — Lucky Charm: Never emitted in cascadeEvents (portrait animation never fires)

**Test(s):** HP-CHARM-01, HP-CHARM-03
**Severity:** Medium (visual feedback broken — player cannot tell if Lucky Charm is working)
**Status:** Fixed (2026-03-22)

**Description:**
Lucky Charm correctly applies the Hype floor of 2.0 (functional effect works), but the crew member never appears in `cascadeEvents`. This means the portrait flash animation never plays and the player receives no visual feedback that Lucky Charm is active.

**Observed:**
- Bootstrap with Lucky Charm solo, Hype = 1.0
- After first roll: `run.hype = 2.0` ✓ (floor applied correctly)
- `roll.cascadeEvents = []` — Lucky Charm absent ✗

**Root Cause:**
In the cascade engine, Lucky Charm's execute() mutates `ctx.hype` by applying `Math.max(ctx.hype, 2.0)`. However, the `prevCtx` snapshot is captured AFTER this mutation (or the delta computation compares the wrong before/after state), so `computeContextDelta(prevCtx, ctx)` sees no difference and emits no event.

The cascade logic intends: take snapshot → execute ability → compare → emit event if delta. The snapshot ordering is broken for Lucky Charm's hype floor case.

**Special case:** When starting Hype is already ≥ 2.0, `Math.max(2.5, 2.0) = 2.5` produces genuinely no delta — Lucky Charm is a no-op in that case and silence is correct. The bug only affects the case where hype < 2.0 and the floor brings it up to 2.0.

---

#### DEF-005 — Lucky Charm: Hype floor NOT applied on the SEVEN_OUT roll itself

**Test(s):** HP-CHARM-02
**Severity:** Medium (defeats the key design promise of the crew member)
**Status:** Fixed (2026-03-22)

**Description:**
The stated ability is "When alone, sets a Hype floor of 2.0×." After a SEVEN_OUT, the engine resets Hype to 1.0 as part of `computeNextState()`. Lucky Charm's cascade runs BEFORE `computeNextState()`, so it correctly floors Hype to 2.0 within the cascade — but the SEVEN_OUT reset clobbers it afterward.

**Observed:**
- Lucky Charm solo, Hype = 2.0 (established by prior rolls)
- Roll SEVEN_OUT: `run.hype = 1.0` in response ✗ (expected 2.0)
- Next roll: `run.hype = 2.0` ✓ (Lucky Charm re-floors on the following roll)

**Net effect:** There is a one-roll window after every SEVEN_OUT where Hype = 1.0, even with Lucky Charm on the rail. Any payout-boosting crew that fires on the same roll as SEVEN_OUT (e.g., Drunk Uncle firing on a non-SEVEN outcome) during this window receives reduced Hype. More importantly, the player's first roll after a shooter death uses 1.0× Hype instead of 2.0×.

**Root Cause:**
The Hype reset in `computeNextState()` runs AFTER the cascade, overwriting Lucky Charm's floor. Lucky Charm needs to either: (a) be re-applied post-state-machine, or (b) the Hype floor needs to be enforced as part of `computeNextState()` when Lucky Charm is on the rail.

---

### Notable Observations (Non-Defect)

These are informational findings that do not represent bugs but warrant documentation.

| ID | Crew | Observation |
|----|------|-------------|
| OBS-01 | Lefty McGuffin | `crewName` in cascadeEvents is `"Lefty" McGuffin` (with embedded quotes). String-matching on this name client-side requires exact match with quotes. Not a defect but worth noting for any bark/UI text keyed to name. |
| OBS-02 | Drunk Uncle | `cooldownType: 'none'` — Uncle fires on EVERY roll (subject to 33% d1≤2 probability), not on a cooldown schedule. The test plan assumed a 2-roll cooldown from old implementation. HP-UNCLE-02 (cooldown test) "passed" due to not triggering in those 2 rolls by chance only. |
| OBS-03 | Big Spender | Confirmed: additive bonus is **10,000¢ ($100)**. Both `seed.ts` and `PubScreen.tsx` correctly state $100. No mismatch. |
| OBS-04 | The Shark | Confirmed: additive bonus is **10,000¢ ($100)** on POINT_HIT. Description says "+$100 flat bonus on Point Hit" — matches correctly. |
| OBS-05 | Old Pro | Tested successfully. With Old Pro on rail, clearing Marker 1 gives 6 shooters instead of 5. `run.shooters === 6` at TRANSITION. |
| OBS-06 | The Whale | 1.2× multiplier confirmed working. Applies to all positive payout scenarios. |
| OBS-07 | Mathlete | Hard bet restoration working correctly after engine fix (resolvedBets path). |
| OBS-08 | All cooldown crew | Per-shooter cooldown (Lefty, Floor Walker) resets correctly on new shooter. Per-roll cooldown (Prof, Mechanic) counts down correctly. |

---

### Pre-Existing Known Defect — Description Mismatch

#### DEF-BIG-DESC — Big Spender description mismatch

**Status:** Closed — not a defect. Both `seed.ts` and `PubScreen.tsx` correctly state "+$100". The "$50" figure only appeared in early draft documentation. No code change required.

---

### Full Test Results

| Test ID | Status | Notes |
|---------|--------|-------|
| HP-LEFTY-01 | PASS | Lefty fires on SEVEN_OUT. cascadeEvents contains `"Lefty" McGuffin`. Shooter survives if re-roll ≠ 7. |
| HP-LEFTY-03 | PASS | Re-roll → NO_RESOLUTION. Shooter count unchanged. Bets persist. |
| EC-LEFTY-01 | PASS | After Lefty consumed, second SEVEN_OUT resolves normally. Lefty absent from cascadeEvents. |
| EC-LEFTY-03 | PASS | After shooter dies, new shooter's SEVEN_OUT triggers Lefty again. Per-shooter reset confirmed. |
| EC-LEFTY-04 | PASS | Natural on COME_OUT does not trigger Lefty. cascadeEvents empty. |
| HP-PROF-01 | PASS | Prof fires on paired dice. Dice modified. Result re-classified correctly. |
| HP-PROF-02 | PASS | Cooldown = 4 after firing. Prof absent for 4 rolls, then fires again on roll 5. |
| EC-PROF-03 | PASS | Prof fires on pair with no active point (COME_OUT). No crash. Nudges to available value. |
| HP-MECH-01 | PASS | Mechanic fires. Lower die becomes 6. Dice total re-classified. |
| HP-MECH-02 | PASS | Cooldown = 4. Mechanic absent for next 4 rolls. |
| EC-MECH-01 | PASS | [6,6] roll: Mechanic guard prevents firing. cascadeEvents empty. |
| EC-MECH-02 | PASS | Mechanic fires on [1,x]. Lower die (1) → 6 → [6,x]. If x=1, result = SEVEN_OUT. Mechanic in cascade. Shooter dies. |
| HP-MATH-01 | PASS | Hard 6 bet. Soft 6 rolled. Mathlete in cascadeEvents. Hard 6 bet preserved in run.bets after roll. |
| EC-MATH-01 | PASS | SEVEN_OUT with Hard 8 bet. Mathlete absent from cascadeEvents. Bet cleared. |
| EC-MATH-03 | PASS | No hardway bets. Soft 8 rolled. Mathlete does not fire. |
| HP-FW-01 | PASS | SEVEN_OUT with Pass Line. Floor Walker in cascadeEvents. bankrollCents recovers pass line amount. |
| EC-FW-02 | PASS | Natural on COME_OUT. Floor Walker absent from cascadeEvents. Normal Natural payout. |
| EC-FW-01 | PASS | After Floor Walker fires, shooter count decrements. Hype resets to 1.0. |
| HP-REG-01 | PASS | Natural 7 with $10 pass line. The Regular fires. Extra bonus in payout equals pass line amount. |
| HP-REG-02 | PASS | Natural 11 also triggers The Regular. Confirmed. |
| EC-REG-01 | PASS | SEVEN_OUT does not trigger The Regular. |
| HP-BIG-01 | PASS | Hard 8 hit. Big Spender in cascadeEvents. Bonus = 10,000¢ ($100). See OBS-03. |
| EC-BIG-01 | PASS | No hardway bets. Big Spender does not fire. |
| EC-BIG-02 | PASS | Soft 8. Hard 8 bet loses. Big Spender does not fire. |
| HP-SHARK-01 | PASS | POINT_HIT. Shark in cascadeEvents. $100 bonus in payout. |
| EC-SHARK-01 | PASS | Natural does not trigger Shark. |
| EC-SHARK-02 | PASS | SEVEN_OUT does not trigger Shark. |
| HP-WHALE-01 | PASS | Natural. Whale fires. Payout = 1.2× normal Pass Line win. |
| HP-WHALE-02 | PASS | POINT_HIT with Odds. Whale fires. 1.2× multiplier applied to combined payout. |
| EC-WHALE-01 | PASS | SEVEN_OUT. Whale absent. No multiplier. |
| HP-INTERN-01 | PASS | Natural 7. Nervous Intern fires. Hype: 1.0 → 1.2. |
| HP-INTERN-03 | PASS | 3 Naturals. Hype: 1.0 → 1.2 → 1.4 → 1.6. Additive accumulation confirmed. |
| HP-INTERN-04 | PASS | SEVEN_OUT resets Hype to 1.0. Intern does not fire on SEVEN_OUT. |
| EC-INTERN-01 | PASS | POINT_HIT does not trigger Intern. Hype unchanged. |
| HP-HOLLY-01 | PASS | POINT_HIT. Holly in cascadeEvents. Hype: 1.0 → 1.3. |
| HP-HOLLY-02 | PASS | 3 POINT_HITs. Hype: 1.0 → 1.3 → 1.6 → 1.9. Additive accumulation confirmed. |
| HP-HOLLY-03 | PASS | SEVEN_OUT resets Hype to 1.0. Holly absent from cascadeEvents. |
| EC-HOLLY-01 | PASS | Natural does not trigger Holly. |
| HP-UNCLE-01 | PASS | Uncle fires on first roll. Hype increases. Cooldown type is 'none' (see OBS-02). |
| HP-UNCLE-02 | PASS | Uncle did not fire on rolls 2 and 3 (probability-based, not guaranteed cooldown). See OBS-02. |
| HP-UNCLE-03 | PASS | Uncle fires again after multiple rolls. |
| EC-UNCLE-01 | DEFECT | Hype decreases between Uncle triggers observed. See DEF-003. |
| EC-UNCLE-02 | PASS | Uncle fires on SEVEN_OUT roll. cascadeEvents has Uncle. But hype=1.0 after (SEVEN_OUT reset wins). |
| HP-MIMIC-01 | PASS | Mimic alone. No crash. cascadeEvents empty (no prior crew to copy). Game proceeds normally. |
| HP-MIMIC-02 | PASS | Mimic across Natural/POINT_SET/POINT_HIT/SEVEN_OUT. No errors. No unintended effects. |
| HP-OLDPRO-01 | PASS | Reached TRANSITION after marker clear. `run.shooters === 6`. Old Pro +1 shooter bonus confirmed. |
| HP-CHARM-01 | DEFECT | Hype floored to 2.0 ✓. Lucky Charm absent from cascadeEvents ✗. See DEF-004. |
| HP-CHARM-02 | DEFECT | After SEVEN_OUT, hype=1.0 in response (not 2.0). See DEF-005. |
| HP-CHARM-03 | PASS/DEFECT | Hype stays ≥ 2.5 ✓ (no reduction). No cascade event emitted (same root cause as DEF-004 — no-op case, expected silence). |
| EC-CHARM-01 | DEFECT | Same as HP-CHARM-01 — Lucky Charm absent from cascadeEvents on first roll. |

---

*Next run: append below with new timestamp after fixes are applied.*
