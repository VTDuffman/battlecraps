// =============================================================================
// BATTLECRAPS — DEV BOOTSTRAP ENDPOINT
// apps/api/src/routes/bootstrap.ts
//
// POST /api/v1/dev/bootstrap
//
// One-shot endpoint used by the frontend dev harness. Creates (or re-hydrates)
// a throwaway user and starts a fresh run with empty crew slots.
//
// ⚠️  THIS ENDPOINT MUST BE DISABLED IN PRODUCTION.
//     It is guarded by the NODE_ENV check below and should be removed or
//     feature-flagged before any public deployment.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, runs } from '../db/schema.js';
import type { StoredCrewSlots } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Starter crew slots — all empty so the player recruits their own crew
// from the Seven-Proof Pub after each gauntlet marker.
// ---------------------------------------------------------------------------
const DEV_CREW_SLOTS: StoredCrewSlots = [null, null, null, null, null];

// Stable dev user credentials — same across restarts so localStorage survives.
const DEV_USER_EMAIL    = 'dev@battlecraps.local';
const DEV_USER_NAME     = 'Dev Player';
const DEV_USER_PASSWORD = 'not-a-real-hash'; // auth is out of scope for Phase 4

interface BootstrapResponse {
  userId: string;
  runId:  string;
  run: {
    bankroll:           number;
    shooters:           number;
    hype:               number;
    phase:              string;
    status:             string;
    point:              number | null;
    crewSlots:          StoredCrewSlots;
    currentMarkerIndex: number;
  };
}

export async function bootstrapPlugin(app: FastifyInstance): Promise<void> {
  // ── GET /runs/:id — lightweight run state fetch ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/runs/:id',
    async (req, reply) => {
      const userId = req.headers['x-user-id'];
      if (typeof userId !== 'string') return reply.status(401).send({ error: 'Unauthorized' });

      const run = await db.query.runs.findFirst({ where: eq(runs.id, req.params.id) });
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
      });
    },
  );

  app.post<{
    Body: {
      startingBankroll?: number;
      startingShooters?: number;
      startingHype?:     number;
      startingCrew?:     Array<{ crewId: number; slot: number }>;
    };
  }>(
    '/dev/bootstrap',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            startingBankroll: { type: 'number',  minimum: 0 },
            startingShooters: { type: 'integer', minimum: 1, maximum: 20 },
            startingHype:     { type: 'number',  minimum: 0 },
            startingCrew: {
              type: 'array',
              maxItems: 5,
              items: {
                type: 'object',
                required: ['crewId', 'slot'],
                properties: {
                  crewId: { type: 'integer', minimum: 1 },
                  slot:   { type: 'integer', minimum: 0, maximum: 4 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply): Promise<void> => {
      const startingBankroll = req.body?.startingBankroll ?? 250;
      const startingShooters = req.body?.startingShooters ?? 5;
      const startingHype     = req.body?.startingHype     ?? 1.0;
      const startingCrew     = req.body?.startingCrew     ?? [];

      // ── 1. Find or create the stable dev user ────────────────────────────
      let user = await db.query.users.findFirst({
        where: eq(users.email, DEV_USER_EMAIL),
      });

      if (user === undefined) {
        const inserted = await db
          .insert(users)
          .values({
            username:     DEV_USER_NAME,
            email:        DEV_USER_EMAIL,
            passwordHash: DEV_USER_PASSWORD,
          })
          .returning();

        user = inserted[0];
        if (user === undefined) {
          return reply.status(500).send({ error: 'Failed to create dev user.' });
        }
        app.log.info(`[bootstrap] Created dev user ${user.id}`);
      }

      // ── 2. Build crew slots ───────────────────────────────────────────────
      // Start from all-empty and populate from the startingCrew array.
      // Duplicate slots (same slot index specified twice) take the last entry.
      const crewSlots: StoredCrewSlots = [...DEV_CREW_SLOTS];
      for (const { crewId, slot } of startingCrew) {
        crewSlots[slot] = { crewId, cooldownState: 0 };
      }

      // ── 3. Create a fresh run ─────────────────────────────────────────────
      // We always create a NEW run so each page refresh gives a clean slate.
      const inserted = await db
        .insert(runs)
        .values({
          userId:       user.id,
          status:       'IDLE_TABLE',
          phase:        'COME_OUT',
          bankrollCents: Math.round(startingBankroll * 100),
          shooters:     startingShooters,
          hype:         startingHype,
          crewSlots,
          // Use a JS Date (ms precision) instead of defaultNow() (µs precision).
          // PostgreSQL timestamps have 6-decimal precision but JS Date only has 3.
          // The optimistic-lock WHERE clause compares updatedAt via a JS Date, so
          // a µs-precision default will never match → every roll returns 409.
          updatedAt:    new Date(),
        })
        .returning();

      const run = inserted[0];
      if (run === undefined) {
        return reply.status(500).send({ error: 'Failed to create dev run.' });
      }

      app.log.info(`[bootstrap] Created run ${run.id} for user ${user.id}`);

      const body: BootstrapResponse = {
        userId: user.id,
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
        },
      };

      return reply.status(201).send(body);
    },
  );
}
