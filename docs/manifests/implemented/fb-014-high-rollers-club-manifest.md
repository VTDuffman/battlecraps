# Implementation Manifest: FB-014 — High Roller's Club & Leaderboards

## Step 1: Shared Types
**Goal:** Add `LeaderboardEntry`, `GlobalLeaderboardResponse`, and `PersonalLeaderboardResponse` to the shared package so both API and web can import them with no circular deps.
**Files:**
- `@packages/shared/src/types.ts`
- `@packages/shared/src/index.ts`

**Prompt:**
In `@packages/shared/src/types.ts`, append the following interfaces at the end of the file:

```ts
export interface LeaderboardEntry {
  id: string; runId: string; userId: string; displayName: string;
  finalBankrollCents: number; highestRollAmplifiedCents: number;
  highestMarkerIndex: number; shootersRemaining: number;
  crewLayout: ({ id: number; name: string } | null)[];
  didWinRun: boolean; createdAt: string;
}
export interface GlobalLeaderboardResponse {
  winners: LeaderboardEntry[]; nonWinners: LeaderboardEntry[];
}
export interface PersonalLeaderboardResponse { entries: LeaderboardEntry[]; }
export type LeaderboardResponse = GlobalLeaderboardResponse | PersonalLeaderboardResponse;
```

Ensure all four are barrel-exported from `@packages/shared/src/index.ts`.

---

## Step 2: Database Schema
**Goal:** Add `highestRollAmplifiedCents` to the `runs` table and create the `leaderboard_entries` table with all required indexes.
**Files:**
- `@apps/api/src/db/schema.ts`

**Prompt:**
In `@apps/api/src/db/schema.ts`:

1. Add `highestRollAmplifiedCents: integer('highest_roll_amplified_cents').notNull().default(0)` to the `runs` pgTable definition (after `rewardsFinalised`).

2. Append a new `leaderboardEntries` pgTable at the end of the file (before inferred-type exports) with columns: `id` (uuid PK defaultRandom), `userId` (uuid → users.id CASCADE), `runId` (uuid → runs.id CASCADE), `displayName` (text), `finalBankrollCents` (integer), `highestRollAmplifiedCents` (integer default 0), `highestMarkerIndex` (smallint), `shootersRemaining` (smallint), `crewLayout` (jsonb typed as `({ id: number; name: string } | null)[]`), `didWinRun` (boolean), `createdAt` (timestamptz defaultNow). Add a `uniqueIndex` on `runId`, a partial `index` on `(finalBankrollCents DESC, shootersRemaining DESC) WHERE did_win_run = true`, a partial `index` on `(highestMarkerIndex DESC, finalBankrollCents DESC) WHERE did_win_run = false`, and a composite `index` on `(userId, finalBankrollCents DESC)`.

3. Update `usersRelations` to add `leaderboardEntries: many(leaderboardEntries)`. Update `runsRelations` to add `leaderboardEntry: one(leaderboardEntries, ...)`. Add new `leaderboardEntriesRelations`.

4. Export `LeaderboardEntryRow` and `NewLeaderboardEntry` inferred types.

---

## Step 3: Startup Migrations
**Goal:** Add two safe `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` DDL blocks that run on every server boot.
**Files:**
- `@apps/api/src/server.ts`

**Prompt:**
In `@apps/api/src/server.ts`, after the existing `tutorial_completed` migration block and before `await app.listen(...)`, add:

```ts
await db.execute(sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS highest_roll_amplified_cents integer NOT NULL DEFAULT 0`);
app.log.info('[migrate] highest_roll_amplified_cents ensured');

await db.execute(sql`CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  final_bankroll_cents integer NOT NULL,
  highest_roll_amplified_cents integer NOT NULL DEFAULT 0,
  highest_marker_index smallint NOT NULL,
  shooters_remaining smallint NOT NULL,
  crew_layout jsonb NOT NULL,
  did_win_run boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`);
await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_entries_run_id_idx ON leaderboard_entries (run_id)`);
await db.execute(sql`CREATE INDEX IF NOT EXISTS leaderboard_entries_winners_idx ON leaderboard_entries (final_bankroll_cents DESC, shooters_remaining DESC) WHERE did_win_run = true`);
await db.execute(sql`CREATE INDEX IF NOT EXISTS leaderboard_entries_nonwinners_idx ON leaderboard_entries (highest_marker_index DESC, final_bankroll_cents DESC) WHERE did_win_run = false`);
await db.execute(sql`CREATE INDEX IF NOT EXISTS leaderboard_entries_user_bankroll_idx ON leaderboard_entries (user_id, final_bankroll_cents DESC)`);
app.log.info('[migrate] leaderboard_entries table ensured');
```

Also add `import { leaderboardPlugin } from './routes/leaderboard.js';` to imports and `await app.register(leaderboardPlugin, { prefix: '/api/v1' });` to the route registration block.

---

## Step 4: Leaderboard Route (new file)
**Goal:** Create `apps/api/src/routes/leaderboard.ts` with the GET handler and the internal `submitLeaderboardEntry()` helper.
**Files:**
- `@apps/api/src/db/schema.ts` (read only — for types)
- `@apps/api/src/lib/clerkAuth.ts` (read only)
- `@apps/api/src/lib/resolveUser.ts` (read only)

**Prompt:**
Create `apps/api/src/routes/leaderboard.ts`. It must export:

1. `leaderboardPlugin(app)` — registers `GET /leaderboard` with a Fastify JSON schema that validates `?view=global|personal`. For `global`: parallel-fetch winners (`didWinRun = true`, ORDER BY `finalBankrollCents DESC, shootersRemaining DESC`, LIMIT 25) and nonWinners (`didWinRun = false`, ORDER BY `highestMarkerIndex DESC, finalBankrollCents DESC`, LIMIT 25). For `personal`: verify `Authorization` header, call `requireClerkAuth` then `resolveUserByClerkId`, return the user's top 25 by `finalBankrollCents DESC`.

2. `submitLeaderboardEntry(user: UserRow, persistedRun: RunRow)` — async, used internally from `rolls.ts`. Build `crewLayout` by mapping `persistedRun.crewSlots` to `{ id, name }` pairs (join `crewDefinitions` via `inArray`). Compute `didWinRun = persistedRun.currentMarkerIndex >= GAUNTLET.length`. Insert with `.onConflictDoNothing({ target: leaderboardEntries.runId })` for idempotency.

---

## Step 5: rolls.ts — Track highestRollAmplifiedCents + trigger submission
**Goal:** Compute `rollAmplifiedProfit` on every winning roll, persist `highestRollAmplifiedCents`, and fire-and-forget `submitLeaderboardEntry` at GAME_OVER on both code paths.
**Files:**
- `@apps/api/src/routes/rolls.ts`
- `@apps/api/src/routes/leaderboard.ts` (read — for the import)

**Prompt:**
In `@apps/api/src/routes/rolls.ts`:

1. Add `import { submitLeaderboardEntry } from './leaderboard.js';` at the top.

2. After `const payout = settleTurn(finalContext);`, compute:
   ```ts
   const rollAmplifiedProfit = payout - finalContext.baseStakeReturned;
   const newHighestRollAmplifiedCents = Math.max(run.highestRollAmplifiedCents, rollAmplifiedProfit);
   ```

3. Add `highestRollAmplifiedCents: newHighestRollAmplifiedCents` to the `db.update(runs).set({...})` call on the normal path.

4. Immediately after the `evaluateUnlocks` fire-and-forget block, add:
   ```ts
   if (nextState.status === 'GAME_OVER') {
     void submitLeaderboardEntry(user as UserRow, persistedRun).catch((err: unknown) => {
       request.log.error({ err }, '[leaderboard] submission error');
     });
   }
   ```

5. On the instant-loss path (Executive boss rule), add the same fire-and-forget call after the `lossRun[0] === undefined` guard:
   ```ts
   void submitLeaderboardEntry(user as UserRow, lossRun[0]).catch((err: unknown) => {
     request.log.error({ err }, '[leaderboard] submission error (instant-loss)');
   });
   ```

---

## Step 6: Window.Clerk type declaration
**Goal:** Satisfy strict TypeScript for `window.Clerk?.session?.getToken()` used in `LeaderboardScreen`.
**Files:**
- `@apps/web/src/global.d.ts` (create if absent)

**Prompt:**
Create (or update) `apps/web/src/global.d.ts` with:
```ts
interface Window {
  Clerk?: {
    session?: {
      getToken: () => Promise<string | null>;
    };
  };
}
```

---

## Step 7: LeaderboardEntry component
**Goal:** Create the row component with expandable crew drawer.
**Files:**
- `@packages/shared/src/types.ts` (read only — for `LeaderboardEntry` type)
- `@apps/web/src/lib/floorThemes.ts` (read only)

**Prompt:**
Create `apps/web/src/components/LeaderboardEntry.tsx`. Props: `{ entry: LeaderboardEntry; rank: number; showMarker?: boolean }`. State: `expanded: boolean`. Display helpers: `fmtDollars(cents)` (locale integer dollars) and `fmtDate(iso)` (short month/day/year).

Main row (button, always visible): rank badge, display name, final bankroll, marker badge OR win star (based on `showMarker`), expand chevron. Secondary row (always visible below): "Best roll: $X" and date. Expandable crew drawer (conditional): lists all 5 `crewLayout` slots by name, showing "— empty —" for null slots. Use `getFloorTheme(0)` for all colors.

---

## Step 8: LeaderboardScreen component
**Goal:** Create the full-screen container with GLOBAL / MY RUNS tabs and data fetching isolated from `useGameStore`.
**Files:**
- `@apps/web/src/components/LeaderboardEntry.tsx` (read only)
- `@apps/web/src/lib/floorThemes.ts` (read only)
- `@packages/shared/src/types.ts` (read only)

**Prompt:**
Create `apps/web/src/components/LeaderboardScreen.tsx`. Props: `{ onBack: () => void }`. Tabs: `'global' | 'personal'`. Fetch with `useEffect` on tab change using `fetch` (no `useGameStore`). For personal tab, retrieve JWT via `window.Clerk?.session?.getToken()`. Render: back button + "HIGH ROLLER'S CLUB" title, tab bar (GLOBAL / MY RUNS), loading/error states. Global tab: "THE HALL OF FAME" section (`winners`) then "GONE BUT NOT FORGOTTEN" section (`nonWinners`); each uses `<LeaderboardEntry>` with `showMarker` for non-winners. Personal tab: "YOUR RUN HISTORY" section with `showMarker`. Empty state messages for each section. Use `getFloorTheme(0)` for all colors. Import `LeaderboardEntry` type as `LeaderboardEntryType` to avoid collision with the component name.

---

## Step 9: TitleLobbyScreen integration
**Goal:** Add the "★ HIGH ROLLER'S CLUB" button and overlay routing.
**Files:**
- `@apps/web/src/components/TitleLobbyScreen.tsx`
- `@apps/web/src/components/LeaderboardScreen.tsx` (read only)

**Prompt:**
In `@apps/web/src/components/TitleLobbyScreen.tsx`:

1. Import `LeaderboardScreen`.
2. Add `const [showLeaderboard, setShowLeaderboard] = useState(false);` after the existing `showHowToPlay` state.
3. After the `if (showHowToPlay)` return block, add `if (showLeaderboard) return <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />;`
4. In the action-button container, add a ghost-style "★ HIGH ROLLER'S CLUB" button after the "HOW TO PLAY" button. Match the same low-opacity styling — `borderColor: theme.accentDim + '30'`, `color: theme.accentPrimary + '60'`, with hover handlers that raise opacity to `90` / `60` respectively. Use `font-pixel text-[8px] tracking-widest`.

---

## Step 10: TypeScript verification
**Goal:** Confirm zero compilation errors across all workspaces.

**Prompt:**
Run `npm run typecheck` from the repository root. Fix any errors before declaring the feature complete. Key things to watch: `RunRow.highestRollAmplifiedCents` is inferred automatically from the Drizzle schema addition; no manual annotation is needed. The `LeaderboardEntry` type/component name collision is resolved by aliasing the type import in `LeaderboardScreen.tsx`.
