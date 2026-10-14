# Implementation Manifest: FB-036 The Hierophant Boss Moments

**Design doc:** `docs/design/fb-036-hierophant-boss-moments-design.md`
**Status:** Pending approval.

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: Escrow facts + barks
1. **Server:** `escrow { heldCents, releasedCents, seizedCents }` on `turn:settled` + HTTP roll in escrow fights; fix the always-0 `tribute` deduction.
2. **Shared:** `BossBarkTrigger` += `tributeSeized | bigOffering | escrowReleased`; `TRIBUTE` case in `deriveBossBarkEvents`; `EVENT_BARK_CHANCE` bigOffering 0.5, escrowReleased 0.3. Input gains `escrow?`.
3. **Config:** Hierophant `barks` (design §4).
4. **Store:** pass escrow facts to `pickBossBark`; keep `lastEscrow { …, key }` for the bowl.
5. **Tests:** event derivation + chances; integration for the escrow payload + tribute deduction.

🛑 **Gate:** play the Hierophant locally.

## Phase 2: The offering bowl
1. **`OfferingBowl`** under the marker progress bar in his fight: candles, bowl, HELD $X rolling digits.
2. Held (coins drop), released (coins rise → RELEASED +$X), seized (flare, ember burn, TRIBUTE −$X).
3. **Audio:** `playCoinChime()`, `playBellToll()`, `playChoirChord()`.
4. Reduced motion.

🛑 **Gate:** can you *see* his rule?

## Phase 3: The Eye Closes (victory)
1. `BossVictoryCinematicId` += `THE_EYE_CLOSES`; Hierophant `victoryCinematic`; `VICTORY_HOLD_MS_BY_ID` entry.
2. **`TheEyeClosesCinematic`:** giant 👁️ in a candle ring, slow close, candles out in a sweep, doors part, light floods, line.
3. **Audio:** reuse choir/bell; `playDoorsOpen()` (stone rumble + swell).

🛑 **Gate:** beat the Hierophant locally.

## Phase 4: The Order Collects (defeat)
1. `BossDefeatCinematicId` += `THE_ORDER_COLLECTS`; Hierophant `defeatCinematic`.
2. **`TheOrderCollectsCinematic`:** hooded silhouettes close in, bankroll drains into the bowl as coins, the eye opens and glows, three bell tolls, candles snuff to black, line.

🛑 **Gate:** lose to the Hierophant locally.

## Phase 5: The Covenant → The Order Protects (FB-029)
1. **DB:** `runs.covenant_spent_marker smallint NULL` (startup `ADD COLUMN IF NOT EXISTS` + Drizzle migration).
2. **Server:** SEVEN_OUT in `computeNextState` keeps the shooter when the Covenant is held and unspent this marker; persist the marker; `covenantSaved: true` on the payload. Remove the 12.5% seizure halving + `covenantActive`.
3. **Client:** "THE ORDER PROTECTS" flash + roll-log note; CompCard copy/icon.
4. **Copy + docs:** config, CompCard, boss_framework, floors, PRD, CLAUDE.md; close FB-029.
5. **Tests:** integration — save once per marker, resets on the next marker, last-shooter save, no save without the comp.

🛑 **Gate:** play a Floor 6+ run with The Covenant.

## Phase 6: Dev Mode + docs
1. **Presets:** keep "Hierophant — big escrow, point on"; add "Hierophant — one win from the eye", "Hierophant — last shooter, point on", "Covenant — Floor 6, fresh".
2. **Docs:** boss_framework (Hierophant moments), CLAUDE.md, backlog (FB-036 + FB-029).

🛑 **Gate:** FB-036 complete → push.
