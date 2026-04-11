# BattleCraps — Session Management Technical Design

**Feature:** FB-006 — Session Management & Authentication
**Auth Provider:** Clerk
**Status:** Approved for implementation

---

## Overview

Replace the current dev-stub identity system (`x-user-id` header + `localStorage` UUID +
shared `dev@battlecraps.local` user) with production-grade authentication using Clerk.
Delivery is split into four self-contained phases that each independently deploy without
breaking the running app.

---

## Goals

- Every player gets a unique, persistent account tied to their Google identity
- Runs survive browser-storage clears and are accessible from any device
- Identity is cryptographically verified on every request (JWT, not bare header)
- No player can access or corrupt another player's run
- `/dev/bootstrap` endpoint is gone before any public traffic reaches the server

## Non-Goals (this feature)

- Email/password signup (Google OAuth only in initial rollout)
- Account deletion or GDPR flows
- Admin dashboard or user management UI
- Rate limiting or anti-cheat beyond existing ownership guards

---

## Architecture After All Phases Complete

```
Browser (React)
  Clerk <ClerkProvider>
    useAuth().getToken()  →  short-lived Clerk JWT (~60s)
    |
    Authorization: Bearer <jwt>     (HTTP requests)
    socket.handshake.auth.token     (Socket.IO)
    |
Fastify API
  clerkMiddleware()                 (verifies JWT on every request)
    req.auth.userId  →  Clerk ID   (e.g. "user_2abc...")
    |
    users table lookup by clerk_id  →  internal UUID
    |
  Game logic (unchanged)
    run.userId === internal UUID    (ownership guard, unchanged)
```

---

## Phase Breakdown

| Phase | Scope | Business Value Delivered |
|-------|-------|--------------------------|
| 1 | DB schema — add `clerk_id` column | Foundation; no regression |
| 2 | Frontend auth shell + provision endpoint | Real Google login; unique accounts per player; cross-device runs |
| 3 | Backend JWT verification | Cryptographic security; production-safe |
| 4 | Hardening & cleanup | All dev stubs removed; production-ready |

Each phase ends with a shippable, working game.

---

## Phase 1 — DB Foundation

**Goal:** Add the `clerk_id` column to the users table so subsequent phases can
associate Clerk identities with our user records without a disruptive migration.

### Database Change

Add `clerkId` to the Drizzle schema and the startup migration block in `server.ts`.

**`apps/api/src/db/schema.ts` — users table addition:**

```typescript
// Add alongside existing columns:
clerkId: text('clerk_id').unique(),
```

- Nullable for now (existing `dev@battlecraps.local` record has no Clerk ID)
- `UNIQUE` constraint prevents duplicate registrations
- `NOT NULL` enforcement deferred to Phase 4 (after dev user is gone)

**`apps/api/src/server.ts` — startup migration:**

```typescript
await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id text UNIQUE
`);
app.log.info('[migrate] clerk_id column ensured');
```

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/db/schema.ts` | Add `clerkId` column definition |
| `apps/api/src/server.ts` | Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration |

### Acceptance Criteria

- [ ] Server starts and runs the migration without error on a fresh DB
- [ ] Server starts without error when column already exists (idempotent)
- [ ] `users` table has a `clerk_id` column, nullable, with a unique index
- [ ] All existing routes and game logic continue to work (zero regression)

---

## Phase 2 — Frontend Auth Shell + Provision Endpoint

**Goal:** Players must sign in with Google before playing. Each Clerk identity maps to
a unique user record in our DB. Runs persist across devices and browser clears.

This phase deliberately keeps the `x-user-id` header mechanism — the security upgrade
comes in Phase 3. The value delivered here is UX: real accounts, Google OAuth, no more
shared dev user.

### New Packages

```bash
# Web
npm install @clerk/react -w @battlecraps/web

# API
npm install @clerk/backend -w @battlecraps/api
```

### Environment Variables

```bash
# apps/web/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...    # From Clerk dashboard — safe to commit

# apps/api/.env
CLERK_SECRET_KEY=sk_test_...             # From Clerk dashboard — NEVER commit
```

### New API Endpoint: `POST /api/v1/auth/provision`

Called by the frontend immediately after a successful Clerk sign-in. Creates or
upserts the user record in our DB, returning our internal UUID.

**Request body:**
```typescript
{
  clerkId:     string;   // Clerk's stable user ID, e.g. "user_2abc123"
  email:       string;   // From Clerk's user object
  displayName: string;   // From Clerk's user object (firstName + lastName or username)
}
```

**Response:**
```typescript
{
  userId: string;   // Our internal UUID — stored in localStorage as bc_run_user_id
}
```

**Logic:**
1. Check if a user with `clerkId` already exists → return existing `userId`
2. If not, `INSERT` new user with `clerkId`, `email`, `username` from request body
3. Handle race condition with `ON CONFLICT (clerk_id) DO NOTHING` + re-fetch

**File:** `apps/api/src/routes/auth.ts` (new file)

**Note:** In Phase 2 this endpoint does NOT verify the Clerk JWT. It trusts the
`clerkId` sent by the client (same trust level as the existing `x-user-id` pattern).
JWT verification on this endpoint comes in Phase 3.

### Frontend Changes

**`apps/web/src/main.tsx`** — Wrap the React tree in `<ClerkProvider>`:

```tsx
import { ClerkProvider } from '@clerk/react';

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

**`apps/web/src/App.tsx`** — Replace bootstrap flow:

1. Import `useUser`, `useAuth`, `SignIn` from `@clerk/react`
2. If not signed in → render `<SignIn />` (Clerk's hosted sign-in UI, Google button included)
3. If signed in → call `POST /auth/provision` to get our internal `userId`
4. Store only `userId` and `runId` in localStorage (Clerk owns session token)
5. Proceed with `connectToRun()` as today — `userId` is passed the same way

**`apps/web/src/store/useGameStore.ts`** — HTTP headers:

The store already sends `x-user-id` on every fetch. No change needed in Phase 2 —
`userId` continues to be the internal UUID, just now sourced from `/auth/provision`
instead of `/dev/bootstrap`.

### localStorage Changes

| Key | Before | After (Phase 2) |
|-----|--------|-----------------|
| `bc_dev_user_id` | Clerk-unaware UUID | Replaced by `bc_run_user_id` (same value, new key name) |
| `bc_dev_run_id` | Run UUID | Renamed to `bc_run_id` |

Renaming the keys forces a clean re-provision on first load after the update deploys —
no stale dev user IDs leak through.

### Sign-In Screen Design

Clerk provides a pre-built `<SignIn />` component. Wrap it in the existing loading
screen container to stay on-brand:

```tsx
<main className="min-h-screen h-[100dvh] flex flex-col items-center justify-center bg-black gap-6">
  <div className="font-pixel text-[12px] text-gold tracking-widest">BATTLE CRAPS</div>
  <SignIn />
</main>
```

The Clerk component handles Google OAuth button, error states, and the redirect
callback automatically.

### New Run Flow (Phase 2)

```
1. User visits battlecraps.com — not signed in
2. App renders <SignIn /> (Google button)
3. User clicks "Sign in with Google" → OAuth flow completes
4. App re-renders with useUser().isSignedIn === true
5. App calls POST /auth/provision { clerkId, email, displayName }
6. Server upserts user record, returns { userId: "<our-uuid>" }
7. App stores userId in localStorage as bc_run_user_id
8. App calls POST /dev/bootstrap (still exists in Phase 2) → gets runId
9. connectToRun(runId, userId, ...) — game loads
```

### Page Refresh Flow (Phase 2)

```
1. User refreshes — Clerk session cookie still valid
2. useUser().isSignedIn === true (no redirect to sign-in)
3. App reads bc_run_user_id + bc_run_id from localStorage
4. Calls GET /runs/:id with x-user-id header → restores run
5. If 404/403 → re-provision + new run
```

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/routes/auth.ts` | New file — provision endpoint |
| `apps/api/src/server.ts` | Register `authPlugin` |
| `apps/web/src/main.tsx` | Add `<ClerkProvider>` |
| `apps/web/src/App.tsx` | Add `<SignIn>` gate; call provision; rename LS keys |
| `apps/web/package.json` | Add `@clerk/react` dependency |
| `apps/api/package.json` | Add `@clerk/backend` dependency |
| `apps/web/.env.example` | Add `VITE_CLERK_PUBLISHABLE_KEY` |
| `apps/api/.env.example` | Add `CLERK_SECRET_KEY` |

### Acceptance Criteria

- [ ] Unauthenticated visitor sees sign-in screen, not the game
- [ ] Clicking "Sign in with Google" completes OAuth and lands on the game
- [ ] Each Google account maps to exactly one user record in the DB
- [ ] Two different Google accounts cannot see each other's runs (403 on wrong userId)
- [ ] Refreshing the page restores the active run without re-signing in
- [ ] Signing in on a second device with the same Google account lands on the same run
- [ ] "New Run" button still works (clears `bc_run_id`, re-bootstraps)
- [ ] `/dev/bootstrap` still functions (used in Phase 2)

---

## Phase 3 — Backend JWT Verification

**Goal:** Replace the bare `x-user-id` header with cryptographically verified Clerk
JWTs on all game routes and the Socket.IO connection. The `/auth/provision` endpoint
is also secured. After this phase, identity cannot be spoofed.

### How Clerk JWT Verification Works

Clerk issues short-lived JWTs (~60 seconds) signed with their private key. The API
verifies them using Clerk's published JWKS endpoint, exposed via `@clerk/backend`:

```typescript
import { verifyToken } from '@clerk/backend';

const payload = await verifyToken(token, {
  secretKey: process.env.CLERK_SECRET_KEY,
});
// payload.sub === Clerk userId (e.g. "user_2abc123")
```

No network call is needed per-request — `@clerk/backend` caches the public key.

### Fastify Auth Middleware

New file: `apps/api/src/lib/clerkAuth.ts`

```typescript
// Fastify preHandler hook — verifies Clerk JWT and attaches clerkId to request
export async function requireClerkAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return reply.status(401).send({ error: 'Unauthorized' });

  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  if (!payload) return reply.status(401).send({ error: 'Invalid token' });

  // Attach to request for downstream handlers
  request.clerkId = payload.sub;  // "user_2abc123..."
}
```

A Fastify type augmentation declares `request.clerkId: string` so all route handlers
get type-safe access.

### User ID Resolution Helper

Every route currently loads a run and checks `run.userId === userId`. In Phase 3,
`userId` is resolved from `clerkId` at the start of each handler:

```typescript
// apps/api/src/lib/resolveUser.ts
export async function resolveUserByClerkId(clerkId: string): Promise<UserRow | null> {
  return db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }) ?? null;
}
```

This replaces the `x-user-id` header read in every route handler. Ownership checks
(`run.userId === user.id`) are unchanged.

### Route Handler Changes

**Pattern (same in all 5 route files):**

```typescript
// Before (Phase 2 and earlier):
const userId = request.headers['x-user-id'];
if (typeof userId !== 'string') return reply.status(401).send(...);

// After (Phase 3):
// clerkId already on request.clerkId via preHandler hook
const user = await resolveUserByClerkId(request.clerkId);
if (!user) return reply.status(401).send({ error: 'User not found — please re-sign in' });
const userId = user.id;
// Everything below this line is unchanged
```

Files affected: `rolls.ts`, `recruit.ts`, `crew.ts`, `mechanic.ts`, `bootstrap.ts`

### Frontend Token Passing

**`apps/web/src/store/useGameStore.ts`** — all `fetch()` calls:

```typescript
// Before:
headers: { 'x-user-id': userId }

// After:
const token = await getToken();   // from useAuth() hook, passed into store
headers: { 'Authorization': `Bearer ${token}` }
```

`getToken()` from `useAuth()` automatically refreshes expired tokens. The token is
passed into the store action (not stored in Zustand state — tokens must not be
persisted).

**`apps/web/src/store/useGameStore.ts`** — Socket.IO auth set in `connectToRun`, not in `socket.ts`:

Rather than a static `socket.auth = { token }` object in `socket.ts`, the store sets auth
using Socket.IO's **function form** so `getToken()` is called fresh on every connect and
reconnect attempt. This ensures an expired Clerk token is never reused across reconnects:

```typescript
// In connectToRun(), before calling socket.connect():
socket.auth = (cb: (data: { token: string }) => void) => {
  void (get().getToken?.() ?? Promise.resolve(null)).then((token) => {
    cb({ token: token ?? '' });
  });
};
if (!socket.connected) socket.connect();
```

`socket.ts` itself has no auth configuration — it sets `autoConnect: false` so the store
controls exactly when the connection is established and with which token.

**`apps/api/src/server.ts`** — Socket.IO middleware updated:

```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.['token'];
  if (!token) return next(new Error('Unauthorized'));

  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  if (!payload) return next(new Error('Invalid token'));

  const user = await resolveUserByClerkId(payload.sub);
  if (!user) return next(new Error('User not found'));

  socket.data['userId'] = user.id;  // internal UUID — downstream is unchanged
  next();
});
```

The `subscribe:run` ownership check (`run.userId !== socket.data['userId']`) is
**unchanged** — it still compares against our internal UUID.

### `/auth/provision` Security

In Phase 3 this endpoint also gets `requireClerkAuth` preHandler. The `clerkId` in
the request body is now ignored — the server reads it from the verified JWT payload:

```typescript
// clerkId comes from request.clerkId (JWT-verified), not request body
const clerkId = request.clerkId;
```

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/lib/clerkAuth.ts` | New — `requireClerkAuth` preHandler |
| `apps/api/src/lib/resolveUser.ts` | New — `resolveUserByClerkId` helper |
| `apps/api/src/routes/rolls.ts` | Replace header read with `resolveUserByClerkId` |
| `apps/api/src/routes/recruit.ts` | Same |
| `apps/api/src/routes/crew.ts` | Same |
| `apps/api/src/routes/mechanic.ts` | Same |
| `apps/api/src/routes/bootstrap.ts` | Same (GET /runs/:id) |
| `apps/api/src/routes/auth.ts` | Secure provision endpoint with JWT |
| `apps/api/src/server.ts` | Update Socket.IO middleware to verify JWT |
| `apps/web/src/store/useGameStore.ts` | Send `Authorization: Bearer` instead of `x-user-id`; set `socket.auth` callback in `connectToRun` for per-reconnect token refresh |
| `apps/web/src/App.tsx` | Pass `getToken` function into store |

### Acceptance Criteria

- [ ] Removing the `Authorization` header returns 401 on all game routes
- [ ] Sending an expired or tampered JWT returns 401
- [ ] Sending a valid JWT for the wrong user returns 403 (run not owned)
- [ ] `x-user-id` header is no longer read anywhere in the API
- [ ] Socket.IO connection with invalid JWT is rejected
- [ ] All existing gameplay (roll, recruit, mechanic) works end-to-end
- [ ] Token refresh (Clerk auto-refresh) is transparent to the user

---

## Phase 4 — Hardening & Cleanup

**Goal:** Remove all dev stubs, tighten the schema, and ensure the codebase is
production-ready with no vestigial dev infrastructure.

### Remove `/dev/bootstrap`

`apps/api/src/routes/bootstrap.ts`:
- Delete the `app.post('/dev/bootstrap', ...)` handler entirely
- Keep only `app.get('/runs/:id', ...)` (the run-restore endpoint — still needed)
- Remove `DEV_USER_EMAIL`, `DEV_USER_NAME`, `DEV_USER_PASSWORD` constants
- The file can be renamed to `apps/api/src/routes/runs.ts` for clarity

`apps/api/src/server.ts`:
- No plugin change needed (the `bootstrapPlugin` now only exports the GET handler)

`apps/web/src/App.tsx`:
- Remove the `POST /dev/bootstrap` fetch call entirely
- New run creation path: the `provision` response already returns (or creates) the
  user; the client then calls a new `POST /api/v1/runs` endpoint (see below)

### New Endpoint: `POST /api/v1/runs`

The clean replacement for `/dev/bootstrap`. Creates a fresh run for the authenticated
user. No body required.

```typescript
// Returns same shape as bootstrap response (minus userId — that comes from JWT now)
{
  runId: string;
  run: { bankroll, shooters, hype, phase, status, point, crewSlots, currentMarkerIndex }
}
```

Requires `requireClerkAuth` preHandler. Uses `request.clerkId` → `resolveUserByClerkId`
to find the user, then inserts a new run.

### Schema Tightening

**`apps/api/src/db/schema.ts`:**
- `clerkId` column: add `.notNull()` now that all users have Clerk IDs
- `passwordHash` column: make nullable (`.nullable()`) — it was never used for real
  auth. Existing `dev@battlecraps.local` record can be deleted or its hash nulled.

**Startup migration addition:**

```typescript
await db.execute(sql`
  ALTER TABLE users ALTER COLUMN clerk_id SET NOT NULL
`);
```

(Guarded by verifying no null `clerk_id` rows remain first.)

### localStorage Cleanup

Remove `bc_dev_user_id` handling from `App.tsx` entirely. After Phase 4:

| Key | Purpose | Managed by |
|-----|---------|------------|
| `bc_run_id` | Active run UUID for page-refresh recovery | App.tsx |
| `bc_title_shown` | Whether the title cinematic has played | useGameStore.ts |

`userId` is no longer stored in localStorage at all — it's resolved server-side from
the JWT on every request.

### Zustand Store Cleanup

`useGameStore.ts` — remove `userId` from store state entirely. It was only needed
to pass as the `x-user-id` header; now that's done via JWT, the client doesn't need
to know its own internal UUID.

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/routes/runs.ts` (renamed from `bootstrap.ts`) | Remove `POST /dev/bootstrap`; add `POST /runs` (new run creation) |
| `apps/api/src/db/schema.ts` | `clerkId` → `.notNull()`; `passwordHash` → `.nullable()` |
| `apps/api/src/server.ts` | Add `NOT NULL` migration for `clerk_id`; update plugin import |
| `apps/web/src/App.tsx` | Remove `bc_dev_user_id`; remove `/dev/bootstrap` call; use `POST /runs` |
| `apps/web/src/store/useGameStore.ts` | Remove `userId` from state shape |

### Acceptance Criteria

- [ ] `POST /dev/bootstrap` returns 404
- [ ] `POST /api/v1/runs` creates a fresh run for the authenticated user
- [ ] `userId` is no longer stored in localStorage or Zustand state
- [ ] All users in the DB have a non-null `clerk_id`
- [ ] `passwordHash` column is nullable; `dev@battlecraps.local` user is removed
- [ ] Full end-to-end flow: sign in → new run → play → refresh → resume — works
- [ ] `npm run typecheck` passes with zero errors

---

## Environment Variable Reference

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `apps/web/.env` | Yes | Clerk publishable key — safe to expose |
| `CLERK_SECRET_KEY` | `apps/api/.env` | Yes | Clerk secret key — NEVER commit or expose |

Both are obtained from the Clerk dashboard under **API Keys**.

---

## Clerk Dashboard Configuration

Before starting Phase 2, configure the Clerk application:

1. **Create application** — choose "Google" as the only social provider for initial rollout
2. **Allowed redirect URLs** — add `http://localhost:5173` (dev) and `https://battlecraps.com` (prod)
3. **JWT lifetime** — leave at default (60 seconds); Clerk handles refresh automatically
4. **Username** — enable as optional (used as `displayName` in provision endpoint)

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Clerk service outage blocks all logins | Low | Clerk SLA is 99.99%; acceptable for an indie game |
| Token expiry causes mid-game 401 | Low | `getToken()` auto-refreshes; Socket.IO reconnect handles it |
| Phase 2 → Phase 3 window: provision endpoint spoofable | Accepted | Phase 2 is no less secure than current system; Phase 3 closes it quickly |
| Existing dev user data lost | Accepted | Beta data is throwaway; no prod players exist yet |

---

## Rollback Plan

Each phase is independently revertable:
- **Phase 1:** Drop the `clerk_id` column (no app code change needed)
- **Phase 2:** Revert `App.tsx` and remove `auth.ts`; game falls back to bootstrap
- **Phase 3:** Revert route handlers to `x-user-id` reads; revert socket middleware
- **Phase 4:** Restore `/dev/bootstrap` handler from git history

Phases 1–3 can coexist with the old bootstrap flow during the transition window,
making incremental rollout safe.
