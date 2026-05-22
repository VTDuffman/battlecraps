// =============================================================================
// BATTLECRAPS — GET /runs/:id/pub-draft
// apps/api/src/routes/pubDraft.ts
//
// Generates the Seven-Proof Pub recruitment draft for the current TRANSITION.
//
// Rules:
//   - Normal draft size is 3 on F1 (clearedIndex 0–2), 2 on F2+ (clearedIndex 3–26).
//   - If run.guaranteedPubDraftIds is non-empty, those crew are always included
//     and the draft expands to max(3, guaranteed.length) if needed.
//   - Remaining slots are filled randomly from the player's available roster
//     (Starter OR unlocked), excluding guaranteed IDs already in the draft.
//   - guaranteedPubDraftIds is cleared on the run row after generation so
//     subsequent calls return a fresh random draft (idempotent re-fetch safe).
//   - Random pool is rarity-gated by floor: up to Uncommon on F1–F2, Rare on
//     F3–F4, Epic on F5–F6, Legendary on F7–F9. Guaranteed crew bypass this gate.
//
// Guaranteed IDs are treated as available regardless of users.unlockedCrewIds
// state to avoid a race between the fire-and-forget evaluateUnlocks() write
// and the client calling this endpoint immediately after turn:settled.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, crewDefinitions } from '../db/schema.js';
import { GAUNTLET, getCrewHireCost, type CrewRarity } from '@battlecraps/shared';
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
  hireCostCents:       number;
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

const RARITY_TIER: Record<string, number> = {
  Starter:   0,
  Common:    1,
  Uncommon:  2,
  Rare:      3,
  Epic:      4,
  Legendary: 5,
};

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

/**
 * Returns the highest rarity tier allowed in the random pool at this pub stop.
 * Guaranteed draft crew (from unlock events) always bypass this gate.
 *
 * F1–F2 (clearedIndex 0–5):  up to Uncommon
 * F3–F4 (clearedIndex 6–11): up to Rare
 * F5–F6 (clearedIndex 12–17): up to Epic
 * F7–F9 (clearedIndex 18–26): up to Legendary
 */
function getMaxRarityTier(clearedIndex: number): number {
  if (clearedIndex <= 5)  return RARITY_TIER['Uncommon']!;
  if (clearedIndex <= 11) return RARITY_TIER['Rare']!;
  if (clearedIndex <= 17) return RARITY_TIER['Epic']!;
  return RARITY_TIER['Legendary']!;
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

      // ── 2. Compute hire cost anchor from the marker just cleared ────────────
      // currentMarkerIndex was already incremented by rolls.ts on TRANSITION.
      const clearedIndex  = run.currentMarkerIndex - 1;
      const clearedTarget = GAUNTLET[clearedIndex]?.targetCents ?? GAUNTLET[0]!.targetCents;

      // ── 3. Determine guaranteed crew ─────────────────────────────────────────
      const guaranteedIds = new Set(run.guaranteedPubDraftIds);

      // ── 3b. Collect crew IDs already seated in the squad ─────────────────────
      const occupiedIds = new Set(
        run.crewSlots
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .map(s => s.crewId),
      );

      // ── 4. Load all crew definitions ─────────────────────────────────────────
      const allCrew = await db.select().from(crewDefinitions);

      const unlockedSet = new Set(user.unlockedCrewIds);

      // A crew is available if it's Starter, unlocked, or guaranteed (handles
      // the race where evaluateUnlocks() write hasn't committed yet).
      const isAvailable = (crewId: number, isStarterRoster: boolean): boolean =>
        isStarterRoster || unlockedSet.has(crewId) || guaranteedIds.has(crewId);

      // ── 5. Partition into guaranteed and pool ────────────────────────────────
      // Exclude crew already in the squad from both lists to prevent duplicates.
      const guaranteedCrew = allCrew.filter(c => guaranteedIds.has(c.id) && !occupiedIds.has(c.id));
      const maxRarityTier = getMaxRarityTier(clearedIndex);
      const poolCrew      = allCrew.filter(
        c =>
          !guaranteedIds.has(c.id) &&
          !occupiedIds.has(c.id) &&
          isAvailable(c.id, c.isStarterRoster) &&
          (RARITY_TIER[c.rarity] ?? 99) <= maxRarityTier,
      );

      // ── 6. Build draft ───────────────────────────────────────────────────────
      // 3 options during F1 (clearedIndex 0–2), 2 options from F2 onwards.
      // Guaranteed crew always expand the draft if they exceed the normal size.
      const normalDraftSize = clearedIndex <= 2 ? 3 : 2;
      const draftSize       = Math.max(normalDraftSize, guaranteedCrew.length);
      const fillCount    = Math.max(0, draftSize - guaranteedCrew.length);
      const randomFill   = shuffle(poolCrew).slice(0, fillCount);

      const draft: PubDraftEntry[] = [
        ...guaranteedCrew.map(c => ({ ...toDraftEntry(c, clearedTarget), isGuaranteed: true })),
        ...randomFill.map(c   => ({ ...toDraftEntry(c, clearedTarget), isGuaranteed: false })),
      ];

      // ── 7. Clear guaranteedPubDraftIds on the run ────────────────────────────
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
  clearedMarkerTargetCents: number,
): Omit<PubDraftEntry, 'isGuaranteed'> {
  return {
    id:                  c.id,
    name:                c.name,
    abilityCategory:     c.abilityCategory,
    cooldownType:        c.cooldownType,
    hireCostCents:       getCrewHireCost(c.rarity as CrewRarity, clearedMarkerTargetCents),
    visualId:            c.visualId,
    rarity:              c.rarity,
    briefDescription:    c.briefDescription,
    detailedDescription: c.detailedDescription,
    unlockDescription:   c.unlockDescription,
  };
}
