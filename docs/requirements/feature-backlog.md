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

## FB-007 — Tutorial & "How to Play" System

**Type:** Feature
**Area:** Onboarding / `apps/web/src/`, `apps/api/src/`
**Status:** Implemented
**UX design:** `docs/requirements/tutorial-user-journey.md`
**Technical design:** `docs/design/tutorial-technical-design.md`

### Problem

Playtesters without craps experience are hitting Floor 1 cold with no mental model of the rules. Confusion about pass line, points, and seven-outs prevents engagement with the BattleCraps-specific systems (hype, crew, markers, bosses).

### Design

Full UX/design spec: `docs/requirements/tutorial-user-journey.md`
Full technical design: `docs/design/tutorial-technical-design.md`

**Summary:**

- Tutorial auto-launches on every player's **first run**, before the Title cinematic
- Always **skippable** via a persistent "Skip Tutorial →" button
- **"How to Play"** button on `TitleLobbyScreen` lets any player replay any section at any time
- Adaptive **knowledge gate** up front: "You ever shot dice before?" branches to full tutorial (11 beats) or BattleCraps-only (4 beats)
- Guide character **"Sal the Fixer"** — in-world NPC portrait, gritty cinematic voice, appears only during tutorial
- Each beat uses a **spotlight/dim** mechanic (SVG mask overlay): table dims, relevant zone glows, player takes one real action to advance
- Tutorial flows seamlessly into the actual run — no menu return; `TITLE` cinematic fires normally after tutorial

**Tutorial paths:**

| Path | Beats | Audience |
|---|---|---|
| Full (Path A → B) | 11 beats | Craps novice |
| BattleCraps only (Path B) | 4 beats | Knows craps, new to BattleCraps |

**Main Menu "How to Play" sections:**
- Craps Basics — static reference cards (come-out, pass line, point, odds, hardways, seven-out)
- BattleCraps Rules — marker system, hype formula, gauntlet targets (reads from `@battlecraps/shared`)
- Crew & Bosses — card gallery; bosses blurred until player has reached that marker

### Implementation tickets (7 incremental shippable items)

| Ticket | Description | Size | Depends on |
|---|---|---|---|
| T-001 | DB migration + API changes (`tutorial_completed` flag) | Small | — |
| T-002 | How to Play static reference (independent, zero risk) | Medium | — |
| T-003 | Sal portrait + Knowledge Gate component | Small-Med | T-001 |
| T-004 | Tutorial overlay shell + spotlight system | Large | T-003 |
| T-005 | Interactive beats: Path A (Beats 1–7) | Large | T-004 |
| T-006 | BattleCraps beats: Path B (Beats 8–11) | Medium | T-004 |
| T-007 | Polish, completion tracking, in-game HTP access | Small-Med | T-005, T-006 |

### Key technical decisions

- **Tutorial state is isolated from the game store** — local state in `AuthenticatedApp`; `TransitionOrchestrator` untouched
- **Simulated rolls are purely visual** — no API calls, no game state changes
- **`tutorial_completed` column on `users`** — persisted via new `POST /auth/tutorial-complete` endpoint; existing users backfilled to true in migration
- **Spotlight: SVG mask approach** — `getBoundingClientRect()` on `data-tutorial-zone` / `aria-label` elements; golden ring overlay; pointer events pass through to spotlighted zone only

### Files affected

See `docs/design/tutorial-technical-design.md` §18 for the complete file change table.

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

---

## FB-009 — Dice Roll Sound Effect

**Type:** Quality of Life / Audio
**Area:** `apps/web/src/hooks/useCrowdAudio.ts`, `apps/web/src/store/useGameStore.ts`
**Status:** Implemented
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

## FB-011 — Title Lobby Screen

**Type:** Feature
**Area:** `apps/web/src/App.tsx`, `apps/web/src/components/TitleLobbyScreen.tsx`
**Status:** Implemented
**Technical design:** `docs/design/title-screen-technical-design.md`

### Problem

Every page load bootstraps immediately into the game without giving the player a chance
to choose what to do. Players with an active run have no explicit "continue" action, and
starting a new run requires a small, easily-missed button in the top-left corner with no
confirmation guard.

### Desired behavior

- Every session (page load) opens on a title screen first
- If an active run exists: offer **Continue Run** and **New Run**
- **New Run** requires an inline confirmation before wiping the current run
- The only bypass is **Play Again** from a Game Over screen — this goes directly to the
  first VFW marker screen without passing through the lobby

### Solution summary

- New `TitleLobbyScreen` component — full-screen title UI (Floor 1 theme, matches
  `TitleScreenPhase` aesthetic) with Continue/New Run buttons and an inline confirmation
  overlay
- `showTitleLobby: boolean` local state in `AuthenticatedApp` (defaults `true`)
- `bootstrap()` is deferred; called only when the user makes a choice on the lobby
- `onPlayAgain` callback bypasses the lobby entirely (`bootstrap(true)` direct call)
- The existing one-time `TITLE` cinematic transition is preserved unchanged — it is a
  different concept (first-ever player intro, not a session-start nav screen)
- Remove the top-left "NEW RUN" button, superseded by the lobby

### Files

| File | Action |
|---|---|
| `apps/web/src/App.tsx` | Refactor bootstrap flow; add lobby rendering |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Create |

---

## FB-012 — Crew Expansion & Unlock System

**Type:** Feature / Architecture
**Area:** `packages/shared/src/crew/`, `packages/shared/src/types.ts`, `apps/api/src/db/`, `apps/api/src/routes/`, `apps/api/src/lib/`, `apps/web/src/components/PubScreen.tsx`, `apps/web/src/components/UnlockNotification.tsx`, `apps/web/src/store/useGameStore.ts`
**Status:** Implemented
**Technical design:** `docs/design/crew-implementation-design.md`
**Reference:** `docs/frameworks/crew_framework.md`

### Problem

The Pub screen drew randomly from the same 15 crew on every visit with no gating — players never felt progression. New players had access to high-cost Legendary crew immediately, and the original 15 were available without any in-game achievement. Additionally, come-out and blank rolls had no crew coverage, creating dead stretches where nothing fired.

### What Was Built

**Starter Roster (IDs 16–30):** Fifteen new `CrewMember` implementations, all Starter rarity, available from the first run. Designed to fire on dice-face patterns and roll types rather than bet outcomes, eliminating dead space:
- DICE: The Lookout (16), "Ace" McGee (17), The Close Call (18)
- HYPE: The Momentum (19), The Echo (20), The Silver Lining (21), The Odd Couple (22)
- TABLE: The Even Keel (23), The Doorman (24), The Grinder (25)
- PAYOUT: The Handicapper (26), The Mirror (27)
- WILDCARD: The Bookkeeper (28), The Pressure Cooker (29), The Contrarian (30)

Five of the new crew required three new cross-roll game state fields: `previousRollTotal`, `shooterRollCount`, and `pointPhaseBlankStreak`.

**Unlock System for IDs 1–15:** Each original crew member is gated behind a specific achievement across five unlock types (one-time event, per-run counter, cross-run cumulative, per-cascade event, run achievement). Unlock progress is tracked in-run via `perRunUnlockCounters` (JSONB on `runs`) and cross-run via `unlockProgress` (JSONB on `users`). Evaluated after each roll as a fire-and-forget operation in `lib/unlocks.ts`. New unlocks are written to `users.unlockedCrewIds` and emitted as an `unlocks:granted` WebSocket event. Client shows an auto-dismissing toast notification (`UnlockNotification.tsx`).

**Pub Screen Overhaul:** Hard-coded `ALL_CREW` list replaced by a `GET /crew-roster` API call that returns only crew available to the current user. Rarity badges added to crew cards. 3-card draft draws from available crew only.

### Files

| File | Action |
|---|---|
| `packages/shared/src/types.ts` | Added `previousRollTotal`, `shooterRollCount`, `pointPhaseBlankStreak` to `TurnContext`; `rarity` to `CrewMember` |
| `packages/shared/src/crew/` (15 new files) | `lookout`, `aceMcgee`, `closeCall`, `momentum`, `echo`, `silverLining`, `oddCouple`, `evenKeel`, `doorman`, `grinder`, `handicapper`, `mirror`, `bookkeeper`, `pressureCooker`, `contrarian` |
| `packages/shared/src/crew/index.ts` | Added 15 new barrel exports |
| `apps/api/src/db/schema.ts` | New columns: `runs` (+3 counters + `perRunUnlockCounters`), `users` (+`unlockProgress`), `crewDefinitions` (+`rarity`, `briefDescription`, `detailedDescription`, `unlockDescription`) |
| `apps/api/src/db/seed.ts` | All 30 crew seeded with rarity, descriptions, and unlock conditions |
| `apps/api/src/lib/crewRegistry.ts` | All 30 crew registered |
| `apps/api/src/lib/unlocks.ts` | New: `evaluateUnlocks()` — all 15 unlock conditions |
| `apps/api/src/routes/crewRoster.ts` | New: `GET /crew-roster` — availability-filtered roster with progress metadata |
| `apps/api/src/routes/recruit.ts` | Unlock gate (403 on locked crew) |
| `apps/api/src/routes/rolls.ts` | Counter maintenance in `computeNextState()`; fire-and-forget unlock evaluation |
| `apps/api/src/routes/runs.ts` | `unlockedCrewIds` included in create/fetch responses |
| `apps/web/src/components/PubScreen.tsx` | API-fetched roster, rarity badges, availability-filtered 3-card draft |
| `apps/web/src/components/UnlockNotification.tsx` | New: auto-dismissing toast for `unlocks:granted` events |
| `apps/web/src/store/useGameStore.ts` | `crewRoster`, `unlockedCrewIds`, `unlockNotification` state; `fetchCrewRoster()`, `clearUnlockNotification()` actions; `unlocks:granted` WS listener |

---

## FB-013 — Cinematic Crew Unlock Experience

**Type:** Feature / Polish
**Area:** `apps/web/src/components/UnlockNotification.tsx`, `apps/web/src/store/useGameStore.ts`, `apps/api/src/lib/unlocks.ts`
**Status:** Pending implementation

### Problem

When a player unlocks a new crew member, they receive a small auto-dismissing toast notification with the crew member's name. This tells them *that* something happened but not *why* it happened or *who* they just unlocked. There is no flavor — it feels like a system message rather than a reward.

The unlock system was designed with rich data per crew member (`unlockDescription`, `briefDescription`, `detailedDescription` already seeded in `crewDefinitions`) — none of this is surfaced in the current notification.

### Desired behavior

The unlock event should feel like a cinematic reward moment:

- A dedicated full-screen or large modal overlay replaces the dismissing toast
- Shows the crew member's emoji and name prominently
- Includes the **unlock flavor text** — *why* they showed up ("Word travels fast when a shooter goes on a run...")
- Includes the crew member's **brief description** — what they actually do
- Has a clear "Add to Roster" or "Got It" CTA to dismiss
- The overlay should be visually distinct and celebratory — differentiated from the standard Pub UI

### What needs to be built

1. **`UnlockModal` component** — full-screen overlay (or large centered modal). Displays:
   - Crew emoji (large)
   - Crew name
   - Unlock flavor text (`unlockDescription` from `crewDefinitions`)
   - Brief ability description (`briefDescription`)
   - Dismiss button

2. **`unlocks:granted` payload extension** — the WebSocket event currently emits crew IDs only. The API should enrich the payload with the crew definition data needed for the modal (name, emoji, `unlockDescription`, `briefDescription`) so the client doesn't need a separate fetch.

3. **Store wiring** — replace the current `unlockNotification: string | null` (name-only) with a richer `UnlockNotification` object containing the full display data. Update `unlocks:granted` listener in `useGameStore.ts` accordingly.

4. **Timing** — the modal should queue if multiple unlocks fire in the same session (unlikely but possible). Dismiss is player-gated (no auto-dismiss timer).

### Files (estimated)

| File | Action |
|---|---|
| `apps/web/src/components/UnlockModal.tsx` | Create — replaces `UnlockNotification.tsx` |
| `apps/web/src/components/UnlockNotification.tsx` | Delete or repurpose |
| `apps/web/src/store/useGameStore.ts` | Enrich `unlockNotification` type; update WS listener |
| `apps/api/src/lib/unlocks.ts` | Include crew definition fields in `unlocks:granted` emit |

---

## FB-014 — High Roller's Club & Leaderboards

**Type:** Feature  
**Area:** Leaderboard / Title Screen / `apps/api/src/`  
**Status:** Implemented  

### Summary  
Add a comprehensive high-score and run-history system accessible from the Title Lobby. This provides meta-progression and global competition, allowing players to compare their best builds and record-breaking rolls.  

### Design Requirements  

**1. Access & Navigation**
* Accessible via a new **"High Roller's Club"** button on the `TitleLobbyScreen`.  
* Supports two primary views: **Global** (Tab 1) and **Personal** (Tab 2).  

**2. Global Tab (The Hall of Fame)**
* **High Roller's Club (Top Section):** Lists players who successfully cleared the final floor (Floor 3, Marker 2) by defeating **The Executive**.  
* **"Gone but not Forgotten" (Bottom Section):** Dedicated to players who died mid-run. Entries include the **Highest Marker Achieved** to show exactly how close they were to victory.  
* **Display Logic:** Both sections show the Top 10 by default and are internally scrollable to the Top 25.  

**3. Personal Tab (Run History)**
* Lists the active player's top 25 runs regardless of outcome (no boss-victory requirement).  
* Displayed as a single static list.  

**4. Entry Data & Tie-Breaking**
* Each entry displays: Player Name (via Clerk/Google), Bankroll, Date, and **Highest Single Roll Win**.  
* **Highest Single Roll Win** is calculated using **Amplified Profit**: `floor(BoostedProfit × FinalMultiplier)`.  
* **Expandable Drawer:** Each entry can be expanded to reveal the specific **Crew Arrangement** (5 slots) used during that run.  
* **Tie-Breaker:** In the event of identical bankrolls, the entry with more **Remaining Shooters** ranks higher.  

### Technical Implementation  

**1. Database Schema (`apps/api/src/db/schema.ts`)**
A new `leaderboard_entries` table to avoid expensive aggregate logic on the `runs` table:  
* `id` (uuid, PK)  
* `user_id` (references `users.id`)  
* `run_id` (references `runs.id`)  
* `final_bankroll_cents` (integer)  
* `highest_roll_amplified_cents` (integer)  
* `highest_marker_index` (integer)  
* `shooters_remaining` (integer)  
* `crew_layout` (jsonb - array of crew IDs)  
* `did_win_run` (boolean)  
* `created_at` (timestamp)  

**2. API Endpoints**
* `GET /api/v1/leaderboard`: Returns filtered results for Global (Winners), Global (Non-winners), and Personal.  
* `POST /api/v1/leaderboard/submit`: Internal-only logic triggered during `GAME_OVER` resolution to upsert a run into the leaderboard table if it qualifies for a top-25 slot.  

**3. UI Components**
* `LeaderboardScreen.tsx`: The main container with Tab switching.  
* `LeaderboardEntry.tsx`: The row component with the expandable crew drawer.  
* Update `TitleLobbyScreen.tsx` to include the entry point.  

### Files Affected  

| File | Action |
|---|---|
| `apps/api/src/db/schema.ts` | Add `leaderboard_entries` table |
| `apps/api/src/routes/leaderboard.ts` | New: GET and internal submission logic |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Add leaderboard navigation button |
| `apps/web/src/components/LeaderboardScreen.tsx` | Create: Main leaderboard UI and tabs |
| `apps/web/src/components/LeaderboardEntry.tsx` | Create: Entry row with crew drawer |
| `packages/shared/src/types.ts` | Add `LeaderboardEntry` type definitions |

---

## FB-015 — Expanded Gauntlet (9-Floor Progression)

**Type:** Feature / Content  
**Area:** Progression / `packages/shared/src/config.ts` / `apps/web/src/lib/floorThemes.ts`  
**Status:** In Progress  

### Summary  
Expand the game's core progression gauntlet from the MVP 3 floors to a full 9-floor experience. This requires defining new aesthetics, marker targets, boss rules, and comp rewards for each new venue.   

This ticket serves as the living master tracker for the 9-floor gauntlet. It will be updated iteratively as new floors are conceptualized, documented, and merged into the engine. The feature is considered complete when all 9 floors are fully playable.

### Floor Progression Tracker  

| Floor | Venue Name | Design Status | Implementation Status | Notes |
|---|---|---|---|---|
| **1** | The Loading Dock | 🟡 Designed | 🔴 Pending | Specs in `floors.md` & `floor-aesthetics.md` |
| **2** | VFW Hall | 🟢 Designed | 🟢 Implemented | Legacy Floor 1 |
| **3** | Riverboat | 🟢 Designed | 🟢 Implemented | Legacy Floor 2 |
| **4** | The Strip | 🟢 Designed | 🟢 Implemented | Legacy Floor 3 |
| **5** | *TBD* | 🔴 Not Designed | 🔴 Pending | |
| **6** | *TBD* | 🔴 Not Designed | 🔴 Pending | |
| **7** | *TBD* | 🔴 Not Designed | 🔴 Pending | |
| **8** | *TBD* | 🔴 Not Designed | 🔴 Pending | |
| **9** | *TBD* | 🔴 Not Designed | 🔴 Pending | Final Boss / Game Completion |

*(Note: The exact ordering of legacy floors vs. new floors may shift during balancing. Ensure marker targets scale appropriately as new floors are slotted into the array).*

### Definition of Done (per Floor)  
For a floor to be marked as **Implemented**, the following components must be complete:  
1. **Engine Config:** Entry added to `GAUNTLET[]` in `packages/shared/src/config.ts` with correct marker scales.  
2. **Boss Configured:** Boss identity, vibe copy, rule params, and comp reward fully defined.  
3. **Boss Rule Hook:** Mechanic enforcement file created in `packages/shared/src/bossRules/`.  
4. **Theme Defined:** Color palette and aesthetic variables added to `apps/web/src/lib/floorThemes.ts`.  
5. **Assets:** Floor emblem/iconography generated and integrated into the transition screens.

---

## FB-016 — Mobile-First UI/UX & Readability Overhaul

**Type:** UX/UI / Accessibility  
**Area:** Global Typography / `RollLog` / Modals / Layout  
**Status:** Stashed in Feature Branch - Pending Heavy Re-Work 

### Summary  
A global UI overhaul to address severe readability issues, particularly on mobile viewports. The current reliance on sub-12px pixel fonts and low-opacity text over textured backgrounds causes eye strain. This feature introduces an "HD-Retro" typography stack, enforces strict minimum font sizes, replaces translucent text with high-contrast alternatives, and repositions the Roll Log into a mobile-friendly Bottom Sheet.

### Design Requirements  

**1. The "HD-Retro" Typography Stack (Global Sweep)** * **Enforce a strict 12px minimum** font size across the entire application.  
* **Display Font (`"Press Start 2P"`):** Restrict usage to high-level headers, titles, boss names, and critical game-state flashes (e.g., "POINT HIT").  
* **Data Font (`"Share Tech Mono"`):** Retain for numeric data, bankroll, and betting grids (enforcing the 12px minimum).  
* **Dense Text Font (NEW):** Introduce a clean, high-resolution sans-serif font (e.g., *Inter*, *Roboto*, or *Space Grotesk*) for all dense reading material. Apply this globally to: Crew ability descriptions, "How to Play" text, Transition/Boss Modals, and the Roll Log.  

**2. High Contrast & Solid Colors** * **Remove Low-Opacity Text:** Eliminate styles like `text-white/30`. Replace with solid, low-luminance colors (e.g., a solid gray or dimmed gold).  
* **Opaque Data Panels:** Data-heavy panels must use solid, opaque backgrounds (e.g., `#0f2a1d` `felt-dark`) with heavy borders to completely block out the table felt texture behind them.  
* **Universal Text Shadows:** Apply a hard 1px drop-shadow (`text-shadow: 1px 1px 0px #000`) to any text floating directly over the table to guarantee contrast.  

**3. Roll Log Bottom Sheet** * **Convert to Drawer:** Replace the floating bottom-right `RollLog` box with a mobile-standard Bottom Sheet component.  
* **Collapsed State (Trigger):** A prominent "View Log" button or tab anchored at the bottom of the screen. **Crucial:** The trigger must be positioned so it does not overlap or obscure the Crew Portrait rail.  
* **Expanded State:** Tapping the trigger slides the drawer up from the bottom, occupying ~60-80% of the screen with a dark, opaque background. Displays the full transaction history using the new sans-serif/mono fonts.  

**4. Tutorial State Compatibility** * The `SpotlightMask` in the tutorial relies on `getBoundingClientRect()`. Since the Roll Log is now hidden inside a drawer, the tutorial state machine must be updated.  
* If a tutorial beat requires highlighting the Roll Log, the system must programmatically force the drawer open (`isOpen = true`) *before* the spotlight calculates its position, and automatically close it when the player advances the beat.  

### Files Affected (Estimated)  

| File | Action |
|---|---|
| `apps/web/tailwind.config.ts` | Add new sans-serif font to the theme family |
| `apps/web/src/index.css` | Import new font; add global text-shadow utility classes |
| `apps/web/src/components/RollLog.tsx` | Complete refactor into a Bottom Sheet layout |
| `apps/web/src/components/PubScreen.tsx` | Typography updates for Crew descriptions |
| `apps/web/src/components/CompCardFan.tsx` | Typography updates for comp text |
| `apps/web/src/components/tutorial/*` | Typography updates globally |
| `apps/web/src/contexts/TutorialContext.tsx` | Add state control to programmatically open the Roll Log drawer |
| `apps/web/src/transitions/phases/*` | Typography updates for all transition modals |

---

## FB-017 — Tutorial Replay & State Reset

**Type:** Feature / UX  
**Area:** API Auth / `AuthenticatedApp` / `HowToPlayScreen`  
**Status:** Pending Implementation  

### Summary  
Allow players to manually trigger a replay of the interactive tutorial from the "How to Play" screen. This requires a dedicated backend state reset to re-authorize the use of `cheat_dice` simulated rolls, along with frontend safety guards to prevent accidental deletion of active runs.

### Design Requirements  

**1. Access & UI Placement**
* Add a prominent "Replay Interactive Tutorial" button pinned to the bottom of the `SectionPicker` view inside `HowToPlayScreen.tsx`.
* The button should be visually distinct from the static reading sections (e.g., using the `chip.red` or `gold.dim` theme colors) to indicate it is an executable action.

**2. The Active Run Guard (Safety Check)**
* When the replay button is clicked, the system must check if the player currently has an active, saved run.
* **If an active run exists:** Show a confirmation modal (similar to the "New Run" guard) stating: *"Starting the tutorial will abandon your current run. Are you sure?"*
* **If no active run exists (or upon confirmation):** Proceed with the state reset.

**3. Application Flow & State Reset**
* Triggering the replay must unmount the `HowToPlayScreen` and `TitleLobbyScreen`.
* The system calls the new API endpoint to reset the backend flag.
* `AuthenticatedApp` resets its local state (`tutorialCompleted = false`, `tutorialGateDismissed = false`), which automatically mounts the `KnowledgeGate` and begins the tutorial flow on a fresh Floor 1 board.
* If an active run was abandoned, the system must properly wipe/reset that run in the database (leveraging the existing "New Run" logic) before the tutorial mounts.

### Technical Implementation  

**1. Backend API (`apps/api/src/routes/auth.ts`)**
* Create a new `POST /api/v1/auth/tutorial-reset` endpoint.
* **Logic:** `UPDATE users SET tutorial_completed = false WHERE clerk_id = req.clerkId;`
* This correctly re-authorizes the `POST /api/v1/runs/:id/roll` endpoint to accept the `cheat_dice` payloads required for Beats 1, 5, and 6.

**2. Frontend Wiring (`apps/web/src/App.tsx`)**
* Create a `handleReplayTutorial` function in `AuthenticatedApp`.
* Pass this function down through `<TitleLobbyScreen />` to `<HowToPlayScreen />`.
* Inside `handleReplayTutorial`:
  1. Await the `POST /tutorial-reset` API call.
  2. If abandoning an active run, trigger the existing "abandon run" store action.
  3. `setTutorialCompleted(false)`
  4. `setTutorialGateDismissed(false)`
  5. `setShowHowToPlay(false)` / `setShowTitleLobby(false)` to return to the game board context.

### Files Affected  

| File | Action |
|---|---|
| `apps/api/src/routes/auth.ts` | Add `POST /tutorial-reset` endpoint |
| `apps/web/src/App.tsx` | Add `handleReplayTutorial` logic and prop drilling |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Propagate `onReplayTutorial` prop |
| `apps/web/src/components/tutorial/HowToPlayScreen.tsx` | Add action button and confirmation modal guard |

---

---

## FB-018 — Playtester Feedback System (Deep Context)

**Type:** Research / QoL
**Area:** UI / API / `TitleLobbyScreen`
**Status:** Pending Implementation

### Problem
As the game enters Beta, there is no formal channel to capture bug reports, sentiment, or feature ideas from playtesters. Relying on manual messages results in "low-signal" feedback where the developer has to guess the game state during a bug.

### Proposed Solution
An in-game feedback modal accessible from the Title Lobby.

**1. Entry Point:** A "Submit Feedback" link or button anchored on the `TitleLobbyScreen`.
**2. The Modal UI:**
   - **Type Selector:** Dropdown for `Bug`, `Sentiment`, `Idea`.
   - **Vibe Rating:** A 1-5 star or chip rating (optional).
   - **Comment Box:** Multi-line text area for the user's observation.
**3. The "Deep Context" Payload:**
   Every submission automatically attaches a `context` JSON object containing:
   - `floor`: current floor index.
   - `bankroll`: current bankroll in cents.
   - `crew`: array of active crew IDs.
   - `history`: the last 10 entries from the game's roll log.
   - `metadata`: device type (mobile/desktop) and session duration.

### Technical Implementation
- **API:** New `POST /api/v1/feedback` endpoint.
- **DB:** New `feedback_submissions` table (User ID, Type, Rating, Comment, Context JSON, Timestamp).
- **Frontend:** A standalone `FeedbackModal` component; triggered via a new action in `useGameStore` to pull the current state snapshot for the payload.

### Files Affected (Estimated)

| File | Action |
|---|---|
| `apps/api/src/db/schema.ts` | Add `feedback_submissions` table |
| `apps/api/src/routes/feedback.ts` | New: POST feedback endpoint |
| `apps/web/src/store/useGameStore.ts` | Add state/actions for context capture |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Add trigger link/button |
| `apps/web/src/components/FeedbackModal.tsx` | Create: New feedback UI |

---

## FB-019 — Versioning and Release Notes

**Type:** Feature / Infrastructure
**Area:** Build Pipeline / UI / `TitleLobbyScreen`
**Status:** Implemented

### Summary

Establish an automated Beta versioning system and an in-game Release Notes UI. This will help playtesters track updates, understand what new features or fixes have been deployed, and provide accurate version numbers when submitting bug reports, bridging the gap between Git history and the player experience.

### Design Requirements

**1. Automated Semantic Versioning (SemVer)**
* The game is currently in Beta, utilizing the `v0.MINOR.PATCH` structure.
* **Patch Increments (`v0.X.+1`):** Any production push containing only `fix`, `chore`, or `KI-xxx` commit messages increments the Patch version (e.g., `v0.2.5` → `v0.2.6`).
* **Minor Increments (`v0.+1.0`):** Any push containing `feat` or `FB-xxx` increments the Minor version and resets the Patch version to zero (e.g., `v0.2.6` → `v0.3.0`).

**2. Title Screen UI & "New" Indicator**
* The current version (e.g., `v0.3.0`) is displayed on the `TitleLobbyScreen` as a clickable text button.
* **"New" Badge:** The system checks the browser's `localStorage` for the last seen version. If the active game version is newer, a prominent "NEW" badge or dot appears next to the version number.
* Clicking the version number updates `localStorage` (dismissing the badge for future sessions) and opens the Release Notes Modal.

**3. Release Notes Modal**
* **Header:** Displays the current version prominently.
* **Current Push:** Lists the formatted commit messages, features, and fixes included in the most recent deployment.
* **History:** A scrollable timeline showing previous versions and their respective changelogs.

### Technical Implementation

**1. Build Pipeline Script (`scripts/generate-release-notes.js`)**
* Create a Node script that runs during the build step (`npm run build`).
* The script parses the `git log`, applies the SemVer math based on commit message prefixes since the last baseline, and generates a static `apps/web/src/lib/releaseNotes.json` file.

**2. State Management (`localStorage`)**
* Introduce a `battlecraps_last_seen_version` key in the browser's `localStorage`.
* On mount of `TitleLobbyScreen`, compare this value against `releaseNotes[0].version` to determine if the "New" indicator should render.

**3. Frontend Components**
* **`VersionDisplay.tsx`:** The clickable trigger component for the title screen.
* **`ReleaseNotesModal.tsx`:** The modal UI that maps over the imported `releaseNotes.json` to render the scrollable history.

### Files Affected

| File | Action |
|---|---|
| `package.json` | Add pre-build script hook |
| `scripts/generate-release-notes.js` | Create: Git parsing and JSON generation logic |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Integrate `VersionDisplay` component |
| `apps/web/src/components/VersionDisplay.tsx` | Create: Render version text and "New" badge |
| `apps/web/src/components/ReleaseNotesModal.tsx` | Create: Scrollable modal reading from JSON |
| `apps/web/src/lib/releaseNotes.json` | Auto-generated target (add to `.gitignore` and `.claudeignore`) |

---

## FB-020 — 3D Physics Dice Animation (Three.js + cannon-es)

**Type:** Quality of Life / Polish
**Area:** `apps/web/src/components/DiceZone.tsx`, `apps/web/src/index.css`
**Status:** Attempted to Implement - Total Shitshow - Stashed in Feature Branch

### Problem

The current dice are 2D flat `<div>` elements animated with CSS keyframes. The "3D" effect is an illusion created by oscillating `rotateX`/`rotateY` values baked into keyframe percentages. While functional, it lacks the visceral physicality that makes rolling dice satisfying — there is no real depth, no true tumble, no sense of weight.

The reference implementation (Three.js + cannon-es) renders actual 3D geometry in a WebGL canvas with lighting, shadows, and rigid-body physics. The dice have mass, bounce off surfaces with real restitution, and spin in ways that can't be replicated with CSS transforms.

### Core Engineering Challenge: Guided Physics

In the reference implementation, physics determines the dice outcome — random initial conditions produce a random result. BattleCraps is the inverse: **the server determines the outcome via crypto RNG**, and the animation is purely decorative. The physics simulation cannot be the source of truth.

This requires a "guided physics" approach: run the real cannon-es simulation for visual drama, then correct the final resting orientation to match the server-determined result before the player can read the face. Three strategies exist:

| Strategy | Mechanism | Tradeoff |
|---|---|---|
| **Re-simulation** | Re-run with new random initial conditions until the physics naturally produces the correct face | Unpredictable timing; may loop many times for rare faces |
| **Lookup table** | Pre-compute per-face initial throw vectors that reliably produce each value | Looks repetitive after a few rolls; fragile if physics params change |
| **Late snap** (recommended) | Run real physics; in the final ~100ms as velocity approaches zero, lerp the die rotation to the correct face orientation | Imperceptible if timed well; one-time calibration effort |

The late-snap approach is recommended: it preserves the organic drama of the throw, and the correction window is invisible because the die is nearly still when it fires.

### What Needs to Be Built

**1. New dependencies**

```
three          ~170KB gzipped   3D WebGL renderer
cannon-es      ~50KB gzipped    Rigid-body physics engine (maintained cannon.js fork)
```

Total bundle impact: ~220KB addition. Acceptable for a game client; worth noting.

**2. `DiceZone.tsx` — primary rewrite target**

The dice rendering section (the two `Die` `<div>` components and their container) is replaced with a `<canvas>` element managed by a new `useDicePhysics` hook or inline ref logic. The `throwPhase` state machine concept is preserved but drives physics initial conditions instead of CSS class toggles:

- `idle` → canvas shows static dice at rest
- `throwing` → apply random throw impulse + spin torque to cannon-es bodies; start render loop
- `tumbling` → physics simulation running; Three.js render loop syncs mesh transforms from physics bodies each frame
- `landing` → velocity threshold crossed; late-snap lerp fires; render loop slows to idle

The `<canvas>` replaces the dice `<div>`s in the JSX. Everything outside the dice display box (roll button, result popup overlay, delta flash, wall flash trigger, `--dice-travel` measurement) is unchanged.

Three.js scene requirements:
- `WebGLRenderer` targeting the canvas element; `antialias: true`; transparent background so the felt shows through
- `BoxGeometry(1, 1, 1)` per die with a `MeshStandardMaterial` per face (pip textures or programmatic dot geometry)
- `DirectionalLight` + `AmbientLight` matching the current floor theme colors (readable from `useFloorTheme`)
- `PlaneGeometry` floor and back-wall collision planes in the cannon-es world; invisible in Three.js

cannon-es world requirements:
- `Body` per die with mass ~0.1, `linearDamping: 0.3`, `angularDamping: 0.4`
- `Plane` floor body at y=0; `Plane` back-wall body at the appropriate z depth
- Fixed-timestep world step (`world.step(1/60, delta, 3)`) called in the render loop for frame-rate-independent behavior
- Throw impulse applied at `throwPhase='throwing'`: upward + forward velocity vector + random angular velocity

Face-up detection (needed for the late-snap correction):
```typescript
// For each die body, test which face normal is most aligned with world up (0,1,0)
const faceNormals = [
  new Vec3(1,0,0), new Vec3(-1,0,0),  // 1, 6
  new Vec3(0,1,0), new Vec3(0,-1,0),  // 2, 5
  new Vec3(0,0,1), new Vec3(0,0,-1),  // 3, 4
];
// bodyQuaternion.vmult(normal) → world-space normal; argmax(dot(n, up))
```

Late-snap trigger: when `body.velocity.length() < SNAP_THRESHOLD` (empirically ~0.05), compute target quaternion for the correct face from `lastDice`, then `slerp` the body quaternion over ~80ms.

**3. `apps/web/src/index.css`**

Remove the three main dice animation keyframes: `dice-throw`, `dice-tumble`, `dice-land`. The `dice-converge`, `dice-gold-glow`, `point-ring-set`, `point-ring-hit`, result popup, and all other animations are untouched — they remain CSS-driven and apply on top of the canvas.

**4. Zustand store — no changes**

`lastDice`, `pendingSettlement`, `applyPendingSettlement`, the cascade queue, and all socket event handlers are identical. The physics renderer consumes the same `lastDice` selector it does today.

### What Stays Identical

- All server-side game logic (RNG, payout, cascade, settlement)
- The `useGameStore` state shape and all socket event handling
- The roll button, min-bet label, and disabled-state logic in `DiceZone.tsx`
- Result popup (NATURAL, POINT HIT, etc.), wall flash, delta flash, point ring
- Crew portrait cascade timing and `applyPendingSettlement` gating
- All other components — `TableBoard`, `BettingGrid`, `CrewPortrait`, etc.

### Risks

- **Late-snap visibility:** If the die is still moving perceptibly when the snap fires, the correction is noticeable. Requires empirical tuning of `SNAP_THRESHOLD` and lerp duration.
- **Performance:** A cannon-es + Three.js render loop adds CPU/GPU load. Should be profiled on low-end mobile (relevant to FB-016 goals).
- **Floor theme lighting:** The Three.js scene lights should respond to floor theme changes to avoid the dice looking visually detached from the table felt.
- **`DiePlaceholder` parity:** The current initial state (no dice shown) uses placeholder `<div>`s. The canvas equivalent needs a matching idle state.

### Files Affected

| File | Action |
|---|---|
| `apps/web/src/components/DiceZone.tsx` | Replace `Die`/`DiePlaceholder` divs with `<canvas>`; rewrite throw animation to drive cannon-es physics; add face-up detection + late-snap correction |
| `apps/web/src/index.css` | Remove `dice-throw`, `dice-tumble`, `dice-land` keyframes |
| `apps/web/package.json` | Add `three` and `cannon-es` dependencies |

---

## FB-021 — "NBA Jam" Style Dice Hype Visualization (2D CSS & Canvas Hybrid)

**Type:** Feature / Polish
**Area:** Dice Rendering / `DiceZone.tsx` / `useGameStore.ts`
**Status:** Pending Implementation
**Dependencies:** None (Decoupled from 3D physics rewrite)

### Summary

Introduce an "NBA Jam" style visual indicator for the Hype multiplier to give players a visceral, non-UI read on their current momentum. As the Hype multiplier climbs, the CSS dice "heat up," emit smoke, and eventually catch fire. This feature overlays retro 2D particle effects and CSS filters onto the existing DOM-based dice animations, avoiding the overhead of a full 3D physics engine.

### Design Requirements

**1. Hype Thresholds & Visual Tiers**
The dice visuals transition through three distinct phases based on the current Hype multiplier:
* **Tier 1: Base (Hype < 1.5x)** — Standard dice. No effects.
* **Tier 2: Heating Up (Hype 1.5x – 2.5x)** — Dice faces take on a reddish-orange tint. A faint, dark smoke particle trail follows the dice through the air during the `dice-throw` and `dice-tumble` phases.
* **Tier 3: On Fire (Hype > 2.5x)** — Dice take on a glowing gold/orange tint. A vibrant fire trail and heavy smoke particles emit from the dice during the throw.

**2. Idle State & Pulsating Glow**
When the dice are resting in the `DiceZone` waiting for the player to roll:
* The dice emit a subtle, slow-rising smoke to remind the player they are currently "hot."
* The dice container emits a glowing aura (via CSS `drop-shadow`). This glow **pulsates**, and the frequency of the pulse scales dynamically with the exact Hype multiplier level (e.g., faster throbbing at 3.5x than at 2.6x).

**3. Arcade UI Flashes**
Crossing a tier threshold triggers a localized, retro arcade-style text flash over the table:
* Crossing 1.5x triggers: **"HEATING UP!"**
* Crossing 2.5x triggers: **"ON FIRE!"**

### Technical Implementation

**1. CSS Styling & Pulsation**
* Use CSS `filter: sepia(1) saturate(5) hue-rotate(-30deg)` (or similar combinations) dynamically applied to the Die `<div>` to tint them without needing new sprite assets.
* Drive the idle pulsation by passing a CSS variable to the dice container: `style={{ '--pulse-speed': `${calculatePulse(hypeMultiplier)}s` }}`.
* Create a new `@keyframes hype-pulse` in `index.css` that utilizes this variable to animate a `drop-shadow` filter.

**2. 2D Canvas Particle Emitter (`DiceZone.tsx`)**
* Insert a `pointer-events-none` full-width/height `<canvas>` element absolutely positioned exactly behind the dice container.
* Create a `useParticleTrail` hook containing a `requestAnimationFrame` loop.
* **Tracking:** During a roll, the loop uses `getBoundingClientRect()` (or reads the computed transform matrix) of the two dice `<div>`s to find their current screen X/Y coordinates.
* **Emission:** The canvas draws simple 2D primitives (circles/squares) fading out over time at those coordinates, simulating fire and smoke trails matching the CSS trajectory.

**3. UI Flash Triggers (`useGameStore.ts`)**
* Introduce logic during `settleTurn` to detect if the newly calculated Hype multiplier crosses the 1.5x or 2.5x boundaries compared to the previous turn.
* Dispatch an ephemeral trigger (similar to `_flashKey` or `_popsKey`) to render a new `<HypeFlash />` overlay component.

### Files Affected

| File | Action |
|---|---|
| `apps/web/src/components/DiceZone.tsx` | Add background `<canvas>` layer; wire up `requestAnimationFrame` coordinate tracking; apply dynamic CSS inline variables for tint/pulse |
| `apps/web/src/index.css` | Add `@keyframes hype-pulse` and related utility classes |
| `apps/web/src/components/HypeFlash.tsx` | Create: CSS-animated retro text popup for "HEATING UP" and "ON FIRE" |
| `apps/web/src/store/useGameStore.ts` | Add threshold detection logic in settlement; add flash trigger state |





