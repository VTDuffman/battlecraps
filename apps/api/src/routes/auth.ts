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

interface ProvisionBody {
  email:       string;
  displayName: string;
}

interface ProvisionResponse {
  userId: string;
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
        const body: ProvisionResponse = { userId: existing.id };
        return reply.send(body);
      }

      // ── 2. Insert new user, handling race via ON CONFLICT DO NOTHING ─────
      const inserted = await db
        .insert(users)
        .values({
          clerkId,
          email,
          username:     displayName,
          passwordHash: null, // unused — auth is via Clerk
        })
        .onConflictDoNothing()
        .returning();

      let user = inserted[0];

      // If INSERT was a no-op (concurrent request won the race), re-fetch.
      if (user === undefined) {
        user = await db.query.users.findFirst({
          where: eq(users.clerkId, clerkId),
        });
      }

      if (user === undefined) {
        return reply.status(500).send({ error: 'Failed to provision user.' });
      }

      app.log.info(`[auth] Provisioned user ${user.id} for clerk_id ${clerkId}`);
      const body: ProvisionResponse = { userId: user.id };
      return reply.status(201).send(body);
    },
  );
}
