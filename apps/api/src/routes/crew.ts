// =============================================================================
// BATTLECRAPS — DELETE /runs/:id/crew/:slotIndex
// apps/api/src/routes/crew.ts
//
// Fires (removes) a crew member from a specific slot in the player's rail.
//
// Rules:
//   - Allowed in any status except GAME_OVER (can fire at table, mid-point,
//     or at the pub to make room before hiring).
//   - No bankroll refund — you paid for them, they're gone.
//   - Slot is nulled out and the run is persisted immediately.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, type StoredCrewSlots } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

interface FireParams {
  id:        string;  // run UUID
  slotIndex: string;  // 0–4, parsed from URL
}

export async function crewPlugin(app: FastifyInstance): Promise<void> {
  app.delete<{ Params: FireParams }>(
    '/runs/:id/crew/:slotIndex',
    { preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Params: FireParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ────────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }
      const userId = user.id;

      const runId    = request.params.id;
      const slotIndex = parseInt(request.params.slotIndex, 10);

      // ── 1. Validate slotIndex ────────────────────────────────────────────────
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 4) {
        return reply.status(422).send({ error: 'slotIndex must be 0–4.' });
      }

      // ── 2. Load run ──────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });
      if (run.userId !== userId) return reply.status(403).send({ error: 'Forbidden.' });

      // ── 3. State guard ───────────────────────────────────────────────────────
      if (run.status === 'GAME_OVER') {
        return reply.status(409).send({
          error: 'Cannot fire crew after game over.',
        });
      }

      // ── 4. Validate slot is occupied ─────────────────────────────────────────
      if (run.crewSlots[slotIndex] === null) {
        return reply.status(422).send({ error: `Slot ${slotIndex} is already empty.` });
      }

      // ── 5. Null out the slot ─────────────────────────────────────────────────
      const newCrewSlots: StoredCrewSlots = [...run.crewSlots] as StoredCrewSlots;
      newCrewSlots[slotIndex] = null;

      // If The Mechanic is being fired while a freeze is active, clear it.
      const firedCrewId = run.crewSlots[slotIndex]?.crewId;
      const clearFreeze = firedCrewId === 3 && run.mechanicFreeze != null;

      // ── 6. Persist (optimistic lock via updatedAt) ────────────────────────────
      const updated = await db
        .update(runs)
        .set({
          crewSlots:      newCrewSlots,
          ...(clearFreeze ? { mechanicFreeze: null } : {}),
          updatedAt:      new Date(),
        })
        .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
        .returning();

      if (!updated[0]) {
        return reply.status(409).send({
          error: 'Conflict: run was modified by another request. Please retry.',
        });
      }

      return reply.send({ crewSlots: updated[0].crewSlots });
    },
  );
}
