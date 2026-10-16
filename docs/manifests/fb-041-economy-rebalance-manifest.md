# Implementation Manifest: FB-041 Economy Rebalance

**Design doc:** `docs/design/fb-041-economy-rebalance-design.md`
**Evidence:** `docs/design/gauntlet-difficulty-audit.md`
**Status:** Planned (2026-10-15).

**Rules:**
- Each phase ends at a 🛑 gate.
- Before a phase is done, run `npm run typecheck`, `npm run build` and `npm run test`, plus the API integration suite whenever the server changes.
- Push when Mike says.
- All crew/player references are gender-neutral.
- No other balance numbers change in FB-041: no comp trims, no table-max or target changes.

**Releases:**
- **Release 1:** Phase 1 (the opening).
- **Release 2:** Phases 2–4 (crew-cash taper + crew Hype ×1.5, validated together).

---

## Phase 0: Decisions + baseline

**Goal:** lock D1–D4 from the design doc and record today's sim baseline, for before/after comparison.

**Steps:**
1. ✅ Decisions made 2026-10-15:
   - D1: the player picks from 3 random Starters.
   - D2: Hype values as in the table.
   - D3: the gentler taper A (A+ is ready to pull).
   - D4: two releases.
2. Run and save the baseline outputs to `scripts/sim/baselines/pre-fb-041/` (committed, so Phase 4 can compare from any session):
   - `npm run build -w @battlecraps/shared`
   - `SIM_N=4000 node scripts/sim/gauntlet-economy-sim.mjs early`
   - `… options`
   - `… packages`

🛑 **Gate:** baseline saved.

--- Implemented (2026-10-15): baseline captured at `main` 1deed07 in `scripts/sim/baselines/pre-fb-041/` (`early.txt`, `options.txt`, `packages.txt` + README with the key numbers). Today: reach Floor 4 13% / 11% (cash / mixed · pass); finish given Floor 5 73% / 73%; whole run 8% / 6%. Matches the audit within ±2. ---

---

## Phase 1: The opening — "First Round's on the House" (Release 1)

**Goal:** post-tutorial runs start with $40 and one free Starter picked at a marker-0 pub. The tutorial run is unchanged.

**Files:**
- `@apps/api/src/routes/runs.ts`
- `@apps/api/src/routes/pubDraft.ts`
- `@apps/api/src/routes/recruit.ts`
- `@apps/web/src/components/PubScreen.tsx`
- `@apps/web/src/transitions/TransitionOrchestrator.tsx`
- `@apps/web/src/store/useGameStore.ts`
- `@apps/web/src/components/GameOverScreen.tsx`
- `@apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx`

**Steps:**
1. **Server, create:** `POST /runs`.
   - If `user.tutorialCompleted`: `bankrollCents: 4000`, `status: 'TRANSITION'` at marker 0.
   - Otherwise: unchanged ($30, IDLE_TABLE).
   - Add `OPENING_BANKROLL_CENTS` (4000) and `TUTORIAL_BANKROLL_CENTS` (3000) to shared `config.ts`; no magic numbers.
2. **Server, draft:** `GET /runs/:id/pub-draft` at `currentMarkerIndex === 0`.
   - Draft **3 random crew from the Starter roster only** (`isStarterRoster`): the same count and screen as a normal visit. No cleared-marker rarity tier, no unlocked crew, no guaranteed unlocks.
   - Save it to `pub_draft` like any visit; it must not re-roll.
3. **Server, recruit:** `POST /runs/:id/recruit` at marker 0.
   - `hireCost = 0`.
   - Skip the comp-slot grant, the boss entry counter and the Le Prix entry charm (all keyed off `currentMarkerIndex - 1`).
   - Skip is allowed.
   - Exit → IDLE_TABLE at marker 0.
   - The draft-membership check stays.
4. **Client:** a TRANSITION status at marker 0 on a new run opens PubScreen in "opening" mode.
   - Title "FIRST ROUND'S ON THE HOUSE"; price shows FREE.
   - Then the marker 0 intro.
   - Page refresh at the opening pub must restore it (`GET /runs/:id` already returns TRANSITION).
5. **Copy:**
   - GameOverScreen: "NEW RUN · $40 BANKROLL · ONE CREW ON THE HOUSE".
   - How to Play: "Starting bankroll" $40.00 (+ "$30 in the tutorial").
   - Grep player-facing copy for "$30".
6. **Dev Mode:** dev runs are created via `dev.ts` and keep their scenario bankroll/crew; no change unless a scenario starts at marker 0 with TRANSITION.
7. **Tests (API integration):**
   - Tutorial-pending create → $30 + IDLE_TABLE.
   - Post-tutorial create → $40 + TRANSITION.
   - Marker-0 draft is Starter-only and stable across refetches.
   - Free hire → bankroll still $40, crew seated, IDLE_TABLE.
   - Skip → $40, no crew.
   - Hiring a non-draft crew → 4xx.

**Prompt:** "Implement FB-041 Phase 1 per `docs/design/fb-041-economy-rebalance-design.md` § Change 1. Post-tutorial `POST /runs` creates a run at marker 0 with $40 (`OPENING_BANKROLL_CENTS`) in status TRANSITION. Tutorial-pending runs stay $30 IDLE_TABLE (`TUTORIAL_BANKROLL_CENTS`). At marker 0: pub-draft offers 3 random Starter-roster crew only (saved, never re-rolled; no unlocked or guaranteed crew); recruit costs $0 and skips all logic keyed off the cleared marker (comp slots, boss entry, charm); skip allowed. Client: PubScreen 'opening' mode ('FIRST ROUND'S ON THE HOUSE', FREE price) before the marker 0 intro; refresh-safe. Update the $30 copy in GameOverScreen and BattleCrapsRulesSection. Add the integration tests listed in the manifest."

--- Implemented (2026-10-15):
- **Shared `config.ts`:** `TUTORIAL_BANKROLL_CENTS`, `OPENING_BANKROLL_CENTS`, `isOpeningPub(markerIndex)`.
- **`runs.ts`:** a post-tutorial create → $40 + TRANSITION at marker 0.
- **`pubDraft.ts`:** at the opening pub, 3 random `isStarterRoster` crew, no unlocked or guaranteed crew, `hireCostCents` 0.
- **`recruit.ts`:** opening hire costs $0. The existing marker-cleared logic already tolerates index −1: no comp, 3 slots, boss counter 0.
- **`PubScreen`:** opening mode ("FIRST ROUND'S ON THE HOUSE", FREE price, "HIRE — ON THE HOUSE", "NO THANKS · TO THE TABLE"). The orchestrator already routes TRANSITION → PubScreen, and after leaving it the normal title / marker-0 intro play.
- **Copy:** GameOverScreen, How to Play.
- **CLAUDE.md:** key constraint added.
- **Tests:** `opening.test.ts` (8): tutorial $30 at the table; post-tutorial $40 at the pub; Starter-only draft, free, stable; unlocked/guaranteed ignored; free hire; skip; non-offered → 403; marker-1 pub still charges.
- **Results:** shared 489, integration 159.
- **Side effect:** Lucky Charm's "solo floor" unlock becomes reachable on Floor 1, since a run can start with exactly one crew member.
- **Playtest fix (2026-10-15):** the tutorial run's first pub (after marker 0) offered Uncommon crew. Now `isStarterOnlyPub` (markers 0–1) makes a run's first pub Starter-only at either point. Guaranteed unlocks stay queued for the next pub. +2 tests; the late-unlock draft test moved to marker 2. Integration 161.
- **✅ Gate passed (2026-10-15, Mike, local playtest):** the tutorial plays as before and takes the player to the second marker after the pub. Later runs open on a free crew pick and start on Floor 1 with $40. ---

🛑 **Gate:**
- Locally: a fresh account plays the tutorial unchanged.
- A second run opens the free pick, the table starts at $40 with that crew member, and refresh at the pick restores it.
- Typecheck/build/test + integration pass.
- → Release 1.

---

## Phase 2: Crew-cash taper (Release 2, part 1)

**Goal:** floor-scaled crew cash uses `CREW_CASH_SCALE_BY_FLOOR` (×1.0 on Floors 1–4, then ×0.8 / 0.7 / 0.6 / 0.5 / 0.45), from one shared helper.

**Files:**
- `@packages/shared/src/config.ts`
- `@packages/shared/src/types.ts`
- `@packages/shared/src/crapsEngine.ts`
- `@apps/api/src/routes/rolls.ts`
- The 12 cash crew files under `@packages/shared/src/crew/`: `doorman.ts`, `grinder.ts`, `aceMcgee.ts`, `closeCall.ts`, `evenKeel.ts`, `bookkeeper.ts`, `contrarian.ts`, `pressureCooker.ts`, `bigSpender.ts`, `regular.ts`, `shark.ts`, `mathlete.ts`
- `@packages/shared/src/__tests__/crew.test.ts`
- `@apps/web/src/components/CrewPortrait.tsx`

**Steps:**
1. **`config.ts`:** `CREW_CASH_SCALE_BY_FLOOR` (Floors 1–9, the shipped curve A).
   - Right above it, add a comment with the steeper A+ curve, ready to swap in: `// Steeper A+ (analysed in FB-041, ready to pull): 1, 1, 1, 1, 0.7, 0.6, 0.5, 0.45, 0.4 — see fb-041 design doc § Change 2`.
   - Add `getCrewCashBaseCents(markerIndex)` = `Math.floor(target × 0.10 × scale)`, guarded for out-of-range indices. Export both from `index.ts`.
2. **`types.ts` / `crapsEngine.ts`:** add `crewCashBaseCents` to `TurnContext`, populated from a new optional `resolveRoll` state field (default `floor(markerTargetCents × 0.10)` so old callers and tests keep today's math).
3. **`rolls.ts`:** pass `crewCashBaseCents: getCrewCashBaseCents(run.currentMarkerIndex)` at the single `resolveRoll` call.
4. **12 crew files:** replace `const maxBet = Math.floor(ctx.markerTargetCents * 0.10);` with `const maxBet = ctx.crewCashBaseCents;`. Keep every `ADDITIVE_MULT` and the rounding unchanged.
5. **`CrewPortrait.getAbilityDesc`:** use `getCrewCashBaseCents(currentMarkerIndex)` so tooltips show the real amount. Pass the marker index instead of `markerTargetCents`.
6. **Tests:**
   - Crew tests build contexts with `crewCashBaseCents`.
   - New config tests: marker 9 (×1.0) and marker 24 (×0.45).
   - New integration test: a Floor 6 Doorman come-out pays 0.25 × 0.7 × max bet.

**Prompt:** "Implement FB-041 Phase 2 per the design doc § Change 2. Add `CREW_CASH_SCALE_BY_FLOOR` + `getCrewCashBaseCents(markerIndex)` to shared config. Add `crewCashBaseCents` to TurnContext via resolveRoll's state (default `floor(markerTargetCents*0.10)`). Pass it from rolls.ts. In the 12 listed crew files swap the 10%-of-target line for `ctx.crewCashBaseCents`. Update CrewPortrait's tooltip amounts to use the helper, and update/add the tests listed."

--- Implemented (2026-10-15):
- **Shared `config.ts`:** `CREW_CASH_SCALE_BY_FLOOR` = [1, 1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.45] with the A+ curve in its comment, and `getCrewCashBaseCents(markerIndex)`.
- **`TurnContext.crewCashBaseCents`** via `resolveRoll` state (default: the untapered 10% of the target). `rolls.ts` injects the helper.
- **12 cash crew** read `ctx.crewCashBaseCents`. No crew file references `markerTargetCents` any more.
- **`CrewPortrait`** tooltips use the helper. The test helper `makeCtx` derives the base from `markerTargetCents` unless set, so existing crew tests are unchanged.
- **Tests:** shared +9 (config taper, Doorman/Grinder pay from the base, resolveRoll pass-through/default), so 498. Integration +3 (`crewCashTaper.test.ts`: a Doorman point-set pays ×1.0 on Floor 4, ×0.7 on Floor 6, ×0.45 on Floor 9), so 164.
- **Escrow tests re-baselined:** the Hierophant / Emissary expectations moved to tapered amounts (Ace 320k at ×0.8; Ace 30M and Shark 48.75M at ×0.5).
- **CLAUDE.md** FB-024 line updated.
- **Sim:** `gauntlet-economy-sim.mjs` doesn't pass the base yet, so it still models pre-FB-041 crew cash until Phase 4. ---

🛑 **Gate:** typecheck/build/test + integration pass. In Dev Mode, a Floor 8 jump shows tooltips at half today's amounts.

---

## Phase 3: Crew Hype ×1.5 (Release 2, part 2)

**Goal:** Hype crew add 1.5× today's boosts (values per the design doc table, as decided in D2).

**Files:**
- `@packages/shared/src/crew/`: `lookout.ts`, `momentum.ts`, `echo.ts`, `handicapper.ts`, `oddCouple.ts`, `mirror.ts`, `silverLining.ts`, `pressureCooker.ts`, `hypeTrainHolly.ts`, `nervousIntern.ts`, `drunkUncle.ts` (and `luckyCharm.ts` only if D2 changes it)
- `@packages/shared/src/__tests__/crew.test.ts`
- `@apps/api/src/db/seed.ts`
- `@apps/web/src/components/CrewPortrait.tsx`
- `@docs/frameworks/crew_framework.md`

**Steps:**
1. Update each `HYPE_BOOST` / delta constant to the decided value.
2. Update the matching tests.
3. **Copy:** `seed.ts` crew descriptions with explicit numbers (e.g. Holly "+0.15× Hype" → "+0.25×", Nervous Intern "+0.30×" → "+0.45×", Drunk Uncle "+0.5×" → "+0.75×"). Also `CrewPortrait` ABILITY_DESCRIPTIONS / bark comments with numbers, and `crew_framework.md`.
4. **Check:** grep `apps/web/src` and `docs` for each old value next to "Hype" to catch stragglers (help sections, Sal).

**Prompt:** "Implement FB-041 Phase 3 per the design doc § Change 3: set the listed crew Hype boosts to the new values, update their tests, and update every player-facing copy source that states a number (seed.ts, CrewPortrait.tsx, crew_framework.md). Don't change base Hype ticks, tier thresholds or The Whale."

--- Implemented (2026-10-15, on the Phase 2 branch / PR #38 so Release 2 ships together):
- **New values:** Lookout +0.30, Momentum / Odd Couple / Mirror +0.3, Echo / Silver Lining +0.6, Handicapper +0.45 / 0.3 / 0.15, Pressure Cooker +0.75 Hype (cash part unchanged, tapered by Phase 2), Holly +0.25, Nervous Intern +0.45, Drunk Uncle +0.75 / −0.25. Lucky Charm unchanged.
- **Code comments** updated in each crew file.
- **Copy:** `seed.ts` (brief + detailed), `CrewPortrait` ability text, `crew_framework.md`. No help or Sal copy states crew Hype numbers.
- **Tests re-baselined:**
  - `crew.test.ts`, `crew/handicapper.test.ts`, `cascade.integration.test.ts`, `godBuild.integration.test.ts` (shared, 498).
  - Integration `cascade.test.ts` Pressure Cooker / Handicapper.
  - `vig.test.ts` (from #39) rescaled for the Phase 2 taper.
  - Integration 169.
- `main` (incl. #39 Vig receipt line) merged into the branch. ---

🛑 **Gate:**
- Typecheck/build/test pass.
- Re-seed locally and check the pub/crew tooltips show the new values.

---

## Phase 4: Sim validation + tuning (Release 2 gate)

**Goal:** confirm the shipped numbers land in the target bands before Release 2.

**Files:** `@scripts/sim/gauntlet-economy-sim.mjs`

**Steps:**
1. **Update the sim's defaults to the new game.**
   - The new-run start reads `OPENING_BANKROLL_CENTS` with one free crew member.
   - Crew cash reads `crewCashBaseCents` from the engine: pass `getCrewCashBaseCents(m)` into `resolveRoll` instead of scaling the target.
   - Hype comes from the crew files automatically.
   - After this, `BASE_LEVERS` identity = the shipped game. Keep the levers for future tuning, but drop the now-baked-in packages from `PACKAGES` / `OPTIONS`, or relabel them "pre-FB-041".
2. **Run `early`, `options`, `packages` at `SIM_N=4000` and check the bands:**
   - Reach Floor 4: 35–45% for cash/mixed crews.
   - Finish given Floor 5: mixed 55–65%, cash 40–50%.
   - Whole run: ~15–20%.
3. **If outside a band, tune only `CREW_CASH_SCALE_BY_FLOOR`** (the single knob) and repeat. If the late game is too soft, swap in the pre-analysed steeper A+ curve first (design doc § Change 2).
   - **Opening check:** the sim's pub hires the lineup's next crew member. Add a first hire drawn from 3 random Starters to the harness, and confirm reaching Floor 4 still lands at 35–45%.
4. Append the before/after table to `gauntlet-difficulty-audit.md`.

--- Implemented (2026-10-15):
- **Sim defaults = shipped game:** $40 + one free crew member, `crewCashBaseCents` from the engine's taper with a startup check against `getCrewCashBaseCents`, Hype from the crew files.
- `openingPick: 'draft'` models the 3-random-Starter pick. Crew are seated in the first empty slot.
- `PRE_FB041` lever set reproduces the old game. OPTIONS / PACKAGES / EARLY_OPTIONS are re-expressed relative to the shipped game (pre-FB-041, A+, comp diet).
- New `validate` mode.
- **Results** (`scripts/sim/baselines/post-fb-041/`, N=4000) — **all bands met, no tuning needed:**
  - Reach Floor 4: cash 42.0%, mixed 40.4%.
  - Finish | F5: mixed 62.6%, cash 44.3%.
  - Whole run: cash 16.1%, mixed 20.4% (mixed within noise of the band).
  - The 3-Starter draft pick performs the same as the lineup pick.
- **Audit doc § 7** records the before/after. ---

🛑 **Gate:** all bands met, then Release 2.

---

## Phase 5: Docs + release

**Files:**
- `@CLAUDE.md`
- `@docs/frameworks/crew_framework.md`
- `@docs/requirements/feature-backlog.md`
- `@docs/design/gauntlet-difficulty-audit.md`

**Steps:**
1. **`CLAUDE.md`:**
   - Key constraints: add the crew-cash taper (`getCrewCashBaseCents` is the only crew-cash base; never compute 10% of the target in a crew file) and the opening rule (tutorial $30 vs post-tutorial $40 + free pick).
   - Update the FB-024 constraint line.
   - Game Constants: starting bankroll.
2. **`crew_framework.md`:** the FB-024 formula becomes `MULT × getCrewCashBaseCents(markerIndex)`; new Hype values.
3. **Backlog:** FB-041 → Implemented. **Audit doc:** status → implemented.
4. **Release notes** entry (FB-019 process): "Fresh runs start with $40 and a crew member on the house · crew cash cools off on Floors 5–9 · Hype crew hit harder".

🛑 **Gate:** FB-041 complete → push.

---

## Follow-ups (not in FB-041)

- **FB-040 The Architect:** design his rule to take crew cash or end the run (audit guidance), and measure it with `isolated` mode.
- **Spike: crew cash at risk on a Seven-Out**, simulated first.
- **Leaderboard balance-version tag** (pre/post FB-041 runs aren't comparable).
