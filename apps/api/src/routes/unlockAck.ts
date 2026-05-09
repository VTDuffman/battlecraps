// =============================================================================
// BATTLECRAPS — POST /user/acknowledge-unlock
// apps/api/src/routes/unlockAck.ts
//
// Removes a crew ID from users.unacknowledgedUnlockIds after the client has
// displayed the cinematic unlock sequence. Idempotent — acknowledging the same
// crew ID twice is a no-op.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const ackBodySchema = {
  type: 'object',
  required: ['crewId'],
  properties: {
    crewId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
} as const;

interface AckBody {
  crewId: number;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function unlockAckPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AckBody }>(
    '/user/acknowledge-unlock',
    { schema: { body: ackBodySchema }, preHandler: [requireClerkAuth] },
    async (
      request: FastifyRequest<{ Body: AckBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const user = await resolveUserByClerkId(request.clerkId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found — please re-sign in.' });
      }

      const { crewId } = request.body;

      const newUnacknowledged = user.unacknowledgedUnlockIds.filter(id => id !== crewId);

      // Already acknowledged — return early without a DB write.
      if (newUnacknowledged.length === user.unacknowledgedUnlockIds.length) {
        return reply.send({ ok: true });
      }

      await db
        .update(users)
        .set({ unacknowledgedUnlockIds: newUnacknowledged })
        .where(eq(users.id, user.id));

      return reply.send({ ok: true });
    },
  );
}
