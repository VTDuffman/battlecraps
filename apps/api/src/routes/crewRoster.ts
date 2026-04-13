// =============================================================================
// BATTLECRAPS — GET /crew-roster
// apps/api/src/routes/crewRoster.ts
//
// Returns the full 30-crew roster with unlock status for the authenticated user.
//
// A crew member is available if:
//   - crewDefinitions.isStarterRoster === true  (IDs 16–30), OR
//   - crewDefinitions.id ∈ users.unlockedCrewIds
//
// For cross-run cumulative unlocks (IDs 5 and 8), unlockProgress and
// unlockThreshold are included so the client can render a progress bar.
// All other crew return null for those fields.
//
// Sort order: Starter first, then by rarity tier (Common → Legendary), then by ID.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { crewDefinitions } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

// ---------------------------------------------------------------------------
// Rarity sort order
// ---------------------------------------------------------------------------

const RARITY_ORDER: Record<string, number> = {
  Starter:   0,
  Common:    1,
  Uncommon:  2,
  Rare:      3,
  Epic:      4,
  Legendary: 5,
};

// ---------------------------------------------------------------------------
// Cross-run cumulative unlock thresholds (IDs with progress tracking)
// ---------------------------------------------------------------------------

const UNLOCK_THRESHOLDS: Record<number, number> = {
  5: 8,   // Floor Walker: 8 seven-outs across all runs
  8: 10,  // Shark: 10 point hits across all runs
};

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export interface CrewRosterEntry {
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
  isAvailable:         boolean;
  unlockProgress:      number | null;
  unlockThreshold:     number | null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function crewRosterPlugin(app: FastifyInstance): Promise<void> {
  app.get(
    '/crew-roster',
    { preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ──────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }

      const unlockedSet     = new Set(user.unlockedCrewIds);
      const unlockProgress  = user.unlockProgress;

      // ── 1. Load all crew definitions ───────────────────────────────────────
      const allCrew = await db.select().from(crewDefinitions);

      // ── 2. Build roster entries ────────────────────────────────────────────
      const roster: CrewRosterEntry[] = allCrew.map((crew) => {
        const isAvailable = crew.isStarterRoster || unlockedSet.has(crew.id);

        const threshold = UNLOCK_THRESHOLDS[crew.id] ?? null;
        const progress  = threshold !== null
          ? (unlockProgress[crew.id] ?? 0)
          : null;

        return {
          id:                  crew.id,
          name:                crew.name,
          abilityCategory:     crew.abilityCategory,
          cooldownType:        crew.cooldownType,
          baseCostCents:       crew.baseCostCents,
          visualId:            crew.visualId,
          rarity:              crew.rarity,
          briefDescription:    crew.briefDescription,
          detailedDescription: crew.detailedDescription,
          unlockDescription:   crew.unlockDescription,
          isAvailable,
          unlockProgress:      progress,
          unlockThreshold:     threshold,
        };
      });

      // ── 3. Sort: Starter first, then rarity tier order, then by ID ─────────
      roster.sort((a, b) => {
        const rarityDiff =
          (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
        if (rarityDiff !== 0) return rarityDiff;
        return a.id - b.id;
      });

      return reply.send({ roster });
    },
  );
}
