# Implementation Manifest: FB-018 — Playtester Feedback System (Deep Context)

## Step 1: Database Schema Addition
**Goal:** Define the `feedback_submissions` table and its associated TypeScript types for Drizzle ORM.
**Files:** @apps/api/src/db/schema.ts

**Prompt:**
Modify @apps/api/src/db/schema.ts to add the new `feedbackSubmissions` table for the FB-018 Playtester Feedback feature. 

Append the following at the bottom of the file:
1. A new `pgTable` named `feedback_submissions` with fields:
   - `id`: serial, primaryKey
   - `userId`: uuid (must reference `users.id`, onDelete cascade), notNull
   - `type`: text, notNull
   - `rating`: integer
   - `comment`: text, notNull
   - `context`: jsonb
   - `submittedAt`: timestamp with timezone, defaultNow, notNull
2. Export `FeedbackSubmissionRow` and `NewFeedbackSubmission` types inferred from the table.

--- Implemented ---

## Step 2: Startup DDL Migration & Plugin Registration
**Goal:** Apply the database migration on server boot and register the new API route.
**Files:** @apps/api/src/server.ts

**Prompt:**
Modify @apps/api/src/server.ts to integrate the feedback system.

1. At the top with other route imports, add: `import { feedbackPlugin } from './routes/feedback.js';`
2. In the Plugins/Routes section, register it: `await app.register(feedbackPlugin, { prefix: '/api/v1' });`
3. In the Startup migrations section (after the FB-014 leaderboard migration), add a new `db.execute(sql\`...\`)` block for FB-018:
   - `CREATE TABLE IF NOT EXISTS feedback_submissions` matching the schema (id serial primary key, user_id uuid not null references users(id) on delete cascade, type text not null check type in ('bug', 'sentiment', 'idea'), rating integer check rating between 1 and 5, comment text not null, context jsonb, submitted_at timestamptz not null default now()).
   - `CREATE INDEX IF NOT EXISTS feedback_submissions_user_idx ON feedback_submissions (user_id, submitted_at DESC)`.
   - Log `[migrate] feedback_submissions table ensured`.

--- Implemented ---

## Step 3: Feedback API Route
**Goal:** Create the new Fastify endpoint to handle incoming feedback submissions.
**Files:** @apps/api/src/routes/feedback.ts

**Prompt:**
Create a new file @apps/api/src/routes/feedback.ts.

Implement a Fastify plugin `feedbackPlugin` that registers a `POST /` route.
1. Use `requireClerkAuth` preHandler (import from `../lib/clerkAuth.js`).
2. Define a Fastify JSON schema for the body: `type` (enum: bug, sentiment, idea), `rating` (int 1-5), `comment` (string 1-2000), `context` (object). `type` and `comment` are required.
3. In the handler:
   - Call `resolveUserByClerkId(req.user.sub)` (import from `../lib/resolveUser.js`). If not found, throw 401.
   - Insert the body payload into `feedbackSubmissions` (import from `../db/schema.js`) using `db` (import from `../db/client.js`). Map the JSON body to the DB columns.
   - Return `{ ok: true, id: result[0].insertId }`.

--- Implemented ---

## Step 4: Zustand Store Context Snapshot
**Goal:** Add the deep context snapshot mechanics to prevent state erasure upon disconnecting.
**Files:** @apps/web/src/store/useGameStore.ts

**Prompt:**
Modify @apps/web/src/store/useGameStore.ts to support FB-018 feedback context capturing.

1. Near the top, define: 
   `export interface FeedbackContextSnapshot { runId: string | null; currentMarkerIndex: number; bankroll: number; hype: number; crewSlots: StoredCrewSlots; rollHistory: RollReceipt[]; capturedAt: string; }`
2. Add `feedbackContextSnapshot: FeedbackContextSnapshot | null;` to the `GameState` interface.
3. Add `snapshotForFeedback(): void;` and `clearFeedbackSnapshot(): void;` to the `GameActions` interface.
4. In the initial state block, add `feedbackContextSnapshot: null,`.
5. Implement `snapshotForFeedback`: it should `set` `feedbackContextSnapshot` pulling `runId`, `currentMarkerIndex`, `bankroll`, `hype`, `crewSlots`, and taking `rollHistory.slice(0, 10)`. Set `capturedAt` to `new Date().toISOString()`.
6. Implement `clearFeedbackSnapshot`: set `feedbackContextSnapshot` to null.
7. In the `disconnect()` action, add `get().snapshotForFeedback();` at the very beginning of the function BEFORE the `socket.off` calls. Do NOT add `feedbackContextSnapshot` to the `set({})` block that clears state inside `disconnect()`.

--- Implemented --

## Step 5: App Routing for "Back to Title"
**Goal:** Add the route callback to allow users to leave the table mid-game safely.
**Files:** @apps/web/src/App.tsx

**Prompt:**
Modify @apps/web/src/App.tsx to pass a return-to-title handler.

1. In `AuthenticatedApp`, create a new callback:
   `const handleReturnToTitle = useCallback(() => { disconnect(); setShowTitleLobby(true); }, [disconnect]);`
2. Pass `onReturnToTitle={handleReturnToTitle}` to the primary `<TableBoard />` instance located near the bottom of the component (inside `TransitionOrchestrator`). Do not add it to the `<TableBoard />` instances inside `KnowledgeGate` or `TutorialOverlay`.

--- Implemented ---

## Step 6: FeedbackModal Component
**Goal:** Build the standalone React portal form for feedback submission.
**Files:** @apps/web/src/components/FeedbackModal.tsx

**Prompt:**
Create a new file @apps/web/src/components/FeedbackModal.tsx.

Build a functional component accepting `{ isOpen: boolean; onClose: () => void }`.
1. Use `createPortal` to render to `document.body` when `isOpen` is true.
2. Read `feedbackContextSnapshot`, `getToken`, and `clearFeedbackSnapshot` from `useGameStore`.
3. Use local state for `type` (bug|sentiment|idea), `rating` (number|null), `comment` (string), `submitting` (boolean), `submitted` (boolean), and `error` (string|null).
4. Build the form UI with a backdrop that closes the modal on click (if not submitting).
5. Show a character counter for the comment (max 2000).
6. If `feedbackContextSnapshot` exists, display a small read-only disclaimer: "Context attached: Floor ${Math.floor(snap.currentMarkerIndex/3)+1}, Bankroll: $${(snap.bankroll/100).toFixed(2)}, Last ${snap.rollHistory.length} rolls".
7. On submit: fetch POST to `/api/v1/feedback` with the Bearer token. On success, show a confirmation message for 1.5s, then call `onClose()` and `clearFeedbackSnapshot()`.
8. Ensure appropriate Tailwind styling consistent with the app's pixel/retro aesthetic.

--- Implemented ---

## Step 7: TableBoard UI Updates
**Goal:** Add the Bug and "Back to Title" buttons to the main game HUD.
**Files:** @apps/web/src/components/TableBoard.tsx

**Prompt:**
Modify @apps/web/src/components/TableBoard.tsx to integrate FB-018 triggers.

1. Update the component props to accept `onReturnToTitle?: () => void;`.
2. Add local state: `const [feedbackOpen, setFeedbackOpen] = useState(false);` and `const [returnConfirm, setReturnConfirm] = useState(false);`.
3. Extract `snapshotForFeedback` from `useGameStore`.
4. Import `<FeedbackModal>` and render it at the very bottom of the component's JSX return: `<FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />`.
5. In the top HUD (absolute top-2 right-8 or next to the help button), add a bug icon button: `onClick={() => { snapshotForFeedback(); setFeedbackOpen(true); }}`.
6. In the top HUD (absolute top-2 left-2), conditionally render the Back to Title flow if `onReturnToTitle` is provided. If `returnConfirm` is true, show "QUIT? YES NO" buttons. If false, show a "← TITLE" button that sets `returnConfirm(true)`. "YES" calls `setReturnConfirm(false)` and `onReturnToTitle()`. "NO" calls `setReturnConfirm(false)`.

--- Implemented ---

## Step 8: TitleLobbyScreen UI Updates
**Goal:** Add the secondary Feedback entry point for post-session sentiment.
**Files:** @apps/web/src/components/TitleLobbyScreen.tsx

**Prompt:**
Modify @apps/web/src/components/TitleLobbyScreen.tsx to include the feedback trigger.

1. Add local state: `const [feedbackOpen, setFeedbackOpen] = useState(false);`.
2. Import and render `<FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />` at the bottom of the component.
3. In the footer of the screen (near the version or metadata display), add a subtle text button: `submit feedback`. Set its `onClick` to `() => setFeedbackOpen(true)`.

--- Implemented ---