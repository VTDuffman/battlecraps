// =============================================================================
// INTEGRATION — Developer Mode foundation (FB-028 Phase 1)
//
// Covers: dev access gate (isDevClerkId + /auth/provision isDev flag) and
// dev-run isolation (no leaderboard rows, no unlocks, no user-stat writes).
// Each isolation test runs a real-run control alongside the dev run so a
// silently-broken side effect can't make the dev assertion pass vacuously.
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { leaderboardEntries, users } from '../../db/schema.js';
import { isDevClerkId } from '../../lib/devAuth.js';
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

const NO_HARDWAYS = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };
const PASS_500 = { passLine: 500, odds: 0, hardways: NO_HARDWAYS };

const savedEnv = {
  DEV_MODE_ENABLED: process.env['DEV_MODE_ENABLED'],
  DEV_CLERK_IDS:    process.env['DEV_CLERK_IDS'],
};

function setDevEnv(enabled: string | undefined, ids: string | undefined): void {
  if (enabled === undefined) delete process.env['DEV_MODE_ENABLED'];
  else process.env['DEV_MODE_ENABLED'] = enabled;
  if (ids === undefined) delete process.env['DEV_CLERK_IDS'];
  else process.env['DEV_CLERK_IDS'] = ids;
}

/** Fire-and-forget side effects (leaderboard, unlocks, stats) need a moment. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

async function resetUserStats(): Promise<void> {
  await db
    .update(users)
    .set({ unlockedCrewIds: [], unlockProgress: {}, highestMarkerReached: 0, maxBankrollCents: 0 })
    .where(eq(users.id, userId));
}

async function getUser() {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) throw new Error('test user missing');
  return row;
}

beforeAll(async () => {
  app = await buildTestApp();
  const user = await createTestUser();
  userId = user.id;
});

afterAll(async () => {
  setDevEnv(savedEnv.DEV_MODE_ENABLED, savedEnv.DEV_CLERK_IDS);
  await app.close();
});

beforeEach(async () => {
  await resetTestDb();
  await resetUserStats();
});

afterEach(() => {
  setDevEnv(savedEnv.DEV_MODE_ENABLED, savedEnv.DEV_CLERK_IDS);
});

// ---------------------------------------------------------------------------
// Access gate
// ---------------------------------------------------------------------------

describe('isDevClerkId', () => {
  it('is false when DEV_MODE_ENABLED is unset, even if the id is allowlisted', () => {
    setDevEnv(undefined, TEST_CLERK_ID);
    expect(isDevClerkId(TEST_CLERK_ID)).toBe(false);
  });

  it('is false when DEV_MODE_ENABLED is anything other than "true"', () => {
    setDevEnv('1', TEST_CLERK_ID);
    expect(isDevClerkId(TEST_CLERK_ID)).toBe(false);
  });

  it('is false for ids not on the allowlist', () => {
    setDevEnv('true', 'user_someone_else');
    expect(isDevClerkId(TEST_CLERK_ID)).toBe(false);
  });

  it('is false for an empty allowlist and for an undefined id', () => {
    setDevEnv('true', ' , ');
    expect(isDevClerkId(TEST_CLERK_ID)).toBe(false);
    expect(isDevClerkId(undefined)).toBe(false);
  });

  it('is true for an allowlisted id (whitespace-tolerant list)', () => {
    setDevEnv('true', ` user_other , ${TEST_CLERK_ID} `);
    expect(isDevClerkId(TEST_CLERK_ID)).toBe(true);
  });
});

describe('/auth/provision isDev flag', () => {
  async function provision() {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/provision',
      headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
      payload: JSON.stringify({ email: 'ignored@example.com', displayName: 'Ignored' }),
    });
    expect(res.statusCode).toBeLessThan(300);
    return res.json() as Record<string, unknown>;
  }

  it('reports isDev: false for a non-allowlisted user', async () => {
    setDevEnv('true', 'user_someone_else');
    expect((await provision())['isDev']).toBe(false);
  });

  it('reports isDev: true for an allowlisted user', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    expect((await provision())['isDev']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dev-run isolation
// ---------------------------------------------------------------------------

describe('dev runs skip persistent side effects', () => {
  it('GET /runs/:id reports isDevRun', async () => {
    const devRun  = await createRun(userId, { isDevRun: true });
    const realRun = await createRun(userId);
    for (const [run, expected] of [[devRun, true], [realRun, false]] as const) {
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/runs/${run.id}`,
        headers: { 'x-test-user-id': TEST_CLERK_ID },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as Record<string, unknown>)['isDevRun']).toBe(expected);
    }
  });

  it('GAME_OVER on a dev run writes no leaderboard entry (real run control does)', async () => {
    const lastShooterPoint8 = {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE' as const,
      phase:         'POINT_ACTIVE' as const,
      currentPoint:  8,
      bets:          PASS_500,
      shooters:      1,
    };
    const devRun  = await createRun(userId, { ...lastShooterPoint8, isDevRun: true });
    const realRun = await createRun(userId, lastShooterPoint8);

    for (const run of [devRun, realRun]) {
      const { status, body } = await rollWithDice(app, run.id, PASS_500, 3, 4); // seven-out
      expect(status, JSON.stringify(body)).toBe(200);
      expect((body['run'] as Record<string, unknown>)['status']).toBe('GAME_OVER');
    }
    await settle();

    const devEntries  = await db.select().from(leaderboardEntries).where(eq(leaderboardEntries.runId, devRun.id));
    const realEntries = await db.select().from(leaderboardEntries).where(eq(leaderboardEntries.runId, realRun.id));
    expect(devEntries.length).toBe(0);
    expect(realEntries.length).toBe(1);
  });

  it('a dev-run natural does not grant Nervous Intern (ID 10); a real-run natural does', async () => {
    const devRun = await createRun(userId, { isDevRun: true });
    const dev = await rollWithDice(app, devRun.id, PASS_500, 3, 4); // NATURAL on marker 0
    expect(dev.status, JSON.stringify(dev.body)).toBe(200);
    await settle();
    let user = await getUser();
    expect(user.unlockedCrewIds).not.toContain(10);
    expect((user.unlockProgress as Record<string, unknown>)['10']).toBeUndefined();

    const realRun = await createRun(userId);
    const real = await rollWithDice(app, realRun.id, PASS_500, 3, 4);
    expect(real.status).toBe(200);
    await settle();
    user = await getUser();
    expect(user.unlockedCrewIds).toContain(10);
  });

  it('clearing a marker on a dev run leaves highestMarkerReached and maxBankrollCents untouched', async () => {
    // Marker 0 target is $50. Point 8 hit pays the pass line and crosses it.
    const nearTargetPoint8 = {
      bankrollCents: 4400,
      status:        'POINT_ACTIVE' as const,
      phase:         'POINT_ACTIVE' as const,
      currentPoint:  8,
      bets:          PASS_500,
    };

    const devRun = await createRun(userId, { ...nearTargetPoint8, isDevRun: true });
    const dev = await rollWithDice(app, devRun.id, PASS_500, 5, 3); // POINT_HIT (easy 8)
    expect(dev.status, JSON.stringify(dev.body)).toBe(200);
    const devBody = dev.body['run'] as Record<string, unknown>;
    expect(devBody['currentMarkerIndex']).toBe(1);
    expect(devBody['highestMarkerReached']).toBe(0); // reported value unchanged too
    await settle();
    let user = await getUser();
    expect(user.highestMarkerReached).toBe(0);
    expect(user.maxBankrollCents).toBe(0);

    const realRun = await createRun(userId, nearTargetPoint8);
    const real = await rollWithDice(app, realRun.id, PASS_500, 5, 3);
    expect(real.status).toBe(200);
    await settle();
    user = await getUser();
    expect(user.highestMarkerReached).toBe(1);
    expect(user.maxBankrollCents).toBeGreaterThan(0);
  });
});
