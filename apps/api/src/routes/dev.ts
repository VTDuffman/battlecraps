// =============================================================================
// BATTLECRAPS — DEVELOPER MODE ROUTES (FB-028)
// apps/api/src/routes/dev.ts
//
// POST  /api/v1/dev/runs            — create a dev run from a DevScenario
// PATCH /api/v1/dev/runs/:id        — edit fields on a live dev run
// POST  /api/v1/dev/runs/:id/jump   — move a dev run to another marker
// POST  /api/v1/dev/runs/:id/force  — force an outcome (GAME_OVER)
// POST  /api/v1/dev/account/reset-tutorial — tutorialCompleted = false (real account)
// POST  /api/v1/dev/account/unlocks        — grant / revoke crew unlocks (real account)
//
// Real runs can never be edited: every :id route 409s unless is_dev_run.
//
// Every route is gated by requireClerkAuth + requireDevUser (404 for anyone not
// on the DEV_CLERK_IDS allowlist). Dev runs are flagged is_dev_run = true, which
// rolls.ts / leaderboard.ts / unlocks.ts use to skip all persistent side effects.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  GAUNTLET,
  buildDevRunState,
  buildTransitionEntryState,
  getBossCounterRange,
  EMPTY_DEV_BETS,
  type Bets,
  isBossMarker,
  pickEntryCharmSlot,
  type DevRunState,
  type DevScenario,
} from '@battlecraps/shared';
import { db } from '../db/client.js';
import { runs, users, crewDefinitions, type RunRow, type StoredCrewSlots, type UserRow } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { requireDevUser } from '../lib/devAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';
import { randomBelow } from '../lib/rng.js';
import { buildRunStatePayload, fetchUnacknowledgedUnlocks } from './runs.js';

// ---------------------------------------------------------------------------
// Validation — ranges are loose here; buildDevRunState() clamps precisely.
// ---------------------------------------------------------------------------

// Money columns are BIGINT (Floor 9 targets reach $60M = 6e9 cents). Cap at
// $100B, well inside Number.MAX_SAFE_INTEGER.
const cents = z.number().int().min(0).max(10_000_000_000_000);

const betsSchema = z.object({
  passLine: cents,
  odds:     cents,
  hardways: z.object({ hard4: cents, hard6: cents, hard8: cents, hard10: cents }),
});

const scenarioSchema = z.object({
  name:                 z.string().max(120).optional(),
  markerIndex:          z.number().int().min(0).max(GAUNTLET.length - 1),
  bankrollCents:        cents.optional(),
  shooters:             z.number().int().min(1).max(7).optional(),
  hype:                 z.number().min(0.25).max(10).optional(),
  consecutivePointHits: z.number().int().min(0).max(20).optional(),
  phase:                z.enum(['COME_OUT', 'POINT_ACTIVE']).optional(),
  point:                z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(8), z.literal(9), z.literal(10)]).optional(),
  bets:                 betsSchema.optional(),
  crew:                 z.array(z.number().int().positive().nullable()).max(5).optional(),
  unlockedSlots:        z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
  compPerkIds:          z.array(z.number().int().positive()).max(16).optional(),
  bossCounter:          z.number().int().min(0).max(20).optional(),
  pendingAdditiveCents: cents.optional(),
  entry:                z.enum(['table', 'transition']).optional(),
  ignoreUnlocks:        z.boolean().optional(),
});

/**
 * Checks crew ids exist and (unless ignoreUnlocks) are available to the user.
 * Returns a 422 body on failure, null when valid.
 */
async function validateCrew(
  crew:          (number | null)[],
  user:          UserRow,
  ignoreUnlocks: boolean,
): Promise<Record<string, unknown> | null> {
  const crewIds = [...new Set(crew.filter((id): id is number => id !== null))];
  if (crewIds.length === 0) return null;

  const defs = await db
    .select({ id: crewDefinitions.id, isStarterRoster: crewDefinitions.isStarterRoster })
    .from(crewDefinitions)
    .where(inArray(crewDefinitions.id, crewIds));
  const known   = new Map(defs.map((d) => [d.id, d.isStarterRoster]));
  const unknown = crewIds.filter((id) => !known.has(id));
  if (unknown.length > 0) return { error: 'Unknown crew ids.', unknownCrewIds: unknown };

  if (!ignoreUnlocks) {
    const unlocked = new Set(user.unlockedCrewIds);
    const locked   = crewIds.filter((id) => known.get(id) !== true && !unlocked.has(id));
    if (locked.length > 0) {
      return {
        error: 'Crew not unlocked on this account. Enable "Ignore unlocks" to use them.',
        lockedCrewIds: locked,
      };
    }
  }
  return null;
}

const patchSchema = z.object({
  bankrollCents:        cents.optional(),
  shooters:             z.number().int().min(0).max(7).optional(),
  hype:                 z.number().min(0.25).max(10).optional(),
  consecutivePointHits: z.number().int().min(0).max(20).optional(),
  bossCounter:          z.number().int().min(0).max(20).optional(),
  pendingAdditiveCents: cents.optional(),
  unlockedSlots:        z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
  compPerkIds:          z.array(z.number().int().positive()).max(16).optional(),
  crew:                 z.array(z.number().int().positive().nullable()).max(5).optional(),
  ignoreUnlocks:        z.boolean().optional(),
  clearBets:            z.boolean().optional(),
}).strict();

const jumpSchema = z.object({
  markerIndex: z.number().int().min(0).max(GAUNTLET.length - 1),
  entry:       z.enum(['table', 'transition']).default('transition'),
}).strict();

const unlocksSchema = z.object({
  grant:               z.array(z.number().int().positive()).max(30).optional(),
  revoke:              z.array(z.number().int().positive()).max(30).optional(),
  queueCinematic:      z.boolean().optional(),
  resetUnacknowledged: z.boolean().optional(),
}).strict();

const forceSchema = z.object({
  action: z.literal('GAME_OVER'),
}).strict();

function toStoredCrewSlots(crew: (number | null)[]): StoredCrewSlots {
  const slot = (i: number) => {
    const id = crew[i];
    return id === null || id === undefined ? null : { crewId: id, cooldownState: 0 };
  };
  return [slot(0), slot(1), slot(2), slot(3), slot(4)];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function devPlugin(app: FastifyInstance): Promise<void> {
  app.post(
    '/dev/runs',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const parsed = scenarioSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid scenario.', issues: parsed.error.issues });
      }
      const scenario: DevScenario = parsed.data;

      // ── 1. Build state ───────────────────────────────────────────────────
      const state: DevRunState =
        (scenario.entry === 'transition' ? buildTransitionEntryState(scenario) : null) ??
        buildDevRunState(scenario);

      // ── 2. Validate crew against the roster (and unlocks unless ignored) ──
      const crewError = await validateCrew(state.crew, user, scenario.ignoreUnlocks === true);
      if (crewError) return reply.status(422).send(crewError);

      const crewSlots = toStoredCrewSlots(state.crew);

      // ── 3. Le Prix entry charm — same pick as the real pub exit ──────────
      // Only when the scenario didn't pin a slot and the run starts at the boss.
      let bossPointHits = state.bossPointHits;
      const startsAtLePrix =
        isBossMarker(state.currentMarkerIndex) &&
        GAUNTLET[state.currentMarkerIndex]?.boss?.rule === 'DISABLE_CREW';
      if (startsAtLePrix && (scenario.bossCounter === undefined || scenario.entry === 'transition')) {
        bossPointHits = pickEntryCharmSlot(crewSlots, state.unlockedSlots, randomBelow) ?? 0;
      }

      // ── 4. Retire the user's other active dev runs (real runs untouched) ──
      await db
        .update(runs)
        .set({ status: 'GAME_OVER', updatedAt: new Date() })
        .where(and(eq(runs.userId, user.id), eq(runs.isDevRun, true), ne(runs.status, 'GAME_OVER')));

      // ── 5. Insert ────────────────────────────────────────────────────────
      const inserted = await db
        .insert(runs)
        .values({
          userId:               user.id,
          isDevRun:             true,
          status:               state.status,
          phase:                state.phase,
          currentPoint:         state.currentPoint,
          bankrollCents:        state.bankrollCents,
          pendingAdditiveCents: state.pendingAdditiveCents,
          shooters:             state.shooters,
          currentMarkerIndex:   state.currentMarkerIndex,
          floor:                state.floor,
          hype:                 state.hype,
          consecutivePointHits: state.consecutivePointHits,
          bossPointHits,
          bets:                 state.bets,
          crewSlots,
          compPerkIds:          state.compPerkIds,
          unlockedSlots:        state.unlockedSlots,
          peakBankrollCents:    state.bankrollCents,
          // JS Date (ms precision) — the optimistic lock compares updatedAt via a
          // JS Date, so a µs-precision defaultNow() would 409 every roll.
          updatedAt:            new Date(),
        })
        .returning();

      const run = inserted[0];
      if (run === undefined) return reply.status(500).send({ error: 'Failed to create dev run.' });

      req.log.info({ runId: run.id, scenario: scenario.name ?? null, markerIndex: run.currentMarkerIndex }, '[dev] created dev run');

      const unacknowledgedUnlocks = await fetchUnacknowledgedUnlocks(user.unacknowledgedUnlockIds);

      // Same shape as POST /runs so the client reuses its connectToRun path.
      return reply.status(201).send({
        runId: run.id,
        run: {
          bankroll:              run.bankrollCents,
          shooters:              run.shooters,
          hype:                  run.hype,
          phase:                 run.phase,
          status:                run.status,
          point:                 run.currentPoint ?? null,
          crewSlots:             run.crewSlots,
          currentMarkerIndex:    run.currentMarkerIndex,
          bets:                  run.bets,
          maxBankrollCents:      user.maxBankrollCents,
          unlockedCrewIds:       user.unlockedCrewIds,
          tutorialCompleted:     user.tutorialCompleted,
          unacknowledgedUnlocks,
          highestMarkerReached:  user.highestMarkerReached,
          unlockedSlots:         run.unlockedSlots as 3 | 4 | 5,
          bossPointHits:         run.bossPointHits,
          consecutivePointHits:  run.consecutivePointHits,
          isDevRun:              true,
        },
      });
    },
  );

  // ── PATCH /dev/runs/:id — edit a live dev run ─────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/dev/runs/:id',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid patch.', issues: parsed.error.issues });
      const patch = parsed.data;

      const loaded = await loadEditableDevRun(req.params.id, user.id);
      if ('code' in loaded) return reply.status(loaded.code).send({ error: loaded.error });
      const run = loaded.run;

      const updates: Partial<typeof runs.$inferInsert> = {};
      const unlockedSlots = patch.unlockedSlots ?? (run.unlockedSlots as 3 | 4 | 5);
      if (patch.unlockedSlots !== undefined) updates.unlockedSlots = patch.unlockedSlots;

      if (patch.crew !== undefined) {
        const crew = patch.crew.slice(0, unlockedSlots);
        const crewError = await validateCrew(crew, user, patch.ignoreUnlocks === true);
        if (crewError) return reply.status(422).send(crewError);
        updates.crewSlots = toStoredCrewSlots(crew);
      }

      if (patch.bankrollCents        !== undefined) updates.bankrollCents        = patch.bankrollCents;
      if (patch.shooters             !== undefined) updates.shooters             = patch.shooters;
      if (patch.hype                 !== undefined) updates.hype                 = patch.hype;
      if (patch.consecutivePointHits !== undefined) updates.consecutivePointHits = patch.consecutivePointHits;
      if (patch.pendingAdditiveCents !== undefined) updates.pendingAdditiveCents = patch.pendingAdditiveCents;
      if (patch.compPerkIds          !== undefined) updates.compPerkIds          = [...new Set(patch.compPerkIds)];

      if (patch.bossCounter !== undefined) {
        const range = getBossCounterRange(run.currentMarkerIndex, unlockedSlots);
        if (range === null) {
          return reply.status(422).send({ error: 'This marker has no boss counter to set.' });
        }
        updates.bossPointHits = Math.min(range.max, Math.max(range.min, patch.bossCounter));
      }

      if (patch.clearBets === true) {
        // Refund what comes off the table. The pass line stays once a point is
        // set (it's contract bet); odds and hardways come down.
        const bets = run.bets as Bets;
        const keepPassLine = run.phase === 'POINT_ACTIVE' ? bets.passLine : 0;
        const removed = sumBets(bets) - keepPassLine;
        updates.bets = { ...EMPTY_DEV_BETS, passLine: keepPassLine };
        updates.bankrollCents = (updates.bankrollCents ?? run.bankrollCents) + removed;
      }

      if (Object.keys(updates).length === 0) {
        return reply.send(await buildRunStatePayload(run, user));
      }

      const updated = await db
        .update(runs)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(runs.id, run.id), eq(runs.updatedAt, run.updatedAt)))
        .returning();
      const row = updated[0];
      if (!row) return reply.status(409).send({ error: 'Conflict: run changed. Retry.' });

      req.log.info({ runId: row.id, fields: Object.keys(updates) }, '[dev] patched dev run');
      return reply.send(await buildRunStatePayload(row, user));
    },
  );

  // ── POST /dev/runs/:id/jump — move a dev run to another marker ────────────
  // Default entry 'transition' plays the real clear → celebration → pub path:
  // the run lands one marker early at its target and the client auto-advances.
  app.post<{ Params: { id: string } }>(
    '/dev/runs/:id/jump',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const parsed = jumpSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid jump.', issues: parsed.error.issues });

      const loaded = await loadEditableDevRun(req.params.id, user.id);
      if ('code' in loaded) return reply.status(loaded.code).send({ error: loaded.error });
      const run = loaded.run;

      // Keep the current crew; everything else comes from realistic defaults.
      const currentCrew = (run.crewSlots as StoredCrewSlots).map((s) => s?.crewId ?? null);
      const scenario: DevScenario = {
        markerIndex:   parsed.data.markerIndex,
        entry:         parsed.data.entry,
        crew:          currentCrew,
        ignoreUnlocks: true,
      };
      const state =
        (scenario.entry === 'transition' ? buildTransitionEntryState(scenario) : null) ??
        buildDevRunState(scenario);
      const crewSlots = toStoredCrewSlots(state.crew);

      let bossPointHits = state.bossPointHits;
      if (isBossMarker(state.currentMarkerIndex) && GAUNTLET[state.currentMarkerIndex]?.boss?.rule === 'DISABLE_CREW') {
        bossPointHits = pickEntryCharmSlot(crewSlots, state.unlockedSlots, randomBelow) ?? 0;
      }

      const updated = await db
        .update(runs)
        .set({
          status:                state.status,
          phase:                 state.phase,
          currentPoint:          state.currentPoint,
          bankrollCents:         state.bankrollCents,
          pendingAdditiveCents:  state.pendingAdditiveCents,
          shooters:              state.shooters,
          currentMarkerIndex:    state.currentMarkerIndex,
          floor:                 state.floor,
          hype:                  state.hype,
          consecutivePointHits:  state.consecutivePointHits,
          bossPointHits,
          bets:                  state.bets,
          crewSlots,
          compPerkIds:           state.compPerkIds,
          unlockedSlots:         state.unlockedSlots,
          shooterRollCount:      0,
          pointPhaseBlankStreak: 0,
          previousRollTotal:     null,
          mechanicFreeze:        null,
          updatedAt:             new Date(),
        })
        .where(and(eq(runs.id, run.id), eq(runs.updatedAt, run.updatedAt)))
        .returning();
      const row = updated[0];
      if (!row) return reply.status(409).send({ error: 'Conflict: run changed. Retry.' });

      req.log.info({ runId: row.id, to: parsed.data.markerIndex, entry: parsed.data.entry }, '[dev] jumped dev run');
      return reply.send(await buildRunStatePayload(row, user));
    },
  );

  // ── POST /dev/runs/:id/force — force an outcome on a dev run ──────────────
  app.post<{ Params: { id: string } }>(
    '/dev/runs/:id/force',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const parsed = forceSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid action.', issues: parsed.error.issues });

      const loaded = await loadEditableDevRun(req.params.id, user.id);
      if ('code' in loaded) return reply.status(loaded.code).send({ error: loaded.error });

      const updated = await db
        .update(runs)
        .set({ status: 'GAME_OVER', updatedAt: new Date() })
        .where(and(eq(runs.id, loaded.run.id), eq(runs.updatedAt, loaded.run.updatedAt)))
        .returning();
      const row = updated[0];
      if (!row) return reply.status(409).send({ error: 'Conflict: run changed. Retry.' });

      req.log.info({ runId: row.id, action: parsed.data.action }, '[dev] forced outcome');
      return reply.send(await buildRunStatePayload(row, user));
    },
  );
}

/**
 * Account routes (FB-028 Phase 5). These change the developer's REAL account
 * (the only account requireDevUser lets through); the UI confirms each action.
 */
export async function devAccountPlugin(app: FastifyInstance): Promise<void> {
  const accountState = (u: UserRow) => ({
    tutorialCompleted:       u.tutorialCompleted,
    unlockedCrewIds:         u.unlockedCrewIds,
    unacknowledgedUnlockIds: u.unacknowledgedUnlockIds,
  });

  // ── POST /dev/account/reset-tutorial ─────────────────────────────────────
  // Shared foundation for FB-017 (player-facing tutorial replay).
  app.post(
    '/dev/account/reset-tutorial',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const [updated] = await db
        .update(users)
        .set({ tutorialCompleted: false, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      if (!updated) return reply.status(500).send({ error: 'Update failed.' });

      req.log.info({ userId: user.id }, '[dev] tutorial reset');
      return reply.send(accountState(updated));
    },
  );

  // ── POST /dev/account/unlocks ────────────────────────────────────────────
  // grant: add crew to unlockedCrewIds (queueCinematic also queues the unlock
  //        cinematic via unacknowledgedUnlockIds).
  // revoke: remove crew AND clear their unlock progress so they can be re-earned.
  // resetUnacknowledged: empty the pending-cinematic queue.
  app.post(
    '/dev/account/unlocks',
    { preHandler: [requireClerkAuth, requireDevUser] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const parsed = unlocksSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request.', issues: parsed.error.issues });
      const { grant = [], revoke = [], queueCinematic = false, resetUnacknowledged = false } = parsed.data;

      // Only unlock-gated crew can be granted/revoked (starters are always available).
      const ids = [...new Set([...grant, ...revoke])];
      if (ids.length > 0) {
        const defs = await db
          .select({ id: crewDefinitions.id, isStarterRoster: crewDefinitions.isStarterRoster })
          .from(crewDefinitions)
          .where(inArray(crewDefinitions.id, ids));
        const gated = new Set(defs.filter((d) => !d.isStarterRoster).map((d) => d.id));
        const invalid = ids.filter((id) => !gated.has(id));
        if (invalid.length > 0) {
          return reply.status(422).send({ error: 'Only unlock-gated crew can be granted or revoked.', invalidCrewIds: invalid });
        }
      }

      const revokeSet = new Set(revoke);
      const newlyGranted = grant.filter((id) => !user.unlockedCrewIds.includes(id) && !revokeSet.has(id));
      const unlockedCrewIds = [...new Set([...user.unlockedCrewIds, ...grant])].filter((id) => !revokeSet.has(id));

      let unacknowledgedUnlockIds = resetUnacknowledged ? [] : user.unacknowledgedUnlockIds;
      unacknowledgedUnlockIds = unacknowledgedUnlockIds.filter((id) => !revokeSet.has(id));
      if (queueCinematic) unacknowledgedUnlockIds = [...new Set([...unacknowledgedUnlockIds, ...newlyGranted])];

      const unlockProgress = { ...user.unlockProgress };
      for (const id of revoke) delete unlockProgress[id];

      const [updated] = await db
        .update(users)
        .set({ unlockedCrewIds, unacknowledgedUnlockIds, unlockProgress, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      if (!updated) return reply.status(500).send({ error: 'Update failed.' });

      req.log.info({ userId: user.id, grant, revoke, queueCinematic, resetUnacknowledged }, '[dev] unlocks changed');
      return reply.send(accountState(updated));
    },
  );
}

/**
 * Loads a run for a dev edit. 404 when missing or owned by someone else (no
 * existence leak), 409 when it isn't a dev run or is mid-settlement / over.
 */
async function loadEditableDevRun(
  runId:  string,
  userId: string,
): Promise<{ run: RunRow } | { code: 404 | 409; error: string }> {
  if (!z.string().uuid().safeParse(runId).success) return { code: 404, error: 'Not found' };
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run || run.userId !== userId) return { code: 404, error: 'Not found' };
  if (!run.isDevRun) return { code: 409, error: 'Not a dev run. Real runs can never be edited.' };
  if (run.status === 'GAME_OVER' || run.status === 'RESOLUTION') {
    return { code: 409, error: `Cannot edit a run in status "${run.status}".` };
  }
  return { run };
}

function sumBets(b: Bets): number {
  return b.passLine + b.odds + b.hardways.hard4 + b.hardways.hard6 + b.hardways.hard8 + b.hardways.hard10;
}
