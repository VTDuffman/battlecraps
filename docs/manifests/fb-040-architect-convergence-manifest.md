# Implementation Manifest: FB-040 The Architect — Convergence

**Design doc:** `docs/design/fb-040-architect-convergence-design.md`
**Status:** Not started.

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

🛑 **Gate:** play The Architect locally (Dev presets).

## Phase 2: The table — rooms rail + trackers in his fight
1. Store: rooms in force + room state from the payload; hydration.
2. Trackers read room-scoped state in his fight (a hook for active rules + per-rule counters) — Sarge's clock, the tide, the meter, the charm, the bowl, the orbit, the signal; TideWater / CharmTrap / crew blackout / Covenant flash work with any room.
3. `BossTableWell` for CONVERGENCE: the rooms rail (8 tiles — lit with live readouts, "?" blueprints for unbuilt rooms) + the newest room's tracker.

🛑 **Gate:** each room shows and behaves; desktop + phone.

## Phase 3: The rebuild
1. The felt / theme follows the newest room's floor (theme override over Floor 9; header stays The Architect's).
2. The rebuild animation on each new room (and the first at entry): blueprint dissolve → tile lights → room redraws; drafting / construction sound.

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
