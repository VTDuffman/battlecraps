# Implementation Manifest — FB-026 — Boss Fight & Comp Overhaul

> **Scope:** Redesigns 6 of 9 bosses to counter the dominant Grinder/additive build strategy.
> The Foreman (F1) and The Sovereign's comp are unchanged. The Sovereign's *mechanic* is
> redesigned in Step 1. All four Priority-Tier bosses ship before the Secondary-Tier bosses.
>
> **Phases:**
> - Phase 1 (Steps 1–4) — no schema changes, pure logic
> - Phase 2 (Steps 5–7) — DB migration required (pending_additive_cents)
> - Phase 3 (Steps 8–9) — complex mechanics (Sarge + Architect)
> - Finish (Steps 10–11) — comp audit, docs, client display

---

## Step 1 — Tidal Surge: Four-Stage Wave (The Sovereign, F6)

**Goal:** Replace the 5-roll-calm / 2-roll-surge duration mechanic with a four-stage
per-come-out cycle: LOW TIDE (1×) → EBB (2×) → HIGH TIDE (3×) → FLOW (2×), repeating.
The tide stage advances once each time the phase transitions to COME_OUT (after NATURAL,
CRAPS_OUT, POINT_HIT, or SEVEN_OUT). During POINT_ACTIVE rolls the counter holds.

**Files:**
- @packages/shared/src/config.ts
- @packages/shared/src/__tests__/config.test.ts
- @apps/api/src/routes/rolls.ts

---

```
Redesign The Sovereign's TIDAL_SURGE mechanic from duration-based to a four-stage
per-come-out wave. All three files must be updated atomically.

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

1. Replace the TIDAL_SURGE BossRuleParams union member:

OLD:
  | { rule: 'TIDAL_SURGE'; lowTideDuration: number; highTideDuration: number; highTideMinMultiplier: number }

NEW:
  | { rule: 'TIDAL_SURGE'; stageMultipliers: readonly [number, number, number, number]; stageLabels: readonly [string, string, string, string] }

2. Replace the TIDAL_SURGE block inside getBossMinBet():

OLD:
  if (boss.rule === 'TIDAL_SURGE') {
    const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
    if (bossPointHits >= params.lowTideDuration) {
      return Math.round(getMinBet(markerIndex) * params.highTideMinMultiplier / 500) * 500;
    }
    return null;
  }

NEW:
  if (boss.rule === 'TIDAL_SURGE') {
    const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
    const stageIndex = bossPointHits % params.stageMultipliers.length;
    const multiplier = params.stageMultipliers[stageIndex] ?? 1;
    if (multiplier <= 1) return null; // LOW TIDE — no min-bet override
    return Math.round(getMinBet(markerIndex) * multiplier / 500) * 500;
  }

3. Update the Sovereign config entry (GAUNTLET index 17). Change ruleParams, ruleHeaderText,
   and ruleBlurb:

  ruleParams: {
    rule:             'TIDAL_SURGE',
    stageMultipliers: [1, 2, 3, 2],
    stageLabels:      ['LOW TIDE', 'EBB', 'HIGH TIDE', 'FLOW'],
  },
  ruleHeaderText: 'TIDE CYCLES EACH COME-OUT: LOW (1×) → EBB (2×) → HIGH (3×) → FLOW (2×)',
  ruleBlurb: "The tide runs a four-stage cycle — LOW, EBB, HIGH, FLOW — and advances on every come-out roll. LOW TIDE is the standard table minimum. EBB and FLOW hold at 2×. High Tide demands 3×. The rhythm is visible. The rhythm is inevitable.",

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts — computeNextState
══════════════════════════════════════════════════

4. Find the TIDAL_SURGE detection block near the top of computeNextState (currently
   calculates tidalCycleTotal from lowTideDuration + highTideDuration). Replace it:

OLD:
  const tidalCycleTotal = isTidalSurge
    ? (() => {
        const p = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
          Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
        return p.lowTideDuration + p.highTideDuration;
      })()
    : 0;

NEW:
  const tidalCycleTotal = isTidalSurge && isBossMarker(currentMarkerIndex)
    ? (() => {
        const p = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
          Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
        return p.stageMultipliers.length;
      })()
    : 0;

5. Inside the nextBossCounter helper, change the TIDAL_SURGE branch so the counter only
   advances when the roll transitions to COME_OUT (NATURAL, CRAPS_OUT, POINT_HIT, or
   SEVEN_OUT), not on POINT_SET or NO_RESOLUTION:

OLD:
    if (isTidalSurge) return isBossMarker(currentMarkerIndex)
      ? (current + 1) % tidalCycleTotal
      : 0;

NEW:
    if (isTidalSurge) {
      if (!isBossMarker(currentMarkerIndex)) return 0;
      const advancesToComeOut =
        result === 'NATURAL'    ||
        result === 'CRAPS_OUT'  ||
        result === 'POINT_HIT'  ||
        result === 'SEVEN_OUT';
      return advancesToComeOut ? (current + 1) % tidalCycleTotal : current;
    }

══════════════════════════════════════════════════
packages/shared/src/__tests__/config.test.ts
══════════════════════════════════════════════════

6. Replace the two existing TIDAL_SURGE getBossMinBet tests with four stage-specific tests.
   At Atlantis (index 17, targetCents = 50_000_000):
     getMinBet(17) = 833_500 cents ($8,335)
     EBB  (2×): round(833_500 × 2 / 500) × 500 = 1_667_000
     HIGH (3×): round(833_500 × 3 / 500) × 500 = 2_500_500
     FLOW (2×): 1_667_000 (same as EBB)

  it('TIDAL_SURGE boss (index 17): stage 0 LOW TIDE (bossPointHits % 4 === 0) → null', () => {
    expect(getBossMinBet(17, 0)).toBeNull();
    expect(getBossMinBet(17, 4)).toBeNull();
    expect(getBossMinBet(17, 8)).toBeNull();
  });

  it('TIDAL_SURGE boss (index 17): stage 1 EBB (2×) → 1_667_000', () => {
    expect(getBossMinBet(17, 1)).toBe(1_667_000);
    expect(getBossMinBet(17, 5)).toBe(1_667_000);
  });

  it('TIDAL_SURGE boss (index 17): stage 2 HIGH TIDE (3×) → 2_500_500', () => {
    expect(getBossMinBet(17, 2)).toBe(2_500_500);
    expect(getBossMinBet(17, 6)).toBe(2_500_500);
  });

  it('TIDAL_SURGE boss (index 17): stage 3 FLOW (2×) → 1_667_000', () => {
    expect(getBossMinBet(17, 3)).toBe(1_667_000);
    expect(getBossMinBet(17, 7)).toBe(1_667_000);
  });

After all edits run:
  npm run test -w @battlecraps/shared
  npm run typecheck
```

---

## Step 2 — The Tariff: Mme. Le Prix (F3)

**Goal:** Replace the full crew disable (returning [] from modifyCascadeOrder) with a 35%
additive tax. Crew still fire and animate normally; their cash bonuses are reduced by 35%
before settlement. Multiplier and hype crew are unaffected — this creates a floor-specific
meta where non-additive builds outperform for the first time.

**Files:**
- @packages/shared/src/bossRules/types.ts
- @packages/shared/src/bossRules/disableCrew.ts
- @packages/shared/src/config.ts
- @apps/api/src/routes/rolls.ts

---

```
Replace Mme. Le Prix's DISABLE_CREW crew-suppression with The Tariff — a 35% additive tax.

══════════════════════════════════════════════════
packages/shared/src/bossRules/types.ts
══════════════════════════════════════════════════

1. Add a new optional hook to the BossRuleHooks interface, after modifyPayout:

  /**
   * Called after resolveCascade() and before the Vig comp step.
   * Returns the (potentially reduced) additives total in cents.
   * Only called when additives > 0.
   *
   * Used by: DISABLE_CREW (The Tariff) — taxes additive bonuses by additiveTarifPct.
   */
  modifyAdditives?(
    additives: number,
    params: BossRuleParams,
    state: BossRuleState,
  ): number;

══════════════════════════════════════════════════
packages/shared/src/bossRules/disableCrew.ts
══════════════════════════════════════════════════

2. Replace the entire file:

// =============================================================================
// BATTLECRAPS — BOSS RULE: DISABLE_CREW — "The Tariff" (Mme. Le Prix, F3)
//
// Mme. Le Prix no longer silences the crew — she taxes them. Every additive
// generated by the crew is reduced by additiveTarifPct (35%) before settlement.
// Multipliers and hype ticks are unaffected. The cascade fires normally, so
// crew portraits still animate and cooldowns still tick — the fight stays live.
//
// This creates a floor-specific meta shift: multiplier/hype builds outperform
// additive-heavy builds on F3, the only floor where that is true.
//
// Previously: modifyCascadeOrder returning [] — full cascade suppress.
// Now: modifyAdditives reducing the resulting additives pool by 35%.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const disableCrewHooks: BossRuleHooks = {
  modifyAdditives(additives, params, _state) {
    if (params.rule !== 'DISABLE_CREW') return additives;
    const taxed = Math.floor(additives * (1 - params.additiveTarifPct) / 100) * 100;
    return Math.max(0, taxed);
  },
};

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

3. Update the DISABLE_CREW BossRuleParams union member to carry the tariff percentage:

OLD:
  | { rule: 'DISABLE_CREW' }

NEW:
  | { rule: 'DISABLE_CREW'; additiveTarifPct: number }

4. Update the Mme. Le Prix config entry — ruleParams, ruleHeaderText, ruleBlurb,
   and entryLines:

  ruleParams:     { rule: 'DISABLE_CREW', additiveTarifPct: 0.35 },
  ruleHeaderText: 'CREW ADDITIVES TAXED 35% — MULTIPLIERS AND HYPE ARE EXEMPT',
  ruleBlurb:      "The Salon Privé has a service charge. Every additive your crew generates is reduced by 35% before it reaches your bankroll. Multipliers and hype are untouched — her cut is strictly monetary.",
  entryLines: [
    "Fresh money. How delightful.",
    "Your crew may stay — but they work at my rates.",
    "Every dollar they earn, I take thirty-five cents. Non-negotiable.",
  ],

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

5. In the post-cascade section, find the existing Vig comp step (currently labelled
   "── 8b. The Vig comp"). Directly BEFORE it, insert a new step 8b for the Tariff,
   and rename the Vig step to 8c. Change the Vig step to operate on tarifedContext
   instead of finalContext:

  // ── 8b. DISABLE_CREW (The Tariff) — tax crew additives before Vig applies ─
  // Applied before The Vig so the +20% Vig bonus stacks on already-taxed additives
  // (multiplicative order doesn't matter here, but semantically the boss takes first).
  const tarifedContext = bossHooks?.modifyAdditives && finalContext.additives > 0
    ? { ...finalContext, additives: bossHooks.modifyAdditives(finalContext.additives, bossParams!, bossState) }
    : finalContext;

  // ── 8c. The Vig comp — scale crew additive bonuses by 1.20 ───────────────
  const hasTheVig = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_VIG);
  const viggedContext = hasTheVig && tarifedContext.additives > 0
    ? { ...tarifedContext, additives: Math.round(tarifedContext.additives * 1.2 / 100) * 100 }
    : tarifedContext;

  All subsequent references to finalContext in settleTurn/modifyPayout/receipt
  that currently use viggedContext are unchanged — viggedContext is still the
  terminal context variable passed to settleTurn().

Run npm run typecheck after completing.
```

---

## Step 3 — High Altitude + Death Spiral: The Commander (F7)

**Goal:** Replace flat 0.5× hype decay on 7-out with tier-scaled decay: On Fire (≥2.5×)
loses 0.8×; Heating Up (≥1.5×) loses 0.6×; below 1.5× loses 0.4×. Add Death Spiral
consequences: below 0.75× hype the cascade loses one slot (computed live from run.hype,
no new DB field); below 0.5× the max bet is halved.

**Files:**
- @packages/shared/src/config.ts
- @apps/api/src/routes/rolls.ts

---

```
Redesign The Commander's ORBITAL_DECAY to High Altitude = High Risk + Death Spiral.

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

1. Replace the ORBITAL_DECAY BossRuleParams union member:

OLD:
  | { rule: 'ORBITAL_DECAY'; decayAmount: number; hypeFloor: number }

NEW:
  | {
      rule:            'ORBITAL_DECAY';
      /** Hype decay on 7-out when hype < 1.5× (below Heating Up). */
      baseDecay:       number;
      /** Hype decay on 7-out when 1.5× ≤ hype < 2.5× (Heating Up tier). */
      heatingUpDecay:  number;
      /** Hype decay on 7-out when hype ≥ 2.5× (On Fire tier). */
      onFireDecay:     number;
      /** Absolute minimum hype — never goes below this value. */
      hypeFloor:       number;
    }

2. Update The Commander config entry — ruleParams, ruleHeaderText, ruleBlurb, entryLines:

  ruleParams: {
    rule:           'ORBITAL_DECAY',
    baseDecay:       0.40,
    heatingUpDecay:  0.60,
    onFireDecay:     0.80,
    hypeFloor:       0.25,
  },
  ruleHeaderText: 'ON FIRE 7-OUT: −0.8× HYPE | HEATING UP: −0.6× | BELOW 1.5×: −0.4×',
  ruleBlurb: "Seven-out drains your Hype — and the higher you fly, the harder you fall. On Fire costs 0.8× per seven-out. Heating Up costs 0.6×. Below 1.5× costs 0.4×. Below 0.75× you lose a cascade slot. Below 0.5× your max bet is halved.",
  entryLines: [
    "Eleven months up here. I don't miss the ground.",
    "Your hype is a resource. In this environment, resources decay faster at altitude.",
    "The higher you climb, the steeper the fall. There is no floor — until there is.",
  ],

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

3. In the SEVEN_OUT case inside computeNextState, find the isOrbitalDecay block that
   computes nextHype. Replace it with tier-scaled decay:

OLD:
  if (isOrbitalDecay) {
    const decayParams = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
      Extract<BossRuleParams, { rule: 'ORBITAL_DECAY' }>;
    nextHype = Math.max(
      decayParams.hypeFloor,
      run.hype - decayParams.decayAmount + cascadeHypeDelta,
    );
  } else {
    const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
    nextHype = Math.max(1.0, seaLegsBaseline + cascadeHypeDelta);
  }

NEW:
  if (isOrbitalDecay) {
    const decayParams = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
      Extract<BossRuleParams, { rule: 'ORBITAL_DECAY' }>;
    const decayAmount =
      run.hype >= 2.5 ? decayParams.onFireDecay
      : run.hype >= 1.5 ? decayParams.heatingUpDecay
      : decayParams.baseDecay;
    nextHype = Math.max(
      decayParams.hypeFloor,
      Math.round((run.hype - decayAmount + cascadeHypeDelta) * 10_000) / 10_000,
    );
  } else {
    const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
    nextHype = Math.max(1.0, seaLegsBaseline + cascadeHypeDelta);
  }

4. Death Spiral — max bet halving at hype < 0.5×.
   In the bet-validation section of rollHandler (where maxBet is computed via getMaxBet),
   add a post-computation guard. Find the line `const maxBet = getMaxBet(...)` and
   add directly after it:

  // ── Death Spiral: The Commander halves max bet when hype < 0.5× ──────────
  const isDeathSpiralHalving =
    activeBossRule === 'ORBITAL_DECAY' &&
    isBossMarker(run.currentMarkerIndex) &&
    run.hype < 0.5;
  const effectiveMaxBet = isDeathSpiralHalving
    ? Math.floor(maxBet / 2 / 500) * 500   // halved, snapped to nearest $5
    : maxBet;

  Then replace all three maxBet references in the subsequent bet-validation checks
  (passLine > maxBet, hardways[key] > maxBet) with effectiveMaxBet.

5. Death Spiral — cascade slot penalty at hype < 0.75×.
   Just before the resolveRoll() call (which injects unlockedSlots into TurnContext),
   compute an effective slot count:

  const isDeathSpiralSlotPenalty =
    activeBossRule === 'ORBITAL_DECAY' &&
    isBossMarker(run.currentMarkerIndex) &&
    run.hype < 0.75;
  const effectiveUnlockedSlots = isDeathSpiralSlotPenalty
    ? Math.max(1, (run.unlockedSlots as number) - 1) as 3 | 4 | 5
    : run.unlockedSlots as 3 | 4 | 5;

  Pass effectiveUnlockedSlots instead of run.unlockedSlots into the resolveRoll() call:
    unlockedSlots: effectiveUnlockedSlots,

  NOTE: activeBossRule is already computed just before resolveRoll() in the existing
  code (used for FCP detection). Use that same variable here.

Run npm run typecheck after completing.
```

---

## Step 4 — Three-Strike System: The Executive (F4)

**Goal:** Replace the instant-loss-on-first-4 mechanic with a three-strike escalation.
First 4 rolled: drain 20% of current bankroll, roll converts to NO_RESOLUTION (bets stay).
Second 4: drain 40%. Third 4: run ends. Uses the existing bossPointHits field as the
strike counter (currently unused for The Executive). Applies on all phases.

**Files:**
- @packages/shared/src/types.ts
- @packages/shared/src/bossRules/foursInstantLoss.ts
- @packages/shared/src/config.ts
- @apps/api/src/routes/rolls.ts

---

```
Replace FOURS_INSTANT_LOSS instant death with a three-strike bankroll-drain system.

══════════════════════════════════════════════════
packages/shared/src/types.ts
══════════════════════════════════════════════════

1. Find the TurnContextFlags interface (or type). Add a new optional field:

  /** Set by FOURS_INSTANT_LOSS when dice total 4 — triggers Three-Strike handling. */
  executiveStrike?: boolean;

══════════════════════════════════════════════════
packages/shared/src/bossRules/foursInstantLoss.ts
══════════════════════════════════════════════════

2. Change modifyOutcome to set executiveStrike instead of instantLoss, and convert the
   roll to NO_RESOLUTION so bets carry over and the cascade fires:

OLD:
  modifyOutcome(ctx, params, _state) {
    if (params.rule !== 'FOURS_INSTANT_LOSS') return ctx;
    if (ctx.diceTotal !== params.triggerTotal) return ctx;
    return {
      ...ctx,
      flags: { ...ctx.flags, instantLoss: true },
    };
  },

NEW:
  modifyOutcome(ctx, params, _state) {
    if (params.rule !== 'FOURS_INSTANT_LOSS') return ctx;
    if (ctx.diceTotal !== params.triggerTotal) return ctx;
    // Convert to NO_RESOLUTION so bets stay, cascade fires, but no point is set/hit.
    // executiveStrike flag triggers the strike handler in rolls.ts.
    return {
      ...ctx,
      rollResult: 'NO_RESOLUTION' as const,
      flags: { ...ctx.flags, executiveStrike: true },
    };
  },

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

3. Update The Executive config entry — ruleBlurb, ruleHeaderText, entryLines:

  ruleHeaderText: 'ROLLING A 4: FIRST STRIKE −20% | SECOND −40% | THIRD = GAME OVER',
  ruleBlurb:      "Roll a 4 and it costs you. First offence: 20% of your bankroll. Second: 40%. Third: the run ends. No exceptions. The Executive always collects.",
  entryLines: [
    "Sit down. We've been expecting you.",
    "One rule. Roll a four — and it costs you. The first time.",
    "The house has reviewed your file. Three strikes and you're finished.",
  ],

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

4. The existing instantLoss early-return block (step 7d) now only fires on the THIRD
   strike. Find this block and update its condition:

OLD condition:
  if (outcomeCtx.flags.instantLoss) {

NEW condition:
  if (outcomeCtx.flags.executiveStrike && run.bossPointHits >= 2) {

   The body of that block stays the same (GAME_OVER path). This handles the third-4 case.

5. After the cascade and settlement pipeline (after postFrequencyBankroll is computed),
   add a Three-Strike drain step. Place it after step 9c (THE_FREQUENCY) and before
   bankrollDelta computation:

  // ── 9d. EXECUTIVE THREE-STRIKE — drain on first and second 4 rolled ───────
  // Third strike already handled as early GAME_OVER before the cascade (step 7d).
  // bossPointHits here is still the PRE-roll count (0 = first 4, 1 = second 4).
  const isExecutiveStrike =
    finalContext.flags.executiveStrike === true &&
    isBossMarker(run.currentMarkerIndex);
  const strikeDrain = isExecutiveStrike
    ? Math.round(postFrequencyBankroll * (run.bossPointHits === 0 ? 0.20 : 0.40) / 100) * 100
    : 0;
  const postStrikeBankroll = postFrequencyBankroll - strikeDrain;
  const bankrollDelta = postStrikeBankroll - run.bankrollCents;

  Replace the existing `const bankrollDelta = postFrequencyBankroll - run.bankrollCents;`
  line with the block above.

  Also update the computeNextState call to pass postStrikeBankroll instead of
  postFrequencyBankroll:
    const nextState = computeNextState(run, viggedContext, postStrikeBankroll, incomingBets, hasSeaLegs);

6. In computeNextState's NO_RESOLUTION case, increment bossPointHits when the strike
   flag is set. Add this to the return object of the NO_RESOLUTION branch (just before
   the existing bossPointHits line):

  bossPointHits: finalCtx.flags.executiveStrike && isBossMarker(currentMarkerIndex)
    ? run.bossPointHits + 1
    : nextBossCounter(run.bossPointHits, rollResult, false),

  (The marker-clear sub-branch inside NO_RESOLUTION should also return 0 in the
  hitMarker path, same as all other branches.)

7. In WsTurnSettledPayload, add an optional field so the client can display strike
   warnings:
  /** Present when The Executive's three-strike rule triggered (4 was rolled). Strike index 1, 2, or 3. */
  executiveStrikeNumber?: 1 | 2 | 3;

  Populate it in the settled payload before emit:
    executiveStrikeNumber: isExecutiveStrike
      ? (run.bossPointHits + 1) as 1 | 2 | 3
      : undefined,

Run npm run typecheck after completing.
```

---

## Step 5 — DB Migration: pending_additive_cents

**Goal:** Add a single new column to the runs table to support additive escrow (used by
both The Hierophant and The Emissary in Steps 6–7). Safe to add with DEFAULT 0 — all
existing runs start with no pending additives.

**Files:**
- @apps/api/src/db/schema.ts

---

```
Add pending_additive_cents to the runs table to support escrow mechanics.

══════════════════════════════════════════════════
apps/api/src/db/schema.ts
══════════════════════════════════════════════════

1. In the runs table definition, add one new column alongside the existing integer
   columns (bankrollCents, shooters, etc.):

  pendingAdditiveCents: integer('pending_additive_cents').notNull().default(0),

After editing schema.ts, run:
  npm run db:generate
  npm run db:migrate

Verify the migration applied and the column exists before proceeding to Steps 6 and 7.
Run npm run typecheck to confirm the schema type update compiled cleanly.
```

---

## Step 6 — Hierophant Escrow: The Hierophant (F5)

**Goal:** Replace the bankroll-seizure-on-7-out mechanic with an additive escrow system.
Crew additives are held in pendingAdditiveCents rather than paid immediately. On the next
roll, the pending amount is released to bankroll. On 7-out, The Hierophant seizes 25%
of the pending pool before releasing the rest. THE_COVENANT halves the seizure to 12.5%.

**Files:**
- @packages/shared/src/config.ts
- @packages/shared/src/bossRules/tribute.ts
- @apps/api/src/db/schema.ts *(read only — already updated in Step 5)*
- @apps/api/src/routes/rolls.ts

---

```
Implement Hierophant Escrow: crew additives held one roll, seized on 7-out.

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

1. Update the TRIBUTE BossRuleParams union member to add escrow seizure percentage:

OLD:
  | { rule: 'TRIBUTE'; tributePct: number }

NEW:
  | { rule: 'TRIBUTE'; escrowSeizurePct: number }

  (tributePct is replaced by escrowSeizurePct — the mechanic has changed from bankroll
  drain to escrow drain.)

2. Update The Hierophant config entry:

  ruleParams:     { rule: 'TRIBUTE', escrowSeizurePct: 0.25 },
  ruleHeaderText: 'CREW ADDITIVES HELD IN ESCROW — 25% SEIZED ON SEVEN-OUT',
  ruleBlurb:      "Your crew's cash bonuses don't pay out immediately — they're held in escrow. Hit the point and the escrow releases in full. Seven-out and The Hierophant seizes 25% of the escrow as tribute before releasing the rest.",
  entryLines: [
    "You were vouched for. That person is no longer welcome.",
    "Three centuries of tradition: your earnings are not yours until the point resolves.",
    "Seven out, and the order takes its cut. Every time.",
  ],

══════════════════════════════════════════════════
packages/shared/src/bossRules/tribute.ts
══════════════════════════════════════════════════

3. The tribute hooks no longer use modifySevenOut for bankroll drain. The new escrow
   logic runs inline in rolls.ts. Clear this file to an empty hooks object:

// =============================================================================
// BATTLECRAPS — TRIBUTE BOSS RULE HOOKS
// packages/shared/src/bossRules/tribute.ts
//
// The Hierophant (F5) — escrow seizure on seven-out.
// The escrow logic (hold additives, seize on 7-out) runs inline in rolls.ts
// because it requires reading and writing run.pendingAdditiveCents, which is
// a persistence concern outside the pure hook interface.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const tributeHooks: BossRuleHooks = {};

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

4. Determine when the Hierophant escrow is active. Add a detection variable near
   the top of rollHandler (alongside activeBossRule):

  const isHierophantEscrow =
    activeBossRule === 'TRIBUTE' && isBossMarker(run.currentMarkerIndex);

5. In the post-cascade section, after viggedContext is computed, add the escrow
   hold step BEFORE settleTurn. When Hierophant escrow is active, zero out the
   additives in viggedContext (they go to escrow, not to settleTurn):

  // ── 8d. TRIBUTE (Hierophant Escrow) — hold additives; don't pass to settleTurn ─
  const escrowHeld = isHierophantEscrow ? viggedContext.additives : 0;
  const escrowContext = isHierophantEscrow
    ? { ...viggedContext, additives: 0 }
    : viggedContext;

  Pass escrowContext to settleTurn() instead of viggedContext.

6. After postFrequencyBankroll is computed, add the escrow release step:

  // ── 9e. TRIBUTE (Hierophant Escrow) — release previous roll's escrow ───────
  // On every roll: release last roll's pendingAdditiveCents to the bankroll.
  // On 7-out: The Hierophant seizes escrowSeizurePct before release.
  // THE_COVENANT halves the seizure.
  const isTributeSevenOut = isHierophantEscrow && finalContext.rollResult === 'SEVEN_OUT';
  const covenantActive = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_COVENANT);
  const seizurePct = isTributeSevenOut
    ? (() => {
        const p = GAUNTLET[run.currentMarkerIndex]!.boss!.ruleParams as
          Extract<BossRuleParams, { rule: 'TRIBUTE' }>;
        return covenantActive ? p.escrowSeizurePct * 0.5 : p.escrowSeizurePct;
      })()
    : 0;
  const escrowRelease = Math.floor(run.pendingAdditiveCents * (1 - seizurePct) / 100) * 100;
  const postEscrowBankroll = postFrequencyBankroll + escrowRelease;

  Replace postFrequencyBankroll with postEscrowBankroll everywhere after this point
  (bankrollDelta computation, computeNextState call, personal-best update).

7. In the DB persist block (.set({...})), add the new column write:

  pendingAdditiveCents: isHierophantEscrow ? escrowHeld : 0,

  (Non-boss or non-Hierophant rolls always reset pending to 0.)

8. Remove or neutralize the old TRIBUTE modifySevenOut call. Find:
  const tributedBankroll =
    finalContext.rollResult === 'SEVEN_OUT' && bossHooks?.modifySevenOut
      ? bossHooks.modifySevenOut(newBankroll, bossParams!, bossState)
      : newBankroll;

  Since tributeHooks is now empty, modifySevenOut is undefined and this evaluates
  to newBankroll. The line can stay as-is — it's a no-op — or be removed for clarity.
  Renaming tributedBankroll → newBankroll at this step simplifies the chain.

Run npm run typecheck after completing.
```

---

## Step 7 — Transmission Delay: The Emissary (F8)

**Goal:** Replace FIRST_CONTACT_PROTOCOL (come-out 7/11 blocked → blank roll) with
Transmission Delay. Crew additives are held one roll, same as Hierophant escrow — but
on 7-out the pending additives evaporate entirely (100% seizure, no release). Come-out
naturals now resolve normally; THE_FREQUENCY becomes significantly more powerful post-F8.
Remove the naturalBlocked inline block and TurnContextFlags entry that FCP required.

**Files:**
- @packages/shared/src/config.ts
- @packages/shared/src/bossRules/firstContactProtocol.ts
- @packages/shared/src/bossRules/index.ts
- @packages/shared/src/types.ts
- @apps/api/src/routes/rolls.ts

---

```
Replace FIRST_CONTACT_PROTOCOL with TRANSMISSION_DELAY — additive escrow with 7-out evaporation.

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

1. Add TRANSMISSION_DELAY to BossRuleType union:

OLD:
  | 'FIRST_CONTACT_PROTOCOL' // Floor 8 — The Emissary: come-out 7/11 naturals are blank rolls

NEW:
  | 'FIRST_CONTACT_PROTOCOL' // Floor 8 — retired mechanic; kept in union for historical safety
  | 'TRANSMISSION_DELAY'     // Floor 8 — The Emissary: crew additives held one roll; evaporate on 7-out

2. Add TRANSMISSION_DELAY to BossRuleParams union (no params needed — behaviour is fixed):

  | { rule: 'TRANSMISSION_DELAY' }

3. Update The Emissary config entry:

  rule:           'TRANSMISSION_DELAY',
  ruleParams:     { rule: 'TRANSMISSION_DELAY' },
  ruleHeaderText: 'CREW ADDITIVES HELD ONE ROLL — EVAPORATE ENTIRELY ON SEVEN-OUT',
  ruleBlurb:      "The Emissary doesn't understand delay. Your crew's cash bonuses from each roll are held until the next. Seven-out and they vanish — untranslatable. Naturals resolve normally; The Emissary has simply never understood them.",
  entryLines: [
    "The table is here. The felt, the chips, the dice. All correct.",
    "Your crew's signals arrive one step behind. Everything echoes.",
    "It has no concept of free money. When the shooter dies, the echo dies with them.",
  ],

══════════════════════════════════════════════════
packages/shared/src/bossRules/firstContactProtocol.ts
══════════════════════════════════════════════════

4. Rename this file conceptually (or replace its export) to represent Transmission Delay.
   Clear the file to an empty hooks object with updated header:

// =============================================================================
// BATTLECRAPS — TRANSMISSION_DELAY BOSS RULE HOOKS (The Emissary, F8)
//
// Crew additive escrow with 7-out evaporation. Runs inline in rolls.ts using
// pendingAdditiveCents (same column as Hierophant). No hook interface methods needed.
// FIRST_CONTACT_PROTOCOL logic (naturalBlocked) has been retired.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const firstContactProtocolHooks: BossRuleHooks = {};

══════════════════════════════════════════════════
packages/shared/src/types.ts
══════════════════════════════════════════════════

5. Remove the naturalBlocked flag from TurnContextFlags (it was only used by FCP):

  /** @deprecated — FIRST_CONTACT_PROTOCOL retired in FB-026. */
  naturalBlocked?: boolean;

  Mark as deprecated rather than deleting outright, in case any client code still
  references the field. Run typecheck to find any callers and remove them.

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

6. Remove the entire FIRST_CONTACT_PROTOCOL inline block (the 7a-b block that converts
   NATURAL to NO_RESOLUTION when isFirstContact is true). Delete the isFirstContact
   variable and initialCtxFcp variable. Replace all subsequent references to
   initialCtxFcp with initialCtx.

7. In the base-game hype-tick computation (step 7b), seededCtx now reads from initialCtx
   directly (or outcomeCtx after modifyOutcome). Ensure the hype tick still fires
   correctly on real NATURAL results.

8. Add Transmission Delay detection:

  const isTransmissionDelay =
    activeBossRule === 'TRANSMISSION_DELAY' && isBossMarker(run.currentMarkerIndex);

9. Apply the same escrow pattern as Step 6, but with 100% evaporation on 7-out:

  In the post-cascade section (after viggedContext):
  // ── 8e. TRANSMISSION_DELAY (Emissary) — hold additives; don't pass to settleTurn ─
  const tdEscrowHeld = isTransmissionDelay ? viggedContext.additives : 0;
  const tdEscrowContext = isTransmissionDelay
    ? { ...viggedContext, additives: 0 }
    : viggedContext;

  Pass tdEscrowContext (or the combined result if both Hierophant and Emissary were
  somehow active, which is impossible but guarded) to settleTurn.

  After postFrequencyBankroll:
  // ── 9f. TRANSMISSION_DELAY — release or evaporate pending additives ─────────
  const isTdSevenOut = isTransmissionDelay && finalContext.rollResult === 'SEVEN_OUT';
  const tdEscrowRelease = isTdSevenOut ? 0 : run.pendingAdditiveCents; // 100% evaporation on 7-out
  const postTdBankroll = postFrequencyBankroll + tdEscrowRelease;

  Replace postFrequencyBankroll with postTdBankroll in bankrollDelta, computeNextState,
  and personal-best update.

  In DB persist:
  pendingAdditiveCents: isTransmissionDelay ? tdEscrowHeld : (isHierophantEscrow ? escrowHeld : 0),

10. In WsTurnSettledPayload, mark naturalBlocked as optional/deprecated since it now
    never fires:
  /** @deprecated — FCP retired. Always undefined from FB-026 onwards. */
  naturalBlocked?: boolean;

  In computeNextState's NO_RESOLUTION branch, remove the naturalBlocked sub-branch
  (the block that returned IDLE_TABLE/COME_OUT when flags.naturalBlocked was true).
  A normal NO_RESOLUTION in COME_OUT phase now stays in come-out without special handling.

Run npm run typecheck after completing.
```

---

## Step 8 — Non-compliance Fine + Odds Minimum: Sarge (F2)

**Goal:** Two changes to RISING_MIN_BETS. (1) Extend the rising minimum to odds bets —
if the player's odds bet is below (bossMinOdds × passLine / minPassLine), they pay the
non-compliance fine. (2) Non-compliance fine: instead of hard-rejecting a sub-minimum
pass-line bet, accept it and drain 5% of the marker target as a fine. The player can
now choose to absorb the cost rather than meet the bet — real decision, real consequence.

**Files:**
- @packages/shared/src/bossRules/risingMinBets.ts
- @packages/shared/src/config.ts
- @apps/api/src/routes/rolls.ts
- @apps/web/src/store/useGameStore.ts

---

```
Add non-compliance fine and odds minimum to Sarge's RISING_MIN_BETS mechanic.

══════════════════════════════════════════════════
packages/shared/src/bossRules/types.ts
══════════════════════════════════════════════════

1. Add a new return type to BossRuleHooks. Change the validateBet return signature:

OLD:
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null;

NEW:
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null | { fine: number; message: string };

══════════════════════════════════════════════════
packages/shared/src/config.ts
══════════════════════════════════════════════════

2. Add nonComplianceFinePct to RISING_MIN_BETS BossRuleParams:

OLD:
  | { rule: 'RISING_MIN_BETS'; startPct: number; incrementPct: number; capPct: number }

NEW:
  | { rule: 'RISING_MIN_BETS'; startPct: number; incrementPct: number; capPct: number; nonComplianceFinePct: number }

3. Update Sarge config entry — ruleParams (add nonComplianceFinePct: 0.05), ruleBlurb,
   ruleHeaderText, risingMinBets (deprecated field — add nonComplianceFinePct there too):

  ruleParams: { rule: 'RISING_MIN_BETS', startPct: 0.04, incrementPct: 0.02, capPct: 0.20, nonComplianceFinePct: 0.05 },
  risingMinBets: { startPct: 0.04, incrementPct: 0.02, capPct: 0.20 },
  ruleHeaderText: 'MIN BET RISES EACH POINT — SKIP IT AND PAY A 5% MARKER FINE',
  ruleBlurb:      "The minimum pass-line bet rises with every Point Hit and holds on Seven Out. Miss the minimum and you can still roll — but you'll pay a 5% marker fine for the privilege. Odds bets must also clear the minimum, or the same fine applies.",

══════════════════════════════════════════════════
packages/shared/src/bossRules/risingMinBets.ts
══════════════════════════════════════════════════

4. Update validateBet to return a fine object instead of an error string when the
   pass-line bet is below the rising minimum. Also check odds compliance:

export const risingMinBetsHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'RISING_MIN_BETS') return null;

    const { targetCents } = GAUNTLET[state.markerIndex]!;
    const rawPct     = params.startPct + params.incrementPct * state.bossPointHits;
    const clampedPct = Math.min(rawPct, params.capPct);
    const bossMin    = Math.ceil(targetCents * clampedPct / 100) * 100;

    // Fine = nonComplianceFinePct × marker target, rounded to nearest dollar.
    const fine = Math.round(targetCents * params.nonComplianceFinePct / 100) * 100;

    if (bets.passLine < bossMin) {
      return {
        fine,
        message: `Below Sarge's minimum of $${bossMin / 100}. A $${fine / 100} non-compliance fine was applied.`,
      };
    }

    // Odds check: odds bet should be ≥ the same proportional minimum.
    // Only enforced during POINT_ACTIVE (odds can only be placed then).
    if (bets.odds > 0 && bets.passLine > 0) {
      const oddsMin = Math.floor(bossMin * (bets.odds / bets.passLine) / 100) * 100;
      if (bets.odds < oddsMin) {
        return {
          fine,
          message: `Odds bet below Sarge's minimum. A $${fine / 100} non-compliance fine was applied.`,
        };
      }
    }

    return null;
  },
};

  Import GAUNTLET from '../config.js' at the top of this file.

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

5. Update the boss validateBet handler to handle the new fine return type:

OLD:
  if (bossHooks?.validateBet) {
    const bossError = bossHooks.validateBet(incomingBets, bossParams!, bossState);
    if (bossError !== null) {
      return reply.status(422).send({ error: bossError });
    }
  }

NEW:
  let nonComplianceFine = 0;
  if (bossHooks?.validateBet) {
    const bossResult = bossHooks.validateBet(incomingBets, bossParams!, bossState);
    if (bossResult !== null) {
      if (typeof bossResult === 'string') {
        return reply.status(422).send({ error: bossResult });
      }
      // Fine path — accept the roll but apply the fine after settlement.
      nonComplianceFine = bossResult.fine;
    }
  }

6. After postEscrowBankroll (or postStrikeBankroll if both apply), subtract the fine:

  // ── 9g. Non-compliance fine (Sarge) ───────────────────────────────────────
  const postFineBankroll = postEscrowBankroll - nonComplianceFine;

  Use postFineBankroll for bankrollDelta, computeNextState, and personal-best update.

7. In WsTurnSettledPayload, add:
  /** Non-zero when Sarge's non-compliance fine was applied this roll. */
  nonComplianceFine?: number;

  Populate it before the emit.

══════════════════════════════════════════════════
apps/web/src/store/useGameStore.ts
══════════════════════════════════════════════════

8. In the 'turn:settled' socket listener, read nonComplianceFine from the payload.
   If present and > 0, display a warning toast or log line. The exact display
   mechanism depends on the existing notification infrastructure — at minimum,
   add a console.warn or a dedicated HUD flash so the player knows the fine was applied.

Run npm run typecheck after completing.
```

---

## Step 9 — Targeted Demolition + Load-Bearing: The Architect (F9)

**Goal:** Change CONVERGENCE slot removal from "highest-numbered slot" to "the slot that
fired most recently during this seven-out roll's cascade." If no crew fired this roll,
fall back to highest-numbered slot. Add Load-Bearing: each removed slot applies a
cumulative 15% additive penalty to all remaining crew (compounding per slot removed).

**Files:**
- @packages/shared/src/bossRules/convergence.ts
- @apps/api/src/routes/rolls.ts

---

```
Implement Targeted Demolition + Load-Bearing for The Architect's CONVERGENCE mechanic.

══════════════════════════════════════════════════
packages/shared/src/bossRules/convergence.ts
══════════════════════════════════════════════════

1. Read this file to understand current modifyCascadeOrder. Update its comment header
   to reflect the new demolition targeting (the slot-removal logic itself lives in
   rolls.ts where it has access to the cascade events and crewSlots).

══════════════════════════════════════════════════
apps/api/src/routes/rolls.ts
══════════════════════════════════════════════════

2. Load-Bearing: after viggedContext is computed (in the post-cascade section), apply
   the cumulative load penalty if CONVERGENCE is active. bossPointHits = number of
   slots already removed this boss fight (0–5):

  // ── 8f. CONVERGENCE (Load-Bearing) — cumulative 15% additive penalty per removed slot ─
  const loadPenaltyFactor = isConvergenceBoss
    ? Math.pow(0.85, run.bossPointHits)  // 0 removed → 1.0×; 1 removed → 0.85×; etc.
    : 1.0;
  const loadBearingContext = isConvergenceBoss && viggedContext.additives > 0
    ? { ...viggedContext, additives: Math.floor(viggedContext.additives * loadPenaltyFactor / 100) * 100 }
    : viggedContext;

  Pass loadBearingContext to settleTurn() instead of viggedContext.
  (Note: isConvergenceBoss is already computed early in rollHandler.)

3. Targeted Demolition: in the SEVEN_OUT handling in computeNextState (or just before
   the CONVERGENCE bossPointHits increment), determine which slot to remove.

  In the SEVEN_OUT case, the cascade events from this roll are available as `events`
  in the outer rollHandler scope — but computeNextState does not receive them.
  Pass the last-triggered slot index as a parameter.

  Change computeNextState signature to add an optional lastTriggeredSlot parameter:

    function computeNextState(
      run:                 RunRow,
      finalCtx:            ReturnType<typeof resolveRoll>,
      newBankroll:         number,
      incomingBets:        Bets,
      hasSeaLegs:          boolean,
      lastTriggeredSlot?:  number | null,   // ← new, optional
    )

  In rollHandler, compute lastTriggeredSlot from events before calling computeNextState:

    const lastTriggeredSlot = events.length > 0
      ? (events[events.length - 1]?.slotIndex ?? null)
      : null;

  Pass lastTriggeredSlot into computeNextState.

4. In computeNextState's SEVEN_OUT case, find where crewSlots are modified for
   CONVERGENCE (where a slot is zeroed out). Change the target slot selection:

  Currently the code removes the slot at index (4 - bossPointHits) — highest numbered
  active slot. Change this to:

    // Targeted Demolition: remove the most recently triggered slot.
    // If no crew fired this roll, fall back to highest-numbered active slot.
    const targetSlot = lastTriggeredSlot !== null && lastTriggeredSlot !== undefined
      ? lastTriggeredSlot
      : Math.max(0, (run.unlockedSlots as number) - 1 - run.bossPointHits);

  Use targetSlot when zeroing the crewSlots entry for CONVERGENCE removal.

Run npm run typecheck after completing.
```

---

## Step 10 — Comp Audit & Documentation

**Goal:** Update comp descriptions that interact with redesigned bosses, update CLAUDE.md
game constants, and add the FB-026 entry to the feature backlog. No code logic changes.

**Files:**
- @packages/shared/src/config.ts
- @docs/requirements/feature-backlog.md
- @CLAUDE.md

---

```
Audit comp descriptions and update project documentation for FB-026 boss overhaul.

══════════════════════════════════════════════════
packages/shared/src/config.ts — comp descriptions
══════════════════════════════════════════════════

1. THE_COVENANT (Floor 5 boss comp): description now refers to Hierophant Escrow.
   Update compDescription:

  OLD: 'Direct bankroll drains from boss mechanics are permanently reduced by 50%.'
  NEW: 'Hierophant Escrow seizures on Seven Out are halved — 25% becomes 12.5%. Sarge non-compliance fines are also halved.'

2. SEA LEGS (Floor 3 boss comp): note its defensive value against The Commander.
   Append to compDescription:

  OLD: 'On Seven Out, Hype resets to 50% instead of 1.0×.'
  NEW: 'On Seven Out, Hype resets to 50% instead of 1.0× — safely below The Commander\'s High Altitude danger zone.'

3. THE FREQUENCY (Floor 8 boss comp): naturals now resolve normally under The Emissary.
   Confirm compDescription reflects this bonus is active for the rest of the run
   (including during The Architect's floor):

  Current: 'Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run.'
  No text change needed — it's already accurate. Verify the value is still 3%.

══════════════════════════════════════════════════
docs/requirements/feature-backlog.md
══════════════════════════════════════════════════

4. Append a new FB-026 entry summarising the boss overhaul. Include:
   - Feature type: Balance / Boss Redesign
   - Status: In Progress
   - Which bosses changed and what the new mechanic is for each
   - Note which bosses are unchanged (The Foreman, The Sovereign's comp)
   - Reference this manifest file

══════════════════════════════════════════════════
CLAUDE.md
══════════════════════════════════════════════════

5. Update the Bosses quick-reference line to reflect new mechanics:

  Foreman (20% payout tax — unchanged) |
  Sarge (rising min-bets + non-compliance fine + odds minimum) |
  Mme. Le Prix (35% additive tariff — crew still fire) |
  The Executive (three-strike: −20% / −40% / GAME_OVER on 4) |
  The Hierophant (additive escrow — 25% seized on 7-out) |
  The Sovereign (four-stage tide: LOW/EBB/HIGH/FLOW per come-out) |
  The Commander (tier-scaled hype decay + death spiral below 0.75×) |
  The Emissary (transmission delay — additives held one roll, evaporate on 7-out) |
  The Architect (targeted demolition — last-triggered slot removed + load-bearing penalty)

  Also update the Comps quick-reference for THE_COVENANT and SEA LEGS descriptions.
```

---

## Step 11 — Client: Tide Stage Display (BossRoomHeader)

**Goal:** Show the current Tidal Surge stage label (LOW TIDE / EBB / HIGH TIDE / FLOW)
dynamically in the BossRoomHeader during The Sovereign fight. The stage is derived
client-side from newBossPointHits % 4 using the GAUNTLET config available in shared.

**Files:**
- @apps/web/src/components/BossRoomHeader.tsx *(or whichever component renders the active boss rule header)*
- @packages/shared/src/config.ts *(read only — for GAUNTLET import)*

---

```
Add dynamic tide stage label display to the BossRoomHeader for TIDAL_SURGE boss fights.

In BossRoomHeader (or equivalent component that renders ruleHeaderText during a boss fight):

1. Import GAUNTLET from '@battlecraps/shared' if not already imported.

2. Read the current bossPointHits from game state (already available via useGameStore
   as newBossPointHits from the last turn:settled event, or from the run state).

3. When the active boss rule is TIDAL_SURGE, derive the current stage:

  const currentBossConfig = GAUNTLET[currentMarkerIndex]?.boss;
  const isTidalSurge = currentBossConfig?.rule === 'TIDAL_SURGE';
  const tideStageLabel = isTidalSurge
    ? (() => {
        const params = currentBossConfig!.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
        const stageIndex = bossPointHits % params.stageMultipliers.length;
        return params.stageLabels[stageIndex] ?? 'LOW TIDE';
      })()
    : null;

4. In the header render, when isTidalSurge, display the tideStageLabel prominently
   below or alongside the ruleHeaderText. Use a visually distinct style:
   - LOW TIDE: neutral/blue
   - EBB: yellow/amber
   - HIGH TIDE: red/urgent
   - FLOW: yellow/amber (receding)

   The exact styling approach depends on existing BossRoomHeader markup — match
   the established pattern for dynamic boss state indicators.

5. Also display the minimum bet for the current tide stage (already computable from
   getBossMinBet(currentMarkerIndex, bossPointHits) available from '@battlecraps/shared').
   Show it as: "CURRENT MINIMUM: $X,XXX" with the tide label colour.

Run npm run typecheck after completing.
```

---

## Implementation Order Summary

| Step | Boss/Area | Phase | Schema? | Approx. Complexity |
|------|-----------|-------|---------|-------------------|
| 1  | Sovereign — Tidal Wave | 1 | No | Low |
| 2  | Mme. Le Prix — Tariff | 1 | No | Low |
| 3  | Commander — High Altitude | 1 | No | Low |
| 4  | Executive — Three-Strike | 1 | No | Medium |
| 5  | DB Migration | 2 | **Yes** | Low |
| 6  | Hierophant — Escrow | 2 | No (uses Step 5) | Medium |
| 7  | Emissary — Transmission Delay | 2 | No (uses Step 5) | Medium |
| 8  | Sarge — Non-compliance + Odds | 3 | No | Medium |
| 9  | Architect — Targeted Demolition | 3 | No | Medium |
| 10 | Comp audit + Docs | — | No | Low |
| 11 | Client — Tide Stage Display | — | No | Low |
