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
import { leaderboardEntries, runs, users } from '../../db/schema.js';
import { isDevClerkId } from '../../lib/devAuth.js';
import { MARKER_TARGETS, getMinBet } from '@battlecraps/shared';
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

// ---------------------------------------------------------------------------
// POST /dev/runs — Scenario Builder (Phase 2)
// ---------------------------------------------------------------------------

describe('POST /dev/runs', () => {
  const NO_BETS = { passLine: 0, odds: 0, hardways: NO_HARDWAYS };

  async function createDevRun(scenario: Record<string, unknown>) {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/dev/runs',
      headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
      payload: JSON.stringify(scenario),
    });
    return { status: res.statusCode, body: res.json() as Record<string, unknown> };
  }

  async function getRun(runId: string) {
    const row = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!row) throw new Error('run missing');
    return row;
  }

  it('404s for a non-allowlisted user (route not discoverable)', async () => {
    setDevEnv('true', 'user_someone_else');
    const { status } = await createDevRun({ markerIndex: 11 });
    expect(status).toBe(404);
  });

  it('404s when the kill switch is off', async () => {
    setDevEnv(undefined, TEST_CLERK_ID);
    const { status } = await createDevRun({ markerIndex: 11 });
    expect(status).toBe(404);
  });

  it('creates a dev run at the requested marker with the requested state', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const { status, body } = await createDevRun({
      markerIndex: 11, bankrollCents: 500_000, hype: 1.75, shooters: 3, bossCounter: 0, crew: [16, 17],
    });
    expect(status, JSON.stringify(body)).toBe(201);
    const run = await getRun(body['runId'] as string);
    expect(run.isDevRun).toBe(true);
    expect(run.currentMarkerIndex).toBe(11);
    expect(run.bankrollCents).toBe(500_000);
    expect(run.hype).toBeCloseTo(1.75);
    expect(run.shooters).toBe(3);
    expect(run.bossPointHits).toBe(0);
    expect((run.crewSlots as ({ crewId: number } | null)[]).map((s) => s?.crewId ?? null))
      .toEqual([16, 17, null, null, null]);
    expect((body['run'] as Record<string, unknown>)['isDevRun']).toBe(true);
  });

  it('rejects locked crew (422) unless ignoreUnlocks is set', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const locked = await createDevRun({ markerIndex: 0, crew: [1] }); // Lefty: unlock-gated
    expect(locked.status).toBe(422);
    expect(locked.body['lockedCrewIds']).toEqual([1]);

    const ignored = await createDevRun({ markerIndex: 0, crew: [1], ignoreUnlocks: true });
    expect(ignored.status, JSON.stringify(ignored.body)).toBe(201);
  });

  it('rejects unknown crew ids (422) and malformed scenarios (400)', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    expect((await createDevRun({ markerIndex: 0, crew: [999], ignoreUnlocks: true })).status).toBe(422);
    expect((await createDevRun({ markerIndex: 99 })).status).toBe(400);
  });

  it('retires the previous dev run but never touches a real run', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const realRun = await createRun(userId);
    const first   = await createDevRun({ markerIndex: 3 });
    const second  = await createDevRun({ markerIndex: 4 });
    expect(second.status).toBe(201);
    expect((await getRun(first.body['runId'] as string)).status).toBe('GAME_OVER');
    expect((await getRun(realRun.id)).status).toBe('IDLE_TABLE');
  });

  it('entry "transition" into the Executive: real clear + pub → fight starts at rating 2', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const { status, body } = await createDevRun({ markerIndex: 11, entry: 'transition', crew: [16] });
    expect(status, JSON.stringify(body)).toBe(201);
    const runId = body['runId'] as string;
    expect((await getRun(runId)).currentMarkerIndex).toBe(10);

    // ADVANCE: bankroll already meets marker 10's target → server auto-clear.
    const clear = await rollWithDice(app, runId, NO_BETS, 3, 4);
    expect(clear.status, JSON.stringify(clear.body)).toBe(200);
    let run = await getRun(runId);
    expect(run.status).toBe('TRANSITION');
    expect(run.currentMarkerIndex).toBe(11);

    // Pub: skip recruiting.
    const pub = await app.inject({
      method:  'POST',
      url:     `/api/v1/runs/${runId}/recruit`,
      headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
      payload: JSON.stringify({}),
    });
    expect(pub.statusCode, pub.body).toBe(200);
    run = await getRun(runId);
    expect(run.status).toBe('IDLE_TABLE');
    expect(run.bossPointHits).toBe(2);
  });

  it('entering Le Prix at the table charms a filled slot', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const { status, body } = await createDevRun({ markerIndex: 8, crew: [null, 17, null] });
    expect(status, JSON.stringify(body)).toBe(201);
    expect((await getRun(body['runId'] as string)).bossPointHits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Forced dice (Phase 3) — cheat_dice honoured only for devs on dev runs
// ---------------------------------------------------------------------------

describe('forced dice (cheat_dice) after the tutorial', () => {
  // Marker 3 with half its target banked: room for several wins without
  // auto-clearing the marker, and a legal (minimum) pass line bet.
  const MARKER   = 3;
  const PASS     = { passLine: getMinBet(MARKER), odds: 0, hardways: NO_HARDWAYS };
  const runSetup = { currentMarkerIndex: MARKER, bankrollCents: Math.round((MARKER_TARGETS[MARKER] ?? 0) / 2) };

  beforeEach(async () => {
    await db.update(users).set({ tutorialCompleted: true }).where(eq(users.id, userId));
  });

  afterEach(async () => {
    await db.update(users).set({ tutorialCompleted: false }).where(eq(users.id, userId));
  });

  async function rollDiceSeen(runId: string, d1: number, d2: number): Promise<number[]> {
    const { status, body } = await rollWithDice(app, runId, PASS, d1, d2);
    expect(status, JSON.stringify(body)).toBe(200);
    return (body['roll'] as Record<string, unknown>)['dice'] as number[];
  }

  /** Forcing [6,6] five times: if every roll comes back [6,6] the force was honoured. */
  async function allForced(runId: string): Promise<boolean> {
    let forced = true;
    for (let i = 0; i < 5; i++) {
      const dice = await rollDiceSeen(runId, 6, 6);
      if (dice[0] !== 6 || dice[1] !== 6) forced = false;
    }
    return forced;
  }

  it('honoured for an allowlisted dev on a dev run', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const run = await createRun(userId, { ...runSetup, isDevRun: true });
    expect(await rollDiceSeen(run.id, 1, 1)).toEqual([1, 1]);
    expect(await rollDiceSeen(run.id, 2, 5)).toEqual([2, 5]);
    expect(await rollDiceSeen(run.id, 6, 6)).toEqual([6, 6]);
  });

  it('ignored for an allowlisted dev on a REAL run', async () => {
    setDevEnv('true', TEST_CLERK_ID);
    const run = await createRun(userId, runSetup);
    expect(await allForced(run.id)).toBe(false);
  });

  it('ignored for a non-allowlisted user, even on a dev run', async () => {
    setDevEnv('true', 'user_someone_else');
    const run = await createRun(userId, { ...runSetup, isDevRun: true });
    expect(await allForced(run.id)).toBe(false);
  });

  it('ignored when the kill switch is off', async () => {
    setDevEnv(undefined, TEST_CLERK_ID);
    const run = await createRun(userId, { ...runSetup, isDevRun: true });
    expect(await allForced(run.id)).toBe(false);
  });
});
