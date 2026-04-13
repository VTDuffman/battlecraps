// =============================================================================
// BATTLECRAPS — RUN ROUTES
// apps/api/src/routes/runs.ts
//
// GET  /api/v1/runs/:id  — fetch run state (page-refresh recovery)
// POST /api/v1/runs      — create a new run for the authenticated user
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs } from '../db/schema.js';
import type { StoredCrewSlots, UserRow } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

const EMPTY_CREW_SLOTS: StoredCrewSlots = [null, null, null, null, null];

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

      return reply.send({
        bankroll:           run.bankrollCents,
        shooters:           run.shooters,
        hype:               run.hype,
        phase:              run.phase,
        status:             run.status,
        point:              run.currentPoint ?? null,
        crewSlots:          run.crewSlots,
        currentMarkerIndex: run.currentMarkerIndex,
        bets:               run.bets,
        maxBankrollCents:   (run.user as UserRow).maxBankrollCents,
        unlockedCrewIds:    (run.user as UserRow).unlockedCrewIds,
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
          bankrollCents: 25000,
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

      const body: CreateRunResponse = {
        runId:  run.id,
        run: {
          bankroll:           run.bankrollCents,
          shooters:           run.shooters,
          hype:               run.hype,
          phase:              run.phase,
          status:             run.status,
          point:              run.currentPoint ?? null,
          crewSlots:          run.crewSlots as StoredCrewSlots,
          currentMarkerIndex: run.currentMarkerIndex,
          maxBankrollCents:   user.maxBankrollCents,
          unlockedCrewIds:    user.unlockedCrewIds,
        },
      };

      return reply.status(201).send(body);
    },
  );
}
