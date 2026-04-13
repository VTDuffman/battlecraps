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
**Status:** Open

**Issue:**
When the player clears a marker, two win signals appear simultaneously: the celebration phase text ("Nice roll — $300 target cleared") and the gold `+$X.XX` delta popup from `DiceZone`. The popup shows the net bankroll change from that single roll (`lastDelta`), which the player is likely to misread as their highest single-roll return, a bonus amount, or some other special reward tied to clearing the marker.

**Proposed fix:**
Suppress the `lastDelta` popup (or replace it with a more contextual label) when the roll result is a marker-clear event — i.e. when `pendingTransition` is true or `celebrationSnapshot !== null` at the moment the delta would render. Alternatively, label it explicitly ("ROLL PROFIT") so its meaning is unambiguous.

---

## KI-003 — "Tap to Continue" on Marker Intro screen is not reliably clickable

**Area:** `apps/web/src/transitions/registry.ts`, `apps/web/src/transitions/phases/MarkerIntroPhase.tsx`
**Severity:** Low
**Status:** Open
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
**Status:** Open
**Source:** Playtester observation

**Issue:**
After clearing a marker and exiting the pub, the gold screen flash and crowd cheer sound from the clearing roll replay on the fresh `TableBoard`. Both signals originate from `applyPendingSettlement()` setting `flashType: 'win'` and incrementing `_flashKey`. Neither field is reset when the celebration phases complete.

Sequence:
1. Clearing roll → `flashType: 'win'`, `_flashKey` increments. Flash and cheer fire correctly.
2. `TableBoard` unmounts when `activeTransition` becomes `MARKER_CLEAR` (PhasePlayer takes over). `useCrowdAudio` unmounts with it.
3. `clearTransition('MARKER_CLEAR')` clears `celebrationSnapshot` and `payoutPops` but **not** `flashType` or `_flashKey`.
4. Player exits pub → `TableBoard` remounts. `useCrowdAudio` mounts fresh and its `useEffect` fires with the stale `_flashKey` (non-zero, bypasses the `=== 0` guard). `flashTypeRef.current` is still `'win'` → `playCheer()` fires again.
5. Simultaneously, `flashType` is still `'win'` → the screen flash overlay renders and its CSS animation replays.

**Proposed fix:**
Add `flashType: null` and `_flashKey: 0` to the `set({...})` call in `clearTransition()` for the `MARKER_CLEAR | BOSS_VICTORY` branch — alongside the `payoutPops: null` already there. One change, kills both symptoms. Same root cause as KI (ChipRain stale-key-on-mount pattern); same fix pattern.

---

## KI-005 — Member's Jacket comp does not show 6th shooter pip in the UI

**Area:** `apps/web/src/components/TableBoard.tsx` (`GameStatus` component, line 396)
**Severity:** Low
**Status:** Open
**Source:** Playtester observation

**Issue:**
After defeating Sarge and receiving the Member's Jacket comp (+1 shooter), the shooter pip display on the table board still shows only 5 dots. The server correctly returns `shooters: 6`, and `recruitCrew()` writes that value to the store — the data is right. But `GameStatus` renders the pip strip with a hardcoded array length of 5:

```tsx
{Array.from({ length: 5 }, (_, i) => ( ... ))}
```

With `shooters = 6`, the coloring condition `i < shooters` lights all 5 dots gold (since 0–4 are all `< 6`), which looks identical to a normal full slate. The 6th dot is never rendered because there's no slot for it.

`PubScreen` handles this correctly — it derives `upcomingShooters = isComped ? 6 : 5` and renders an extra ✦ with a "+1 COMP" label. But that awareness doesn't carry to the table board.

**Proposed fix:**
Change `Array.from({ length: 5 }, ...)` to `Array.from({ length: Math.max(5, shooters) }, ...)`. The baseline stays 5 dots; a 6th renders automatically when `shooters` exceeds 5. The existing coloring logic needs no changes.

---

## KI-008 — Chip rain sound effect lingers after returning from the pub

**Area:** `apps/web/src/hooks/useCrowdAudio.ts` (or equivalent chip rain audio trigger)
**Severity:** Medium
**Status:** Open
**Source:** Playtester observation

**Issue:**
The chip rain sound effect (played when payout chips animate during a win) continues audibly after the player has transitioned through the pub screen and returned to the table board. The visual chip rain has ended but the audio keeps playing, leaving an orphaned sound with no corresponding visual — confusing and immersion-breaking.

This is likely the same stale-key-on-remount pattern as KI-004: `ChipRain` or its audio trigger fires again when `TableBoard` remounts after the pub, because `_popsKey` or a related flag is not cleared during `clearTransition()`. The audio source node may also have a long enough scheduled duration that it outlasts the transition.

**Proposed fix:**
Audit the chip rain audio trigger in `useCrowdAudio.ts` — ensure the sound source node is stopped/disconnected when `payoutPops` is cleared. Also confirm that `_popsKey` is reset to `0` in the `clearTransition()` call for the `MARKER_CLEAR | BOSS_VICTORY` branch (alongside the `payoutPops: null` already there), so the audio trigger effect does not re-fire on `TableBoard` remount. See KI-004 for the closely related visual re-fire fix.

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

**Area:** Crew portrait / roster display components
**Severity:** Low
**Status:** Open
**Source:** Post-FB-012 observation

**Issue:**
After the FB-012 crew expansion (30-crew roster, unlock gating), the 15 new starter crew members (IDs 16–30) render without emoji in the UI. The original 15 crew members (IDs 1–15) display their emoji correctly. The root cause is likely that the emoji lookup table or crew definition data used by the portrait/roster components was not extended to cover the new IDs.

**Proposed fix:**
Audit the emoji mapping used by crew portrait and roster components (likely a record or array keyed by crew ID or name) and confirm all 30 entries are present. Cross-reference against the crew definitions in `packages/shared/src/crew/index.ts` and `apps/api/db/schema.ts` (or seed data) to ensure every crew member has a corresponding emoji assigned.

---

## KI-007 — Crew member tooltips show "Crew #N" and "???" instead of name and description

**Area:** Crew portrait / roster tooltip component
**Severity:** Medium
**Status:** Open
**Source:** Post-FB-012 observation

**Issue:**
Crew member tooltips display a generic placeholder — "Crew #20" style label and "???" for the description — instead of the crew member's actual name and ability text. This affects the new crew members (IDs 16–30) and possibly all 30. The tooltip component is likely falling back to a default when it cannot resolve the crew definition by ID.

**Proposed fix:**
Trace the tooltip's data source — it should be pulling `name` and `description` (or `ability`) from the crew definition registry. Likely the tooltip is receiving only a numeric ID and the lookup against the crew definitions map is failing (undefined) for the new IDs, triggering a fallback render. Ensure the tooltip is wired to the full crew definition object (or that the registry lookup covers all 30 IDs) so `name` and `description` resolve correctly.
