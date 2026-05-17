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
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
Hype increases were reflected only by the thermometer filling and the numeric readout updating — no visual connection existed between the source of the increase and the meter.

**Fix applied:**
Implemented a DOM-query–based hype particle system requiring zero ref-forwarding:

1. **Store (`useGameStore.ts`):** Added `lastHypeSource: number | 'dice' | null` and `_hypeKey: number` to `GameState`. In `applyPendingSettlement`, when `newHype > oldHype`, the source is set to `'dice'` for `POINT_HIT` / `NATURAL` roll results, or to the `slotIndex` of the first crew in `pendingCascadeQueue` for crew-driven increases. `_hypeKey` increments on each sourced increase, acting as the animation trigger key.

2. **Coordinate strategy:** No ref-forwarding needed. `HypeFlow` calls `document.querySelector('[data-tutorial-zone="dice-zone"]')` for dice sources and `document.querySelector('[data-slot-index="N"]')` for crew sources. The crew slot wrapper divs in the TableBoard rail received `data-slot-index={i}` attributes. The hype meter already had `data-tutorial-zone="hype-meter"`. `getBoundingClientRect()` returns viewport-relative coordinates which map directly to `position:fixed` CSS values.

3. **`HypeFlow` + `HypeParticleEl` (`TableBoard.tsx`):** When `_hypeKey` increments, `HypeFlow` queries the source and target elements, captures their centre-point coordinates, and portals a `HypeParticleEl` to `document.body`. The particle uses `transform:translate(X,Y)` (GPU-composited, no layout recalc) starting at the source centre. A `requestAnimationFrame` tick on mount then updates the transform to the target centre, triggering a 600ms `ease-in-out` CSS transition — the "fly from source to meter" arc.

4. **Impact pop (`GameStatus`):** `GameStatus` watches `_hypeKey` independently. A 600ms `setTimeout` (matching particle travel time) flips `impactActive → true`; a 900ms timer resets it. While active, the thermometer wrapper gets `transform:scale(1.25)` with a 150ms `ease-out` transition — a tight "pop" that coincides with the particle's arrival.

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

**Area:** `apps/api/src/routes/rolls.ts` (`computeNextState` — `SEVEN_OUT` case)
**Severity:** Medium
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
When a "Seven-Out" occurred, the SEVEN_OUT branch in `computeNextState` hardcoded `hype: isLuckyCharmSolo ? 2.0 : 1.0`, discarding any hype crew members injected during the cascade. Holly's "head-start" ability (and any other crew that boosts hype on a Seven-Out) was silently wasted.

**Fix applied (`apps/api/src/routes/rolls.ts`):**

Resetting hype *before* the cascade would break Lefty McGuffin's save (the player survives but loses their entire hype build-up). Instead, the fix is applied *after* the cascade, in `computeNextState`:

```typescript
const cascadeHypeDelta = Math.max(0, finalCtx.hype - run.hype);
const nextHype = Math.max(isLuckyCharmSolo ? 2.0 : 1.0, 1.0 + cascadeHypeDelta);
```

- `cascadeHypeDelta` = positive hype added by crew during this cascade (clamped to 0 so crew that could reduce hype don't produce a negative delta).
- `nextHype` = `1.0 + cascadeHypeDelta` (crew head-start on the reset baseline), floored by Lucky Charm's 2.0 when she is the sole crew member.
- `TurnSettledPayload` and the DB update already source `hype` from `nextState.hype`, so no additional changes were needed downstream.

**Examples:**
- No crew hype boost → `cascadeHypeDelta = 0` → `nextHype = 1.0` (unchanged from before)
- Holly adds +0.5 on Seven-Out → `nextHype = 1.5` (next shooter starts warm)
- Lucky Charm solo, no other boost → `nextHype = max(2.0, 1.0) = 2.0` (Lucky Charm floor preserved)
- Lucky Charm solo + Holly +1.5 → `nextHype = max(2.0, 2.5) = 2.5` (crew delta exceeds floor)

---

## KI-026 — "Sea Legs" Comp Hype reset logic is underpowered

**Area:** `apps/api/src/routes/rolls.ts` (`computeNextState`)
**Severity:** Medium
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The "Sea Legs" Comp (rewarded for defeating Mme. Le Prix) is intended to soften the blow of a Seven-Out by resetting Hype to a higher value than the standard 1.0x. However, the proposed logic of "resetting to 50% of total Hype" made the perk effectively meaningless at lower Hype levels (e.g., a 2.0x Hype resets to 1.0x, which is the standard baseline). The fix preserves 50% of the *accumulated* Hype (the "juice" above 1.0x) rather than 50% of the absolute total.

**Fix applied (`apps/api/src/routes/rolls.ts`):**

`hasSeaLegs` is derived from `user.compPerkIds` (already loaded from the DB at the top of `rollHandler`), then passed as an optional boolean parameter to `computeNextState`. In the `SEVEN_OUT` branch, the hype reset combines the Sea Legs baseline with the KI-025 cascade delta:

```typescript
const cascadeHypeDelta = Math.max(0, finalCtx.hype - run.hype);
const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
const nextHype = Math.max(isLuckyCharmSolo ? 2.0 : 1.0, seaLegsBaseline + cascadeHypeDelta);
```

- `seaLegsBaseline` = `1.0` (standard) or `1.0 + accumulated_hype / 2` (Sea Legs)
- `cascadeHypeDelta` = any positive hype added by crew during the cascade (e.g., Holly's head-start), stacked on top of the baseline
- `Lucky Charm` solo floor (2.0) still takes precedence via the outer `Math.max`

`COMP_PERK_IDS` is now imported from `@battlecraps/shared` in `rolls.ts`. No schema changes required — `compPerkIds` was already persisted on the `users` table and returned by `resolveUserByClerkId`.

**Examples:**
- No Sea Legs, no crew boost → `seaLegsBaseline = 1.0`, `nextHype = 1.0`
- Sea Legs, run.hype = 3.0 → `seaLegsBaseline = 2.0`, `nextHype = 2.0` (kept 50% of 2.0 accumulated)
- Sea Legs + Holly +0.5, run.hype = 3.0 → `nextHype = 2.5`
- Lucky Charm solo, Sea Legs, run.hype = 1.5 → `nextHype = max(2.0, 1.25) = 2.0`

---

## KI-027 — Floor and Marker intros trigger late after "Continue Run"

**Area:** `apps/web/src/transitions/TransitionOrchestrator.tsx` / `apps/web/src/store/useGameStore.ts`
**Severity:** Medium
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
When resuming an existing run from the title screen, the "Floor Reveal" or "Marker Intro" transitions do not play immediately upon entering the table. Instead, they trigger only *after* the first roll has been resolved. This is disorienting because the player has already seen the table and made a bet, only to be interrupted by a "New Floor" cinematic once the dice land.

The root cause: `connectToRun` resets the "Shown" flags (e.g., `markerIntroShownForMarker`) to `null`, but React's dependency-array diffing sees no *value change* in `currentMarkerIndex` or `status` between renders — they match the hydrated values already in the store. So the detection `useEffect` in `TransitionOrchestrator` never re-fires on mount. Only the first `applyPendingSettlement` call (post-roll) produces a new state write that wakes the effect.

**Fix applied:**

1. **Store (`useGameStore.ts`):** Added `lastHydratedAt: number` (initial `0`) to `GameState`. `connectToRun` now writes `lastHydratedAt: Date.now()` on every invocation — fresh run or resume.
2. **Orchestrator (`TransitionOrchestrator.tsx`):** Subscribes to `lastHydratedAt` and includes it in the main transition-detection `useEffect`'s dependency array. Because `Date.now()` always produces a new value, React sees a changed dependency and immediately re-runs the effect after hydration — before the player can interact. The existing priority chain (`TITLE → BOSS_ENTRY → FLOOR_REVEAL → VICTORY → MARKER_INTRO`) then fires the correct transition right on mount.

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
**Status:** Fixed
**Source:** QA Observation

**Issue:**
When The Physics Prof triggers his "nudge" ability, the dice values on the table board update instantly without any visual transition. While the portrait animates and the bark-line fires, the "nudge" feels like a data swap rather than a physical manipulation.

**Fix applied:**
Implemented a two-phase reveal cinematic mirroring the Lefty McGuffin dread→relief pattern:

1. **Engine (`packages/shared/src/types.ts`, `physicsProfessor.ts`):** Added `nudgedFrom?: [number, number]` to `TurnContextFlags`. `physicsProfessor.ts` records `ctx.dice` into `flags.nudgedFrom` before spreading the new dice into the returned context.

2. **Server (`apps/api/src/routes/rolls.ts`):** Added `nudgedFrom?: [number, number]` to `WsTurnSettledPayload`. When `finalContext.flags.nudgedFrom` is set, both the WebSocket `turn:settled` emission and the HTTP response `roll` object include the field.

3. **Store (`apps/web/src/store/useGameStore.ts`):** Added `nudgeDice: [number, number] | null` and `_nudgeKey: number` to `GameState`. When a roll response includes `nudgedFrom`, `lastDice` is set to the pre-nudge values (so the throw animation lands on the original paired dice) and `nudgeDice` is populated. `applyPendingSettlement()` gains a Professor Phase: if `p.nudgedFrom !== undefined && nudgeDice !== null`, the cascade queue is flushed (Professor portrait fires), settlement holds for 1000ms, then `lastDice` is updated to the final dice, `nudgeDice` is cleared, `_nudgeKey` increments, and `applyPendingSettlement()` is called again for normal settlement.

4. **UI (`apps/web/src/components/DiceZone.tsx`):** `onLandEnd` detects `nudgeDiceRef.current !== null` and skips the result popup, handing off to `applyPendingSettlement()` (same pattern as the Lefty dread check). A `_nudgeKey` effect sets local `isNudging = true` for 400ms when the key increments. The `animate-dice-nudge` class is applied to the dice flex container while `isNudging` is true.

5. **CSS (`apps/web/src/index.css`):** Added `@keyframes dice-nudge` (scale 1→1.2→1, full 360° rotateX/Y) and `.animate-dice-nudge { animation: dice-nudge 400ms ease-in-out; }`.

**Files:** `packages/shared/src/types.ts`, `packages/shared/src/crew/physicsProfessor.ts`, `apps/api/src/routes/rolls.ts`, `apps/web/src/store/useGameStore.ts`, `apps/web/src/components/DiceZone.tsx`, `apps/web/src/index.css`

---

## KI-030 — User alias/username is incorrectly populated with First + Last Name

**Area:** `apps/api/src/routes/auth.ts` (`authPlugin`), `apps/api/src/db/schema.ts`
**Severity:** Medium
**Status:** Implemented
**Source:** QA Observation after FB-014 implementation

**Issue:**
The intended "alias" (Clerk username) is not being correctly persisted to the `users.username` column. Instead, the UI is showing "First Name + Last Name" as the username. Although FB-014 added explicit `first_name` and `last_name` columns to the `users` table to separate legal names from game aliases, the `/auth/provision` route is failing to properly distinguish between these values or is receiving incorrect mappings from the frontend. 

Specifically:
1. In `authPlugin`, the `username` field in the database is filled by `req.body.displayName`. If the frontend passes the full name in this field, the alias is lost.
2. The `firstName` and `lastName` columns in the database remain `null` for new users because they are not being effectively captured or updated during the provisioning or legacy re-association flow.
3. This propagates to the leaderboard, where `displayName` (denormalized from `users.username`) shows the full name instead of the player's chosen handle.

**Proposed fix:**
The backend provisioning logic needs to be stricter about how it handles the data sent by the frontend during the Clerk sync.

1. **Update Provisioning Logic:** In `apps/api/src/routes/auth.ts`, ensure that the `insert` and `update` (for legacy users) calls explicitly map the Clerk `username` property to `users.username` and the Clerk `first_name`/`last_name` properties to our new database columns.
2. **Frontend Audit:** Ensure the frontend's call to `/auth/provision` is actually sending the Clerk `username` field as the `displayName` property in the request body.
3. **Retroactive Fix:** Create a one-time migration or script to update existing `users.username` values using the `firstName` and `lastName` columns (if populated) or re-syncing from the Clerk API to move the "Real Name" data into the correct columns and restore the Clerk `username` to the `username` column.
4. **Leaderboard Update:** Since the leaderboard denormalizes the `username` into `display_name` at submission, any fix to the `users` table will only affect *new* leaderboard entries. A manual update of the `leaderboard_entries` table may be required to sync existing entries with the corrected user aliases.

**File:** `apps/api/src/routes/auth.ts`, `apps/api/src/db/schema.ts`

---

## KI-031 — Roll Log overlaps crew rail on mobile viewports

**Area:** `apps/web/src/components/RollLog.tsx`, `apps/web/src/components/TableBoard.tsx`
**Severity:** Medium
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
On mobile devices, the current positioning of the Roll Log overlay obstructs the gameplay UI. Specifically, the log covered the rightmost three crew members in the rail (slots 2, 3, and 4), preventing the player from seeing their cooldown states or "firing" animations. The current implementation lacked a dedicated space in the layout, competing with the crew portraits for screen real estate.

**Fix applied (also resolves KI-016):**

1. **Bottom-sheet drawer (`RollLog.tsx`):** Replaced the `fixed bottom-4 right-4 w-56` floating box with a `fixed bottom-0 left-0 right-0 max-w-lg mx-auto` full-width drawer. Animation strategy: the sheet is always `50dvh` tall in the DOM. When collapsed, `translateY(calc(100% - 40px))` slides it below the viewport leaving only the 40 px tab visible; when expanded, `translateY(0)` reveals the full sheet. CSS `transition-transform duration-300 ease-in-out` handles the slide.

2. **Persistent tab affordance (KI-016):** The 40 px handle is always visible and shows a grab pill, "ROLL LOG (N)" count badge, and a chevron (▲ collapsed / ▼ expanded). Tapping the handle or the background scrim collapses the drawer.

3. **Layout spacer (`TableBoard.tsx`):** A `flex-none h-10` spacer div was added after the Crew Rail section inside the flex column. Because the container is `h-[100dvh] flex flex-col`, this spacer is absorbed by the `flex-1` dice-zone, reserving 40 px at the very bottom of the layout so the collapsed tab never overlaps crew portraits.

**Files:** `apps/web/src/components/RollLog.tsx`, `apps/web/src/components/TableBoard.tsx`

---

## KI-032 — Crew ability animations overlap when multiple dice-altering powers fire in sequence

**Area:** `apps/web/src/store/useGameStore.ts` (`applyPendingSettlement`), `apps/web/src/components/DiceZone.tsx`
**Severity:** Medium
**Status:** Fixed.
**Source:** Playtester observation

**Issue:**
When Lefty McGuffin (ID: 1) saves a 7-out and the resulting "saved" roll is a pair, The Physics Prof (ID: 2) triggers immediately. The client logic for these two cinematic sequences (`dreadDice` delay for Lefty, and `nudgeDice` delay for the Professor) is overlapping. The Physics Prof's portrait and bark line fire before the dice physically land and resolve Lefty's "saved" result, breaking the intended sequence of "dread → relief → nudge".

**Proposed fix:**
Refactor the cinematic sequence handling in `applyPendingSettlement()` to act as a proper queue or state machine rather than independent `setTimeout` evaluations. If a settlement payload contains both `originalDice` (Lefty) and `nudgedFrom` (Prof), the UI must hold the `nudgeDice` state and the Professor's cascade flush until *after* the `dreadDice` timer clears and the first set of substituted dice have landed on the table.

---

## KI-033 — Roll Log does not display pre-altered dice from crew powers

**Area:** `apps/web/src/components/RollLog.tsx`
**Severity:** Low (Enhancement)
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
When a crew member alters the physical dice (e.g., Lefty McGuffin substituting a 7, Physics Prof nudging a pair), the Roll Log only shows the final, post-alteration dice result. The player loses the historical context of the original roll and the specific crew intervention that saved or boosted them, which makes it harder to read the turn history.

**Proposed fix:**
Update `RollLog.tsx` to utilize the `originalDice` and `nudgedFrom` properties that were added to the turn settlement payload during the fixes for KI-022 and KI-029. If these properties exist on a log entry, render a multi-stage item row: e.g., `[Original Dice] → [Crew Emoji/Name] → [Final Dice]`. Use visual cues like dimming or strikethroughs on the pre-altered dice to make the crew intervention clear.

---

## KI-034 — Physics Professor fails to nudge [6,6] down toward active point

**Crew:** The Physics Prof (ID: 2)
**Severity:** Medium
**Status:** Fixed
**Source:** QA Observation

**Issue:**
On a roll of 12 (`[6,6]`) with an active point of 9, the Physics Professor's ability triggered but failed to alter the dice. It should have shifted the pair down one increment to `[5,5]=10` (distance of 1 from the point of 9, compared to 12 which is a distance of 3). The ability effectively did nothing. The current mathematical logic appears to be failing on the upper bound edge case (`[6,6]`) or incorrectly calculating the delta when deciding whether to increment or decrement the face value.

**Proposed fix:**
Audit the target selection math in `packages/shared/src/crew/physicsProfessor.ts`. Ensure the nudge calculation correctly evaluates both `face - 1` (valid if face > 1) and `face + 1` (valid if face < 6). It needs to calculate the total dice sum for both valid directions, compare their absolute distance to `ctx.activePoint`, and correctly assign the `newDice` array to the path that yields the smaller distance.

## KI-035 — Dice get stuck mid-roll after floor transition to Riverboat

**Area:** `apps/web/src/components/DiceZone.tsx`, `apps/web/src/store/useGameStore.ts`
**Severity:** High
**Status:** Fixed
**Source:** Playtester observation

**Issue:**
After defeating Sarge and progressing to the first marker on the Riverboat floor, initiating a roll causes the dice to animate and then get physically "stuck" in the middle of the table. The roll never resolves, the game state remains locked (`isRolling = true` or equivalent), and the user is forced to refresh the page to continue. This suggests an issue with how the `DiceZone` component handles its animation state or physics loop after a major floor transition and unmount/remount cycle. The physics engine's sleep threshold or the `onLandEnd` event is likely failing to fire because of a lost reference during the transition sequence.

**Proposed fix:**
1. **Check Transition Cleanup:** Ensure that when the `TableBoard` remounts after the `FLOOR_REVEAL` and `MARKER_INTRO` transitions, the dice physics engine is properly completely re-initialized and no stale `isRolling` state persists in `useGameStore`.
2. **Animation/Physics Bindings:** Audit `DiceZone.tsx` to verify that physics body collision events or animation-end listeners are correctly attached on mount and explicitly cleaned up on unmount. If the dice use CSS animations instead of physics, ensure the `onAnimationEnd` synthetic events are properly firing.
3. **Fail-safe Timeout:** Implement a fallback timeout (e.g., 3000ms - 4000ms) within the `rollDice` action or `DiceZone` component that forcibly resets the `isRolling` flag and resolves the pending settlement if the dice fail to report a settled state. This will prevent the hard UI soft-lock and allow the game to proceed even if the visual animation glitches.

--- 

## KI-036 — Top utility bar overlaps game board and lacks visibility

**Area:** `apps/web/src/components/TableBoard.tsx`
**Severity:** Medium (UX/UI)
**Status:** Fixed
**Source:** Testing session observation

**Issue:**
The utility "Bar of Buttons" across the top of the screen (containing actions like New Run, Mute, How-To-Play, and a "Subscribed" indicator) currently floats over the game board using absolute positioning. This causes the buttons to visually overlap with core game elements and become muddy or illegible, particularly on visually dense Boss level variants. Furthermore, the "Subscribed" connection status indicator occupies valuable screen real estate without providing actionable or meaningful gameplay feedback to the player.

**Proposed fix:**
1.  **Dedicated Header Space:** Remove absolute positioning (e.g., `absolute top-X`) from the top utility button container in `TableBoard.tsx`. Introduce a dedicated, fixed-height header `flex-row` at the very top of the main layout column, which will safely push the rest of the board content down and eliminate overlap.
2.  **Improve Button Visibility:** Update the Tailwind utility classes on the buttons to ensure high contrast against all backgrounds (e.g., adding solid or semi-transparent background pills, stronger drop-shadows, or higher-contrast icon colors).
3.  **Remove "Subscribed" Indicator:** Delete the socket "subscribed" status badge from the UI entirely, as it serves no player-facing purpose and contributes to clutter.

---

## KI-038 — Tutorial content stale after Loading Dock added as Floor 1

**Area:** `apps/web/src/lib/tutorialBeats.ts`, `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx`, `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx`
**Severity:** Medium
**Status:** Fixed
**Source:** Design review — FB-015 Loading Dock integration audit

**Issue:**
FB-015 prepended the Loading Dock as Floor 1, shifting the gauntlet from 3 floors / 9 markers to 4 floors / 12 markers and setting the starting bankroll to $40 against a $50 first marker. The tutorial system and How to Play reference screens were not updated to reflect these changes. Six specific stale references were identified:

1. **`tutorialBeats.ts` — Beat 8:** Hardcoded `$301` bankroll figure. This was calibrated for the old system where a ~$250 starting bankroll barely crossed the $300 VFW Hall first marker. With $40 starting bankroll and a $50 first marker, the actual bankroll after the tutorial Hard 8 sequence is approximately $96 — the marker clear is still valid, but the specific amount is wrong.

2. **`tutorialBeats.ts` — Beat 10:** Two stale references — `"$300"` as the displayed marker target (first marker is now $50), and `"Three floors, nine markers"` (now four floors, twelve markers). This beat is the first beat for Path B players, making it a high-visibility error.

3. **`tutorialBeats.ts` — Beat 13:** The Foreman (Floor 1 boss) is completely absent from the boss introduction. Sarge is described as if he were the first boss the player will face; he is now on Floor 2. The player is about to walk into The Foreman's floor.

4. **`BattleCrapsRulesSection.tsx` — `FLOOR_NAMES` constant:** Hardcoded as `['VFW Hall', 'The Riverboat', 'The Strip']` — three floors, wrong start. Missing The Loading Dock.

5. **`BattleCrapsRulesSection.tsx` — floor loop and prose:** `[0, 1, 2].map(...)` renders only three floors; The Strip (Floor 4) is invisible. Companion prose says "Nine markers across three floors."

6. **`BattleCrapsRulesSection.tsx` — starting bankroll row:** Displays `$250.00`; actual starting bankroll is `$40.00` (set in `routes/runs.ts`).

7. **`CrewAndBossesSection.tsx` — boss cards:** Only three `<BossCard>` entries (markerIndex 2, 5, 8). The Executive at markerIndex 11 is missing entirely.

**Fix applied:**
- Beat 8: Removed hardcoded `$301` figure — text now reads "Look at that bankroll jump" without a specific amount.
- Beat 10: Removed hardcoded `$300`, updated prose to "Four floors, twelve markers."
- Beat 13: Rewrote boss list to lead with The Foreman (the boss the player is about to face), then enumerate the remaining three.
- `BattleCrapsRulesSection`: Fixed `FLOOR_NAMES` to include all four floors, updated loop to `[0, 1, 2, 3]`, updated prose to "Twelve markers across four floors," corrected starting bankroll to `$40.00`.
- `CrewAndBossesSection`: Added `<BossCard markerIndex={11} />` for The Executive.

---

## KI-039 — Crew unlock notifications fire in wrong run / wrong sequence

**Area:** `apps/web/src/store/useGameStore.ts` (`disconnect`, `connectToRun`), `apps/web/src/components/UnlockModal.tsx`, `apps/web/src/transitions/TransitionOrchestrator.tsx`
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
Two distinct unlock timing failures observed:

1. **Mid-run unlocks (Lefty McGuffin, The Whale):** The unlock modal did not appear when the unlock condition was met during the winning run. It fired instead in the *next* run, after visiting the pub for the first time. The player earned the unlock in run N but was not notified until run N+1's pub visit.

2. **End-of-run unlocks (Old Pro):** The unlock modal did not appear at all after the winning run. The intended sequence for a run that clears the final marker and triggers a crew unlock should be: **(1) Beat Marker → (2) Crew Unlock Modal → (3) Unlock Recap Screen → (4) Game Over Summary Screen.** Instead the notification was absent and the game advanced directly to the game-over flow.

**Root Cause:**
`unlocks:granted` arrives asynchronously — `evaluateUnlocks` does two `await db.update()` calls before emitting, so the event reaches the client after `applyPendingSettlement` has already run. The handler populates `unacknowledgedUnlocks` and `crewUnlockedThisRun` but never set `unlockModalReady`; only `applyPendingSettlement` sets that flag, and it already ran with an empty queue. For the GAME_OVER path, TransitionOrchestrator's Priority 4.5 gates on `crewUnlockedThisRun.length > 0`, which was empty at evaluation time, causing the recap to be skipped entirely before `disconnect()` wiped `unacknowledgedUnlocks`.

**Fix applied:**
1. **`useGameStore.ts` — `unlocks:granted` handler:** Added `settlementComplete` guard: if `!state.isRolling && state.pendingSettlement === null` when the event arrives, set `unlockModalReady = true` immediately. Fixes mid-run case.
2. **`TransitionOrchestrator.tsx` — Priority 4.5:** Added `unacknowledgedUnlocks` selector and added it to the `useEffect` dependency array. Updated Priority 4.5 condition and routing guard to `(crewUnlockedThisRun.length > 0 || unacknowledgedUnlocks.length > 0)`. When `unlocks:granted` arrives late the effect re-fires, `gameOverTransitionShown` is still false, and the GAME_OVER unlock recap fires correctly.

---

## KI-040 — UI text obscured by dice overlay after dice reset

**Area:** `apps/web/src/components/DiceZone.tsx`
**Severity:** Low
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
After dice reset between rolls, a small persistent result label (e.g. "NATURAL!", "POINT HIT!") was visible behind the dice — partially illegible because it sat at `absolute bottom-0` inside the dice container with no z-index elevation above the dice faces.

**Root Cause:**
A "small persistent result label" rendered at `throwPhase === 'idle'` using `absolute bottom-0 left-1/2` in the same container as the dice. It was a `text-[7px]` echo of `lastResult` that persisted between rolls after the animated `ResultPopup` dismissed.

**Fix:**
Removed the persistent label entirely. It was fully redundant — the animated `ResultPopup` (shown at `throwPhase === 'result' | 'result-out'`) already displays the same text at readable size during the roll, and the Roll Log records every result permanently. The `ResultPopup` is unaffected.

---

## KI-041 — Handicapper crew power may not be firing

**Area:** `packages/shared/src/crew/handicapper.ts`, `packages/shared/src/cascade.ts`
**Severity:** Medium
**Status:** Closed — Not a Bug
**Source:** Playtest observation (05/13/2026)

**Issue:**
The Handicapper (ID: 26) crew power did not appear to fire across multiple rolls in conditions that should have triggered it. No portrait animation, no bark line, and no observable hype change attributable to the Handicapper were seen.

**Resolution:**
A full unit test suite was written for `handicapper.ts` and all 14 tests passed (05/13/2026). The `execute()` logic is correct — correct guard conditions, correct hype deltas for all six point values, no context mutation. The ability fires only on `POINT_SET` (come-out rolls that establish a new point), which produces no bark line during a typical session — the only observable effect is a 0.1–0.3 tick on the hype meter. The playtest observation was a sampling artifact: the trigger condition was either not met frequently enough to notice, or the hype delta was too subtle to register without watching the thermometer.

**Test file:** `packages/shared/src/tests/crew/handicapper.test.ts`

---

## KI-042 — Marker clear not evaluated before roll; forces extra roll when bankroll already qualifies

**Area:** `apps/api/src/routes/rolls.ts`, `apps/web/src/store/useGameStore.ts`
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
The marker clear condition was only evaluated at the end of each roll's resolution chain. If a player's bankroll (including bets that could be taken down) met the marker target before rolling, the game still required a roll to register the win. Additionally, a hardway bet payout that pushed total wealth (cash + remaining locked bets) over the marker target was not detected on the settling roll — only on the next bet take-down.

**Fix applied:**

Three layers of detection added:

1. **Post-bet guard in `rolls.ts` (section 4b):** After all bet validation, computes `postBetBankroll = run.bankrollCents - betDelta`. If `postBetBankroll >= markerTarget`, auto-clears immediately — no dice generated. Handles bet take-downs and the pure "cash already there" case. Returns `{ autoClear: true }` in the roll response.

2. **`NO_RESOLUTION` marker check fix in `computeNextState`:** Changed the check from `newBankroll >= markerTarget` to `(newBankroll + sumBets(clearedBets)) >= markerTarget`. Pass line and odds remain locked on the table during NO_RESOLUTION, so the correct test is total wealth (cash + remaining bets), not cash alone. The final bankroll on clear is `newBankroll + refund` — the check now matches.

3. **Client: `removeBet()` → `autoCollect()`:** When a bet take-down pushes the client's effective bankroll over the marker target, `removeBet()` automatically calls `autoCollect()` — no Roll button click required. `autoCollect()` fires the roll endpoint without incrementing `_rollKey`, so no dice animation plays; the transition fires immediately.

**Files:** `apps/api/src/routes/rolls.ts`, `apps/web/src/store/useGameStore.ts`

---

## KI-043 — Cent values reappearing in payouts (rounding regression from Foreman extortion fee)

**Area:** `packages/shared/src/bossRules/extortionFee.ts`
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
Fractional dollar values (e.g., "$14.60" instead of "$15") are reappearing in payout and bankroll displays. The project convention requires all monetary values to be integer cents rounded to the nearest dollar (i.e., always a multiple of 100 cents). This regression appears to have been introduced by The Foreman's `EXTORTION_FEE` boss rule (20% payout tax), which was implemented as part of FB-015.

**Root Cause:**
`extortionFee.ts` computes the tax as `Math.floor(profit * taxPct)` where `taxPct = 0.20` and `profit` is in cents. `Math.floor` rounds to the nearest cent but not to the nearest dollar. When `profit` is not a multiple of 500 cents (i.e., not a multiple of $5), the result is a non-dollar-rounded value. Example: a $73 profit (7300 cents) produces a tax of `Math.floor(7300 × 0.20) = 1460 cents = $14.60`, which is a valid cent value but violates the dollar-rounding convention.

**Proposed fix:**
In `extortionFee.ts`, replace `Math.floor(profit * params.taxPct)` with `Math.round(profit * params.taxPct / 100) * 100` to round the fee to the nearest dollar before deducting. Apply the same audit to any other boss rule or crew calculation that applies a percentage to a payout value.

---

## KI-044 — Roll log lacks payout breakdown (additives, multipliers, boss deductions)

**Area:** `packages/shared/src/crapsEngine.ts`, `apps/api/src/routes/rolls.ts`
**Severity:** Low
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
The roll log did not show a breakdown of how the net bankroll change was calculated. The Foreman's 20% extortion fee was silently deducted with no indication in the log. The "Crew Bonus" line showed only a combined total with no crew name attribution. Hype and crew multipliers were collapsed into a single combined multiplier line.

**Root Cause:**
`buildRollReceipt()` had no access to the cascade event list, so it could not attribute additive bonuses to individual crew members. Boss deduction amounts were never passed into the receipt builder.

**Fix:**
- `buildRollReceipt(ctx, events?, bossDeduction?)` — two new optional parameters added.
- When `events` are provided, the generic "Crew Bonus" line is replaced with per-crew attributed lines (e.g., "The Grinder: +$12.50").
- Crew multiplier contributors each get their own `info` line (e.g., "The Whale: 1.20× multiplier"), followed by a separate `Hype: X.XX×` line.
- When `bossDeduction` is provided, a `loss` line appears for the boss cut (e.g., "The Foreman: $15.00 extortion fee").
- `netDelta` now subtracts the boss deduction so the receipt's Net matches the actual bankroll change.
- `rolls.ts` passes `events` and `{ amount: rawPayout − payout, source: boss.name }` to `buildRollReceipt`.

---

## KI-045 — Comp card emojis off by one; The Vig absent from comp HUD and deal-in screen

**Area:** `apps/web/src/components/CompCard.tsx` (`COMP_DEFS`), `apps/web/src/components/CompCardFan.tsx` (threshold map), `apps/web/src/transitions/phases/BossVictoryCompPhase.tsx` (`getCompForBossMarker`)
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
Two related comp display failures, both caused by incomplete integration of The Vig (The Foreman's comp, perkId 4) when FB-015 added the Loading Dock as Floor 1:

1. **Emoji off by one on deal-in screen:** When The Vig is awarded after defeating The Foreman, the `BossVictoryCompPhase` shows the Member's Jacket emoji (🪖) instead of The Vig's icon. When Member's Jacket is awarded (Sarge), it shows the Sea Legs emoji (⚓). Every comp's reveal icon is shifted by one boss position.

2. **The Vig absent from the Comps HUD:** The `CompCardFan` in the game HUD shows comps based on a hardcoded threshold map: `currentMarkerIndex >= 3` → Member's Jacket, `>= 6` → Sea Legs, `>= 9` → Golden Touch. These thresholds were written for the old 3-floor gauntlet. After FB-015, the correct mapping is: `>= 3` → The Vig, `>= 6` → Member's Jacket, `>= 9` → Sea Legs, `>= 12` → Golden Touch. Players entering the VFW Hall after earning The Vig see Member's Jacket in the HUD instead.

**Root Cause:**
- `COMP_DEFS` in `CompCard.tsx` has entries for perkIds 1, 2, 3 only. The Vig (perkId 4) has no entry; `BossVictoryCompPhase` falls through to a fallback. The `getCompForBossMarker` lookup (used by the deal-in screen) still maps markerIndex 2 → Member's Jacket because it was built for the pre-FB-015 boss order where Sarge was at marker 3.
- `CompCardFan`'s threshold-to-comp mapping was not updated when the 4-floor gauntlet restructured the boss positions.

**Fix:**
- Added The Vig to `COMP_DEFS` (perkId 4, threshold 3, icon 💸, sodium-vapor orange accent).
- Shifted all existing thresholds up by one floor: Member's Jacket 3→6, Sea Legs 6→9, Golden Touch 9→12.
- `getCompForBossMarker` logic (`threshold === markerIndex + 1`) now resolves correctly for all four bosses: index 2→The Vig, 5→Member's Jacket, 8→Sea Legs, 11→Golden Touch.
- `CompCardFan` derives earnedComps from `COMP_DEFS` directly, so the HUD fan and the `BossVictoryCompPhase` cinematic both update automatically.
- Updated header comment in `CompCardFan.tsx` to document the 4-floor threshold map.
- Golden Touch is now reachable at threshold 12 (The Executive cleared, marker 12+).

---

## KI-046 — Unlock-gated crew hire costs unattainably high relative to bankroll

**Area:** `packages/shared/src/config.ts` (`RARITY_COST_MULTIPLIERS`), `apps/api/src/routes/pubDraft.ts` (or `crewRoster.ts`)
**Severity:** High
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
Unlock-gated crew (Lefty McGuffin, Old Pro, The Whale, The Mechanic) appear in the pub with hire costs consistently double or more than the player's available bankroll at the time they become recruitable. Confirmed example: The Whale was priced at $2,500 after Marker 6 while the player's bankroll was approximately $1,200.

**Root Cause:**
This is a balance calibration issue introduced by FB-023's dynamic hire cost formula, not a code defect. The formula is `RARITY_COST_MULTIPLIERS[rarity] × Math.floor(markerTargetCents × 0.10)`. `RARITY_COST_MULTIPLIERS` are: Starter: 4×, Common: 6×, Uncommon: 8×, Rare: 12×, Epic: 18×, Legendary: 25×.

The Whale is Legendary. At Marker 6 (target $1,000, maxBet $100): `25 × $100 = $2,500` — exactly what was observed. The multipliers were not calibrated against expected bankroll ranges at each unlock milestone, and the $40 starting bankroll + 4-floor gauntlet structure produce significantly lower bankrolls at each unlock point than the formula assumes.

The unlock-gated crew (IDs 1–15) are likely Rare, Epic, and Legendary — the highest cost tiers — making all of them practically unattainable when they first appear in the pub.

**Proposed fix:**
1. Audit the rarity tiers of Lefty, Old Pro, The Whale, and The Mechanic. Map each to the marker where they unlock and calculate the expected bankroll at that point.
2. Reduce `RARITY_COST_MULTIPLIERS` for Rare, Epic, and Legendary tiers, or introduce a separate multiplier scale for unlock-gated vs. Starter crew, so the hire cost sits at roughly 30–50% of the expected bankroll at the milestone where they appear.
3. Alternatively, add a cost cap in `getCrewHireCost`: the hire cost for unlock-gated crew should not exceed a fixed percentage (e.g., 60%) of `clearedMarkerTargetCents` regardless of rarity.

---

## KI-047 — Flat-payout crew tooltips display stale hardcoded values post-FB-024

**Area:** `apps/web/src/components/CrewPortrait.tsx` (`ABILITY_DESCRIPTIONS`), `apps/api/src/db/seed.ts` (`BRIEF_DESCRIPTIONS`, `DETAILED_DESCRIPTIONS`)
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
After the FB-024 dynamic additive scaling implementation, crew members that pay a flat bonus no longer have fixed payout amounts — their bonus scales with the current marker target via `ADDITIVE_MULT × Math.floor(markerTargetCents × 0.10)`. However, `ABILITY_DESCRIPTIONS` in `CrewPortrait.tsx` was a static lookup table that still showed old hardcoded dollar amounts (e.g., "Pays a flat $100 bonus on a Point Hit"). These values were wrong for every floor except possibly Floor 1.

Additionally, a full audit of `ABILITY_DESCRIPTIONS` uncovered six descriptions that were factually wrong (not just stale dollar amounts):
- **ID 2 (Physics Prof):** Said "swaps a 7 for the active Point number" — actually nudges paired dice ±1 pip toward the active point.
- **ID 7 (Big Spender):** Said "Doubles the Pass Line bet size when Hype > 2×" — actually adds a 1.5× max-bet additive on every Hardway win.
- **ID 12 (Drunk Uncle):** Said "25% chance, −0.1× Hype" — actually 33% chance (d1 ∈ {1,2} of 1–6), −0.25× Hype.
- **ID 14 (Old Pro):** Said "If all others are on cooldown, activates all of them" — actually raises bet ceiling from 10% to 15% of marker target.
- **ID 15 (Lucky Charm):** Said "When alone on the rail, sets a Hype floor of 2.0×" — actually injects +1.0× Hype on every Seven Out regardless of crew configuration; the ≥2.0× next-shooter guarantee follows from the server's `cascadeHypeDelta` mechanism.
- **ID 9 (Whale):** Said "on every roll" — actually fires only on rolls with a positive payout component.

**Fix applied:**
1. **`CrewPortrait.tsx`:** Introduced `CREW_ADDITIVE_MULTS` (ID → ADDITIVE_MULT) and `CREW_ADDITIVE_TRIGGERS` (ID → trigger phrase) lookup tables. Added `getAbilityDesc(crewId, markerTargetCents)` — for additive crew it computes the current dollar amount via `Math.round(ADDITIVE_MULT × Math.floor(markerTargetCents × 0.10) / 100) × 100` and formats a live description; for all others it falls back to `ABILITY_DESCRIPTIONS`. The component reads `currentMarkerIndex` from the store and imports `MARKER_TARGETS` from `@battlecraps/shared` to derive `markerTargetCents`.
2. **`ABILITY_DESCRIPTIONS`:** Corrected all six factually wrong descriptions (IDs 2, 7, 9, 12, 14, 15). Removed additive crew IDs from the static map (they are now fully handled by `getAbilityDesc`).
3. **`seed.ts` `BRIEF_DESCRIPTIONS`:** Replaced "$50"/"$100" for IDs 7 and 8 with "floor-scaled cash bonus" language.
4. **`seed.ts` `DETAILED_DESCRIPTIONS`:** Replaced hardcoded dollar amounts for all additive crew (IDs 7, 8, 17, 18, 23, 24, 25, 28, 29, 30) with "floor-scaled bonus" language so the long-form descriptions in the DB do not become stale again.

---

## KI-048 — Mme. Le Prix Riverboat floor intro describes the wrong mechanic

**Area:** `packages/shared/src/floors.ts` (Riverboat floor / boss description text)
**Severity:** Low
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
On the Riverboat "Floor Intro" screen, Mme. Le Prix's description references "Reversing the Order" — this does not match her actual boss mechanic. Mme. Le Prix's real ability is `DISABLE_CREW`: no crew abilities fire while she is the active boss ("You're on your own in the Salon Privé"). The description appears to be leftover from an earlier design draft for her mechanic and was never corrected when `DISABLE_CREW` was finalized.

**Root Cause:**
Static flavor text in `floors.ts` was authored before Mme. Le Prix's mechanic was locked in and was not updated after the `DISABLE_CREW` rule was implemented.

**Fix applied:**
Updated the Riverboat floor entry in `packages/shared/src/floors.ts`:
- `introLines[2]`: Changed from `'Your crew works differently here. Adapt, or sink.'` to `"In the Salon Privé, she runs a quiet house. Your crew won't say a word in here."` — makes the DISABLE_CREW mechanic explicit without breaking character.
- `bossTeaser`: Changed from `'Mme. Le Prix reverses the order of things. Everything costs more than you think.'` to `"Mme. Le Prix runs a quiet house. Your crew stays silent in the Salon Privé."` — removes the stale "Reversing the Order" draft language and accurately previews crew silencing.

---

## KI-049 — Round-start marker clear not evaluated when bankroll already exceeds target

**Area:** `apps/web/src/store/useGameStore.ts`, `apps/api/src/routes/rolls.ts`
**Severity:** Low
**Status:** Fixed (05/14/2026)
**Source:** Identified during KI-042 implementation (05/13/2026)

**Issue:**
When a player arrives at the start of a new round (IDLE_TABLE / COME_OUT phase) with a bankroll that already meets or exceeds the current marker target — without any bet take-down required — the game still requires them to click Roll. The server's post-bet-change guard (KI-042 fix) will detect the auto-clear on that roll request (`betDelta = 0`, `postBetBankroll = bankrollCents >= markerTarget`) and return `autoClear: true`, but because `rollDice()` increments `_rollKey` before the fetch, the dice animation starts briefly before the transition overlay appears.

This scenario occurs when a player clears marker N with a bankroll significantly above marker N's target — enough to already surpass marker N+1's target — and then reaches the table for the new round. No bet change is needed; the win condition is already met on arrival.

**Root Cause:**
The `removeBet()` → `autoCollect()` trigger (KI-042 fix) only fires when a bet take-down is the event that pushes the bankroll over the marker. There is no equivalent detection at round-start when the bankroll was already sufficient before any player action.

**Fix applied:**
Added proactive `autoCollect()` calls in `useGameStore.ts` at both IDLE_TABLE entry points:
1. **`recruitCrew`** — after the pub-visit response is applied, if `data.status === 'IDLE_TABLE'` and `bankroll >= MARKER_TARGETS[currentMarkerIndex]`, fires `autoCollect()` immediately.
2. **`connectToRun`** — after the hydrated run state is applied (page refresh / reconnect), a `setTimeout(0)` deferred check fires `autoCollect()` if `status === 'IDLE_TABLE' && !isRolling && bankroll >= MARKER_TARGETS[currentMarkerIndex]`. The defer ensures socket handlers are registered before the roll request is sent.

No changes to `rolls.ts` — the server's existing section 4b auto-clear logic (`betDelta = 0`, `postBetBankroll >= markerTarget`) handles the request correctly.

**Related:** KI-042

---

## KI-050 — No boss intro cinematic for The Foreman (Loading Dock, marker 2)

**Area:** `apps/web/src/transitions/TransitionOrchestrator.tsx`
**Severity:** Medium
**Status:** Fixed
**Source:** Playtest observation (05/13/2026)

**Issue:**
When the player clears marker 1 on the Loading Dock and advances to marker 2 (The Foreman), no `BOSS_ENTRY` cinematic plays. The dread phase and rule-briefing screen that appear before Sarge, Mme. Le Prix, and The Executive are absent for The Foreman — the player goes directly from the pub to the table with no introduction.

**Root Cause:**
`applyPendingSettlement()` atomically sets `currentMarkerIndex = 2` AND `pendingTransition = true` in a single Zustand `set()` call. React re-renders and the orchestrator's `useEffect` fires (because `currentMarkerIndex` is in the deps array). The only guard at that point was `if (activeTransition !== null) return` — but `activeTransition` is still `null` during chip-rain. Priority 2 matched (`isBossMarker(2)` = true, `bossEntryShownFor` = null), so the effect prematurely called `setBossEntryShownFor(2)` and `setActiveTransition('BOSS_ENTRY')`. When `triggerChipRainComplete()` subsequently fired, it overwrote `activeTransition` to `'MARKER_CLEAR'`. By the time the player arrived at The Foreman's table after the pub, `bossEntryShownFor === 2` caused Priority 2 to skip permanently — no cinematic.

This same premature-fire path also silently dropped `FLOOR_REVEAL` and `MARKER_INTRO` cinematics for any marker entered during chip-rain (e.g., marker 3's `FLOOR_REVEAL` when crossing from Floor 1 to Floor 2 after a boss victory). The Foreman was the most reliably reproducible case because it occurs in the first uninterrupted session before any page refresh that would reset `bossEntryShownForMarker`.

**Fix applied:**
Added `pendingTransition` to the early-return guard in the transition-detection `useEffect` and to its dependency array in `TransitionOrchestrator.tsx`:

```diff
- if (activeTransition !== null) return;
+ if (activeTransition !== null || pendingTransition) return;
```

When chip rain is running (`pendingTransition = true`), `currentMarkerIndex` has already advanced but the player has not left the table. All transition detection is suppressed until `triggerChipRainComplete()` clears `pendingTransition` — at which point `activeTransition` is simultaneously set to `'MARKER_CLEAR'` or `'BOSS_VICTORY'`, so the second guard (`activeTransition !== null`) takes over and the effect still returns early. Detection fires correctly only after the player clears the celebration and the pub sets `status = 'IDLE_TABLE'` with `activeTransition = null` and `pendingTransition = false`.

**Note:** This is the same class of gap as KI-038 — the FB-015 Loading Dock integration introduced a new first floor but the transition system was designed around the original three-floor structure where boss markers always follow floor-opening markers.

---

## KI-051 — The Vig comp not enforced (crew cash abilities unaffected by +20% bonus)

**Area:** `apps/api/src/routes/rolls.ts`
**Severity:** Medium
**Status:** Fixed
**Source:** Design gap (noted during FB-015 implementation, 05/13/2026)

**Issue:**
The Vig comp (awarded for defeating The Foreman) is described as "crew cash abilities pay out 20% more," but this bonus is not enforced anywhere in the game engine. Players who defeat The Foreman earn the perkId 4 entry in `users.comp_perk_ids` and see The Vig comp card in the HUD, but all crew additive payouts remain at their base values. The Vig is effectively a dead comp with no mechanical effect.

**Root Cause:**
The Vig enforcement was explicitly deferred during FB-015 implementation (marked `TODO` in CLAUDE.md and config comments). The comp perk IDs are stored in `users.comp_perk_ids` and read by the roll route for other comps (e.g., `COMP_PERK_IDS.SEA_LEGS` drives the Sea Legs hype reset), but no equivalent check for `COMP_PERK_IDS.THE_VIG` exists in the cascade or settlement layer.

**Fix applied:**
Post-cascade in `rolls.ts` (step 8b): after `resolveCascade()` returns `finalContext`, detect `COMP_PERK_IDS.THE_VIG` in `user.compPerkIds`. If active and `finalContext.additives > 0`, create `viggedContext` with `additives` scaled by 1.2 (rounded to nearest dollar). `settleTurn()`, `buildRollReceipt()`, and `computeNextState()` all receive `viggedContext` so the boosted additives flow through the full payout formula and state machine. Individual crew `execute()` functions remain unaware of the comp — no cascade signature changes required.

**File:** `apps/api/src/routes/rolls.ts`

---

## KI-052 — Bankroll-below-minimum-bet GAME_OVER no longer triggers

**Area:** `apps/api/src/routes/rolls.ts` (`isBelowMinBet`, section 4b auto-clear guard), `apps/web/src/store/useGameStore.ts` (`removeBet`, `autoCollect`)
**Severity:** High
**Status:** Fixed (05/16/2026)
**Source:** Playtest observation (05/13/2026) — believed regression from KI-042 win-condition changes

**Issue:**
When the player's bankroll drops below the minimum Pass Line bet with no bets remaining on the table, the game no longer transitions to GAME_OVER. The player is stuck: they cannot afford the required bet, the Roll button either does nothing or returns a 422 validation error, and no game-over screen appears.

**How it should work:**
`isBelowMinBet(bankroll, remainingBets, markerIndex)` is called inside `computeNextState()` on every NATURAL, CRAPS_OUT, POINT_HIT, and SEVEN_OUT outcome. When `bankroll < getMinBet(markerIndex) && sumBets(remainingBets) === 0`, the function returns `true` and the roll handler sets `status: 'GAME_OVER'`. This was the working behavior before the KI-042 changes.

**Root Cause (suspected):**
`isBelowMinBet` can only fire if a roll completes through `computeNextState`. The KI-042 changes introduced two new code paths that can leave the player in a sub-minimum bankroll state without going through `computeNextState`:

1. **Server section 4b auto-clear guard** — fires before the dice roll when `postBetBankroll >= markerTarget` and returns early without calling `computeNextState`. While this path is for a winning condition (bankroll ≥ target), a miscalculation in `betDelta` or a same-moment edge case could produce an unexpected early return that bypasses the min-bet check.

2. **Client `removeBet()` → `autoCollect()` path** — when the player takes down a bet, `removeBet()` immediately updates the client-side bankroll and may call `autoCollect()`. If `autoCollect()` fires but the auto-clear check resolves differently on the server (e.g., a race or state mismatch), `isRolling` is reset without any settlement being applied. The client can be left in a state where bankroll is below minimum and no further roll succeeds — yet no GAME_OVER is shown because that transition only comes from a settled roll response.

**Investigation steps:**
1. Confirm the exact scenario that reproduces the stuck state: SEVEN_OUT vs. CRAPS_OUT vs. bet take-down path.
2. Add a server-side guard at the top of the roll handler (after section 4b) that checks `isBelowMinBet(run.bankrollCents, run.bets as Bets, run.currentMarkerIndex)` before attempting validation. If true, immediately persist and return `status: 'GAME_OVER'` — this acts as a catch-all for any stuck state that reaches the roll endpoint.
3. Alternatively, add a client-side check in `removeBet()` and `autoCollect()` completion: after updating bankroll, if `bankroll < getMinBet(currentMarkerIndex) && sumBets(bets) === 0`, dispatch a game-over action without waiting for a server roll.

**Fix applied:**
Added a "section 3c" stuck-state catch-all guard in `rollHandler` (after the boss-hooks setup, before bet validation). Fires when `isBelowMinBet(run.bankrollCents, run.bets, run.currentMarkerIndex)` returns true: immediately persists `status: 'GAME_OVER'`, emits `turn:settled` with `runStatus: 'GAME_OVER'` to the run's WS room, submits a leaderboard entry, and returns a synthetic `autoClear` response. This prevents the 422 validation loop and ensures the game-over screen appears regardless of which code path left the run in the stuck state.

---

## KI-053 — Roll Log does not display The Heirphant's Tribute bankroll deduction

**Area:** `packages/shared/src/crapsEngine.ts`, `apps/api/src/routes/rolls.ts`
**Severity:** Medium
**Status:** Resolved
**Source:** Design review — FB-015 The Lodge integration

**Issue:**
When The Heirphant's Tribute boss rule fires on Floor 5 (The Lodge), it deducts 15% of the player's current bankroll as tribute. This deduction was applied silently — it did not appear as a line item in the Roll Log. The player saw their bankroll drop but had no in-log explanation attributing the loss to The Heirphant, creating confusion that looked identical to a game bug.

This is the same class of omission as the KI-044 fix (Foreman extortion fee not shown in roll log), but that fix only wired up the `bossDeduction` field for `modifyPayout`-style deductions. The Tribute mechanic operates via a `modifySevenOut` hook rather than `modifyPayout`, so it was not captured by `buildRollReceipt()`'s existing `bossDeduction` parameter.

**Fix applied:**
- `buildRollReceipt()` `bossDeduction` parameter changed from a single `{ amount, source }` object to `bossDeductions?: ReadonlyArray<{ amount, source, label }>` — supports any number of deduction sources.
- `rolls.ts` now computes `tributeAmount = newBankroll - tributedBankroll` after the `modifySevenOut` hook fires and pushes `{ amount: tributeAmount, source: boss.name, label: 'tribute' }` into the deductions array alongside any extortion fee entry.
- `netDelta` in the receipt sums all deduction amounts so the Roll Log Net figure matches the actual bankroll delta.

---

## KI-054 — Golden Touch comp has no mechanical effect

**Area:** `apps/api/src/routes/rolls.ts`
**Severity:** Medium
**Status:** Fixed
**Source:** Code audit

**Issue:**
The Golden Touch comp (awarded for defeating The Executive, Floor 4) is defined in config, awarded to `users.comp_perk_ids`, and displayed correctly in the `CompCard` / `CompCardFan` HUD — but it is never enforced in the roll handler. No code in `rolls.ts` reads `COMP_PERK_IDS.GOLDEN_TOUCH` or forces a Natural on the first come-out roll of a new segment. The comp is a dead perk with no mechanical effect, identical to the pre-fix state of The Vig (KI-051).

**Fix applied:**
Added step 6b in `rollHandler` (between RNG and `resolveRoll`): derives `hasGoldenTouch` from `user.compPerkIds`, then when the condition `hasGoldenTouch && run.shooterRollCount === 0 && run.phase === 'COME_OUT'` holds, rejection-samples `rollDice()` until a Natural (7 or 11) is produced. `shooterRollCount` resets to 0 on each SEVEN_OUT, so the guarantee renews for every new shooter with no separate per-run flag needed.

---

## KI-055 — Floor 9 theme visually indistinguishable from Floor 8; intended void aesthetic not implemented

**Area:** `apps/web/src/lib/floorThemes.ts`
**Severity:** Medium
**Status:** Resolved (2026-05-16)
**Source:** Manual playtest observation

**Issue:**
`FLOOR_9_THEME` ("The Null Space") shares its entire accent palette — phosphor green (`#39ff14` / `#20cc00`) and deep-black felts — with `FLOOR_8_THEME` ("The Signal"). At the table, Floors 8 and 9 are visually indistinguishable: same acid-green text, same void-black felt, same screen flashes. The Null Space is intended to communicate finality and total emptiness through a stark, inverted aesthetic (pure white backgrounds, pure black text), but the current token set delivers a second instance of The Signal's alien-terminal look instead.

**Steps to Reproduce:**
1. Begin a run and progress to Floor 8 (marker 21+).
2. Note The Signal's visual identity: void-black felt, acid-green accents, magenta lose-flash.
3. Clear the three Floor 8 markers and enter Floor 9 (The Null Space).
4. Observe that the table, pub screen, and boss room are visually identical to Floor 8 — only the floor name and boss copy change.

**Expected Behavior:**
Floor 9 should present a distinctly different, high-contrast "void" aesthetic: white or near-white backgrounds (`feltPrimary`, `pubBg`, `bossBg`), black typography (`pubTitleColor`, `bossTextColor`), black or dark-grey accents, and a stark, monochromatic palette that signals total absence and finality — sharply distinguished from The Signal's neon-green alien register.

**Actual Behavior:**
Floor 9 renders with the same acid-green accents (`accentBright: '#39ff14'`, `accentPrimary: '#20cc00'`) and near-identical black felts and overlays as Floor 8. No visual differentiation exists between the two floors at runtime.

**Likely Affected Area:**
`apps/web/src/lib/floorThemes.ts` — `FLOOR_9_THEME` constant (lines 536–580). All `FloorTheme` token fields require replacement: felt colors, accent colors, border colors, breathing overlays, screen flashes, pub tokens, and boss tokens. No structural changes to `FloorTheme` interface or `getFloorTheme()` are required; this is a pure token-value change.

**High-Level Fix:**
Replace all color tokens in `FLOOR_9_THEME` with a white-ground, black-ink palette. `feltPrimary` and `feltRail` should shift to near-white (e.g., `#f8f8f8` / `#e8e8e8`); `accentBright` and `accentPrimary` to near-black; `pubBg` and `bossBg` to a flat white or very pale radial; `pubTitleColor` and `bossTextColor` to `#000000` or a very dark grey; screen flashes to a white win-surge and a hard black lose-cut. The `breatheCold` / `breatheWarm` / `breatheHot` overlays should be kept at near-zero opacity to preserve the sense of stillness. Care should be taken with `pubTitleShadow` and `bossTitleShadow` — on a white ground, dark-colored glows (not light ones) are needed. The `feltTexture` SVG should also be updated with matching light-palette values so the woven grain reads on a white surface.

---

## KI-056 — Floor 5–8 comp cards missing emoji and absent from the comp fan HUD

**Area:** `apps/web/src/components/CompCard.tsx` (`COMP_DEFS`, `getCompForBossMarker`), `apps/web/src/components/CompCardFan.tsx`
**Severity:** Medium
**Status:** Resolved
**Source:** Manual playtest observation — FB-015 integration audit (2026-05-15)

**Issue:**
Two related display failures affect all comp awards for Floors 5–8 (The Covenant, Poseidon's Favor, Zero Point, The Frequency). Both share the same root cause: `COMP_DEFS` in `CompCard.tsx` was never extended beyond the four comps that existed before the FB-015 nine-floor expansion. Floor 9 (The Null Space / The Architect) awards no comp by design (`compReward: 'NONE'`) and is excluded from this defect.

**Symptom 1 — Emoji absent on the cinematic comp reveal card:** When a Floor 5–8 boss is defeated, `BossVictoryCompPhase` calls `getCompForBossMarker(snapshot.markerIndex)`. For boss markers at indices 14, 17, 20, and 23, this lookup finds no match in `COMP_DEFS` and returns `undefined`. The component falls back to `compDef?.icon ?? '★'`, so the large cinematic comp card displays a raw `★` character in place of the expected emoji. The `accentColor` also falls back to `theme.bossStarColor`, stripping the comp's intended floor-specific accent.

**Symptom 2 — Comp fan/deck invisible for all Floor 5–8 comps:** `CompCardFan` derives its `earnedComps` array by filtering `COMP_DEFS` against `currentMarkerIndex >= c.threshold`. Because `COMP_DEFS` has no entries with thresholds of 15, 18, 21, or 24, no comp objects pass the filter after Floor 4 is cleared. `earnedComps.length === 0` triggers the component's early `return null`, causing the entire HUD deck to disappear for the remainder of the run. Players who have earned up to four comps (Floors 1–4) see the fan vanish once they cross into Floor 5 territory — the previously visible cards for The Vig, Member's Jacket, Sea Legs, and Golden Touch also become inaccessible because the component unmounts entirely.

**Steps to Reproduce:**
1. Begin a run and defeat any of the first four bosses to earn at least one comp (confirm the fan is visible).
2. Clear all three markers on Floor 4 (The Strip) and defeat The Executive to earn Golden Touch.
3. Progress past marker 12 into Floor 5 (The Lodge) — observe the comp fan disappears from the HUD.
4. Defeat The Hierophant (Floor 5 boss, marker 14). Observe the `BossVictoryCompPhase` cinematic shows `★` instead of the expected comp emoji for The Covenant.

**Expected Behavior:**
- The comp fan HUD persists and grows as Floors 5–8 bosses are defeated, adding entries for The Covenant, Poseidon's Favor, Zero Point, and The Frequency.
- The `BossVictoryCompPhase` cinematic displays the correct icon and accent color for each new comp (e.g., The Covenant should display its designated emoji with its floor-appropriate accent).
- Comps earned on Floors 1–4 remain visible in the fan HUD throughout Floors 5–9.

**Actual Behavior:**
- The comp fan HUD vanishes entirely once the player's `currentMarkerIndex` exceeds 12 (i.e., moves past the last defined `COMP_DEFS` threshold), removing previously earned Floors 1–4 comp cards from view as well.
- The `BossVictoryCompPhase` comp reveal card shows `★` (raw fallback character) in place of the emoji for all five post-Floor-4 comps.

**Likely Affected Area:**
`apps/web/src/components/CompCard.tsx` — `COMP_DEFS` array and `getCompForBossMarker()` lookup. No changes required to `CompCardFan.tsx` or `BossVictoryCompPhase.tsx` — both components consume `COMP_DEFS` correctly; they only misbehave because the data is incomplete.

**High-Level Fix:**
Add four new entries to `COMP_DEFS` for the FB-015 comps: The Covenant (boss marker 14, threshold 15), Poseidon's Favor (marker 17, threshold 18), Zero Point (marker 20, threshold 21), and The Frequency (marker 23, threshold 24). Each entry needs a `perkId` matching the value in `COMP_PERK_IDS`, an appropriate emoji `icon`, and an `accentColor` drawn from the corresponding floor theme token (occult/ancient/cosmic/alien). The `getCompForBossMarker` function's `threshold === markerIndex + 1` logic is already correct and will resolve the new entries automatically once they are present. No changes to `CompCardFan` or `BossVictoryCompPhase` are required. After the fix, verify that previously earned Floors 1–4 comp cards remain visible in the fan HUD when the player progresses to Floor 5 and beyond.

---

## KI-057 — Chip denominations are static and do not scale with floor progression

**Area:** `apps/web/src/components/BettingGrid.tsx` — `BASE_CHIPS`, `FLOOR_CHIPS`, `chipsForFloor()`
**Severity:** High
**Status:** Resolved
**Source:** Manual playtest observation — FB-015 nine-floor integration QA (2026-05-15)

**Issue:**
The chip tray in `BettingGrid.tsx` is driven by two static arrays: `BASE_CHIPS` (five denominations, $1–$50) and `FLOOR_CHIPS` (two additive entries that unlock a $100 chip at Floor 2 and a $500 chip at Floor 3). This scheme was designed for the original three-floor gauntlet and was never updated to cover the FB-015 expansion. By Floor 5 (The Lodge, max bet $4,500) the $500 top chip is already inadequate for reaching the table minimum in fewer than a few clicks; by Floor 9 (The Null Space, max bet $2,000,000) the minimum bet is $333,500 and the maximum is $2,000,000 — both completely unreachable with the current chip rack without hundreds of clicks per bet field. The `$1` and `$5` chips are effectively dead weight from Floor 3 onward. The defect makes mid-to-late game play unacceptably tedious and, on late floors, functionally unplayable via point-and-click alone.

**Steps to Reproduce:**
1. Start a run and progress to any Floor 5+ marker (marker index ≥ 12).
2. Observe the chip tray — it shows denominations up to $500 with $1 chips still present.
3. Attempt to place a bet equal to the Pass Line minimum (e.g., ~$333,500 on Floor 9 marker 0). Count the required clicks at the $500 chip: 667 clicks to reach minimum.
4. Note that no chip denomination larger than $500 is available regardless of floor.

**Expected Behavior:**
The chip tray should always present 4–6 meaningful denominations that bracket the current marker's min/max bet range — the smallest chip should comfortably build toward the minimum bet, and the largest chip should allow a player to reach the table maximum in a reasonable number of clicks (target: ≤ ~10 clicks from zero to max bet). Denomination labels and colors should update dynamically as the player advances through the gauntlet.

**Actual Behavior:**
The chip tray is frozen at a maximum denomination of $500 for all floors above Floor 3. On Floor 9, reaching the minimum bet requires 667+ clicks on the largest available chip. The $1, $5, and $10 chips contribute nothing beyond Floor 2 and add visual noise to the tray.

**Likely Affected Area:**
`apps/web/src/components/BettingGrid.tsx` — specifically the `BASE_CHIPS` constant, the `FLOOR_CHIPS` record, and the `chipsForFloor()` helper. The floor-aware building blocks are already in place (`currentMarkerIndex` is read from `useGameStore` and passed to `chipsForFloor`); only the denomination logic needs to change. `getMaxBet()` and `getMinBet()` in `packages/shared/src/config.ts` are fully floor-aware and should be imported to drive the computation — no changes are needed there.

**High-Level Fix:**
Replace the static `BASE_CHIPS` / `FLOOR_CHIPS` approach with a `chipsForMarker(markerIndex: number): Chip[]` function that derives denominations dynamically from the current marker's `getMaxBet()` value. A clean algorithm: compute the max bet for the marker, then generate 5–6 chip sizes by dividing down from the max bet using a fixed step ratio (e.g., each chip is ~5–10× the next smaller one), rounding each to a round dollar amount. The smallest chip should target roughly `getMinBet() / 8` so a player can fine-tune bets near the minimum; the largest should be at or just below the full max bet. Chip colors can either cycle through a fixed palette or be keyed to named tiers (e.g., white / red / blue / green / black / purple mapped to small / medium / mid-high / high / table-max). Remove `BASE_CHIPS` and `FLOOR_CHIPS` entirely once the dynamic function is in place. The `ChipSelector` component consumes the `chips` array through a local variable already — only the producer (`chipsForFloor`) needs to change. Verify that the smallest chip never rounds to zero cents and that denominations are always strictly increasing.

---

## KI-058 — TIDAL_SURGE pass line input locks during surge; mechanic rhythm unintuitive

**Area:** `apps/web/src/components/BettingGrid.tsx`, `packages/shared/src/bossRules/tidalSurge.ts`, `apps/api/src/routes/rolls.ts` (`computeNextState` — `nextBossCounter` / tide cycle logic), `packages/shared/src/config.ts` (`getMinBet` — TIDAL_SURGE branch)
**Severity:** High (functional bug) / Medium (design defect) — logged together as both will be resolved in a single TIDAL_SURGE rework
**Status:** Open
**Source:** Manual playtest observation — FB-015 nine-floor integration QA (2026-05-15)

**Issue:**
Two related defects observed during Floor 6 (Atlantis / The Sovereign) boss fight:

**1. Pass Line input locked during surge (functional bug — High).**
When the tide counter crosses into the surge window (`bossPointHits >= cycleLength`, i.e., rolls 6–7 of the 7-roll tide cycle), the pass line bet input appears locked — the player cannot add to it. The surge is enforced server-side via `tidalSurgeHooks.validateBet`, which rejects a roll submission if `bets.passLine < surgeMinCents`. The most likely cause is that the client interprets the server's `422` validation error as a signal to disable or freeze the input field entirely, rather than merely enforcing a minimum. The pass line bet should remain editable (subject to the surge minimum); only submissions below the surge floor should be rejected.

**2. Roll-counter tide cycle is opaque and unintuitive (design defect — Medium).**
The current mechanic advances a `bossPointHits` counter on every roll (mod 7: 5 normal rolls + 2 surge rolls). Players have no clear mental model for when the surge will strike — the rhythm is derived from an invisible internal counter, not from any in-world state they can observe. The 15%-of-marker-target surge minimum is also a blunt instrument: at Floor 6 targets ($70k / $120k / $175k) the surge floor reaches $10,500–$26,250, which can constitute a large fraction of a player's bankroll and may feel like an unavoidable death sentence rather than a tension-building challenge.

**Steps to Reproduce (Bug 1):**
1. Start a run and advance to Floor 6, marker 0 (The Sovereign, Atlantis).
2. Begin the boss fight. Roll 5 times from come-out (cycling through the normal tide window).
3. On roll 6, the surge window opens. Observe the pass line bet input — it should be interactable.
4. Attempt to increase the pass line bet to meet the surge minimum.
5. Observe that the input is locked; the player cannot change the bet amount.

**Steps to Reproduce (Design Defect):**
1. Play through the Atlantis boss fight and observe whether you can predict when the surge will activate.
2. Note that no visual indicator, count, or thematic cue communicates the current tide position. The surge arrives without warning.

**Expected Behavior:**
- The pass line input remains fully interactable during the surge window. Submitting a bet below the surge minimum is rejected with an explanatory error message; the player can correct it and try again.
- The mechanic's timing is legible and thematically grounded. Players can anticipate the surge and prepare — either by increasing their bet ahead of it or accepting the risk of being caught short.

**Actual Behavior:**
- The pass line input is non-interactive during the surge, preventing the player from raising their bet to meet the surge minimum. This can strand the player in an unresolvable state.
- The internal roll counter is invisible; surge timing is unpredictable from the player's perspective, making the mechanic feel arbitrary rather than rhythmic.

**Likely Affected Area:**
- `apps/web/src/components/BettingGrid.tsx` — client-side input enable/disable logic likely reads error state or a "surge active" flag and is incorrectly treating it as a full lock rather than a minimum enforcement.
- `packages/shared/src/bossRules/tidalSurge.ts` — `validateBet` hook; the server-side enforcement is structurally correct but the error pathway may be misinterpreted on the client.
- `apps/api/src/routes/rolls.ts` (`computeNextState` — `nextBossCounter`) and `packages/shared/src/config.ts` (`getMinBet` TIDAL_SURGE branch) — the per-roll tide counter and surge detection logic will need to be redesigned to support a binary Low Tide / High Tide state.

**High-Level Fix:**
The TIDAL_SURGE mechanic should be reworked as a binary **Low Tide / High Tide** alternating state rather than a fixed-length roll counter:

- **Low Tide:** Standard floor minimum bet applies (i.e., `getMinBet(markerIndex)` — normal play). The pass line input is unconstrained beyond the standard floor minimum.
- **High Tide:** An elevated minimum applies — a meaningful but beatable multiple of the standard floor minimum (exact multiple TBD by design; a suggested starting point is 3×–5× the standard min, tuned so it is challenging but survivable for a player with healthy bankroll management). The state alternates on a rhythm that feels predictable and thematic — for example, toggling every N point hits rather than every N rolls, or toggling on a fixed dice-roll count that is surfaced explicitly to the player via a UI indicator (e.g., "TIDE RISES IN 2 ROLLS").

Immediate fix for Bug 1 (independent of the redesign): audit `BettingGrid.tsx` to identify what condition disables the pass line input during the surge window and remove any full-lock behavior — the input should remain editable; only the roll submission should be gated.

For the redesign: the `bossPointHits` counter in `computeNextState` will need to be updated to track the new alternating-state model. `tidalSurgeHooks.validateBet` should read the new state representation and enforce the High Tide minimum only when the flag is active. A UI indicator in `BossRoomHeader.tsx` should surface the current tide state and, ideally, the number of rolls until the next transition. The new surge minimum should be derived from `getMinBet(markerIndex)` × a configurable multiplier (stored in `ruleParams`) rather than a percentage of the marker target, so it scales with floor difficulty without becoming prohibitive on high-value markers.

**Design Note (captured from QA session):**
The user-proposed redesign intent is explicitly a binary oscillation — Low Tide (normal) / High Tide (elevated minimum) — rather than the current 5+2 roll-counter model. The High Tide minimum should be high enough to create genuine tension but remain beatable: "a meaningfully elevated minimum bet that creates a tense, challenging moment — but one that remains beatable, not a death sentence." RISING_MIN_BETS (Sarge / Floor 2) already owns the progressively-escalating-minimum design space; TIDAL_SURGE should occupy the rhythmic/oscillating space and feel distinct from it.

---

## KI-059 — Comp card fan overlaps BossRoomHeader during boss fights

**Area:** `apps/web/src/components/CompCardFan.tsx`, `apps/web/src/components/BossRoomHeader.tsx`
**Severity:** Medium
**Status:** Resolved (2026-05-16)
**Source:** Manual playtest observation (2026-05-15)

**Issue:**
During boss fight markers, the `CompCardFan` component covers the left portion of the `BossRoomHeader` banner. The comp card stack renders on top of the boss name, the "HIGH LIMIT ROOM" label, and the red alert visual chrome, partially obscuring the most readable section of the boss bar. The overlap only occurs on boss markers — on non-boss markers the `BossRoomHeader` returns null and the fan's position is uncontested.

**Steps to Reproduce:**
1. Begin a run and defeat at least one boss to earn a comp (any floor).
2. Clear two non-boss markers on the next floor and advance to the boss marker.
3. Observe the `CompCardFan` in the top-left of the `TableBoard` — it sits on top of the left portion of the `BossRoomHeader`, obscuring the boss identity section.
4. Click the comp stack to open the fan; note that expanded cards extend further down into the boss bar region.

**Expected Behavior:**
The comp card fan should be vertically offset to sit below the `BossRoomHeader` when a boss bar is present. In the negative space to the left of the "Battle Craps" title and the bankroll figure — below the boss bar — there is sufficient room to display the fan without any overlap.

**Actual Behavior:**
The comp card fan is anchored at `top-12` (48px from the top of the board container), which was sized to clear the mute button and standard HUD controls only. The `BossRoomHeader` is a `w-full flex-none` block that sits above the board area and can reach approximately 70–80px in height. The 48px offset is not sufficient to clear it, so the fan's top edge begins inside the boss bar's bounding box.

**Likely Affected Area:**
`apps/web/src/components/CompCardFan.tsx` — the `absolute top-12 left-2` positioning of the fan's outermost wrapper `div`. The `BossRoomHeader` height is not a fixed Tailwind class and will vary slightly with content (e.g., the multi-line tide counter in TIDAL_SURGE vs. the simpler MIN BET display). A static additional offset may not be robust across all boss rule variants.

**High-Level Fix:**
The `CompCardFan` needs to read whether a boss bar is currently active and adjust its top offset accordingly. The cleanest approach is to have `CompCardFan` subscribe to `currentMarkerIndex` (already imported via `selectDisplayMarkerIndex`) and call `isBossMarker(currentMarkerIndex)` from `@battlecraps/shared` to detect the boss state. When a boss bar is present, increase the top offset from `top-12` to a value that clears the boss bar's full height — approximately `top-24` or `top-28` depending on final rendered measurements. Alternatively, the `BossRoomHeader` could expose its height via a CSS custom property or a shared layout context so the fan can position itself dynamically regardless of which boss rule variant is active. The simpler static-offset approach is acceptable if verified against all nine boss bar variants (especially TIDAL_SURGE with its multi-line pip row, which is the tallest variant).

---

## KI-060 — Floor Emblem watermark absent on floors 5–9

**Area:** `apps/web/src/components/FloorEmblem.tsx`
**Severity:** Medium
**Status:** Resolved
**Source:** Manual playtest observation — FB-015 nine-floor integration QA (2026-05-15)

**Issue:**
The `FloorEmblem` component renders a semi-transparent casino-table watermark on the felt in the dice travel zone. The component's `FLOOR_CONFIGS` record is keyed 1–4 only. When `floorNum` resolves to 5, 6, 7, 8, or 9, `cfg` is `undefined` and the early-return guard fires — rendering nothing. Floors 5–9 (The Lodge, Atlantis, The Station, The Signal, The Null Space) show a blank dice zone with no identity branding. This is a direct omission from the FB-015 nine-floor expansion: `FloorEmblem.tsx` was not updated when the five new floors were added.

**Steps to Reproduce:**
1. Start a new run and play through to Floor 5 (advance past all three Strip markers, clear the Floor 4 boss fight, and enter The Lodge).
2. Observe the dice travel zone on the `TableBoard` — no floor watermark is present.
3. Repeat for Floors 6–9 (Atlantis, The Station, The Signal, The Null Space) — none display a watermark.

**Expected Behavior:**
Each of the nine floors should display a thematically appropriate `FloorEmblem` watermark on the felt, consistent with the treatment applied to Floors 1–4. The font, color, decorative elements, and copy should reflect each floor's visual identity (e.g., occult motifs for The Lodge, deep-sea for Atlantis, cosmic/industrial for The Station, alien for The Signal, void/digital for The Null Space).

**Actual Behavior:**
`FLOOR_CONFIGS` contains entries only for floors 1–4. For any `floorNum` in the range 5–9, `cfg` is `undefined` and the component returns `null`, leaving the dice zone without any floor identity watermark.

**Likely Affected Area:**
`apps/web/src/components/FloorEmblem.tsx` — the `FLOOR_CONFIGS` record (line 47). The component's render logic and `FloorConfig` interface are well-structured and require no changes; the fix is purely additive: five new entries keyed 5–9 need to be authored and appended to `FLOOR_CONFIGS`.

**High-Level Fix:**
Add five new `FloorConfig` entries to `FLOOR_CONFIGS` in `FloorEmblem.tsx`, one for each of floors 5–9. Each entry should draw from the corresponding floor's established visual identity in `apps/web/src/lib/floorThemes.ts` — matching the accent color, atmosphere, and aesthetic to the theme tokens already defined there (`occult`, `ancient`, `cosmic`, `alien`, `digital`). Font choices should follow the same logic as floors 1–4: select a Google Font (already imported via the project's font stack or added to `index.html`) that evokes the floor's setting — for example, a gothic serif for The Lodge (occult), a weathered display face for Atlantis (ancient), a geometric sans for The Station/Signal (cosmic/alien), and a monospace or glitchy face for The Null Space (digital/void). Decorative elements (`decorTop`, `decorBottom`) and `subLabel` copy should match each floor's thematic language. Colors should be drawn from the existing `floorThemes.ts` accent values at a low opacity (consistent with the 0.18–0.20 opacity range used by floors 1–4) to maintain the watermark's unobtrusive character.

---

## KI-061 — No floor-addition checklist; FB-015 expansion silently broke 8+ floor-scoped sites

**Area:** Cross-cutting — `apps/web/src/components/FloorEmblem.tsx`, `apps/web/src/components/GameOverScreen.tsx`, `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx`, `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx`, `apps/web/src/lib/floorThemes.ts`, `apps/web/src/components/CompCard.tsx`, `apps/web/src/components/BettingGrid.tsx` (chip denominations), `apps/web/src/components/CompCardFan.tsx`
**Severity:** Medium
**Status:** Open
**Source:** Pattern identified during FB-015 nine-floor integration QA pass (2026-05-15)

**Issue:**
When FB-015 expanded the gauntlet from 4 floors to 9 floors, no checklist existed enumerating the files that must be updated when a new floor is added. As a result, at least eight distinct floor-scoped sites were left covering only floors 1–4. Each produced silent visual or functional gaps for floors 5–9 — no build error, no runtime exception, and no automated test caught any of them. The gaps were discovered only through manual QA and were logged individually as KI-055 through KI-060. The root cause is a process defect: floor-scoped hardcoding exists in multiple layers of the codebase (engine config, display data, UI copy, component data tables) with no single document serving as the authoritative "update these N files when a floor is added" checklist.

**Related Issues:** KI-055 (floorThemes.ts floors 5–9 palette gap), KI-056 (COMP_DEFS missing floors 5–8), KI-057 (chip denominations not scaled for floors 5–9), KI-059 (CompCardFan BossRoomHeader overlap), KI-060 (FloorEmblem absent floors 5–9)

**Steps to Reproduce:**
1. Add a hypothetical Floor 10 entry to `packages/shared/src/config.ts` (`GAUNTLET`) and `packages/shared/src/floors.ts` (`FLOORS` registry) only.
2. Navigate to the new floor in a test run.
3. Observe: floor watermark absent (FloorEmblem), incorrect or missing game-over tagline (GameOverScreen), floor count off in tutorial copy (BattleCrapsRulesSection), boss card list truncated (CrewAndBossesSection), missing floor theme tokens (floorThemes.ts), no comp card entry (CompCard/COMP_DEFS), chip denominations unscaled for the new target, comp fan layout potentially broken (CompCardFan).
4. Note that none of these gaps produce a thrown error — they all fail silently or render stale/empty UI.

**Expected Behavior:**
Every floor-scoped data structure, copy string, component config table, and display map should be updated atomically with any new floor entry in the shared config. A canonical checklist document should exist so that any developer adding a floor can verify completeness before merging.

**Actual Behavior:**
No checklist exists. Floor-scoped sites are scattered across the frontend component tree, the tutorial subtree, and the theme library. Each was authored independently and each was independently missed when FB-015 shipped. The pattern recurred across every layer: engine-adjacent config (floorThemes.ts), display data (COMP_DEFS, FLOOR_CONFIGS in FloorEmblem), copy strings (BattleCrapsRulesSection, CrewAndBossesSection, GameOverScreen), layout logic (CompCardFan boss offset), and UX tuning (chip denominations).

**Known Floor-Addition Checklist (as of 2026-05-15):**
The following files have been confirmed to require updates when a new floor is added to the gauntlet. This list should be maintained as the authoritative checklist and moved into a permanent developer-facing doc (e.g., `docs/frameworks/floor-addition-checklist.md`) once ratified.

| File | What to update |
|---|---|
| `packages/shared/src/config.ts` | Add `GAUNTLET` entry (marker targets, boss rule, comp reward) |
| `packages/shared/src/floors.ts` | Add `FLOORS` registry entry (floor name, narrative, `FloorAtmosphere`) |
| `apps/web/src/lib/floorThemes.ts` | Add theme token object for the new floor's atmosphere (accent, glow, particle colors, CSS class names) |
| `apps/web/src/components/FloorEmblem.tsx` | Add entry to `FLOOR_CONFIGS` record (font, copy, colors, decorative elements) |
| `apps/web/src/components/CompCard.tsx` | Add entry to `COMP_DEFS` (emoji, comp name, benefit description) for the comp awarded at the new floor's boss |
| `apps/web/src/components/GameOverScreen.tsx` | Extend `getToneTagline()` floor-range branches and `FLOOR_PIP_THEMES` to cover the new floor |
| `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx` | Extend `FLOOR_NAMES` array and floors map |
| `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx` | Extend boss card list to include the new boss entry |
| `apps/web/src/components/BettingGrid.tsx` | Verify chip denomination constants remain appropriate for the new floor's marker target range |
| `apps/web/src/components/CompCardFan.tsx` | Verify boss-bar offset logic accounts for the new floor's boss rule variant (especially multi-line boss bars) |

**Likely Affected Area:**
All files enumerated in the checklist table above. No single component or module owns the problem — this is a documentation and process gap that manifests as a defect pattern across the entire frontend layer.

**High-Level Fix:**
Two parallel actions are needed. First, extract the checklist table above into a permanent developer document at `docs/frameworks/floor-addition-checklist.md` and link it from the main `CLAUDE.md` architecture section so it is visible during any floor-addition implementation pass. Second, audit `packages/shared/src/config.ts` and `packages/shared/src/floors.ts` to identify whether a TypeScript type or constant could be derived from the canonical floor count — for example, a union type `FloorNum = 1 | 2 | ... | 9` that, if widened to include `10`, would cause a `tsc` error at every floor-scoped lookup site that is not exhaustive. Making floor omissions a compile-time error rather than a silent runtime gap would be the most robust long-term mitigation and would complement the documentation checklist.
