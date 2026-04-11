// =============================================================================
// BATTLECRAPS — CLERK JWT VERIFICATION
// apps/api/src/lib/clerkAuth.ts
//
// Fastify preHandler that verifies a Clerk JWT from the Authorization header
// and attaches the Clerk user ID to request.clerkId.
//
// Usage (add to any route that requires auth):
//   { preHandler: [requireClerkAuth] }
// =============================================================================

import { verifyToken } from '@clerk/backend';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Type augmentation — add clerkId to FastifyRequest globally
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    clerkId: string;
  }
}

// ---------------------------------------------------------------------------
// preHandler hook
// ---------------------------------------------------------------------------

export async function requireClerkAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env['CLERK_SECRET_KEY'],
    });
    request.clerkId = payload.sub;
  } catch {
    await reply.status(401).send({ error: 'Invalid or expired token' });
  }
}
