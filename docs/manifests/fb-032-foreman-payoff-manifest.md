# Implementation Manifest: FB-032 The Foreman: The Cut and The Payoff

**Design doc:** `docs/design/fb-032-foreman-payoff-design.md`
**Status:** Phases 1–2 done locally (not pushed). Awaiting local playtest.

**Rules:** each phase ends at a 🛑 gate. Before calling a phase done: `npm run typecheck`, `npm run build`, `npm run test`, and the API integration suite (Docker `postgres-test`; recreate it after schema changes). Pushing to `main` deploys; the schema change applies at API startup.

---

## Phase 1: Server mechanic

1. **Data:** `runs.boss_progress_cents bigint NOT NULL DEFAULT 0`, as a `schema.ts` column, a `server.ts` startup `ADD COLUMN IF NOT EXISTS`, and `drizzle/0008`. Reset on every marker entry next to `getBossEntryCounter()` (marker clear, auto-collect, pub exit, dev create/jump).
2. **Rule params:** `EXTORTION_FEE` gains `payoffCents` (2_500). Shared helper `isPayoffMarker(markerIndex)`.
3. **`rolls.ts`:** this roll's cut = pre-tax payout − post-tax payout; accumulate; clear the marker when total ≥ payoff. On payoff markers, skip the bankroll-target clear in the main path **and** the pre-roll auto-clear block. Emit `bossCut { amount, total, payoff, paidOff }` in `turn:settled` and the HTTP response.
4. **Run payloads:** `GET/POST /runs` + dev routes return `bossProgressCents`.
5. **Tests:** a win adds 20% of profit to the cut; a loss adds nothing; bankroll ≥ $200 does **not** clear the Foreman; crossing the Payoff clears it (→ TRANSITION, marker 3) even with a low bankroll; cut resets on entering the next marker; game over still works.

🛑 **Gate:** server behavior verified by tests.

--- Implemented locally (2026-10-13): single `clearsMarker()` check replaces all six bankroll-clear sites (5 in `computeNextState` + the pre-roll auto-clear). CRAPS_OUT / POINT_SET never clear; a Cut that crosses the Payoff there is caught by the pre-roll check on the next request. 8 integration + 2 unit tests. **Not pushed:** the current client would show a dead TARGET MET button at the Foreman until Phase 2. ---

## Phase 2: Client: register, Payoff moment, copy

1. **Store:** `bossProgressCents` hydrated on load and applied from `bossCut`.
2. **Hide bankroll clearing on payoff markers:** `MarkerProgress` bar, auto-collect trigger, **✓ TARGET MET — ADVANCE**.
3. **`CashRegister` component** in `BossRoomHeader`: `THE CUT $X / $25` with rolling digits; ka-ching pop on each increase.
4. **Payoff moment:** bell + "PAID IN FULL" stamp + counter flash, before the marker-clear celebration; reduced-motion fallback.
5. **Audio:** `playRegisterKaChing()`, `playRegisterBell()` (standalone, mute/volume aware).
6. **Copy:** Foreman `ruleBlurb`, `ruleHeaderText`, `entryLines`, `dreadTagline`, `flavorText`; Sal's boss line in `tutorialBeats.ts`; `floors.ts` if it mentions the tax; `boss_framework.md`, PRD, CLAUDE.md.

🛑 **Gate:** play the fight locally via Dev Mode.

--- Implemented locally (2026-10-13): `MarkerProgress` keeps its bar but tracks the Cut at payoff markers ("★ THE CUT $X / $25") rather than hiding; the celebration hand-off timers get `PAYOFF_HOLD_MS` (1600) after a Payoff so the stamp lands first. The Payoff closing line arrives with Phase 3 barks. ---

## Phase 3: Boss barks (pilot on the Foreman)

1. **Shared:** `BossBarkTrigger` union; `BossConfig.barks?` with Foreman lines for `win`, `loss`, `progress50`, `progress80`, `payoff`.
2. **Store:** generic `bossBark` slot + `fireBossBark(trigger)` (random line, throttle, auto-clear). Fire from `bossCut` / roll results on the Foreman fight. Executive untouched.
3. **`BossRoomHeader`:** generic bark bubble (same look as the Executive's).

🛑 **Gate:** do the barks feel good? Decide whether to roll out to other bosses.

## Phase 4: Developer Mode + measurement

1. **Dev controls:** "Cut so far ($)" for the Foreman in `BossCounterControl` / PATCH; `getBossCounterRange` support.
2. **Presets:** "Foreman — fresh fight", "Foreman — one win from the Payoff".
3. **Measure** Floor 2 starting bankroll over ~10–15 Dev Mode runs (design §7); tune `payoffCents` if needed.

🛑 **Gate:** FB-032 complete → backlog + CLAUDE.md.
