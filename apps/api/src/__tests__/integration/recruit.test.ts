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
import { users, runs } from '../../db/schema.js';
import {
  buildTestApp,
  createTestUser,
  createRun,
  recruitCrew,
  getPubDraft,
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

// The Pub draft is saved on the run; hiring is only allowed from it. By default
// the tests offer the crew they hire.
const OFFERED = { crewIds: [STARTER_CREW_ID, UNLOCK_CREW_ID, LUCKY_CHARM_ID], guaranteedIds: [] as number[] };

async function createTransitionRun(overrides = {}) {
  return createRun(userId, {
    status:             'TRANSITION',
    currentMarkerIndex: 1, // just cleared marker 0 → marker 1 is next
    bankrollCents:      5000,
    pubDraft:           OFFERED,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Unlock gating — IDs 1-15 require explicit unlock
// ---------------------------------------------------------------------------

describe('Unlock gating', () => {
  it('rejects recruit of unlock-gated crew (ID 1) that was not offered', async () => {
    // A locked crew member never appears in a draft, so it can't be hired.
    const run = await createTransitionRun({ pubDraft: { crewIds: [STARTER_CREW_ID], guaranteedIds: [] } });
    const { status, body } = await recruitCrew(app, run.id, UNLOCK_CREW_ID, 0);

    expect(status).toBe(403);
    expect((body['error'] as string)).toMatch(/wasn't offered/i);
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
    // Slot 3 (the 4th slot) only exists once it's unlocked (FB-025: runs start
    // with 3 active slots; Board Seat / Cargo Hold add the 4th and 5th).
    const run = await createTransitionRun({ bankrollCents: 50_000, unlockedSlots: 5 });

    const { status, body } = await recruitCrew(app, run.id, STARTER_CREW_ID, 3);

    expect(status).toBe(200);
    const crewSlots = body['crewSlots'] as ({ crewId: number } | null)[];
    expect(crewSlots[3]?.crewId).toBe(STARTER_CREW_ID);
    expect(crewSlots[0]).toBeNull();
    expect(crewSlots[1]).toBeNull();
    expect(crewSlots[2]).toBeNull();
    expect(crewSlots[4]).toBeNull();
  });

  it('rejects a slot that is not yet unlocked (400)', async () => {
    const run = await createTransitionRun({ bankrollCents: 50_000 }); // default 3 slots

    const { status, body } = await recruitCrew(app, run.id, STARTER_CREW_ID, 3);

    expect(status).toBe(400);
    expect(body['error']).toBe('Slot not yet unlocked.');
  });

  it('the pub right after The Executive offers the Board Seat slot (FB-025)', async () => {
    // Just beat The Executive (marker 11): still 3 slots stored, slot 4 is the comp.
    const run = await createTransitionRun({ bankrollCents: 2_000_000, currentMarkerIndex: 12 });

    const { status, body } = await recruitCrew(app, run.id, STARTER_CREW_ID, 3);

    expect(status).toBe(200);
    const crewSlots = body['crewSlots'] as ({ crewId: number } | null)[];
    expect(crewSlots[3]?.crewId).toBe(STARTER_CREW_ID);
    expect(body['unlockedSlots']).toBe(4);
  });

  it('a pub after an ordinary marker does not offer an extra slot', async () => {
    const run = await createTransitionRun({ bankrollCents: 2_000_000, currentMarkerIndex: 11 });

    const { status } = await recruitCrew(app, run.id, STARTER_CREW_ID, 3);

    expect(status).toBe(400);
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

// ---------------------------------------------------------------------------
// Pub draft is fixed for the visit — refreshing must not re-roll it, and
// hiring is only allowed from what was offered.
// ---------------------------------------------------------------------------

describe('Pub draft persistence', () => {
  it('returns the same crew on every fetch during one Pub visit (no refresh re-roll)', async () => {
    const run = await createTransitionRun({ pubDraft: null });
    const first  = await getPubDraft(app, run.id);
    const second = await getPubDraft(app, run.id);
    const third  = await getPubDraft(app, run.id);

    expect(first.status).toBe(200);
    expect(first.draft.length).toBe(3); // Floor 1 offers 3
    const ids = first.draft.map((c) => c.id);
    expect(second.draft.map((c) => c.id)).toEqual(ids);
    expect(third.draft.map((c) => c.id)).toEqual(ids);
  });

  it('rejects hiring a crew member who was not offered', async () => {
    const run = await createTransitionRun({ pubDraft: null, bankrollCents: 50_000 });
    const { draft } = await getPubDraft(app, run.id);
    const offered = new Set(draft.map((c) => c.id));
    const notOffered = [16, 17, 18, 19, 20, 21, 22].find((id) => !offered.has(id))!;

    const { status, body } = await recruitCrew(app, run.id, notOffered, 0);
    expect(status).toBe(403);
    expect(body['error']).toMatch(/wasn't offered/i);
  });

  it('allows hiring from the draft and clears it when leaving the Pub', async () => {
    const run = await createTransitionRun({ pubDraft: null, bankrollCents: 50_000 });
    const { draft } = await getPubDraft(app, run.id);
    const pick = draft[0]!.id;

    const { status } = await recruitCrew(app, run.id, pick, 0);
    expect(status).toBe(200);

    const after = await db.query.runs.findFirst({ where: eq(runs.id, run.id) });
    expect(after?.pubDraft).toBeNull();
  });

  it('rejects hiring when no draft has been generated (client must load the Pub)', async () => {
    const run = await createTransitionRun({ pubDraft: null, bankrollCents: 50_000 });
    const { status } = await recruitCrew(app, run.id, STARTER_CREW_ID, 0);
    expect(status).toBe(409);
  });

  it('adds a crew member unlocked after the draft was saved, keeping the rest', async () => {
    const run = await createTransitionRun({ pubDraft: null, bankrollCents: 50_000 });
    const first = await getPubDraft(app, run.id);

    // The unlock lands after the draft was generated (fire-and-forget evaluateUnlocks).
    await db.update(users).set({ unlockedCrewIds: [UNLOCK_CREW_ID] }).where(eq(users.clerkId, TEST_CLERK_ID));
    await db.update(runs).set({ guaranteedPubDraftIds: [UNLOCK_CREW_ID] }).where(eq(runs.id, run.id));

    const second = await getPubDraft(app, run.id);
    const ids = second.draft.map((c) => c.id);
    expect(ids).toEqual([...first.draft.map((c) => c.id), UNLOCK_CREW_ID]);
    expect(second.draft.find((c) => c.id === UNLOCK_CREW_ID)?.isGuaranteed).toBe(true);

    const { status } = await recruitCrew(app, run.id, UNLOCK_CREW_ID, 0);
    expect(status).toBe(200);
  });
});

