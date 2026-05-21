---
name: session-state
description: Tracks the highest KI number assigned, recurring defect hotspots, and active testing focus areas across QA sessions
metadata:
  type: project
---

## Highest KI number assigned: KI-072

Last assigned: KI-072 — Comp perks from a prior run persist into new runs, causing cross-run comp bleed (2026-05-19)

**Why:** Issue numbering must be strictly sequential across conversations to avoid gaps or collisions in the known-issues log.

**How to apply:** Always read the existing known-issues.md to verify before writing a new entry; increment from the confirmed highest number.

---

## Defect Hotspots

- `apps/web/src/components/CompCard.tsx` — `COMP_DEFS` array; twice failed to be extended after gauntlet expansion (KI-045, KI-056); tooltip hover-only behavior logged (KI-064)
- `apps/web/src/lib/floorThemes.ts` — floor theme tokens (KI-055: Floor 9/8 palette collision; KI-067: dark-accent floors render unreadable text; KI-071: Floor 9 pub greyscale spoils reveal)
- `apps/api/src/routes/rolls.ts` — main roll handler; boss hook enforcement, comp enforcement, win-condition logic (KI-051, KI-054, KI-052, KI-049, KI-043, KI-062, KI-063, KI-069)
- `apps/api/src/routes/recruit.ts` — comp perk ID persistence; EXTRA_SHOOTER gate silently swallowed all other comp types (KI-063); shooter bonus display possibly wrong (KI-069); comp write targets wrong table — user row instead of run row (KI-072)
- `apps/web/src/store/useGameStore.ts` — Zustand store; animation sequencing, flash/audio state, unlock event queuing (KI-004, KI-008, KI-025, KI-066)
- `packages/shared/src/cascade.ts` — crew cascade; ability firing order and delta propagation (KI-028, KI-032, KI-068)
- `apps/web/src/components/BossRoomHeader.tsx` — boss UI display; TIDAL_SURGE pip counter still shows old counter model (KI-070)
- `apps/web/src/transitions/phases/FloorRevealPhase.tsx` and `FloorRevealConfirmPhase.tsx` — text dimness on dark-accent floors (KI-067)
- `apps/web/src/components/PubScreen.tsx` — theme derivation; Floor 9 greyscale bleeds into mid-floor pubs (KI-071)

---

## Recurring Issue Categories

- `COMP_DEFS` not extended after gauntlet expansion — recurred at KI-045 (4-floor) and KI-056 (9-floor); high likelihood of future recurrence after any floor addition
- Comp perks defined/displayed but not mechanically enforced (KI-051, KI-054, KI-063, KI-069) — **critical pattern**: KI-063 reveals the enforcement fixes in KI-051 and KI-054 were always blocked by a deeper persistence gap; verify the full comp pipeline (write → read → enforce) end-to-end when logging any future comp issue
- Floor-specific content missing or stale after FB-015 9-floor expansion (KI-038, KI-048, KI-050, KI-055, KI-056, KI-057, KI-060, KI-061)
- Static game constants not updated to reflect gauntlet scale — chip denominations (KI-057) follow same pattern as COMP_DEFS omissions
- Mobile layout / viewport clipping (KI-010, KI-011, KI-013, KI-031)
- Visual feedback missing on win events (KI-019, KI-021)
- Animation timing / sequencing issues (KI-004, KI-008, KI-027, KI-032, KI-066)
- Boss mechanic client-side input state mismatch — server rejects submission correctly but client locks input entirely (KI-058)
- Boss-context layout collisions — HUD elements positioned without accounting for the dynamic presence of BossRoomHeader (KI-059)
- Process/documentation gaps enabling silent floor-scoped regressions — KI-061 is the canonical reference; a floor-addition checklist was embedded in the KI entry and should be extracted to docs/frameworks/
- **Data integrity / leaderboard classification** — win-path asymmetry in rolls.ts can silently misclassify legitimate run completions; requires both a code fix and a DB migration for historical rows (KI-062)
- **Meta-progression persistence gap** — feature branch (KI-051) fixed enforcement of a perk that was never being persisted; root cause (KI-063) found later during playtesting; KI-072 reveals a third layer: comp perk IDs written to the wrong DB table (user row vs. run row), causing cross-run bleed. Pattern: comp-system bugs can exist at the DB write layer, the enforcement read layer, or the table-scoping layer — verify all three before closing any comp-related issue.
- **Floor-theme aesthetic bleed** — Floor 9 greyscale theme leaks into mid-floor pubs (KI-071) and dark-accent floors render unreadable text on intro screens (KI-067); theme token opacity-suffix approach breaks on dark floors.
- **Boss mechanic redesign not implemented** — KI-058 committed to TIDAL_SURGE binary redesign but code was never updated; KI-070 tracks this follow-up (KI-070).
- **UX feature gaps logged as known issues** — manual marker-check button (KI-065) and comp tooltip always-visible (KI-064) are UX enhancement requests tracked as Low severity open issues.

---

## Active Testing Focus (2026-05-19)

Full playtest session: comp mechanics post-KI-063 fix, crew behavior (Mimic), TIDAL_SURGE display, floor aesthetics (Floor 5+ text readability, Floor 9 pub theme), unlock sequencing, and UX gaps (comp tooltips, marker-check affordance).

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
