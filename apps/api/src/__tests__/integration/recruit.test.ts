// =============================================================================
// INTEGRATION — recruit endpoint (unlock gating, slot placement, hype floor)
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
import { users } from '../../db/schema.js';
import {
  buildTestApp,
  createTestUser,
  createRun,
  recruitCrew,
  resetTestDb,
  TEST_CLERK_ID,
} from '../helpers/testSetup.js';

// IDs for testing
const STARTER_CREW_ID = 16;  // First Starter crew (IDs 16–30, always available)
const UNLOCK_CREW_ID  = 1;   // ID 1 is unlock-gated (original 15)
const LUCKY_CHARM_ID  = 15;  // Unlock-gated but usable for hype-floor test

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
  // Ensure user has no unlocked crew (reset to clean state)
  await db
    .update(users)
    .set({ unlockedCrewIds: [] })
    .where(eq(users.clerkId, TEST_CLERK_ID));
});

// ---------------------------------------------------------------------------
// Helper — put a run in TRANSITION status (already past marker 0)
// ---------------------------------------------------------------------------

async function createTransitionRun(overrides = {}) {
  return createRun(userId, {
    status:             'TRANSITION',
    currentMarkerIndex: 1, // just cleared marker 0 → marker 1 is next
    bankrollCents:      5000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Unlock gating — IDs 1-15 require explicit unlock
// ---------------------------------------------------------------------------

describe('Unlock gating', () => {
  it('rejects recruit of unlock-gated crew (ID 1) without unlock condition', async () => {
    const run = await createTransitionRun();
    const { status, body } = await recruitCrew(app, run.id, UNLOCK_CREW_ID, 0);

    expect(status).toBe(403);
    expect((body['error'] as string)).toMatch(/not been unlocked/i);
  });

  it('accepts recruit of unlock-gated crew when user has it in unlockedCrewIds', async () => {
    // Grant the unlock
    await db
      .update(users)
      .set({ unlockedCrewIds: [UNLOCK_CREW_ID] })
      .where(eq(users.clerkId, TEST_CLERK_ID));

    const run = await createTransitionRun({ bankrollCents: 50_000 });
    const { status } = await recruitCrew(app, run.id, UNLOCK_CREW_ID, 0);

    expect(status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Starter crew — IDs 16-30 available without unlock
// ---------------------------------------------------------------------------

describe('Starter crew (IDs 16-30)', () => {
  it('can recruit starter crew without any unlock condition', async () => {
    const run = await createTransitionRun({ bankrollCents: 50_000 });
    const { status, body } = await recruitCrew(app, run.id, STARTER_CREW_ID, 0);

    expect(status).toBe(200);
    // The crew should appear in slot 0 of the response
    const crewSlots = body['crewSlots'] as ({ crewId: number } | null)[];
    expect(crewSlots[0]).not.toBeNull();
    expect(crewSlots[0]?.crewId).toBe(STARTER_CREW_ID);
  });
});

// ---------------------------------------------------------------------------
// Slot placement — recruited crew appears in the correct slot
// ---------------------------------------------------------------------------

describe('Slot placement', () => {
  it('places crew in the specified slot index', async () => {
    const run = await createTransitionRun({ bankrollCents: 50_000 });

    const { status, body } = await recruitCrew(app, run.id, STARTER_CREW_ID, 3);

    expect(status).toBe(200);
    const crewSlots = body['crewSlots'] as ({ crewId: number } | null)[];
    expect(crewSlots[3]?.crewId).toBe(STARTER_CREW_ID);
    expect(crewSlots[0]).toBeNull();
    expect(crewSlots[1]).toBeNull();
    expect(crewSlots[2]).toBeNull();
    expect(crewSlots[4]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Skip recruit — neither crewId nor slotIndex → run returns to IDLE_TABLE
// ---------------------------------------------------------------------------

describe('Skip recruit', () => {
  it('skips recruitment and returns run to IDLE_TABLE with fresh shooters', async () => {
    const run = await createTransitionRun();

    const response = await app.inject({
      method:  'POST',
      url:     `/api/v1/runs/${run.id}/recruit`,
      headers: {
        'content-type':   'application/json',
        'x-test-user-id': TEST_CLERK_ID,
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body['status']).toBe('IDLE_TABLE');
    expect(body['shooters']).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Lucky Charm immediate hype floor
// ---------------------------------------------------------------------------

describe('Lucky Charm (ID 15) — immediate hype floor at recruit time', () => {
  it('grants +1.0 hype when Lucky Charm is recruited as the sole crew member', async () => {
    // Unlock Lucky Charm first
    await db
      .update(users)
      .set({ unlockedCrewIds: [LUCKY_CHARM_ID] })
      .where(eq(users.clerkId, TEST_CLERK_ID));

    // Run with hype 1.2 and no existing crew
    const run = await createTransitionRun({ bankrollCents: 50_000, hype: 1.2 });
    const { status, body } = await recruitCrew(app, run.id, LUCKY_CHARM_ID, 0);

    expect(status).toBe(200);
    // isLuckyCharmSolo && run.hype (1.2) < 2.0 → newHype = 1.2 + 1.0 = 2.2
    expect(body['hype']).toBeCloseTo(2.2, 4);
  });

  it('does NOT apply the hype floor when Lucky Charm is recruited alongside other crew', async () => {
    await db
      .update(users)
      .set({ unlockedCrewIds: [LUCKY_CHARM_ID] })
      .where(eq(users.clerkId, TEST_CLERK_ID));

    // Run that already has a Starter crew in slot 1
    const run = await createTransitionRun({
      bankrollCents: 50_000,
      hype:          1.2,
      crewSlots:     [null, { crewId: STARTER_CREW_ID, cooldownState: 0 }, null, null, null],
    });

    const { status, body } = await recruitCrew(app, run.id, LUCKY_CHARM_ID, 0);

    expect(status).toBe(200);
    // Not solo → hype unchanged at 1.2 (within float tolerance)
    expect(body['hype']).toBeCloseTo(1.2, 4);
  });

  it('does NOT apply the floor when Lucky Charm solo but hype is already ≥ 2.0', async () => {
    await db
      .update(users)
      .set({ unlockedCrewIds: [LUCKY_CHARM_ID] })
      .where(eq(users.clerkId, TEST_CLERK_ID));

    const run = await createTransitionRun({ bankrollCents: 50_000, hype: 2.5 });
    const { status, body } = await recruitCrew(app, run.id, LUCKY_CHARM_ID, 0);

    expect(status).toBe(200);
    // isLuckyCharmSolo && run.hype (2.5) >= 2.0 → condition false → hype stays 2.5
    expect(body['hype']).toBeCloseTo(2.5, 4);
  });
});

// ---------------------------------------------------------------------------
// State guard — cannot recruit outside TRANSITION status
// ---------------------------------------------------------------------------

describe('State guard', () => {
  it('returns 409 when run is in IDLE_TABLE', async () => {
    const run = await createRun(userId, { bankrollCents: 5000 }); // IDLE_TABLE by default
    const { status } = await recruitCrew(app, run.id, STARTER_CREW_ID, 0);

    expect(status).toBe(409);
  });
});
