# Where I Left Off

> A re-entry note for coming back after time away. Update this whenever you stop for more than a week.

**Last updated:** 2026-10-13 (after FB-028 Developer Mode + full cleanup)
**Last real dev session:** 2026-10-13 (back from a ~4.5 month break that started 2026-05-30)

---

## State of the game

BattleCraps is in **beta**, live at battlecraps.com, playable end to end, with friends playtesting:

- 9 floors × 3 markers, 9 bosses, 8 comps; 30 crew (15 starter + 15 unlock-gated)
- Clerk auth, leaderboards, tutorial, release notes, feedback system, floor music
- **Developer Mode** (FB-028), for you only: start anywhere, force dice, edit live runs, preview cinematics
- **Everything green (2026-10-13):** typecheck + build clean, 414/414 engine tests, **87/87 API integration tests**
- **Repo clean:** only `main` plus `feature/fb-016-mobile-ui` (stashed on purpose)

## Recent work (newest first)

| Date | What |
|---|---|
| 2026-10-13 | Cleanup: 12 stale remote branches removed (11 merged + superseded PR #21); the 6 stale integration tests fixed (Sarge fine, additive nerf, hype-before-payout, FB-025 slots) |
| 2026-10-13 | `schema.ts` money columns → BIGINT to match prod (prod was converted 2026-05-23; Floor 9 targets reach $60M) |
| 2026-10-12/13 | **FB-028 Developer Mode**, Phases 0–5 (see below) |
| 2026-10-12 | Bug fix: reloading a run dropped crew slots + boss state (rail fell back to 3 slots) |
| 2026-10-12 | Hotfix: Executive PIP termination never fired (pub reset the rating; a 0→2 guard masked it) |
| 2026-10-12 | **FB-027** Executive Cross Calibration merged (PR #25) |
| 2026-05-28 | **FB-026** Boss & comp overhaul; **FB-025** crew slot progression (PR #24) |

## Developer Mode cheat sheet

Only works for allowlisted Clerk IDs (`DEV_MODE_ENABLED` + `DEV_CLERK_IDS` on Render and in `apps/api/.env`). **Clerk Dev and Prod give you different user IDs**: prod is `user_3CDWa7…` (find it with `window.Clerk.user.id` on battlecraps.com), local is `user_3CAyiO…`.

- **⚙ DEV RUN** (title screen): Scenario Builder. Pick a preset or any of 27 markers; set bankroll, crew, comps, boss state. "Start at table" keeps overrides; "Arrive via transition" plays the real clear + pub.
- **🎲 DEV** (on a dev run): queue exact dice.
- **DEV panel** (backtick ` or right-edge tab): live edits, jump markers, force game over, inspector, **Copy as scenario** (paste into `packages/shared/src/devScenarios.ts` to make a preset), cinematic previews, account toggles (reset tutorial, grant/revoke unlocks, all of which change your real account).
- Dev runs never touch the leaderboard, unlocks, or your stats.

## Loose ends

- [x] ~~PR #21 / `claude/blissful-kalam-958c69`~~: closed as superseded and branch deleted (2026-10-13).
- [ ] Mme. Le Prix (F3) docs disagree: backlog/FB-026 says "35% additive tariff", CLAUDE.md says "enchants one random crew per come-out" (the 2026-05-30 charm commit). Playtest, pick one, update docs.
- [ ] `runs.pending_additive_cents` is still INT4 (max ~$21.47M). Only matters if Hierophant/Emissary escrow alone passes that, which is unlikely.

**Open defects:** none. All entries in `docs/testing/known-issues.md` are closed.

**Not built yet:**
- FB-016 mobile-first UI overhaul: stashed on `feature/fb-016-mobile-ui` (kept on purpose; mostly design docs). Text-size bugs are already patched, so this is a polish upgrade.
- FB-017 tutorial replay: the backend half exists now (`POST /dev/account/reset-tutorial` logic); needs a player-facing endpoint + replay button.
- Crew sprite assets (spec: `docs/design/crew-sprites-tdd.md`): only Lefty done; 29 to go.
- FB-020 3D physics dice: attempted, abandoned.

## Infrastructure gotchas

- **Supabase free tier pauses after ~7 days idle.** If `npm run dev` fails with `tenant/user postgres.… not found`, it's paused: supabase.com → project → Resume. Keep a backup (free plan has no snapshots).
- **Local dev uses the live DB.** `apps/api/.env` points at Supabase, the same instance as prod and playtesters. Local runs are real (dev runs are isolated). Never run a migration locally unless you mean prod.
- **Schema changes ship via `server.ts` startup** (`ADD COLUMN IF NOT EXISTS` etc. before `listen()`), plus a Drizzle migration file for the record. Pushing to `main` deploys (Render API, Vercel web).
- **Integration tests** run against Docker `postgres-test` (in-memory). If a schema type change makes the setup hang, recreate it: `docker compose up -d --force-recreate --wait postgres-test`. Always set `DATABASE_URL` from `apps/api/.env.test` when running them.

## How to run locally

No nvm needed (Node 24 works).

```bash
npm run dev          # shared watcher + API :3001 + web :5173
```

Open http://localhost:5173 and sign in with Google.

```bash
npm run test                                         # 414 engine tests (no DB)
docker compose up -d --wait postgres-test            # then, from apps/api:
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.test | cut -d= -f2- | tr -d '\r')" npx vitest run --config vitest.config.ts src/__tests__/integration
```

## Ideas on the table (not decided)

**Steam release / going local.**
- Drop the API + Postgres; run the engine (`packages/shared`, zero-dependency) in the client. The dev scenario builder already lives in `shared`, so it ports too.
- Wrap as a desktop app with **Electron or Tauri** (WebAssembly not needed; it's already TypeScript).
- Replace server features with Steamworks leaderboards / achievements / Steam Cloud saves.
- Middle ground if the web version stays: server shrinks to a "dice oracle" + replay verifier.

## Suggested next steps

1. Watch playtester feedback on the new boss fights (Executive PIP now actually fires).
2. Use Developer Mode to playtest late floors without the grind; save any repeated setup as a preset.
3. Decide: polish the web beta (FB-016, sprites, FB-017) **or** start the Steam/local spike.
