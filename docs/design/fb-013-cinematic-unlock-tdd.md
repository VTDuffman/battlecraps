# FB-013 — Cinematic Crew Unlock Experience
## Technical Design Document

**Status:** Pre-implementation  
**Area:** UI / Animation / Store / API  
**Touches:** `apps/api`, `apps/web`, `packages/shared`  
**Author:** Architecture pass — Claude

---

## 1. Overview

Crew unlocks are currently surfaced as a small auto-dismissing toast. This TDD describes a richer, durable unlock ceremony: a drop-and-shake cinematic modal that fires immediately after `unlocks:granted`, a guaranteed pub-draft injection on the very next Pub visit, a persistent acknowledgment queue that survives page refresh, and an end-of-run "dealt hand" recap of every crew unlocked during the session.

### Goals

| Goal | Mechanism |
|---|---|
| Cinematic weight | Drop-in CSS animation + keyframe screen shake on modal land |
| Durability across refresh | `unacknowledged_unlock_ids` persisted to `users` row |
| Guaranteed pub payoff | `guaranteed_draft_ids` persisted to `runs` row |
| End-of-run recap | `crew_unlocked_this_run` on `runs`; new `UnlockRecapPhase` |
| No mid-roll interruption | Modal defers until `!isRolling && cascadeQueue.length === 0` |

---

## 2. Schema Changes

Two new columns on `users`, two new columns on `runs`. All follow existing conventions (integer arrays via `sql` defaults; never floats).

### 2.1 `users` table — `unacknowledgedUnlockIds`

```typescript
// apps/api/src/db/schema.ts  (users table body)
unacknowledgedUnlockIds: integer('unacknowledged_unlock_ids')
  .array()
  .notNull()
  .default(sql`'{}'::integer[]`),
```

**Rationale:** Persists across browser sessions and runs. Each element is a crew ID the player has earned but not yet dismissed via the cinematic modal. Populated by `evaluateUnlocks()`; drained by `POST /api/v1/user/acknowledge-unlock`.

### 2.2 `users` table — `runUnlockHistory` (optional audit)

Not required for MVP. `unlockProgress` already tracks lifetime counts; `unacknowledgedUnlockIds` covers the active queue.

### 2.3 `runs` table — `crewUnlockedThisRun`

```typescript
// apps/api/src/db/schema.ts  (runs table body)
crewUnlockedThisRun: integer('crew_unlocked_this_run')
  .array()
  .notNull()
  .default(sql`'{}'::integer[]`),
```

**Populated by:** `evaluateUnlocks()` whenever a new unlock is written.  
**Read by:** `GET /runs/:id/pub-draft` and the `GAME_OVER` / `VICTORY` recap routes.  
**Reset:** Set to `'{}'` when a new run row is inserted (`POST /runs`). Not reset on reconnect.

### 2.4 `runs` table — `guaranteedDraftIds`

```typescript
// apps/api/src/db/schema.ts  (runs table body)
guaranteedDraftIds: integer('guaranteed_draft_ids')
  .array()
  .notNull()
  .default(sql`'{}'::integer[]`),
```

**Populated by:** `evaluateUnlocks()` — same IDs as the new unlock batch are appended here.  
**Read by:** `GET /runs/:id/pub-draft`.  
**Cleared by:** `GET /runs/:id/pub-draft` as a side effect (atomically with draft generation) so the guarantee applies only to the *next* pub visit, not subsequent ones.

### 2.5 Migration

Add a standalone migration file `apps/api/src/db/migrate-fb013-unlock-cinematic.ts` that:

1. `ALTER TABLE users ADD COLUMN unacknowledged_unlock_ids integer[] NOT NULL DEFAULT '{}'`
2. `ALTER TABLE runs ADD COLUMN crew_unlocked_this_run integer[] NOT NULL DEFAULT '{}'`
3. `ALTER TABLE runs ADD COLUMN guaranteed_draft_ids integer[] NOT NULL DEFAULT '{}'`

No backfill needed — all defaults are empty arrays.

---

## 3. API Changes

### 3.1 Enrich `unlocks:granted` payload — `apps/api/src/lib/unlocks.ts`

The socket event currently emits `{ newUnlockIds, crewNames }`. Replace with a richer shape:

```typescript
// apps/api/src/lib/unlocks.ts

export interface UnlockCrewDetail {
  id:                 number;
  name:               string;
  abilityCategory:    string;
  visualId:           string;
  rarity:             string;
  briefDescription:   string | null;
  unlockDescription:  string;  // the "why they showed up" flavor line
}

// Emitted shape
interface UnlockGrantedPayload {
  newUnlockIds: number[];
  crewDetails:  UnlockCrewDetail[];
}
```

In `evaluateUnlocks()`, after `newUnlocks` is finalized:

1. Look up the full `CrewDefinitionRow` for each ID from `db.select().from(crewDefinitions).where(inArray(crewDefinitions.id, newUnlocks))`.
2. Extend the `db.update(users)` call to also append to `unacknowledgedUnlockIds`:
   ```typescript
   unacknowledgedUnlockIds: sql`${users.unacknowledgedUnlockIds} || ARRAY[${sql.join(newUnlocks.map(sql.param), sql`, `)}]::integer[]`,
   ```
3. Extend the `db.update(runs)` call (or add a second update) to append to `crewUnlockedThisRun` and `guaranteedDraftIds`:
   ```typescript
   crewUnlockedThisRun: sql`${runs.crewUnlockedThisRun} || ...`,
   guaranteedDraftIds:  sql`${runs.guaranteedDraftIds}  || ...`,
   ```
4. Emit enriched payload:
   ```typescript
   getIO()
     .to(`run:${runId}`)
     .emit('unlocks:granted', {
       newUnlockIds: newUnlocks,
       crewDetails:  mappedDetails,
     } satisfies UnlockGrantedPayload);
   ```

These DB writes are still fire-and-forget (same pattern as existing unlock persistence).

### 3.2 `POST /api/v1/user/acknowledge-unlock` — new file `apps/api/src/routes/unlockAck.ts`

**Purpose:** Remove a single crew ID from `users.unacknowledgedUnlockIds`.

```
POST /api/v1/user/acknowledge-unlock
Auth: requireClerkAuth
Body: { crewId: number }
Returns: { remaining: number[] }
```

Implementation sketch:

```typescript
const updated = await db
  .update(users)
  .set({
    unacknowledgedUnlockIds: sql`array_remove(${users.unacknowledgedUnlockIds}, ${crewId})`,
  })
  .where(eq(users.id, userId))
  .returning({ remaining: users.unacknowledgedUnlockIds });
```

Returns the updated array so the client can reconcile without a separate fetch.

### 3.3 `GET /api/v1/runs/:id/pub-draft` — new file `apps/api/src/routes/pubDraft.ts`

**Purpose:** Generate the pub's offer cards respecting `guaranteedDraftIds`. Clear guarantees after generation.

**Draft-size rule:**

```
draftSize = max(3, min(guaranteedCount + 1, 5))
```

- 0 guaranteed → 3 random from available pool
- 1–2 guaranteed → fill up to 3 with randoms
- 3 guaranteed → 4 slots (3 guaranteed + 1 random wildcard)
- 4 guaranteed → 5 slots (4 guaranteed + 1 random)
- ≥5 guaranteed → 5 slots, all guaranteed (player can only seat 5 anyway; this case is practically unreachable in a single run)

**Response shape:**

```typescript
interface PubDraftEntry {
  crewId:         number;
  isGuaranteed:   boolean;  // true = just unlocked; shown with "NEWLY UNLOCKED" badge
}

interface PubDraftResponse {
  draft: PubDraftEntry[];
  // Full CrewRosterEntry data for each, keyed by crewId, so the UI can render cards
  crewData: Record<number, CrewRosterEntry>;
}
```

**Algorithm:**

1. Load run (verify ownership, status must be `TRANSITION`).
2. Read `run.guaranteedDraftIds`.
3. Build eligible random pool: all `crewDefinitions` rows where `isStarterRoster = true OR id IN user.unlockedCrewIds`, minus any already seated in `run.crewSlots`.
4. Shuffle pool (crypto RNG, same rejection-sampling pattern as `lib/rng.ts`).
5. Compute `draftSize`. Prepend guaranteed IDs (deduped, order preserved). Fill remaining slots from pool, skipping any IDs already in guaranteed list.
6. Atomically clear `runs.guaranteedDraftIds = '{}'` in the same transaction (or separate fire-and-forget update, acceptable since this is idempotent on re-fetch).
7. Return draft + full crew data.

**PubScreen migration:** Replace `fetchCrewRoster()` call at pub mount with `fetchPubDraft()` store action. The full crewRoster (all 30 crew) is only needed for the roster browser, not the draft cards.

### 3.4 `GET /runs/:id` and `POST /runs` — hydrate `unacknowledgedUnlocks`

Both endpoints already return run state used by `connectToRun`. Extend the response to include the hydrated acknowledgment queue:

```typescript
// In runs.ts route handlers, after loading user:
const unacknowledgedDetails = await db
  .select()
  .from(crewDefinitions)
  .where(inArray(crewDefinitions.id, user.unacknowledgedUnlockIds));

// Add to response:
unacknowledgedUnlocks: unacknowledgedDetails.map(toUnlockCrewDetail),
```

This ensures that on page refresh, the modal queue is pre-populated without a separate round-trip.

---

## 4. Frontend State Changes — `useGameStore.ts`

### 4.1 Type definitions (add to store file)

```typescript
export interface UnlockPayload {
  id:                 number;
  name:               string;
  abilityCategory:    string;
  visualId:           string;
  rarity:             string;
  briefDescription:   string | null;
  unlockDescription:  string;
}

export interface PubDraftEntry {
  crewId:       number;
  isGuaranteed: boolean;
}
```

### 4.2 State fields — replace `unlockNotification`

```typescript
// REMOVE:
unlockNotification: { crewNames: string[] } | null;

// ADD:
/** FIFO queue of unlocks not yet acknowledged. Head = currently showing modal. */
unacknowledgedUnlocks: UnlockPayload[];

/** All crew unlocked during this run. Used for end-of-run recap. */
crewUnlockedThisRun: UnlockPayload[];

/** Current pub draft cards. null = not yet fetched. */
pubDraft: PubDraftEntry[] | null;

/**
 * True when the UnlockModal should be visible.
 * Derived: unacknowledgedUnlocks.length > 0 && !isRolling && cascadeQueue.length === 0
 * Stored explicitly to avoid tearing — set to true only when a quiet window is detected.
 */
unlockModalReady: boolean;
```

### 4.3 `connectToRun` changes

```typescript
// In the reset block:
unacknowledgedUnlocks: initialState.unacknowledgedUnlocks ?? [],
// crewUnlockedThisRun resets only on a new run:
...(isNewRun && { crewUnlockedThisRun: [] }),
pubDraft:         null,
unlockModalReady: false,
```

### 4.4 `unlocks:granted` socket handler

```typescript
socket.on('unlocks:granted', (payload: { newUnlockIds: number[]; crewDetails: UnlockPayload[] }) => {
  set((state) => ({
    unlockedCrewIds:      [...new Set([...state.unlockedCrewIds, ...payload.newUnlockIds])],
    unacknowledgedUnlocks: [...state.unacknowledgedUnlocks, ...payload.crewDetails],
    crewUnlockedThisRun:   [...state.crewUnlockedThisRun, ...payload.crewDetails],
    // Invalidate pub draft and roster — availability has changed.
    crewRoster:            null,
    pubDraft:              null,
  }));
  // unlockModalReady is NOT set here. It is set by a watch effect once
  // isRolling === false && cascadeQueue.length === 0 (see §5.3).
});
```

### 4.5 New store actions

```typescript
/**
 * Acknowledge the head of the unacknowledgedUnlocks queue.
 * POSTs to /api/v1/user/acknowledge-unlock and pops the head.
 * If the queue becomes empty, clears unlockModalReady.
 */
acknowledgeUnlock(): Promise<void>;

/**
 * Set unlockModalReady = true when conditions are met.
 * Called by TransitionOrchestrator / DiceZone watch effects.
 */
openUnlockModalIfPending(): void;

/**
 * Fetch the pub draft from GET /runs/:id/pub-draft.
 * Called by clearTransition('MARKER_CLEAR' | 'BOSS_VICTORY') instead of fetchCrewRoster().
 */
fetchPubDraft(): Promise<void>;
```

`acknowledgeUnlock` implementation:

```typescript
async acknowledgeUnlock() {
  const head = get().unacknowledgedUnlocks[0];
  if (!head) return;
  const token = await get().getToken?.();
  await fetch(`${API_BASE}/api/v1/user/acknowledge-unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token ?? ''}` },
    body: JSON.stringify({ crewId: head.id }),
  });
  set((state) => {
    const remaining = state.unacknowledgedUnlocks.slice(1);
    return {
      unacknowledgedUnlocks: remaining,
      unlockModalReady: remaining.length > 0,
      // If more are queued, unlockModalReady stays true — next card drops immediately.
    };
  });
},
```

`openUnlockModalIfPending` implementation:

```typescript
openUnlockModalIfPending() {
  const { unacknowledgedUnlocks, isRolling, cascadeQueue } = get();
  if (unacknowledgedUnlocks.length > 0 && !isRolling && cascadeQueue.length === 0) {
    set({ unlockModalReady: true });
  }
},
```

### 4.6 Where `openUnlockModalIfPending` is called

- In `dequeueEvent()` after the queue empties (`cascadeQueue.slice(1).length === 0`).
- In `applyPendingSettlement()` at the very end, after all state is committed (checks the same conditions).
- In a `useEffect` in `TransitionOrchestrator` watching `[isRolling, cascadeQueue.length]`.

This guarantees the modal never interrupts an active animation sequence.

---

## 5. UI / Component Updates

### 5.1 `UnlockModal.tsx` — new file `apps/web/src/components/UnlockModal.tsx`

**Render condition:** `unlockModalReady === true && unacknowledgedUnlocks[0] !== undefined`

**Layout:** Fixed full-screen overlay (`z-[200]`, above all game UI). Dark scrim behind a centered card.

**Card animation sequence:**

```css
/* Drop phase — 400ms spring */
@keyframes unlock-drop {
  0%   { transform: translateY(-120%) scaleY(1.08); opacity: 0; }
  70%  { transform: translateY(4%)    scaleY(0.96); opacity: 1; }
  85%  { transform: translateY(-2%)   scaleY(1.02); }
  100% { transform: translateY(0)     scaleY(1); }
}

/* Shake phase — fires after drop completes (400ms delay) */
@keyframes unlock-shake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-8px) rotate(-1.5deg); }
  30%     { transform: translateX(7px)  rotate(1deg); }
  45%     { transform: translateX(-5px) rotate(-0.8deg); }
  60%     { transform: translateX(4px)  rotate(0.5deg); }
  75%     { transform: translateX(-2px); }
}
```

The outer scrim also pulses a brief white flash on the shake frame to sell the "impact". Implemented with a `_shakeKey` counter + CSS animation re-trigger pattern (identical to existing `_flashKey` in the store).

**Card content (top → bottom):**

| Element | Source field |
|---|---|
| Rarity badge | `payload.rarity` — color-coded per RARITY_ORDER |
| Crew emoji (48px) | `CREW_EMOJI[payload.id]` from `CrewPortrait.js` |
| Crew name (pixel font, 14px) | `payload.name` |
| Unlock flavor line (italic, 7px) | `payload.unlockDescription` |
| Horizontal rule | — |
| Ability brief (8px, muted) | `payload.briefDescription` |
| "GOT IT" CTA button | calls `acknowledgeUnlock()` |

**Queue indicator:** If `unacknowledgedUnlocks.length > 1`, show "1 of N" pip strip at bottom so the player knows more are coming.

**No auto-dismiss.** The player must explicitly click "GOT IT". This is intentional — the unlock is a hard-earned reward, not a notification.

### 5.2 Delete `UnlockNotification.tsx`

The existing `components/UnlockNotification.tsx` is a simple auto-dismiss toast. Remove it and remove its render from `TableBoard.tsx`. Also remove `clearUnlockNotification` action and `unlockNotification` state field.

Remove the `UnlockNotification` import and usage from `TableBoard.tsx`. The modal is rendered at the App.tsx level (see §5.5).

### 5.3 `UnlockRecapPhase.tsx` — new transition phase

`apps/web/src/transitions/phases/UnlockRecapPhase.tsx`

**Data source:** `useGameStore(s => s.crewUnlockedThisRun)`

**Auto-skip condition:** If `crewUnlockedThisRun.length === 0`, call `onComplete()` on mount (inside a `useEffect` with empty deps). This makes it safe to include in all end-of-run transition sequences unconditionally.

**Animation: "dealt hand"**

- Cards start off-screen right, fan in left-to-right with a 150ms stagger.
- Each card "lands" with the same `unlock-shake` keyframe from UnlockModal.
- A subtle screen flash accompanies each card's landing (`_shakeKey` counter pattern).
- After all cards have dealt in, the "CONTINUE" button fades in.

**Card content:** Same layout as UnlockModal card minus the drop animation (the deal-in provides the motion). Cards sit side by side (horizontal scroll if >3).

**Props:** Standard `PhaseComponentProps` (onComplete, celebrationSnapshot).

### 5.4 `GameOverScreen.tsx` changes

No structural changes needed. The GAME_OVER transition intercepts before GameOverScreen mounts (see §6.3). The recap always completes before the game-over screen is visible, so GameOverScreen remains unchanged.

### 5.5 Rendering `UnlockModal` in `App.tsx`

Add a top-level render site in `App.tsx` so the modal overlays the entire app:

```tsx
// In App.tsx, near the bottom of the return JSX:
{unlockModalReady && <UnlockModal />}
```

This ensures the modal appears over transitions, pub screen, and table board alike.

### 5.6 `PubScreen.tsx` changes

Replace the `crewRoster`-based draft UI with `pubDraft`-based cards:

- On mount, call `fetchPubDraft()` instead of `fetchCrewRoster()`.
- Render `pubDraft.length` cards (dynamic — no longer hardcoded 3).
- Cards with `isGuaranteed === true` display a `"✦ NEWLY UNLOCKED"` banner at the top of the card and a highlighted border using the crew's rarity color.
- The guaranteed cards appear first in slot order.

`clearTransition('MARKER_CLEAR' | 'BOSS_VICTORY')` in `useGameStore.ts` should call `fetchPubDraft()` instead of `fetchCrewRoster()`.

---

## 6. Transition Framework Integration

### 6.1 New `TransitionType` entry

Add `'UNLOCK_RECAP'` to the `TransitionType` union in `packages/shared/src/floors.ts`:

```typescript
export type TransitionType =
  | 'MARKER_CLEAR'
  | 'BOSS_VICTORY'
  | 'BOSS_ENTRY'
  | 'TITLE'
  | 'MARKER_INTRO'
  | 'FLOOR_REVEAL'
  | 'VICTORY'
  | 'GAME_OVER'
  | 'UNLOCK_RECAP';  // ← new: standalone recap if needed
```

`'UNLOCK_RECAP'` as a standalone type is kept as a future option but is not used in the primary design — the recap is injected into existing sequences.

### 6.2 Update `TRANSITION_REGISTRY` — `registry.ts`

```typescript
PHASE_COMPONENT_MAP: {
  // … existing entries …
  UnlockRecapPhase,  // ← register
}

TRANSITION_REGISTRY: {
  // VICTORY: inject before existing recap
  VICTORY: [
    { id: 'explosion',   advanceMode: 'auto',  duration: 3000, component: 'VictoryExplosionPhase' },
    { id: 'unlockRecap', advanceMode: 'gated',               component: 'UnlockRecapPhase' },  // ← new
    { id: 'recap',       advanceMode: 'gated',               component: 'VictoryRecapPhase'  },
    { id: 'sendoff',     advanceMode: 'gated',               component: 'VictorySendoffPhase' },
  ],

  // GAME_OVER: populate with the recap phase
  GAME_OVER: [
    { id: 'unlockRecap', advanceMode: 'gated', component: 'UnlockRecapPhase' },  // ← new
  ],
}
```

`UnlockRecapPhase` self-skips when `crewUnlockedThisRun.length === 0` (see §5.3), so it is safe to include unconditionally in all end-of-run sequences.

### 6.3 `GAME_OVER` transition interception — `applyPendingSettlement`

Currently, the GAME_OVER case sets `status: 'GAME_OVER'` directly and routing shows `GameOverScreen` when it detects that status. To intercept for the recap, patch `applyPendingSettlement`:

```typescript
// Existing line:
status: isTransition ? currentStatus : p.runStatus,

// Add AFTER the main set() call:
if (p.runStatus === 'GAME_OVER') {
  set({ activeTransition: 'GAME_OVER', transitionPhaseIndex: 0 });
}
```

Update routing in `App.tsx` (or `TransitionOrchestrator.tsx`): show `GameOverScreen` only when `status === 'GAME_OVER' && activeTransition === null`. While `activeTransition === 'GAME_OVER'`, the `TransitionOrchestrator` handles phase rendering (UnlockRecapPhase). When `clearTransition('GAME_OVER')` fires, it clears `activeTransition` to `null`, and routing falls through to `GameOverScreen`.

Add the `GAME_OVER` case to `clearTransition`:

```typescript
// In clearTransition():
} else if (type === 'GAME_OVER') {
  // Recap complete — clear transition so routing shows GameOverScreen.
  set({ activeTransition: null, transitionPhaseIndex: 0 });
}
```

This requires **no changes** to `GameOverScreen.tsx` itself.

### 6.4 BOSS_VICTORY recap

`BOSS_VICTORY` already has two phases (triumph → comp). The unlock recap should appear after the triumph and before the comp award:

```typescript
BOSS_VICTORY: [
  { id: 'triumph',     advanceMode: 'auto',  duration: 2000, component: 'BossVictoryPhase' },
  { id: 'unlockRecap', advanceMode: 'gated',               component: 'UnlockRecapPhase' },  // ← new
  { id: 'comp',        advanceMode: 'gated',               component: 'BossVictoryCompPhase' },
],
```

---

## 7. Edge Cases & Architectural Decisions

### 7.1 Draft Overflow (≥3 guaranteed unlocks before pub)

**Strict requirement:** expand draft beyond 3 if needed.

```
draftSize = max(3, min(guaranteedCount + 1, 5))
```

| Guaranteed | Draft size | Randoms |
|---|---|---|
| 0 | 3 | 3 |
| 1 | 3 | 2 |
| 2 | 3 | 1 |
| 3 | 4 | 1 |
| 4 | 5 | 1 |
| ≥5 | 5 | 0 |

Always at least 1 random slot (unless physically impossible). The random slot provides discovery value; the guaranteed slots pay off the unlock reward. The pub UI must handle dynamic draft sizes — no hardcoded 3-column grid.

UI consideration: On mobile, cards that overflow the screen width should scroll horizontally. Guaranteed cards display a `"✦ NEWLY UNLOCKED"` banner so the player immediately knows which are their rewards.

### 7.2 Multiple unlocks in a single roll

`evaluateUnlocks` may add multiple IDs to `newUnlocks` in one call. The socket event carries all of them as an array. The store appends all to `unacknowledgedUnlocks` at once. The modal shows them **one at a time** (FIFO), auto-advancing to the next card after "GOT IT". The queue indicator ("1 of N") sets player expectations.

### 7.3 Unlock fires during boss fight transition

The `unlocks:granted` event may arrive while `activeTransition` is set to `BOSS_ENTRY` or `BOSS_VICTORY`. `openUnlockModalIfPending` guards on `!isRolling && cascadeQueue.length === 0`. Additionally, guard against `activeTransition !== null`:

```typescript
openUnlockModalIfPending() {
  const { unacknowledgedUnlocks, isRolling, cascadeQueue, activeTransition } = get();
  if (
    unacknowledgedUnlocks.length > 0 &&
    !isRolling &&
    cascadeQueue.length === 0 &&
    activeTransition === null
  ) {
    set({ unlockModalReady: true });
  }
},
```

The modal defers until transitions complete. Since `dequeueEvent()` and `applyPendingSettlement()` both call `openUnlockModalIfPending`, the check fires naturally at the next quiet window.

### 7.4 Player refreshes before acknowledging

On refresh, `GET /runs/:id` (or `POST /runs` for new run) reads `user.unacknowledgedUnlockIds` and resolves them to full `UnlockCrewDetail` objects, returning them as `unacknowledgedUnlocks` in the response. `connectToRun` initializes the store queue from this data. `openUnlockModalIfPending` is called after hydration completes (in the `TransitionOrchestrator` mount effect). The modal drops within 1–2 render cycles of the game loading.

### 7.5 `crewUnlockedThisRun` vs `unacknowledgedUnlockIds` — two separate concerns

| Field | Scope | Cleared by | Purpose |
|---|---|---|---|
| `users.unacknowledgedUnlockIds` | Cross-run, per-user | Acknowledgment API | Drive the cinematic modal |
| `runs.crewUnlockedThisRun` | This run only | New run insert | Drive the end-of-run recap |

A player who clears the GAME_OVER recap still has `crewUnlockedThisRun` available for display context (it is not cleared on modal acknowledgment). It is reset when a new run begins, not when the recap phase completes.

### 7.6 Unlock during TRANSITION (pub) status

If a prior-run unlock is still unacknowledged when the player enters the pub, the modal is already in the queue. The pub UI is behind the full-screen modal overlay, so it is not interactable until all modals are dismissed. `pubDraft` fetch is non-blocking and can proceed in parallel.

### 7.7 `acknowledgeUnlock` failure handling

If the API call fails, the unlock remains in `users.unacknowledgedUnlockIds` server-side. The optimistic client-side pop should be reverted:

```typescript
// In acknowledgeUnlock():
const head = get().unacknowledgedUnlocks[0];
if (!head) return;
// Optimistic pop
set((state) => ({ unacknowledgedUnlocks: state.unacknowledgedUnlocks.slice(1) }));
try {
  // … fetch …
} catch {
  // Revert on failure so the modal re-shows on next open
  set((state) => ({ unacknowledgedUnlocks: [head, ...state.unacknowledgedUnlocks] }));
}
```

This mirrors the `reorderCrew` rollback pattern already in the store.

### 7.8 `guaranteedDraftIds` idempotency on re-fetch

`GET /runs/:id/pub-draft` clears `guaranteedDraftIds` as a side effect. If the player refreshes the pub screen, the second call finds `guaranteedDraftIds = '{}'` and returns a purely random draft. This is acceptable — the guarantee is "first pub visit", not "every pub visit until hired". The `pubDraft` store field is `null` on reconnect, so the fetch always re-runs on pub mount.

To prevent mid-session double-clear: only clear `guaranteedDraftIds` if it is currently non-empty (add `WHERE array_length(guaranteed_draft_ids, 1) > 0` to the update, or check in application code before the update).

---

## 8. File Change Summary

| File | Action | Notes |
|---|---|---|
| `packages/shared/src/floors.ts` | Update | Add `'UNLOCK_RECAP'` to `TransitionType` union |
| `apps/api/src/db/schema.ts` | Update | Add 3 new columns (users: `unacknowledgedUnlockIds`; runs: `crewUnlockedThisRun`, `guaranteedDraftIds`) |
| `apps/api/src/db/migrate-fb013-unlock-cinematic.ts` | Create | 3-column migration |
| `apps/api/src/lib/unlocks.ts` | Update | Enrich payload; write `crewUnlockedThisRun` + `guaranteedDraftIds` + `unacknowledgedUnlockIds` |
| `apps/api/src/routes/unlockAck.ts` | Create | `POST /api/v1/user/acknowledge-unlock` |
| `apps/api/src/routes/pubDraft.ts` | Create | `GET /api/v1/runs/:id/pub-draft` |
| `apps/api/src/routes/runs.ts` | Update | Include `unacknowledgedUnlocks` in run-load response |
| `apps/api/src/server.ts` | Update | Register `unlockAckPlugin` and `pubDraftPlugin` |
| `apps/web/src/store/useGameStore.ts` | Update | Add `unacknowledgedUnlocks`, `crewUnlockedThisRun`, `pubDraft`, `unlockModalReady`; remove `unlockNotification`; add `acknowledgeUnlock`, `openUnlockModalIfPending`, `fetchPubDraft` actions; update `unlocks:granted` handler; patch `applyPendingSettlement` for GAME_OVER intercept |
| `apps/web/src/components/UnlockModal.tsx` | Create | Drop-and-shake modal |
| `apps/web/src/components/UnlockNotification.tsx` | Delete | Superseded by UnlockModal |
| `apps/web/src/transitions/phases/UnlockRecapPhase.tsx` | Create | Card-dealt end-of-run recap |
| `apps/web/src/transitions/registry.ts` | Update | Register `UnlockRecapPhase`; add to VICTORY, BOSS_VICTORY, GAME_OVER sequences |
| `apps/web/src/App.tsx` | Update | Render `<UnlockModal />` at top level; update routing to check `activeTransition === null` before showing GameOverScreen |
| `apps/web/src/components/PubScreen.tsx` | Update | Use `pubDraft` instead of `crewRoster` for draft cards; handle `isGuaranteed` badge; variable draft size |
| `docs/requirements/feature-backlog.md` | Update | Mark FB-013 in progress / implemented |
