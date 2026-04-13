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
  types.ts                    # Source of truth: GamePhase, RollResult, TurnContext, CrewMember, Bets
  crapsEngine.ts              # classifyRoll(), settleTurn(), payout calculators
  cascade.ts                  # resolveCascade() — sequential crew execute() calls, emits CascadeEvents
  config.ts                   # GAUNTLET[9], boss rules, comp perks, getMaxBet(), getMinBet()
  crew/                       # 30 execute() implementations + index.ts registry (IDs 1–15 unlock-gated; 16–30 Starter)

apps/api/src/                 # Fastify backend
  server.ts                   # Fastify + Socket.io setup, route registration
  routes/rolls.ts             # POST /runs/:id/roll — main game loop (RNG → cascade → settle → persist → emit → unlock eval)
  routes/recruit.ts           # POST /runs/:id/recruit (unlock-gated)
  routes/mechanic.ts          # POST /runs/:id/mechanic-freeze
  routes/runs.ts              # GET/POST /runs/:id — full run state (page refresh recovery) + create
  routes/crew.ts              # GET /crew
  routes/crewRoster.ts        # GET /crew-roster — availability-filtered 30-crew roster per user
  db/schema.ts                # Drizzle schema: users, runs (JSONB bets + crew_slots), crewDefinitions
  lib/rng.ts                  # Crypto RNG with rejection sampling (no modulo bias)
  lib/unlocks.ts              # evaluateUnlocks() — all 15 unlock conditions, emits unlocks:granted

apps/web/src/                 # React SPA
  store/useGameStore.ts       # Zustand: all game state + socket listeners + cascade queue
  App.tsx                     # Router: TitleLobbyScreen | TableBoard | TransitionOrchestrator | PubScreen | GameOverScreen
  components/                 # TableBoard, BettingGrid, DiceZone, CrewPortrait, RollLog, ChipRain, CompCardFan
  transitions/phases/         # 9 cinematic phases: Title, MarkerIntro, FloorReveal, Boss*, Victory*, GameOver
  hooks/                      # useAnimatedCounter, useFloorTheme, useCrowdAudio
  lib/floorThemes.ts          # Three floor theme objects (gritty / elegant / electric)
```

**Audio system (`useCrowdAudio`):** Fully synthesized via Web Audio API — no asset files. `AudioContext` is lazy-created on first flash event (satisfies browser autoplay policy). Mute state persisted to `localStorage` (`bc_muted`). Current stings: crowd cheer (win flash), crowd groan (lose flash). Pending: dice roll rattle on throw (FB-009).

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
docs/requirements/    # PRD.md (full game spec), feature-backlog.md (FB-001–013), tutorial-user-journey.md, vibe-ideas.md
docs/frameworks/      # crew_framework.md (30 crew — 15 Starter + 15 unlock-gated), floor_design.md, boss_framework.md
docs/design/          # crew-sprites-tdd.md (asset spec), crew-implementation-design.md (FB-012 TDD), transition_framework TDD, boss-mechanic-technical-design.md, title-screen-technical-design.md, CODE_REVIEW.md*
docs/testing/         # known_issues.md (open defects), test plans + results (alpha cycle — archived)
```

`*` CODE_REVIEW.md and alpha test results in `docs/testing/` reflect the **alpha build** — issues documented there are resolved. Treat as historical context only.

---

## Current State

**Status:** Beta. All 9 transition phases shipped. Clerk auth (Google OAuth) live in production. Max bankroll tracking live. Bet take-down (odds + hardway pre-roll) live. Transition timing overhaul (FB-008) shipped. Boss mechanic framework (FB-010) fully implemented. Title lobby screen (FB-011) live. Crew Expansion & Unlock System (FB-012) live — 30-crew roster, unlock gating, real-time unlock notifications.

**Active development:** None. Awaiting next backlog item.

**Open defects:** See `docs/testing/known_issues.md` for full list. Current open issues:
- KI-002: Roll delta popup confusing on marker-clear rolls (Low)
- KI-003: "Tap to Continue" on Marker Intro not reliably clickable (Low)
- KI-004: Screen flash and crowd cheer re-fire after exiting the pub (Medium)
- KI-005: Member's Jacket comp does not show 6th shooter pip (Low)
- KI-006: New crew members (IDs 16–30) show no emoji in the UI (Low)
- KI-007: Crew member tooltips show "Crew #N" and "???" instead of name/description (Medium)
- KI-008: Chip rain sound effect lingers after returning from the pub (Medium)

**Not yet implemented:**
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md` — 64×64 SNES-style PNGs)
- Tutorial & "How to Play" system (UX design: `docs/requirements/tutorial-user-journey.md`, backlog: FB-007)
- Dice roll sound effect — synthesized rattle on throw (backlog: FB-009)
- Cinematic crew unlock experience (backlog: FB-013)
