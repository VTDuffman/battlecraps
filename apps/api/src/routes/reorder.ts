// =============================================================================
// BATTLECRAPS — POST /runs/:id/crew/reorder
// apps/api/src/routes/reorder.ts
//
// Persists a player-initiated crew rail reorder. The client sends the desired
// slot permutation; the server remaps the existing crewSlots array accordingly
// and writes the result back to the database.
//
// Security model: the client sends only index positions — never cooldown values.
// The server reads cooldownState from the live run row and preserves them
// verbatim, so the client cannot manipulate ability charge states via this route.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, type StoredCrewSlots } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const reorderBodySchema = {
  type: 'object',
  required: ['slotOrder'],
  properties: {
    /**
     * A permutation of [0,1,2,3,4].
     * slotOrder[newPosition] = oldPosition.
     * E.g. [2,0,1,3,4] moves the crew in slot 2 to slot 0, shifting 0 and 1 right.
     */
    slotOrder: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 4 },
      minItems: 5,
      maxItems: 5,
    },
  },
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReorderBody {
  slotOrder: [number, number, number, number, number];
}

interface ReorderParams {
  id: string; // run UUID
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function reorderPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Params: ReorderParams; Body: ReorderBody }>(
    '/runs/:id/crew/reorder',
    { schema: { body: reorderBodySchema }, preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Params: ReorderParams; Body: ReorderBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth ────────────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }
      const userId = user.id;

      const runId           = request.params.id;
      const { slotOrder }   = request.body;

      // ── 1. Validate permutation — each index must appear exactly once ──────
      const seen = new Set(slotOrder);
      if (seen.size !== 5) {
        return reply.status(422).send({
          error: 'slotOrder must be a valid permutation of [0,1,2,3,4] with no duplicates.',
        });
      }

      // ── 2. Load run ────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });

      // ── 3. Ownership guard ─────────────────────────────────────────────────
      if (run.userId !== userId) {
        return reply.status(403).send({ error: 'Forbidden.' });
      }

      // ── 4. Status guard ────────────────────────────────────────────────────
      if (run.status === 'GAME_OVER') {
        return reply.status(409).send({
          error: 'Cannot reorder crew on a completed run.',
        });
      }

      // ── 5. Derive new slot layout ──────────────────────────────────────────
      // Server owns cooldownState — we read it from the live row and remap
      // positions only. The client cannot inject modified cooldown values.
      const newSlots = slotOrder.map((oldIdx) => run.crewSlots[oldIdx] ?? null) as StoredCrewSlots;

      // ── 6. Persist (with optimistic lock on updatedAt) ─────────────────────
      const updated = await db
        .update(runs)
        .set({ crewSlots: newSlots, updatedAt: new Date() })
        .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
        .returning({ crewSlots: runs.crewSlots });

      if (!updated[0]) {
        return reply.status(409).send({
          error: 'Conflict: run was modified by another request. Please retry.',
        });
      }

      return reply.send({ crewSlots: updated[0].crewSlots });
    },
  );
}
