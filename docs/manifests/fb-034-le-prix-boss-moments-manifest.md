# Implementation Manifest: FB-034 Mme. Le Prix Boss Moments

**Design doc:** `docs/design/fb-034-le-prix-boss-moments-design.md`
**Status:** Phases 1–3 done locally (not pushed).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite if the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.**

---

## Phase 1: Barks
1. **Shared:** `BossBarkTrigger` += `charmed | charmFired`; `deriveBossBarkEvents` `DISABLE_CREW` case (charmFired > charmed-slot-changed). Input gains `charmFired?`, `charmedSlotBefore?`, `charmedSlotAfter?`.
2. **Config:** Le Prix `barks` (design §3).
3. **Store:** pass the charm facts from the settlement.
4. **Tests:** event priority; neutral copy.

🛑 **Gate:** play Le Prix locally.

--- Implemented locally (2026-10-13): `EVENT_BARK_CHANCE` (charmed 50%, never over a showing bark, skip = silence) so she stays quiet despite re-charming most come-outs; charmFired always barks. Added a test that scans every boss bark for gendered words. ---

## Phase 2: The heart's flight
1. **`CharmFlight` overlay** (portal): measures old portrait → her name → new portrait; heart arcs between them; fires when the charmed slot changes (incl. the entry charm reveal after the boss intro).
2. **Pink glow** on the charmed portrait.
3. **Audio:** `playHarpGlissando()`.
4. Reduced-motion cross-fade.

🛑 **Gate:** does watching her choose feel good?

--- Implemented locally (2026-10-13): store `charmFlight {from,to,key}` set when the ❤️ settles on a new slot (turn:settled, or clearCharmingSlot after OOH LA LA / the entry charm); the destination portrait holds its ❤️ until `finishCharmFlight()` (3s safety net), then pops it in. `CharmFlight` samples quadratic arcs old portrait → `[data-boss-name-anchor]` → new portrait with a 💗 trail. The pink `charm-glow` pulse replaces the gold ready-pulse on the charmed portrait. ---

--- Playtest follow-up (2026-10-13): the "OOH LA LA!" bubble + arpeggio felt cheap next to the flight. Replaced by the **charm heartbeat** on the crew who was actually blocked (old charmed slot): swell, two pink beats, a drifting 💗, and `playCharmDaze()` (detuned Fmaj9 pad that sags flat + descending chimes; may revisit). Entry charm = the flight alone. ---

## Phase 3: The rose (victory)
1. `BossVictoryCinematicId` += `THE_ROSE`; Le Prix `victoryCinematic`.
2. **`TheRoseCinematic`:** rose arcs in, lands/bounces, petals scatter, line (~4 s, within `VICTORY_HOLD_MS`).
3. **Audio:** `playHarpFlourish()`.

🛑 **Gate:** beat Le Prix locally.

--- Implemented locally (2026-10-13): rose thrown from the upper left (1.4 s, lazy spin, bounce, settles at −28°), six CSS petals pop off on landing, `playHarpFlourish()` (two-octave sweep + rolled C-major chord) at 600 ms, her line in Georgia italic at 1.8 s, fade 3.9 s, finish 4.2 s (within VICTORY_HOLD_MS 4.9 s). Reduced motion: rose fades in, no petals. ---

## Phase 4: She takes the crew (defeat)
1. `BossDefeatCinematicId` += `SHE_TAKES_THE_CREW`; Le Prix `defeatCinematic`.
2. **`SheTakesTheCrewCinematic`:** hearts bloom on each real crew portrait (measured from the rail), portraits drift up toward her name and fade one by one, lipstick kiss presses onto the screen, line (~6 s).
3. **Audio:** `playKissMwah()` (+ reuse `playStampThud`).

🛑 **Gate:** lose to Le Prix locally.

## Phase 5: Dev Mode + docs
1. **Presets:** "Le Prix — fresh fight", "Le Prix — last shooter, point on".
2. **Docs:** boss_framework (Le Prix moments), CLAUDE.md, backlog.

🛑 **Gate:** FB-034 complete → push.
