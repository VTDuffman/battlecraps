# Battlecraps — Known Issues

Issues identified during design review and documentation audit. No code changes made — logged here for resolution during the implementation pass.

---

## KI-001 — Physics Prof fires during come-out with no guard

**Crew:** The Physics Prof (ID: 2)
**Severity:** Medium
**Status:** Fixed
**Source:** Code review during PRD audit

**Issue:**
The Physics Prof had no come-out guard. When paired dice appeared during the come-out phase, it fired and defaulted to shifting both dice up by one pip (since there is no active point to aim toward). This could convert a beneficial come-out result into a harmful one — most notably: `[5,5]=10` (POINT_SET) shifted to `[6,6]=12` (CRAPS_OUT).

**Fix applied:**
Added early return at the top of `execute()` when `ctx.activePoint === null`. Also removed the now-dead ternary that was deriving `phase` from `activePoint`.

**File:** `packages/shared/src/crew/physicsProfessor.ts`
