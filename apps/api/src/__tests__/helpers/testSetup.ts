// =============================================================================
// BATTLECRAPS — INTEGRATION TEST HELPERS
// apps/api/src/__tests__/helpers/testSetup.ts
// =============================================================================

// Fail loudly if DATABASE_URL is absent — tests must never silently fall back
// to the development or production database.
if (!process.env['DATABASE_URL']) {
  throw new Error(
    'DATABASE_URL is not set. Integration tests require globalSetup to load .env.test first.',
  );
}

import Fastify, { type FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, runs, leaderboardEntries, feedbackSubmissions, type StoredCrewSlots } from '../../db/schema.js';
import { rollsPlugin }      from '../../routes/rolls.js';
import { bootstrapPlugin }  from '../../routes/runs.js';
import { recruitPlugin }    from '../../routes/recruit.js';
import { leaderboardPlugin } from '../../routes/leaderboard.js';
import type { Bets } from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// Stable test identity
// ---------------------------------------------------------------------------

export const TEST_CLERK_ID = 'test_user_integration';

const EMPTY_BETS: Bets = {
  passLine: 0,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
};

const EMPTY_CREW: StoredCrewSlots = [null, null, null, null, null];

// ---------------------------------------------------------------------------
// App factory — builds a fresh Fastify instance with all relevant plugins.
// Call once per test file (beforeAll). Use app.inject() for HTTP calls.
// ---------------------------------------------------------------------------

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rollsPlugin,      { prefix: '/api/v1' });
  await app.register(bootstrapPlugin,  { prefix: '/api/v1' });
  await app.register(recruitPlugin,    { prefix: '/api/v1' });
  await app.register(leaderboardPlugin, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Test user — idempotent upsert so suites can call it independently.
// tutorialCompleted: false is REQUIRED for cheat_dice to be honoured.
// ---------------------------------------------------------------------------

export async function createTestUser(): Promise<typeof users.$inferSelect> {
  // Upsert so concurrent test workers don't race on insert.
  // ON CONFLICT (clerk_id) updates a harmless column so RETURNING still fires.
  const [user] = await db
    .insert(users)
    .values({
      clerkId:           TEST_CLERK_ID,
      username:          'test_player',
      email:             'test@battlecraps.test',
      tutorialCompleted: false,
      unlockedCrewIds:   [],
      compPerkIds:       [],
      updatedAt:         new Date(),
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set:    { updatedAt: new Date() },
    })
    .returning();

  if (!user) throw new Error('Failed to create test user');
  return user;
}

// ---------------------------------------------------------------------------
// Run factory — inserts a run row directly for fine-grained state control.
// Caller can override any field via the optional second argument.
// ---------------------------------------------------------------------------

export async function createRun(
  userId: string,
  overrides: Partial<typeof runs.$inferInsert> = {},
): Promise<typeof runs.$inferSelect> {
  const [run] = await db
    .insert(runs)
    .values({
      userId,
      status:        'IDLE_TABLE',
      phase:         'COME_OUT',
      bankrollCents: 3000,
      shooters:      5,
      hype:          1.0,
      crewSlots:     EMPTY_CREW,
      bets:          EMPTY_BETS,
      updatedAt:     new Date(),
      ...overrides,
    })
    .returning();

  if (!run) throw new Error('Failed to create run');
  return run;
}

// ---------------------------------------------------------------------------
// rollWithDice — POST /api/v1/runs/:id/roll with predetermined dice.
// Passes the test-bypass header so Clerk JWT is skipped.
// ---------------------------------------------------------------------------

export async function rollWithDice(
  app:   FastifyInstance,
  runId: string,
  bets:  Bets,
  d1:    number,
  d2:    number,
) {
  const response = await app.inject({
    method:  'POST',
    url:     `/api/v1/runs/${runId}/roll`,
    headers: {
      'content-type':   'application/json',
      'x-test-user-id': TEST_CLERK_ID,
    },
    payload: JSON.stringify({ bets, cheat_dice: [d1, d2] }),
  });
  return {
    status: response.statusCode,
    body:   response.json() as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// recruitCrew — POST /api/v1/runs/:id/recruit
// ---------------------------------------------------------------------------

export async function recruitCrew(
  app:       FastifyInstance,
  runId:     string,
  crewId:    number,
  slotIndex: number,
) {
  const response = await app.inject({
    method:  'POST',
    url:     `/api/v1/runs/${runId}/recruit`,
    headers: {
      'content-type':   'application/json',
      'x-test-user-id': TEST_CLERK_ID,
    },
    payload: JSON.stringify({ crewId, slotIndex }),
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// resetTestDb — truncate transient tables between tests.
// Users and crewDefinitions are preserved across the test suite.
// ---------------------------------------------------------------------------

export async function resetTestDb(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE leaderboard_entries, feedback_submissions, runs RESTART IDENTITY CASCADE`);
}
