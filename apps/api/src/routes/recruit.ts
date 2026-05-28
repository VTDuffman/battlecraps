// =============================================================================
// BATTLECRAPS — POST /runs/:id/recruit
// apps/api/src/routes/recruit.ts
//
// Handles the "Seven-Proof Pub" recruitment phase that fires after every
// gauntlet marker is cleared.
//
// Two use-cases in one endpoint:
//   1. BUY  — provide { crewId, slotIndex } to hire a crew member.
//             Deducts getCrewHireCost(rarity, clearedMarkerTarget) from bankroll and seats them in the slot.
//             Overwrites whatever crew member (if any) was in that slot.
//   2. SKIP — omit crewId/slotIndex (or send empty object) to rest and skip.
//
// Either path:
//   - Resets shooters to 5 (or 6 if Member's Jacket comp is active).
//   - Returns the run to IDLE_TABLE / COME_OUT so the next roll can proceed.
//
// NOTE: currentMarkerIndex was ALREADY advanced by the roll handler when it
// transitioned the run to TRANSITION status. This endpoint does not touch it.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, crewDefinitions, type StoredCrewSlots } from '../db/schema.js';
import { isBossMarker, GAUNTLET, LUCKY_CHARM_ID, getCrewHireCost, COMP_PERK_IDS, type CompRewardType, type CrewRarity } from '@battlecraps/shared';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

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
    { schema: { body: recruitBodySchema }, preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Params: RecruitParams; Body: RecruitBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      // ── 0. Auth guard ──────────────────────────────────────────────────────
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }
      const userId = user.id;

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

      // ── 3b. Slot availability guard (FB-025) ───────────────────────────────
      if (hasSlot && slotIndex! >= run.unlockedSlots) {
        return reply.status(400).send({ error: 'Slot not yet unlocked.' });
      }

      // ── 4. Determine boss comp reward (if returning from a boss victory) ──
      // currentMarkerIndex was already incremented by rolls.ts when the TRANSITION
      // status was set. So the marker that was just cleared is at index - 1.
      const prevMarkerIndex = run.currentMarkerIndex - 1;
      const wasBossVictory  = prevMarkerIndex >= 0 && isBossMarker(prevMarkerIndex);
      const bossConfig      = wasBossVictory ? GAUNTLET[prevMarkerIndex]?.boss : undefined;

      // Comp reward: +1 Shooter (Member's Jacket) for defeating Sarge.
      // Check both the immediate boss victory AND run.compPerkIds so the bonus
      // persists across all subsequent segment resets for the rest of the run.
      const hasMemberJacket =
        bossConfig?.compReward === 'EXTRA_SHOOTER' ||
        (run.compPerkIds ?? []).includes(COMP_PERK_IDS.MEMBER_JACKET);
      const compShooterBonus = hasMemberJacket ? 1 : 0;

      // FB-025: BOARD_SEAT and CARGO_HOLD unlock a new crew slot — they do not use
      // compPerkIds for enforcement. unlockedSlots is the authority.
      const isSlotUnlock = (reward: CompRewardType): reward is 'BOARD_SEAT' | 'CARGO_HOLD' =>
        reward === 'BOARD_SEAT' || reward === 'CARGO_HOLD';

      // Persist the comp perk ID onto the run (not the user) so enforcement is
      // scoped to this run only. Non-fatal — must never block game progression.
      // Slot-unlock comps (BOARD_SEAT / CARGO_HOLD) are excluded — they use
      // unlockedSlots instead of compPerkIds.
      if (bossConfig && bossConfig.compReward !== 'NONE' && !isSlotUnlock(bossConfig.compReward) && bossConfig.compPerkId !== undefined) {
        try {
          await db
            .update(runs)
            .set({
              compPerkIds: sql`array_append(comp_perk_ids, ${bossConfig.compPerkId}::integer)`,
            })
            .where(eq(runs.id, runId));
        } catch {
          // Intentionally swallowed.
        }
      }

      // ── 4b. Slot-unlock comp — increment unlockedSlots (FB-025) ──────────
      if (bossConfig && isSlotUnlock(bossConfig.compReward)) {
        const newSlotCount = bossConfig.compReward === 'BOARD_SEAT' ? 4 : 5;
        try {
          await db
            .update(runs)
            .set({ unlockedSlots: newSlotCount })
            .where(eq(runs.id, runId));
        } catch {
          // Non-fatal — must never block game progression.
        }
      }

      // ── 5. Apply purchase (if not skipping) ───────────────────────────────
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
        const isAvailable =
          crewDef.isStarterRoster ||
          (user.unlockedCrewIds ?? []).includes(crewId!);
        if (!isAvailable) {
          return reply.status(403).send({
            error: `Crew member ${crewId} has not been unlocked yet.`,
          });
        }
        const clearedIndex  = run.currentMarkerIndex - 1;
        const clearedTarget = GAUNTLET[clearedIndex]?.targetCents ?? GAUNTLET[0]!.targetCents;
        const hireCost      = getCrewHireCost(crewDef.rarity as CrewRarity, clearedTarget);

        if (run.bankrollCents < hireCost) {
          return reply.status(422).send({
            error: `Insufficient bankroll. Need ${hireCost}¢, have ${run.bankrollCents}¢.`,
          });
        }
        newBankroll              = run.bankrollCents - hireCost;
        newCrewSlots[slotIndex!] = { crewId: crewId!, cooldownState: 0 };
      }

      // ── 5b. Lucky Charm immediate hype floor ───────────────────────────────
      // If the resulting crew is Lucky Charm as the sole member, apply the 2.0×
      // hype floor right now so the recruit response (and UI) reflects it before
      // the first roll. Mirrors the cascade formula: +1.0 when below floor,
      // preserving any accumulated bonuses above the 1.0× baseline.
      const activeFinalCrew = newCrewSlots.filter(Boolean);
      const isLuckyCharmSolo =
        activeFinalCrew.length === 1 && activeFinalCrew[0]?.crewId === LUCKY_CHARM_ID;
      const newHype = isLuckyCharmSolo && run.hype < 2.0
        ? run.hype + 1.0
        : run.hype;

      // ── 6. Persist — reset shooters, return to table (with optimistic lock) ─
      const updated = await db
        .update(runs)
        .set({
          status:        'IDLE_TABLE',
          phase:         'COME_OUT',
          bankrollCents: newBankroll,
          // Fresh shooter allotment for next segment, plus any boss comp bonus.
          // Member's Jacket: +1 Shooter on top of the standard 5.
          shooters:      5 + compShooterBonus,
          crewSlots:     newCrewSlots,
          hype:          newHype,
          bossPointHits: 0,  // always reset on segment start
          updatedAt:     new Date(),
        })
        .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
        .returning();

      const persistedRun = updated[0];
      if (!persistedRun) {
        return reply.status(409).send({
          error: 'Conflict: run was modified by another request. Please retry.',
        });
      }

      return reply.send({
        bankroll:      persistedRun.bankrollCents,
        shooters:      persistedRun.shooters,
        hype:          persistedRun.hype,
        phase:         persistedRun.phase,
        status:        persistedRun.status,
        point:         persistedRun.currentPoint ?? null,
        crewSlots:     persistedRun.crewSlots,
        bossPointHits: persistedRun.bossPointHits,
        unlockedSlots: persistedRun.unlockedSlots as 3 | 4 | 5,
      });
    },
  );
}
