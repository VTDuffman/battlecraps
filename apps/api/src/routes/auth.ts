// =============================================================================
// BATTLECRAPS — AUTH ROUTES
// apps/api/src/routes/auth.ts
//
// POST /api/v1/auth/provision
//
// Called by the frontend after a successful Clerk sign-in. Creates or upserts
// the user record in our DB, returning our internal UUID.
//
// clerkId is read from the verified JWT payload (via requireClerkAuth), never
// from the request body.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { eq }                   from 'drizzle-orm';
import { db }                   from '../db/client.js';
import { users }                from '../db/schema.js';
import { requireClerkAuth }     from '../lib/clerkAuth.js';

// Postgres error code for unique constraint violations (23505).
const PG_UNIQUE_VIOLATION = '23505';

interface ProvisionBody {
  email:       string;
  displayName: string;
}

interface ProvisionResponse {
  userId:            string;
  tutorialCompleted: boolean;
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
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply): Promise<void> => {
      // clerkId is verified by requireClerkAuth — read from JWT, not body.
      const clerkId = req.clerkId;
      const { email, displayName } = req.body;

      // ── 1. Check for existing user by clerkId ────────────────────────────
      const existing = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkId),
      });

      if (existing) {
        const body: ProvisionResponse = { userId: existing.id, tutorialCompleted: existing.tutorialCompleted };
        return reply.send(body);
      }

      // ── 2. Insert new user ───────────────────────────────────────────────
      // Uses ON CONFLICT DO NOTHING targeted to clerk_id so that concurrent
      // race conditions on the same Clerk user are handled silently.
      // Non-clerk_id constraint violations (e.g. email) are surfaced and
      // handled explicitly below.
      let user: typeof users.$inferSelect | undefined;

      try {
        const inserted = await db
          .insert(users)
          .values({
            clerkId,
            email,
            username:     displayName,
            passwordHash: null, // unused — auth is via Clerk
          })
          .onConflictDoNothing({ target: users.clerkId })
          .returning();

        user = inserted[0];

        // If INSERT was a no-op (concurrent request won the race on clerkId),
        // re-fetch the row the other request inserted.
        if (user === undefined) {
          user = await db.query.users.findFirst({
            where: eq(users.clerkId, clerkId),
          });
        }
      } catch (err) {
        // ── 3. Email conflict — re-associate the legacy record ──────────────
        // A user row already exists with this email but a different (legacy)
        // clerk_id, created before Clerk auth was introduced. Update the
        // clerk_id in place so the account is claimed by the real Clerk identity.
        if (isEmailConflict(err)) {
          app.log.info(`[auth] Re-associating legacy account for ${email} with clerk_id ${clerkId}`);
          await db
            .update(users)
            .set({ clerkId })
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
      const body: ProvisionResponse = { userId: user.id, tutorialCompleted: user.tutorialCompleted };
      return reply.status(201).send(body);
    },
  );

  // ── POST /auth/tutorial-complete ─────────────────────────────────────────
  // Marks the authenticated user's tutorial as completed. Called by the client
  // on tutorial skip or on completion of all beats. Idempotent — safe to call
  // multiple times (true→true is a no-op in Postgres).
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the thrown DB error is a Postgres unique-constraint
 * violation (code 23505) specifically on the users.email column.
 *
 * A username conflict is intentionally NOT matched here — that would indicate
 * two genuinely different users chose the same display name, which is a
 * different problem from a legacy-account re-association.
 */
function isEmailConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PG_UNIQUE_VIOLATION &&
    'constraint_name' in err &&
    (err as { constraint_name: unknown }).constraint_name === 'users_email_idx'
  );
}
