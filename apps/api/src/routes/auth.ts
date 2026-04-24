// =============================================================================
// BATTLECRAPS — AUTH ROUTES
// apps/api/src/routes/auth.ts
//
// POST /api/v1/auth/provision
// POST /api/v1/auth/tutorial-complete
// POST /api/v1/auth/set-alias
//
// clerkId is read from the verified JWT payload (via requireClerkAuth), never
// from the request body.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { eq }                   from 'drizzle-orm';
import { db }                   from '../db/client.js';
import { users, leaderboardEntries } from '../db/schema.js';
import { requireClerkAuth }     from '../lib/clerkAuth.js';

// Postgres error code for unique constraint violations (23505).
const PG_UNIQUE_VIOLATION = '23505';

interface ProvisionBody {
  email:       string;
  displayName: string;
  firstName:   string | null;
  lastName:    string | null;
}

interface ProvisionResponse {
  userId:            string;
  tutorialCompleted: boolean;
  aliasChosen:       boolean;
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ProvisionBody }>(
    '/auth/provision',
    {
      preHandler: [requireClerkAuth],
      schema: {
        body: {
          type: 'object',
          required: ['email', 'displayName'],
          properties: {
            email:       { type: 'string', minLength: 1 },
            displayName: { type: 'string', minLength: 1 },
            firstName:   { type: ['string', 'null'] },
            lastName:    { type: ['string', 'null'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply): Promise<void> => {
      const clerkId = req.clerkId;
      const { email, displayName, firstName = null, lastName = null } = req.body;

      // ── 1. Check for existing user by clerkId ────────────────────────────
      const existing = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkId),
      });

      if (existing) {
        // Only sync alias fields when the player hasn't chosen their own handle.
        // Once aliasChosen = true, the username is owned by the player — never
        // overwrite it with data from Clerk.
        if (!existing.aliasChosen) {
          try {
            await db
              .update(users)
              .set({ username: displayName, firstName, lastName })
              .where(eq(users.clerkId, clerkId));
          } catch (updateErr) {
            if (!isUsernameConflict(updateErr)) throw updateErr;
            app.log.warn(`[auth] username "${displayName}" already claimed; keeping stored alias for clerk_id ${clerkId}`);
          }
        }
        const body: ProvisionResponse = {
          userId:            existing.id,
          tutorialCompleted: existing.tutorialCompleted,
          aliasChosen:       existing.aliasChosen,
        };
        return reply.send(body);
      }

      // ── 2. Insert new user ───────────────────────────────────────────────
      let user: typeof users.$inferSelect | undefined;

      try {
        const inserted = await db
          .insert(users)
          .values({
            clerkId,
            email,
            username:     displayName,
            firstName,
            lastName,
            passwordHash: null,
          })
          .onConflictDoNothing({ target: users.clerkId })
          .returning();

        user = inserted[0];

        if (user === undefined) {
          user = await db.query.users.findFirst({
            where: eq(users.clerkId, clerkId),
          });
        }
      } catch (err) {
        // ── 3. Email conflict — re-associate the legacy record ──────────────
        if (isEmailConflict(err)) {
          app.log.info(`[auth] Re-associating legacy account for ${email} with clerk_id ${clerkId}`);
          await db
            .update(users)
            .set({ clerkId, username: displayName, firstName, lastName })
            .where(eq(users.email, email));

          user = await db.query.users.findFirst({
            where: eq(users.clerkId, clerkId),
          });
        } else {
          throw err;
        }
      }

      if (user === undefined) {
        return reply.status(500).send({ error: 'Failed to provision user.' });
      }

      app.log.info(`[auth] Provisioned user ${user.id} for clerk_id ${clerkId}`);
      const body: ProvisionResponse = {
        userId:            user.id,
        tutorialCompleted: user.tutorialCompleted,
        aliasChosen:       user.aliasChosen,
      };
      return reply.status(201).send(body);
    },
  );

  // ── POST /auth/tutorial-complete ─────────────────────────────────────────
  app.post(
    '/auth/tutorial-complete',
    { preHandler: [requireClerkAuth] },
    async (req, reply): Promise<void> => {
      await db
        .update(users)
        .set({ tutorialCompleted: true })
        .where(eq(users.clerkId, req.clerkId));

      app.log.info(`[auth] tutorial_completed set for clerk_id ${req.clerkId}`);
      return reply.status(200).send({ ok: true });
    },
  );

  // ── POST /auth/set-alias ──────────────────────────────────────────────────
  // Called once when the player picks their public handle via the alias picker.
  // Sets aliasChosen = true so provision never overwrites this alias again.
  // Also back-fills any existing leaderboard_entries for this user so their
  // historical runs show the chosen handle.
  app.post<{ Body: { alias: string } }>(
    '/auth/set-alias',
    {
      preHandler: [requireClerkAuth],
      schema: {
        body: {
          type: 'object',
          required: ['alias'],
          properties: {
            alias: {
              type:      'string',
              minLength: 2,
              maxLength: 20,
              pattern:   '^[a-zA-Z0-9_-]+$',
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply): Promise<void> => {
      const { alias } = req.body;

      const user = await db.query.users.findFirst({
        where: eq(users.clerkId, req.clerkId),
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      try {
        await db
          .update(users)
          .set({ username: alias, aliasChosen: true })
          .where(eq(users.id, user.id));
      } catch (err) {
        if (isUsernameConflict(err)) {
          return reply.status(409).send({ error: 'ALIAS_TAKEN' });
        }
        throw err;
      }

      // Back-fill display_name on historical leaderboard entries so they
      // show the chosen handle rather than the old Clerk-derived name.
      await db
        .update(leaderboardEntries)
        .set({ displayName: alias })
        .where(eq(leaderboardEntries.userId, user.id));

      app.log.info(`[auth] alias "${alias}" set for user ${user.id}`);
      return reply.status(200).send({ ok: true });
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmailConflict(err: unknown): boolean {
  return isUniqueViolation(err, 'users_email_idx');
}

function isUsernameConflict(err: unknown): boolean {
  return isUniqueViolation(err, 'users_username_idx');
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PG_UNIQUE_VIOLATION &&
    'constraint_name' in err &&
    (err as { constraint_name: unknown }).constraint_name === constraintName
  );
}
