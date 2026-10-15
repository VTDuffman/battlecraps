# Implementation Manifest: FB-039 The Emissary Boss Moments

**Design doc:** `docs/design/fb-039-emissary-boss-moments-design.md`
**Status:** Complete (2026-10-14).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: Signal lag + blackout (server + rule copy)
1. **Config:** `TRANSMISSION_DELAY` params → `{ blackoutRolls: 6 }`.
2. **DB:** columns for what's in transit (cash cents, hype, multipliers) and the blackout counter (startup `ADD COLUMN IF NOT EXISTS` + Drizzle migration); reset on marker entry.
3. **Server:** hold this roll's crew additives / hype gain / multipliers; land last roll's; on a Seven-Out drop everything and set the blackout; while dark, the cascade runs with no crew; replace the old escrow path for him. `signal` facts on the payload; receipt lines.
4. **Client (minimal):** header readout of transit / NO SIGNAL — n until the transmission line (Phase 3).
5. **Copy:** ruleBlurb (drop the naturals leftover), ruleHeaderText, entryLines, floor intro/teaser; docs.
6. **Tests:** integration — effects land next roll, Seven-Out drops transit + sets blackout, crew don't fire while dark, contact returns after 6, marker clear pays what's in transit, Lefty/Covenant interplay.

🛑 **Gate:** play the Emissary locally.

--- Implemented locally (2026-10-14): `runs.signal_transit` (jsonb) + `runs.signal_dark_rolls` (startup ALTER + drizzle/0010). rolls.ts: blackout runs the cascade with no crew (cooldowns untouched); after the Vig the crew's additives / Hype gain / multipliers are swapped for last roll's landed packet (`viggedContext`), this roll's go into transit; a Seven-Out drops all and sets 6 dark rolls; a marker clear pays the cash in transit (also on the ADVANCE clear); old TD escrow retired. `signal` payload; receipt notes (`buildRollReceipt` 6th param). Client: store `signalDarkRolls` / `lastSignal`, hydration, header readout. Dev create/jump reset the signal. Copy + docs. Integration 151 (6 new). ---

## Phase 2: Barks
`signalLost`, `contactRestored` always; `received` 30%; win/loss by chance. Tests.

--- Implemented locally (2026-10-14): shared TRANSMISSION_DELAY events + bracketed lines; store passes `signal`. Shared 483 tests. ---

## Phase 3: The transmission line
Front and center: crew → receiver line, packets in transit, landing pops, static + dark rail + NO SIGNAL countdown, CONTACT RESTORED.

--- Implemented locally (2026-10-14): `TransmissionLine` (CREW 👥 → TABLE 🎲 over a scrolling green sine wave; "IN TRANSIT +$X · +0.30×" packet mid-line; "RECEIVED …" pop + `playSignalPing()`; on a 7-out red static line, "SIGNAL LOST" + `playStaticBurst()`, "NO SIGNAL · n"; "CONTACT RESTORED" + `playContactRestored()`). The crew rail greys out under scanline static + NO SIGNAL while dark. Header readout removed. ---

## Phase 4: Message Received (victory)

--- Implemented locally (2026-10-14): `MessageReceivedCinematic` (`MESSAGE_RECEIVED`, hold 8.8 s). Dark screen, faint falling green/magenta glyph columns + scanlines; "◌ INCOMING TRANSMISSION" flickers in (`playIncomingTransmission()`); his line appears as cycling alien glyphs and decodes left to right over ~3 s (`playDecodeTick()` every 3rd character); "▣ MESSAGE RECEIVED" locks in with a chord (`playMessageReceived()`) and "— THE EMISSARY"; fades at 8.0 s. Reduced motion: no rain, the line shows decoded. ---

## Phase 5: Translated (defeat)

--- Implemented locally (2026-10-14): `TranslatedCinematic` (`TRANSLATED`, line "[Translation complete. You will be studied.]"). Green-dark dim + scanlines; the bankroll and each crew portrait (measured from the rail, then hidden) dissolve into glyph clusters with a flash + `playGlyphDissolve()`, and the felt flickers with loose glyph motes; a green tractor beam opens (`playTractorBeam()` — pulsing hum + rising theremin tone) and every glyph is drawn into it and up; the beam snaps shut, a sea of untranslatable glyphs fills the screen (`playTranslationComplete()`), then "▣ TRANSLATED" + the line. ~8.3 s, under the 9 s safety net. Reduced motion: no flights. ---

## Phase 6: Dev Mode + docs
Presets: "Emissary — signal in transit, point on", "Emissary — blackout (3 rolls left)", "Emissary — one win from contact", "Emissary — last shooter, point on". Docs: boss_framework, CLAUDE.md, backlog.

--- Implemented (2026-10-14): DevScenario `signalTransitCents` / `signalTransitHype` / `signalDarkRolls` (Emissary marker only; nothing in transit while dark; carried through the Scenario Builder); the four presets (34 total). Docs: boss_framework Emissary moments + test-plan rows (and stale Commander rows), CLAUDE.md, backlog FB-039 → Implemented. ---

🛑 **Gate:** FB-039 complete → push.
