# Implementation Manifest: FB-036 The Hierophant Boss Moments

**Design doc:** `docs/design/fb-036-hierophant-boss-moments-design.md`
**Status:** Phases 1–5 done locally (not pushed).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: Escrow facts + barks
1. **Server:** `escrow { heldCents, releasedCents, seizedCents }` on `turn:settled` + HTTP roll in escrow fights; fix the always-0 `tribute` deduction.
2. **Shared:** `BossBarkTrigger` += `tributeSeized | bigOffering | escrowReleased`; `TRIBUTE` case in `deriveBossBarkEvents`; `EVENT_BARK_CHANCE` bigOffering 0.5, escrowReleased 0.3. Input gains `escrow?`.
3. **Config:** Hierophant `barks` (design §4).
4. **Store:** pass escrow facts to `pickBossBark`; keep `lastEscrow { …, key }` for the bowl.
5. **Tests:** event derivation + chances; integration for the escrow payload + tribute deduction.

🛑 **Gate:** play the Hierophant locally.

--- Implemented locally (2026-10-14): server `escrow {heldCents, releasedCents, seizedCents}` (Hierophant + Emissary fights) on turn:settled + HTTP roll; receipt tribute line now real ("The Hierophant: $X tribute"). Shared TRIBUTE events (tributeSeized always; bigOffering ≥ 10% of target, newly, 50%; escrowReleased 30%) + barks incl. win/loss. Store `escrowHeldCents` (hydrated from pendingAdditiveCents) + `lastEscrow {…, key}` for the bowl. Shared 461 tests, integration 124. ---

## Phase 2: The offering bowl
1. **`OfferingBowl`** under the marker progress bar in his fight: candles, bowl, HELD $X rolling digits.
2. Held (coins drop), released (coins rise → RELEASED +$X), seized (flare, ember burn, TRIBUTE −$X).
3. **Audio:** `playCoinChime()`, `playBellToll()`, `playChoirChord()`.
4. Reduced motion.

🛑 **Gate:** can you *see* his rule?

--- Implemented locally (2026-10-14): `OfferingBowl` in MarkerProgress (his marker, not cleared): THE OFFERING, two flickering 🕯️, brass bowl with a coin pile scaled to held / (10% of target), HELD $X animated counter. Fresh rolls only: 🪙 drop in (`playCoinChime('drop')`), 🪙 rise out + RELEASED +$X (`playCoinChime('rise')`); seizure → candles flare + bowl glow (2.6 s), 12 embers, TRIBUTE −$X searing in, `playBellToll()` + `playChoirChord()`. Reduced motion: numbers/labels only. ---

--- Rule change (2026-10-14, after simulation — design §2b): held until a win (Natural / Point Hit), released × Hype, 75% seized on a Seven-Out (Emissary unchanged). Copy + docs updated; integration tests rewritten (126). ---

## Phase 3: The Eye Closes (victory)
1. `BossVictoryCinematicId` += `THE_EYE_CLOSES`; Hierophant `victoryCinematic`; `VICTORY_HOLD_MS_BY_ID` entry.
2. **`TheEyeClosesCinematic`:** giant 👁️ in a candle ring, slow close, candles out in a sweep, doors part, light floods, line.
3. **Audio:** reuse choir/bell; `playDoorsOpen()` (stone rumble + swell).

🛑 **Gate:** beat the Hierophant locally.

--- Implemented locally (2026-10-14): sealed sanctum doors behind a ring of 12 flickering candles; an SVG eye (almond clip, amber iris, lids that really close) opens with a bell toll, its iris looks left/right, then the lids close (0.9 s); candles snuff out one by one with smoke wisps (`playCandleSnuff()` every third); the doors part, warm light floods in (`playDoorsOpen()` rumble + thud, `playChoirChord('major')`), line in the light. ~6.0 s, hold 6.4 s. ---

## Phase 4: The Order Collects (defeat)
1. `BossDefeatCinematicId` += `THE_ORDER_COLLECTS`; Hierophant `defeatCinematic`.
2. **`TheOrderCollectsCinematic`:** hooded silhouettes close in, bankroll drains into the bowl as coins, the eye opens and glows, three bell tolls, candles snuff to black, line.

🛑 **Gate:** lose to the Hierophant locally.

--- Implemented locally (2026-10-14): four hooded silhouettes (CSS) close in from the edges; the bowl in a row of 8 candles; YOUR BANKROLL counts down to $0 as 18 coins stream up into the glowing bowl (six coin clinks); the shut eye opens and burns (pupil narrows, orange glow) with a minor choir; three bell tolls; candles out one by one; fade to black; "The order always collects." in amber (≈2.8 s to read). ~8.3 s, inside the 9 s net. Eye shared as `cinematics/HierophantEye.tsx` (win cinematic refactored onto it). ---

## Phase 5: The Covenant → The Order Protects (FB-029)
1. **DB:** `runs.covenant_spent_marker smallint NULL` (startup `ADD COLUMN IF NOT EXISTS` + Drizzle migration).
2. **Server:** SEVEN_OUT in `computeNextState` keeps the shooter when the Covenant is held and unspent this marker; persist the marker; `covenantSaved: true` on the payload. Remove the 12.5% seizure halving + `covenantActive`.
3. **Client:** "THE ORDER PROTECTS" flash + roll-log note; CompCard copy/icon.
4. **Copy + docs:** config, CompCard, boss_framework, floors, PRD, CLAUDE.md; close FB-029.
5. **Tests:** integration — save once per marker, resets on the next marker, last-shooter save, no save without the comp.

🛑 **Gate:** play a Floor 6+ run with The Covenant.

--- Implemented locally (2026-10-14): `runs.covenant_spent_marker` (integer, nullable; startup ALTER + drizzle/0009); `covenantSaved` computed in rolls.ts (held, unspent at this marker, real Seven-Out not blocked by Lefty) → `computeNextState` keeps the shooter, persisted marker, `covenantSaved: true` on payload + receipt note. Old seizure halving and `BossRuleState.covenantActive` removed. Client: `CovenantFlash` (THE ORDER PROTECTS, bell + major choir), store `_covenantKey`; CompCard 🕯️ + new copy. Integration: 5 Covenant tests (132 total). ---

## Phase 6: Dev Mode + docs
1. **Presets:** keep "Hierophant — big escrow, point on"; add "Hierophant — one win from the eye", "Hierophant — last shooter, point on", "Covenant — Floor 6, fresh".
2. **Docs:** boss_framework (Hierophant moments), CLAUDE.md, backlog (FB-036 + FB-029).

🛑 **Gate:** FB-036 complete → push.
