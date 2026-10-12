# Where I Left Off

> A re-entry note for coming back after time away. Update this whenever you stop for more than a week.

**Last updated:** 2026-10-12 (second pass: backlog audit, Supabase restore, local-run notes)
**Last real dev session:** 2026-05-30 (~4.5 month break)

---

## State of the game

BattleCraps is in **beta** and playable end to end:

- 9 floors × 3 markers, 9 bosses, 8 comps
- 30 crew (15 starter + 15 unlock-gated), drag-and-drop crew rail
- Clerk auth, leaderboards, tutorial, release notes, feedback system, floor music
- Health check on 2026-10-12: `npm run typecheck` clean, `npm run test` 385/385 passing

## Recent work (newest first)

| Date | What | Where |
|---|---|---|
| 2026-05-30 → committed 2026-10-12 | **FB-027** The Executive: Cross Calibration (Performance Review rating, PIP termination, `PinkSlipModal`) | branch `feature/fb-027-executive-cross-calibration` (not yet merged to `main`) |
| 2026-05-30 | Mme. Le Prix charm bark animation | `main` |
| 2026-05-28 | **FB-026** Boss & comp overhaul: all 11 manifest steps (7 bosses reworked, `pending_additive_cents` migration, tide-stage UI) | `main` |
| 2026-05-27 | **FB-025** Crew slot progression + marker target overhaul + floor music | `main` (PR #24) |

Also already shipped, easy to forget: **FB-013 cinematic crew unlock** (2026-05-08, PR #17, commit labeled "FB-012"): `UnlockRecapPhase`, `UnlockModal`, guaranteed pub-draft slot for new unlocks.

> ⚠️ Backlog status lines drifted out of date once before. They were corrected on 2026-10-12. When in doubt, check the code, not the status line.

## Loose ends

**Housekeeping (quick wins):**
- [ ] Open a PR for `feature/fb-027-executive-cross-calibration` → `main`, playtest Floor 4, merge
- [x] ~~Fix stale backlog statuses~~ (done 2026-10-12: FB-013, FB-025, FB-026, FB-027 marked Implemented)
- [ ] Mme. Le Prix (F3) docs disagree: backlog/FB-026 says "35% additive tariff", CLAUDE.md says "enchants one random crew per come-out" (the 2026-05-30 charm commit). Playtest, pick one, update docs.
- [ ] `.claude/worktrees/blissful-kalam-958c69` is a stale worktree reference sitting deleted-but-uncommitted. Safe to commit the removal or clean up.
- [ ] Two unmerged stale remote branches: `claude/bankroll-cap-timing-mNJfg`, `claude/blissful-kalam-958c69`. Review, then delete.

**Open defects** (`docs/testing/known-issues.md`):
- KI-013: global text still too small on mobile (High)
- KI-014: typography overhaul missing from Title and Transition screens (Medium)

**Not built yet:**
- FB-016 mobile-first UI overhaul: stashed on `feature/fb-016-mobile-ui` (last touched 2026-04-21, mostly design docs). Would also fix KI-013/KI-014. **Best next build.**
- FB-017 tutorial replay & reset: nothing built (no reset endpoint, no replay button)
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md`): only Lefty done (`apps/web/public/sprites/crew/lefty.png`); 29 to go
- FB-020 3D physics dice: attempted, abandoned, stashed

## Infrastructure gotchas

- **Supabase free tier pauses after ~7 days idle.** It paused during the 2026 break; restored from the dashboard on 2026-10-12 (data intact: 17 users, 635 runs, 485 leaderboard entries). If `npm run dev` fails with `tenant/user postgres.… not found`, the project is paused. Go to supabase.com → project → Resume.
- **Keep a backup.** Free plan has no daily snapshots. Download one from the dashboard after any long break.
- **Local dev uses the live DB.** `apps/api/.env` `DATABASE_URL` points at Supabase, the same instance as production and playtesters. Local runs and leaderboard entries are real. Never run a migration locally unless you mean to apply it to prod. Docker Postgres (`docker-compose.yml`) is only for integration tests.
- All 4 Drizzle migrations (`0000`–`0003`) were confirmed applied to prod on 2026-10-12.

## How to run locally

No nvm needed (no `.nvmrc`; Node 24 works).

```bash
npm run dev          # shared watcher + API :3001 + web :5173
```

Open http://localhost:5173 and sign in with Google.

```bash
npm run test                            # 385 engine tests (no DB needed)
docker compose up -d postgres-test      # needed for API integration tests
```

## Ideas on the table (not decided)

**Steam release / going local.** Never written down before now. The rough shape:

- Drop the API + Postgres; run the engine (`packages/shared`, already zero-dependency) in the client.
- Wrap as a desktop app with **Electron or Tauri**. WebAssembly is *not* needed since the code is already TypeScript.
- Replace server features with Steam equivalents: Steamworks leaderboards and achievements (for unlocks), Steam Cloud saves (for persistence).
- Middle-ground option if the web version stays: the server shrinks to a "dice oracle" (returns dice after bets lock) plus a replay verifier for leaderboard entries.
- Biggest work items: rewriting `apps/api/src/routes/rolls.ts` logic into a client-side game loop, reworking `apps/web/src/store/useGameStore.ts` to stop depending on sockets, and moving persistence off Postgres.

## Suggested re-entry path

1. Play one full run without fixing anything. Is it still fun?
2. Merge FB-027; settle the Mme. Le Prix docs question.
3. Decide: polish the web beta (FB-016 → fixes KI-013/014, then sprites) **or** start the Steam/local spike.
