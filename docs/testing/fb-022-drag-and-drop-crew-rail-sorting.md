# Implementation Manifest: FB-022 Drag-and-Drop Crew Rail Sorting

**Status:** Implemented

## Step 1: Create Backend Route & Registration
**Goal**: Create the HTTP POST endpoint for reordering crew members and register it with the Fastify server.

**Files to read**:
- `@apps/api/src/routes/reorder.ts` (Create new)
- `@apps/api/src/server.ts`

**Prompt**:
Create `apps/api/src/routes/reorder.ts` exporting a `reorderPlugin` for Fastify. 
The route should be `POST /runs/:id/crew/reorder` and use `requireClerkAuth` as a preHandler.
Validate the body using Fastify JSON Schema to require `slotOrder`: an array of exactly 5 integers where each is between 0 and 4.
In the handler: Fetch the run, verify ownership (`userId`), and ensure status is not `GAME_OVER`.
Derive `newSlots` by mapping `slotOrder` over `run.crewSlots` (e.g., `slotOrder.map(oldIdx => run.crewSlots[oldIdx])`).
Perform a single DB update on `runs` setting `crewSlots: newSlots` and `updatedAt: new Date()`, with an optimistic lock on `updatedAt`. Return 409 if 0 rows update.
Return HTTP 200 with `{ crewSlots: newSlots }`.

Next, in `@apps/api/src/server.ts`, import `reorderPlugin` from `./routes/reorder.js` and register it on the `app` instance with the prefix `/api/v1` right after the other route registrations.

---

## Step 2: Install Dependencies & Create Zustand Action
**Goal**: Add `@dnd-kit` packages, manage stable sortable IDs to prevent animation snapping, and implement the `reorderCrew` action.

**Files to read**:
- `@apps/web/package.json`
- `@apps/web/src/store/useGameStore.ts`

**Prompt**:
In `@apps/web/package.json`, add to `dependencies` (sorted alphabetically):
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"

In `@apps/web/src/store/useGameStore.ts`:
1. Import `arrayMove` from `@dnd-kit/sortable`.
2. Add `slotIds: string[];` to the `GameState` interface.
3. In the initial state, set `slotIds: ['slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4']`.
4. Inside `connectToRun`, reset `slotIds` to `['slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4']` when loading a new run.
5. Add `reorderCrew(oldIndex: number, newIndex: number): Promise<void>;` to the `GameActions` interface.
6. Implement `reorderCrew`:
   - Extract `runId`, `crewSlots`, and `slotIds`. Return early if no `runId`.
   - Calculate `newSlots = arrayMove(crewSlots, oldIndex, newIndex)` and `newSlotIds = arrayMove(slotIds, oldIndex, newIndex)`.
   - Store `previousSlots = crewSlots` and `previousSlotIds = slotIds`.
   - Optimistically update: `set({ crewSlots: newSlots, slotIds: newSlotIds })`.
   - Calculate the `slotOrder` permutation array: `const slotOrder = Array.from({ length: 5 }, (_, newPos) => previousSlots.findIndex(s => s === newSlots[newPos]));`
   - Fetch `POST /api/v1/runs/${runId}/crew/reorder` passing `slotOrder`.
   - On success, sync state: `set({ crewSlots: data.crewSlots })`.
   - On catch/failure, rollback: `set({ crewSlots: previousSlots, slotIds: previousSlotIds })`.

---

## Step 3: TableBoard DndContext Setup
**Goal**: Wrap the crew rail in context providers, setup sensors, and ensure React tracks DOM nodes using stable `slotIds`.

**Files to read**:
- `@apps/web/src/components/TableBoard.tsx`
- `@apps/web/src/components/CrewPortrait.tsx`

**Prompt**:
In `@apps/web/src/components/CrewPortrait.tsx`, add `sortableId: string;` to `CrewPortraitProps`.

In `@apps/web/src/components/TableBoard.tsx`:
1. Import `DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent` from `@dnd-kit/core`.
2. Import `SortableContext, horizontalListSortingStrategy` from `@dnd-kit/sortable`.
3. Select `reorderCrew`, `slotIds`, and `selectIsCascading` from `useGameStore`.
4. Setup sensors: `const pointerSensor = useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } });` (do the same for `TouchSensor`).
5. Create `const sensors = useSensors(...(isRolling || isCascading ? [] : [pointerSensor, touchSensor]));`.
6. Create `handleDragEnd` callback wrapped in `useCallback` that finds `oldIndex = slotIds.indexOf(event.active.id as string)` and `newIndex = slotIds.indexOf(event.over.id as string)`. Call `void reorderCrew(oldIndex, newIndex)`. Check `!over` or `active.id === over.id` to return early.
7. Wrap the `<div className="flex justify-around items-end gap-1">` (the `crewSlots` mapping) with `<DndContext sensors={sensors} onDragEnd={handleDragEnd}>` and `<SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>`.
8. CRITICAL: In the `crewSlots.map((slot, i) => ...)` loop, change the outer `div` key to `key={slotIds[i]}`.
9. Pass `sortableId={slotIds[i]}` down to `CrewPortrait`.

---

## Step 4: CrewPortrait useSortable Integration
**Goal**: Wire portraits to be draggable and prevent hold-to-fire timer from executing mid-drag.

**Files to read**:
- `@apps/web/src/components/CrewPortrait.tsx`

**Prompt**:
In `@apps/web/src/components/CrewPortrait.tsx`:
1. Import `useSortable` from `@dnd-kit/sortable` and `CSS` from `@dnd-kit/utilities`.
2. Get `isRolling` from `useGameStore`.
3. Call `const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId, disabled: isEmpty || isRolling });`.
4. Define `const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined, touchAction: 'none' };`.
5. CRITICAL FIX: Add a `useEffect` that watches `isDragging`. Inside it: `if (isDragging) { cancelHold(); }`.
6. Apply `ref={setNodeRef}`, `style={style}`, `{...attributes}`, and `{...listeners}` to the outermost wrapper `<div>` of the component.
7. Append to the outermost wrapper `className`: `isDragging ? 'cursor-grabbing' : isEmpty ? '' : 'cursor-grab'`.

--- Implemented ---

## Bug Fix: Snap-Back on Drop (slotOrder null-equality collision)

**Root cause:** The original `slotOrder` computation used `previousSlots.findIndex(s => s === newSlots[newPos])`. When multiple slots contain `null`, every null slot resolves to the index of the *first* null (all pass `null === null`), producing duplicate values (e.g., `[0, 3, 1, 0, 4]`). The server's bijective permutation validator detects the duplicates and returns 422. The store's catch block fires the rollback, reverting the optimistic update — causing the visible snap-back.

**Fix applied in `useGameStore.ts` `reorderCrew`:**
Replace `findIndex` with a mathematical inversion of `arrayMove` semantics:
```typescript
const slotOrder = Array.from({ length: 5 }, (_, newPos): number => {
  if (newPos === newIndex) return oldIndex;
  if (oldIndex < newIndex && newPos >= oldIndex && newPos < newIndex) return newPos + 1;
  if (oldIndex > newIndex && newPos > newIndex && newPos <= oldIndex) return newPos - 1;
  return newPos;
});
```
This is correct regardless of slot contents and requires no object identity comparisons.