# BattleCraps — CLAUDE.md

## Project Overview
Roguelike Craps game: 27-marker gauntlet (9 floors × 3 markers + boss). Players recruit a 5-slot crew whose abilities cascade each turn to modify dice, payouts, and hype multipliers. Entering beta — all alpha defects resolved.

**Tech Stack:** React 18 + TypeScript 5 + Vite 5 + Zustand | Fastify + Socket.io | PostgreSQL + Drizzle ORM | npm workspaces monorepo

---

## Build / Test Commands

```bash
# Root (runs all workspaces)
npm run dev          # shared watcher + API :3001 + web :5173 (concurrently)
npm run build        # compile all workspaces in dependency order
npm run typecheck    # tsc --noEmit across all workspaces
npm run test         # vitest on packages/shared only

# Database
npm run db:migrate   # apply pending migration files (safe — never generates DROP)
npm run db:generate  # snapshot schema changes into a new migration file (run before db:migrate)
npm run db:seed      # seed crew + boss config
npm run db:studio    # Drizzle Studio live inspector

# ⚠️  NEVER run: npm run db:push-unsafe  (drizzle-kit push — can DROP tables and wipe data)

# Per-workspace (from workspace root)
npm run test:watch -w @battlecraps/shared   # vitest watch mode
```

No lint or format config (no .eslintrc, no .prettierrc).

---

## Architecture

```
packages/shared/src/          # Pure-function game engine — zero runtime deps
  types.ts                    # Source of truth: GamePhase, RollResult, TurnContext, CrewMember, Bets, LeaderboardEntry
  crapsEngine.ts              # classifyRoll(), settleTurn(), payout calculators
  cascade.ts                  # resolveCascade() — sequential crew execute() calls, emits CascadeEvents
  config.ts                   # GAUNTLET[27], boss rules, comp perks, getMaxBet(), getMinBet(), RARITY_COST_MULTIPLIERS, getCrewHireCost()
  floors.ts                   # FloorConfig, FLOORS registry, TransitionType, CelebrationSnapshot — floor narrative/display data
  crew/                       # 30 execute() implementations + index.ts registry (IDs 1–15 unlock-gated; 16–30 Starter)
  bossRules/                  # Boss rule hook implementations: extortionFee.ts, risingMinBets.ts, disableCrew.ts, tribute.ts, tidalSurge.ts, orbitalDecay.ts, firstContactProtocol.ts, convergence.ts, types.ts, index.ts

apps/api/src/                 # Fastify backend
  server.ts                   # Fastify + Socket.io setup, route registration
  routes/auth.ts              # POST /auth/provision (upsert Clerk user), POST /auth/tutorial-complete
  routes/rolls.ts             # POST /runs/:id/roll — main game loop (RNG → cascade → settle → persist → emit → unlock eval)
  routes/recruit.ts           # POST /runs/:id/recruit (unlock-gated)
  routes/mechanic.ts          # POST /runs/:id/mechanic-freeze
  routes/runs.ts              # GET/POST /runs/:id — full run state (page refresh recovery) + create
  routes/crew.ts              # GET /crew
  routes/crewRoster.ts        # GET /crew-roster — availability-filtered 30-crew roster per user
  routes/leaderboard.ts       # GET /leaderboard?view=global|personal + internal submitLeaderboardEntry()
  routes/reorder.ts           # POST /runs/:id/crew/reorder — crew rail drag-and-drop persistence
  routes/dev.ts               # FB-028 Developer Mode: POST/PATCH /dev/runs, /jump, /force, /dev/account/* (allowlist-gated)
  db/schema.ts                # Drizzle schema: users, runs (JSONB bets + crew_slots), crewDefinitions, leaderboardEntries
  lib/clerkAuth.ts            # Clerk JWT verification middleware
  lib/devAuth.ts              # isDevClerkId() / requireDevUser — DEV_MODE_ENABLED + DEV_CLERK_IDS allowlist (404 for others)
  lib/crewRegistry.ts         # Maps crew IDs → live CrewMember objects (with execute()); used to hydrate stored slots
  lib/io.ts                   # Shared Socket.io instance accessor
  lib/resolveUser.ts          # Resolves Clerk JWT → DB user row (shared across routes)
  lib/rng.ts                  # Crypto RNG with rejection sampling (no modulo bias)
  lib/unlocks.ts              # evaluateUnlocks() — all 15 unlock conditions, emits unlocks:granted

apps/web/src/                 # React SPA
  store/useGameStore.ts       # Zustand: all game state + socket listeners + cascade queue
  App.tsx                     # Auth shell → TitleLobbyScreen → KnowledgeGate → TutorialOverlay → TransitionOrchestrator (wraps TableBoard)
  contexts/TutorialContext.tsx # Tutorial state machine context (beat index, spotlight target, path)
  global.d.ts                 # Window.Clerk global type declaration
  components/                 # TableBoard, BettingGrid, DiceZone, CrewPortrait, RollLog, ChipRain, CompCardFan,
                              #   BossEntryModal, BossRoomHeader, PerformanceMeter, CompCard, FloorEmblem, UnlockModal,
                              #   TitleLobbyScreen, UnlockNotification, VersionDisplay, ReleaseNotesModal,
                              #   LeaderboardScreen, LeaderboardEntry,
                              #   GameOverScreen, PubScreen + tutorial/ subtree (TutorialOverlay, KnowledgeGate,
                              #   SalDialog, SalPortrait, SpotlightMask, HowToPlayScreen + 3 section components)
  transitions/phases/         # 13 cinematic phases: TitleScreen, MarkerIntro, MarkerCelebration, FloorReveal,
                              #   FloorRevealConfirm, BossEntry, BossEntryDread, BossVictory, BossVictoryComp,
                              #   UnlockRecap, VictoryExplosion, VictoryRecap, VictorySendoff
  hooks/                      # useAnimatedCounter, useFloorTheme, useCrowdAudio, useTutorialSpotlight, useParticleEmitter
  lib/floorThemes.ts          # Nine floor theme objects (exposed / gritty / elegant / electric / occult / ancient / cosmic / alien / digital)
  lib/socket.ts               # Socket.io client singleton
  lib/tutorialBeats.ts        # Tutorial beat definitions (step data for TutorialOverlay)
```

**Audio system (`useCrowdAudio`):** Fully synthesized via Web Audio API — no asset files. `AudioContext` is lazy-created on first flash event (satisfies browser autoplay policy). Mute state persisted to `localStorage` (`bc_muted`). Current stings: crowd cheer (win flash), crowd groan (lose flash), dice rattle on throw.

```
```

**Key constraints:**
- All money in integer cents throughout (suffix `Cents` where ambiguous)
- Crew cascade is immutable: each `execute()` receives and returns a full `TurnContext` copy
- All game logic (RNG, payouts, cascade) is server-side only — client never sees pre-settlement state
- WebSocket (`cascade:trigger`, `turn:settled`, `unlocks:granted`) drives UI animation sequencing and unlock notifications
- **Crew rail DnD** — `sensors=[]` (empty) when `isRolling || isCascading`; `useSortable` is `disabled` on empty slots. `slotIds` in Zustand tracks visual order for `SortableContext`; `reorderCrew` derives the server permutation mathematically (not via `findIndex`) to avoid null-equality collisions on empty slots.
- **Particle canvas** (`useParticleEmitter`) must be rendered **unconditionally via `createPortal` to `document.body`** in DiceZone — never gate it on hypeTier. Conditional unmounting breaks the `canvasRef` and kills the rAF loop.
- **DiePlaceholder** components must be **explicitly rendered** in the false branch of the `showingDice` conditional in DiceZone. The `showingDice` variable falls back to `displayDice` (never null), so the false branch is currently unreachable — but it must remain in place for correctness if that invariant ever changes.
- **Dynamic crew pricing** (FB-023) — `baseCost` has been removed from `CrewMember`. Hire cost is computed at recruit time via `getCrewHireCost(rarity, clearedMarkerTargetCents)` in `config.ts`. The `/crew-roster` response includes `hireCostCents`; client always reads from that field, never computes independently.
- **Dynamic additive scaling** (FB-024) — `markerTargetCents` is injected into `TurnContext` by `rolls.ts` before the cascade runs. Additive crew use `Math.round(ADDITIVE_MULT * Math.floor(ctx.markerTargetCents * 0.10) / 100) * 100` for floor-scaled bonuses.
- **CONVERGENCE boss** (`bossPointHits` dual-use) — for The Architect (Floor 9), `bossPointHits` tracks seven-out count (not point hits). Increments on SEVEN_OUT (capped at 5), held on POINT_HIT. Each SEVEN_OUT permanently nulls ONE crew slot — the last `CascadeEvent.slotIndex`, else the highest occupied active slot — and emits `removedCrewSlot` so the client clears the rail. There is **no** cascade-order hook (the old shrinking `[0..4−N]` window was removed 2026-10-13 — it cost players two crew per seven-out). Load-bearing: additives × 0.85^N.
- **Boss counter (`bossPointHits`, DB `boss_roll_count`)** means something different per rule: Sarge clock rolls used, Le Prix charmed slot, Executive rating, Sovereign tide stage, Architect seven-outs. `validateBet` hooks (Sovereign only) run on the **come-out only** and can only reject.
- **Sarge's Double Time clock (FB-030)** — the timeout converts a blank to SEVEN_OUT *after* the cascade and clears crew save flags, so Lefty/Floor Walker/Lucky Charm never rescue a timeout. Sent to the client as `clockExpired`.
- **Payoff markers (FB-032, The Foreman)** — `getBossPayoffCents(markerIndex)` is non-null for a marker cleared by paying the boss off, never by bankroll. **All marker-clear decisions go through `clearsMarker()` in `computeNextState` plus the pre-roll auto-clear in `rolls.ts`** — never add a new `bankroll >= MARKER_TARGETS[i]` clear check. The Cut lives in `runs.boss_progress_cents` (reset on every marker entry) and reaches the client as `bossCut`; client bankroll-ADVANCE / auto-collect are disabled on payoff markers.
- **Boss defeat cinematics (FB-032)** — a boss with `defeatCinematic { id, line }` in `config.ts` gets a signature loss moment: on a run-ending roll at that boss (not the final victory) the store sets `pendingDefeat` and **holds the GAME_OVER status flip** until the cinematic calls `finishDefeatCinematic()` (9s safety timeout). Components live in `components/defeat/` and register in `DEFEAT_CINEMATICS`; `DefeatCinematicHost` (in TableBoard) renders them input-blocking. Dev Panel → Preview → Defeat replays one. The Executive's PIP termination is the PIP variant of his TERMINATED cinematic (`pendingDefeat.pipTermination`; the old PinkSlipModal was retired in FB-035).
- **Boss victory moments (FB-033)** — `victoryCinematic { id, line }` in `config.ts`; the clearing roll sets `pendingVictory` and `celebrationHoldUntil`. **Every celebration hand-off timer goes through `celebrationDelay()`** (savor ×3, ADVANCE fast path, safety nets) — never add a raw `setTimeout` hand-off. Each cinematic gets its own hold in `VICTORY_HOLD_MS_BY_ID` (store) — keep it within that. Components in `components/victory/` (registry + host in TableBoard). The Foreman's PAID IN FULL uses the same hold (`PAYOFF_HOLD_MS`). **Bark events:** a boss's own moments go in `deriveBossBarkEvents()` (shared `bossBarks.ts`) — they always bark; win/loss stay chance-based.
- **Pub draft is saved per visit** (`runs.pub_draft`, KI-080/081) — generated once by `GET /runs/:id/pub-draft`, returned unchanged on refresh, cleared on recruit/skip (and dev jump). `recruit.ts` only accepts crew in the saved draft. Never make the draft endpoint re-roll.
- **Crew-bonus escrow** (Hierophant `TRIBUTE`, Emissary `TRANSMISSION_DELAY`) — `pending_additive_cents` holds a roll's crew additives until the next roll. On SEVEN_OUT the whole escrow (previous + this roll) settles at once (25% seized / 100% evaporates); on a marker-clearing roll the held amount is paid out.
- **Player-facing copy has several sources of truth — keep them in step with the code:** boss/comp copy in `config.ts` (`ruleBlurb`, `ruleHeaderText`, `entryLines`, `compDescription`, `barks`) plus `CompCard.tsx` `COMP_DEFS`; floor narrative in `floors.ts` (boss titles must match `config.ts`); crew copy in `apps/api/src/db/seed.ts` (re-seeded on every Render deploy) **and** separately in `CrewPortrait.tsx` tooltips; help in `components/tutorial/sections/`; Sal in `lib/tutorialBeats.ts`. When a mechanic changes, grep all of these.
- **Gender-neutral copy** — player-facing references to the **player or crew** use neutral language ("this one", "they/them", "kid", "soldier"); the crew includes all genders (e.g. Hype-Train Holly). Bosses are written characters and keep their own pronouns.
- **`compReward: 'NONE'` sentinel** — Floor 9 boss awards no comp. `BossVictoryCompPhase` calls `onAdvance()` immediately via `useEffect` (never during render). All comp-read sites must guard `boss.compReward !== 'NONE'`.
- **Boss entry state** — every marker-entry write uses `getBossEntryCounter(markerIndex)` (shared `config.ts`; Executive starts at rating 2). A stored `bossPointHits` of 0 always means Action Required — never reintroduce a "treat 0 as 2" guard (that broke PIP termination). Le Prix's entry charm comes from shared `pickEntryCharmSlot()`.
- **Developer Mode (FB-028)** — gated server-side by `DEV_MODE_ENABLED=true` + `DEV_CLERK_IDS` (Render + local `apps/api/.env`). Clerk Development and Production instances give the same person **different user IDs**; prod's is `window.Clerk.user.id` on battlecraps.com. Dev runs (`runs.is_dev_run`) skip leaderboard, unlocks, `maxBankrollCents` and `highestMarkerReached` — any new side effect that outlives a run must also check `isDevRun`. `cheat_dice` is honoured only for the tutorial or a dev on a dev run. Scenario model + presets live in shared `devScenario.ts` / `devScenarios.ts`; all dev UI is lazy-loaded under `components/dev/`.
- **Money columns are BIGINT** — `bankroll_cents`, `peak_bankroll_cents`, `highest_roll_amplified_cents` (runs + leaderboard) and `pending_additive_cents` (runs) use `bigint(..., { mode: 'number' })`; Floor 9 targets reach $60M (6e9 cents), past INT4's $21.47M. Use bigint for any new money column. `pending_additive_cents` joined them 2026-10-13.

**Payout formula:** `FinalPayout = baseStakeReturned + floor((GrossProfit + additives) × hype × ∏multipliers)`

---

## Code Style

| Scope | Convention |
|---|---|
| Variables, functions | `camelCase` |
| React components, TS types/interfaces | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Crew files | `camelCase.ts` (`hypeTrainHolly.ts`) |
| Component files | `PascalCase.tsx` |
| Hook files | `useCamelCase.ts` |
| Shared utilities | `lib/` (not `utils/`) |

- Functional React only; no class components
- Zod for API input validation; Pino for structured logging
- Monetary values never use floats — always integer cents

---

## TypeScript Strictness Protocol
This project uses strict TypeScript. Whenever you write or modify TypeScript code, you MUST be hyper-vigilant about `null` and `undefined` checks. 
- Always guard array lookups (e.g., `const item = arr[0]; if (!item) return;`).
- Before finalizing a task or creating a commit, you MUST run `npm run build` or `npx tsc --noEmit` in the affected workspace to guarantee you haven't introduced any TS compilation errors. Do not declare a task finished if `tsc` throws an error.

---

## Game Constants (quick reference)

**Gauntlet targets (Boss = 2× M2 per floor):** F1: $50/$100/$200 | F2: $300/$500/$1k | F3: $1.5k/$2k/$4k | F4: $5k/$7.5k/$15k | F5: $30k/$50k/$100k | F6: $150k/$250k/$500k | F7: $1M/$1.5M/$3M | F8: $5M/$7.5M/$15M | F9: $20M/$30M/$60M
**Bosses (F1–F9):** The Foreman (skims 20% of winning profit — the Cut; his room clears only when the Cut reaches the $25 Payoff, never on bankroll; FB-032) | Sarge (Double Time — hit the point within 6 rolls or the 6th blank is a Seven-Out; FB-030) | Mme. Le Prix (enchants one random crew per come-out — excluded from cascade through point resolution) | The Executive (cross calibration: Performance Review rating, +15% payout at Exceptional, PIP termination at Action Required) | The Hierophant (additive escrow — 25% seized on 7-out) | The Sovereign (four-stage tide: LOW/EBB/HIGH/FLOW per come-out) | The Commander (tier-scaled hype decay + death spiral below 0.75×) | The Emissary (transmission delay — additives held one roll, evaporate on 7-out) | The Architect (targeted demolition — last-triggered slot removed + load-bearing penalty; no comp)
**Comps (F1–F8):** The Vig (crew cash +20%) | Member's Jacket (+1 shooter at every marker) | The Keepsake (7-out keeps half the hype above 1.0× — not applied in the Commander fight) | Board Seat (+1 crew slot) | The Covenant (Hierophant escrow seizure halved to 12.5% — no effect after that fight; redesign pending, FB-029) | Poseidon's Favor (each shooter's first-roll craps-out doesn't count; Pass Line stays up) | Cargo Hold (+1 crew slot, full capacity) | The Frequency (naturals award 3% of marker target)
**Odds:** 4/10 → 3× max, 2:1 | 5/9 → 4× max, 3:2 | 6/8 → 5× max, 6:5
**Hardways:** 4/10 = 7:1 | 6/8 = 9:1
**Bet max:** 10% of marker target
**Hype ticks:** POINT_HIT +0.15×–0.30× streak-based (BASE=0.15, +0.05 per consecutive hit, CAP=3) | NATURAL +0.10 | CRAPS_OUT −0.05 (floor 1.0); resets to 1.0× on seven-out and at every marker boundary (hype is built within a marker, not carried forward). Tier thresholds: ≥1.5× = Heating Up, ≥2.5× = On Fire.

---

## Docs Structure

```
docs/requirements/    # PRD.md (full game spec), feature-backlog.md (FB-001–031), tutorial-user-journey.md,
                      #   vibe-ideas.md, floor-aesthetics.md
docs/frameworks/      # crew_framework.md (30 crew — 15 Starter + 15 unlock-gated), floors.md, boss_framework.md,
                      #   floor-addition-checklist.md (canonical update checklist — use this when adding any new floor)
docs/design/          # crew-sprites-tdd.md (asset spec), crew-implementation-design.md (FB-012 TDD),
                      #   transition_framework TDD, boss-mechanic-technical-design.md,
                      #   title-screen-technical-design.md, tutorial-technical-design.md (FB-007 TDD),
                      #   fb-014-high-rollers-club-tdd.md (FB-014 TDD),
                      #   fb-016-mobile-ui-technical-design.md, session-management-technical-design.md,
                      #   fb-022-crew-rail-dnd-tdd.md (FB-022 TDD), CODE_REVIEW.md*
docs/testing/         # known-issues.md (open defects), test plans + results (alpha cycle — archived)
docs/manifests/       # manifest-instruction-prompt.md, implemented/ (FB-009, FB-014, FB-019, FB-022, tutorial-path-b)
```

`*` CODE_REVIEW.md and alpha test results in `docs/testing/` reflect the **alpha build** — issues documented there are resolved. Treat as historical context only.

---

## Current State

**Status:** Beta. All 13 transition phases shipped. Clerk auth (Google OAuth) live in production. Max bankroll tracking live. Bet take-down (odds + hardway pre-roll) live. Transition timing overhaul (FB-008) shipped. Boss mechanic framework (FB-010) fully implemented. Title lobby screen (FB-011) live. Crew Expansion & Unlock System (FB-012) live — 30-crew roster, unlock gating, real-time unlock notifications. Tutorial & How to Play system (FB-007) live. Dice Roll Sound Effect (FB-009) live. Versioning & Release Notes (FB-019) live — automated SemVer via build script, in-game release notes modal, "New" indicator with localStorage dismissal. High Roller's Club & Leaderboards (FB-014) live — `leaderboard_entries` table, `GET /api/v1/leaderboard` (global/personal), per-run `highestRollAmplifiedCents` tracking, `LeaderboardScreen` + `LeaderboardEntry` components accessible from TitleLobbyScreen. **NBA Jam Dice Hype Effects (FB-021) live** — three-tier hype visual system: Tier 0 (default ivory dice), Tier 2 / Heating Up (yellow dice + orange heat-glow CSS animation + smoke particle emitter), Tier 3 / On Fire (red dice + chaotic fire-glow CSS animation + fire particle emitter with additive blending); particle canvas portaled to `document.body` via `createPortal`; hype rebalance shipped alongside — ticks on all roll results (POINT_HIT now streak-based +0.15–0.30, NATURAL +0.10, CRAPS_OUT −0.05 floored at 1.0), tier thresholds key off `s.hype` (≥1.5 / ≥2.5). **Drag-and-Drop Crew Rail Sorting (FB-022) live** — players reorder the 5-slot crew rail via drag-and-drop; `@dnd-kit/core` + `@dnd-kit/sortable`; 150ms activation delay prevents accidental drags; rail locked (`sensors=[]`) during rolls and cascade animations; optimistic UI with rollback on failure; `POST /api/v1/runs/:id/crew/reorder` persists the new slot order server-side with an optimistic lock on `updatedAt`. **Playtester Feedback System (FB-018) live** — `POST /api/v1/feedback` endpoint with Clerk auth + Fastify AJV validation; `feedback_submissions` table (serial PK, user FK, type/rating/comment/context JSONB); `FeedbackModal` component portaled to `document.body`; `snapshotForFeedback()` Zustand action captures game state before `disconnect()` clears it; bug icon in TableBoard HUD (live game context) + "SUBMIT FEEDBACK" button in TitleLobbyScreen footer (post-session context); "← TITLE SCREEN" back-to-lobby flow with inline confirmation; all top-left HUD controls in a single flex row so confirmation expansion does not overlap siblings. **Expanded Gauntlet — 9 Floors (FB-015) live** — Full 27-marker gauntlet across 9 floors implemented. The Loading Dock added as Floor 1; legacy floors renumbered (VFW Hall → F2, Riverboat → F3, Strip → F4); five new floors (The Lodge, Atlantis, The Station, The Signal, The Null Space). Current targets are in Game Constants above (they were rebalanced after FB-015 shipped). Nine boss rules — see Bosses above and `docs/frameworks/boss_framework.md` for current mechanics (the FB-015-era Hierophant, Sovereign, Commander and Emissary mechanics were all replaced in FB-026). Five new floor themes added (occult/ancient/cosmic/alien/digital). `FloorAtmosphere` union extended to 9 types. `GAUNTLET[]` now 27 entries. **Dynamic Crew Hiring Costs (FB-023) live** — `baseCost` removed from `CrewMember` and DB; `RARITY_COST_MULTIPLIERS` + `getCrewHireCost()` in `config.ts` compute cost as `N × maxBet` by rarity; `/crew-roster` response includes `hireCostCents`; `PubScreen` reads it from the API. **Executive Cross Calibration (FB-027) live** — The Executive (Floor 4) boss mechanic replaced: `FOURS_INSTANT_LOSS` removed; `CROSS_CALIBRATION` introduced. Performance Review rating (0–4) stored in `bossPointHits`; initializes to 2 (Strong) on fight entry. Natural/Point Hit → +1 (cap 4, Exceptional); Craps Out/Seven-Out → −1 (floor 0, Action Required). At Exceptional (4): +15% gross profit bonus. PIP termination: another bad roll at Action Required → GAME_OVER, `pipTermination: true` in socket payload, which selects the PIP memo in his TERMINATED defeat cinematic (FB-035). `bossRating: { index, changed, direction }` emitted on every roll in the fight. **Dynamic Crew Additive Scaling (FB-024) live** — `markerTargetCents` added to `TurnContext`, injected by `rolls.ts`; 10 additive crew replaced flat `ADDITIVE_BOOST` constants with `ADDITIVE_MULT` coefficients (originally 0.5×–2.0× of current max bet, roughly halved on 2026-05-22 — current values in `crew_framework.md`), rounding to nearest dollar.

**Developer Mode (FB-028) live** (2026-10-13) — allowlisted developer only: Scenario Builder (DEV RUN on title screen, 21 presets), forced dice (🎲 DEV), live Dev Panel (backtick: edits, jumps, inspector, copy-as-scenario, cinematic previews, account unlock/tutorial toggles). Dev runs are isolated from leaderboard/unlocks/stats.

**The Foreman rework (FB-032) live** (2026-10-13) — his 20% skim ("the Cut") accumulates on a front-and-center cash register (rolling digits, ka-ching); the room clears only at the $25 **Payoff** (PAID IN FULL stamp + bell), never on bankroll. Pilots two per-boss systems: **boss barks** (`config.ts` `barks`, rules in shared `bossBarks.ts`, floating `BossBarkFloat`) and **boss defeat cinematics** (`defeatCinematic`, `components/defeat/`; Foreman = DOCK CLOSED door slam). Tuning sim: `scripts/sim/foreman-payoff-sim.mjs`.

**Sarge boss moments (FB-033) live** — drill-sergeant barks driven by his Double Time clock, a clock that grows/pulses/ticks (alarm on the last roll, whistle on TIME'S UP), HONORABLY DISCHARGED win stamp with a bugle, DISHONORABLE DISCHARGE defeat with dog tags. Introduced per-boss bark events and the boss victory-moment system.

**Mme. Le Prix boss moments (FB-034) live** — soft purring barks (chance-based `charmed` event via `EVENT_BARK_CHANCE`), the heart's flight (`CharmFlight`: ❤️ arcs old portrait → her name → new portrait, harp glissando), a charm heartbeat + dreamy "daze" on the crew she blocked (replaced "OOH LA LA!"), THE ROSE win and SHE TAKES THE CREW loss (both big — "big wins, big losses"; victory holds are per cinematic, `VICTORY_HOLD_MS_BY_ID`).

**The Executive boss moments (FB-035) live** — his barks migrated to the shared event-driven system (promoted / final warning always; bonus and ordinary moves by chance), a `PerformanceMeter` front and center (sliding marker, gold Exceptional with "+15% · $X" pops from the server's `exceptionalBonusCents`, red FINAL WARNING alarm), THE NAMEPLATE SWAP win and TERMINATED loss (pink memo — PIP or Position Eliminated — plus your crew packed into a box) for every loss in his fight; the old PinkSlipModal is retired. Floor 4 renamed The Strip → **The Suite** (boss venue: The Suite — Corner Office). Next boss in the roll-out: The Hierophant.

**Active development:** None currently.

**Open defects:** KI-079 (`settleTurn` float rounding can lose $1 on large bets). All other entries in `docs/testing/known-issues.md` are closed. KI-074–078 were found and fixed in the 2026-10-13 documentation audit (PR #26). KI-013/KI-014 (mobile text size) were fixed 2026-05-21 via an ad hoc font-size sweep.

**Documentation audit (2026-10-13):** game mechanics (#26), player-facing text (#27) and internal docs were reconciled with the code. `boss_framework.md` is the canonical boss reference; `floors.md` floor sections are generated from `floors.ts`/`config.ts`.

**Not yet implemented:**
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md` — 64×64 SNES-style PNGs; only Lefty done so far)
- Mobile-First UI/UX & Readability Overhaul (backlog: FB-016 — HD-Retro typography, Roll Log bottom sheet, high-contrast panels)
- Tutorial Replay & State Reset (backlog: FB-017 — replay button in HowToPlayScreen, backend tutorial-reset endpoint)
