// =============================================================================
// BATTLECRAPS — USER RESOLUTION
// apps/api/src/lib/resolveUser.ts
//
// Resolves a Clerk user ID to our internal user record.
// Called at the top of every authenticated route handler after requireClerkAuth
// has verified the JWT and set request.clerkId.
// =============================================================================

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { UserRow } from '../db/schema.js';

export async function resolveUserByClerkId(clerkId: string): Promise<UserRow | null> {
  return (
    (await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    })) ?? null
  );
}
