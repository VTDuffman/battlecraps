# Implementation Manifest: FB-028 Developer Mode

**Design doc:** `docs/design/fb-028-developer-mode-design.md` (decisions in §7)
**Status:** Phase 0 shipped. Phases 1–5 **pending approval, one phase at a time.**

**Rules for every phase**
- Each phase ends at a **🛑 APPROVAL GATE**. Nothing in the next phase starts until Mike says go.
- Before a phase is called done: `npm run typecheck`, `npm run build`, `npm run test`, and the API integration suite (against Docker `postgres-test`, never prod). New tests listed per step must pass.
- Commit per step; push at the end of each approved phase.
- Anything that touches **production** (DB migration, Render env vars) is called out with ⚠️ and requires an explicit yes at that moment.

**Known pre-existing test failures (not caused by this work):** 6 API integration tests fail on `main` as of 2026-10-12 (Sarge min-bet ×2, Executive Exceptional bonus, Big Spender, Shark, recruit slot placement). They appear to be stale expectations from FB-025/026 balance changes (e.g. not accounting for the hype tick before payout). Track separately; don't let them mask new failures. Compare against this baseline.

---

## Phase 0: Boss-entry hotfix ✅

Shipped 2026-10-12 as `8e20992`. `getBossEntryCounter()` in `packages/shared/src/config.ts`; used in `rolls.ts` (auto-collect + `nextBossCounter`) and `recruit.ts` (pub exit). Removed the `0 → 2` rating guards. Executive PIP termination works again.

--- Implemented ---

---

## Phase 1: Foundation (access control + dev-run isolation)

**Outcome:** The server knows who the developer is, dev runs are flagged, and dev runs cannot touch the leaderboard, unlocks, or account stats. No visible features yet besides a badge.

### Step 1.1: Dev access middleware
**Goal:** One function decides "is this request from Mike?" Everything dev-related goes through it.
**Files:** `@apps/api/src/lib/clerkAuth.ts` (read only), `@apps/api/src/lib/devAuth.ts` (new), `@.env.example`
**Prompt:**
> Create `apps/api/src/lib/devAuth.ts` exporting:
> - `isDevClerkId(clerkId: string): boolean`: true only when `process.env.DEV_MODE_ENABLED === 'true'` AND `clerkId` is in the comma-separated `process.env.DEV_CLERK_IDS` (trim entries, ignore empties). Read env on every call (no caching) so a Render env change takes effect on restart without code changes.
> - `requireDevUser`: a Fastify preHandler meant to run *after* `requireClerkAuth`. If `!isDevClerkId(request.clerkId)`, reply **404** `{ error: 'Not found' }` (not 403, so dev routes aren't discoverable).
>
> Add `DEV_MODE_ENABLED=false` and `DEV_CLERK_IDS=` with a comment block to `.env.example`.

**Done when:** unit-level behavior covered by Step 1.5 tests.

### Step 1.2: `is_dev_run` column ⚠️ production migration
**Goal:** Flag dev runs at the data level.
**Files:** `@apps/api/src/db/schema.ts`, `apps/api/drizzle/` (generated)
**Prompt:**
> In `schema.ts`, add to the `runs` table: `isDevRun: boolean('is_dev_run').notNull().default(false)` with a doc comment ("FB-028: true for runs created via Developer Mode. Excluded from leaderboard, unlocks, and user stats."). Run `npm run db:generate`. Show me the generated SQL. It must contain only `ALTER TABLE "runs" ADD COLUMN "is_dev_run" boolean DEFAULT false NOT NULL`. Do **not** run `db:migrate`.

**Then:** ⚠️ Mike approves → `npm run db:migrate` (applies to production Supabase). Additive, existing rows default to `false`. **Never** `db:push-unsafe`.

### Step 1.3: Suppress real-world side effects for dev runs
**Goal:** Dev runs can't pollute data playtesters see.
**Files:** `@apps/api/src/routes/rolls.ts`, `@apps/api/src/routes/leaderboard.ts`, `@apps/api/src/lib/unlocks.ts` (read only), `@apps/api/src/routes/feedback.ts`
**Prompt:**
> In `rolls.ts`, when `run.isDevRun` is true, skip: every `submitLeaderboardEntry(...)` call (stuck-run path ~L317, auto-collect path ~L416, main path ~L998), the `evaluateUnlocks(...)` call (~L982), the `users.maxBankrollCents` update (~L1010), and the `users.highestMarkerReached` update (~L1024). Also, in the `turn:settled` / HTTP payloads, report `highestMarkerReached` as the user's unchanged value for dev runs. Use a single `const isDevRun = run.isDevRun === true;` near the top of the handler.
>
> In `leaderboard.ts` `submitLeaderboardEntry`, add an early return if `run.isDevRun` (defense in depth).
>
> In `feedback.ts`, if the submission context references a run, add `isDevRun: boolean` to the stored `context` JSON (look the run up by id; default false).

### Step 1.4: Tell the client
**Goal:** The client knows if you're a dev and if the current run is a dev run.
**Files:** `@apps/api/src/routes/auth.ts`, `@apps/api/src/routes/runs.ts`, `@apps/web/src/store/useGameStore.ts`, `@apps/web/src/App.tsx`, `@apps/web/src/components/TableBoard.tsx`, `@apps/web/src/components/DevRunBadge.tsx` (new)
**Prompt:**
> API: `POST /auth/provision` response gains `isDev: isDevClerkId(req.clerkId)`. `GET /runs/:id` and `POST /runs` responses gain `isDevRun`.
> Store: add `isDev: boolean` (default false, set from the provision response in `App.tsx`) and `isDevRun: boolean` (set in `connectToRun` from initial state; reset on disconnect).
> Create `DevRunBadge.tsx`: small fixed pill reading `DEV RUN` (magenta background, white monospace text, `pointer-events-none`). Render it in `TableBoard`'s HUD only when `isDevRun`.

### Step 1.5: Tests
**Files:** `@apps/api/src/__tests__/helpers/testSetup.ts`, `@apps/api/src/__tests__/integration/dev.test.ts` (new)
**Prompt:**
> Add integration tests (set `DEV_MODE_ENABLED`/`DEV_CLERK_IDS` per-test via `process.env`, restore after):
> 1. `isDevClerkId` false when `DEV_MODE_ENABLED` is unset, even if the id is listed.
> 2. A dev run (`createRun(userId, { isDevRun: true, ... })`) that triggers GAME_OVER produces **no** `leaderboard_entries` row.
> 3. A dev run roll that would satisfy an unlock condition grants no unlock.
> 4. A dev run reaching a new marker does not change `users.highest_marker_reached` or `max_bankroll_cents`.
> 5. A non-dev run still does all of the above (control).

### ⚠️ Rollout step (Mike, manual)
On Render (API service) set `DEV_MODE_ENABLED=true` and `DEV_CLERK_IDS=<your Clerk user id>`. Claude can look up your Clerk id from the `users` table by your email (read-only query) when we get here. Add the same two vars to local `apps/api/.env`.

### 🛑 APPROVAL GATE: Phase 1
Demo: you see `isDev: true` in the provision response; nobody else does. No user-visible change for playtesters.

---

## Phase 2: Scenario Builder (the big win)

**Outcome:** From the title screen, create a run at any marker with any state in seconds.

### Step 2.1: Shared scenario model + realistic defaults
**Goal:** A pure function that turns a scenario into run column values. Lives in `shared` so it's unit-testable and ports to a future local/Steam build.
**Files:** `@packages/shared/src/config.ts` (read only), `@packages/shared/src/types.ts` (read only), `@packages/shared/src/devScenario.ts` (new), `@packages/shared/src/index.ts`
**Prompt:**
> Create `devScenario.ts` exporting:
> - `type DevScenario`: `{ name?: string; markerIndex: number; bankrollCents?: number; shooters?: number; hype?: number; consecutivePointHits?: number; phase?: 'COME_OUT' | 'POINT_ACTIVE'; point?: 4|5|6|8|9|10; bets?: Bets; crew?: (number | null)[] /* crew ids by slot */; unlockedSlots?: 3|4|5; compPerkIds?: number[]; bossCounter?: number; pendingAdditiveCents?: number; entry?: 'table' | 'transition'; ignoreUnlocks?: boolean }`.
> - `getRealisticDefaults(markerIndex)`: bankroll = 60% of `MARKER_TARGETS[markerIndex]` rounded to the dollar; `compPerkIds` = comp perk ids of every boss with index < markerIndex (skip `'NONE'` and slot-unlock comps with perkId 0); `unlockedSlots` = 3, +1 if Board Seat's boss is beaten, +1 more if Cargo Hold's boss is beaten; `shooters` = 5 (+1 if Member's Jacket); `hype` 1.0; `bossCounter` = `getBossEntryCounter(markerIndex)`; `entry` = `'transition'` if boss marker else `'table'`.
> - `buildDevRunState(scenario, defaults)`: merges and clamps (bankroll ≥ 0, shooters 1–7, hype 0.25–10, unlockedSlots 3–5, bossCounter clamped per rule: CROSS_CALIBRATION 0–4, CONVERGENCE 0–5, TIDAL_SURGE 0–3, DISABLE_CREW 0..unlockedSlots-1). Returns the run insert fields (minus `userId`/`crewSlots` hydration).
> Export from `index.ts`. Strict null checks on every array lookup.

### Step 2.2: Extract Le Prix entry-charm pick
**Goal:** Dev runs entering Mme. Le Prix pick the charmed crew exactly like real runs.
**Files:** `@apps/api/src/routes/recruit.ts`, `@packages/shared/src/config.ts`
**Prompt:**
> Move the DISABLE_CREW entry-charm selection in `recruit.ts` (step 5b) into a shared pure function `pickEntryCharmSlot(crewSlots, unlockedSlots, randomBelow: (n: number) => number): number | null`. Call it from `recruit.ts` with the server RNG. No behavior change; existing tests must still pass.

### Step 2.3: Preset scenarios
**Files:** `@packages/shared/src/devScenarios.ts` (new)
**Prompt:**
> Export `DEV_SCENARIOS: readonly DevScenario[]` with the starter set from design doc §4.4 (Loading Dock fresh start; Foreman mid-bankroll; Le Prix charm; Executive one roll from PIP (bossCounter 0); Executive Exceptional (4); Hierophant big escrow, point active; Sovereign entering HIGH tide (bossCounter 2); Commander hype 0.80×; Architect 4 seven-outs; final marker one roll from victory). Each has a `name`. Add a unit test that every preset passes `buildDevRunState` without clamping changes.

### Step 2.4: `POST /api/v1/dev/runs`
**Goal:** Create a dev run from a scenario.
**Files:** `@apps/api/src/routes/dev.ts` (new), `@apps/api/src/server.ts`, `@apps/api/src/routes/runs.ts` (read only, for response shape), `@apps/api/src/lib/crewRegistry.ts` (read only)
**Prompt:**
> Create `devPlugin` with `preHandler: [requireClerkAuth, requireDevUser]`. `POST /dev/runs` validates a `DevScenario` body with Zod (crew ids exist; length ≤ unlockedSlots; unless `ignoreUnlocks`, every non-starter crew id must be in `user.unlockedCrewIds` → 422 listing the locked ids).
>
> **Entry handling** (design decision 3, play real cinematics):
> - `entry: 'table'` → insert run at `markerIndex`, status `IDLE_TABLE` (or `POINT_ACTIVE` if `phase`/`point` given) with the built state. Entry cinematics (MARKER_INTRO / FLOOR_REVEAL / BOSS_ENTRY) fire on their own from `TransitionOrchestrator` detection.
> - `entry: 'transition'` (markerIndex ≥ 1) → insert run at `markerIndex - 1`, status `IDLE_TABLE`, bankroll = that marker's target. The client's existing auto-collect (KI-065) then clears it through the **real** roll path → celebration → pub → recruit (`getBossEntryCounter` / charm pick) → table → boss entry. Carry the scenario's crew/comps/slots; return `pendingScenarioOverrides` (bossCounter, hype, shooters, pendingAdditive) for the client to apply via PATCH after the pub (Phase 4) or ignore in v1.
>
> Set `isDevRun: true`. Mark any of the user's other non-GAME_OVER **dev** runs as `GAME_OVER` (leave real runs untouched). Return the same shape as `POST /runs`. Register in `server.ts` with prefix `/api/v1`.

### Step 2.5: Scenario Builder UI
**Files:** `@apps/web/src/components/TitleLobbyScreen.tsx`, `@apps/web/src/components/dev/DevScenarioBuilder.tsx` (new), `@apps/web/src/App.tsx`, `@apps/web/src/store/useGameStore.ts` (read only)
**Prompt:**
> In `TitleLobbyScreen`, when `isDev`, show a `DEV RUN` button (magenta outline) that opens `DevScenarioBuilder`, loaded with `React.lazy` so non-devs never download it. Portal to `document.body` (same pattern as `FeedbackModal`).
>
> Builder layout (mobile-first, single column, collapsible sections): **Preset** dropdown (`DEV_SCENARIOS`) → **Position** (27-marker select showing "F4 · Boss · The Executive · $15k") → **Money** → **Table** → **Crew** (slot pickers filtered to unlocked crew; "Ignore unlocks" toggle) → **Comps** (checkboxes) → **Boss** (per-boss control from design §4.2, only for boss markers) → **Entry** (table / transition). Picking a marker refills from `getRealisticDefaults`. Dollar inputs in dollars, converted to cents.
>
> **Create** → `POST /api/v1/dev/runs` → `localStorage.setItem('bc_run_id', runId)` → `connectToRun(runId, initialState)` (same as normal new-run flow in `App.tsx`).

### Step 2.6: Tests
**Prompt:**
> Unit: `getRealisticDefaults` for markers 0, 3, 11, 20, 26 (comps/slots/shooters correct). Integration: non-dev → 404 on `POST /dev/runs`; locked crew without `ignoreUnlocks` → 422; `entry: 'transition'` into marker 11 → after a skip-recruit the run is at marker 11 with `bossPointHits` 2 (end-to-end proof of Phase 0); created run has `isDevRun = true`.

### 🛑 APPROVAL GATE: Phase 2
Demo: from the title screen, start "Executive one roll from PIP", lose one roll, see the Pink Slip. Under a minute.

---

## Phase 3: Dice control

**Outcome:** Choose exactly what the next roll(s) will be.

### Step 3.1: Server gate
**Files:** `@apps/api/src/routes/rolls.ts`, `@apps/api/src/lib/devAuth.ts`
**Prompt:**
> At the dice generation step (~L541), honor `cheat_dice` when `!user.tutorialCompleted` **or** (`isDevClerkId(request.clerkId) && run.isDevRun`). Update the comment. Forced dice replace RNG before the cascade (dice-modifying crew still apply). Log `request.log.info({ runId, cheatDice }, '[dev] forced dice')` for dev usage.

### Step 3.2: Store dice queue
**Files:** `@apps/web/src/store/useGameStore.ts`
**Prompt:**
> Add `devDiceQueue: [number, number][]`, `pushDevDice(d)`, `clearDevDice()`. In the main roll request (~L2070; leave the auto-collect request ~L1505 alone), if `isDevRun && devDiceQueue.length > 0`, shift the first entry and send it as `cheat_dice`. Clear the queue on `connectToRun`/disconnect.

### Step 3.3: Dice control widget
**Files:** `@apps/web/src/components/dev/DevDiceControl.tsx` (new), `@apps/web/src/components/TableBoard.tsx`
**Prompt:**
> Small collapsible widget (shown only when `isDevRun`, lazy-loaded) near the dice zone: two d6 pickers + **Queue**; preset chips that compute dice from current state: *Natural 7* `[3,4]`, *Yo 11* `[5,6]`, *Craps 2/3/12*, *Hit point* (pair summing to the current point, non-hard where possible), *Seven-out* `[3,4]` (only in point phase), *Hard 4/6/8/10*, *Easy 6/8*. Show the queue as chips with ✕ to remove. Disabled while `isRolling || isCascading`.

### Step 3.4: Tests
> Integration: tutorial-complete **non-dev** user's `cheat_dice` is ignored (result differs from forced over N tries or spy on `rollDice`); dev user on a **real** (non-dev) run is ignored; dev user on dev run is honored.

### 🛑 APPROVAL GATE: Phase 3

---

## Phase 4: Live Dev Panel

**Outcome:** Change anything mid-run without restarting.

### Step 4.1: `PATCH /api/v1/dev/runs/:id`
**Files:** `@apps/api/src/routes/dev.ts`
**Prompt:**
> Partial update with Zod: `bankrollCents, shooters, hype, consecutivePointHits, bossCounter (→ bossPointHits, clamped per rule), pendingAdditiveCents, unlockedSlots, compPerkIds, crew (ids by slot), clearBets: boolean`. Reject (409) if `!run.isDevRun`, not the caller's run, or status `RESOLUTION`. Optimistic lock on `updatedAt` like `reorder.ts`. Return the full run state (same shape as `GET /runs/:id`).

### Step 4.2: Jump + force actions
**Files:** `@apps/api/src/routes/dev.ts`
**Prompt:**
> `POST /dev/runs/:id/jump { markerIndex }`: reuses `buildDevRunState` + the `entry: 'transition'` approach from Step 2.4 (set to markerIndex − 1 at target bankroll, keep crew/comps; client auto-collect runs the real clear + cinematics). `POST /dev/runs/:id/force { action: 'GAME_OVER' }` sets status GAME_OVER (dev run only). *Clear this marker* needs no endpoint: PATCH bankroll to the marker target and the client's auto-collect does the rest.

### Step 4.3: Panel UI
**Files:** `@apps/web/src/components/dev/DevPanel.tsx` (new), `@apps/web/src/components/TableBoard.tsx`, `@apps/web/src/store/useGameStore.ts`
**Prompt:**
> Slide-out drawer (right side, portaled, lazy) opened by a `DEV` tab or the backtick key, only when `isDev`. Locked while `isRolling || isCascading`. Sections: **Quick edits** (bankroll ±$100/±10%/set, hype set, shooters ±, boss control per §4.2, clear bets) → PATCH then re-hydrate via a new store action `refreshRunFromServer()` (wraps `GET /runs/:id` + existing hydration used by `connectToRun`). **Dice** (embed `DevDiceControl`). **Jumps** (marker select + Jump; Clear marker; Force game over). **Inspector** (read-only JSON of current run state + last `turn:settled` payload + last cascade events; store the last payloads in a dev-only slice). **Copy as scenario** (serialize current state to `DevScenario` JSON → clipboard).

### Step 4.4: Tests
> Integration: PATCH rejected for real runs and other users' runs; clamps out-of-range boss counters; jump into marker 11 + skip recruit → rating 2.

### 🛑 APPROVAL GATE: Phase 4

---

## Phase 5: Cinematic previews & account toggles

### Step 5.1: Cinematic previews (no server, no persistence)
**Files:** `@apps/web/src/transitions/TransitionOrchestrator.tsx`, `@apps/web/src/store/useGameStore.ts`, `@apps/web/src/components/dev/DevPanel.tsx`
**Prompt:**
> First, **investigate and report** before changing anything: which store fields each `activeTransition` type reads (UNLOCK recap, FLOOR_REVEAL, BOSS_ENTRY, BOSS_VICTORY + comp, VICTORY, GAME_OVER, Pink Slip) and whether they can be fed temporary values without disturbing the live run. Then propose a `previewTransition(type, fakeData)` store action that snapshots the affected fields, sets fake values + `activeTransition`, and restores the snapshot when the sequence completes. Add preview buttons to DevPanel. Must never call the API.

### Step 5.2: Account toggles ⚠️ persist to your real account
**Files:** `@apps/api/src/routes/dev.ts`, `@apps/web/src/components/dev/DevPanel.tsx`
**Prompt:**
> `POST /dev/account/reset-tutorial` (sets `users.tutorialCompleted = false`; design shared with FB-017 so that feature can reuse it). `POST /dev/account/unlocks { grant?: number[]; revoke?: number[]; resetUnacknowledged?: boolean }`. Panel section "Account (persists!)" with a confirm dialog on every action.

### Step 5.3: Tests
> Integration: both routes 404 for non-devs; unlock grant/revoke round-trips.

### 🛑 APPROVAL GATE: Phase 5 → mark FB-028 Implemented in backlog + CLAUDE.md.

---

## Implementation order summary

| Phase | Steps | Prod-touching | Size |
|---|---|---|---|
| 0 Hotfix | done | deployed | S |
| 1 Foundation | 1.1–1.5 | ⚠️ migration + Render env vars | M |
| 2 Scenario Builder | 2.1–2.6 | no | L |
| 3 Dice control | 3.1–3.4 | no | S |
| 4 Live panel | 4.1–4.4 | no | M |
| 5 Previews & account | 5.1–5.3 | ⚠️ account toggles (your account only) | M |
