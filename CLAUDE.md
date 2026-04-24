# BattleCraps — CLAUDE.md

## Project Overview
Roguelike Craps game: 9-marker gauntlet (3 floors × 3 markers + boss). Players recruit a 5-slot crew whose abilities cascade each turn to modify dice, payouts, and hype multipliers. Entering beta — all alpha defects resolved.

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
npm run db:migrate   # push Drizzle schema to Postgres
npm run db:seed      # seed crew + boss config
npm run db:studio    # Drizzle Studio live inspector

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
  config.ts                   # GAUNTLET[9], boss rules, comp perks, getMaxBet(), getMinBet()
  floors.ts                   # FloorConfig, FLOORS registry, TransitionType, CelebrationSnapshot — floor narrative/display data
  crew/                       # 30 execute() implementations + index.ts registry (IDs 1–15 unlock-gated; 16–30 Starter)
  bossRules/                  # Boss rule hook implementations: disableCrew.ts, foursInstantLoss.ts, risingMinBets.ts, types.ts

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
  hooks/                      # useAnimatedCounter, useFloorTheme, useCrowdAudio, useTutorialSpotlight
  lib/floorThemes.ts          # Three floor theme objects (gritty / elegant / electric)
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

**Gauntlet targets:** Floor 1: $300/$600/$1k | Floor 2: $1.5k/$2.5k/$4k | Floor 3: $6k/$9k/$12.5k
**Bosses:** Sarge (rising min-bets) | Mme. Le Prix (crew disabled) | Executive (4s = instant loss)
**Comps:** Member's Jacket (+1 shooter) | Sea Legs (7-out resets hype to 50%) | Golden Touch (guaranteed first natural)
**Odds:** 4/10 → 3× max, 2:1 | 5/9 → 4× max, 3:2 | 6/8 → 5× max, 6:5
**Hardways:** 4/10 = 7:1 | 6/8 = 9:1
**Bet max:** 10% of marker target
**Hype ticks:** +0.05 / +0.10 / +0.15 / +0.20 per consecutive point hit; resets to 1.0× on seven-out

---

## Docs Structure

```
docs/requirements/    # PRD.md (full game spec), feature-backlog.md (FB-001–019), tutorial-user-journey.md,
                      #   vibe-ideas.md, floor-aesthetics.md
docs/frameworks/      # crew_framework.md (30 crew — 15 Starter + 15 unlock-gated), floors.md, boss_framework.md
docs/design/          # crew-sprites-tdd.md (asset spec), crew-implementation-design.md (FB-012 TDD),
                      #   transition_framework TDD, boss-mechanic-technical-design.md,
                      #   title-screen-technical-design.md, tutorial-technical-design.md (FB-007 TDD),
                      #   fb-014-high-rollers-club-tdd.md (FB-014 TDD),
                      #   fb-016-mobile-ui-technical-design.md, session-management-technical-design.md,
                      #   CODE_REVIEW.md*
docs/testing/         # known_issues.md (open defects), test plans + results (alpha cycle — archived)
docs/manifests/       # manifest-instruction-prompt.md, implemented/ (FB-009, FB-014, FB-019, tutorial-path-b)
```

`*` CODE_REVIEW.md and alpha test results in `docs/testing/` reflect the **alpha build** — issues documented there are resolved. Treat as historical context only.

---

## Current State

**Status:** Beta. All 12 transition phases shipped. Clerk auth (Google OAuth) live in production. Max bankroll tracking live. Bet take-down (odds + hardway pre-roll) live. Transition timing overhaul (FB-008) shipped. Boss mechanic framework (FB-010) fully implemented. Title lobby screen (FB-011) live. Crew Expansion & Unlock System (FB-012) live — 30-crew roster, unlock gating, real-time unlock notifications. Tutorial & How to Play system (FB-007) live. Dice Roll Sound Effect (FB-009) live. Versioning & Release Notes (FB-019) live — automated SemVer via build script, in-game release notes modal, "New" indicator with localStorage dismissal. High Roller's Club & Leaderboards (FB-014) live — `leaderboard_entries` table, `GET /api/v1/leaderboard` (global/personal), per-run `highestRollAmplifiedCents` tracking, `LeaderboardScreen` + `LeaderboardEntry` components accessible from TitleLobbyScreen.

**Active development:** None currently.

**Open defects:** See `docs/testing/known_issues.md` for full list. Current open issues:
- KI-002: Roll delta popup confusing on marker-clear rolls (Low)
- KI-003: "Tap to Continue" on Marker Intro not reliably clickable (Low)
- KI-012: White flash at top of screen (boss banner area) on dice bounce (Low)

**Not yet implemented:**
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md` — 64×64 SNES-style PNGs)
- Cinematic crew unlock experience (backlog: FB-013)
- Mobile-First UI/UX & Readability Overhaul (backlog: FB-016 — HD-Retro typography, Roll Log bottom sheet, high-contrast panels)
- Tutorial Replay & State Reset (backlog: FB-017 — replay button in HowToPlayScreen, backend tutorial-reset endpoint)
- Playtester Feedback System (backlog: FB-018 — in-game feedback modal with deep context payload)
