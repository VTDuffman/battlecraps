# Where I Left Off

> A re-entry note for coming back after time away. Update this whenever you stop for more than a week.

**Last updated:** 2026-10-12
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
| 2026-05-28 | **FB-026** Boss & comp overhaul (Phases 1–3 + comp descriptions) | `main` |
| 2026-05-27 | **FB-025** Crew slot progression + marker target overhaul + floor music | `main` (PR #24) |

## Loose ends

**Housekeeping (quick wins):**
- [ ] Open a PR for `feature/fb-027-executive-cross-calibration` → `main`, playtest Floor 4, merge
- [ ] Backlog statuses are stale in `docs/requirements/feature-backlog.md`: FB-025 says "Ready for implementation", FB-026 says "In Progress", FB-027 says "Planned". All three are built.
- [ ] `.claude/worktrees/blissful-kalam-958c69` is a stale worktree reference sitting deleted-but-uncommitted. Safe to commit the removal or clean up.

**Open defects** (`docs/testing/known-issues.md`):
- KI-013: global text still too small on mobile (High)
- KI-014: typography overhaul missing from Title and Transition screens (Medium)

**Not started:**
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md`)
- FB-013 cinematic crew unlock
- FB-016 mobile-first UI overhaul (overlaps KI-013/KI-014)
- FB-017 tutorial replay & reset

## Ideas on the table (not decided)

**Steam release / going local.** Never written down before now. The rough shape:

- Drop the API + Postgres; run the engine (`packages/shared`, already zero-dependency) in the client.
- Wrap as a desktop app with **Electron or Tauri**. WebAssembly is *not* needed since the code is already TypeScript.
- Replace server features with Steam equivalents: Steamworks leaderboards and achievements (for unlocks), Steam Cloud saves (for persistence).
- Middle-ground option if the web version stays: the server shrinks to a "dice oracle" (returns dice after bets lock) plus a replay verifier for leaderboard entries.
- Biggest work items: rewriting `apps/api/src/routes/rolls.ts` logic into a client-side game loop, reworking `apps/web/src/store/useGameStore.ts` to stop depending on sockets, and moving persistence off Postgres.

## Suggested re-entry path

1. Play one full run without fixing anything. Is it still fun?
2. Merge FB-027 and fix the stale backlog statuses.
3. Decide: polish the web beta (KI-013/014, sprites) **or** start the Steam/local spike.
