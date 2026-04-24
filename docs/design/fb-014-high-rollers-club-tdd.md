# FB-014 — High Roller's Club & Leaderboards: Technical Design Document

**Status:** Ready for implementation  
**Branch target:** `feature/FB-014-high-rollers-club`  
**Author:** Senior Software Architect  
**Date:** 2026-04-23  

---

## 1. Overview

This document specifies every implementation detail needed to deliver the High Roller's Club & Leaderboards feature on top of the existing BattleCraps stack. It is structured to be executed file-by-file with minimal forward references.

### Goals
- Track each player's highest single-roll amplified profit across the lifetime of a run.
- Persist a leaderboard entry at the exact moment a run reaches `GAME_OVER`.
- Expose a `GET /api/v1/leaderboard` endpoint that serves both global (winners / non-winners) and personal (all runs) views.
- Render a `LeaderboardScreen` component accessible from `TitleLobbyScreen`, isolated from `useGameStore`.

### Non-Goals
- Pagination beyond Top 25 in a single request.
- Real-time leaderboard push via WebSocket (polling-on-mount is sufficient).
- Admin moderation tools.

---

## 2. Affected Files Summary

| File | Action |
|---|---|
| `apps/api/src/db/schema.ts` | Add `leaderboard_entries` table; add `highestRollAmplifiedCents` column to `runs` |
| `apps/api/src/server.ts` | Add two startup DDL migrations; register `leaderboardPlugin` |
| `apps/api/src/routes/rolls.ts` | Track per-roll amplified profit; trigger submission at GAME_OVER |
| `apps/api/src/routes/leaderboard.ts` | **New file** — GET endpoint + internal `submitLeaderboardEntry()` |
| `packages/shared/src/types.ts` | Add `LeaderboardEntry` and `LeaderboardResponse` interfaces |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Add "High Roller's Club" button + `showLeaderboard` state |
| `apps/web/src/components/LeaderboardScreen.tsx` | **New file** — main container with tabs |
| `apps/web/src/components/LeaderboardEntry.tsx` | **New file** — entry row with expandable crew drawer |

---

## 3. Prerequisite: `runs.highest_roll_amplified_cents`

The game engine does not currently track the single highest amplified profit across a run's rolls. This column must be added to `runs` before the leaderboard table is meaningful.

### 3.1 Schema addition (`apps/api/src/db/schema.ts`)

Add the following field inside the `runs` pgTable definition, after `rewardsFinalised` (currently the last column before `createdAt`, ~line 364):

```typescript
/**
 * The largest single-roll amplified profit earned during this run, in cents.
 * Computed as: settleTurn(ctx) - ctx.baseStakeReturned
 * Updated on every winning roll via fire-and-forget (same pattern as maxBankrollCents).
 * Stored here so it can be read once at GAME_OVER for leaderboard submission without
 * requiring a separate max-aggregation query over roll history.
 *
 * Migration: server.ts startup block (highest_roll_amplified_cents)
 */
highestRollAmplifiedCents: integer('highest_roll_amplified_cents').notNull().default(0),
```

### 3.2 Startup migration (`apps/api/src/server.ts`)

Add after the `tutorial_completed` migration block (~line 133), before `await app.listen(...)`:

```typescript
await db.execute(sql`
  ALTER TABLE runs ADD COLUMN IF NOT EXISTS highest_roll_amplified_cents integer NOT NULL DEFAULT 0
`);
app.log.info('[migrate] highest_roll_amplified_cents ensured');
```

### 3.3 Per-roll tracking (`apps/api/src/routes/rolls.ts`)

**Computation point:** Immediately after the `settleTurn` call at line ~436:

```typescript
const payout = settleTurn(finalContext);
const newBankroll = run.bankrollCents - betDelta + payout;
const bankrollDelta = newBankroll - run.bankrollCents;

// Amplified profit for this roll = total payout minus stake returned (1:1).
// Mirrors the formula in buildRollReceipt: settleTurn(ctx) - ctx.baseStakeReturned.
const rollAmplifiedProfit = payout - finalContext.baseStakeReturned;
const newHighestRollAmplifiedCents = Math.max(
  run.highestRollAmplifiedCents,
  rollAmplifiedProfit,
);
```

**Persistence point:** Add `highestRollAmplifiedCents` to the `db.update(runs).set({...})` call at line ~476:

```typescript
.set({
  // ... all existing fields ...
  highestRollAmplifiedCents: newHighestRollAmplifiedCents,
  updatedAt: new Date(),
})
```

**Instant-loss path (~line 372):** The `lossRun` update does not award any profit, so carry the existing value forward:

```typescript
await db
  .update(runs)
  .set({
    status: 'GAME_OVER',
    bankrollCents: lossBankroll,
    bets: zeroBets,
    // highest_roll_amplified_cents unchanged — no payout on instant loss
    updatedAt: new Date(),
  })
  // ... WHERE clause unchanged
```

No change needed for the instant-loss path; Postgres column default 0 is already correct and the value simply isn't overwritten.

---

## 4. Database: `leaderboard_entries` Table

### 4.1 Drizzle schema (`apps/api/src/db/schema.ts`)

Add at the end of the file, after `crewDefinitions` and before the inferred-type exports:

```typescript
// ---------------------------------------------------------------------------
// LEADERBOARD ENTRIES TABLE (FB-014)
// One row per run that reached GAME_OVER. Written by submitLeaderboardEntry()
// in apps/api/src/routes/leaderboard.ts. Read by GET /api/v1/leaderboard.
// ---------------------------------------------------------------------------

export const leaderboardEntries = pgTable(
  'leaderboard_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),

    /**
     * Denormalized from users.username at submission time.
     * Avoids N+1 Clerk API calls when rendering global Top 25.
     */
    displayName: text('display_name').notNull(),

    /** Final bankroll at GAME_OVER, in cents. Primary sort key. */
    finalBankrollCents: integer('final_bankroll_cents').notNull(),

    /**
     * Largest single-roll amplified profit from runs.highest_roll_amplified_cents.
     * Formula: settleTurn(ctx) - ctx.baseStakeReturned
     * Displayed as "Highest Single Roll Win" in the leaderboard entry.
     */
    highestRollAmplifiedCents: integer('highest_roll_amplified_cents').notNull().default(0),

    /**
     * Index into GAUNTLET (0–8) at the time of GAME_OVER.
     * For winners: value is 9 (GAUNTLET.length — past the last valid index).
     * For non-winners: 0–8, indicating how far they progressed.
     * Used to sort the "Gone but not Forgotten" section.
     */
    highestMarkerIndex: smallint('highest_marker_index').notNull(),

    /** Shooter lives remaining at GAME_OVER. Tie-breaker within identical bankrolls. */
    shootersRemaining: smallint('shooters_remaining').notNull(),

    /**
     * Crew slot arrangement at GAME_OVER.
     * Array of 5 elements: { id: number; name: string } | null.
     * Names are denormalized at submission time to avoid a join on every read.
     */
    crewLayout: jsonb('crew_layout')
      .$type<({ id: number; name: string } | null)[]>()
      .notNull(),

    /**
     * True if the player cleared the final gauntlet marker (Executive defeated).
     * Determines which section of the Global tab this entry belongs to.
     */
    didWinRun: boolean('did_win_run').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Unique: one entry per run. Enables ON CONFLICT (run_id) DO NOTHING for idempotency.
    runIdUniq: uniqueIndex('leaderboard_entries_run_id_idx').on(t.runId),

    // Global winners query: ORDER BY final_bankroll_cents DESC, shooters_remaining DESC
    // WHERE did_win_run = true LIMIT 25
    winnersIdx: index('leaderboard_entries_winners_idx')
      .on(t.finalBankrollCents, t.shootersRemaining)
      .where(sql`did_win_run = true`),

    // Global non-winners query: ORDER BY highest_marker_index DESC, final_bankroll_cents DESC
    // WHERE did_win_run = false LIMIT 25
    nonWinnersIdx: index('leaderboard_entries_nonwinners_idx')
      .on(t.highestMarkerIndex, t.finalBankrollCents)
      .where(sql`did_win_run = false`),

    // Personal query: WHERE user_id = $1 ORDER BY final_bankroll_cents DESC LIMIT 25
    userBankrollIdx: index('leaderboard_entries_user_bankroll_idx')
      .on(t.userId, t.finalBankrollCents),
  }),
);

export type LeaderboardEntryRow = typeof leaderboardEntries.$inferSelect;
export type NewLeaderboardEntry  = typeof leaderboardEntries.$inferInsert;
```

Also add the relation to the existing `usersRelations` and `runsRelations` blocks:

```typescript
// Update usersRelations:
export const usersRelations = relations(users, ({ many }) => ({
  runs:               many(runs),
  leaderboardEntries: many(leaderboardEntries),
}));

// Update runsRelations:
export const runsRelations = relations(runs, ({ one }) => ({
  user: one(users, { fields: [runs.userId], references: [users.id] }),
  leaderboardEntry: one(leaderboardEntries, {
    fields:     [runs.id],
    references: [leaderboardEntries.runId],
  }),
}));

// Add new:
export const leaderboardEntriesRelations = relations(leaderboardEntries, ({ one }) => ({
  user: one(users, { fields: [leaderboardEntries.userId], references: [users.id] }),
  run:  one(runs,  { fields: [leaderboardEntries.runId],  references: [runs.id]  }),
}));
```

### 4.2 Startup migration (`apps/api/src/server.ts`)

Add after the `highest_roll_amplified_cents` migration, before `await app.listen(...)`:

```typescript
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id                     uuid        NOT NULL REFERENCES runs(id)  ON DELETE CASCADE,
    display_name               text        NOT NULL,
    final_bankroll_cents       integer     NOT NULL,
    highest_roll_amplified_cents integer   NOT NULL DEFAULT 0,
    highest_marker_index       smallint    NOT NULL,
    shooters_remaining         smallint    NOT NULL,
    crew_layout                jsonb       NOT NULL,
    did_win_run                boolean     NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now()
  )
`);
await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_entries_run_id_idx
    ON leaderboard_entries (run_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_winners_idx
    ON leaderboard_entries (final_bankroll_cents DESC, shooters_remaining DESC)
    WHERE did_win_run = true
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_nonwinners_idx
    ON leaderboard_entries (highest_marker_index DESC, final_bankroll_cents DESC)
    WHERE did_win_run = false
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_user_bankroll_idx
    ON leaderboard_entries (user_id, final_bankroll_cents DESC)
`);
app.log.info('[migrate] leaderboard_entries table ensured');
```

---

## 5. Shared Types (`packages/shared/src/types.ts`)

Add at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// LEADERBOARD TYPES (FB-014)
// ---------------------------------------------------------------------------

/** A single row returned by GET /api/v1/leaderboard, enriched for display. */
export interface LeaderboardEntry {
  id:                        string;  // uuid
  runId:                     string;  // uuid
  userId:                    string;  // uuid
  displayName:               string;
  finalBankrollCents:        number;
  highestRollAmplifiedCents: number;
  highestMarkerIndex:        number;  // 0–8 for non-winners; 9 for winners
  shootersRemaining:         number;
  crewLayout:                ({ id: number; name: string } | null)[];  // 5 elements
  didWinRun:                 boolean;
  createdAt:                 string;  // ISO 8601
}

/** Response shape for GET /api/v1/leaderboard?view=global */
export interface GlobalLeaderboardResponse {
  winners:    LeaderboardEntry[];  // Top 25, ORDER BY finalBankrollCents DESC, shootersRemaining DESC
  nonWinners: LeaderboardEntry[];  // Top 25, ORDER BY highestMarkerIndex DESC, finalBankrollCents DESC
}

/** Response shape for GET /api/v1/leaderboard?view=personal (requires auth) */
export interface PersonalLeaderboardResponse {
  entries: LeaderboardEntry[];  // Top 25 for the authenticated user, ORDER BY finalBankrollCents DESC
}

export type LeaderboardResponse = GlobalLeaderboardResponse | PersonalLeaderboardResponse;
```

---

## 6. API Route: `apps/api/src/routes/leaderboard.ts`

Create this file from scratch.

### 6.1 Full implementation

```typescript
// =============================================================================
// BATTLECRAPS — Leaderboard routes (FB-014)
// apps/api/src/routes/leaderboard.ts
//
// GET  /api/v1/leaderboard?view=global    → winners + nonWinners Top 25 each
// GET  /api/v1/leaderboard?view=personal  → caller's Top 25 (auth required)
//
// submitLeaderboardEntry() is called internally from rolls.ts at GAME_OVER.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, and } from 'drizzle-orm';

import { db } from '../db/client.js';
import {
  leaderboardEntries,
  crewDefinitions,
  runs,
  type UserRow,
  type RunRow,
} from '../db/schema.js';
import { requireClerkAuth }      from '../lib/clerkAuth.js';
import { resolveUserByClerkId }  from '../lib/resolveUser.js';
import { GAUNTLET }              from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard
// ---------------------------------------------------------------------------

const querySchema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['global', 'personal'] },
  },
  required: ['view'],
  additionalProperties: false,
} as const;

interface LeaderboardQuery {
  view: 'global' | 'personal';
}

export async function leaderboardPlugin(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LeaderboardQuery }>(
    '/leaderboard',
    { schema: { querystring: querySchema } },
    leaderboardHandler,
  );
}

async function leaderboardHandler(
  request: FastifyRequest<{ Querystring: LeaderboardQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { view } = request.query;

  if (view === 'global') {
    const [winnersRows, nonWinnersRows] = await Promise.all([
      db
        .select()
        .from(leaderboardEntries)
        .where(eq(leaderboardEntries.didWinRun, true))
        .orderBy(
          desc(leaderboardEntries.finalBankrollCents),
          desc(leaderboardEntries.shootersRemaining),
        )
        .limit(25),
      db
        .select()
        .from(leaderboardEntries)
        .where(eq(leaderboardEntries.didWinRun, false))
        .orderBy(
          desc(leaderboardEntries.highestMarkerIndex),
          desc(leaderboardEntries.finalBankrollCents),
        )
        .limit(25),
    ]);

    return reply.status(200).send({
      winners:    winnersRows,
      nonWinners: nonWinnersRows,
    });
  }

  // Personal view — requires auth
  // Use preHandler manually so GET /leaderboard?view=global stays unauthenticated.
  const authHeader = request.headers['authorization'];
  if (!authHeader) {
    return reply.status(401).send({ error: 'Authorization header required for personal view.' });
  }

  await requireClerkAuth(request, reply);
  // requireClerkAuth returns early (calls reply.status(401)) on failure;
  // if we reach this line, request.clerkId is set.
  const user = await resolveUserByClerkId(request.clerkId);
  if (!user) {
    return reply.status(401).send({ error: 'User not found — please re-sign in.' });
  }

  const personalRows = await db
    .select()
    .from(leaderboardEntries)
    .where(eq(leaderboardEntries.userId, user.id))
    .orderBy(desc(leaderboardEntries.finalBankrollCents))
    .limit(25);

  return reply.status(200).send({ entries: personalRows });
}

// ---------------------------------------------------------------------------
// submitLeaderboardEntry — internal, called from rolls.ts at GAME_OVER
// ---------------------------------------------------------------------------

/**
 * Inserts a leaderboard entry for a completed run.
 *
 * Design decisions:
 * - Unique constraint on run_id: INSERT ... ON CONFLICT DO NOTHING is idempotent.
 *   If the roll handler retries (e.g., due to a network hiccup), a second call
 *   is a safe no-op.
 * - Crew names are denormalized at submission time (joined from crewDefinitions)
 *   so that GET /leaderboard never needs to join with crewDefinitions.
 * - didWinRun: true when persistedRun.currentMarkerIndex >= GAUNTLET.length (= 9),
 *   meaning the player advanced past the last marker index (0–8) by clearing it.
 * - highestMarkerIndex: stored as-is from persistedRun.currentMarkerIndex.
 *   For winners this is 9; for non-winners it's 0–8.
 *
 * @param user         The UserRow for the player (provides displayName + userId).
 * @param persistedRun The fully persisted RunRow at GAME_OVER.
 */
export async function submitLeaderboardEntry(
  user:         UserRow,
  persistedRun: RunRow,
): Promise<void> {
  // Build crew layout: extract IDs from StoredCrewSlots, join names from crewDefinitions.
  const crewIds = (persistedRun.crewSlots as ({ crewId: number } | null)[])
    .map((slot) => slot?.crewId ?? null);

  const uniqueIds = [...new Set(crewIds.filter((id): id is number => id !== null))];

  let nameMap = new Map<number, string>();
  if (uniqueIds.length > 0) {
    const defs = await db
      .select({ id: crewDefinitions.id, name: crewDefinitions.name })
      .from(crewDefinitions)
      .where(
        uniqueIds.length === 1
          ? eq(crewDefinitions.id, uniqueIds[0]!)
          : ((): ReturnType<typeof eq> => {
              // drizzle inList helper — import from drizzle-orm if available,
              // otherwise use a WHERE id = ANY($1) raw expression.
              // Use sql`id = ANY(${sql.raw(uniqueIds.join(','))})` approach:
              throw new Error('replace with drizzle inArray() import');
            })(),
      );
    nameMap = new Map(defs.map((d) => [d.id, d.name]));
  }

  const crewLayout = crewIds.map((id) =>
    id !== null ? { id, name: nameMap.get(id) ?? `Crew #${id}` } : null,
  );

  const didWinRun = persistedRun.currentMarkerIndex >= GAUNTLET.length;

  await db
    .insert(leaderboardEntries)
    .values({
      userId:                    persistedRun.userId,
      runId:                     persistedRun.id,
      displayName:               user.username,
      finalBankrollCents:        persistedRun.bankrollCents,
      highestRollAmplifiedCents: persistedRun.highestRollAmplifiedCents,
      highestMarkerIndex:        persistedRun.currentMarkerIndex,
      shootersRemaining:         persistedRun.shooters,
      crewLayout,
      didWinRun,
    })
    .onConflictDoNothing({ target: leaderboardEntries.runId });
}
```

> **Note on `inArray`:** Drizzle-ORM exports `inArray(column, values)` from `drizzle-orm`. Replace the placeholder branch above with `import { inArray } from 'drizzle-orm'` and use `inArray(crewDefinitions.id, uniqueIds)` in the WHERE clause. The single-element branch using `eq()` can also be replaced by `inArray` safely.

The corrected WHERE clause:

```typescript
import { eq, desc, and, inArray } from 'drizzle-orm';
// ...
const defs = await db
  .select({ id: crewDefinitions.id, name: crewDefinitions.name })
  .from(crewDefinitions)
  .where(inArray(crewDefinitions.id, uniqueIds));
```

### 6.2 Route registration (`apps/api/src/server.ts`)

Add to the imports at the top (~line 24):

```typescript
import { leaderboardPlugin } from './routes/leaderboard.js';
```

Add to the route registration block (~line 69):

```typescript
await app.register(leaderboardPlugin, { prefix: '/api/v1' });
```

---

## 7. GAME_OVER Hook: Triggering Leaderboard Submission in `rolls.ts`

There are two distinct code paths in `rolls.ts` that produce `GAME_OVER`. Both must call `submitLeaderboardEntry`.

### 7.1 Import

At the top of `rolls.ts`, add:

```typescript
import { submitLeaderboardEntry } from './leaderboard.js';
```

### 7.2 Path A — Instant-loss (Executive boss rule, ~line 362)

The instant-loss path writes to `lossRun` and returns early before the cascade. Add the fire-and-forget call immediately after `lossRun` is confirmed (after the `if (lossRun[0] === undefined)` guard, before the `io.to(...)` emit):

```typescript
if (lossRun[0] === undefined) {
  return reply.status(409).send({ error: 'Conflict: run was modified by another request. Please retry.' });
}

// Leaderboard: submit entry for this instant-loss GAME_OVER (fire-and-forget).
void submitLeaderboardEntry(user as UserRow, lossRun[0]).catch((err: unknown) => {
  request.log.error({ err }, '[leaderboard] submission error (instant-loss)');
});

const io = getIO();
// ... rest of instant-loss path unchanged
```

### 7.3 Path B — Normal GAME_OVER (via computeNextState, ~line 508)

Add immediately after the `evaluateUnlocks` fire-and-forget block (~line 518):

```typescript
// ── 12c. Leaderboard submission (fire-and-forget) ─────────────────────────
// Triggered on every GAME_OVER — submitLeaderboardEntry is idempotent via
// ON CONFLICT (run_id) DO NOTHING, so a retry-on-failure is safe.
if (nextState.status === 'GAME_OVER') {
  void submitLeaderboardEntry(user as UserRow, persistedRun).catch((err: unknown) => {
    request.log.error({ err }, '[leaderboard] submission error');
  });
}
```

> **Why fire-and-forget?** Leaderboard writes are non-critical and must not add latency to the hot roll path. The same pattern is used for `evaluateUnlocks` and `maxBankrollCents` updates. If the write fails, the run is still valid and the player is not affected.

---

## 8. API Contract: `GET /api/v1/leaderboard`

### 8.1 Global view

**Request:**
```
GET /api/v1/leaderboard?view=global
Authorization: (none required)
```

**Response 200:**
```json
{
  "winners": [
    {
      "id":                        "550e8400-e29b-41d4-a716-446655440000",
      "runId":                     "660e8400-e29b-41d4-a716-446655440001",
      "userId":                    "770e8400-e29b-41d4-a716-446655440002",
      "displayName":               "HotRoller99",
      "finalBankrollCents":        1250000,
      "highestRollAmplifiedCents": 84000,
      "highestMarkerIndex":        9,
      "shootersRemaining":         2,
      "crewLayout": [
        { "id": 3,    "name": "The Whale" },
        { "id": 17,   "name": "Lucky Charm" },
        null,
        { "id": 24,   "name": "The Bookkeeper" },
        { "id": 8,    "name": "The Old Pro" }
      ],
      "didWinRun":  true,
      "createdAt":  "2026-04-22T18:30:00.000Z"
    }
    // ... up to 24 more
  ],
  "nonWinners": [
    {
      "id":                        "...",
      "displayName":               "SnakeEyes",
      "finalBankrollCents":        389000,
      "highestRollAmplifiedCents": 21000,
      "highestMarkerIndex":        7,
      "shootersRemaining":         0,
      "crewLayout":                [ null, null, null, null, null ],
      "didWinRun":                 false,
      "createdAt":                 "2026-04-21T09:15:00.000Z"
    }
    // ... up to 24 more
  ]
}
```

**Sort order — `winners`:** `finalBankrollCents DESC`, `shootersRemaining DESC` (tie-breaker).  
**Sort order — `nonWinners`:** `highestMarkerIndex DESC`, `finalBankrollCents DESC`.  
**Limit:** 25 per section.

### 8.2 Personal view

**Request:**
```
GET /api/v1/leaderboard?view=personal
Authorization: Bearer <clerk_jwt>
```

**Response 200:**
```json
{
  "entries": [
    {
      "id":                        "...",
      "displayName":               "HotRoller99",
      "finalBankrollCents":        1250000,
      "highestRollAmplifiedCents": 84000,
      "highestMarkerIndex":        9,
      "shootersRemaining":         2,
      "crewLayout":                [ ... ],
      "didWinRun":                 true,
      "createdAt":                 "2026-04-22T18:30:00.000Z"
    }
    // ... up to 24 more
  ]
}
```

**Sort order:** `finalBankrollCents DESC` (single list, no tabs).  
**Limit:** 25 runs for the authenticated user regardless of `didWinRun`.

**Response 401:**
```json
{ "error": "Authorization header required for personal view." }
```

---

## 9. Frontend: `TitleLobbyScreen.tsx` changes

### 9.1 Add import

```typescript
import { LeaderboardScreen } from './LeaderboardScreen.js';
```

### 9.2 Add state

Inside the component body, after the existing `showHowToPlay` state (~line 39):

```typescript
const [showLeaderboard, setShowLeaderboard] = useState(false);
```

### 9.3 Add overlay return

After the `if (showHowToPlay)` return block (~line 54):

```typescript
if (showLeaderboard) {
  return <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />;
}
```

### 9.4 Add button

Inside the `<div className="flex flex-col items-center gap-4 ...">` action-button container (~line 120), insert after the "HOW TO PLAY" button (~line 199):

```tsx
{/* High Roller's Club — same low visual weight as How to Play */}
<button
  type="button"
  onClick={() => setShowLeaderboard(true)}
  className="
    w-full py-2 rounded
    font-pixel text-[8px] tracking-widest
    border transition-all duration-150 active:scale-95
  "
  style={{
    borderColor: `${theme.accentDim}30`,
    background:  'transparent',
    color:       `${theme.accentPrimary}60`,
  }}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLButtonElement).style.color       = `${theme.accentPrimary}90`;
    (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentDim}60`;
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLButtonElement).style.color       = `${theme.accentPrimary}60`;
    (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentDim}30`;
  }}
>
  ★ HIGH ROLLER'S CLUB
</button>
```

---

## 10. Frontend: `LeaderboardScreen.tsx` (new file)

**Path:** `apps/web/src/components/LeaderboardScreen.tsx`

### 10.1 Props

```typescript
interface LeaderboardScreenProps {
  onBack: () => void;
}
```

### 10.2 State

```typescript
type Tab = 'global' | 'personal';

const [tab,         setTab]         = useState<Tab>('global');
const [globalData,  setGlobalData]  = useState<GlobalLeaderboardResponse | null>(null);
const [personalData, setPersonalData] = useState<PersonalLeaderboardResponse | null>(null);
const [loading,     setLoading]     = useState(false);
const [error,       setError]       = useState<string | null>(null);
```

### 10.3 Data fetching

Use `useEffect` with a `fetch` call. **Do not use `useGameStore`.** The Clerk JWT is available via `window.Clerk?.session?.getToken()` (Clerk's browser SDK is already loaded because `TitleLobbyScreen` renders inside the Clerk-authenticated shell in `App.tsx`).

```typescript
const API_BASE = import.meta.env['VITE_API_URL'] ?? '';

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);

  const fetchData = async () => {
    try {
      if (tab === 'global') {
        const res = await fetch(`${API_BASE}/api/v1/leaderboard?view=global`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as GlobalLeaderboardResponse;
        if (!cancelled) setGlobalData(data);
      } else {
        // Personal view requires the Clerk JWT.
        const token = await window.Clerk?.session?.getToken();
        const res = await fetch(`${API_BASE}/api/v1/leaderboard?view=personal`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as PersonalLeaderboardResponse;
        if (!cancelled) setPersonalData(data);
      }
    } catch (err) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  void fetchData();
  return () => { cancelled = true; };
}, [tab]);
```

> **`window.Clerk` type:** Add `declare global { interface Window { Clerk?: { session?: { getToken: () => Promise<string | null> } } } }` to a `.d.ts` file in `apps/web/src/` (e.g., `global.d.ts`) or inline in the component file to satisfy TypeScript strict mode.

### 10.4 Component structure

```tsx
return (
  <div className="relative w-full max-w-lg mx-auto min-h-[100dvh] flex flex-col"
       style={{ background: ..., borderColor: theme.borderHigh }}>

    {/* Header row: back button + title */}
    <div className="flex items-center gap-4 p-4 border-b" style={{ borderColor: `${theme.accentDim}30` }}>
      <button type="button" onClick={onBack} className="font-pixel text-[8px]" style={{ color: theme.accentPrimary }}>
        ← BACK
      </button>
      <h2 className="font-pixel text-[10px] tracking-widest flex-1 text-center"
          style={{ color: theme.accentBright }}>
        HIGH ROLLER'S CLUB
      </h2>
    </div>

    {/* Tab bar */}
    <div className="flex border-b" style={{ borderColor: `${theme.accentDim}30` }}>
      {(['global', 'personal'] as const).map((t) => (
        <button key={t} type="button" onClick={() => setTab(t)}
          className="flex-1 py-2 font-pixel text-[8px] tracking-widest transition-colors"
          style={{
            color:           tab === t ? theme.accentBright : `${theme.accentPrimary}50`,
            borderBottom:    tab === t ? `2px solid ${theme.accentPrimary}` : '2px solid transparent',
            background:      'transparent',
          }}>
          {t === 'global' ? 'GLOBAL' : 'MY RUNS'}
        </button>
      ))}
    </div>

    {/* Content */}
    <div className="flex-1 overflow-y-auto p-4">
      {loading && (
        <p className="font-mono text-center text-[9px]" style={{ color: `${theme.accentPrimary}50` }}>
          Loading...
        </p>
      )}
      {error && (
        <p className="font-mono text-center text-[9px] text-red-400">{error}</p>
      )}

      {tab === 'global' && globalData && !loading && (
        <>
          <SectionHeader label="THE HALL OF FAME" theme={theme} />
          {globalData.winners.length === 0
            ? <EmptyState label="No victors yet. Be the first." theme={theme} />
            : globalData.winners.map((entry, i) => (
                <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} />
              ))
          }

          <div className="mt-6 mb-2">
            <SectionHeader label="GONE BUT NOT FORGOTTEN" theme={theme} />
          </div>
          {globalData.nonWinners.length === 0
            ? <EmptyState label="No fallen runners yet." theme={theme} />
            : globalData.nonWinners.map((entry, i) => (
                <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} showMarker />
              ))
          }
        </>
      )}

      {tab === 'personal' && personalData && !loading && (
        <>
          <SectionHeader label="YOUR RUN HISTORY" theme={theme} />
          {personalData.entries.length === 0
            ? <EmptyState label="No runs recorded yet. Start rolling." theme={theme} />
            : personalData.entries.map((entry, i) => (
                <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} showMarker />
              ))
          }
        </>
      )}
    </div>
  </div>
);
```

`SectionHeader` and `EmptyState` are small inline sub-components (no separate files needed):

```tsx
function SectionHeader({ label, theme }: { label: string; theme: ReturnType<typeof getFloorTheme> }) {
  return (
    <p className="font-pixel text-[7px] tracking-[0.4em] mb-3"
       style={{ color: `${theme.accentPrimary}60` }}>
      {label}
    </p>
  );
}

function EmptyState({ label, theme }: { label: string; theme: ReturnType<typeof getFloorTheme> }) {
  return (
    <p className="font-mono text-center text-[9px] py-8"
       style={{ color: `${theme.accentPrimary}30` }}>
      {label}
    </p>
  );
}
```

### 10.5 Imports for `LeaderboardScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { getFloorTheme }              from '../lib/floorThemes.js';
import { LeaderboardEntry }           from './LeaderboardEntry.js';
import type {
  GlobalLeaderboardResponse,
  PersonalLeaderboardResponse,
  LeaderboardEntry as LeaderboardEntryType,
} from '@battlecraps/shared';

const theme = getFloorTheme(0);
```

---

## 11. Frontend: `LeaderboardEntry.tsx` (new file)

**Path:** `apps/web/src/components/LeaderboardEntry.tsx`

### 11.1 Props

```typescript
import type { LeaderboardEntry as LeaderboardEntryData } from '@battlecraps/shared';

interface LeaderboardEntryProps {
  entry:       LeaderboardEntryData;
  rank:        number;
  showMarker?: boolean;  // Show "Marker X" badge instead of win indicator (non-winners / personal)
}
```

### 11.2 State

```typescript
const [expanded, setExpanded] = useState(false);
```

### 11.3 Display helpers

```typescript
function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}
```

### 11.4 Rendered structure

```tsx
return (
  <div className="mb-2 rounded border" style={{ borderColor: `${theme.accentDim}25`, background: 'rgba(5,5,5,0.6)' }}>

    {/* Main row — always visible */}
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
    >
      {/* Rank badge */}
      <span className="font-pixel text-[8px] w-5 text-right flex-shrink-0"
            style={{ color: `${theme.accentPrimary}60` }}>
        {rank}.
      </span>

      {/* Name */}
      <span className="font-pixel text-[9px] flex-1 truncate"
            style={{ color: theme.accentBright }}>
        {entry.displayName}
      </span>

      {/* Bankroll */}
      <span className="font-mono text-[9px]"
            style={{ color: theme.accentPrimary }}>
        {fmtDollars(entry.finalBankrollCents)}
      </span>

      {/* Marker badge (non-winners / personal) or WIN star */}
      {showMarker
        ? (
          <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded"
                style={{ background: `${theme.accentDim}20`, color: `${theme.accentPrimary}70` }}>
            MKR {Math.min(entry.highestMarkerIndex, 8) + 1}
          </span>
          )
        : entry.didWinRun
          ? <span className="font-pixel text-[7px]" style={{ color: theme.accentBright }}>★</span>
          : null
      }

      {/* Expand chevron */}
      <span className="font-mono text-[8px]"
            style={{ color: `${theme.accentPrimary}40` }}>
        {expanded ? '▲' : '▼'}
      </span>
    </button>

    {/* Secondary data row — always visible below the main row */}
    <div className="px-3 pb-2 flex gap-4">
      <span className="font-mono text-[8px]" style={{ color: `${theme.accentPrimary}50` }}>
        Best roll: {fmtDollars(entry.highestRollAmplifiedCents)}
      </span>
      <span className="font-mono text-[8px]" style={{ color: `${theme.accentPrimary}40` }}>
        {fmtDate(entry.createdAt)}
      </span>
    </div>

    {/* Expandable crew drawer */}
    {expanded && (
      <div className="px-3 pb-3 border-t" style={{ borderColor: `${theme.accentDim}20` }}>
        <p className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5"
           style={{ color: `${theme.accentPrimary}40` }}>
          CREW
        </p>
        <div className="flex gap-2 flex-wrap">
          {entry.crewLayout.map((slot, i) => (
            <span
              key={i}
              className="font-mono text-[8px] px-2 py-1 rounded"
              style={{
                background:  slot ? `${theme.feltPrimary}30` : 'rgba(20,20,20,0.5)',
                color:       slot ? theme.accentPrimary       : `${theme.accentPrimary}25`,
                border:      `1px solid ${slot ? `${theme.accentDim}40` : `${theme.accentDim}15`}`,
              }}
            >
              {slot ? slot.name : '— empty —'}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
);
```

---

## 12. TypeScript Compliance

Before marking the task complete, run from the repository root:

```bash
npm run typecheck
```

Key checks to watch for:

1. **`runs.highestRollAmplifiedCents`** — The `RunRow` inferred type is derived from `typeof runs.$inferSelect`. After adding the column to the Drizzle schema, `RunRow.highestRollAmplifiedCents: number` will be present automatically. No manual type annotation needed.

2. **`submitLeaderboardEntry` call sites** — The function expects `UserRow`. In `rolls.ts`, `user` is already typed as the return of `resolveUserByClerkId`, which returns `Promise<UserRow | null>`. The `user as UserRow` cast at the call site is safe because the null check on line ~194 guards it, but you may prefer to pass `user` directly after confirming non-null.

3. **`window.Clerk` global** — Add to `apps/web/src/global.d.ts` (create if absent):

```typescript
interface Window {
  Clerk?: {
    session?: {
      getToken: () => Promise<string | null>;
    };
  };
}
```

4. **`LeaderboardEntry` name collision** — The shared type is named `LeaderboardEntry` and the React component is also `LeaderboardEntry`. Import the type with an alias in `LeaderboardScreen.tsx`:

```typescript
import type { LeaderboardEntry as LeaderboardEntryData } from '@battlecraps/shared';
```

5. **`crewLayout` JSONB type** — The Drizzle schema types `crewLayout` as `({ id: number; name: string } | null)[]`. After reading from DB, TypeScript will infer it as that type. In the React component, ensure the destructure in `LeaderboardEntry.tsx` does not assume a fixed length of 5 — use `.map()` rather than index access.

---

## 13. Implementation Order

Execute in this sequence to avoid forward-reference errors:

1. **`packages/shared/src/types.ts`** — Add `LeaderboardEntry`, `GlobalLeaderboardResponse`, `PersonalLeaderboardResponse`. This has no dependencies.
2. **`apps/api/src/db/schema.ts`** — Add `highestRollAmplifiedCents` to `runs`; add `leaderboardEntries` table + relations.
3. **`apps/api/src/server.ts`** — Add both startup migrations; add `leaderboardPlugin` import + registration.
4. **`apps/api/src/routes/leaderboard.ts`** — Create new file (depends on schema types from step 2).
5. **`apps/api/src/routes/rolls.ts`** — Add `highestRollAmplifiedCents` tracking + GAME_OVER submission calls (depends on step 4).
6. **`apps/web/src/global.d.ts`** — Add `Window.Clerk` declaration.
7. **`apps/web/src/components/LeaderboardEntry.tsx`** — Create new file.
8. **`apps/web/src/components/LeaderboardScreen.tsx`** — Create new file (depends on step 7).
9. **`apps/web/src/components/TitleLobbyScreen.tsx`** — Add button + overlay (depends on step 8).
10. **Run `npm run typecheck`** — Fix any errors before committing.

---

## 14. Open Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should global leaderboard be visible to unauthenticated (logged-out) users? | Yes — the GET handler requires no auth for `view=global`. The Clerk shell in `App.tsx` prevents unauthenticated users from reaching `TitleLobbyScreen`, so this is a server-level decision that can be relaxed later without changing the UI. |
| 2 | What to display for `highestRollAmplifiedCents = 0` (player never won a roll)? | Display `$0` without special treatment. It is an accurate stat. |
| 3 | Should existing GAME_OVER runs (before this feature ships) be backfilled? | No. The `leaderboard_entries` table starts empty. Only runs completed after deployment appear on the leaderboard. Historical runs have `highestRollAmplifiedCents = 0` from the column default and are not submitted. |
| 4 | Is `display_name` staleness a concern (user changes their username)? | Acceptable for MVP. If username mutability is added later, a background job can update `display_name` in `leaderboard_entries` for rows where `user_id` matches. |
| 5 | Should the `LeaderboardScreen` auto-refresh? | No. A one-time load on mount is sufficient. Add a "Refresh" button only if playtester feedback requests it. |
