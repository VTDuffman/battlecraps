# FB-028: Developer Mode (Design Draft)

**Status:** Design agreed 2026-10-12 (see §7). Ready for an implementation manifest.
**Author:** Mike + Claude
**Date:** 2026-10-12

---

## 1. Why

Testing late-game content today means playing the whole gauntlet to reach it. Verifying a Floor 9 Architect fix means clearing 26 markers first; reproducing a bug that needs "4 seven-outs into the Architect with a specific crew" can take an hour per attempt. That repetition was a major contributor to burnout near the finish line.

**Goal:** a developer-only mode where I can create any game state instantly (floor, marker, bankroll, shooters, hype, crew, comps, boss state, even the next dice roll) and test the exact scenario I care about in seconds.

**Proof it's needed (found while drafting this doc):** The Executive (F4) is supposed to start each fight at rating 2 (Strong). `rolls.ts` correctly sets `bossPointHits = 2` when the marker clears, but the pub (`recruit.ts:235`) then resets it to `0` for every boss except Mme. Le Prix. Since every player passes through the pub before the boss, **the real Executive fight starts at Action Required: one bad roll and it's PIP termination.** The integration tests seed the run directly at marker 11, so they skip the pub and never see it. Developer Mode, built on the *real* boss-entry path, would have caught this on the first try.

---

## 2. Goals / Non-goals

**Goals**
- Start a run at **any marker** with a fully specified state, in under 30 seconds.
- **Edit state mid-run** (bankroll, hype, shooters, boss counters…) without restarting.
- **Control the dice**: force the next roll, or queue a sequence.
- **Save and reuse scenarios** ("Executive one roll from PIP", "Architect at 4 seven-outs").
- **Zero impact on playtesters**: dev runs never touch the leaderboard, unlocks, or your real stats.
- Usable on **production** (including your phone), not just localhost.

**Non-goals (v1)**
- Not a general admin panel (no editing other users, no DB browser).
- No editing of game *config* (marker targets, crew stats). That's what code changes are for.
- Not available to playtesters in any form.

---

## 3. Key design decisions (for workshop)

These are the choices that shape everything else. Recommendations are marked ★.

### D1. Who can use it?
- ★ **Server-side allowlist of Clerk user IDs** in an env var (`DEV_CLERK_IDS=user_abc,...`). Checked on every dev request. `/auth/provision` returns `isDev: true` so the client knows to show the UI.
- Alternative: an `is_dev` boolean column on `users`. More flexible, but requires a migration and a way to set it. The env var is simpler and can't be flipped from the app.
- **Never** trust a client-side flag. The UI being hidden is cosmetic; the server is the gate.

### D2. Where does it work: local only, or production too?
- ★ **Both.** Local dev already points at the production database (see WHERE-I-LEFT-OFF.md), so "local only" buys no data safety. And testing on your phone against the real deploy is valuable (mobile layout, KI-013-type issues).
- Safety comes from D1 (allowlist) + D3 (dev-run isolation), not from the environment.
- Optional belt-and-braces: a `DEV_MODE_ENABLED=true` env var the API must have, so you can switch it off in prod instantly via Render without a deploy.

### D3. How do we keep dev runs from polluting real data?
- ★ **Add `is_dev_run boolean NOT NULL DEFAULT false` to `runs`.** (Additive migration, safe for existing rows.) Every dev-created run sets it. Then each side effect checks it:

| Side effect | Where | Dev-run behavior |
|---|---|---|
| Leaderboard submission | `submitLeaderboardEntry()` | **Skipped** |
| Crew unlock evaluation | `evaluateUnlocks()` | **Skipped** (see D5 for testing the cinematic) |
| `users.maxBankrollCents` | `rolls.ts` ~L1010 | **Skipped** |
| `users.highestMarkerReached` | `rolls.ts` ~L1024 | **Skipped** |
| Run-level comps (`runs.compPerkIds`) | `recruit.ts` | Allowed (they're per-run, so no account impact) |
| Feedback submissions | `feedback.ts` context | Allowed, tagged `isDevRun: true` |

- Alternative: a separate "dev" user account. Cleaner isolation, but you'd have to sign in and out, and real-account bugs (e.g. your unlock state) wouldn't reproduce. Not recommended.

### D4. Dice control
- There is **already** a `cheat_dice` field on `POST /runs/:id/roll` (`rolls.ts:541`), currently honored only for users who haven't finished the tutorial.
- ★ Extend the gate: honor `cheat_dice` when `!user.tutorialCompleted` **or** (`isDevUser && run.isDevRun`). Requiring a dev run means you can never accidentally rig your own real runs.
- Forced dice replace the RNG **before** the cascade, so dice-modifying crew still behave realistically. That's what you want for testing crew interactions.
- Add a **dice queue** (client-side list: `[6,1] → [4,4] → [3,4]`) consumed one per roll, plus one-tap presets: *Natural 7*, *Yo 11*, *Craps 2/3/12*, *Hit point*, *Seven-out*, *Hard 6/8*, *Easy 6/8*.

### D5. Unlocks and cinematics
- Default: dev runs never grant unlocks (D3).
- ★ Separate **"Preview" buttons** that play a cinematic client-side with fake data and persist nothing: *Unlock Recap (pick crew)*, *Floor Reveal (pick floor)*, *Boss Entry (pick boss)*, *Boss Victory + Comp*, *Pink Slip*, *Game Over*, *Victory sequence*.
- Account-level toggles that **do** persist, clearly labeled and confirm-gated: *Reset tutorial* (overlaps FB-017; share the backend), *Grant / revoke crew unlock*, *Reset unacknowledged unlocks*.

### D6. Where scenarios (presets) live
- ★ **In the repo**, as `packages/shared/src/devScenarios.ts`: version-controlled, reviewable, and they double as fixtures for integration tests. Adding one is a code change, which is fine for a solo dev.
- Plus a **"Copy current state as JSON"** button in the dev panel, so capturing a bug scenario from a live run is copy → paste into the file.
- Alternative: a `dev_scenarios` DB table, editable from the UI. More convenient, more to build. Could come later.

---

## 4. Features

### 4.1 Scenario Builder ("New Dev Run")
Entry point: a **DEV RUN** button on `TitleLobbyScreen`, visible only when `isDev`.

A form with sections. Picking a marker auto-fills **realistic defaults** (what a real player would plausibly have at that point), and every field can be overridden:

| Section | Fields | Realistic default |
|---|---|---|
| **Position** | Floor (1–9), Marker (1–3 / Boss), *or* pick from the 27-marker list | |
| **Money** | Bankroll ($) | e.g. 60% of marker target |
| | Pending additive / escrow ($) | 0 |
| **Table** | Shooters (1–7) | 5 (+1 if Member's Jacket) |
| | Hype (0.25–5.0×) | 1.0× |
| | Consecutive point hits | 0 |
| | Phase: Come-out / Point is _ (4–10) | Come-out |
| | Bets on the table (pass line, odds, hardways) | none |
| **Crew** | Unlocked slots (FB-025) | per marker progression |
| | Each slot: any **unlocked** crew + cooldown; **"Ignore unlocks"** toggle opens all 30 | random from unlocked |
| **Comps** | Checkbox per comp (8) | all comps from bosses already beaten |
| **Boss state** *(boss markers only)* | Per-boss control (see 4.2) | value the real entry path sets |
| **Entry** | ○ Start at table (fast) · ◉ Arrive via transition (real cinematics + pub, then the table) | Arrive via transition for boss markers; start at table otherwise |

**Create** → `POST /api/v1/dev/runs` → server builds the run → client calls the existing `connectToRun()` (same path as page-refresh recovery, so no new client hydration code).

### 4.2 Per-boss state controls
`bossPointHits` means something different for each boss, so the builder shows a friendly control instead of a raw number:

| Floor | Boss | Rule | Control |
|---|---|---|---|
| 1 | The Foreman | `EXTORTION_FEE` | *(none: stateless)* |
| 2 | Sarge | `RISING_MIN_BETS` | Escalation step (min-bet %) |
| 3 | Mme. Le Prix | `DISABLE_CREW` | Charmed slot (pick slot / random) |
| 4 | The Executive | `CROSS_CALIBRATION` | Rating: Action Required … Exceptional |
| 5 | The Hierophant | `TRIBUTE` | Escrow held ($) |
| 6 | The Sovereign | `TIDAL_SURGE` | Tide stage: LOW / EBB / HIGH / FLOW |
| 7 | The Commander | hype decay | *(use Hype field; preset buttons "just above/below 0.75×")* |
| 8 | The Emissary | `TRANSMISSION_DELAY` | Buffered additive ($) |
| 9 | The Architect | `CONVERGENCE` | Seven-outs so far (0–5) |

### 4.3 Live Dev Panel (in-game)
A slide-out drawer on `TableBoard`, opened by a small **DEV** tab or the backtick key (` ` `), only rendered when `isDev`. Locked while `isRolling || isCascading` (same rule as the crew rail).

- **Quick edits:** bankroll ±, set hype, set shooters, set boss counter, clear bets. Each sends `PATCH /api/v1/dev/runs/:id` and re-hydrates.
- **Dice:** next-roll picker, presets, queue (D4).
- **Jumps:** *Clear this marker now* (go through the real transition), *Jump to marker…*, *Force seven-out*, *Force game over*.
- **Inspector:** raw run JSON (read-only), last cascade events, last `turn:settled` payload. **Copy as scenario** button (D6).
- **Previews:** cinematic preview buttons (D5).

Every dev-modified run shows a persistent **DEV RUN** badge in the HUD so a dev run is never mistaken for a real one in screenshots or feedback.

### 4.4 Saved Scenarios
Dropdown in the Scenario Builder: pick a preset → form fills → tweak → create. Starter set:

- *Loading Dock fresh start* (tutorial-complete user, marker 1)
- *Foreman fight, mid-bankroll*
- *Le Prix: charm on your best crew*
- *Executive: one bad roll from PIP* (rating 0)
- *Executive: Exceptional streak* (rating 4)
- *Hierophant: big escrow, about to seven-out*
- *Sovereign: entering HIGH tide*
- *Commander: hype 0.80×, death-spiral edge*
- *Architect: 4 seven-outs, one crew left*
- *Final marker, one roll from victory* (tests the full victory sequence)

---

## 5. Architecture

### 5.1 API: new `routes/dev.ts`
All routes behind `requireClerkAuth` + new `requireDevUser` middleware (checks D1 allowlist; returns **404**, not 403, to non-devs, so the routes don't advertise themselves).

| Route | Purpose |
|---|---|
| `POST /api/v1/dev/runs` | Create a dev run from a scenario payload |
| `PATCH /api/v1/dev/runs/:id` | Edit fields on a dev run (rejects if `!isDevRun`) |
| `POST /api/v1/dev/runs/:id/jump` | Move to another marker via the real transition logic |
| `POST /api/v1/dev/account/reset-tutorial` | Account toggle (shared with FB-017) |
| `POST /api/v1/dev/account/unlocks` | Grant/revoke crew unlocks |

Zod schemas validate everything (ranges, crew IDs exist, slot count ≤ max, etc.).

### 5.2 The critical refactor: one boss-entry function

> **Shipped 2026-10-12 as hotfix `8e20992`.** `getBossEntryCounter(markerIndex)` in `packages/shared/src/config.ts` is now used at all three entry writes, and the `0 → 2` guards in `rolls.ts` were removed. The real impact turned out to be worse than described below: the guard meant PIP termination could never fire. The Le Prix charm pick remains in `recruit.ts` (it needs the final crew + RNG); the Scenario Builder must reuse the same pick logic (extract to a helper in Phase 2).
Boss-fight initialization is currently duplicated and **inconsistent** (that's the Executive bug above):

- `rolls.ts:400` (auto-collect path) sets `2` for `CROSS_CALIBRATION`, else `0`
- `rolls.ts:1204` (`nextBossCounter`) sets `2` for `CROSS_CALIBRATION`
- `recruit.ts:235` (pub exit) sets the charm slot for `DISABLE_CREW`, **else `0`** ← overwrites the 2

**Fix:** extract `initBossEntryState(markerIndex, crewSlots, unlockedSlots, rng)` into `packages/shared` (pure, unit-testable) and call it from all three sites **and** from the dev scenario builder. One source of truth means dev runs start exactly like real ones, and the Executive bug can't recur. This should ship **first**, independently of Dev Mode, as a hotfix.

### 5.3 Data model
- Migration: `runs.is_dev_run boolean NOT NULL DEFAULT false`. Additive; existing rows unaffected. Generated with `db:generate`, applied with `db:migrate` (never `db:push-unsafe`).
- Leaderboard query also filters `is_dev_run = false` defensively (via join), in case a dev entry ever slips through.
- No other schema changes for v1.

### 5.4 Client
- `useGameStore`: add `isDev` (from provision response), `isDevRun` (from run payload), `devDiceQueue`. Roll action attaches `cheat_dice` when the queue is non-empty.
- New components: `DevScenarioBuilder.tsx`, `DevPanel.tsx`, `DevRunBadge.tsx`, all portaled to `document.body` like `FeedbackModal`.
- Code-splitting: load dev components via `React.lazy()` only when `isDev`, so playtesters never download the code. (Not a security boundary, since the server is, but keeps the bundle clean.)

---

## 6. Implementation phases

| Phase | Scope | Value |
|---|---|---|
| **0. Hotfix** | `initBossEntryState()` refactor + fix the Executive starting-rating bug + test that goes through the pub | Fixes a live bug playtesters will hit |
| **1. Foundation** | Allowlist + `requireDevUser`, `is_dev_run` migration, side-effect suppression (D3), `DEV RUN` badge | Safe to create dev runs |
| **2. Scenario Builder** | `POST /dev/runs`, builder UI with realistic defaults + per-boss controls, saved scenarios file | **The big win:** jump anywhere instantly |
| **3. Dice control** | Extend `cheat_dice` gate, dice picker/presets/queue | Reproduce any roll sequence |
| **4. Live panel** | `PATCH`/`jump` routes, drawer, inspector, copy-as-scenario | Iterate without restarting |
| **5. Previews & account toggles** | Cinematic previews, reset tutorial (shares FB-017), unlock grant/revoke | Test transitions and unlock flows |

Phases 1–3 together are the MVP that removes most of the replay grind. Each phase is independently shippable.

### Testing
- Integration: non-dev user gets 404 on every `/dev/*` route; `cheat_dice` ignored on non-dev runs for tutorial-complete users; dev runs produce no leaderboard row, no unlocks, no user-stat changes.
- Unit: `initBossEntryState()` for all 9 bosses; scenario Zod schema accepts every preset in `devScenarios.ts`.
- The saved scenarios double as integration fixtures (e.g. "Executive one roll from PIP" → seven-out → assert PIP termination).

---

## 7. Decisions (workshopped 2026-10-12)

| # | Question | Decision |
|---|---|---|
| 1 | Production or local only? | **Both**, bound strictly to Mike's Clerk login via the `DEV_CLERK_IDS` allowlist (D1). No one else can reach any dev route or see any dev UI. |
| 2 | Crew available in the builder | **Account unlocks only by default**, with an **"Ignore unlocks"** toggle that opens all 30. |
| 3 | Jump to marker | **Plays the real cinematics** (transition, floor reveal, boss entry) on the way in. Separate preview buttons (D5) remain for replaying a cinematic in isolation. |
| 4 | Return to real run | **Not needed.** Starting a dev run simply replaces the tracked run ID. |
| 5 | More scenarios | **Iterate as needed.** Start with the §4.4 starter set; add presets when a repeated setup shows up. |
| 6 | Realistic bankroll default | *Proposed:* 60% of the marker target, always overridable. Tune after first use. |
| 7 | Where builder logic lives | *Proposed:* state construction in `packages/shared` (pure function), so it ports to a future local/Steam build. API route is a thin wrapper. |

### Implications of the decisions
- **Allowlist is the whole security story** (decision 1), so Phase 1 must include integration tests proving a non-allowlisted user gets 404 on every `/dev/*` route and that `cheat_dice` is ignored on their runs.
- **Jump = real transition** (decision 3): `POST /dev/runs/:id/jump` sets the run to `TRANSITION` at the target marker and lets the normal client orchestrator + pub + `initBossEntryState()` take it from there. This is also the most faithful test path (it would have caught the Executive bug).
- **Scenario Builder "Entry" field** (§4.1) collapses to: *Start at table* (fast, direct) vs. *Arrive via transition* (cinematics + pub, default for boss markers).
