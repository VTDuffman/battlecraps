# Implementation Manifest: FB-040 The Architect — Convergence

**Design doc:** `docs/design/fb-040-architect-convergence-design.md`
**Status:** Phases 1–3 done locally (not pushed).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Commit locally per phase; push when Mike says. After each phase: explicit test steps (Dev presets) + what to look for, including a phone-width check. **All crew/player references gender-neutral.** Big wins, big losses — it's the final boss.

---

## Phase 1: The rule (server + shared + copy)
1. **Refactor** `rolls.ts`: `activeBossRule` → `activeRules: Set<BossRuleType>` + per-rule state accessors (every other boss: `{boss.rule}` + `bossPointHits`, behaviour unchanged — existing boss tests pass untouched).
2. **DB:** `runs.convergence_rooms` (jsonb) + `runs.convergence_state` (jsonb) — startup ALTER + Drizzle migration; reset on every marker entry; set at Architect entry (server-RNG shuffle of the 8 previous bosses; first room's state initialised).
3. **Convergence:** rooms in force = first `sevenOuts + 1`; each room's rule per design §3.1 in the §3.3 order; a Seven-Out (incl. Covenant-saved, TIME'S UP) adds the next room and initialises its state; PIP ends the run; `bossPointHits` cap 7. Retire demolition + load-bearing (`removedCrewSlot`).
4. **Payload + receipt:** `convergence { rooms, added, state }`; each room's facts; "ROOM REBUILT — …".
5. **Dev:** create / jump reset; DevScenario `convergenceRooms` (order) + rooms-in-force (via `bossCounter`) + room state.
6. **Copy:** config (tagline, entry lines, blurb, header text, defeat announcement), floors.ts Floor 9, help section; docs (boss_framework, floors.md, PRD).
7. **Sims:** keep `architect-convergence-sim.mjs`; switch `gauntlet-economy-sim.mjs`'s Architect to stacking-random.
8. **Tests:** integration — rooms drawn at entry and persisted; first room in force; a Seven-Out adds the next room (and a Covenant-saved one); stacked interactions (Emissary lag + Hierophant escrow; Le Prix + blackout; Foreman skim after the Executive bonus; High Tide + Covenant); PIP ends the run; clears on bankroll; old boss fights unchanged.

--- Implemented locally (2026-10-17): shared `convergence.ts` (room markers, shuffle, rooms in force, per-rule counters, `enterRoom`, `advanceRuleCounter`). `runs.convergence_rooms` / `convergence_state` (startup ALTER + drizzle/0011). `rolls.ts` refactored onto `rulesInForce` (`ruleOn` / `paramsFor` / `counterOf`; Le Prix's cascade hook + the Foreman's skim hook per room) — every existing boss test passes untouched; demolition, load-bearing and `removedCrewSlot` retired; counter cap 7. Rooms drawn on the pub exit (`recruit.ts`, returns `convergence`), on dev create/jump (`convergenceRooms` prefix + `convergenceState` overrides), with a first-roll fallback; GET /runs returns rooms in force + state. Payload `convergence { rooms, added, state }`; receipt "ROOM REBUILT — …". Copy: tagline, entry lines, blurb, header text, defeat announcement ARCHIVED, flavour, floors.ts Floor 9. Docs: boss_framework, floors.md, CLAUDE.md constraint. Preset "Architect — three rooms stacked" (Sarge + Executive + Emissary) replaces the demolition one. Tests: 10 integration (draw, pub exit, Sarge timeout builds a room, no room without a 7-out, Covenant still builds, stacked PIP, Foreman skim, Le Prix charm, clear resets, no demolition) + the Vig receipt + 6 shared. Integration 177, shared 504. **Deferred to Phase 7:** `gauntlet-economy-sim.mjs` still models the old demolition at marker 26 (`architect-convergence-sim.mjs` is the tuning tool). Order note: the Foreman skim applies before the Executive bonus (existing order). ---

🛑 **Gate:** play The Architect locally (Dev presets).

## Phase 2: The table — rooms rail + trackers in his fight
1. Store: rooms in force + room state from the payload; hydration.
2. Trackers read room-scoped state in his fight (a hook for active rules + per-rule counters) — Sarge's clock, the tide, the meter, the charm, the bowl, the orbit, the signal; TideWater / CharmTrap / crew blackout / Covenant flash work with any room.
3. `BossTableWell` for CONVERGENCE: the rooms rail (8 tiles — lit with live readouts, "?" blueprints for unbuilt rooms) + the newest room's tracker.

--- Implemented locally (2026-10-17): store `convergenceRooms` / `convergenceState` / `lastConvergence` from the payload, the pub exit (`recruit` → `convergence`; Le Prix / Executive first rooms handled) and hydration (GET /runs, dev reconnect; `bossDisplayFromCounter` restores the rating / charm from the rooms). Client `lib/bossRules.ts` (`isRuleOn` / `ruleCounter` / `paramsOfRule`) mirrors the server's rules in force — used by Sarge's clock, the tide dial + water, Dead Calm, the meter fallback, the crew blackout, the Commander's muffled crowd + guttering flames. A Seven-Out that builds Le Prix's room charms from the room's counter and flies the heart. Trackers registry moved to `tableTrackers.ts` (`BOSS_TRACKERS`; `ROOM_TRACKERS` swaps the Foreman's register for `ForemanSkim` — "−20% OF EVERY WIN", ka-ching on each skim; server adds `skimCents` to the convergence payload). `ConvergenceTable` (360×250): the rooms rail (8 tiles — lit with sigil + live readout, newest glows; "?" blueprint tiles for unbuilt rooms) + the newest room's tracker full width (re-keyed per room). Header: "CONVERGENCE · ROOM n / 8 · +1 ON 7-OUT · THEY STACK" replaces "N CREW LEFT". Note: Le Prix's glass only shows while hers is the newest room — otherwise her tile shows the charmed crew and the heart flies via her name (the FB-034 fallback). ---

🛑 **Gate:** each room shows and behaves; desktop + phone.

## Phase 3: The rebuild
1. The felt / theme follows the newest room's floor (theme override over Floor 9; header stays The Architect's).
2. The rebuild animation on each new room (and the first at entry): blueprint dissolve → tile lights → room redraws; drafting / construction sound.

--- Implemented locally (2026-10-17): store `convergenceThemeRoom` (+ `setConvergenceThemeRoom`) — the room the table is dressed as; a newly built room is dressed by the rebuild at its peak, a reload restores the newest room, cleared with the fight. `selectTableMarkerIndex` (lib/bossRules) drives `useFloorTheme` (felt, texture, accents, flashes), the Null Space greyscale (App) and its text colours (TableBoard / BettingGrid / DiceZone), the crowd's Null Space handling, and the floor music (each room brings its floor's track). The boss header keeps The Architect's own Null Space styling. `RoomRebuild` (portaled, z-95, non-blocking): cyan blueprint grid, pen strokes drawing the table's outlines, a scan line; at ~0.9 s the room locks in (`playBlueprintRebuild` — pen scratches, a drafting sweep, a clunk, a shimmer) and the table is re-dressed under the blueprint; the room's card (sigil, ROOM n / 8, name, rule line); dissolves by 2.4 s. Plays on each Seven-Out that builds a room, and for the first room once nothing else is playing (after his entry cinematic). Reduced motion: dressed at once. ---

🛑 **Gate:** watch several rebuilds.

## Phase 4: Barks
The Architect's per-room rebuild lines (always) + generic; echo barks of each room's own events in that boss's voice (glitched, attributed); win / loss by chance. Tests.

## Phase 5: THE PATTERN BREAKS (victory)
Investigate the hand-off to the gauntlet victory sequence first. Rooms flash past in reverse, the grid tears, the space folds to white, his line; then the victory sequence.

## Phase 6: ARCHIVED (defeat)
The table becomes a blueprint, rolls up, ARCHIVED · RUN #N stamp, filed in a drawer that shuts; "Filed. I'll build the next one from you."

## Phase 7: Dev Mode + docs
Presets: "Architect — first room", "Architect — three rooms stacked", "Architect — one win from the end", "Architect — last shooter, rooms stacked". Docs: boss_framework, CLAUDE.md (rewrite the CONVERGENCE constraint), backlog.

🛑 **Gate:** FB-040 complete → push.
