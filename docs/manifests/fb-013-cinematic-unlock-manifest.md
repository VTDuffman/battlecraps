### Implementation Manifest: FB-013 Cinematic Crew Unlock Experience

**Step 1: Database Schema Expansion**
* **Goal:** Persist unacknowledged unlocks, guaranteed pub draft IDs, and run-specific unlocks so they survive page refreshes.
* **Files:** `@apps/api/src/db/schema.ts`
* **Prompt:** Update the schema definitions. In the `users` table, add `unacknowledgedUnlockIds: integer('unacknowledged_unlock_ids').array().notNull().default(sql\`'{}'::integer[]\`)`. In the `runs` table, add `guaranteedPubDraftIds: integer('guaranteed_pub_draft_ids').array().notNull().default(sql\`'{}'::integer[]\`)` and `crewUnlockedThisRun: integer('crew_unlocked_this_run').array().notNull().default(sql\`'{}'::integer[]\`)`.

**Step 2: API Unlock Evaluation Logic**
* **Goal:** Populate the new database arrays when a player earns a new crew member.
* **Files:** `@apps/api/src/lib/unlocks.ts`
* **Prompt:** Modify the `evaluateUnlocks` function. In the block where `hasNewUnlocks` is true and you update the `users` table, append the `newUnlocks` array to the user's `unacknowledgedUnlockIds`. In the same block, issue an update to the `runs` table to append `newUnlocks` to both `guaranteedPubDraftIds` and `crewUnlockedThisRun`.

**Step 3: New API Routes (Ack & Draft Expansion)**
* **Goal:** Add endpoints to acknowledge unlocks and fetch the expanded pub draft with guaranteed appearances.
* **Files:** `@apps/api/src/routes/unlockAck.ts`, `@apps/api/src/routes/pubDraft.ts`, `@apps/api/src/server.ts`
* **Prompt:** Create `unlockAck.ts` with a `POST /api/v1/user/acknowledge-unlock` route that accepts `{ crewId: number }` and removes that ID from the user's `unacknowledgedUnlockIds` array. Create `pubDraft.ts` with a `GET /api/v1/runs/:id/pub-draft` route that reads `guaranteedPubDraftIds`, temporarily expands the draft size beyond 3 if needed to fit them all, fills the rest randomly from the available roster, and then clears `guaranteedPubDraftIds` on the run. Register both plugins in `server.ts`.

**Step 4: Run Data Hydration**
* **Goal:** Expose the unacknowledged queue when the frontend loads or resumes a run.
* **Files:** `@apps/api/src/routes/runs.ts`
* **Prompt:** Update the run initialization and load endpoints (`POST /api/v1/runs` and `GET /api/v1/runs/:id`). Include `unacknowledgedUnlocks` in the response payload, mapped from the user's `unacknowledgedUnlockIds` array.

**Step 5: Frontend Store Management**
* **Goal:** Manage the cinematic unlock queue, pub draft state, and gracefully defer modal drops.
* **Files:** `@apps/web/src/store/useGameStore.ts`
* **Prompt:** Remove `unlockNotification` and `clearUnlockNotification`. Add `unacknowledgedUnlocks: number[]`, `crewUnlockedThisRun: number[]`, `pubDraft: CrewRosterEntry[]`, and `unlockModalReady: boolean` (all initialized empty/false). Add async actions `acknowledgeUnlock` (calls the new ack endpoint) and `fetchPubDraft` (calls the new draft endpoint). Update the `unlocks:granted` socket listener to append new IDs to `unacknowledgedUnlocks` and `crewUnlockedThisRun`. Modify `applyPendingSettlement` to set `unlockModalReady = true` only when `!isRolling` and `pendingCascadeQueue` is empty, ensuring mid-roll interruptions do not happen.

**Step 6: Cinematic Unlock Modal UI**
* **Goal:** Create the drop-and-shake modal and replace the old toast notification.
* **Files:** `@apps/web/src/components/UnlockModal.tsx`, `@apps/web/src/components/UnlockNotification.tsx`, `@apps/web/src/App.tsx`
* **Prompt:** Delete `UnlockNotification.tsx`. Create `UnlockModal.tsx`. It should read `unacknowledgedUnlocks[0]` and `unlockModalReady` from `useGameStore`. If both exist, render a highly z-indexed full-screen overlay. Use framer-motion to animate the modal dropping in from `y: -100vh` to `0`, and on completion, trigger a CSS keyframe screen shake. Show the crew emoji, name, flavor text, and a "Got It" button that calls `acknowledgeUnlock`. Mount `<UnlockModal />` inside `App.tsx` where the old notification was. Update routing in `App.tsx` to ensure `UnlockModal` renders correctly over active transitions.

**Step 7: Unlock Recap Phase Integration**
* **Goal:** Sequence the post-run "dealt hand" recap of newly unlocked crew cards.
* **Files:** `@apps/web/src/transitions/phases/UnlockRecapPhase.tsx`, `@apps/web/src/transitions/registry.ts`
* **Prompt:** Create `UnlockRecapPhase.tsx` conforming to `PhaseComponentProps`. Read `crewUnlockedThisRun` from the store. If empty, immediately call `onAdvance()`. If populated, render a cinematic sequence dealing out each crew card unlocked this run (using `CrewPortrait` or a similar card component) accompanied by a screen shake. Provide a "Continue" button that calls `onAdvance()`. Register it in `registry.ts` under `PHASE_COMPONENT_MAP` and insert it into the `VICTORY`, `BOSS_VICTORY`, and `GAME_OVER` transition arrays.