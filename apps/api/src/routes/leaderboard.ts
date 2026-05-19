// =============================================================================
// BATTLECRAPS — Leaderboard routes (FB-014)
// apps/api/src/routes/leaderboard.ts
//
// GET  /api/v1/leaderboard?view=global    → winners (top 25) + nonWinners (top 10) + trailblazers (top 10)
// GET  /api/v1/leaderboard?view=personal  → caller's Top 25 (auth required)
//
// submitLeaderboardEntry() is called internally from rolls.ts at GAME_OVER.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, gte, lt, and, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import {
  leaderboardEntries,
  crewDefinitions,
  type UserRow,
  type RunRow,
} from '../db/schema.js';
import { requireClerkAuth }     from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';
import { GAUNTLET }             from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard
// ---------------------------------------------------------------------------

const querySchema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['global', 'personal'] },
  },
  required: ['view'],
  additionalProperties: false,
} as const;

interface LeaderboardQuery {
  view: 'global' | 'personal';
}

export async function leaderboardPlugin(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LeaderboardQuery }>(
    '/leaderboard',
    { schema: { querystring: querySchema } },
    leaderboardHandler,
  );
}

async function leaderboardHandler(
  request: FastifyRequest<{ Querystring: LeaderboardQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { view } = request.query;

  if (view === 'global') {
    const [winnersRows, nonWinnersRows, trailblazersRows] = await Promise.all([
      // Hall of Fame: 9-floor completions only (highestMarkerIndex >= current GAUNTLET.length)
      db
        .select()
        .from(leaderboardEntries)
        .where(and(
          eq(leaderboardEntries.didWinRun, true),
          gte(leaderboardEntries.highestMarkerIndex, GAUNTLET.length),
        ))
        .orderBy(
          desc(leaderboardEntries.finalBankrollCents),
          desc(leaderboardEntries.shootersRemaining),
        )
        .limit(25),

      // Gone but Not Forgotten: all non-completions, any era
      db
        .select()
        .from(leaderboardEntries)
        .where(eq(leaderboardEntries.didWinRun, false))
        .orderBy(
          desc(leaderboardEntries.highestMarkerIndex),
          desc(leaderboardEntries.finalBankrollCents),
        )
        .limit(10),

      // Trailblazers: original-era completions (beat the pre-expansion game)
      db
        .select()
        .from(leaderboardEntries)
        .where(and(
          eq(leaderboardEntries.didWinRun, true),
          lt(leaderboardEntries.highestMarkerIndex, GAUNTLET.length),
        ))
        .orderBy(desc(leaderboardEntries.finalBankrollCents))
        .limit(10),
    ]);

    return reply.status(200).send({
      winners:      winnersRows,
      nonWinners:   nonWinnersRows,
      trailblazers: trailblazersRows,
    });
  }

  // Personal view — requires auth.
  // requireClerkAuth is called manually here so GET ?view=global stays unauthenticated.
  const authHeader = request.headers['authorization'];
  if (!authHeader) {
    return reply.status(401).send({ error: 'Authorization header required for personal view.' });
  }

  await requireClerkAuth(request, reply);
  // requireClerkAuth replies with 401 on failure; if we reach this line, request.clerkId is set.
  const user = await resolveUserByClerkId(request.clerkId);
  if (!user) {
    return reply.status(401).send({ error: 'User not found — please re-sign in.' });
  }

  const personalRows = await db
    .select()
    .from(leaderboardEntries)
    .where(eq(leaderboardEntries.userId, user.id))
    .orderBy(desc(leaderboardEntries.finalBankrollCents))
    .limit(25);

  return reply.status(200).send({ entries: personalRows });
}

// ---------------------------------------------------------------------------
// submitLeaderboardEntry — internal, called from rolls.ts at GAME_OVER
// ---------------------------------------------------------------------------

/**
 * Inserts a leaderboard entry for a completed run.
 * Idempotent: ON CONFLICT (run_id) DO NOTHING makes retries safe.
 * Crew names are denormalized at submission time to avoid joins on every read.
 */
export async function submitLeaderboardEntry(
  user:         UserRow,
  persistedRun: RunRow,
): Promise<void> {
  const crewIds = (persistedRun.crewSlots as ({ crewId: number } | null)[])
    .map((slot) => slot?.crewId ?? null);

  const uniqueIds = [...new Set(crewIds.filter((id): id is number => id !== null))];

  let nameMap = new Map<number, string>();
  if (uniqueIds.length > 0) {
    const defs = await db
      .select({ id: crewDefinitions.id, name: crewDefinitions.name })
      .from(crewDefinitions)
      .where(inArray(crewDefinitions.id, uniqueIds));
    nameMap = new Map(defs.map((d) => [d.id, d.name]));
  }

  const crewLayout = crewIds.map((id) =>
    id !== null ? { id, name: nameMap.get(id) ?? `Crew #${id}` } : null,
  );

  const didWinRun = persistedRun.currentMarkerIndex >= GAUNTLET.length;

  await db
    .insert(leaderboardEntries)
    .values({
      userId:                    persistedRun.userId,
      runId:                     persistedRun.id,
      displayName:               user.username,
      firstName:                 user.firstName ?? null,
      lastName:                  user.lastName ?? null,
      finalBankrollCents:        persistedRun.bankrollCents,
      highestRollAmplifiedCents: persistedRun.highestRollAmplifiedCents,
      highestMarkerIndex:        persistedRun.currentMarkerIndex,
      shootersRemaining:         persistedRun.shooters,
      crewLayout,
      didWinRun,
    })
    .onConflictDoNothing({ target: leaderboardEntries.runId });
}
