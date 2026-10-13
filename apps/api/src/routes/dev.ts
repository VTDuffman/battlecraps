// =============================================================================
// BATTLECRAPS — DEVELOPER MODE ROUTES (FB-028)
// apps/api/src/routes/dev.ts
//
// POST /api/v1/dev/runs — create a dev run from a DevScenario.
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
  isBossMarker,
  pickEntryCharmSlot,
  type DevRunState,
  type DevScenario,
} from '@battlecraps/shared';
import { db } from '../db/client.js';
import { runs, crewDefinitions, type StoredCrewSlots } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { requireDevUser } from '../lib/devAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';
import { randomBelow } from '../lib/rng.js';
import { fetchUnacknowledgedUnlocks } from './runs.js';

// ---------------------------------------------------------------------------
// Validation — ranges are loose here; buildDevRunState() clamps precisely.
// ---------------------------------------------------------------------------

const cents = z.number().int().min(0).max(1_000_000_000);

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
      const crewIds = [...new Set(state.crew.filter((id): id is number => id !== null))];
      if (crewIds.length > 0) {
        const defs = await db
          .select({ id: crewDefinitions.id, isStarterRoster: crewDefinitions.isStarterRoster })
          .from(crewDefinitions)
          .where(inArray(crewDefinitions.id, crewIds));
        const known   = new Map(defs.map((d) => [d.id, d.isStarterRoster]));
        const unknown = crewIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return reply.status(422).send({ error: 'Unknown crew ids.', unknownCrewIds: unknown });
        }
        if (scenario.ignoreUnlocks !== true) {
          const unlocked = new Set(user.unlockedCrewIds);
          const locked   = crewIds.filter((id) => known.get(id) !== true && !unlocked.has(id));
          if (locked.length > 0) {
            return reply.status(422).send({
              error: 'Crew not unlocked on this account. Enable "Ignore unlocks" to use them.',
              lockedCrewIds: locked,
            });
          }
        }
      }

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
}
