// =============================================================================
// BATTLECRAPS — FEEDBACK ROUTE (FB-018)
// apps/api/src/routes/feedback.ts
//
// POST /api/v1/feedback — submit playtester feedback with deep context payload
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { db }                    from '../db/client.js';
import { feedbackSubmissions }   from '../db/schema.js';
import { requireClerkAuth }      from '../lib/clerkAuth.js';
import { resolveUserByClerkId }  from '../lib/resolveUser.js';

const bodySchema = {
  type: 'object',
  required: ['type', 'comment'],
  additionalProperties: false,
  properties: {
    type:    { type: 'string', enum: ['bug', 'sentiment', 'idea'] },
    rating:  { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    comment: { type: 'string', minLength: 1, maxLength: 2000 },
    context: { type: ['object', 'null'] },
  },
} as const;

interface FeedbackBody {
  type:     'bug' | 'sentiment' | 'idea';
  rating?:  number;
  comment:  string;
  context?: Record<string, unknown>;
}

export async function feedbackPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Body: FeedbackBody }>(
    '/feedback',
    { schema: { body: bodySchema }, preHandler: [requireClerkAuth] },
    async (req, reply) => {
      const user = await resolveUserByClerkId(req.clerkId);
      if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in.' });

      const result = await db
        .insert(feedbackSubmissions)
        .values({
          userId:  user.id,
          type:    req.body.type,
          rating:  req.body.rating ?? null,
          comment: req.body.comment,
          context: req.body.context ?? null,
        })
        .returning({ id: feedbackSubmissions.id });

      return reply.status(201).send({ ok: true, id: result[0]!.id });
    },
  );
}
