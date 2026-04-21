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
**Status:** Open
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
**Status:** Open
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
**Status:** Open
**Source:** Testing session observation

**Issue:**
The comp reveal after a boss victory is currently a static UI element. It appears instantly when the phase mounts, which feels abrupt and lacks the "ceremonial" weight of earning a rare casino comp. It also creates a visual inconsistency with the `CompCardFan` on the main table, which uses a specific "deal-in" animation when cards are added to the stack.

**Proposed fix:**
Integrate the `animate-comp-deal-in` CSS animation into the `BossVictoryCompPhase`. By adding a slight entry delay, we can ensure the player reads the "DEFEATED" header first before the card is "slung" onto the screen with the characteristic spring-overshoot effect.
    1. Update BossVictoryCompPhase.tsx to trigger the comp card's entry via a short state-driven delay after the phase mounts to allow the "DEFEATED" header to register first.
    2. Apply the existing animate-comp-deal-in CSS class to the comp award card container to synchronize the visual language with the card fan used during gameplay.
    3. Stagger the visibility of the "COLLECT & VISIT THE PUB" CTA button so it only appears after the card animation completes, preventing the player from skipping the reveal too quickly.

---

