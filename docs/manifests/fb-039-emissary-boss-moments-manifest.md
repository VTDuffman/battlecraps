# Implementation Manifest: FB-039 The Emissary Boss Moments

**Design doc:** `docs/design/fb-039-emissary-boss-moments-design.md`
**Status:** Pending approval.

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

## Phase 2: Barks
`signalLost`, `contactRestored` always; `received` 30%; win/loss by chance. Tests.

## Phase 3: The transmission line
Front and center: crew → receiver line, packets in transit, landing pops, static + dark rail + NO SIGNAL countdown, CONTACT RESTORED.

## Phase 4: Message Received (victory)

## Phase 5: Translated (defeat)

## Phase 6: Dev Mode + docs
Presets: "Emissary — signal in transit, point on", "Emissary — blackout (3 rolls left)", "Emissary — one win from contact", "Emissary — last shooter, point on". Docs: boss_framework, CLAUDE.md, backlog.

🛑 **Gate:** FB-039 complete → push.
