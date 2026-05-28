# FB-025 — Crew Slot Progression: Technical Design Document

**Status:** Ready for implementation  
**Author:** Staff Engineer  
**Feature Backlog Entry:** `docs/requirements/feature-backlog.md` § FB-025

---

## 1. Overview

New runs start with **3 active crew slots** instead of 5. Two additional slots unlock as milestone comp rewards for defeating specific bosses:

| Unlock | Boss | Floor | Slot Name | Replaces |
|---|---|---|---|---|
| Slot 4 | The Executive | Floor 4 | **BOARD SEAT** | Golden Touch |
| Slot 5 | The Commander | Floor 7 | **CARGO HOLD** | Zero Point |

This makes the crew rail feel earned rather than given, gives boss victories tangible mechanical weight beyond a perk card, and ensures the early floors are harder — players cannot field a full 5-crew cascade until F8.

---

## 2. Design Decisions

### 2.1 Starting Slot Count: 3

Floors 1–4 are fought with 3 crew slots. This has downstream effects on balance:
- The dominant Grinder/Doorman additive build requires more deliberate slot choices early
- The pub draft becomes a real triage decision (3 slots, 5 shooters worth of options)
- Complements the boss redesign changes — bosses are more dangerous, and players have fewer crew to absorb that pressure

### 2.2 Unlock Triggers: Boss Comp Rewards

Slot unlocks are boss comp rewards, not a separate parallel system. They surface through the existing `BossVictoryCompPhase` flow and are written to the run by `recruit.ts` on the first post-boss pub visit — the exact same timing as all other comp perks.

No new game flow is required. The existing post-boss pub visit is the unlock moment.

### 2.3 Comp Replacement (Not Addition)

`BOARD_SEAT` fully replaces `GOLDEN_TOUCH` at F4. `CARGO_HOLD` fully replaces `ZERO_POINT` at F7. Players do **not** receive both the old perk and the new slot — the slot IS the comp.

`GOLDEN_TOUCH` and `ZERO_POINT` are removed from `CompRewardType` entirely.

**Rationale:** A crew slot is a dramatically more powerful reward than either removed perk. Stacking them would significantly over-reward those boss victories.

### 2.4 Fill Timing: Next Post-Boss Pub Visit

The newly unlocked slot is written to `runs.unlockedSlots` in the DB when the player visits the pub after the boss (the `recruit.ts` handler). The pub renders only unlocked slots as recruitable targets, so the empty slot 4 (or 5) is immediately available to fill during that same visit. No special one-off recruitment flow is needed.

### 2.5 Rail Visual: Physical Growth (3 → 4 → 5)

The crew rail renders exactly `unlockedSlots` portraits — not 5 with 2 grayed-out. The rail visually expands when a new slot is unlocked. This makes the slot unlock feel like a genuine addition to the player's toolset rather than a restriction being lifted.

### 2.6 Migration: Existing Runs Grandfathered

The new `unlockedSlots` column defaults to **5** in the migration for all existing rows. Players with active runs retain their full 5-slot crew — the new restriction only applies to fresh runs.

---

## 3. Data Model

### 3.1 `runs.unlockedSlots` — New Column

```sql
unlocked_slots  integer  NOT NULL  DEFAULT 3
```

- **New runs:** default 3 via application code (not DB default — see §5.1)
- **Existing runs:** migration sets all existing rows to 5
- Stored as a plain integer; only values 3, 4, 5 are valid at runtime

The underlying `crew_slots` JSONB column remains a **fixed-length 5-element array** (`[null, null, null, null, null]` initially). `unlockedSlots` is the authority on which indices are active. Slots at index ≥ `unlockedSlots` must always be `null` and are ignored by the cascade, recruit, and reorder routes.

### 3.2 `CompRewardType` Changes

```typescript
// packages/shared/src/config.ts

export type CompRewardType =
  | 'THE_VIG'
  | 'EXTRA_SHOOTER'
  | 'HYPE_RESET_HALF'
  | 'BOARD_SEAT'       // Floor 4 — Crew slot 4 unlocked  (replaces GOLDEN_TOUCH)
  | 'THE_COVENANT'
  | 'POSEIDONS_FAVOR'
  | 'CARGO_HOLD'       // Floor 7 — Crew slot 5 unlocked  (replaces ZERO_POINT)
  | 'THE_FREQUENCY'
  | 'NONE';
```

`GOLDEN_TOUCH` and `ZERO_POINT` are removed. Any exhaustive switch/map on `CompRewardType` will surface a TS error at compile time — use that to find and update all read sites.

### 3.3 `COMP_PERK_IDS` Changes

Slot-unlock comps do **not** use `compPerkIds` for enforcement — `unlockedSlots` is the enforcement mechanism. Their `compPerkId` in `BossConfig` is set to `0` (same as NONE). `recruit.ts` detects the slot-unlock comp type and increments `unlockedSlots` directly instead of appending to `compPerkIds`.

```typescript
export const COMP_PERK_IDS = {
  THE_VIG:         0,  // Floor 1 — crew cash +20%
  MEMBER_JACKET:   1,  // Floor 2 — +1 Shooter
  SEA_LEGS:        2,  // Floor 3 — hype resets to 50%
  // ID 3 retired (was GOLDEN_TOUCH) — replaced by BOARD_SEAT (no perkId needed)
  THE_COVENANT:    5,  // Floor 5 — bankroll drains −50%
  POSEIDONS_FAVOR: 6,  // Floor 6 — first come-out can't craps-out
  // ID 7 retired (was ZERO_POINT) — replaced by CARGO_HOLD (no perkId needed)
  THE_FREQUENCY:   8,  // Floor 8 — naturals award 3% of marker target
} as const;
```

---

## 4. Shared Package Changes (`packages/shared`)

### 4.1 `types.ts` — Add `unlockedSlots` to `TurnContext`

`resolveCascade()` iterates over `crewSlots` to run each crew's `execute()`. It must only iterate over the first `unlockedSlots` slots.

```typescript
export interface TurnContext {
  // ... existing fields ...

  /**
   * The number of crew slots active for this run (3, 4, or 5).
   * resolveCascade() must only iterate crewSlots[0..unlockedSlots-1].
   * Injected by rolls.ts before the cascade runs.
   */
  unlockedSlots: 3 | 4 | 5;
}
```

### 4.2 `cascade.ts` — Respect `unlockedSlots`

`resolveCascade()` currently iterates all 5 slots. Update to slice at `unlockedSlots`:

```typescript
// Before
for (const slot of ctx.crewSlots) { ... }

// After
for (const slot of ctx.crewSlots.slice(0, ctx.unlockedSlots)) { ... }
```

The `modifyCascadeOrder` hook (used by DISABLE_CREW and CONVERGENCE) already returns an index array. No changes needed there — indices above `unlockedSlots - 1` won't appear in the active slice anyway.

### 4.3 `config.ts` — GAUNTLET Updates

Update F4 (The Executive) boss config:

```typescript
// Floor 4 — The Executive
compReward:      'BOARD_SEAT',
compPerkId:      0,
compName:        'BOARD SEAT',
compDescription: 'A fourth crew slot unlocks. Expand your operation.',
```

Update F7 (The Commander) boss config:

```typescript
// Floor 7 — The Commander
compReward:      'CARGO_HOLD',
compPerkId:      0,
compName:        'CARGO HOLD',
compDescription: 'A fifth crew slot unlocks. Full crew capacity reached.',
```

Remove `GOLDEN_TOUCH` and `ZERO_POINT` enforcement logic from `rolls.ts` (see §5.3).

---

## 5. API Changes (`apps/api`)

### 5.1 `db/schema.ts` — New Column

```typescript
// In the runs table definition:
unlockedSlots: integer('unlocked_slots').notNull().default(3),
```

Note: The DB-level `DEFAULT 3` is for the migration. Application code in `runs.ts` (POST /runs, new run creation) explicitly passes `unlockedSlots: 3`. This is intentional — we want both the DB and application layer to agree on the starting value.

### 5.2 Migration File

Create `apps/api/src/db/migrations/migrate-add-unlocked-slots.ts`:

```typescript
// Sets unlocked_slots = 3 as the column default for new rows.
// Backfills all EXISTING rows to 5 (grandfather — they were built with 5 slots).
await db.execute(sql`
  ALTER TABLE runs ADD COLUMN IF NOT EXISTS unlocked_slots integer NOT NULL DEFAULT 3;
  UPDATE runs SET unlocked_slots = 5 WHERE unlocked_slots = 3;
  -- Reset default to 3 so new runs start with 3 slots
  ALTER TABLE runs ALTER COLUMN unlocked_slots SET DEFAULT 3;
`);
```

> **Note:** The two-step `UPDATE` after `ALTER TABLE` ensures existing rows get 5. The final `ALTER COLUMN` resets the default back to 3 for all future inserts.

### 5.3 `routes/recruit.ts` — Slot Unlock Enforcement

**New: Slot unlock comp handling.** After the existing comp perk write block, add:

```typescript
const isSlotUnlock = (reward: CompRewardType): reward is 'BOARD_SEAT' | 'CARGO_HOLD' =>
  reward === 'BOARD_SEAT' || reward === 'CARGO_HOLD';

if (bossConfig && isSlotUnlock(bossConfig.compReward)) {
  const newSlotCount = bossConfig.compReward === 'BOARD_SEAT' ? 4 : 5;
  await db
    .update(runs)
    .set({ unlockedSlots: newSlotCount })
    .where(eq(runs.id, runId));
}
```

**Update: Recruit slot validation.** The recruit endpoint must reject attempts to fill a slot at index ≥ `unlockedSlots`:

```typescript
// After fetching the run:
if (body.targetSlot >= run.unlockedSlots) {
  return reply.status(400).send({ error: 'Slot not yet unlocked' });
}
```

**Remove:** The `GOLDEN_TOUCH` guarantee block (`do { rollDice() } while (...)`) and the `ZERO_POINT` hype floor block from `rolls.ts`. Both are obsoleted by their replacement comps.

### 5.4 `routes/runs.ts` — Include `unlockedSlots` in Response

Both `GET /runs/:id` (run hydration) and `POST /runs` (new run) responses must include `unlockedSlots` so the client can initialize the Zustand store correctly.

```typescript
return reply.send({
  runId:          run.id,
  // ... existing fields ...
  unlockedSlots:  run.unlockedSlots,  // ← add
});
```

### 5.5 `routes/reorder.ts` — Slot Count Validation

The reorder endpoint receives a `slotOrder` permutation array. Validate its length matches `unlockedSlots`:

```typescript
if (body.slotOrder.length !== run.unlockedSlots) {
  return reply.status(400).send({ error: 'slotOrder length must match unlockedSlots' });
}
```

### 5.6 `routes/rolls.ts` — Inject `unlockedSlots` into TurnContext

Before calling `resolveCascade()`, inject `unlockedSlots` from the run:

```typescript
const ctx: TurnContext = {
  // ... existing fields ...
  unlockedSlots: run.unlockedSlots as 3 | 4 | 5,
};
```

---

## 6. Client Changes (`apps/web`)

### 6.1 `store/useGameStore.ts`

**Add to state:**
```typescript
unlockedSlots: 3 | 4 | 5;  // default: 3
```

**Update `slotIds` initialization.** Currently hardcoded to 5 entries. Derive from `unlockedSlots`:

```typescript
// Helper
const buildSlotIds = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `slot-${i}`);

// In initial state:
unlockedSlots: 3,
slotIds: buildSlotIds(3),

// In hydrateRun (called on GET /runs/:id and POST /runs responses):
unlockedSlots: data.unlockedSlots,
slotIds: buildSlotIds(data.unlockedSlots),
```

When the slot count changes (post-boss pub visit triggers a `hydrateRun`), `slotIds` is rebuilt automatically.

### 6.2 `TableBoard.tsx` — Dynamic Crew Rail

The crew rail currently maps over all 5 `crewSlots`. Slice to `unlockedSlots`:

```typescript
const unlockedSlots = useGameStore((s) => s.unlockedSlots);

// In render:
{crewSlots.slice(0, unlockedSlots).map((slot, i) => (
  <div key={slotIds[i] ?? `slot-${i}`} data-slot-index={i}>
    <CrewPortrait
      sortableId={slotIds[i] ?? `slot-${i}`}
      slotIndex={i}
      crewId={slot?.crewId ?? null}
    />
  </div>
))}
```

`SortableContext` already uses `slotIds`, which is now derived from `unlockedSlots` — no additional changes needed there.

### 6.3 `transitions/phases/BossVictoryCompPhase.tsx` — Slot Unlock Display

The comp phase currently branches on `compReward === 'NONE'` (auto-advance) vs. everything else (CompCard fan). Add a third branch for slot unlocks:

```typescript
const isSlotUnlock = (reward: CompRewardType | undefined): boolean =>
  reward === 'BOARD_SEAT' || reward === 'CARGO_HOLD';
```

**Slot unlock display:** Skip the CompCard fan. Instead, show a full-screen unlock reveal:

```
╔══════════════════════════════╗
║                              ║
║   [ crew rail icon grows ]   ║
║                              ║
║      NEW CREW SLOT           ║
║        UNLOCKED              ║
║                              ║
║      ▓▓ BOARD SEAT ▓▓        ║
║                              ║
║   "Expand your operation."   ║
║                              ║
║     [ CONTINUE TO PUB ]      ║
║                              ║
╚══════════════════════════════╝
```

The reveal uses the same timed appearance pattern as the existing comp card (600ms delay → show content, 1400ms → show button). No new animation primitives needed.

The `NONE` auto-advance `useEffect` remains unchanged.

### 6.4 `BossVictoryModal.tsx` — Update Label/Subtext Maps

`REWARD_LABELS` and `REWARD_SUBTEXTS` are exhaustive maps over `CompRewardType`. Remove `GOLDEN_TOUCH` and `ZERO_POINT` entries; add `BOARD_SEAT` and `CARGO_HOLD`:

```typescript
const REWARD_LABELS: Record<CompRewardType, string> = {
  // ...existing...
  BOARD_SEAT: 'BOARD SEAT',
  CARGO_HOLD: 'CARGO HOLD',
  // GOLDEN_TOUCH and ZERO_POINT removed
};

const REWARD_SUBTEXTS: Partial<Record<CompRewardType, string>> = {
  // ...existing...
  BOARD_SEAT: 'A fourth crew slot opens up. Visit the pub to fill it.',
  CARGO_HOLD: 'Full crew capacity reached. A fifth slot is yours.',
};
```

### 6.5 `PubScreen.tsx` — Slot Availability

The pub currently renders recruitment for all 5 slots. Add `unlockedSlots` awareness:

- Only render crew portrait slots for indices `0..unlockedSlots-1`
- The recruit API call will also reject out-of-range slot indices server-side (§5.3), but the client should not render locked slots at all

```typescript
const unlockedSlots = useGameStore((s) => s.unlockedSlots);

// Filter crewSlots to only active slots before rendering recruitment UI
const activeSlots = crewSlots.slice(0, unlockedSlots);
```

### 6.6 Tutorial — Brief Update

The tutorial crew rail beats currently assume 5 slots are visible. The tutorial runs on F1, so players will only see 3 slots. The tutorial beat that introduces the crew rail needs a copy update:

> **Before:** "These are your five crew members…"  
> **After:** "These are your three crew slots — more unlock as you clear bosses…"

The spotlight mask (`useTutorialSpotlight`) targets specific slot indices — verify it doesn't reference slots 3 or 4 during the F1 tutorial flow.

---

## 7. The Architect (F9) — CONVERGENCE Interaction

The Architect removes one crew slot per 7-out (tracked by `bossSevenOutCount`, capped at 5). Since all players reaching F9 have beaten F7 (and therefore have 5 unlocked slots), `unlockedSlots = 5` is guaranteed at F9 entry. CONVERGENCE can remove all 5 slots before the naked craps threshold is reached.

No special interaction logic is required. The Architect's `modifyCascadeOrder` already shrinks the active indices array on each 7-out — it operates on the cascade order array, not on `unlockedSlots` directly, so there is no conflict.

> **Edge case guard:** If, in a future design change, a player could somehow reach F9 with fewer than 5 slots, ensure `bossSevenOutCount` cap remains at `min(5, run.unlockedSlots)` to avoid removing below zero.

---

## 8. Implementation Order

```
1  packages/shared/src/types.ts                     Add unlockedSlots to TurnContext
2  packages/shared/src/config.ts                    CompRewardType swap; GAUNTLET F4/F7 updates
3  packages/shared/src/cascade.ts                   Slice crewSlots to unlockedSlots in loop
4  packages/shared/src/__tests__/helpers.ts          Add unlockedSlots: 5 default to makeCtx
5  packages/shared/src/__tests__/config.test.ts      Update comp reward assertions (see §11)
6  packages/shared/src/__tests__/cascade.test.ts     Add slot boundary tests (see §11)
7  packages/shared/src/__tests__/godBuild…test.ts   Add unlockedSlots: 5 to manual TurnContext literals
8  apps/api/src/db/schema.ts                        Add unlocked_slots column
9  apps/api/src/db/migrations/                      Write + run migration (backfill existing rows to 5)
10 apps/api/src/routes/runs.ts                      Include unlockedSlots in all run responses
11 apps/api/src/routes/rolls.ts                     Inject unlockedSlots into TurnContext; remove GOLDEN_TOUCH/ZERO_POINT blocks
12 apps/api/src/routes/recruit.ts                   Slot unlock comp handler; slot index validation
13 apps/api/src/routes/reorder.ts                   slotOrder length validation
14 apps/web/src/store/useGameStore.ts               Add unlockedSlots; dynamic slotIds
15 apps/web/src/components/TableBoard               Dynamic crew rail slice
16 apps/web/src/components/PubScreen                Active slot filtering
17 apps/web/.../BossVictoryCompPhase                Slot unlock display branch
18 apps/web/.../BossVictoryModal                    Label/subtext map updates
19 apps/web/src/lib/tutorialBeats.ts                Copy update for crew rail beat
20 Copy audit (see §12)                             All in-game text surfaces
21 npm run test                                     L1 + L2 suite must pass clean
22 npm run build                                    Full typecheck — CompRewardType exhaustive switch sites will surface
```

---

## 9. Files Changed Summary

| File | Action |
|---|---|
| `packages/shared/src/types.ts` | Add `unlockedSlots` to `TurnContext` |
| `packages/shared/src/config.ts` | Swap `CompRewardType`; update GAUNTLET F4/F7; update `COMP_PERK_IDS` |
| `packages/shared/src/cascade.ts` | Slice crew loop to `unlockedSlots` |
| `apps/api/src/db/schema.ts` | Add `unlocked_slots` column |
| `apps/api/src/db/migrations/migrate-add-unlocked-slots.ts` | Create migration |
| `apps/api/src/routes/runs.ts` | Include `unlockedSlots` in responses |
| `apps/api/src/routes/rolls.ts` | Inject into `TurnContext`; remove Golden Touch + Zero Point blocks |
| `apps/api/src/routes/recruit.ts` | Slot unlock handler; slot index guard |
| `apps/api/src/routes/reorder.ts` | `slotOrder` length validation |
| `apps/web/src/store/useGameStore.ts` | `unlockedSlots` state; dynamic `slotIds` |
| `apps/web/src/components/TableBoard.tsx` | Slice crew rail to `unlockedSlots` |
| `apps/web/src/components/PubScreen.tsx` | Active slot filtering |
| `apps/web/src/transitions/phases/BossVictoryCompPhase.tsx` | Slot unlock display branch |
| `apps/web/src/components/BossVictoryModal.tsx` | Label/subtext map updates |
| `apps/web/src/lib/tutorialBeats.ts` | Crew rail copy update |

---

## 11. Automated Test Changes

The project has two tiers of automated tests, both in `packages/shared/src/__tests__/` and run via `npm run test`.

**L1 — Unit tests:** `crapsEngine.test.ts`, `config.test.ts`, `crew.test.ts`, `crew/lefty.test.ts`, `crew/handicapper.test.ts`

**L2 — Integration tests:** `cascade.test.ts`, `cascade.integration.test.ts`, `godBuild.integration.test.ts`

No automated L3 (API / E2E) tests exist. L3 coverage for this feature is manual (see §12).

---

### 11.1 `helpers.ts` — `makeCtx` default (required, all tiers)

Adding `unlockedSlots` to `TurnContext` makes every manual `TurnContext` construction in the test suite a TypeScript error. Fix by adding the field to the `makeCtx` factory default:

```typescript
export function makeCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    // ... existing defaults ...
    unlockedSlots: 5,   // ← ADD — default to 5 so all existing tests remain valid
    ...overrides,
  };
}
```

**Default is 5, not 3.** Existing tests are written against the full-crew cascade — forcing them to 3 would silently drop crew and break assertions. Tests that specifically want to verify slot-limited behavior pass `unlockedSlots: 3` as an override.

---

### 11.2 `godBuild.integration.test.ts` — Manual TurnContext literals (required)

The god-build tests construct `TurnContext` as a literal object (they import `makeBets`/`makeHardwayBets` but not `makeCtx`). Once `unlockedSlots` is required on the interface, these literals will fail `tsc`. Add `unlockedSlots: 5` to each TurnContext object literal in that file.

---

### 11.3 `config.test.ts` — Comp reward assertions (update + add)

**Remove or update** any assertions that reference `GOLDEN_TOUCH` or `ZERO_POINT` comp rewards — these identifiers will no longer exist in `CompRewardType` and will cause TS errors.

**Add** the following assertions:

```typescript
describe('Boss comp rewards — slot unlock floors', () => {
  it('F4 boss (index 11) awards BOARD_SEAT', () => {
    expect(GAUNTLET[11]?.boss?.compReward).toBe('BOARD_SEAT');
  });

  it('F7 boss (index 20) awards CARGO_HOLD', () => {
    expect(GAUNTLET[20]?.boss?.compReward).toBe('CARGO_HOLD');
  });

  it('GOLDEN_TOUCH does not appear in any boss comp reward', () => {
    const rewards = GAUNTLET.filter(m => m.isBoss).map(m => m.boss?.compReward);
    expect(rewards).not.toContain('GOLDEN_TOUCH');
  });

  it('ZERO_POINT does not appear in any boss comp reward', () => {
    const rewards = GAUNTLET.filter(m => m.isBoss).map(m => m.boss?.compReward);
    expect(rewards).not.toContain('ZERO_POINT');
  });
});
```

---

### 11.4 `cascade.test.ts` — Slot boundary tests (new, L2)

Add a new describe block verifying that `resolveCascade` respects `unlockedSlots`:

```typescript
describe('resolveCascade — unlockedSlots boundary', () => {
  it('does NOT fire crew in slot 3 when unlockedSlots=3', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots = [trackingCrew(0), trackingCrew(1), trackingCrew(2), trackingCrew(3), null];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 3 });

    resolveCascade(slots, ctx, neverCalledRng);

    expect(executed).toEqual([0, 1, 2]);    // slot 3 must not appear
    expect(executed).not.toContain(3);
  });

  it('DOES fire crew in slot 3 when unlockedSlots=4', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots = [trackingCrew(0), null, trackingCrew(2), trackingCrew(3), null];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 4 });

    resolveCascade(slots, ctx, neverCalledRng);

    expect(executed).toContain(3);
  });

  it('does NOT fire crew in slot 4 when unlockedSlots=4', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots = [trackingCrew(0), null, null, trackingCrew(3), trackingCrew(4)];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 4 });

    resolveCascade(slots, ctx, neverCalledRng);

    expect(executed).not.toContain(4);
  });
});
```

---

## 12. Copy & In-Game Text Audit

All in-game text surfaces that reference crew count, comp names, or slot availability must be reviewed before shipping. Run the grep below first to catch any hardcoded string that `tsc` won't catch:

```bash
# Find hardcoded crew-count copy and retired comp names
grep -rn --include="*.ts" --include="*.tsx" \
  "five crew\|5 crew\|five slot\|5 slot\|GOLDEN_TOUCH\|ZERO_POINT\|Golden Touch\|Zero Point" \
  apps/web/src packages/shared/src
```

### Surfaces to audit manually

| Surface | File | What to check |
|---|---|---|
| **Comp reveal screen** | `BossVictoryCompPhase.tsx` | New slot-unlock branch copy (§6.3) — "NEW CREW SLOT UNLOCKED", slot name, description |
| **Boss victory modal** | `BossVictoryModal.tsx` | `REWARD_LABELS` and `REWARD_SUBTEXTS` maps — BOARD_SEAT and CARGO_HOLD entries present; GOLDEN_TOUCH and ZERO_POINT removed |
| **Boss config descriptions** | `config.ts` GAUNTLET F4/F7 | `compName` and `compDescription` strings for BOARD_SEAT and CARGO_HOLD |
| **Tutorial crew rail beat** | `tutorialBeats.ts` | Any reference to "five crew", "5 slots", or presenting the rail as fully populated from the start |
| **How to Play screen** | `HowToPlayScreen.tsx` + its 3 section components | Search for crew slot count references — update to "start with 3 crew slots, earn more by defeating bosses" |
| **Pub screen headers / helper text** | `PubScreen.tsx` | Any copy implying 5 slots are always available ("fill all five slots", "your roster", etc.) |
| **Boss room header** | `BossRoomHeader.tsx` | Reads `compName` from `BossConfig` — no hardcoded strings, should be correct after config update. Confirm visually. |
| **Release notes** | Version bump note | When shipped, add a release note entry: "Crew rail now starts with 3 slots — earn BOARD SEAT (F4) and CARGO HOLD (F7) to expand" |

### L3 Manual Regression Scenarios

Since no automated API or E2E tests exist, these scenarios must be verified manually before shipping:

| # | Scenario | Expected |
|---|---|---|
| 1 | Start a new run | Crew rail shows exactly 3 slots |
| 2 | Attempt to recruit into slot index 3 via direct API call | 400 — "Slot not yet unlocked" |
| 3 | Beat The Executive (F4 boss), visit pub | Rail expands to 4 slots; slot 4 is empty and recruitable |
| 4 | Beat The Commander (F7 boss), visit pub | Rail expands to 5 slots; slot 5 is empty and recruitable |
| 5 | Place crew in slot 4 before F4 boss cleared | Impossible — slot does not render; API rejects direct attempts |
| 6 | Verify slot 4 crew participates in cascade after F4 boss cleared | Crew fires, events appear in roll log |
| 7 | Drag-and-drop reorder with 3 slots | Works correctly; `slotOrder` length = 3 accepted by server |
| 8 | Drag-and-drop reorder with 4 slots | Works correctly; `slotOrder` length = 4 accepted by server |
| 9 | Load an existing in-progress run (migrated) | Rail shows 5 slots as before — grandfathering intact |
| 10 | Refresh mid-run (hydration) | `unlockedSlots` correctly restored from server; rail matches |

---

## 13. Open Considerations

- **Slot unlock animation in the crew rail itself** — when `unlockedSlots` ticks from 3→4 or 4→5 (after a pub visit that writes the unlock), the rail could animate the new slot sliding in. This is a polish pass, not a blocker. The Zustand `hydrateRun` call after the pub visit will update `slotIds` and trigger a re-render; a simple CSS transition on the rail container handles the expansion.
- **Future: Slot unlock via meta-progression** — if a future design gives veteran players all 5 slots from the start of a run (as a meta-unlock), `unlockedSlots` would be set to 5 on run creation instead of 3. The architecture supports this without further changes.
- **Future: The Architect below unlocked count** — currently not possible in normal play. Guard documented in §7.
- **Future: L3 automated API tests** — the manual regression table in §12 is a natural candidate for an API integration test suite once one is established.
