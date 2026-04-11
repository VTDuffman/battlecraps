# BattleCraps — Feature Backlog

A running log of QoL improvements, bugs, and feature ideas surfaced during playtesting.
Each entry includes findings and a proposed solution so implementation can start immediately
when the item is picked up.

---

## FB-001 — Clamp bets to max instead of rejecting

**Type:** Quality of Life
**Area:** Betting / `useGameStore.ts`
**Status:** Implemented

### Problem

When a player places chips that would push a bet over the table maximum (or over the 3-4-5x
Odds cap), the chip click is silently ignored — a no-op. This is confusing: the player
clicked something and nothing happened.

**Example:** $30 table max. Player has $25 on the Pass Line. Clicks a $25 chip again.
Nothing happens. Expected: the bet tops out at $30.

### Affected caps

1. **Table max** — 10% of the current marker target (applies to Pass Line and each hardway).
2. **3-4-5x Odds cap** — maximum Odds bet relative to the active Pass Line bet and point number.

### Proposed solution

**Single-file change:** `apps/web/src/store/useGameStore.ts`, `placeBet()` action only.
No server changes, no UI component changes.

**Logic:**

1. Compute `effectiveAmount` based on the field:
   - **Non-odds fields:** `room = maxBet - currentBet`. If `room <= 0` → no-op (already
     at cap). Otherwise `effectiveAmount = Math.min(chipAmount, room)`.
   - **Odds field:** `cappedTotal = validateOddsBet(passLine, proposed, point)`.
     `room = cappedTotal - bets.odds`. If `room <= 0` → no-op. Otherwise
     `effectiveAmount = room`.

2. **Bankroll check** moves to after `effectiveAmount` is computed, comparing
   `state.bankroll >= effectiveAmount`. This allows the clamped amount to go through
   even if the full chip denomination exceeds the bankroll.

3. Final `return` uses `effectiveAmount` throughout (`bankroll - effectiveAmount`,
   `bets + effectiveAmount`, `lastBetDelta = -effectiveAmount`).

**Behavior table:**

| Scenario | Before | After |
|---|---|---|
| $30 table max, bet $25 → click $25 chip again | 2nd click: no-op | 2nd click: places $5, bet = $30 |
| Odds max $60, current odds $50, click $25 chip | Rejected | Places $10, odds = $60 |
| Already at table max, click any chip | No-op | No-op (room = 0) |
| Can't afford effective amount | No-op | No-op |

**What stays the same:**
- Server validates independently — no risk of illegal bets reaching the engine
- `removeBet`, `BettingGrid`, `DiceZone` are unchanged
- Boss min-bet soft guard is unchanged (informational log only)
- Odds `point === null` guard is unchanged

---

## FB-002 — Round all payouts up to the nearest dollar

**Type:** Quality of Life
**Area:** Payout engine / `packages/shared/src/crapsEngine.ts`
**Status:** Implemented

### Problem

Bet payouts can produce fractional dollar amounts (e.g. $37.50, $67.50) that accumulate
as cents in the bankroll. Since chips are in whole-dollar denominations, cents can never
be bet and just sit as dead weight.

### Root causes

Two places in the engine produce sub-dollar payout amounts:

1. **Odds true-odds math** (`calcOddsPayout`): fractional ratios (3:2, 6:5) applied to
   whole-dollar bets can produce 50¢ remainders. E.g. $25 bet at 3:2 → $37.50.

2. **Hype multiplier** (`settleTurn`): `Math.floor(boostedProfit × finalMultiplier)`
   floors to the nearest cent, not dollar. E.g. $50 profit × 1.35× hype → $67.50.

`baseStakeReturned` (the original bet returned on a win) is always whole dollars — stakes
are placed in chip denominations ($1/$5/$10/$25/$50) — so only the *profit* component
needs fixing.

### Proposed solution

**One-line change in `packages/shared/src/crapsEngine.ts`, inside `settleTurn()`:**

```typescript
// Before:
const amplifiedProfit = Math.floor(boostedProfit * finalMultiplier);

// After:
const amplifiedProfit = Math.ceil((boostedProfit * finalMultiplier) / 100) * 100;
```

`Math.ceil(x / 100) * 100` rounds up to the nearest 100 cents = nearest dollar. The
player always gets the better side of any fractional amount.

**Scope: 1 line in 1 file.**

| File | Change |
|---|---|
| `packages/shared/src/crapsEngine.ts` | `Math.floor` → `Math.ceil(x/100)*100` in `settleTurn()` |

**What stays the same:**
- `calcOddsPayout` — its `Math.floor` still guards against fractional cents internally;
  the final dollar-rounding in `settleTurn` absorbs any remainder.
- `rolls.ts`, all crew files, the store, all UI components — no changes needed.
- Floating `+$X.XX` payout pops in the UI are computed separately and remain unchanged
  (display-only, do not affect bankroll).

---

## FB-003 — Fix layout shift when Roll button text changes

**Type:** Bug / Quality of Life
**Area:** Dice animation / `apps/web/src/components/DiceZone.tsx`
**Status:** Implemented

### Problem

The Roll button text toggles between `"ROLL"` and `"ROLLING…"` during a roll. Because
the button is `flex-none` (no flex grow/shrink) but has no fixed width, it resizes to fit
its text content. This causes a visible layout shift:

1. Roll starts → button expands to fit `"ROLLING…"` → dice column (`flex-1`) shrinks →
   dice jump left.
2. Roll resolves → button snaps back to `"ROLL"` width → dice jump right.

`transition-all duration-150` on the button does not smooth this because the width change
is content-driven, not a CSS property transition.

### Proposed solution

Add a fixed width `w-28` (112px) to the button. One class, one element, no logic changes.

```diff
- 'flex-none px-6 py-4 rounded',
+ 'flex-none w-28 px-6 py-4 rounded',
```

`w-28` = 112px comfortably fits `"ROLLING…"` at `font-pixel text-[10px]` with `px-6`
padding, and `"ROLL"` centers naturally within the fixed box.

**Scope: 1 class on 1 element in `DiceZone.tsx`. No other files touched.**

---

## FB-004 — Crew portrait animations spoil roll result before dice land

**Type:** Bug / Quality of Life
**Area:** Cascade animation timing / `apps/web/src/store/useGameStore.ts`
**Status:** Implemented

### Problem

Crew portrait glow animations (e.g. Hype Train Holly flashing during a Point Hit) fire
during the dice tumbling phase — before the dice have landed and the result popup has
appeared. This spoils the outcome, because seeing Holly's portrait light up tells the
player a Point Hit is coming before the dice have visually resolved.

### Root cause

The server emits events in this order after every roll:
1. One `cascade:trigger` per crew member that fired
2. One `turn:settled` (dice result + deferred state)

`turn:settled` is correctly gated — it sits in `pendingSettlement` and is only applied
after the result popup fades (2 seconds post-landing). But `cascade:trigger` has no
equivalent gate. Events are pushed directly into the live `cascadeQueue` the instant
they arrive, and portrait animations begin consuming the queue immediately — during the
throw/tumble phase, long before the result is revealed.

### Proposed solution

Mirror the existing `pendingSettlement` pattern for cascade events. One file, three
small changes to `useGameStore.ts`:

1. Add `pendingCascadeQueue: QueuedCascadeEvent[]` to state (initial value `[]`,
   cleared in `disconnect()`).
2. In the `cascade:trigger` socket handler: push to `pendingCascadeQueue` instead
   of `cascadeQueue`.
3. In `applyPendingSettlement()`: splice `pendingCascadeQueue` into `cascadeQueue`
   and reset `pendingCascadeQueue` to `[]`.

**Result timeline:**

| Before | After |
|---|---|
| Holly glows during dice tumble phase | Dice land → result popup appears (2s) → popup fades → Holly glows |

Portrait animations now play as the result is being revealed, not before it.

**Scope: `useGameStore.ts` only. No changes to `CrewPortrait`, `TableBoard`,
`DiceZone`, or any other file.**

---

## FB-005 — Show winning animations before Marker Cleared modal appears

**Type:** Quality of Life
**Area:** Screen routing / `apps/web/src/App.tsx`
**Status:** Implemented

### Problem

When a roll clears a marker, `applyPendingSettlement()` updates all state at once —
bankroll, payout pops, win flash, and `status: 'TRANSITION'`. React re-renders
immediately and `App.tsx` replaces `TableBoard` with `MarkerCelebration` in the same
frame. The payout pop animations, bankroll delta flash, and gold win screen flash are
all set but never rendered — `TableBoard` is already gone. The transition feels abrupt
and the player misses their winning moment.

### Root cause

`App.tsx` routes to `MarkerCelebration` the instant `status === 'TRANSITION'` with no
delay. All the celebration animations live inside `TableBoard` components
(`BettingGrid`, `DiceZone`) which are unmounted at that exact moment.

### Proposed solution

Add a `markerCelebrationReady` gate to `App.tsx` — the same pattern already used by
`pubReady`. When status becomes `TRANSITION`, start a 2-second timer. Until it fires,
keep rendering `<TableBoard />`. Once it fires, hand off to the normal
`MarkerCelebration` / `BossVictoryModal` routing.

**Changes to `App.tsx` only (~5 lines added):**

1. New state + timer wired into the existing `prevStatus` useEffect:

```typescript
const [markerCelebrationReady, setMarkerCelebrationReady] = useState(false);

// Inside the existing prevStatus useEffect:
if (prevStatus.current !== 'TRANSITION' && runStatus === 'TRANSITION') {
  setPubReady(false);
  setMarkerCelebrationReady(false);
  const t = setTimeout(() => setMarkerCelebrationReady(true), 2000);
  return () => clearTimeout(t);
}
```

2. One new branch at the top of the render chain:

```diff
  {runStatus === 'GAME_OVER'
    ? <GameOverScreen ... />
+   : runStatus === 'TRANSITION' && !markerCelebrationReady
+     ? <TableBoard />
    : runStatus === 'TRANSITION' && !pubReady && bossVictoryConfig
      ? <BossVictoryModal ... />
    ...
  }
```

**Result timeline:**

| Phase | What the player sees | Duration |
|---|---|---|
| Dice land | "POINT HIT!" result popup | 2s |
| Popup fades | Bankroll jumps, payout pops float up, gold win flash | ~0.2s |
| Soak window | `TableBoard` stays visible — player soaks in the win | 2s |
| Modal appears | `MarkerCelebration` or `BossVictoryModal` | player-gated |

Covers both normal marker clears and boss victories — both go through TRANSITION and
benefit from the soak window automatically.

**Scope: `App.tsx` only. No store changes, no component changes.**

---

## FB-006 — Session Management & Authentication

**Type:** Infrastructure / Security
**Area:** Auth / `apps/api/src/` + `apps/web/src/App.tsx`
**Status:** Planned

### Problem

The current identity system is a dev-only stub, not production auth. Every player is
identified by a UUID stored in `localStorage` and sent as a raw `x-user-id` header —
no cryptographic verification occurs. A single shared user (`dev@battlecraps.local`)
serves all players via the `/api/v1/dev/bootstrap` endpoint.

**Consequences:**
- No persistent identity: clearing localStorage = new identity, lost run
- No cross-device continuity: a player can't resume their run on another device
- No security: any UUID in the header is accepted; the bootstrap endpoint is public
  and allows unlimited run creation
- All players share the same DB user record (single `dev@battlecraps.local`)

### Current Implementation (to be replaced)

- `apps/web/src/App.tsx`: On load, checks `localStorage` for `bc_dev_user_id` /
  `bc_dev_run_id`. If absent, calls `POST /api/v1/dev/bootstrap` to create both.
- `apps/api/src/routes/bootstrap.ts`: Creates/upserts `dev@battlecraps.local`, creates
  a new run, returns `{ userId, runId }`.
- All API routes: Extract `x-user-id` header, load the run, verify `run.userId ===
  header userId` (ownership check is correct — just not cryptographically sound).
- Socket.IO: `userId` passed in `socket.handshake.auth`, validated in middleware.

### Proposed Solution

Use an auth service (recommended: **Clerk** or **Supabase Auth**) to handle OAuth
flows, token issuance, and session management rather than rolling custom auth.

**Auth flow (Google OAuth via Clerk/Supabase):**
1. User clicks "Sign in with Google" on the frontend
2. Redirected to Google consent screen
3. Google redirects back; auth service exchanges code for tokens server-side
4. Auth service creates/upserts a unique user record per Google account
5. Server issues a short-lived JWT (15 min) + long-lived refresh token in an
   `httpOnly; Secure; SameSite=Strict` cookie
6. All game API routes verify the JWT via `@fastify/jwt` middleware
7. `req.user.id` replaces the `x-user-id` header throughout

**Token storage:**
- Access token: in-memory JS variable (XSS-safe, lost on refresh → re-issue via cookie)
- Refresh token: `httpOnly; Secure; SameSite=Strict` cookie (JS-inaccessible)
- `localStorage` retains only `bc_dev_run_id` for run recovery on page refresh

### Files Affected

| File | Change |
|---|---|
| `apps/api/src/routes/bootstrap.ts` | Remove `POST /dev/bootstrap` entirely; keep `GET /runs/:id` |
| `apps/api/src/server.ts` | Add `@fastify/jwt` middleware; add auth routes (callback, refresh, logout) |
| `apps/api/src/routes/rolls.ts` | Replace `x-user-id` header extraction with `req.user.id` from JWT |
| `apps/api/src/routes/recruit.ts` | Same JWT swap |
| `apps/api/src/routes/mechanic.ts` | Same JWT swap |
| `apps/api/src/routes/crew.ts` | Same JWT swap |
| `apps/api/src/db/schema.ts` | Add `googleId` (and/or `githubId`) columns to `users` table |
| `apps/web/src/App.tsx` | Replace bootstrap flow with auth check; redirect unauthenticated users to login |
| `apps/web/src/store/useGameStore.ts` | Remove `x-user-id` header from fetch calls; pass JWT Bearer token |

### What Stays the Same

- All `run.userId === req.user.id` ownership checks — logic is correct, just the
  identity source changes
- Optimistic locking (`updatedAt` WHERE clause) — unchanged
- WebSocket room-based ownership validation — unchanged (userId comes from JWT instead)
- `users` table schema columns (bankroll, unlocks, etc.) — add OAuth columns, keep rest

### Open Decisions

1. **Auth service vs. self-hosted**: Clerk or Supabase Auth recommended over
   `@fastify/passport` — reduces maintenance surface and handles edge cases
2. **OAuth providers**: Google OAuth as primary; GitHub and/or Discord as secondary
3. **Guest play**: Allow anonymous runs that can be claimed after sign-in, or require
   sign-in before starting? (UX tradeoff)
4. **Existing dev data**: Migration path for any beta-tester data tied to dev@battlecraps.local

---

*More entries to follow during playtesting.*
