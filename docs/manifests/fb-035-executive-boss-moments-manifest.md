# Implementation Manifest: FB-035 The Executive Boss Moments

**Design doc:** `docs/design/fb-035-executive-boss-moments-design.md`
**Status:** Phases 1–3 done locally (not pushed).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite if the server changes) before a phase is done. Push when Mike says (bundled with the Floor 4 rename). **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: Barks → shared system
1. **Server:** `turn:settled` gains `exceptionalBonusCents` (the +15% actually paid; omitted when 0).
2. **Shared:** `BossBarkTrigger` += `promoted | finalWarning | bonusPaid | ratingUp | ratingDown`; `deriveBossBarkEvents` `CROSS_CALIBRATION` case; `EVENT_BARK_CHANCE` += bonusPaid 0.5, ratingUp 0.4, ratingDown 0.4. Input gains `ratingBefore?`, `ratingAfter?`, `exceptionalBonusCents?`.
3. **Config:** Executive `barks` (design §3).
4. **Store / header:** pass the rating facts to `pickBossBark`; remove `EXECUTIVE_BARKS_*`, `executiveBark`, `clearExecutiveBark` and the header bubble.
5. **Tests:** event priority + chances; neutral copy (existing guard).

🛑 **Gate:** play the Executive locally.

--- Implemented locally (2026-10-14): server `exceptionalBonusCents` on turn:settled + HTTP roll; shared CROSS_CALIBRATION events (promoted > finalWarning > bonusPaid > ratingUp/Down); legacy EXECUTIVE_BARKS_*, executiveBark, clearExecutiveBark and the header bubble removed. Shared 450 tests, API integration 121. ---

## Phase 2: The performance meter
1. **`PerformanceMeter`** under the marker progress bar in his fight: 5-step scale, sliding marker, labels; replaces the header PERF REVIEW text.
2. Exceptional gold glow + "+15% · $X" pop (from `exceptionalBonusCents`); Action Required red alarm pulse + FINAL WARNING.
3. **Audio:** `playReviewTick()` per step, `playPromotionDing()`.
4. Reduced motion.

🛑 **Gate:** does the rating feel like the fight?

--- Implemented locally (2026-10-14): `PerformanceMeter` inside MarkerProgress (his marker, not cleared); spring-sliding ▼ marker over five coloured segments + short labels; rating label pops on change; Exceptional gold glow + "★ +15% ON EVERY WIN", bonus pop "+15% · $X" from store `exceptionalBonus {cents,key}`; Action Required `review-alarm` pulse + "⚠ FINAL WARNING — ONE MORE BAD ROLL". Audio: `playReviewTick(steps)` (keyboard clack), `playPromotionDing()`, `playReviewWarning()` (low double buzz — added). Header PERF REVIEW text removed. ---

## Phase 3: The nameplate swap (victory)
1. `BossVictoryCinematicId` += `NAMEPLATE_SWAP`; Executive `victoryCinematic`; `VICTORY_HOLD_MS_BY_ID` entry.
2. **`NameplateSwapCinematic`:** door + brass plate, screws spin out, plate falls (clang), THE SHOOTER slides in with a glint, ticker tape, line.
3. **Audio:** `playPlateClang()`, `playOfficeFanfare()`.

🛑 **Gate:** beat the Executive locally.

--- Implemented locally (2026-10-14): mahogany CORNER OFFICE door; three screws spin out (keyboard-clack ticks), plate tips on the top screw, falls, `playPlateClang()` (inharmonic clang + bounce); THE SHOOTER slides in, lands with `playOfficeFanfare()` (bell arpeggio → held chord), gold glint ×2, 46 ticker-tape strips; line in Georgia italic. ~5.9 s, hold 6.3 s. ---

## Phase 4: Terminated (defeat)
1. `BossDefeatCinematicId` += `TERMINATED`; Executive `defeatCinematic`. Store passes `pipTermination` into `pendingDefeat` (memo variant).
2. **`TerminatedCinematic`:** pink memo slides in, TERMINATED slams (thud + jolt), banker's box, real crew portraits drop in (measured from the rail), lid shuts, box slides off, line.
3. **Retire `PinkSlipModal`** (App.tsx mounts, `clearPipTermination`).
4. **Audio:** reuse `playStampThud`; `playBoxThump()`.

🛑 **Gate:** lose to the Executive both ways (PIP + last-shooter seven-out).

## Phase 5: Dev Mode + docs
1. **Presets:** keep "one bad roll from PIP" / "Exceptional streak"; add "Executive — one win from the corner office", "Executive — last shooter, point on".
2. **Docs:** boss_framework (Executive moments), CLAUDE.md (Pink Slip note, current state), backlog.

🛑 **Gate:** FB-035 complete → push (with the Floor 4 rename).
