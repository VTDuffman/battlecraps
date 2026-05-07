# Implementation Manifest — FB-022 — Drag-and-Drop Crew Rail Sorting

## Step 1: Backend Route & Registration
**Goal:** Create the `POST /runs/:id/crew/reorder` HTTP endpoint and register it with Fastify.
**Files:** `apps/api/src/routes/reorder.ts` (new), `apps/api/src/server.ts`

Created `reorderPlugin` — validates a bijective `slotOrder[5]` permutation, performs ownership + GAME_OVER guards, remaps `crewSlots` via `slotOrder.map(i => run.crewSlots[i])`, writes with an optimistic lock on `updatedAt` (409 if 0 rows updated), returns `{ crewSlots }`.

Registered alongside other route plugins in `server.ts` with prefix `/api/v1`.

--- Implemented ---

## Step 2: Install Dependencies & Zustand Action
**Goal:** Add `@dnd-kit` packages, `slotIds` state, and `reorderCrew` action.
**Files:** `apps/web/package.json`, `apps/web/src/store/useGameStore.ts`

Added `@dnd-kit/core ^6.1.0`, `@dnd-kit/sortable ^8.0.0`, `@dnd-kit/utilities ^3.2.2` to dependencies.

In `useGameStore.ts`:
- `import { arrayMove } from '@dnd-kit/sortable'`
- `slotIds: string[]` added to `GameState` (initial + `connectToRun` reset to `['slot-0'…'slot-4']`)
- `reorderCrew(oldIndex, newIndex)` — optimistic update → HTTP → sync from response → rollback on error
- `slotOrder` permutation computed mathematically (NOT via `findIndex` — see bug fix note below)

--- Implemented ---

## Step 3: TableBoard DnD Context
**Goal:** Wrap the crew rail in `DndContext` + `SortableContext`; wire `handleDragEnd`.
**Files:** `apps/web/src/components/TableBoard.tsx`, `apps/web/src/components/CrewPortrait.tsx`

Added `sortableId: string` prop to `CrewPortraitProps`.

In `TableBoard`:
- `PointerSensor` + `TouchSensor` with `{ delay: 150, tolerance: 5 }` activation constraint
- `sensors = useSensors(...(isRolling || isCascading ? [] : [pointerSensor, touchSensor]))` — rail locked during rolls and cascade animations
- `handleDragEnd` resolves old/new indices via `slotIds.indexOf()`, calls `reorderCrew`
- Crew map wrapped in `<DndContext> > <SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>`
- Portrait keys and `sortableId` prop driven by `slotIds[i]`

--- Implemented ---

## Step 4: CrewPortrait `useSortable` Integration
**Goal:** Wire each portrait as a draggable sortable item; prevent fire-countdown mid-drag.
**Files:** `apps/web/src/components/CrewPortrait.tsx`

- `useSortable({ id: sortableId, disabled: isEmpty || isRolling })` — empty and rolling slots not draggable
- `CSS.Transform.toString(transform)` + `transition` applied via inline `style`; `opacity: 0.4` + `zIndex: 50` on `isDragging`; `touchAction: 'none'`
- `useEffect` on `isDragging` — calls `cancelHold()` when drag begins to abort the FIRE countdown
- `{...attributes}` + `{...listeners}` on outermost `<div>`; explicit `tabIndex` placed after `{...attributes}` to win over dnd-kit's default
- `cursor-grab` / `cursor-grabbing` class toggled on drag state

--- Implemented ---

## Bug Fix: Snap-Back on Drop

**Root cause:** `previousSlots.findIndex(s => s === newSlots[newPos])` — when multiple slots are `null`, every null resolves to the first null's index, producing duplicate `slotOrder` values. Server returns 422 → rollback → visual snap-back.

**Fix:** Replaced with mathematical inversion of `arrayMove` semantics — computes the correct permutation from `oldIndex`/`newIndex` alone, with no object-identity comparisons.

--- Implemented ---
