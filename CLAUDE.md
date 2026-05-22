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
  bossRules/                  # Boss rule hook implementations: extortionFee.ts, risingMinBets.ts, disableCrew.ts, foursInstantLoss.ts, tribute.ts, tidalSurge.ts, orbitalDecay.ts, firstContactProtocol.ts, convergence.ts, types.ts, index.ts

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
  db/schema.ts                # Drizzle schema: users, runs (JSONB bets + crew_slots), crewDefinitions, leaderboardEntries
  lib/clerkAuth.ts            # Clerk JWT verification middleware
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
                              #   BossEntryModal, BossRoomHeader, BossVictoryModal, CompCard, FloorEmblem,
                              #   TitleLobbyScreen, UnlockNotification, VersionDisplay, ReleaseNotesModal,
                              #   LeaderboardScreen, LeaderboardEntry,
                              #   GameOverScreen, PubScreen + tutorial/ subtree (TutorialOverlay, KnowledgeGate,
                              #   SalDialog, SalPortrait, SpotlightMask, HowToPlayScreen + 3 section components)
  transitions/phases/         # 12 cinematic phases: TitleScreen, MarkerIntro, MarkerCelebration, FloorReveal,
                              #   FloorRevealConfirm, BossEntry, BossEntryDread, BossVictory, BossVictoryComp,
                              #   VictoryExplosion, VictoryRecap, VictorySendoff
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
- **CONVERGENCE boss** (`bossPointHits` dual-use) — for The Architect (Floor 9), `bossPointHits` tracks seven-out count (not point hits). Increments on SEVEN_OUT (capped at 5), held on POINT_HIT. The pre-roll value is injected into `TurnContext` as `bossSevenOutCount` and passed to `resolveCascade` as `bossState`. `modifyCascadeOrder` returns `[0..(4 - sevenOutCount)]`, shrinking to `[]` at count 5.
- **`compReward: 'NONE'` sentinel** — Floor 9 boss awards no comp. `BossVictoryCompPhase` calls `onAdvance()` immediately via `useEffect` (never during render). All comp-read sites must guard `boss.compReward !== 'NONE'`.

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

**Gauntlet targets:** F1: $50/$100/$250 | F2: $300/$600/$1k | F3: $1.5k/$2.5k/$4k | F4: $6k/$9k/$12.5k | F5: $20k/$30k/$45k | F6: $70k/$120k/$175k | F7: $250k/$425k/$650k | F8: $1M/$1.75M/$2.5M | F9: $5M/$10M/$20M
**Bosses (F1–F9):** The Foreman (20% payout tax) | Sarge (rising min-bets) | Mme. Le Prix (crew disabled) | The Executive (4s = instant loss) | The Hierophant (15% bankroll tribute on 7-out) | The Sovereign (tidal surge — min bet floods 15% every 5 rolls) | The Commander (hype decays 0.5× per 7-out, can fall below 1.0×) | The Emissary (7/11 naturals nullified — blank re-roll) | The Architect (crew slot removed per 7-out; 5 = naked craps; no comp)
**Comps (F1–F8):** The Vig (crew cash +20%) | Member's Jacket (+1 shooter) | Sea Legs (7-out resets hype to 50%) | Golden Touch (guaranteed first natural) | The Covenant (bankroll drains −50%) | Poseidon's Favor (first come-out can't craps-out) | Zero Point (hype floored at 1.25×) | The Frequency (naturals award 3% of marker target)
**Odds:** 4/10 → 3× max, 2:1 | 5/9 → 4× max, 3:2 | 6/8 → 5× max, 6:5
**Hardways:** 4/10 = 7:1 | 6/8 = 9:1
**Bet max:** 10% of marker target
**Hype ticks:** POINT_HIT +0.15×–0.30× streak-based (BASE=0.15, +0.05 per consecutive hit, CAP=3) | NATURAL +0.10 | CRAPS_OUT −0.05 (floor 1.0); resets to 1.0× on seven-out. Tier thresholds: ≥1.5× = Heating Up, ≥2.5× = On Fire.

---

## Docs Structure

```
docs/requirements/    # PRD.md (full game spec), feature-backlog.md (FB-001–024), tutorial-user-journey.md,
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

**Status:** Beta. All 12 transition phases shipped. Clerk auth (Google OAuth) live in production. Max bankroll tracking live. Bet take-down (odds + hardway pre-roll) live. Transition timing overhaul (FB-008) shipped. Boss mechanic framework (FB-010) fully implemented. Title lobby screen (FB-011) live. Crew Expansion & Unlock System (FB-012) live — 30-crew roster, unlock gating, real-time unlock notifications. Tutorial & How to Play system (FB-007) live. Dice Roll Sound Effect (FB-009) live. Versioning & Release Notes (FB-019) live — automated SemVer via build script, in-game release notes modal, "New" indicator with localStorage dismissal. High Roller's Club & Leaderboards (FB-014) live — `leaderboard_entries` table, `GET /api/v1/leaderboard` (global/personal), per-run `highestRollAmplifiedCents` tracking, `LeaderboardScreen` + `LeaderboardEntry` components accessible from TitleLobbyScreen. **NBA Jam Dice Hype Effects (FB-021) live** — three-tier hype visual system: Tier 0 (default ivory dice), Tier 2 / Heating Up (yellow dice + orange heat-glow CSS animation + smoke particle emitter), Tier 3 / On Fire (red dice + chaotic fire-glow CSS animation + fire particle emitter with additive blending); particle canvas portaled to `document.body` via `createPortal`; hype rebalance shipped alongside — ticks on all roll results (POINT_HIT +0.25, NATURAL +0.10, CRAPS_OUT −0.05 floored at 1.0), tier thresholds key off `s.hype` (≥1.5 / ≥2.5). **Drag-and-Drop Crew Rail Sorting (FB-022) live** — players reorder the 5-slot crew rail via drag-and-drop; `@dnd-kit/core` + `@dnd-kit/sortable`; 150ms activation delay prevents accidental drags; rail locked (`sensors=[]`) during rolls and cascade animations; optimistic UI with rollback on failure; `POST /api/v1/runs/:id/crew/reorder` persists the new slot order server-side with an optimistic lock on `updatedAt`. **Playtester Feedback System (FB-018) live** — `POST /api/v1/feedback` endpoint with Clerk auth + Fastify AJV validation; `feedback_submissions` table (serial PK, user FK, type/rating/comment/context JSONB); `FeedbackModal` component portaled to `document.body`; `snapshotForFeedback()` Zustand action captures game state before `disconnect()` clears it; bug icon in TableBoard HUD (live game context) + "SUBMIT FEEDBACK" button in TitleLobbyScreen footer (post-session context); "← TITLE SCREEN" back-to-lobby flow with inline confirmation; all top-left HUD controls in a single flex row so confirmation expansion does not overlap siblings. **Expanded Gauntlet — 9 Floors (FB-015) live** — Full 27-marker gauntlet across 9 floors implemented. The Loading Dock (Floor 1, $50/$100/$250) added; all legacy floors renumbered (VFW Hall → F2, Riverboat → F3, Strip → F4). Five new floors added — The Lodge (F5, $20k/$30k/$45k), Atlantis (F6, $70k/$120k/$175k), The Station (F7, $250k/$425k/$650k), The Signal (F8, $1M/$1.75M/$2.5M), The Null Space (F9, $5M/$10M/$20M). Nine boss rule implementations: `EXTORTION_FEE` (modifyPayout hook — 20% tax), `RISING_MIN_BETS` (validateBet hook), `DISABLE_CREW` (modifyCascadeOrder → []), `FOURS_INSTANT_LOSS` (modifyOutcome hook), `TRIBUTE` (modifySevenOut hook — 15% bankroll seizure, halved by THE_COVENANT comp), `TIDAL_SURGE` (inline in rolls.ts — 5-roll tide cycle, 2-roll surge at 15% of target), `ORBITAL_DECAY` (inline in rolls.ts — 0.5× hype drain per 7-out, no floor), `FIRST_CONTACT_PROTOCOL` (inline in rolls.ts — naturals nullified pre-hype-tick, naturalBlocked flag), `CONVERGENCE` (modifyCascadeOrder + state — one crew slot removed per 7-out, capped at 5; naked craps thereafter). Five new floor themes added (occult/ancient/cosmic/alien/digital). `FloorAtmosphere` union extended to 9 types. `GAUNTLET[]` now 27 entries. **Dynamic Crew Hiring Costs (FB-023) live** — `baseCost` removed from `CrewMember` and DB; `RARITY_COST_MULTIPLIERS` + `getCrewHireCost()` in `config.ts` compute cost as `N × maxBet` by rarity; `/crew-roster` response includes `hireCostCents`; `PubScreen` reads it from the API. **Dynamic Crew Additive Scaling (FB-024) live** — `markerTargetCents` added to `TurnContext`, injected by `rolls.ts`; 10 additive crew replaced flat `ADDITIVE_BOOST` constants with `ADDITIVE_MULT` coefficients (0.5×–2.0× of current max bet), rounding to nearest dollar.

**Active development:** None currently.

**Open defects:** See `docs/testing/known-issues.md` for full list. Current open issues:
- KI-013: Global text still too small on mobile despite typography overhaul (High)
- KI-014: Typography overhaul missing from Title and Transition screens (Medium)

**Not yet implemented:**
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md` — 64×64 SNES-style PNGs)
- Cinematic crew unlock experience (backlog: FB-013)
- Mobile-First UI/UX & Readability Overhaul (backlog: FB-016 — HD-Retro typography, Roll Log bottom sheet, high-contrast panels)
- Tutorial Replay & State Reset (backlog: FB-017 — replay button in HowToPlayScreen, backend tutorial-reset endpoint)
