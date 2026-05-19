---
name: session-state
description: Tracks the highest KI number assigned, recurring defect hotspots, and active testing focus areas across QA sessions
metadata:
  type: project
---

## Highest KI number assigned: KI-062

Last assigned: KI-062 — Final-marker SEVEN_OUT and auto-clear wins misclassified as losses in leaderboard (2026-05-18)

**Why:** Issue numbering must be strictly sequential across conversations to avoid gaps or collisions in the known-issues log.

**How to apply:** Always read the existing known-issues.md to verify before writing a new entry; increment from the confirmed highest number.

---

## Defect Hotspots

- `apps/web/src/components/CompCard.tsx` — `COMP_DEFS` array; twice failed to be extended after gauntlet expansion (KI-045, KI-056)
- `apps/web/src/lib/floorThemes.ts` — floor theme tokens (KI-055: Floor 9/8 palette collision)
- `apps/api/src/routes/rolls.ts` — main roll handler; boss hook enforcement, comp enforcement, win-condition logic (KI-051, KI-054, KI-052, KI-049, KI-043, KI-062)
- `apps/web/src/store/useGameStore.ts` — Zustand store; animation sequencing, flash/audio state (KI-004, KI-008, KI-025)
- `packages/shared/src/cascade.ts` — crew cascade; ability firing order and delta propagation (KI-028, KI-032)

---

## Recurring Issue Categories

- `COMP_DEFS` not extended after gauntlet expansion — recurred at KI-045 (4-floor) and KI-056 (9-floor); high likelihood of future recurrence after any floor addition
- Comp perks defined/displayed but not mechanically enforced (KI-051, KI-054)
- Floor-specific content missing or stale after FB-015 9-floor expansion (KI-038, KI-048, KI-050, KI-055, KI-056, KI-057, KI-060, KI-061)
- Static game constants not updated to reflect gauntlet scale — chip denominations (KI-057) follow same pattern as COMP_DEFS omissions
- Mobile layout / viewport clipping (KI-010, KI-011, KI-013, KI-031)
- Visual feedback missing on win events (KI-019, KI-021)
- Animation timing / sequencing issues (KI-004, KI-008, KI-027, KI-032)
- Boss mechanic client-side input state mismatch — server rejects submission correctly but client locks input entirely (KI-058)
- Boss-context layout collisions — HUD elements positioned without accounting for the dynamic presence of BossRoomHeader (KI-059)
- Process/documentation gaps enabling silent floor-scoped regressions — KI-061 is the canonical reference; a floor-addition checklist was embedded in the KI entry and should be extracted to docs/frameworks/
- **Data integrity / leaderboard classification** — win-path asymmetry in rolls.ts can silently misclassify legitimate run completions; requires both a code fix and a DB migration for historical rows (KI-062)

---

## Active Testing Focus (2026-05-18)

Root cause analysis of leaderboard misclassification — SEVEN_OUT and auto-clear win paths on the final marker.

---

## Floor-Addition Checklist (canonical list as of KI-061)

Files that must be updated when a new floor is added (see KI-061 for full table):
1. `packages/shared/src/config.ts` — GAUNTLET entry
2. `packages/shared/src/floors.ts` — FLOORS registry entry
3. `apps/web/src/lib/floorThemes.ts` — theme token object
4. `apps/web/src/components/FloorEmblem.tsx` — FLOOR_CONFIGS entry
5. `apps/web/src/components/CompCard.tsx` — COMP_DEFS entry
6. `apps/web/src/components/GameOverScreen.tsx` — getToneTagline() + FLOOR_PIP_THEMES
7. `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx` — FLOOR_NAMES + floors map
8. `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx` — boss card list
9. `apps/web/src/components/BettingGrid.tsx` — chip denomination verification
10. `apps/web/src/components/CompCardFan.tsx` — boss-bar offset verification
