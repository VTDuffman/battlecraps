// =============================================================================
// BATTLECRAPS — DEVELOPER MODE ACCESS (FB-028)
// apps/api/src/lib/devAuth.ts
//
// Single gate for every Developer Mode capability. Access requires BOTH:
//   DEV_MODE_ENABLED=true            — kill switch (flip off on Render, restart)
//   DEV_CLERK_IDS=user_a,user_b      — allowlist of Clerk user IDs
//
// Env is read on every call (no caching) so a config change takes effect on
// restart without a code change. The client-side isDev flag is cosmetic —
// this check is the security boundary.
//
// Usage (after requireClerkAuth, which sets request.clerkId):
//   { preHandler: [requireClerkAuth, requireDevUser] }
// =============================================================================

import type { FastifyRequest, FastifyReply } from 'fastify';

export function isDevClerkId(clerkId: string | undefined): boolean {
  if (process.env['DEV_MODE_ENABLED'] !== 'true') return false;
  if (!clerkId) return false;
  const allowlist = (process.env['DEV_CLERK_IDS'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return allowlist.includes(clerkId);
}

/**
 * preHandler: rejects non-developers with 404 (not 403) so dev routes are not
 * discoverable. Must run after requireClerkAuth.
 */
export async function requireDevUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isDevClerkId(request.clerkId)) {
    await reply.status(404).send({ error: 'Not found' });
  }
}
