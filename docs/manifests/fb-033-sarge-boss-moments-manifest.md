# Implementation Manifest: FB-033 Sarge Boss Moments

**Design doc:** `docs/design/fb-033-sarge-boss-moments-design.md`
**Status:** Pending approval.

**Rules:** each phase ends at a 🛑 gate. Before calling a phase done: `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite if the server changes). Push when Mike says.

---

## Phase 1: Barks with per-boss event triggers

1. **Shared:** extend `BossBarkTrigger` with `pointSet | clockLow | lastRoll | beatClock | timeUp`. Add a per-rule event deriver in `bossBarks.ts` (roll result, post-roll phase, Sarge clock count, `clockExpired`, Foreman Cut) → ordered event triggers; `pickBossBark` uses the first event the boss has lines for, else chance-based win/loss. Migrate the Foreman's Cut milestones onto it (behavior unchanged).
2. **Config:** Sarge `barks` (design §3).
3. **Store:** pass the new roll facts into `pickBossBark` (clock count after the roll, `clockExpired`, post-roll phase).
4. **Tests:** event priority for Sarge; Foreman behavior unchanged.

🛑 **Gate:** play Sarge locally; tune lines/chattiness.

## Phase 2: Clock drama

1. **Header clock:** grows (~1.35×) + glow in the point phase; harder pulse at ≤2; last-roll blink kept; reduced-motion fallback.
2. **Audio:** `playClockTick(rollsLeft)`, `playClockAlarm()`, `playDrillWhistle()` (standalone); tick per point-phase roll, alarm on reaching the last roll, whistle on TIME'S UP.

🛑 **Gate:** does the clock feel tense?

## Phase 3: Boss victory moments + HONORABLY DISCHARGED

1. **Shared:** `BossVictoryCinematicId`, `BossConfig.victoryCinematic?: { id, line }`; Sarge → `HONORABLY_DISCHARGED`.
2. **Store:** generalize `payoffAt`/`PAYOFF_HOLD_MS` into a `celebrationHold` respected by all celebration hand-offs; set `pendingVictory` on a boss-clearing roll with a `victoryCinematic`. Foreman PAID IN FULL unchanged.
3. **`components/victory/`:** registry + host + `HonorablyDischargedCinematic` (certificate, stamp, bugle, line).
4. **Audio:** `playBugleCall()`.
5. **Dev Panel:** Victory preview.

🛑 **Gate:** beat Sarge locally.

## Phase 4: DISHONORABLE DISCHARGE

1. **Config:** Sarge `defeatCinematic: { id: 'DISHONORABLE_DISCHARGE', line }`.
2. **`components/defeat/DishonorableDischargeCinematic`:** form slides up, red stamp + thud/shake, dog tags drop/bounce/jingle, line; ~5.5 s.
3. **Audio:** `playStampThud()`, `playDogTagsJingle()`.

🛑 **Gate:** lose to Sarge locally (Dev preview + real TIME'S UP on the last shooter).

## Phase 5: Dev Mode + docs

1. **Presets:** "Sarge — last roll on the clock", "Sarge — last shooter, clock running".
2. **Docs:** boss_framework (Sarge + victory system), CLAUDE.md, backlog.

🛑 **Gate:** FB-033 complete → push.
