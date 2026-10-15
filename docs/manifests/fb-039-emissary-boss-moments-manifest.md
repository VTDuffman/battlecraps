# Implementation Manifest: FB-039 The Emissary Boss Moments

**Design doc:** `docs/design/fb-039-emissary-boss-moments-design.md`
**Status:** Phase 1 done locally (not pushed).

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

## Phase 3: The transmission line
Front and center: crew → receiver line, packets in transit, landing pops, static + dark rail + NO SIGNAL countdown, CONTACT RESTORED.

## Phase 4: Message Received (victory)

## Phase 5: Translated (defeat)

## Phase 6: Dev Mode + docs
Presets: "Emissary — signal in transit, point on", "Emissary — blackout (3 rolls left)", "Emissary — one win from contact", "Emissary — last shooter, point on". Docs: boss_framework, CLAUDE.md, backlog.

🛑 **Gate:** FB-039 complete → push.
