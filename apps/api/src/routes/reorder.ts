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
     * A permutation of active slot indices.
     * slotOrder[newPosition] = oldPosition.
     * Length must equal run.unlockedSlots (3, 4, or 5).
     * E.g. with 3 slots: [2,0,1] moves the crew in slot 2 to slot 0, shifting 0 and 1 right.
     */
    slotOrder: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 4 },
      minItems: 3,
      maxItems: 5,
    },
  },
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReorderBody {
  slotOrder: number[];
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

      // ── 1. Load run ────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });

      // ── 2. Ownership guard ─────────────────────────────────────────────────
      if (run.userId !== userId) {
        return reply.status(403).send({ error: 'Forbidden.' });
      }

      // ── 3. Status guard ────────────────────────────────────────────────────
      if (run.status === 'GAME_OVER') {
        return reply.status(409).send({
          error: 'Cannot reorder crew on a completed run.',
        });
      }

      // ── 4. Validate permutation — length must match unlockedSlots (FB-025) ─
      const unlockedSlots = run.unlockedSlots as 3 | 4 | 5;
      if (slotOrder.length !== unlockedSlots) {
        return reply.status(400).send({
          error: `slotOrder length must match unlockedSlots (expected ${unlockedSlots}, got ${slotOrder.length}).`,
        });
      }
      const seen = new Set(slotOrder);
      if (seen.size !== unlockedSlots) {
        return reply.status(422).send({
          error: `slotOrder must be a valid permutation of [0..${unlockedSlots - 1}] with no duplicates.`,
        });
      }

      // ── 5. Derive new slot layout ──────────────────────────────────────────
      // Server owns cooldownState — we read it from the live row and remap
      // active positions only. Inactive slots (≥ unlockedSlots) remain null.
      // The client cannot inject modified cooldown values.
      const remapped = slotOrder.map((oldIdx) => run.crewSlots[oldIdx] ?? null);
      const newSlots: StoredCrewSlots = [
        remapped[0] ?? null,
        remapped[1] ?? null,
        remapped[2] ?? null,
        remapped[3] ?? null,
        remapped[4] ?? null,
      ];

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
