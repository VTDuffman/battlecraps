# Technical Design Document: FB-018 — Playtester Feedback System (Deep Context)

**Feature ID:** FB-018  
**Status:** Implemented  
**Author:** Claude  
**Date:** 2026-05-07

---

## 1. Overview

FB-018 adds an in-game feedback form where playtesters can report bugs, submit sentiment, or propose ideas. Every submission automatically attaches a **Deep Context payload** — a JSON snapshot of the player's game state at the moment of submission — so defect reports arrive with full diagnostic information rather than vague descriptions.

This TDD resolves three architectural problems that the backlog entry did not fully address:

1. **The Context Erasure Problem** — `disconnect()` wipes `rollHistory`, `bankroll`, and crew state before a TitleLobbyScreen submission can capture them.
2. **The "Back to Title" Gap** — No mechanism currently exists to return a mid-game player to the title lobby without starting a new run.
3. **Trigger Location Ambiguity** — The backlog places the entry point only on `TitleLobbyScreen`, which is the worst possible location for capturing a bug-in-progress.

---

## 2. Proposed Solution & UX Flow

### 2.1 Architecture Decision: Where does the button live?

**Recommendation: Hybrid — primary in TableBoard HUD, secondary on TitleLobbyScreen.**

| Location | Context Available | Best For |
|---|---|---|
| TableBoard HUD bug icon | Full live state | Bug reports (most valuable) |
| TitleLobbyScreen link | Cached snapshot from last run | Post-session sentiment / ideas |

The TableBoard entry point is the critical one. When a player sees a bug, they can tap the bug icon *immediately* — while `rollHistory`, `crewSlots`, `bankroll`, and `hype` are all still live in the Zustand store. The TitleLobbyScreen entry point serves players who want to submit general feedback after their session ends.

### 2.2 Resolving the Context Erasure Problem

**Solution: `snapshotForFeedback()` store action.**

A new Zustand action freezes the current game state into a `feedbackContextSnapshot` field *before* any state is cleared. This action is called in two places:

1. **In `disconnect()`** — so the snapshot survives navigation from TableBoard → TitleLobbyScreen.
2. **Before opening the modal from the TableBoard HUD** — so a non-destructive snapshot is taken at the moment the player taps the bug icon.

`FeedbackModal` always reads from `feedbackContextSnapshot` rather than live state. After a successful submission, `clearFeedbackSnapshot()` is called to reset the field.

### 2.3 UX Flow

```
[TableBoard HUD] — Bug icon button
  → snapshotForFeedback()
  → FeedbackModal opens (reads from snapshot)
  → Player fills form → submits → POST /api/v1/feedback
  → Success message → clearFeedbackSnapshot() → modal closes

[TableBoard HUD] — "Back to Title" button  (new)
  → Abandon confirmation dialog
  → disconnect() [which internally calls snapshotForFeedback() first]
  → setShowTitleLobby(true)

[TitleLobbyScreen] — "Submit Feedback" link
  → FeedbackModal opens (reads from feedbackContextSnapshot, may be null if cold session)
  → Player fills form → submits → POST /api/v1/feedback
  → Success message → clearFeedbackSnapshot() → modal closes
```

---

## 3. Database Schema Addition

### 3.1 New Table: `feedback_submissions`

Add to `apps/api/src/db/schema.ts`:

```typescript
export const feedbackSubmissions = pgTable('feedback_submissions', {
  id:          serial('id').primaryKey(),
  userId:      integer('user_id').references(() => users.id).notNull(),
  type:        text('type').notNull(),    // 'bug' | 'sentiment' | 'idea'
  rating:      integer('rating'),         // 1–5, nullable
  comment:     text('comment').notNull(),
  context:     jsonb('context'),          // FeedbackContextSnapshot JSON
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
});

export type FeedbackSubmissionRow = typeof feedbackSubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbackSubmissions.$inferInsert;
```

**Note:** `userId` is NOT NULL. All playtesters are authenticated via Clerk before they can play, so anonymous submissions are not a supported path.

### 3.2 Startup DDL Migration in `server.ts`

Add after the existing `leaderboard_entries` migration block:

```typescript
// FB-018: feedback_submissions table.
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS feedback_submissions (
    id           serial      PRIMARY KEY,
    user_id      integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         text        NOT NULL CHECK (type IN ('bug', 'sentiment', 'idea')),
    rating       integer     CHECK (rating BETWEEN 1 AND 5),
    comment      text        NOT NULL,
    context      jsonb,
    submitted_at timestamptz NOT NULL DEFAULT now()
  )
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS feedback_submissions_user_idx
    ON feedback_submissions (user_id, submitted_at DESC)
`);
app.log.info('[migrate] feedback_submissions table ensured');
```

---

## 4. API Route Design

### New File: `apps/api/src/routes/feedback.ts`

**Endpoint:** `POST /api/v1/feedback`  
**Auth:** `requireClerkAuth` (same pattern as `leaderboard.ts`)  
**Validation:** Fastify JSON Schema (consistent with existing routes — no Zod on the API side currently)

#### Request Body Schema

```typescript
const feedbackBodySchema = {
  type: 'object',
  properties: {
    type:    { type: 'string', enum: ['bug', 'sentiment', 'idea'] },
    rating:  { type: 'integer', minimum: 1, maximum: 5 },
    comment: { type: 'string', minLength: 1, maxLength: 2000 },
    context: { type: 'object' },
  },
  required: ['type', 'comment'],
  additionalProperties: false,
} as const;
```

#### Handler Logic

```
1. requireClerkAuth → resolveUserByClerkId → get DB user row (user.id)
2. Validate body (Fastify schema handles this automatically)
3. INSERT INTO feedback_submissions (user_id, type, rating, comment, context)
4. Return { ok: true, id: inserted row id }
```

#### Error Cases

| Status | Condition |
|---|---|
| 400 | Body fails schema validation |
| 401 | Missing or invalid Clerk JWT |
| 500 | DB insert failure (logged, generic message returned) |

#### Route Registration in `server.ts`

```typescript
import { feedbackPlugin } from './routes/feedback.js';
// ...
await app.register(feedbackPlugin, { prefix: '/api/v1' });
```

---

## 5. State Management (Zustand)

### 5.1 New Type: `FeedbackContextSnapshot`

Add to `useGameStore.ts` (alongside the other interface definitions near the top):

```typescript
export interface FeedbackContextSnapshot {
  runId:              string | null;
  currentMarkerIndex: number;
  bankroll:           number;
  hype:               number;
  crewSlots:          StoredCrewSlots;
  rollHistory:        RollReceipt[];  // capped to last 10 entries
  capturedAt:         string;         // ISO timestamp
}
```

### 5.2 New State Field

Add to `GameState` interface:

```typescript
/** Snapshot of game state for the feedback modal. Set before disconnect() clears state.
 *  Also set proactively when the in-game bug icon is tapped. */
feedbackContextSnapshot: FeedbackContextSnapshot | null;
```

Initial value: `feedbackContextSnapshot: null`

### 5.3 New Actions

Add to `GameActions` interface and implement:

**`snapshotForFeedback()`** — non-destructive, captures current live state:
```typescript
snapshotForFeedback() {
  const s = get();
  set({
    feedbackContextSnapshot: {
      runId:              s.runId,
      currentMarkerIndex: s.currentMarkerIndex,
      bankroll:           s.bankroll,
      hype:               s.hype,
      crewSlots:          s.crewSlots,
      rollHistory:        s.rollHistory.slice(0, 10),
      capturedAt:         new Date().toISOString(),
    },
  });
},
```

**`clearFeedbackSnapshot()`** — called after successful submission:
```typescript
clearFeedbackSnapshot() {
  set({ feedbackContextSnapshot: null });
},
```

### 5.4 Modify `disconnect()`

Call `snapshotForFeedback()` at the top of `disconnect()` before the `set({...})` clear call:

```typescript
disconnect() {
  // Snapshot before clearing so TitleLobbyScreen can still attach context.
  get().snapshotForFeedback();

  socket.off('cascade:trigger');
  // ... existing off() calls ...
  socket.disconnect();

  set({
    runId: null,
    // ... existing clear fields — no change here ...
    rollHistory: [],
    socketStatus: 'disconnected',
  });
},
```

**Note:** `feedbackContextSnapshot` is intentionally NOT included in the `disconnect()` clear set. It must survive the wipe so TitleLobbyScreen can read it.

---

## 6. App.tsx Routing: "Back to Title" Button

### 6.1 New Handler in `AuthenticatedApp`

```typescript
const handleReturnToTitle = useCallback(() => {
  disconnect();
  setShowTitleLobby(true);
}, [disconnect]);
```

`disconnect()` already calls `snapshotForFeedback()` internally (per §5.4), so no extra work is needed here.

### 6.2 Prop Drilling

Pass the new prop to `TableBoard` in all three render locations where it appears:

```tsx
// ── Game screens render (line ~443) ──
<TableBoard onNewRun={() => void bootstrap(true)} onReturnToTitle={handleReturnToTitle} />

// ── KnowledgeGate render (line ~412) ──
// TableBoard here has no HUD buttons visible due to tutorial overlay; pass undefined.
<TableBoard />

// ── TutorialOverlay render (line ~433) ──
<TableBoard />
```

---

## 7. Component Breakdown

### 7.1 `FeedbackModal` — New File

**Path:** `apps/web/src/components/FeedbackModal.tsx`

**Props:**
```typescript
interface FeedbackModalProps {
  isOpen:   boolean;
  onClose:  () => void;
}
```

**Reads from store:** `feedbackContextSnapshot`, `getToken`, `clearFeedbackSnapshot`  
**Does NOT accept context as a prop** — always reads from Zustand so the modal is location-agnostic.

**Local state:** `type: 'bug' | 'sentiment' | 'idea'`, `rating: number | null`, `comment: string`, `submitting: boolean`, `submitted: boolean`, `error: string | null`

**Rendering:**
- Rendered as a `createPortal` to `document.body` (avoids z-index conflicts in both TableBoard and TitleLobbyScreen contexts).
- Backdrop click closes (when not submitting).
- On submit: POST to `${API_BASE}/api/v1/feedback` with bearer token from `getToken()`.
- On success: show confirmation message for 1.5s, then call `onClose()` + `clearFeedbackSnapshot()`.
- Context display: if `feedbackContextSnapshot` is non-null, show a read-only "Context will be attached" summary line (floor, bankroll, last N rolls). This reassures the user that diagnostic data is included without overwhelming the form.

**Character counter** on the comment textarea (2000-char limit).

### 7.2 `TableBoard.tsx` Modifications

**Updated props:**
```typescript
export const TableBoard: React.FC<{
  onNewRun?:        () => void;
  onReturnToTitle?: () => void;
}> = ({ onNewRun, onReturnToTitle }) => {
```

**New local state:**
```typescript
const [feedbackOpen,    setFeedbackOpen]    = useState(false);
const [returnConfirm,   setReturnConfirm]   = useState(false);
const snapshotForFeedback = useGameStore((s) => s.snapshotForFeedback);
```

**Bug icon button** (in the top HUD, to the right of the existing `?` button):
```tsx
<button
  type="button"
  onClick={() => { snapshotForFeedback(); setFeedbackOpen(true); }}
  className="absolute top-2 right-8 z-10 ..."
  aria-label="Submit feedback"
>
  🐛
</button>
```

**"Back to Title" button** (in the top HUD, left of screen — parallel to the "New Run" button):
```tsx
{onReturnToTitle && (
  returnConfirm ? (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
      <span className="font-pixel text-[6px] text-yellow-400/70">QUIT?</span>
      <button onClick={() => { setReturnConfirm(false); onReturnToTitle(); }} ...>YES</button>
      <button onClick={() => setReturnConfirm(false)} ...>NO</button>
    </div>
  ) : (
    <button onClick={() => setReturnConfirm(true)} ...>← TITLE</button>
  )
)}
```

**FeedbackModal instance** at the bottom of the JSX return:
```tsx
<FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
```

**DnD lock guard:** `returnConfirm` does not need to affect `sensors` — it's a UI-only confirmation that doesn't prevent the drag sensor from being active (unlike `isRolling` which locks the whole rail).

### 7.3 `TitleLobbyScreen.tsx` Modifications

**New prop:**
```typescript
onFeedback: () => void;
```

**Trigger:** A small "Submit Feedback" text link in the footer area, near the existing version number. Not prominent — this is a utility action, not a primary CTA.

```tsx
<button
  type="button"
  onClick={onFeedback}
  className="font-pixel text-[8px] text-white/30 hover:text-white/60 transition-colors"
>
  submit feedback
</button>
```

**FeedbackModal instance** at the bottom of TitleLobbyScreen's JSX:
```tsx
<FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
```

TitleLobbyScreen manages its own `feedbackOpen` boolean locally; `onFeedback` is not needed as a prop — the modal trigger and state can live entirely within `TitleLobbyScreen`. Remove the `onFeedback` prop and manage it internally:

```typescript
const [feedbackOpen, setFeedbackOpen] = useState(false);
// ...
<button onClick={() => setFeedbackOpen(true)}>submit feedback</button>
<FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
```

**App.tsx does not need to manage feedback state for TitleLobbyScreen at all.**

---

## 8. Step-by-Step Implementation Plan

| Step | File | Action |
|---|---|---|
| 1 | `apps/api/src/db/schema.ts` | Add `feedbackSubmissions` table + `FeedbackSubmissionRow` / `NewFeedbackSubmission` types |
| 2 | `apps/api/src/server.ts` | Add `CREATE TABLE IF NOT EXISTS feedback_submissions` migration block + register `feedbackPlugin` |
| 3 | `apps/api/src/routes/feedback.ts` | **New file.** `POST /api/v1/feedback` — auth, validate, insert, return `{ ok: true, id }` |
| 4 | `apps/web/src/store/useGameStore.ts` | Add `FeedbackContextSnapshot` type + `feedbackContextSnapshot` state field (null init) + `snapshotForFeedback()` + `clearFeedbackSnapshot()` actions + modify `disconnect()` to call `snapshotForFeedback()` before clearing |
| 5 | `apps/web/src/App.tsx` | Add `handleReturnToTitle` callback + pass `onReturnToTitle={handleReturnToTitle}` to the game-screens `<TableBoard>` |
| 6 | `apps/web/src/components/TableBoard.tsx` | Add `onReturnToTitle?` prop + `feedbackOpen` + `returnConfirm` local state + bug icon button + "Back to Title" button + `<FeedbackModal>` instance |
| 7 | `apps/web/src/components/FeedbackModal.tsx` | **New file.** Form component with portal rendering, Zustand integration, POST submit |
| 8 | `apps/web/src/components/TitleLobbyScreen.tsx` | Add `feedbackOpen` local state + "submit feedback" text link + `<FeedbackModal>` instance |

**TypeScript check after each backend step:** `npx tsc --noEmit` from `apps/api`  
**TypeScript check after each frontend step:** `npx tsc --noEmit` from `apps/web`  
**Full build verification before commit:** `npm run build` from repo root

---

## 9. What This Design Does NOT Include

- **Admin view for reading submissions.** Feedback goes to the DB. The developer reads it via Drizzle Studio (`npm run db:studio`) or a direct SQL query. No in-game admin UI.
- **Rate limiting on `POST /api/v1/feedback`.** Out of scope for a playtester audience where abuse is not a concern.
- **Guest / unauthenticated feedback.** All playtesters are authenticated; the `userId NOT NULL` constraint is correct.
- **Email notifications on submission.** Future enhancement if volume warrants it.
