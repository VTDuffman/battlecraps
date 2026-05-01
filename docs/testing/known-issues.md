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

---

## KI-002 — Roll delta popup is confusing on marker-clear rolls

**Area:** `apps/web/src/components/DiceZone.tsx`
**Severity:** Low
**Status:** Fixed

**Issue:**
When the player clears a marker, two win signals appear simultaneously: the celebration phase text ("Nice roll — $300 target cleared") and the gold `+$X.XX` delta popup from `DiceZone`. The popup shows the net bankroll change from that single roll (`lastDelta`), which the player is likely to misread as their highest single-roll return, a bonus amount, or some other special reward tied to clearing the marker.

**Proposed fix:**
Suppress the `lastDelta` popup (or replace it with a more contextual label) when the roll result is a marker-clear event — i.e. when `pendingTransition` is true or `celebrationSnapshot !== null` at the moment the delta would render. Alternatively, label it explicitly ("ROLL PROFIT") so its meaning is unambiguous.

---

## KI-003 — "Tap to Continue" on Marker Intro screen is not reliably clickable

**Area:** `apps/web/src/transitions/registry.ts`, `apps/web/src/transitions/phases/MarkerIntroPhase.tsx`
**Severity:** Low
**Status:** Fixed
**Source:** Playtester feedback

**Issue:**
The `MARKER_INTRO` phase is registered with `advanceMode: 'auto'` and `duration: 2500`. `PhasePlayer` fires `onAdvance` via `setTimeout` after 2.5 seconds regardless of user input. The "TAP TO CONTINUE" button in `MarkerIntroPhase` calls `onAdvance` correctly on click, but the 2.5s window is too short for most players to read the card and intentionally interact. Clicks after the timer fires land on the table board underneath.

This is a known half-finished state — the phase component comment on line 16 notes: *"The player can also tap to skip early (future enhancement)"*.

**Proposed fix:**
Either raise `duration` substantially (e.g. 8000ms) so the auto-advance gives players real reading time, or switch `advanceMode` to `'gated'` entirely and remove the timer — matching the pattern used by `MARKER_CLEAR`, `BOSS_ENTRY` (reveal phase), and `FLOOR_REVEAL` (confirm phase).

---

## KI-004 — Screen flash and crowd cheer re-fire after exiting the pub

**Area:** `apps/web/src/store/useGameStore.ts` (`clearTransition`)
**Severity:** Medium
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
After clearing a marker and exiting the pub, the gold screen flash and crowd cheer sound from the clearing roll replay on the fresh `TableBoard`. Both signals originate from `applyPendingSettlement()` setting `flashType: 'win'` and incrementing `_flashKey`. Neither field is reset when the celebration phases complete.

Sequence:
1. Clearing roll → `flashType: 'win'`, `_flashKey` increments. Flash and cheer fire correctly.
2. `TableBoard` unmounts when `activeTransition` becomes `MARKER_CLEAR` (PhasePlayer takes over). `useCrowdAudio` unmounts with it.
3. `clearTransition('MARKER_CLEAR')` clears `celebrationSnapshot` and `payoutPops` but **not** `flashType` or `_flashKey`.
4. Player exits pub → `TableBoard` remounts. `useCrowdAudio` mounts fresh and its `useEffect` fires with the stale `_flashKey` (non-zero, bypasses the `=== 0` guard). `flashTypeRef.current` is still `'win'` → `playCheer()` fires again.
5. Simultaneously, `flashType` is still `'win'` → the screen flash overlay renders and its CSS animation replays.

**Fix applied:**
Added `flashType: null` and `_flashKey: 0` to the `set({...})` call in `clearTransition()` for the `MARKER_CLEAR | BOSS_VICTORY` branch — alongside `payoutPops: null` already there. This prevents `useCrowdAudio`'s `_flashKey` effect from re-firing with a stale `'win'` flashType when `TableBoard` remounts after the pub. Also resolves KI-008 (same root cause, same fix).

---

## KI-005 — Member's Jacket comp does not show 6th shooter pip in the UI

**Area:** `apps/web/src/components/TableBoard.tsx` (`GameStatus` component, line 396)
**Severity:** Low
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
After defeating Sarge and receiving the Member's Jacket comp (+1 shooter), the shooter pip display on the table board still shows only 5 dots. The server correctly returns `shooters: 6`, and `recruitCrew()` writes that value to the store — the data is right. But `GameStatus` renders the pip strip with a hardcoded array length of 5:

```tsx
{Array.from({ length: 5 }, (_, i) => ( ... ))}
```

With `shooters = 6`, the coloring condition `i < shooters` lights all 5 dots gold (since 0–4 are all `< 6`), which looks identical to a normal full slate. The 6th dot is never rendered because there's no slot for it.

`PubScreen` handles this correctly — it derives `upcomingShooters = isComped ? 6 : 5` and renders an extra ✦ with a "+1 COMP" label. But that awareness doesn't carry to the table board.

**Fix applied:**
Changed `Array.from({ length: 5 }, ...)` to `Array.from({ length: Math.max(5, shooters) }, ...)` in `TableBoard.tsx`. The baseline stays 5 dots; a 6th renders automatically when `shooters` exceeds 5. The existing `i < shooters` coloring logic needed no changes.

---

## KI-008 — Chip rain sound effect lingers after returning from the pub

**Area:** `apps/web/src/store/useGameStore.ts` (`clearTransition`)
**Severity:** Medium
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
The crowd cheer sound (triggered by the win flash) replayed when the player returned from the pub to the table board. `useCrowdAudio` mounts fresh with `TableBoard`; its `_flashKey` effect fired because `_flashKey` was non-zero, bypassing the `=== 0` mount guard, and `flashType` was still `'win'` — causing `playCheer()` to fire again.

**Fix applied:**
Same one-line fix as KI-004 — added `flashType: null` and `_flashKey: 0` to the `clearTransition()` `MARKER_CLEAR | BOSS_VICTORY` branch in `useGameStore.ts`. Both KI-004 and KI-008 were the same bug: stale `flashType`/`_flashKey` on `TableBoard` remount.

---

## KI-009 — Crew flat-bonus payouts not applied to bankroll on intermediate rolls

**Area:** `packages/shared/src/crapsEngine.ts` (`settleTurn`)
**Severity:** High
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
Crew members that award a flat bonus payout on intermediate point-phase rolls (non-settling rolls) are not adding the bonus to the player's bankroll. For example, "Ace" McGee (ID: 17) should pay a flat $50 when the player rolls a 3 (e.g. 2+1) during the point phase — but the bankroll does not increase.

The cascade fires (portrait animates) but the additive payout is silently lost. Root cause: `settleTurn()` in `crapsEngine.ts` had an early return — `if (grossProfit === 0 && baseStakeReturned === 0) return 0` — that fired on every `NO_RESOLUTION` roll. Any `additives` accumulated during the cascade were dropped before the function reached `boostedProfit = grossProfit + ctx.additives`.

**Fix applied:**
One-line fix in `settleTurn()` (`packages/shared/src/crapsEngine.ts`). The early-return guard `if (grossProfit === 0 && baseStakeReturned === 0) return 0` was firing on every `NO_RESOLUTION` roll, silently dropping any `additives` accumulated during the cascade. Added `&& ctx.additives === 0` to the condition so the function continues and pays out flat crew bonuses even when no bets settle.

---

## KI-006 — New crew members (IDs 16–30) show no emoji in the UI

**Area:** `apps/web/src/components/CrewPortrait.tsx` (`CREW_EMOJI`)
**Severity:** Low
**Status:** Fixed
**Source:** Post-FB-012 observation

**Issue:**
After the FB-012 crew expansion (30-crew roster, unlock gating), the 15 new starter crew members (IDs 16–30) rendered without emoji in the UI. The `CREW_EMOJI` lookup table in `CrewPortrait.tsx` only had entries for IDs 1–15; the new IDs fell through to the `?? '?'` fallback.

**Fix applied:**
Added emoji entries for all 15 new crew members (IDs 16–30) to `CREW_EMOJI` in `apps/web/src/components/CrewPortrait.tsx`. Since `CREW_EMOJI` is the single source of truth imported by `PubScreen`, `GameOverScreen`, and `CrewPortrait`, all three display surfaces are fixed by this one change.

---

## KI-007 — Crew member tooltips show "Crew #N" and "???" instead of name and description

**Area:** `apps/web/src/components/CrewPortrait.tsx`, `apps/web/src/components/TableBoard.tsx`
**Severity:** Medium
**Status:** Fixed
**Source:** Post-FB-012 observation

**Issue:**
Crew member tooltips displayed "Crew #20" and "???" for new starter crew (IDs 16–30). Three static lookup tables were not extended when the 30-crew roster was added in FB-012: `ABILITY_DESCRIPTIONS` and `BARK_LINES` in `CrewPortrait.tsx`, and `CREW_NAMES` in `TableBoard.tsx` (which feeds the tooltip header via `crewNameFromId()`).

**Fix applied:**
Extended all four static tables with entries for IDs 16–30: `ABILITY_DESCRIPTIONS`, `BARK_LINES` (in `CrewPortrait.tsx`), `CREW_NAMES`, and `CREW_VISUAL_IDS` (in `TableBoard.tsx`). Ability descriptions and bark lines are authored to match each crew's actual ability and flavor.

---

## KI-010 — Cannot remove bets on mobile

**Area:** `apps/web/src/components/BettingGrid.tsx` (`BetZone` component)
**Severity:** High
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
Bet removal was right-click only (`onContextMenu`), which has no mobile equivalent. Mobile players could not take down odds or hardway bets before rolling.

**Fix applied:**
Added a long-press handler to `BetZone` in `BettingGrid.tsx`. A 500ms hold on any bet zone triggers `removeBet(field)` — the same action as right-click on desktop. A `didLongPress` ref suppresses the `onClick` that fires immediately after a touch release, preventing the bet from being re-placed in the same gesture. `onTouchMove` cancels the timer so scrolling doesn't accidentally trigger removal.

---

## KI-011 — Bottom of screens clipped on mobile; key buttons cut off

**Area:** `apps/web/src/components/GameOverScreen.tsx` and other full-screen components
**Severity:** High
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
On mobile devices, the bottom portion of certain full-screen views is clipped and unreachable — the "New Run" button on the Game Over screen is a confirmed example. The content overflows the visible viewport but is not scrollable, leaving critical CTAs inaccessible.

Root cause is likely one or more of:
- A full-screen container using `height: 100vh` (or `h-screen`) which does not account for the mobile browser's dynamic toolbar (address bar + bottom nav chrome). On iOS Safari and Android Chrome, `100vh` is taller than the actual usable viewport, causing the bottom of the layout to sit behind the browser UI.
- Fixed or absolute-positioned footer elements that assume a desktop viewport height.
- Missing `overflow-y: auto` / `overflow-y: scroll` on the scroll container, so content below the fold is unreachable even when it overflows.

**Proposed fix:**
Replace `h-screen` / `height: 100vh` containers on affected screens with `min-h-[100dvh]` (`dvh` = dynamic viewport height), which correctly tracks the usable viewport on mobile browsers. Where scrolling is appropriate, ensure the root container has `overflow-y: auto` so overflowing content is reachable. Audit `GameOverScreen`, `TitleLobbyScreen`, `PubScreen`, and transition phase components for this pattern — any full-bleed screen is a potential candidate.

---

## KI-012 — White flash at top of screen on dice bounce

**Area:** `apps/web/src/components/TableBoard.tsx` (boss banner / top-of-board area)
**Severity:** Low
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
When dice are rolled during the point phase, a brief white flash appears at the top of the screen — in the region where the boss banner is displayed — at the moment the dice animation "bounces" back. The flash does not appear to correlate with win/lose flash events; it triggers on every roll during the bounce-back keyframe, suggesting a CSS animation or rendering artifact rather than a game-logic-driven flash.

Likely causes:
- A background-color, opacity, or border transition on the boss banner element that briefly goes to white (or transparent over a white ancestor) during the dice bounce animation.
- A paint/composite flush caused by a GPU-accelerated transform on a sibling element (the dice) triggering a repaint on the banner, which has a CSS transition that snaps through white momentarily.
- An animation keyframe in the dice bounce sequence that inadvertently affects a containing or sibling element's rendering.

**Proposed fix:**
Inspect the dice bounce animation keyframes and the boss banner's CSS for any transition properties on `background`, `opacity`, `border-color`, or `box-shadow` that could produce a white flash. Isolate the banner element with `isolation: isolate` or `will-change: transform` to prevent compositing side-effects from the dice animation. If the flash is caused by a CSS `transition` on the banner itself, removing or scoping that transition to specific properties should resolve it.

---

## KI-013 — Global text remains too small despite typography overhaul

**Area:** Global Typography / `tailwind.config.ts` / `index.css`
**Severity:** High
**Status:** Open
**Source:** Playtester observation

**Issue:**
Following the implementation of FB-016, the text across the application still appears too small and difficult to read on mobile viewports. The intended 12px strict minimum font size and the new "HD-Retro" typography stack (Space Grotesk) do not seem to have resolved the readability issue. This suggests that either the base font size is scaling down unexpectedly on mobile devices (e.g., missing `<meta name="viewport">` adjustments), the Tailwind text utility classes (`text-[6px]`, `text-xs`, etc.) were not fully stripped during the Phase 4 sweep, or the base root `html`/`body` font size needs to be explicitly increased.

**Proposed fix:**
1. Audit the codebase to ensure all micro-pixel text classes (e.g., `text-[6px]`, `text-[7px]`) were actually replaced with standard Tailwind classes like `text-xs` or `text-sm`.
2. Inspect `apps/web/index.html` to confirm the viewport meta tag is correctly set to `content="width=device-width, initial-scale=1, maximum-scale=1"`.
3. In `tailwind.config.ts` or `index.css`, globally redefine the base text sizes or enforce a hard CSS rule in `@layer base` for `min-font-size: 12px` on all text elements.

---

## KI-014 — Typography overhaul missing from Title and Transition screens

**Area:** `TitleLobbyScreen.tsx`, `transitions/phases/*.tsx`
**Severity:** Medium
**Status:** Open
**Source:** Playtester observation

**Issue:**
The new "HD-Retro" typography stack and high-contrast styling introduced in FB-016 were not applied to several major interstitial screens. The Title screen, Marker Cleared screen, Boss encounter screens, and Floor transition screens still use the legacy sub-12px pixel fonts and low-opacity text colors (e.g., `text-white/30`), leading to visual inconsistency and persistent readability issues in these areas.

**Proposed fix:**
Perform a targeted sweep of `apps/web/src/components/TitleLobbyScreen.tsx` and all components within the `apps/web/src/transitions/phases/` directory. Replace dense pixel font usage with the `font-dense` class, enforce a 12px minimum size, swap low-opacity text classes for solid high-contrast theme colors, and apply the `text-shadow-hard` utility to text floating over textured backgrounds.

---

## KI-015 — Crew member tooltip cut off at screen edge

**Area:** `apps/web/src/components/CrewPortrait.tsx` / Tooltip Logic
**Severity:** Low
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
When hovering over the leftmost crew member in the rail, the resulting tooltip (displaying name and ability description) is positioned relative to the parent container in a way that causes its left edge to be clipped by the browser window. This makes the first few words of the ability description illegible.

**Proposed fix:**
1. Update the tooltip positioning logic to detect screen boundaries.
2. Implement a "collision awareness" check: if the tooltip's `left` coordinate is less than a specific padding value (e.g., 8px), nudge it to the right or anchor it to the left edge of the viewport instead of centering it on the portrait.
3. Alternatively, use a tooltip library that handles auto-flipping/positioning (like Radix UI Popover) or switch the tooltips to a centered "Ability Tray" that appears above the entire rail.

---

## KI-016 — Roll Log drawer lacks visible dismissal affordance

**Area:** `apps/web/src/components/RollLog.tsx`
**Severity:** Low
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
When the Roll Log bottom sheet is expanded, there is no explicit visual affordance (e.g., a "Close" button, an "X" icon, or a grab handle) to collapse it. While clicking the background scrim dismisses the drawer, this behavior is unintuitive for users who expect a direct interactive element within the drawer itself to signal how to return to the game board.

**Proposed fix:**
1. Add a "Close" button or a "Chevron Down" icon to the top-right of the drawer header.
2. Alternatively, implement a centered "grab handle" bar (a subtle horizontal rule) at the very top of the drawer to visually indicate that it is a pull-down sheet.
3. Ensure the `isOpen` state in `RollLog.tsx` is toggled to `false` when this new element is clicked.

---

## KI-017 — Boss Comp award reveal lacks "deal-in" animation and cinematic impact

**Area:** `apps/web/src/transitions/phases/BossVictoryCompPhase.tsx`
**Severity:** Low (Enhancement)
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The comp reveal after a boss victory is currently a static UI element. It appears instantly when the phase mounts, which feels abrupt and lacks the "ceremonial" weight of earning a rare casino comp. It also creates a visual inconsistency with the `CompCardFan` on the main table, which uses a specific "deal-in" animation when cards are added to the stack.

**Proposed fix:**
Integrate the `animate-comp-deal-in` CSS animation into the `BossVictoryCompPhase`. By adding a slight entry delay, we can ensure the player reads the "DEFEATED" header first before the card is "slung" onto the screen with the characteristic spring-overshoot effect.
    1. Update BossVictoryCompPhase.tsx to trigger the comp card's entry via a short state-driven delay after the phase mounts to allow the "DEFEATED" header to register first.
    2. Apply the existing animate-comp-deal-in CSS class to the comp award card container to synchronize the visual language with the card fan used during gameplay.
    3. Stagger the visibility of the "COLLECT & VISIT THE PUB" CTA button so it only appears after the card animation completes, preventing the player from skipping the reveal too quickly.

---

## KI-018 — Crew ability firing lacks visual impact and "juice"

**Area:** `apps/web/src/components/CrewPortrait.tsx`
**Severity:** Low (Enhancement)
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The visual feedback when a crew member's ability fires (during the roll cascade) is currently too subtle. While the portrait animates and a "bark line" (quote) appears, the effect lacks the "cinematic impact" desired for a key gameplay event. Specifically, the portrait scale-up is minimal (`scale: 1.1`), and the bark line text is rendered in `text-xs`, making it difficult to read and emotionally flat.

**Proposed fix:**
1.  **Dramatically Increase Scale:** In `CrewPortrait.tsx`, update the `isFiring` animation state in the `motion.div` to scale to at least `1.5` and lift the portrait further (e.g., `y: -40`). Ensure the active portrait has a high z-index (e.g., `z-50`) to clear the table.
2.  **Upgrade Bark Line Typography:** Replace the `text-xs` class on the bark line container with a high-impact combination like `text-2xl font-bold font-dense`. 
3.  **Animate the "Saying":** Instead of a static conditional render, wrap the bark line in its own `motion.div` with an entry animation (e.g., a springy "pop" or a slight overshoot scale) to make the text feel like it's being "shouted."
4.  **Visual Polish:** Add a gold drop-shadow or glow effect (`drop-shadow-[0_0_15px_rgba(255,215,0,0.7)]`) to the portrait during the `isFiring` sequence to emphasize the power activation.

---

## KI-019 — Win signals (flash and cheer) do not fire on intermediate Hardway wins

**Area:** `apps/web/src/store/useGameStore.ts` (`applyPendingSettlement`)
**Severity:** Medium
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
When a player wins a Hardway bet during the point phase on a roll that does not resolve the point (e.g., rolling a Hard 8 when the point is 6), the bankroll increases and "+$X.XX" pops appear, but the gold screen flash and crowd cheer sound do not fire.

The logic in `applyPendingSettlement` derives `flashType` strictly from `p.rollResult`. Intermediate rolls return `NO_RESOLUTION`, which defaults the `flashType` to `null`. Consequently, `_flashKey` does not increment, and `useCrowdAudio` never triggers `playCheer()`. This makes significant Hardway payouts feel "silent" and unrewarding compared to Natural or Point Hit wins.

**Proposed fix:**
Update the `flashType` derivation in `applyPendingSettlement` to include a check for profit (payouts). If any bet field in the `payoutBreakdown` is greater than zero, the `flashType` should be set to `'win'`, regardless of the `rollResult`.

```typescript
// apps/web/src/store/useGameStore.ts

// Current logic:
const flashType: 'win' | 'lose' | null =
  p.rollResult === 'NATURAL'   || p.rollResult === 'POINT_HIT'  ? 'win'  :
  p.rollResult === 'SEVEN_OUT' || p.rollResult === 'CRAPS_OUT'  ? 'lose' :
  null;

// Proposed logic:
const hasProfit = p.payoutBreakdown.passLine > 0 || 
                  p.payoutBreakdown.odds > 0 || 
                  p.payoutBreakdown.hardways > 0;

const flashType: 'win' | 'lose' | null =
  hasProfit || p.rollResult === 'NATURAL' || p.rollResult === 'POINT_HIT' ? 'win' :
  p.rollResult === 'SEVEN_OUT' || p.rollResult === 'CRAPS_OUT' ? 'lose' :
  null;

  ---

  ## KI-020 — Extra shooter pip from Member's Jacket disappears when life is lost

**Area:** `apps/web/src/components/TableBoard.tsx` (`GameStatus` component)
**Severity:** Low
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The shooter pip display logic implemented in KI-005 uses `Math.max(5, shooters)` to determine how many circles to render. While this correctly shows a 6th dot when the player has 6 shooters (via the Member's Jacket comp), that 6th circle vanishes entirely once the player's bankroll/shooter count drops back to 5 or lower. 

The player expects the "capacity" to remain visible. If they earned a 6th shooter, there should be 6 circles on the board; if they lose that life, the 6th circle should stay but be rendered in the "empty" state (transparent/dim), rather than the UI layout shifting and hiding the slot.

**Proposed fix:**
The `TableBoard` needs a way to persistently know the player has earned the extra shooter capacity, similar to how `PubScreen` calculates `isComped`. 

Update the pip rendering logic in `TableBoard.tsx` to check if the player has passed the specific Boss marker that grants the Member's Jacket (e.g., Sarge at Marker 2). If they have cleared that boss, the base capacity should be 6.

```tsx
// apps/web/src/components/TableBoard.tsx

// Identify if the Member's Jacket comp is active based on gauntlet progress
// (Assuming Sarge is Marker 2, index 2)
const hasExtraShooterComp = currentMarkerIndex > 2; 
const shooterCapacity = hasExtraShooterComp ? 6 : 5;

// Update the array generation to use the capacity rather than the current count
{Array.from({ length: shooterCapacity }, (_, i) => (
  <div
    key={i}
    className={[
      'w-2 h-2 rounded-full border',
      i < shooters
        ? 'bg-gold border-gold/80' // Filled/Active
        : 'bg-transparent border-white/20', // Empty/Expended
    ].join(' ')}
  />
))}```

---

## KI-021 — Crew-member payouts do not trigger win feedback (flash and cheer)

**Area:** `apps/web/src/store/useGameStore.ts` (`applyPendingSettlement`)
**Severity:** Medium
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
When a crew member (e.g., "The Shark") awards a flat bonus payout (`additives`) on a roll that does not result in a `NATURAL` or `POINT_HIT` (such as a `NO_RESOLUTION` or `POINT_SET` roll), the game does not trigger the "win" feedback signals. While the bankroll increases and the roll delta popup appears, the gold screen flash and crowd cheer are absent.

This occurs because `applyPendingSettlement` derives `flashType` solely from the `rollResult` enum. Crew-based bonuses are added to the bankroll even on intermediate rolls, but since the `rollResult` remains `NO_RESOLUTION`, the `flashType` defaults to `null`, preventing the celebratory audio-visual cues.

**Proposed fix:**
Expand the `flashType` logic in `applyPendingSettlement` to trigger a win state whenever the roll results in a positive bankroll change, ensuring crew bonuses feel impactful.

1.  Update the `flashType` derivation to check the `bankrollDelta` in addition to the `rollResult`.
2.  If `p.bankrollDelta > 0`, set `flashType` to `'win'`.

```typescript
// apps/web/src/store/useGameStore.ts

const flashType: 'win' | 'lose' | null =
  p.bankrollDelta > 0 || p.rollResult === 'NATURAL' || p.rollResult === 'POINT_HIT' ? 'win' :
  p.rollResult === 'SEVEN_OUT' || p.rollResult === 'CRAPS_OUT' ? 'lose' :
  null;```

  ---

## KI-022 — Lefty McGuffin’s "Seven-Out Save" lacks cinematic dread and payoff

**Area:** `packages/shared/src/crew/lefty.ts`, `apps/web/src/store/useGameStore.ts`, `apps/web/src/components/DiceZone.tsx`
**Severity:** Medium (UX/Juice)
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
Currently, when "Lefty" McGuffin (ID: 1) saves a shooter from a Seven-Out, the game logic immediately substitutes the dice result server-side. The client only receives the final "saved" result in the `turn:settled` payload. This means the player never actually sees the "7" land; the dice simply tumble and land on a safe number, and Lefty’s portrait flashes as a post-hoc explanation. This misses the intended emotional arc of "dread followed by relief."

**Fix applied:**
Two-stage dread→relief cinematic implemented:
1. **Server (`apps/api/src/routes/rolls.ts`):** `WsTurnSettledPayload` and HTTP roll response now include `originalDice?: [number, number]` when `finalContext.flags.sevenOutBlocked` is true.
2. **Store (`apps/web/src/store/useGameStore.ts`):** `dreadDice` state added. When Lefty saves, `lastDice` is set to `originalDice` (the 7) so the throw animation lands on the correct dice. `applyPendingSettlement()` detects `originalDice !== undefined && dreadDice !== null` on the first call, flushes the cascade queue (fires Lefty’s portrait), holds the pending settlement for 1500ms, then sets `lastDice` to the saved dice, clears `dreadDice`, and calls `applyPendingSettlement()` a second time for normal settlement. `isRolling` stays `true` throughout, preventing re-rolls.
3. **UI (`apps/web/src/components/DiceZone.tsx`):** `onLandEnd` detects `dreadDiceRef.current !== null` and skips the result popup, going straight to `applyPendingSettlement()` + idle. A pulsing "SEVEN OUT?" overlay renders while `dreadDice !== null` (the 1500ms window). When `dreadDice` clears, a "SAVED!" bark-rise flash appears and the dice update to the saved result. The idle result label is also suppressed during the dread window.
4. **HTTP parser fix (`apps/web/src/store/useGameStore.ts`):** The `data.roll` type in `rollDice()` now includes `originalDice?: [number, number]`, and the constructed `settlement` object spreads it in when present. Previously the field was sent by the server but never included in the typed parse, so `isLeftySave` was always `false` and the dread path never triggered via the HTTP response (only the WebSocket path, which is skipped when HTTP already populated `pendingSettlement`).

---

## KI-023 — Hype increases lack visual flow and "juice"

**Area:** `apps/web/src/store/useGameStore.ts`, `apps/web/src/components/TableBoard.tsx`
**Severity:** Low (Enhancement)
**Status:** Open
**Source:** Testing session observation

**Issue:**
Currently, when Hype increases—whether from a Point Hit or a Crew Member's ability (e.g., Holly)—the change is purely reflected by the numerical readout updating and the thermometer filling. There is no "physical" visual connection between the source of the hype and the meter itself. This makes the increase feel disconnected from the action, whereas a visual "flow" (similar to the chip rain for bankroll) would emphasize the reward.

**Proposed fix:**
Implement a "Hype Particle" system that sends visual energy (e.g., fire/spark particles) from the triggering source directly into the Hype Meter.

1.  **Coordinate Tracking:** In `TableBoard.tsx`, use a context or refs to track the screen coordinates of the `DiceZone` (for Point Hits) and each `CrewPortrait` slot.
2.  **Triggering the Flow:** Update `useGameStore.ts` to include a `lastHypeSource` field (either a slot index or 'dice') and a `_hypeKey` to trigger animations.
    * In `applyPendingSettlement`, if `p.newHype > oldHype` due to a Point Hit, set the source to `'dice'`.
    * In the cascade logic, when a Hype-category crew member (ID: 11) fires, set the source to their `slotIndex`.
3.  **Animation Component:** Create a `HypeFlow` component in `TableBoard.tsx` that renders on top of the felt. When `_hypeKey` increments, it should:
    * Spawn a burst of particles at the source coordinate.
    * Animate those particles in an arc toward the `hype-meter` tutorial zone.
4.  **Impact Feedback:** Add a "Hype Pop" animation to the thermometer in `GameStatus`. When particles arrive, the meter should briefly scale up (`scale: 1.1`) and trigger the `boilClass` animations more intensely to signify it is "heating up".

---

## KI-024 — "New Run" button missing from main gameplay table

**Area:** `apps/web/src/components/TableBoard.tsx` / `apps/web/src/components/GameOverScreen.tsx`
**Severity:** High
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The "New Run" button had never been implemented in the `TableBoard` component. The `GameOverScreen` has a "PLAY AGAIN" button but there was no mid-run abandon path for players who wanted to restart without reaching game over.

**Fix applied:**
Added an `onNewRun?: () => void` prop to `TableBoard`. When supplied, a small **NEW** button renders in the top bar (`absolute top-2 left-16`) alongside the mute toggle and How-To-Play button. Clicking it triggers a two-stage inline confirm ("END? YES / NO") to prevent accidental presses. The confirm prompt auto-dismisses after 5 seconds. The button is disabled while a roll is in flight (`isRolling`). In `App.tsx`, `onNewRun={() => void bootstrap(true)}` is passed to `<TableBoard />` only in the main game screen render — tutorial and knowledge-gate overlays intentionally do not receive it.

The mobile viewport audit (KI-011 linkage) found no `h-screen` or `height: 100vh` usages; all full-screen containers already use `dvh` units, so no viewport fix was needed here.

---

## KI-025 — Crew Hype bonuses are wiped by Seven-Out reset

**Area:** `packages/shared/src/crapsEngine.ts` / Server-side Roll Resolution
**Severity:** Medium
**Status:** Open
**Source:** Testing session observation

**Issue:**
When a "Seven-Out" occurs, the global Hype multiplier is intended to reset to 1.0x for the next shooter. However, if a crew member with a Hype-boosting ability fires during that same roll (e.g., to give the player a "head start" on the next run), their bonus is currently applied to the *pre-reset* Hype value. When the server later enforces the Seven-Out reset, it overwrites the `ctx.hype` value with a hardcoded `1.0`, effectively deleting the crew member's contribution.

As noted in `types.ts`, the server persists `ctx.hype` back to the state *or* resets it to 1.0 on Seven-Out. If the reset happens last, the crew's power is wasted.

**Proposed fix:**
The Hype reset logic should be moved into the initial `resolveRoll` or the beginning of the cascade for Seven-Out results, allowing subsequent crew interactions to build upon the new baseline.

1. In the server-side roll handler (likely `apps/api/src/routes/rolls.ts`), detect a `SEVEN_OUT` result before executing the cascade.
2. If a `SEVEN_OUT` is detected, initialize the `TurnContext.hype` at `1.0` regardless of the previous `GameState.hype`.
3. Allow the cascade to proceed as normal. Crew members who fire on a Seven-Out (like "Lucky Charm" or "Holly") will now be adding their `+0.1x` or `+0.5x` to the `1.0` baseline, resulting in a `1.1x` or `1.5x` carried over to the next shooter, preserving the "dread then relief" and "head start" mechanics.

---

## KI-026 — "Sea Legs" Comp Hype reset logic is underpowered

**Area:** `apps/api/src/routes/rolls.ts` (`computeNextState`)
**Severity:** Medium
**Status:** Open
**Source:** Testing session observation

**Issue:**
The "Sea Legs" Comp (rewarded for defeating Mme. Le Prix) is intended to soften the blow of a Seven-Out by resetting Hype to a higher value than the standard 1.0x. However, the current proposed logic of "resetting to 50% of total Hype" makes the perk effectively meaningless at lower Hype levels (e.g., a 2.0x Hype resets to 1.0x, which is the standard baseline). 

To remain a high-tier reward, the math should preserve 50% of the *accumulated* Hype (the "juice" above 1.0x) rather than 50% of the absolute total.

**Proposed fix:**
Update the Hype reset logic in the `SEVEN_OUT` case within `computeNextState` to check for the `SEA_LEGS` comp and apply the "Half of Added" formula.

1.  Modify `computeNextState` to accept the player's `compPerkIds` as an argument.
2.  In the `SEVEN_OUT` case, calculate the new Hype baseline:
    * **Standard:** `1.0`
    * **Sea Legs:** `1.0 + (finalCtx.hype - 1.0) / 2`
3.  Ensure that `isLuckyCharmSolo` (the 2.0x floor) still takes precedence if it results in a higher value.

```typescript
// apps/api/src/routes/rolls.ts

// Current logic:
hype: isLuckyCharmSolo ? 2.0 : 1.0

// Proposed logic:
const hasSeaLegs = userCompPerkIds.includes(COMP_PERK_IDS.SEA_LEGS);
const seaLegsBaseline = hasSeaLegs ? 1.0 + (finalCtx.hype - 1.0) / 2 : 1.0;

// Apply the highest available floor
hype: Math.max(seaLegsBaseline, isLuckyCharmSolo ? 2.0 : 0)```

---

## KI-027 — Floor and Marker intros trigger late after "Continue Run"

**Area:** `apps/web/src/transitions/TransitionOrchestrator.tsx` / `apps/web/src/store/useGameStore.ts`
**Severity:** Medium
**Status:** Open
**Source:** Testing session observation

**Issue:**
When resuming an existing run from the title screen, the "Floor Reveal" or "Marker Intro" transitions do not play immediately upon entering the table. Instead, they trigger only *after* the first roll has been resolved. This is disorienting because the player has already seen the table and made a bet, only to be interrupted by a "New Floor" cinematic once the dice land.

The root cause lies in the `TransitionOrchestrator`'s reliance on store updates to trigger its `useEffect` hooks. While `connectToRun` resets the "Shown" flags (e.g., `markerIntroShownForMarker`) to `null`, the orchestrator's effects may not be firing on the initial mount of the `TableBoard` because the `currentMarkerIndex` or `floor` hasn't changed relative to the hydrated state. The first roll resolution forces a state update via `applyPendingSettlement`, which "wakes up" the orchestrator.

**Proposed fix:**
1. **Immediate Evaluation:** Update the `useEffect` hooks in `TransitionOrchestrator.tsx` that handle `BOSS_ENTRY`, `MARKER_INTRO`, and `FLOOR_REVEAL` to ensure they run immediately upon mounting if the corresponding "Shown" flag in the store is `null`.
2. **Phase Priority:** Ensure that if a transition is required on mount, the `TransitionOrchestrator` sets the `activeTransition` before the `TableBoard` completes its first render cycle. 
3. **State Sync:** In `useGameStore.ts`, consider adding a `lastHydratedAt` timestamp during `connectToRun`. The orchestrator can use this as a dependency to ensure it re-evaluates intro requirements specifically after a "Continue" action.

```typescript
// apps/web/src/transitions/TransitionOrchestrator.tsx

// Potential Fix: Ensure the effect isn't just watching index changes, 
// but also checking for the 'null' (not shown) state on mount.
useEffect(() => {
  if (status === 'IDLE_TABLE' && markerIntroShownForMarker === null) {
    setActiveTransition('MARKER_INTRO');
  }
}, [status, markerIntroShownForMarker, setActiveTransition]);```

---


## KI-028 — Physics Professor "nudge" does not update global dice state

**Crew:** The Physics Prof (ID: 2)
**Severity:** High
**Status:** Fixed
**Source:** QA Observation

**Issue:**
When The Physics Prof triggers on a paired roll, he correctly calculates the "nudged" dice (e.g., shifting `[3,3]` to `[4,4]` to hit a point of 8). However, while his `execute()` function returns a `TurnContext` containing these `newDice`, the change is not being propagated back to the master resolution engine. Subsequent crew members in the cascade and the final `settleTurn()` call still see the original, pre-nudge dice values. This results in the portrait animating and the bark-line firing, but with zero impact on the actual game outcome or bankroll.

**Fix verified:**
Audited `packages/shared/src/cascade.ts` and `apps/api/src/routes/rolls.ts` during the KI-022 fix pass.

1. **Context propagation** in `cascade.ts`: The loop already does `ctx = result.context` after every `execute()` call (line 254). Each subsequent crew member receives the fully modified context from all prior crew — including updated `dice`, `diceTotal`, `rollResult`, `basePassLinePayout`, `baseOddsPayout`, `baseHardwaysPayout`, `baseStakeReturned`, and `resolvedBets`.
2. **Physics Prof's `execute()`** in `physicsProfessor.ts`: Returns a complete spread of the incoming context with all payout fields recalculated via `calculateBasePayouts()` and the new `rollResult` via `classifyDiceOutcome()`. No field is missing.
3. **Engine sync** in `rolls.ts`: `settleTurn(finalContext)` and `computeNextState(run, finalContext, ...)` both receive `finalContext` destructured from `resolveCascade(...)`'s return value — the fully-modified end-of-cascade context. No stale initial-roll snapshot is used.

The original reproduction may have been against an earlier version of the cascade loop. No code changes were required.

**File:** `packages/shared/src/cascade.ts`, `packages/shared/src/crew/physicsProfessor.ts`

---

## KI-029 — Physics Professor nudge lacks physical dice animation

**Area:** `apps/web/src/components/DiceZone.tsx`, `packages/shared/src/crew/physicsProfessor.ts`
**Severity:** Low (Enhancement)
**Status:** Open
**Source:** QA Observation

**Issue:**
When The Physics Prof triggers his "nudge" ability, the dice values on the table board update instantly without any visual transition. While the portrait animates and the bark-line fires, the "nudge" feels like a data swap rather than a physical manipulation. To match the thematic "physics" of the crew member, the dice should literally flip or rotate to their new faces during the cascade.

**Proposed fix:**
Implement a "Re-roll" or "Flip" animation state in the `DiceZone` component that can be triggered mid-cascade.

1. **New Cascade Event:** Add a `dice:nudge` or similar event to the cascade socket payload. This event should include the `targetDice` values.
2. **DiceZone Update:** In `DiceZone.tsx`, listen for this nudge event. When triggered:
    * Apply a quick 3D rotation animation (e.g., using Framer Motion's `animate` prop) to the existing dice elements.
    * The animation should simulate a "flip" (90 or 180-degree rotation) toward the new face value.
    * Coordinate the timing so the dice flip completes just as the `TurnContext` payouts are updated in the UI.
3. **Juice:** Add a subtle "tink" sound effect or a small puff of "chalk dust" particles at the dice coordinates when the flip occurs to emphasize the Professor's "correction."

**File:** `apps/web/src/components/DiceZone.tsx`

---
