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
**Status:** Implemented

### Summary

Replaced the dev-only UUID stub with production Clerk auth (Google OAuth). Validated end-to-end in production on 2026-04-11.

### What Was Built

**Auth provider:** Clerk (`@clerk/react@6.x` frontend, `@clerk/backend@3.x` API)

**Frontend (`apps/web/`):**
- `ClerkProvider` wraps the app; `useAuth` / `useUser` replace all `localStorage` identity logic
- `SignIn` / `SignUp` Clerk-hosted UI components handle the Google OAuth flow
- Clerk JWT attached as `Authorization: Bearer <token>` header on all API calls and in the Socket.IO handshake `auth` payload

**Backend (`apps/api/src/`):**
- `lib/clerkAuth.ts` — `requireClerkAuth` Fastify preHandler: verifies Clerk JWT via `verifyToken()`, attaches `req.clerkId`
- `routes/auth.ts` — `POST /api/v1/auth/provision`: upserts user record on first sign-in; handles legacy email re-association (users created before Clerk with `clerk_id = 'legacy:<uuid>'`)
- `server.ts` — Socket.IO middleware verifies Clerk JWT in handshake, resolves to internal `userId` via `resolveUserByClerkId()`
- All game routes (`rolls`, `recruit`, `mechanic`, `crew`) use `requireClerkAuth`; `req.clerkId` → `resolveUserByClerkId()` replaces `x-user-id` header

**DB migrations (run on boot in `server.ts`):**
- `clerk_id` column added to `users` (NOT NULL, unique constraint `users_clerk_id_unique`)
- `password_hash` made nullable (Clerk users have no password)
- Legacy users back-filled: `clerk_id = 'legacy:' || id::text`
- `max_bankroll_cents` column ensured

**Infrastructure:**
- `render.yaml`: `healthCheckPath: /health` added to prevent Render redeploy loop; `CLERK_SECRET_KEY` env var documented

### Key Implementation Details

- `clerkId` is always read from the verified JWT payload — never from the request body
- `.onConflictDoNothing({ target: users.clerkId })` scopes conflict suppression to the clerk_id constraint only; email conflicts surface as real errors
- Legacy email re-association: if a real Clerk user provisions with an email that matches a legacy record, the existing row's `clerk_id` is updated in-place rather than inserting a duplicate

---

---

## FB-007 — Tutorial & "How to Play" System

**Type:** Feature
**Area:** Onboarding / `apps/web/src/`
**Status:** Design complete — pending technical design and implementation

### Problem

Playtesters without craps experience are hitting Floor 1 cold with no mental model of the rules. Confusion about pass line, points, and seven-outs prevents engagement with the BattleCraps-specific systems (hype, crew, markers, bosses).

### Design

Full UX/design spec: `docs/requirements/tutorial-user-journey.md`

**Summary:**

- Tutorial auto-launches on every player's **first run**, before the Title cinematic
- Always **skippable** via a persistent "Skip Tutorial →" button
- **"How to Play"** button on the main menu lets any player replay any section at any time
- Adaptive **knowledge gate** up front: "You ever shot dice before?" branches to full tutorial (11 beats) or BattleCraps-only (4 beats)
- Guide character **"Sal the Fixer"** — in-world NPC portrait, gritty cinematic voice, appears only during tutorial
- Each beat uses a **spotlight/dim** mechanic: table dims, relevant zone glows, player takes one real action to advance
- Tutorial flows seamlessly into the actual run — no menu return

**Tutorial paths:**

| Path | Beats | Audience |
|---|---|---|
| Full (Path A → B) | 11 beats | Craps novice |
| BattleCraps only (Path B) | 4 beats | Knows craps, new to BattleCraps |

**Main Menu "How to Play" sections:**
- Craps Basics — static reference cards
- BattleCraps Rules — marker, hype, gauntlet targets
- Crew & Bosses — card gallery; bosses blurred until encountered

### Notes for technical design

- Tutorial state (completed, path taken) needs to persist per user — likely a column on the `users` table or a flag in the run bootstrap response
- The spotlight/dim mechanic will need a rendering layer above `TableBoard` — consider how this interacts with `TransitionOrchestrator`
- Simulated rolls in the tutorial (Beats 1, 5, 6) should be scripted/deterministic, not live RNG
- "How to Play" is a pure client-side static reference — no API involvement

---

*More entries to follow during playtesting.*

---

## FB-010 — Boss Mechanic Framework

**Type:** Feature / Architecture
**Area:** `packages/shared/src/config.ts`, `packages/shared/src/bossRules/`, `packages/shared/src/types.ts`, `packages/shared/src/cascade.ts`, `apps/api/src/routes/rolls.ts`, `apps/web/src/transitions/phases/Boss*.tsx`, `apps/web/src/components/BossRoomHeader.tsx`
**Status:** Implemented
**Technical design:** `docs/design/boss-mechanic-technical-design.md`
**Reference:** `docs/frameworks/boss_framework.md`

### What was built

1. **Extended `BossConfig`** — 18 fields covering identity, vibe copy (dreadTagline, entryLines, ruleBlurb, victoryQuote, defeatAnnouncement), mechanic params, and comp data. Replaces the old `risingMinBets?` accessor with a `BossRuleParams` discriminated union.

2. **Boss rule hook architecture** — `packages/shared/src/bossRules/` directory mirroring the crew `execute()` pattern. Three hooks: `validateBet`, `modifyOutcome`, `modifyCascadeOrder`. One file per rule type. New boss rule = new file + one new union variant.

3. **Full boss data** — All vibe copy, rule params, and comp descriptions filled in for Sarge, Mme. Le Prix, and The Executive directly in `GAUNTLET[]`.

4. **Enforcement** — `DISABLE_CREW` suppresses the cascade entirely via `modifyCascadeOrder → []`. `FOURS_INSTANT_LOSS` sets `ctx.flags.instantLoss = true` → immediate GAME_OVER before cascade fires. `RISING_MIN_BETS` refactored from inline `rolls.ts` block to `validateBet` hook.

5. **UI components read from config** — All five boss UI components (`BossEntryDreadPhase`, `BossEntryPhase`/`BossEntryModal`, `BossVictoryPhase`, `BossVictoryCompPhase`, `BossRoomHeader`) read exclusively from `BossConfig` — no hardcoded boss strings remain.

6. **Reference document** — `docs/frameworks/boss_framework.md` covering all fields, hook interface, boss profiles, comp reference, and a "how to add a new boss" checklist.

### Files

| File | Action |
|---|---|
| `docs/frameworks/boss_framework.md` | Create |
| `packages/shared/src/config.ts` | Extend BossConfig + BossRuleParams + fill boss data |
| `packages/shared/src/bossRules/types.ts` | Create |
| `packages/shared/src/bossRules/risingMinBets.ts` | Create (refactor from inline) |
| `packages/shared/src/bossRules/disableCrew.ts` | Create (new enforcement) |
| `packages/shared/src/bossRules/foursInstantLoss.ts` | Create (new enforcement) |
| `packages/shared/src/bossRules/index.ts` | Create (registry) |
| `packages/shared/src/types.ts` | Add `instantLoss` to `TurnContextFlags` |
| `packages/shared/src/cascade.ts` | Add `modifyCascadeOrder` hook point |
| `apps/api/src/routes/rolls.ts` | Replace inline boss logic with hook calls |
| `apps/web/src/transitions/phases/BossEntryDreadPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossEntryPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossVictoryPhase.tsx` | Read from config |
| `apps/web/src/transitions/phases/BossVictoryCompPhase.tsx` | Read from config, delete REWARD_LABELS |
| `apps/web/src/components/BossRoomHeader.tsx` | Read `ruleHeaderText` from config |

---

## FB-009 — Dice Roll Sound Effect

**Type:** Quality of Life / Audio
**Area:** `apps/web/src/hooks/useCrowdAudio.ts`, `apps/web/src/store/useGameStore.ts`
**Status:** Pending implementation
**Source:** Playtester feedback

### Request

> "There should be a soothing dice roll sound effect when you roll."

### Context

The game already has a fully synthesized Web Audio API audio system in `useCrowdAudio.ts` — crowd cheer on win, crowd groan on loss, mute toggle persisted to localStorage. No audio asset files exist or are needed; all sounds are generated procedurally. The dice roll sound should follow the same pattern.

"Soothing" points toward soft wooden/baize physics rather than sharp casino clattering — two short bandpass-filtered noise bursts mimicking dice settling on felt, ~200ms total, with gentle high-frequency rolloff.

### Implementation plan

**1. Add `playDiceRattle(ctx: AudioContext)` to `useCrowdAudio.ts`**
Two bandpass white-noise bursts (~80ms each, ~40ms apart) at a low amplitude. Same synthesis pattern as the existing `makeNoiseBuf` + filter + gain envelope approach already used for cheer/groan.

**2. Add `_rollKey` to the store (`useGameStore.ts`)**
A monotonic counter incremented alongside `isRolling: true` in `rollDice()`. Same pattern as `_flashKey` / `_popsKey`. Three lines total: one field in `GameState`, one initial value, one increment in `rollDice()`.

**3. Add a trigger `useEffect` in `useCrowdAudio.ts`**
Watch `_rollKey` (not `isRolling` directly, to avoid double-fire on the `false` toggle). Fires `playDiceRattle()` when `_rollKey` increments. Gated by `mutedRef` like the existing sting effects.

### Scope

~25 lines across 2 files. No new components, no assets, no config changes. Mute toggle covers it automatically.

---

## FB-008 — Transition Timing Overhaul

**Type:** Bug / Quality of Life
**Area:** Transition system / `TransitionOrchestrator.tsx`, `useGameStore.ts`,
          `TableBoard.tsx`, `CompCardFan.tsx`, `useFloorTheme.ts`, `ChipRain.tsx`
**Status:** Implemented

### Problem

Five timing issues were degrading the cinematic flow of game progression:

1. **VFW marker screen appears before title screen** — on new runs, the Marker 1
   intro ("VFW Hall") flashed before the title splash.
2. **Marker meter flips immediately to new limit** — bar filled to 100%, then
   instantly reset to the new marker's partial fill with no drama.
3. **Boss banner appears during ChipRain** — the boss room header rendered before
   the player reached the pub or saw any transition modal.
4. **ChipRain spills into the next round** — winning chips from the clearing roll
   re-fired on the fresh board after the pub.
5. **Comp card deals in and felt changes before victory phase** — defeating a boss
   immediately triggered the new floor's palette and comp animation before the
   BossVictory cinematic played.

### Root causes

**Cause A — Effect race in TransitionOrchestrator** (Bug 1):
Five separate `useEffect` hooks fired in the same React render cycle. Each read
stale closure values from the pre-render snapshot. The marker intro effect read
`activeTransition=null` even though the title effect already called
`setActiveTransition('TITLE')` in the same cycle, and overwrote it.

**Cause B — Instant `currentMarkerIndex` advance** (Bugs 2, 3, 5):
`applyPendingSettlement()` set `currentMarkerIndex` to the new value immediately,
even though the player was still watching the clearing animation. Three components —
`MarkerProgress`, `BossRoomHeader`, `CompCardFan` — and `useFloorTheme` all subscribed
directly to `currentMarkerIndex` and reacted before the celebration sequence completed.

**Cause C — Stale `_popsKey` on ChipRain remount** (Bug 4):
After the pub, TableBoard remounted. ChipRain's trigger effect fired on mount with the
stale `_popsKey` value from the clearing roll, and `payoutPops` was never cleared.
ChipRain re-fired the old win-rain on an otherwise fresh board.

### Solution

**Fix A:** Consolidated the five `TransitionOrchestrator` detection `useEffect` hooks
into one, with an explicit priority chain. One effect, one `setActiveTransition()` call
per firing, no stale-state overlap.

**Fix B:** Added `selectDisplayMarkerIndex` selector — returns
`celebrationSnapshot.markerIndex` during any transition window, `currentMarkerIndex`
otherwise. Switched `MarkerProgress`, `BossRoomHeader`, `CompCardFan`, and `useFloorTheme`
to this selector. Added a distinct "marker smashed" visual to `MarkerProgress`: bar locks
at 100% with an `animate-marker-smash` burst before the new target is revealed.

**Fix C:** Clear `payoutPops: null` in `clearTransition()` for marker-clear/boss-victory
completions. Added belt-and-suspenders mount guard in `ChipRain` so a stale `_popsKey` on
first render is skipped.

### Files changed

| File | Change |
|---|---|
| `apps/web/src/store/useGameStore.ts` | Added `selectDisplayMarkerIndex`; clear `payoutPops` in `clearTransition` |
| `apps/web/src/transitions/TransitionOrchestrator.tsx` | Consolidated 5 detection effects → 1 prioritized effect |
| `apps/web/src/components/TableBoard.tsx` | `MarkerProgress` + `BossRoomHeader` use display index; added "smash" animation |
| `apps/web/src/components/CompCardFan.tsx` | Use display index for threshold check |
| `apps/web/src/hooks/useFloorTheme.ts` | Use display index for floor selection |
| `apps/web/src/components/ChipRain.tsx` | Mount guard on trigger effect |
| `apps/web/tailwind.config.ts` | Added `animate-marker-smash` keyframe |

