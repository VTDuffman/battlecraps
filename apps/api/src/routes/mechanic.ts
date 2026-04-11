// =============================================================================
// BATTLECRAPS — POST /runs/:id/mechanic-freeze
// apps/api/src/routes/mechanic.ts
//
// Activates The Mechanic's freeze ability: the player picks a die face (1–6)
// and that die is held at that value for the next 4 rolls, or until the
// shooter sevens out — whichever comes first.
//
// Rules:
//   - Run must be IDLE_TABLE or POINT_ACTIVE (not RESOLUTION / TRANSITION / GAME_OVER).
//   - The Mechanic (crewId 3) must be seated in some slot with cooldownState === 0.
//   - No freeze may already be active (mechanicFreeze must be null).
//   - lockedValue must be an integer 1–6.
//
// On success:
//   - GameState.mechanicFreeze is set to { lockedValue, rollsRemaining: 4 }.
//   - The Mechanic's cooldownState is set to 1 (per_shooter — resets on new shooter).
//   - Returns { mechanicFreeze }.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, type StoredCrewSlots } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

const MECHANIC_CREW_ID = 3;

interface FreezeParams { id: string }
interface FreezeBody  { lockedValue: number }

const freezeBodySchema = {
  type: 'object',
  required: ['lockedValue'],
  properties: {
    lockedValue: { type: 'integer', minimum: 1, maximum: 6 },
  },
  additionalProperties: false,
} as const;

export async function mechanicPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Params: FreezeParams; Body: FreezeBody }>(
    '/runs/:id/mechanic-freeze',
    { schema: { body: freezeBodySchema }, preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Params: FreezeParams; Body: FreezeBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ────────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }
      const userId = user.id;

      const runId      = request.params.id;
      const { lockedValue } = request.body;

      // ── 1. Load run ──────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });
      if (run.userId !== userId) return reply.status(403).send({ error: 'Forbidden.' });

      // ── 2. State guard ───────────────────────────────────────────────────────
      if (run.status !== 'IDLE_TABLE' && run.status !== 'POINT_ACTIVE') {
        return reply.status(409).send({
          error: `Cannot set freeze in status "${run.status}". Must be IDLE_TABLE or POINT_ACTIVE.`,
        });
      }

      // ── 3. Mechanic must be seated and ready ─────────────────────────────────
      const mechanicSlotIndex = run.crewSlots.findIndex(
        (s) => s?.crewId === MECHANIC_CREW_ID && s.cooldownState === 0,
      );
      if (mechanicSlotIndex === -1) {
        return reply.status(422).send({
          error: 'The Mechanic is not on your crew or is already spent this shooter.',
        });
      }

      // ── 4. No freeze already active ──────────────────────────────────────────
      if (run.mechanicFreeze !== null && run.mechanicFreeze !== undefined) {
        return reply.status(422).send({
          error: 'A Mechanic freeze is already active.',
        });
      }

      // ── 5. Set freeze + mark Mechanic spent ──────────────────────────────────
      const newCrewSlots: StoredCrewSlots = [...run.crewSlots] as StoredCrewSlots;
      newCrewSlots[mechanicSlotIndex] = { crewId: MECHANIC_CREW_ID, cooldownState: 1 };

      const newFreeze = { lockedValue, rollsRemaining: 4 };

      // ── 6. Persist (optimistic lock via updatedAt) ────────────────────────────
      const updated = await db
        .update(runs)
        .set({
          crewSlots:      newCrewSlots,
          mechanicFreeze: newFreeze,
          updatedAt:      new Date(),
        })
        .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
        .returning();

      if (!updated[0]) {
        return reply.status(409).send({
          error: 'Conflict: run was modified by another request. Please retry.',
        });
      }

      return reply.send({
        mechanicFreeze: updated[0].mechanicFreeze,
        crewSlots:      updated[0].crewSlots,
      });
    },
  );
}
