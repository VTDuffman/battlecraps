# Comprehensive Code Review: Battlecraps

**Reviewer**: Senior Tech Manager
**Date**: 2026-03-21
**Scope**: Full codebase — shared engine, API, web client

---

## Executive Summary

This is a well-architected game engine with clean TypeScript, strong separation of concerns, and thoughtful domain modeling. The monorepo structure, pure-function game engine, and integer-cent arithmetic show experienced engineering judgment. However, I've found **several significant bugs** — including three completely non-functional crew members — alongside race conditions and missing state synchronization that would affect gameplay in production.

---

## CRITICAL BUGS

### 1. Floor Walker, Mathlete, and Regular NEVER fire (3 dead crew members)

This is the most serious issue. All three TABLE crew members have activation guards that check for negative payout values, but the "deduct-on-placement" payout model **never produces negative values** — losses return 0 since the stake was already deducted at bet placement time.

**`packages/shared/src/crew/floorWalker.ts:30`**
```ts
if (ctx.rollResult !== 'SEVEN_OUT' || ctx.basePassLinePayout >= 0) {
    return { context: ctx, newCooldown: 0 }; // ALWAYS returns early
}
```
On SEVEN_OUT, `calcPassLinePayout` returns `0` (not negative). `0 >= 0` is `true`, so Floor Walker **never fires**.

**`packages/shared/src/crew/mathlete.ts:33`**
```ts
if (ctx.baseHardwaysPayout >= 0 || ctx.rollResult === 'SEVEN_OUT') {
    return { context: ctx, newCooldown: 0 }; // ALWAYS returns early
}
```
On a soft hardway loss, `calcHardwaysPayout` returns `0`. `0 >= 0` is `true`, so Mathlete **never fires**.

**`packages/shared/src/crew/regular.ts:36`**
```ts
if (ctx.rollResult !== 'POINT_HIT' || ctx.baseHardwaysPayout >= 0) {
    return { context: ctx, newCooldown: 0 }; // ALWAYS returns early
}
```
Same pattern — Regular **never fires**.

**Root cause**: These crew were written assuming a signed-payout model (losses = negative), but the engine uses a deduct-on-placement model (losses = 0). The activation guards need to detect losses through a different mechanism — e.g., checking whether a bet existed and the resolved bet cleared it, or checking the dice total against hardway numbers and `isHardway`.

---

### 2. Dice crew (Lefty, Physics Prof, Mechanic) don't update `baseStakeReturned` or `resolvedBets`

When these crew members re-roll or modify dice, they call `calculateBasePayouts()` which returns `stakeReturned` and `resolvedBets`, but they **only spread the profit fields** (`passLine`, `odds`, `hardways`) into the new context — ignoring the other two.

**`packages/shared/src/crew/lefty.ts:100-116`** — spreads `basePassLinePayout`, `baseOddsPayout`, `baseHardwaysPayout` but NOT `baseStakeReturned` or `resolvedBets`.

**Impact**: If Lefty converts a SEVEN_OUT into a POINT_HIT, `baseStakeReturned` stays at `0` (the SEVEN_OUT value) instead of reflecting the pass line + odds stakes being returned. The player wins the profit but **loses their original bet stakes**. At a $100 pass line + $300 odds bet, that's $400 silently vanishing per Lefty save.

Same bug exists in `packages/shared/src/crew/physicsProfessor.ts:70-79` and `packages/shared/src/crew/mechanic.ts:54-62`.

---

### 3. Per-shooter cooldown reset is never implemented

The code extensively documents that `per_shooter` cooldowns "MUST be reset to 0 when a new shooter begins" — but **nowhere in the codebase does this actually happen**. After Lefty or Floor Walker fire once, their `cooldownState` is set to `1` and persisted. On the next shooter, the state is loaded as-is. They are **permanently spent for the entire run**.

`computeNextState()` in `apps/api/src/routes/rolls.ts` doesn't touch crew cooldowns. `serialiseCrewSlots()` just copies the values through. There is no reset logic anywhere.

---

## SIGNIFICANT BUGS

### 4. GET /runs/:id doesn't return `bets`

**`apps/api/src/routes/bootstrap.ts:59-68`** — The endpoint returns bankroll, shooters, hype, phase, status, point, crewSlots, currentMarkerIndex, but **not the active bets**. On page refresh during POINT_ACTIVE phase, the client loses all knowledge of placed bets. The player sees an empty table, but the server still has their frozen pass line / odds / hardway bets. If they place new bets and roll, the server's `betDelta` calculation will be wrong because `sumBets(incomingBets) - sumBets(run.bets)` uses the real DB bets vs the client's zeroed-out bets.

### 5. No race condition protection on the roll endpoint

The schema comments explicitly mention that `updatedAt` enables "optimistic concurrency," but `rollHandler` never checks it. Two concurrent POST requests could:
1. Both read the same run state
2. Both compute payouts independently
3. Both write back, with the second overwriting the first's settlement

This would cause double payouts or phantom losses. The fix is straightforward — add a `WHERE updated_at = ?` condition to the update or use `SELECT ... FOR UPDATE`.

### 6. WebSocket events emitted before DB persistence

In `apps/api/src/routes/rolls.ts`, cascade trigger events are emitted at step 9 (line 272-275) but the DB write happens at step 12 (line 300-315). If the DB write fails, the client has already received cascade events for a roll that didn't actually persist. The client's state will permanently diverge from the server.

---

## MODERATE ISSUES

### 7. Duplicate `sql` import in schema.ts

`sql` is imported at line 31 (`import { relations, sql } from 'drizzle-orm'`) and again at line 329 (`import { sql } from 'drizzle-orm'`). This compiles but is confusing and suggests a copy-paste error.

### 8. `as never` type casts in App.tsx

Lines 174 and 199 cast `data.status as never` to satisfy TypeScript. This silences legitimate type checking and would hide any future type mismatches between the API response and the store's expected `RunStatus` type. Should use a proper type assertion or runtime validation.

### 9. Hype is NOT reset on recruit/pub transition

In `apps/api/src/routes/recruit.ts:112-123`, when returning to IDLE_TABLE after the pub, `hype` is **not explicitly set**. The `set()` call doesn't include `hype`, so whatever value was in the DB persists. This means hype accumulated before the marker clear carries over through the pub into the next segment. Depending on the game design intent, this could be a feature or a bug — but it's inconsistent with the SEVEN_OUT reset behavior and the PRD's "Hype resets" language.

### 10. Old Pro (crew #14) is a no-op with no server-side implementation

The Old Pro's ability (`+1 shooter on marker`) is documented as "no-op execute(); server checks during TRANSITION state." But `computeNextState` doesn't check for Old Pro, and the recruit endpoint doesn't either. The player pays $250 for a crew member that does absolutely nothing.

### 11. Floor Walker's `passLineProtected` flag causes incorrect shooter loss logic

In `apps/api/src/routes/rolls.ts:478`:
```ts
const shooterLost = !flags.sevenOutBlocked && !flags.passLineProtected;
```
If Floor Walker's `passLineProtected` is true, the shooter is NOT lost. But Floor Walker is supposed to only protect the pass line **bet** — the shooter should still die. This confuses two separate protections: Lefty blocks the seven-out entirely (saves the shooter), while Floor Walker just saves the bet (shooter still dies). The current code makes Floor Walker act like a second Lefty.

*(Note: Floor Walker never fires due to bug #1, so this is latent.)*

---

## DESIGN OBSERVATIONS (Not Bugs)

### 12. Crew member singletons share mutable `cooldownState`

The crew registry stores singleton objects (`lefty`, `whale`, etc.), and `hydrateCrewMember` uses `Object.create` + `Object.assign` to clone them. This works but is fragile — if anyone accidentally writes `lefty.cooldownState = 1` directly, it mutates the singleton and affects all future hydrations. A factory function pattern would be safer.

### 13. No input sanitization on WebSocket `subscribe:run`

`apps/api/src/server.ts:95-96` accepts any string as `runId` in the socket subscription. A malicious client could subscribe to any run room and receive another user's cascade events and settlement data (dice values, bankroll, crew state). The subscribe handler should verify ownership.

### 14. No minimum bet enforcement beyond pass line

The pass line requires a non-zero bet during come-out, but there's no minimum chip size enforced. A player could bet 1 cent and play indefinitely. This is likely fine for MVP but worth noting for game economy balance.

### 15. Bootstrap creates unbounded run records

Every "New Run" click creates a fresh run in the DB. There's no cleanup, no limit per user, and no garbage collection. Over time this will bloat the database.

---

## WHAT'S DONE WELL

- **Pure function game engine** — `crapsEngine.ts` has zero side effects, making it trivially testable and provably correct for the payout math.
- **Integer cent arithmetic** — Consistently avoids floating-point money bugs. The 4-decimal rounding on hype multipliers in `settleTurn` is a nice detail.
- **Immutable cascade pattern** — Each crew member returns a new context object. The delta-diffing for WebSocket events is clean.
- **Crypto-quality RNG** — Rejection sampling to avoid modulo bias is production-grade.
- **Exhaustive type system** — Discriminated unions for RollResult, GamePhase, RunStatus make illegal states unrepresentable.
- **Excellent inline documentation** — Every file header, every function, every design decision is thoroughly explained. This is some of the best-commented code I've seen.
- **Security model** — All game logic server-side, client never sees RNG or pre-settlement payouts.
- **Schema design** — JSONB for flexible nested structures, proper indexes, foreign keys with cascade delete.
- **Deduct-on-placement model** — Eliminates double-debit bugs; losses are implicit rather than explicit, which simplifies settlement.
- **Clean monorepo structure** — Shared types ensure API and client can't drift. Workspace setup is minimal and correct.

---

## PRIORITY RANKING

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | #1 — Three crew members never fire | 3 of 15 crew are dead; players pay $370 combined for nothing |
| **P0** | #2 — Dice crew don't update stakeReturned | Players silently lose hundreds of dollars per Lefty/Prof/Mechanic activation |
| **P0** | #3 — Per-shooter cooldowns never reset | Lefty/FloorWalker are one-use-per-run instead of one-use-per-shooter |
| **P1** | #4 — GET /runs/:id missing bets | Page refresh during point phase causes bet desync |
| **P1** | #5 — No race condition protection | Concurrent requests can cause double payouts |
| **P1** | #11 — Floor Walker prevents shooter loss | Fundamentally wrong game mechanic (latent behind bug #1) |
| **P2** | #6 — WS events before DB persist | Client state diverges on DB failure |
| **P2** | #10 — Old Pro is unimplemented | Player pays $250 for nothing |
| **P2** | #13 — No socket auth | Any client can eavesdrop on any run |
| **P3** | #7-9, #12, #14-15 | Code quality / design issues |
