// =============================================================================
// INTEGRATION — leaderboard submission and retrieval
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { leaderboardEntries } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  buildTestApp,
  createTestUser,
  createRun,
  rollWithDice,
  resetTestDb,
  TEST_CLERK_ID,
} from '../helpers/testSetup.js';

let app: FastifyInstance;
let userId: string;

beforeAll(async () => {
  app    = await buildTestApp();
  const user = await createTestUser();
  userId = user.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetTestDb();
});

// ---------------------------------------------------------------------------
// Helper — drive a run to GAME_OVER via last-shooter seven-out
// ---------------------------------------------------------------------------

async function driveToGameOver(runId: string): Promise<void> {
  // Roll 3+4=7 on come-out (NATURAL) first to build a bit of bankroll,
  // then set a point, then seven-out on the last shooter.
  // Actually the simplest path: put the run in POINT_ACTIVE with 1 shooter
  // and seven-out. The createRun caller should have already done that setup.
  await rollWithDice(
    app, runId,
    { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    3, 4, // seven-out
  );
}

// ---------------------------------------------------------------------------
// Submission on GAME_OVER
// ---------------------------------------------------------------------------

describe('Leaderboard submission', () => {
  it('creates a leaderboard_entries row when a run reaches GAME_OVER via last shooter', async () => {
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets:          { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      shooters:      1, // last shooter
    });

    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4, // seven-out → GAME_OVER
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');

    // submitLeaderboardEntry is fire-and-forget — give it a moment to resolve
    await new Promise((resolve) => setTimeout(resolve, 200));

    const entries = await db
      .select()
      .from(leaderboardEntries)
      .where(eq(leaderboardEntries.runId, run.id));

    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.didWinRun).toBe(false);
    expect(entry.shootersRemaining).toBe(0);
    expect(entry.finalBankrollCents).toBe(r['bankrollCents'] as number);
  });
});

// ---------------------------------------------------------------------------
// GET /leaderboard?view=global
// ---------------------------------------------------------------------------

describe('GET /leaderboard?view=global', () => {
  it('returns winners and nonWinners arrays', async () => {
    const response = await app.inject({
      method: 'GET',
      url:    '/api/v1/leaderboard?view=global',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(Array.isArray(body['winners'])).toBe(true);
    expect(Array.isArray(body['nonWinners'])).toBe(true);
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url:    '/api/v1/leaderboard?view=global',
      // No auth headers
    });
    expect(response.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /leaderboard?view=personal
// ---------------------------------------------------------------------------

describe('GET /leaderboard?view=personal', () => {
  it('returns 401 without authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url:    '/api/v1/leaderboard?view=personal',
      // No headers at all
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 with x-test-user-id but without authorization header', async () => {
    // leaderboard.ts manually checks Authorization before calling requireClerkAuth
    const response = await app.inject({
      method:  'GET',
      url:     '/api/v1/leaderboard?view=personal',
      headers: { 'x-test-user-id': TEST_CLERK_ID },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns the personal entries array when both headers are present', async () => {
    const response = await app.inject({
      method:  'GET',
      url:     '/api/v1/leaderboard?view=personal',
      headers: {
        authorization:    'Bearer test',
        'x-test-user-id': TEST_CLERK_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(Array.isArray(body['entries'])).toBe(true);
  });

  it('returns only the test user\'s entries in the personal view', async () => {
    // Drive a run to GAME_OVER first
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets:          { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      shooters:      1,
    });
    await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await app.inject({
      method:  'GET',
      url:     '/api/v1/leaderboard?view=personal',
      headers: {
        authorization:    'Bearer test',
        'x-test-user-id': TEST_CLERK_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    const entries = body['entries'] as { runId: string }[];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.runId).toBe(run.id);
  });
});
