// =============================================================================
// BATTLECRAPS — POST /runs/:id/recruit
// apps/api/src/routes/recruit.ts
//
// Handles the "Seven-Proof Pub" recruitment phase that fires after every
// gauntlet marker is cleared.
//
// Two use-cases in one endpoint:
//   1. BUY  — provide { crewId, slotIndex } to hire a crew member.
//             Deducts baseCostCents from bankroll and seats them in the slot.
//             Overwrites whatever crew member (if any) was in that slot.
//   2. SKIP — omit crewId/slotIndex (or send empty object) to rest and skip.
//
// Either path:
//   - Resets shooters to 5 (fresh allotment for the next marker segment).
//   - Returns the run to IDLE_TABLE / COME_OUT so the next roll can proceed.
//
// NOTE: currentMarkerIndex was ALREADY advanced by the roll handler when it
// transitioned the run to TRANSITION status. This endpoint does not touch it.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, crewDefinitions, type StoredCrewSlots } from '../db/schema.js';

// ---------------------------------------------------------------------------
// JSON Schema (Fastify validates the body before the handler runs)
// ---------------------------------------------------------------------------

const recruitBodySchema = {
  type: 'object',
  properties: {
    crewId:    { type: 'integer', minimum: 1 },
    slotIndex: { type: 'integer', minimum: 0, maximum: 4 },
  },
  additionalProperties: false,
} as const;

interface RecruitBody {
  crewId?:    number;
  slotIndex?: number;
}

interface RecruitParams {
  id: string; // run UUID
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function recruitPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Params: RecruitParams; Body: RecruitBody }>(
    '/runs/:id/recruit',
    { schema: { body: recruitBodySchema } },
    async (
      request: FastifyRequest<{ Params: RecruitParams; Body: RecruitBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ──────────────────────────────────────────────────────
      const userId = request.headers['x-user-id'];
      if (typeof userId !== 'string' || userId.length === 0) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const runId = request.params.id;
      const { crewId, slotIndex } = request.body;

      // ── 1. Load run ────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });
      if (run.userId !== userId) return reply.status(403).send({ error: 'Forbidden.' });

      // ── 2. State guard ─────────────────────────────────────────────────────
      if (run.status !== 'TRANSITION') {
        return reply.status(409).send({
          error: `Cannot recruit in status "${run.status}". Run must be in TRANSITION.`,
        });
      }

      // ── 3. Validate — both or neither ─────────────────────────────────────
      const hasCrew = crewId    !== undefined;
      const hasSlot = slotIndex !== undefined;
      if (hasCrew !== hasSlot) {
        return reply.status(422).send({
          error: 'Provide both crewId and slotIndex to hire, or neither to skip.',
        });
      }

      // ── 4. Apply purchase (if not skipping) ───────────────────────────────
      // Reset all cooldowns to 0 — the pub starts a fresh segment with new
      // shooters, so per_shooter and per_roll cooldowns should all be fresh.
      const newCrewSlots: StoredCrewSlots = run.crewSlots.map(
        (slot) => slot === null ? null : { ...slot, cooldownState: 0 },
      ) as StoredCrewSlots;
      let newBankroll = run.bankrollCents;

      if (hasCrew && hasSlot) {
        const crewDef = await db.query.crewDefinitions.findFirst({
          where: eq(crewDefinitions.id, crewId!),
        });
        if (!crewDef) {
          return reply.status(422).send({ error: `Unknown crew ID ${crewId}.` });
        }
        if (run.bankrollCents < crewDef.baseCostCents) {
          return reply.status(422).send({
            error: `Insufficient bankroll. Need ${crewDef.baseCostCents}¢, have ${run.bankrollCents}¢.`,
          });
        }
        newBankroll              = run.bankrollCents - crewDef.baseCostCents;
        newCrewSlots[slotIndex!] = { crewId: crewId!, cooldownState: 0 };
      }

      // ── 5. Persist — reset shooters, return to table ───────────────────────
      const updated = await db
        .update(runs)
        .set({
          status:        'IDLE_TABLE',
          phase:         'COME_OUT',
          bankrollCents: newBankroll,
          shooters:      5,            // fresh shooter allotment for next segment
          crewSlots:     newCrewSlots,
          updatedAt:     new Date(),
        })
        .where(eq(runs.id, runId))
        .returning();

      const persistedRun = updated[0];
      if (!persistedRun) {
        return reply.status(500).send({ error: 'Failed to persist run state.' });
      }

      return reply.send({
        bankroll:  persistedRun.bankrollCents,
        shooters:  persistedRun.shooters,
        hype:      persistedRun.hype,
        phase:     persistedRun.phase,
        status:    persistedRun.status,
        point:     persistedRun.currentPoint ?? null,
        crewSlots: persistedRun.crewSlots,
      });
    },
  );
}
