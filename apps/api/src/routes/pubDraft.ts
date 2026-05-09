// =============================================================================
// BATTLECRAPS — GET /runs/:id/pub-draft
// apps/api/src/routes/pubDraft.ts
//
// Generates the Seven-Proof Pub recruitment draft for the current TRANSITION.
//
// Rules:
//   - Normal draft size is 3.
//   - If run.guaranteedPubDraftIds is non-empty, those crew are always included
//     and the draft expands to max(3, guaranteed.length) if needed.
//   - Remaining slots are filled randomly from the player's available roster
//     (Starter OR unlocked), excluding guaranteed IDs already in the draft.
//   - guaranteedPubDraftIds is cleared on the run row after generation so
//     subsequent calls return a fresh random draft (idempotent re-fetch safe).
//
// Guaranteed IDs are treated as available regardless of users.unlockedCrewIds
// state to avoid a race between the fire-and-forget evaluateUnlocks() write
// and the client calling this endpoint immediately after turn:settled.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, crewDefinitions } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export interface PubDraftEntry {
  id:                  number;
  name:                string;
  abilityCategory:     string;
  cooldownType:        string;
  baseCostCents:       number;
  visualId:            string;
  rarity:              string;
  briefDescription:    string | null;
  detailedDescription: string | null;
  unlockDescription:   string;
  isGuaranteed:        boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NORMAL_DRAFT_SIZE = 3;

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

interface PubDraftParams {
  id: string; // run UUID
}

export async function pubDraftPlugin(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PubDraftParams }>(
    '/runs/:id/pub-draft',
    { preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Params: PubDraftParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ────────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }

      const runId = request.params.id;

      // ── 1. Load run ──────────────────────────────────────────────────────────
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return reply.status(404).send({ error: 'Run not found.' });
      if (run.userId !== user.id) return reply.status(403).send({ error: 'Forbidden.' });

      if (run.status !== 'TRANSITION') {
        return reply.status(409).send({
          error: `Pub draft is only available during TRANSITION. Current status: "${run.status}".`,
        });
      }

      // ── 2. Determine guaranteed crew ─────────────────────────────────────────
      const guaranteedIds = new Set(run.guaranteedPubDraftIds);

      // ── 2b. Collect crew IDs already seated in the squad ─────────────────────
      const occupiedIds = new Set(
        run.crewSlots
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .map(s => s.crewId),
      );

      // ── 3. Load all crew definitions ─────────────────────────────────────────
      const allCrew = await db.select().from(crewDefinitions);

      const unlockedSet = new Set(user.unlockedCrewIds);

      // A crew is available if it's Starter, unlocked, or guaranteed (handles
      // the race where evaluateUnlocks() write hasn't committed yet).
      const isAvailable = (crewId: number, isStarterRoster: boolean): boolean =>
        isStarterRoster || unlockedSet.has(crewId) || guaranteedIds.has(crewId);

      // ── 4. Partition into guaranteed and pool ────────────────────────────────
      // Exclude crew already in the squad from both lists to prevent duplicates.
      const guaranteedCrew = allCrew.filter(c => guaranteedIds.has(c.id) && !occupiedIds.has(c.id));
      const poolCrew       = allCrew.filter(
        c => !guaranteedIds.has(c.id) && !occupiedIds.has(c.id) && isAvailable(c.id, c.isStarterRoster),
      );

      // ── 5. Build draft ───────────────────────────────────────────────────────
      const draftSize    = Math.max(NORMAL_DRAFT_SIZE, guaranteedCrew.length);
      const fillCount    = Math.max(0, draftSize - guaranteedCrew.length);
      const randomFill   = shuffle(poolCrew).slice(0, fillCount);

      const draft: PubDraftEntry[] = [
        ...guaranteedCrew.map(c => ({ ...toDraftEntry(c), isGuaranteed: true })),
        ...randomFill.map(c   => ({ ...toDraftEntry(c), isGuaranteed: false })),
      ];

      // ── 6. Clear guaranteedPubDraftIds on the run ────────────────────────────
      if (guaranteedIds.size > 0) {
        await db
          .update(runs)
          .set({ guaranteedPubDraftIds: [] })
          .where(eq(runs.id, runId));
      }

      return reply.send({ draft });
    },
  );
}

function toDraftEntry(
  c: typeof crewDefinitions.$inferSelect,
): Omit<PubDraftEntry, 'isGuaranteed'> {
  return {
    id:                  c.id,
    name:                c.name,
    abilityCategory:     c.abilityCategory,
    cooldownType:        c.cooldownType,
    baseCostCents:       c.baseCostCents,
    visualId:            c.visualId,
    rarity:              c.rarity,
    briefDescription:    c.briefDescription,
    detailedDescription: c.detailedDescription,
    unlockDescription:   c.unlockDescription,
  };
}
