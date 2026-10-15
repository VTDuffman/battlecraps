// =============================================================================
// INTEGRATION — FB-041 the opening ("First Round's on the House")
// Post-tutorial runs start with $40 at the opening pub (TRANSITION, marker 0):
// a draft of 3 random Starter-roster crew, hired free. Tutorial runs keep $30
// at the table.
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, runs, crewDefinitions } from '../../db/schema.js';
import { OPENING_BANKROLL_CENTS, TUTORIAL_BANKROLL_CENTS } from '@battlecraps/shared';
import {
  buildTestApp,
  createTestUser,
  createRun,
  recruitCrew,
  getPubDraft,
  resetTestDb,
  TEST_CLERK_ID,
} from '../helpers/testSetup.js';

let app: FastifyInstance;
let userId: string;
let starterIds: Set<number>;

beforeAll(async () => {
  app    = await buildTestApp();
  const user = await createTestUser();
  userId = user.id;
  const allCrew = await db.select().from(crewDefinitions);
  starterIds = new Set(allCrew.filter((c) => c.isStarterRoster).map((c) => c.id));
});

afterAll(async () => {
  // Leave the shared test user as the other suites expect it.
  await db.update(users).set({ tutorialCompleted: false, unlockedCrewIds: [] }).where(eq(users.clerkId, TEST_CLERK_ID));
  await app.close();
});

beforeEach(async () => {
  await resetTestDb();
  await db.update(users).set({ tutorialCompleted: true, unlockedCrewIds: [] }).where(eq(users.clerkId, TEST_CLERK_ID));
});

async function createRunViaApi() {
  const response = await app.inject({
    method:  'POST',
    url:     '/api/v1/runs',
    headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
    payload: '{}',
  });
  const body = response.json() as { runId: string; run: { bankroll: number; status: string; currentMarkerIndex: number } };
  return { status: response.statusCode, body };
}

async function skipPub(runId: string) {
  const response = await app.inject({
    method:  'POST',
    url:     `/api/v1/runs/${runId}/recruit`,
    headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
    payload: '{}',
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

type DraftEntry = { id: number; hireCostCents: number; isGuaranteed: boolean };
const draftOf = (body: unknown): DraftEntry[] => ((body as { draft?: DraftEntry[] }).draft ?? []);

describe('Run creation', () => {
  it('a tutorial-pending run starts with $30 at the table', async () => {
    await db.update(users).set({ tutorialCompleted: false }).where(eq(users.clerkId, TEST_CLERK_ID));
    const { status, body } = await createRunViaApi();
    expect(status).toBe(201);
    expect(body.run.bankroll).toBe(TUTORIAL_BANKROLL_CENTS);
    expect(body.run.status).toBe('IDLE_TABLE');
    expect(body.run.currentMarkerIndex).toBe(0);
  });

  it('a post-tutorial run starts with $40 at the opening pub', async () => {
    const { status, body } = await createRunViaApi();
    expect(status).toBe(201);
    expect(body.run.bankroll).toBe(OPENING_BANKROLL_CENTS);
    expect(body.run.status).toBe('TRANSITION');
    expect(body.run.currentMarkerIndex).toBe(0);
  });
});

describe('Opening pub draft', () => {
  it('offers 3 Starter-roster crew, free, and never re-rolls', async () => {
    const { body } = await createRunViaApi();
    const first = await getPubDraft(app, body.runId);
    expect(first.status).toBe(200);
    const draft = draftOf(first.body);
    expect(draft).toHaveLength(3);
    for (const c of draft) {
      expect(starterIds.has(c.id)).toBe(true);
      expect(c.hireCostCents).toBe(0);
      expect(c.isGuaranteed).toBe(false);
    }
    const again = await getPubDraft(app, body.runId);
    expect(draftOf(again.body).map((c) => c.id)).toEqual(draft.map((c) => c.id));
  });

  it('ignores unlocked and guaranteed crew', async () => {
    await db.update(users).set({ unlockedCrewIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }).where(eq(users.clerkId, TEST_CLERK_ID));
    const run = await createRun(userId, {
      status:                'TRANSITION',
      currentMarkerIndex:    0,
      bankrollCents:         OPENING_BANKROLL_CENTS,
      guaranteedPubDraftIds: [1],
    });
    for (let i = 0; i < 5; i++) {
      await db.update(runs).set({ pubDraft: null }).where(eq(runs.id, run.id));
      const { body } = await getPubDraft(app, run.id);
      const draft = draftOf(body);
      expect(draft).toHaveLength(3);
      expect(draft.every((c) => starterIds.has(c.id))).toBe(true);
    }
  });
});

describe('Opening pub hire', () => {
  it('hires a drafted Starter for free and goes to the table', async () => {
    const { body } = await createRunViaApi();
    const { body: draftBody } = await getPubDraft(app, body.runId);
    const pick = draftOf(draftBody)[0]!;

    const { status, body: res } = await recruitCrew(app, body.runId, pick.id, 0);
    expect(status).toBe(200);
    expect(res['bankroll']).toBe(OPENING_BANKROLL_CENTS);
    expect(res['status']).toBe('IDLE_TABLE');
    expect(res['shooters']).toBe(5);
    expect(res['bossPointHits']).toBe(0);
    expect((res['crewSlots'] as Array<{ crewId: number } | null>)[0]?.crewId).toBe(pick.id);

    const row = await db.query.runs.findFirst({ where: eq(runs.id, body.runId) });
    expect(row?.currentMarkerIndex).toBe(0);
    expect(row?.pubDraft).toBeNull();
  });

  it('skipping keeps the $40 and no crew', async () => {
    const { body } = await createRunViaApi();
    await getPubDraft(app, body.runId);
    const { status, body: res } = await skipPub(body.runId);
    expect(status).toBe(200);
    expect(res['bankroll']).toBe(OPENING_BANKROLL_CENTS);
    expect(res['status']).toBe('IDLE_TABLE');
    expect((res['crewSlots'] as unknown[]).every((s) => s === null)).toBe(true);
  });

  it('rejects a crew member that was not offered', async () => {
    const { body } = await createRunViaApi();
    const { body: draftBody } = await getPubDraft(app, body.runId);
    const offered = new Set(draftOf(draftBody).map((c) => c.id));
    const notOffered = [...starterIds].find((id) => !offered.has(id))!;
    const { status } = await recruitCrew(app, body.runId, notOffered, 0);
    expect(status).toBe(403);
  });

  it('a regular pub (marker 1) still charges the hire cost', async () => {
    const run = await createRun(userId, {
      status:             'TRANSITION',
      currentMarkerIndex: 1,
      bankrollCents:      6000,
      pubDraft:           { crewIds: [16], guaranteedIds: [] },
    });
    const { status, body } = await recruitCrew(app, run.id, 16, 0);
    expect(status).toBe(200);
    // Starter = 2 × the cleared marker's max bet ($50 target → $5) = $10.
    expect(body['bankroll']).toBe(5000);
  });
});
