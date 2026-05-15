# FB-015 — The Loading Dock: Technical Design Document

**Feature:** FB-015 — Expanded Gauntlet (Floor 1: The Loading Dock)
**Branch:** `feature/fb-015-loading-dock`
**Status:** Pending approval

---

## 1. Summary

The Loading Dock is a new Floor 1 prepended to the gauntlet, displacing VFW Hall from Floor 1 to Floor 2 (and cascading all floors up by one). It serves as a true tutorial-tier introduction: low dollar targets ($50/$100/$250), stark industrial aesthetics, and a brand-new boss — **The Foreman** — who introduces a brand-new boss rule: **EXTORTION_FEE** (a flat 20% tax on all winning payouts).

This is not purely additive. Prepending a floor **re-indexes the entire gauntlet**, which has DB and client implications that must be handled carefully.

---

## 2. Scope: What Changes

| System | File | Nature of change |
|---|---|---|
| Narrative | `packages/shared/src/floors.ts` | Prepend Loading Dock as Floor 1; shift VFW/Riverboat/Strip to floors 2–4; extend `FloorAtmosphere` type |
| Mechanical | `packages/shared/src/config.ts` | Prepend 3 new GAUNTLET markers; shift existing floor numbers; add `EXTORTION_FEE` to `BossRuleType` + `BossRuleParams`; add `THE_VIG` to `CompRewardType` + `COMP_PERK_IDS` |
| Visual | `apps/web/src/lib/floorThemes.ts` | Add new `FLOOR_1_THEME` (Loading Dock); rename existing themes to FLOOR_2/3/4; update clamp bounds to 4 floors |
| Boss rule | `apps/api/src/bossRules/extortionFee.ts` | New file: `EXTORTION_FEE` payout hook |
| Enforcement | `apps/api/src/routes/rolls.ts` | Wire `EXTORTION_FEE` hook; wire `THE_VIG` comp boost |
| Boss HUD | `apps/web/src/components/BossRoomHeader.tsx` | Add display branch for `EXTORTION_FEE` |
| DB migration | `apps/api/src/db/migrations/` or seed update | Shift `currentMarkerIndex` (+3) on active runs; shift `highest_marker_index` (+3) on leaderboard entries |
| CLAUDE.md | `CLAUDE.md` | Update gauntlet targets quick-reference + boss list |

---

## 3. Critical: The Gauntlet Re-indexing

### The problem

The current GAUNTLET is 9 markers (indices 0–8). After prepending the Loading Dock, it becomes 12 markers (indices 0–11):

| Old index | Old floor | New index | New floor |
|---|---|---|---|
| — | — | **0** | **Loading Dock** |
| — | — | **1** | **Loading Dock** |
| — | — | **2** | **Loading Dock — Freight Elevator (BOSS)** |
| 0 | VFW Hall | **3** | VFW Hall |
| 1 | VFW Hall | **4** | VFW Hall |
| 2 | VFW Hall (Sarge, BOSS) | **5** | VFW Hall (Sarge, BOSS) |
| 3 | Riverboat | **6** | Riverboat |
| 4 | Riverboat | **7** | Riverboat |
| 5 | Riverboat (Mme. Le Prix, BOSS) | **8** | Riverboat (Mme. Le Prix, BOSS) |
| 6 | The Strip | **9** | The Strip |
| 7 | The Strip | **10** | The Strip |
| 8 | The Strip (Executive, BOSS) | **11** | The Strip (Executive, BOSS) |

### Impact on DB

`runs.current_marker_index` is persisted to the DB and loaded on page refresh. Any existing active run with `current_marker_index = N` will now point to the wrong marker after the deploy.

**Required migration (Drizzle):**
```sql
-- Shift all active runs forward by 3 markers
UPDATE runs
SET current_marker_index = current_marker_index + 3
WHERE status IN ('ACTIVE', 'IN_PROGRESS');

-- Also shift leaderboard historical markers
UPDATE leaderboard_entries
SET highest_marker_index = highest_marker_index + 3;
```

> **Decision needed:** Should completed/game-over runs be migrated for historical accuracy, or left as-is? Recommendation: migrate leaderboard entries (highest_marker_index) for accuracy; leave game-over runs alone since they're terminal.

### Impact on shared code

- `getFloorByMarkerIndex()` in `floors.ts` — formula `Math.floor(markerIndex / 3) + 1` is unchanged; works automatically for 4 floors.
- `getFloorTheme()` and `getFloorIndex()` in `floorThemes.ts` — both currently clamp to `[0, 2]`. Must update to `[0, 3]`.
- `MARKER_TARGETS` — derived from GAUNTLET, auto-correct.
- `isBossMarker()` — reads `GAUNTLET[markerIndex].isBoss`, auto-correct.
- The CLAUDE.md quick-reference comment block needs manual update.

---

## 4. New Floor Data: The Loading Dock

### 4a. FloorConfig entry (floors.ts)

```typescript
{
  id:        1,
  name:      'The Loading Dock',
  tagline:   'The street. The hustle. Where it all begins.',
  introLines: [
    'Stained concrete and the harsh glare of a sodium-vapor streetlamp. The air is cold, and the dice are chipped.',
    'The Foreman stands by the freight elevator, steel-toed and impatient. He decides who gets to step inside.',
    "The street always takes its cut. Don't bleed out before the real game even starts.",
  ],
  bossName:   'The Foreman',
  bossTitle:  'Loading Dock Gatekeeper',
  bossVenue:  'The Loading Dock — Freight Elevator',
  bossTeaser: "The Foreman doesn't care if you win or lose. He just wants his cut.",
  atmosphere: 'exposed',
}
```

### 4b. `FloorAtmosphere` type extension

`FloorAtmosphere` in `floors.ts` currently is `'gritty' | 'elegant' | 'electric'`. Must add `'exposed'`:

```typescript
export type FloorAtmosphere = 'exposed' | 'gritty' | 'elegant' | 'electric';
```

> **Note:** `FloorAtmosphere` is stored in `FloorConfig` and passed through to transition components. Verify whether any switch/if statement exhausts this union — any unhandled `'exposed'` case would be a compile warning or runtime miss. A quick grep for `atmosphere` in `apps/web/src/` before implementation will confirm.

### 4c. Marker entries (config.ts)

New markers prepended to GAUNTLET:

```typescript
// ── Floor 1: The Loading Dock ─────────────────────────────────────────────
{
  targetCents: 5_000,  // $50
  venue:       'The Loading Dock',
  floor:       1,
  isBoss:      false,
},
{
  targetCents: 10_000,  // $100
  venue:       'The Loading Dock',
  floor:       1,
  isBoss:      false,
},
{
  targetCents: 25_000,  // $250 — BOSS: The Foreman
  venue:       'The Loading Dock — Freight Elevator',
  floor:       1,
  isBoss:      true,
  boss: { ... },  // see §5 below
},
```

All three existing floor entries update their `floor:` field: VFW Hall `1 → 2`, Riverboat `2 → 3`, Strip `3 → 4`.

### Bet limits at Loading Dock targets

Using the existing `getMaxBet` / `getMinBet` formulas (no changes needed):

| Marker | Target | Max bet (10%) | Min bet (~1/6 of max, ≥$5) |
|---|---|---|---|
| 0 | $50 | $5 | $5 |
| 1 | $100 | $10 | $5 |
| 2 (boss) | $250 | $25 | $5 |

The $5 floor on `getMinBet` means all three Loading Dock markers have a $5 minimum. This is intentional — it's the intro floor.

> **Starting bankroll check:** The player's initial bankroll is set when a new run is created in `routes/runs.ts`. Verify the current starting value is appropriate relative to the new $5 bet minimum and $50 first target. A starting bankroll of $25–$30 seems right for the Loading Dock; confirm and update `routes/runs.ts` if needed.

---

## 5. New Boss Rule: EXTORTION_FEE

### Design

> A flat 20% tax is automatically deducted from all winning payouts across all bets. The math rounds down (player-unfavorable). Applies in both COME_OUT and POINT_ACTIVE phases whenever a payout is issued.

### Type changes (config.ts)

```typescript
// BossRuleType — add:
| 'EXTORTION_FEE'

// BossRuleParams — add union member:
| { rule: 'EXTORTION_FEE'; taxPct: number }  // taxPct = 0.20
```

The Foreman's `ruleParams`:
```typescript
ruleParams: { rule: 'EXTORTION_FEE', taxPct: 0.20 }
```

### Server enforcement (rolls.ts + new bossRules/extortionFee.ts)

Following the existing boss rule hook pattern, create `apps/api/src/bossRules/extortionFee.ts`.

The hook fires **after `settleTurn()` returns** but **before the payout is applied to the bankroll**. Unlike `FOURS_INSTANT_LOSS` (pre-roll) and `DISABLE_CREW` (cascade-order), this is a new hook point: **post-settlement payout modifier**.

Proposed hook signature:
```typescript
// bossRules/extortionFee.ts
export function applyExtortionFee(
  payoutCents: number,
  stakeReturnedCents: number,
  taxPct: number,
): number {
  const profit = payoutCents - stakeReturnedCents;
  if (profit <= 0) return payoutCents;            // losing rolls: no tax
  const tax = Math.floor(profit * taxPct);         // rounds down (player-unfavorable)
  return payoutCents - tax;
}
```

In `rolls.ts`, after the call to `settleTurn()` and before `newBankroll` is computed, insert:
```typescript
if (currentBoss?.rule === 'EXTORTION_FEE' && currentBoss.ruleParams.rule === 'EXTORTION_FEE') {
  result.payoutCents = applyExtortionFee(
    result.payoutCents,
    result.stakeReturnedCents,
    currentBoss.ruleParams.taxPct,
  );
}
```

> **Dependency note:** `TurnResult` (from `crapsEngine.ts`) must expose `stakeReturnedCents` separately from `payoutCents` so we can compute the taxable profit. Verify this field exists; if not, it must be added to `TurnResult` in `crapsEngine.ts` and `types.ts`.

### Boss room header (BossRoomHeader.tsx)

New display branch for `EXTORTION_FEE`:

```
THE FOREMAN TAKES HIS CUT — 20% TAX ON ALL WINNING PAYOUTS
```

### Full Foreman BossConfig

```typescript
boss: {
  // Identity
  name:  'The Foreman',
  title: 'Loading Dock Gatekeeper',
  // Vibe
  dreadTagline:        "PAY UP.",
  entryLines: [
    "You're blocking my dock.",
    "I don't care who you are or how good you shoot.",
    "Twenty percent off the top. Every time. Non-negotiable.",
  ],
  ruleBlurb:          "20% tax on every winning payout. The Foreman always gets his cut.",
  victoryQuote:       "…you got lucky. Don't let me catch you around here again.",
  defeatAnnouncement: 'DOCK CLEARED',
  // Mechanic
  rule:           'EXTORTION_FEE',
  ruleHeaderText: 'THE FOREMAN TAKES 20% OF ALL WINNING PAYOUTS',
  ruleParams:     { rule: 'EXTORTION_FEE', taxPct: 0.20 },
  // Comp
  compReward:      'THE_VIG',
  compPerkId:      COMP_PERK_IDS.THE_VIG,
  compName:        'THE VIG',
  compDescription: "You took over the corner. Crew cash abilities permanently pay out 20% more.",
  compFanLabel:    'THE VIG',
  // Legacy
  flavorText:    "You're blocking my dock. Clear out or pay up.",
},
```

---

## 6. New Comp: THE_VIG

### Type changes (config.ts)

```typescript
// CompRewardType — add:
| 'THE_VIG'

// COMP_PERK_IDS — add:
THE_VIG: 4,
```

### Design

> Any crew abilities that award direct cash (`additiveCents` contributions to `TurnContext`) are permanently increased by 20% for the rest of the run.

### Implementation complexity: HIGH — decision required

`additiveCents` in `TurnContext` is a single accumulated integer. Once multiple crew members have contributed to it, there's no way to retroactively identify which portion came from "cash-granting" crew. The comp must be applied **at execution time**, per-crew-member.

**Proposed approach — flag on crew execute() output:**

Add an optional `isCashGrant: boolean` field to the return shape of crew `execute()` calls (or to `CascadeEvent`). When a crew member awards cash, it sets this flag. In `resolveCascade()`, if the player holds `THE_VIG` comp and the flag is set, boost that crew's `additiveCents` contribution by 20% before accumulating it.

This requires:
1. Auditing all 30 crew execute() implementations to identify which ones contribute `additiveCents` (the "cash-granting" crew).
2. Adding the `isCashGrant` flag to those crew files.
3. Updating `resolveCascade()` in `cascade.ts` to check for this flag + comp.
4. Passing `compPerkIds` into the cascade call (currently it probably doesn't receive this).

> **Recommendation:** Implement THE_VIG in a follow-up sub-task after the core Loading Dock floor ships. The comp is awarded only after defeating The Foreman — a player must clear all three Loading Dock markers to receive it. Shipping the floor without THE_VIG enforcement (deferred to a KI/follow-up) is safe; players can accumulate the perk ID in their `comp_perk_ids` array and the comp effect can be wired later without a DB migration.

> **Alternative:** A simpler initial implementation — identify the small subset of crew who unambiguously grant cash (e.g., The Bookkeeper, The Handicapper) and hard-code their IDs in a `CASH_GRANT_CREW_IDS` set in `cascade.ts`. Apply the 20% boost when the comp is active and the crew's ID is in the set. This avoids touching all 30 crew files. Flag in a TODO that the crew framework should formalize `isCashGrant` later.

---

## 7. New FloorTheme — The Loading Dock

Full `FLOOR_1_THEME` spec derived from `floor-aesthetics.md`:

```typescript
const FLOOR_1_THEME: FloorTheme = {
  // Felt — stained concrete / asphalt
  feltPrimary: '#1c1d21',
  feltRail:    '#0a0a0c',
  feltTexture: feltTextureUri('#1c1d21', '#0a0a0c', '#2d2f36'),

  // Accents — sodium-vapor orange
  accentBright:  '#ff9900',
  accentPrimary: '#b35900',
  accentDim:     '#4a2c11',

  // Borders — rust orange at 30% / 20%
  borderHigh: 'rgba(179,89,0,0.30)',
  borderLow:  'rgba(179,89,0,0.20)',

  // Breathing — night cold / streetlamp warm / police siren hot
  breatheCold: 'rgba(30,35,50,0.20)',
  breatheWarm: 'rgba(200,100,0,0.18)',
  breatheHot:  'rgba(220,20,40,0.22)',

  // Screen flash — streetlamp surge / alleyway shadow
  flashWin:  'rgba(255,153,0,0.35)',
  flashLose: 'rgba(20,25,35,0.50)',

  // Pub — The Milk Crate Circle
  pubName:         'THE MILK CRATE CIRCLE',
  pubBg:           'radial-gradient(ellipse at 50% 10%, #2a1500 0%, #110900 40%, #020202 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #7a3800 30%, #ff9900 50%, #7a3800 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 0%, rgba(200,200,220,0.05) 0%, transparent 70%)',
  pubTitleColor:   '#ff9900',
  pubTitleShadow:  '0 0 20px #b35900, 0 0 40px #4a2c11',
  pubSubtextColor: 'rgba(255,153,0,0.45)',

  // Boss — Freight Elevator (The Foreman)
  bossBg:          'radial-gradient(ellipse at 50% 40%, #1a1b20 0%, #0a0a0c 60%, #000000 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #78350f 30%, #eab308 50%, #78350f 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(234,179,8,0.08) 0%, transparent 65%)',
  bossTextColor:   '#eab308',
  bossTitleShadow: '0 0 30px rgba(234,179,8,0.50), 0 0 80px rgba(120,53,15,0.35)',
  bossBorderColor: 'rgba(133,77,14,0.50)',
  bossStarColor:   '#eab308',
  bossStarBg:      'rgba(120,53,15,0.40)',
  bossStarBorder:  '2px solid rgba(234,179,8,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(234,179,8,0.20)',
};
```

Existing themes rename: `FLOOR_1_THEME → FLOOR_2_THEME`, `FLOOR_2_THEME → FLOOR_3_THEME`, `FLOOR_3_THEME → FLOOR_4_THEME`.

`THEMES` array updates to:
```typescript
const THEMES: FloorTheme[] = [FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME, FLOOR_4_THEME];
```

`getFloorTheme` and `getFloorIndex` clamp updates:
```typescript
// getFloorTheme: Math.max(0, Math.min(3, Math.floor(markerIndex / 3)))
// getFloorIndex: Math.max(0, Math.min(3, Math.floor(markerIndex / 3)))
```

---

## 8. File-by-File Change Summary

### `packages/shared/src/floors.ts`
- Add `'exposed'` to `FloorAtmosphere` union
- Update `FloorAtmosphere` comment block
- Prepend Loading Dock `FloorConfig` as `id: 1`
- Shift VFW Hall → `id: 2`, Riverboat → `id: 3`, Strip → `id: 4`
- Update inline comment in `getFloorByMarkerIndex` example index mappings

### `packages/shared/src/config.ts`
- Add `'EXTORTION_FEE'` to `BossRuleType`
- Add `| { rule: 'EXTORTION_FEE'; taxPct: number }` to `BossRuleParams`
- Add `'THE_VIG'` to `CompRewardType`
- Add `THE_VIG: 4` to `COMP_PERK_IDS`
- Prepend 3 Loading Dock `MarkerConfig` entries to `GAUNTLET`
- Update `floor:` field on all existing entries (1→2, 2→3, 3→4)
- Update section comments

### `apps/web/src/lib/floorThemes.ts`
- Add new `FLOOR_1_THEME` const (Loading Dock, sodium orange / concrete)
- Rename: `FLOOR_1_THEME → FLOOR_2_THEME`, `FLOOR_2_THEME → FLOOR_3_THEME`, `FLOOR_3_THEME → FLOOR_4_THEME`
- Update `THEMES` array to 4 entries
- Update clamp in `getFloorTheme`: `Math.min(2, ...)` → `Math.min(3, ...)`
- Update clamp in `getFloorIndex`: `Math.min(2, ...)` → `Math.min(3, ...)`
- Update header comments

### `apps/api/src/bossRules/extortionFee.ts` *(new file)*
- Export `applyExtortionFee(payoutCents, stakeReturnedCents, taxPct)` function

### `apps/api/src/routes/rolls.ts`
- Add `EXTORTION_FEE` case: call `applyExtortionFee()` after `settleTurn()`, before bankroll write
- Add `THE_VIG` case: wire comp boost for cash-granting crew (or stub with TODO if deferred)

### `apps/web/src/components/BossRoomHeader.tsx`
- Add `EXTORTION_FEE` display branch: `"THE FOREMAN TAKES 20% OF ALL WINNING PAYOUTS"`

### DB migration
- Drizzle migration: `UPDATE runs SET current_marker_index = current_marker_index + 3 WHERE status = 'ACTIVE'`
- Drizzle migration: `UPDATE leaderboard_entries SET highest_marker_index = highest_marker_index + 3`

### `CLAUDE.md`
- Update gauntlet targets quick-reference (add Loading Dock row)
- Update bosses list (add The Foreman + EXTORTION_FEE)
- Update comps list (add THE_VIG)

---

## 9. Implementation Order

Recommended sequence to keep the build passing at each step:

1. **Shared package types first** — `config.ts` + `floors.ts` (type additions only, no GAUNTLET changes yet). Run `npm run typecheck` to confirm no breaks.
2. **GAUNTLET data** — Prepend Loading Dock markers, shift floor numbers on existing entries. Run `npm run build`.
3. **FloorThemes** — Add `FLOOR_1_THEME`, rename existing, update clamp. `npm run typecheck`.
4. **Boss rule file** — Create `extortionFee.ts`. Integrate into `rolls.ts`. `npm run build`.
5. **BossRoomHeader** — Add `EXTORTION_FEE` branch.
6. **DB migration** — Write and run Drizzle migration. Verify in Drizzle Studio.
7. **THE_VIG comp** — Either implement or stub with TODO (see §6 recommendation).
8. **CLAUDE.md update** — Update quick-reference.

> At step 4, verify `TurnResult` exposes `stakeReturnedCents`. If not, add it to `crapsEngine.ts` / `types.ts` as part of that step.

---

## 10. Open Questions / Decisions Needed

| # | Question | Recommendation |
|---|---|---|
| 1 | Should completed/game-over runs have their `currentMarkerIndex` migrated? | Migrate `leaderboard_entries.highest_marker_index` only; leave terminal runs as-is |
| 2 | Should THE_VIG be implemented in this ticket or deferred to a follow-up? | Defer — the comp can be earned and stored before enforcement exists |
| 3 | If THE_VIG is implemented now, which approach: `isCashGrant` flag on all crew, or hard-coded `CASH_GRANT_CREW_IDS` set? | Hard-coded set initially; audit and formalize later |
| 4 | What is the player's starting bankroll, and does it need to change for the Loading Dock's $5 table minimum? | Verify in `routes/runs.ts`; a starting bankroll of ~$25 feels right |
| 5 | Does `TurnResult` already expose `stakeReturnedCents` separately from `payoutCents`? | Verify in `crapsEngine.ts`; if not, add it as a field |
| 6 | Does any UI component switch on `FloorAtmosphere` in a way that would break on `'exposed'`? | Grep `atmosphere` in `apps/web/src/` before implementation |
