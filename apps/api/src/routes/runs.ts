// =============================================================================
// BATTLECRAPS — RUN ROUTES
// apps/api/src/routes/runs.ts
//
// GET  /api/v1/runs/:id  — fetch run state (page-refresh recovery)
// POST /api/v1/runs      — create a new run for the authenticated user
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, crewDefinitions } from '../db/schema.js';
import type { StoredCrewSlots, UserRow } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

const EMPTY_CREW_SLOTS: StoredCrewSlots = [null, null, null, null, null];

interface UnacknowledgedUnlock {
  id:                  number;
  name:                string;
  rarity:              string;
  visualId:            string;
  briefDescription:    string | null;
  detailedDescription: string | null;
}

async function fetchUnacknowledgedUnlocks(ids: number[]): Promise<UnacknowledgedUnlock[]> {
  if (ids.length === 0) return [];
  const defs = await db.select().from(crewDefinitions).where(inArray(crewDefinitions.id, ids));
  const defMap = new Map(defs.map(d => [d.id, d]));
  return ids.flatMap(id => {
    const d = defMap.get(id);
    if (!d) return [];
    return [{
      id:                  d.id,
      name:                d.name,
      rarity:              d.rarity,
      visualId:            d.visualId,
      briefDescription:    d.briefDescription,
      detailedDescription: d.detailedDescription,
    }];
  });
}

interface CreateRunResponse {
  runId: string;
  run: {
    bankroll:           number;
    shooters:           number;
    hype:               number;
    phase:              string;
    status:             string;
    point:              number | null;
    crewSlots:          StoredCrewSlots;
    currentMarkerIndex: number;
    /** Highest bankroll the player has ever reached, in cents (across all runs). */
    maxBankrollCents:   number;
    /** Crew IDs the player has permanently unlocked (original 15). */
    unlockedCrewIds:    number[];
    /** True if this player has already completed or skipped the tutorial. */
    tutorialCompleted:  boolean;
    /** Unlocks earned but not yet shown to the player via cinematic sequence. */
    unacknowledgedUnlocks: UnacknowledgedUnlock[];
    /** Highest gauntlet marker index (0-based) the player has ever reached. */
    highestMarkerReached: number;
  };
}

export async function bootstrapPlugin(app: FastifyInstance): Promise<void> {
  // ── GET /runs/:id — lightweight run state fetch ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/runs/:id',
    { preHandler: [requireClerkAuth] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      const userId = user.id;

      const run = await db.query.runs.findFirst({
        where: eq(runs.id, req.params.id),
        with: { user: true },
      });
      if (!run) return reply.status(404).send({ error: 'Not found' });
      if (run.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });

      const userRow = run.user as UserRow;
      const unacknowledgedUnlocks = await fetchUnacknowledgedUnlocks(userRow.unacknowledgedUnlockIds);

      return reply.send({
        bankroll:              run.bankrollCents,
        shooters:              run.shooters,
        hype:                  run.hype,
        phase:                 run.phase,
        status:                run.status,
        point:                 run.currentPoint ?? null,
        crewSlots:             run.crewSlots,
        currentMarkerIndex:    run.currentMarkerIndex,
        bets:                  run.bets,
        maxBankrollCents:      userRow.maxBankrollCents,
        unlockedCrewIds:       userRow.unlockedCrewIds,
        tutorialCompleted:     userRow.tutorialCompleted,
        unacknowledgedUnlocks,
        highestMarkerReached:  userRow.highestMarkerReached,
      });
    },
  );

  // ── POST /runs — create a new run for the authenticated user ──────────────
  app.post(
    '/runs',
    { preHandler: [requireClerkAuth] },
    async (req, reply): Promise<void> => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const inserted = await db
        .insert(runs)
        .values({
          userId:        user.id,
          status:        'IDLE_TABLE',
          phase:         'COME_OUT',
          bankrollCents: 3000,   // $30 starting bankroll — below the $50 Loading Dock marker 0 so the tutorial beats play out correctly
          shooters:      5,
          hype:          1.0,
          crewSlots:     EMPTY_CREW_SLOTS,
          // Use a JS Date (ms precision) instead of defaultNow() (µs precision).
          // The optimistic-lock WHERE clause compares updatedAt via a JS Date, so
          // a µs-precision default will never match → every roll returns 409.
          updatedAt:     new Date(),
        })
        .returning();

      const run = inserted[0];
      if (run === undefined) {
        return reply.status(500).send({ error: 'Failed to create run.' });
      }

      app.log.info(`[runs] Created run ${run.id} for user ${user.id}`);

      const unacknowledgedUnlocks = await fetchUnacknowledgedUnlocks(user.unacknowledgedUnlockIds);

      const body: CreateRunResponse = {
        runId:  run.id,
        run: {
          bankroll:              run.bankrollCents,
          shooters:              run.shooters,
          hype:                  run.hype,
          phase:                 run.phase,
          status:                run.status,
          point:                 run.currentPoint ?? null,
          crewSlots:             run.crewSlots as StoredCrewSlots,
          currentMarkerIndex:    run.currentMarkerIndex,
          maxBankrollCents:      user.maxBankrollCents,
          unlockedCrewIds:       user.unlockedCrewIds,
          tutorialCompleted:     user.tutorialCompleted,
          unacknowledgedUnlocks,
          highestMarkerReached:  user.highestMarkerReached,
        },
      };

      return reply.status(201).send(body);
    },
  );
}
