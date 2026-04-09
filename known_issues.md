# Battlecraps — Known Issues

Issues identified during design review and documentation audit. No code changes made — logged here for resolution during the implementation pass.

---

## KI-001 — Physics Prof fires during come-out with no guard

**Crew:** The Physics Prof (ID: 2)
**Severity:** Medium
**Source:** Code review during PRD audit

**Issue:**
The Physics Prof has no come-out guard. When paired dice appear during the come-out phase, it fires and defaults to shifting both dice up by one pip (since there is no active point to aim toward). This can convert a beneficial come-out result into a harmful one — most notably: `[5,5]=10` (POINT_SET) shifted to `[6,6]=12` (CRAPS_OUT).

**Expected behaviour:**
The PRD states "No effect during Come Out." The Prof should be a no-op when `activePoint === null`.

**Fix needed:**
Add an early return in `execute()` when `ctx.activePoint === null`.

**File:** `packages/shared/src/crew/physicsProfessor.ts`
