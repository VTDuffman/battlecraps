# FB-022 — Drag-and-Drop Crew Rail Sorting: Technical Design Document

**Status:** Implemented  
**Author:** Staff Engineer  
**Feature Backlog Entry:** `docs/requirements/feature-backlog.md` § FB-022

---

## 1. Overview

Allow players to reorder the 5 active crew slots via drag-and-drop on the crew rail. The cascade executes in slot order (0 → 4), so reordering slots is a meaningful strategic decision. The reorder must persist to the server so the next roll respects the player's layout.

---

## 2. Architectural Decisions

### 2.1 HTTP over WebSocket

The backlog proposes `crew:reorder` as a WebSocket event (client → server). This violates the established architectural contract:

| Direction | Mechanism |
|---|---|
| Client → Server mutations | HTTP (POST/DELETE) |
| Server → Client broadcasts | WebSocket |

All existing mutations (`recruit`, `fire`, `mechanic-freeze`, `roll`) are HTTP. WebSocket is strictly one-way: server pushes state the client didn't explicitly request.

**Decision: New HTTP endpoint** `POST /api/v1/runs/:id/crew/reorder`.

No WebSocket involvement. After a successful HTTP response the store updates local state directly from the response body — the same pattern used by `recruitCrew()` and `fireCrew()`.

### 2.2 dnd-kit Item ID Strategy

`SortableContext` requires a stable `string[]` of item IDs. The 5-slot array is fixed-length and positions are semantically meaningful (slot 0 is always leftmost), so **slot index is the stable ID**.

```
items = ["slot-0", "slot-1", "slot-2", "slot-3", "slot-4"]
```

This array never changes length or order inside `SortableContext`. Each `CrewPortrait` is always rendered with its current position's ID. dnd-kit uses these IDs to compute which slot is `active` and which is `over` in `onDragEnd`, giving us the two indices we need.

#### Empty Slot Behaviour

- **Not draggable** — `useSortable` is marked `disabled` when `crewId === null`. No drag handle renders.
- **Are droppable** — a valid drop target. Dragging crew to an empty slot performs an `arrayMove` into that position, shifting everything in between. Empty slots shift like any other element.

**Why arrayMove (shift) over swap:** swap-on-drop is disorienting for roster ordering. The intuitive mental model is "insert this crew here" — which is shift semantics. `arrayMove` from `@dnd-kit/sortable` implements this correctly.

---

## 3. Backend Route

### 3.1 File: `apps/api/src/routes/reorder.ts` (new)

```
POST /api/v1/runs/:id/crew/reorder
Auth: requireClerkAuth (same preHandler as all other routes)
```

#### Request Body

```typescript
// slotOrder[newPosition] = oldPosition
// A valid permutation of [0, 1, 2, 3, 4]
{ "slotOrder": [2, 0, 1, 3, 4] }
```

The server remaps `run.crewSlots` by: `newSlots = slotOrder.map(oldIdx => run.crewSlots[oldIdx])`.

This approach is safe: the server owns the cooldownState values and derives the new layout entirely from the existing run state. The client cannot inject modified cooldowns.

#### Validation

```
1. slotOrder must be exactly 5 integers.
2. Each value must be in [0, 4] with no duplicates (bijective permutation).
3. run.status must NOT be GAME_OVER (same guard as recruit/fire).
4. Ownership check: run.userId === userId.
```

#### DB Update

Single `db.update(runs).set({ crewSlots: newSlots, updatedAt: new Date() })` with optimistic lock (`WHERE updatedAt = run.updatedAt`). If 0 rows updated → 409 Conflict.

#### Response

```typescript
// HTTP 200
{
  crewSlots: StoredCrewSlots  // the authoritative post-reorder state
}
```

Mirrors the shape returned by `fireCrew` — the store overwrites `crewSlots` from this response.

### 3.2 Registration

Register in `server.ts` alongside the other route plugins:

```typescript
await app.register(reorderPlugin, { prefix: '/api/v1' });
```

---

## 4. Zustand: `reorderCrew` Action

### 4.1 State Addition

No new state fields are required. The existing `crewSlots: StoredCrewSlots` is the only value that changes. `isRolling` already exists as the lock signal.

### 4.2 Action Signature

```typescript
reorderCrew(oldIndex: number, newIndex: number): Promise<void>
```

### 4.3 Implementation

```typescript
async reorderCrew(oldIndex, newIndex) {
  const { runId, crewSlots } = get();
  if (!runId) return;

  // 1. Compute new order via arrayMove (from @dnd-kit/sortable)
  const newSlots = arrayMove(crewSlots, oldIndex, newIndex);

  // 2. Optimistic update — UI feels instant
  const previousSlots = crewSlots;
  set({ crewSlots: newSlots });

  // 3. Build the slotOrder permutation for the server
  // slotOrder[newPos] = oldPos: inverted mathematically from oldIndex/newIndex.
  // NOTE: Do NOT use findIndex — null === null causes duplicate indices for empty slots.
  const slotOrder = Array.from({ length: 5 }, (_, newPos): number => {
    if (newPos === newIndex) return oldIndex;
    if (oldIndex < newIndex && newPos >= oldIndex && newPos < newIndex) return newPos + 1;
    if (oldIndex > newIndex && newPos > newIndex && newPos <= oldIndex) return newPos - 1;
    return newPos;
  });

  try {
    const token = await get().getToken?.();
    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/crew/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({ slotOrder }),
    });

    if (!res.ok) throw new Error(`Reorder failed: ${res.status}`);

    // 4. Sync from server (authoritative)
    const data = await res.json() as { crewSlots: StoredCrewSlots };
    set({ crewSlots: data.crewSlots });

  } catch {
    // 5. Rollback on any failure
    set({ crewSlots: previousSlots });
  }
},
```

> **Note on `slotOrder` derivation:** The initial design used `findIndex` with `===` comparison. This fails when multiple slots are `null` — every null slot resolves to the index of the *first* null, producing duplicate values that the server's permutation validator rejects (422 → rollback → visual snap-back). The shipped implementation computes the inverse of `arrayMove` mathematically using only `oldIndex` and `newIndex`, which is correct regardless of slot contents.

### 4.4 Add to `GameActions` interface

```typescript
reorderCrew(oldIndex: number, newIndex: number): Promise<void>;
```

---

## 5. Frontend Wiring

### 5.1 Dependencies

```
apps/web/package.json additions:
  @dnd-kit/core       ^6.x
  @dnd-kit/sortable   ^8.x
  @dnd-kit/utilities  ^3.x
```

### 5.2 `TableBoard.tsx` — DnD Context

The `DndContext` and `SortableContext` wrap the crew portrait mapping. The existing crew rail section changes minimally.

```tsx
// New imports
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';

// In TableBoard component body
const reorderCrew = useGameStore((s) => s.reorderCrew);
const isRolling   = useGameStore((s) => s.isRolling);

// Sensors — disabled when rolling; 150ms activation delay on both to prevent
// accidental drags from taps/clicks on the betting grid above.
const pointerSensor = useSensor(PointerSensor, {
  activationConstraint: { delay: 150, tolerance: 5 },
});
const touchSensor = useSensor(TouchSensor, {
  activationConstraint: { delay: 150, tolerance: 5 },
});
const sensors = useSensors(
  ...(isRolling ? [] : [pointerSensor, touchSensor])
);

const handleDragEnd = useCallback((event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = parseInt((active.id as string).replace('slot-', ''), 10);
  const newIndex = parseInt((over.id   as string).replace('slot-', ''), 10);
  void reorderCrew(oldIndex, newIndex);
}, [reorderCrew]);

const slotIds = ['slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4'];
```

```tsx
{/* Replace the existing portraits mapping with: */}
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  <SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>
    <div className="flex justify-around items-end gap-1">
      {crewSlots.map((slot, i) => (
        <div key={i} data-slot-index={i}>
          <CrewPortrait
            slotIndex={i}
            sortableId={`slot-${i}`}
            crewId={slot?.crewId ?? null}
            /* ... all existing props unchanged ... */
          />
        </div>
      ))}
    </div>
  </SortableContext>
</DndContext>
```

### 5.3 `CrewPortrait.tsx` — `useSortable` Integration

Add one new prop and the hook.

```typescript
// New prop
sortableId: string;
```

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Inside CrewPortrait component body
const {
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  isDragging,
} = useSortable({
  id:       sortableId,
  disabled: isEmpty || isRolling,  // isRolling read from useGameStore inside the component
});

const style: React.CSSProperties = {
  transform:  CSS.Transform.toString(transform),
  transition,
  opacity:    isDragging ? 0.4 : 1,
  zIndex:     isDragging ? 50  : undefined,
  touchAction: 'none',  // required for Touch sensor
};
```

Apply `ref`, `style`, and `listeners` to the outermost `<div>` returned by `CrewPortrait`. `attributes` goes on the same element for accessibility. The drag handle is the whole portrait frame — no separate handle element needed.

```tsx
<div
  ref={setNodeRef}
  style={style}
  {...attributes}
  {...listeners}
  className={[
    'group relative flex flex-col items-center gap-1 select-none outline-none',
    isTriggering ? 'z-[60]' : '',
    isDragging   ? 'cursor-grabbing' : isEmpty ? '' : 'cursor-grab',
  ].join(' ')}
  tabIndex={onFire ? 0 : -1}
>
```

> **Interaction conflict resolution:** The portrait already has a hold-to-fire (`onPointerDown` / `onPointerUp`) mechanism. The 150ms activation delay on the DnD sensors ensures taps (< 150ms) fire `startHold` normally; sustained holds (≥ 150ms) activate drag instead of the fire countdown. These are mutually exclusive by timing.

---

## 6. Locking and Edge Cases

### 6.1 Roll Lock

Sensors are constructed as an empty array `[]` when `isRolling === true`. This means no drag gesture can begin mid-roll. No separate UI lock overlay is needed — the crew already grays out and loses interactive affordances during rolling.

### 6.2 Cascade Animation Lock

While `cascadeQueue.length > 0`, portraits are animating (scale: 1.5, y: -40). Dragging during a cascade is jarring. Add a second gate:

```typescript
const isCascading = useGameStore(selectIsCascading);
const sensors = useSensors(
  ...(isRolling || isCascading ? [] : [pointerSensor, touchSensor])
);
```

### 6.3 Concurrent Reorder Requests

`reorderCrew` does not guard against double-submission (the rail has no `isReordering` flag). This is acceptable: the optimistic update has already applied locally. If the player somehow fires two drags before the first resolves, the second HTTP call will hit the server after the first has written a new `updatedAt`, and the first call's 409 guard will catch the race. The second call's response is the authoritative state either way.

### 6.4 Pub Screen (TRANSITION status)

The crew rail is not rendered on `PubScreen` — crew reorder is only available at the table. No guard needed in the route or store action beyond the existing status check.

---

## 7. Implementation Phases

Execute in this order — each phase is independently shippable and testable.

### Phase 1: Backend Route (no frontend changes)
1. Create `apps/api/src/routes/reorder.ts` with the handler and Fastify JSON schema.
2. Register in `server.ts`.
3. Run `npm run typecheck` and `npm run build` from root.
4. Manual test with `curl` or a REST client.

### Phase 2: Zustand Action (no UI changes)
1. Add `reorderCrew` to the `GameActions` interface and implementation in `useGameStore.ts`.
2. Import `arrayMove` from `@dnd-kit/sortable` (install packages now if not yet added).
3. Verify TypeScript compiles: `npx tsc --noEmit -w apps/web`.
4. Manual test: open DevTools, call `window.__store.reorderCrew(0, 4)` and confirm optimistic update + server sync.

### Phase 3: Frontend Wiring — DndContext
1. Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to `apps/web/package.json`.
2. Add `DndContext` + `SortableContext` wrapping in `TableBoard.tsx`.
3. Add `sortableId` prop to `CrewPortrait` (no `useSortable` logic yet — just pass-through).
4. Verify layout is pixel-identical to before; no drag behaviour yet.

### Phase 4: CrewPortrait `useSortable` Integration
1. Implement `useSortable` hook in `CrewPortrait.tsx` per §5.3.
2. Verify dragging works at the table.
3. Verify empty slots are not draggable.
4. Verify `isRolling` locks the rail.
5. Verify `isCascading` locks the rail during portrait animations.

---

## 8. File Change Summary

| File | Change |
|---|---|
| `apps/web/package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `apps/api/src/routes/reorder.ts` | **New** — `POST /runs/:id/crew/reorder` handler |
| `apps/api/src/server.ts` | Register `reorderPlugin` |
| `apps/web/src/store/useGameStore.ts` | Add `reorderCrew` to `GameActions` + implementation |
| `apps/web/src/components/TableBoard.tsx` | Add `DndContext` + `SortableContext`; `handleDragEnd` callback |
| `apps/web/src/components/CrewPortrait.tsx` | Add `sortableId` prop; `useSortable` hook wiring |

---

## 9. What Stays Unchanged

- `rolls.ts` — cascade iterates over `crewSlots` in index order; reordering the DB slots is sufficient. No changes needed.
- `cascade.ts` — no changes.
- `schema.ts` — `crewSlots` is already JSONB; column definition unchanged, only row data changes.
- All other components — `BettingGrid`, `DiceZone`, `RollLog`, `ChipRain`, etc.
