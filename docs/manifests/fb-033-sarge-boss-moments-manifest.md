# Implementation Manifest: FB-033 Sarge Boss Moments

**Design doc:** `docs/design/fb-033-sarge-boss-moments-design.md`
**Status:** ✅ All phases (1–5) done 2026-10-13. Ready to push.

**Rules:** each phase ends at a 🛑 gate. Before calling a phase done: `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite if the server changes). Push when Mike says.

---

## Phase 1: Barks with per-boss event triggers

1. **Shared:** extend `BossBarkTrigger` with `pointSet | clockLow | lastRoll | beatClock | timeUp`. Add a per-rule event deriver in `bossBarks.ts` (roll result, post-roll phase, Sarge clock count, `clockExpired`, Foreman Cut) → ordered event triggers; `pickBossBark` uses the first event the boss has lines for, else chance-based win/loss. Migrate the Foreman's Cut milestones onto it (behavior unchanged).
2. **Config:** Sarge `barks` (design §3).
3. **Store:** pass the new roll facts into `pickBossBark` (clock count after the roll, `clockExpired`, post-roll phase).
4. **Tests:** event priority for Sarge; Foreman behavior unchanged.

🛑 **Gate:** play Sarge locally; tune lines/chattiness.

--- Implemented locally (2026-10-13): `deriveBossBarkEvents()` (per-rule, priority-ordered) in shared `bossBarks.ts`; Foreman milestones migrated with no behavior change (existing tests unchanged); Sarge events per design §3; 9 new tests. ---

## Phase 2: Clock drama

1. **Header clock:** grows (~1.35×) + glow in the point phase; harder pulse at ≤2; last-roll blink kept; reduced-motion fallback.
2. **Audio:** `playClockTick(rollsLeft)`, `playClockAlarm()`, `playDrillWhistle()` (standalone); tick per point-phase roll, alarm on reaching the last roll, whistle on TIME'S UP.

🛑 **Gate:** does the clock feel tense?

--- Implemented locally (2026-10-13): clock extracted to `SargeClock.tsx`; sounds keyed to the reveal (phase / bossPointHits change in applyPendingSettlement), reading `lastClockExpired` only then so the whistle lands with the TIME'S UP popup. On a last-shooter TIME'S UP the table unmounts at once until Phase 4's defeat hold, so that whistle arrives with Phase 4. ---

## Phase 3: Boss victory moments + HONORABLY DISCHARGED

1. **Shared:** `BossVictoryCinematicId`, `BossConfig.victoryCinematic?: { id, line }`; Sarge → `HONORABLY_DISCHARGED`.
2. **Store:** generalize `payoffAt`/`PAYOFF_HOLD_MS` into a `celebrationHold` respected by all celebration hand-offs; set `pendingVictory` on a boss-clearing roll with a `victoryCinematic`. Foreman PAID IN FULL unchanged.
3. **`components/victory/`:** registry + host + `HonorablyDischargedCinematic` (certificate, stamp, bugle, line).
4. **Audio:** `playBugleCall()`.
5. **Dev Panel:** Victory preview.

🛑 **Gate:** beat Sarge locally.

--- Implemented locally (2026-10-13): `celebrationHoldUntil` (absolute timestamp) + `celebrationDelay()` now gate all five celebration hand-offs (savor ×3, ADVANCE fast path, safety ×2); PAID IN FULL claims 2.6s, victory cinematics 3.9s. Victory host clears a cut-short cinematic on unmount so it can't replay. ---

## Phase 4: DISHONORABLE DISCHARGE

1. **Config:** Sarge `defeatCinematic: { id: 'DISHONORABLE_DISCHARGE', line }`.
2. **`components/defeat/DishonorableDischargeCinematic`:** form slides up, red stamp + thud/shake, dog tags drop/bounce/jingle, line; ~5.5 s.
3. **Audio:** `playStampThud()`, `playDogTagsJingle()`.

🛑 **Gate:** lose to Sarge locally (Dev preview + real TIME'S UP on the last shooter).

--- Implemented locally (2026-10-13): shared `components/cinematics/DischargeForm.tsx` (both moments use it; stamp lands in the blank band, form jolts); ~0.6s lead-in so TIME'S UP + the whistle land first; ~6.2s total. The defeat hold keeps the table mounted, so the last-shooter TIME'S UP whistle now plays. ---

## Phase 5: Dev Mode + docs

1. **Presets:** "Sarge — last roll on the clock", "Sarge — last shooter, clock running".
2. **Docs:** boss_framework (Sarge + victory system), CLAUDE.md, backlog.

🛑 **Gate:** FB-033 complete → push.

--- Implemented locally (2026-10-13): presets "Sarge — fresh fight", "Sarge — last roll on the clock" (counter 5), "Sarge — last shooter, clock running" (1 shooter, counter 3); integration test proves the last-roll preset's blank is TIME'S UP. ---
