# Floor Addition Checklist

Use this checklist any time a new floor is added to the gauntlet. Every item below is a floor-scoped site that was silently broken when FB-015 expanded the game from 4 to 9 floors — discovered only through manual QA (KI-055 through KI-061). Work top-to-bottom; each step unlocks or informs the next.

---

## 1 — Shared engine (packages/shared)

| File | What to add / update |
|---|---|
| `packages/shared/src/config.ts` | Add `GAUNTLET` entry: marker targets × 3, boss rule, comp reward |
| `packages/shared/src/floors.ts` | Add `FLOORS` registry entry (name, tagline, introLines, bossName, bossTitle, bossVenue, bossTeaser, atmosphere) |
| `packages/shared/src/floors.ts` | Extend `FloorId` union: `… \| N` (the next integer). **This is the compile-time sentinel** — tsc will immediately fail at every `Record<FloorId, …>` site that is not updated, surfacing all omissions as build errors rather than silent runtime gaps. |
| `packages/shared/src/floors.ts` | Add the new `FloorAtmosphere` variant to the union if the floor introduces a new aesthetic (else reuse an existing one) |

## 2 — Visual / theme layer (apps/web)

| File | What to add / update |
|---|---|
| `apps/web/src/lib/floorThemes.ts` | Add theme token object for the new `FloorAtmosphere` (accent, glow, particle colors, CSS class names). One entry per atmosphere value — reuse the object if reusing an existing atmosphere. |
| `apps/web/src/components/FloorEmblem.tsx` | Add entry to `FLOOR_CONFIGS: Record<FloorId, FloorConfig>`. tsc enforces this — it will error here after you extend `FloorId`. Fields: roman numeral, displayName, fontFamily, decorTop/Bottom, color. |

## 3 — Comp system (apps/web)

| File | What to add / update |
|---|---|
| `apps/web/src/components/CompCard.tsx` | Add entry to `COMP_DEFS` for the comp awarded at the new floor's boss. Fields: perkId, threshold (= bossMarkerIndex + 1), name, icon, effect, accentColor. Floor 9 boss awards `'NONE'` — no entry needed. |
| `apps/web/src/components/CompCardFan.tsx` | Verify the boss-bar offset logic accounts for the new floor's boss rule variant. Multi-line boss bars (e.g. TIDAL_SURGE) can push comp cards out of the viewport — check at 390px wide. |

## 4 — Game-over screen (apps/web)

| File | What to add / update |
|---|---|
| `apps/web/src/components/GameOverScreen.tsx` | `getToneTagline()` — extend the floor-range branches to cover the new floor number. `FLOOR_PIP_THEMES` is derived dynamically from `getFloorTheme` and does not need manual updating. |

## 5 — Tutorial copy (apps/web)

| File | What to add / update |
|---|---|
| `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx` | Extend the `FLOOR_NAMES` array and the floors-map table to include the new floor name and marker targets |
| `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx` | Extend the boss card list to include the new boss name, title, and mechanic description |

## 6 — Chip denominations (apps/web)

| File | What to check |
|---|---|
| `apps/web/src/components/BettingGrid.tsx` | Verify chip denomination constants remain appropriate for the new floor's marker target range. Chip values are currently static and do not auto-scale — confirm the highest chip is reachable given the new max bet. |

## 7 — Verify

```bash
npm run build          # must pass with no tsc errors
npm run typecheck      # double-check across all workspaces
```

Then do a manual playtest pass:
- Navigate to the new floor in a test run
- Confirm floor watermark renders (FloorEmblem)
- Confirm comp card appears after defeating the boss (CompCard / CompCardFan)
- Confirm game-over screen shows correct tagline and floor pip (GameOverScreen)
- Confirm tutorial copy reflects the new floor count and boss (HowToPlayScreen)
- Confirm chip denominations are usable at the new marker target range

---

## Background

This checklist was created to address KI-061, which documented a pattern of silent breakage when FB-015 added five floors without a canonical update guide. The TypeScript `FloorId` union in `floors.ts` combined with `Record<FloorId, …>` usage in `FloorEmblem.tsx` is the compile-time anchor — widening `FloorId` will immediately surface every lookup site that needs updating, making omissions a build failure rather than a QA discovery.
