// =============================================================================
// BATTLECRAPS — FASTIFY SERVER BOOTSTRAP
// apps/api/src/server.ts
// =============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIO } from 'socket.io';
import type { Server as HttpServer } from 'node:http';

import { eq, sql } from 'drizzle-orm';

import { initIO } from './lib/io.js';
import { db }     from './db/client.js';
import { runs }   from './db/schema.js';
import { verifyToken } from '@clerk/backend';
import { resolveUserByClerkId } from './lib/resolveUser.js';
import { rollsPlugin }      from './routes/rolls.js';
import { bootstrapPlugin }  from './routes/runs.js';
import { recruitPlugin }    from './routes/recruit.js';
import { crewPlugin }       from './routes/crew.js';
import { mechanicPlugin }   from './routes/mechanic.js';
import { authPlugin }       from './routes/auth.js';
import { crewRosterPlugin } from './routes/crewRoster.js';
import { leaderboardPlugin } from './routes/leaderboard.js';

const PORT = Number(process.env['PORT'] ?? 3001);

// Support multiple allowed origins as a comma-separated list, e.g.:
//   CLIENT_ORIGIN=https://battlecraps.com,https://battlecraps-web.vercel.app
const CLIENT_ORIGINS: string[] = (process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const originList = CLIENT_ORIGINS.length === 1 ? CLIENT_ORIGINS[0]! : CLIENT_ORIGINS;

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  },
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

await app.register(cors, {
  origin: originList,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

await app.register(rollsPlugin,      { prefix: '/api/v1' });
await app.register(bootstrapPlugin,  { prefix: '/api/v1' });
await app.register(recruitPlugin,    { prefix: '/api/v1' });
await app.register(crewPlugin,       { prefix: '/api/v1' });
await app.register(mechanicPlugin,   { prefix: '/api/v1' });
await app.register(authPlugin,       { prefix: '/api/v1' });
await app.register(crewRosterPlugin, { prefix: '/api/v1' });
await app.register(leaderboardPlugin, { prefix: '/api/v1' });

// Health check — Render health check path (healthCheckPath: /health in render.yaml).
// Returns 200 so Render considers the deployment healthy and stops the redeploy loop.
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

// ---------------------------------------------------------------------------
// Startup migrations — idempotent DDL, safe to run on every boot.
// ADD COLUMN IF NOT EXISTS is a no-op when the column already exists, so
// this never breaks a healthy DB. Add new migrations here as columns are added;
// the server won't start listening until they complete.
// ---------------------------------------------------------------------------

await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bankroll_cents bigint NOT NULL DEFAULT 0
`);
app.log.info('[migrate] max_bankroll_cents ensured');

await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id text
`);
await db.execute(sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_clerk_id_unique'
    ) THEN
      ALTER TABLE users ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);
    END IF;
  END
  $$
`);
app.log.info('[migrate] clerk_id column ensured');

// Phase 4: make password_hash nullable (Clerk users have no password).
await db.execute(sql`
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL
`);
app.log.info('[migrate] password_hash nullable ensured');

// Phase 4: back-fill any legacy users that pre-date Clerk, then enforce NOT NULL.
// The UPDATE is a no-op if no NULLs exist; the ALTER succeeds once there are none.
await db.execute(sql`
  UPDATE users SET clerk_id = 'legacy:' || id::text WHERE clerk_id IS NULL
`);
await db.execute(sql`
  ALTER TABLE users ALTER COLUMN clerk_id SET NOT NULL
`);
app.log.info('[migrate] clerk_id NOT NULL ensured');

// FB-007: Tutorial completed flag.
// Backfill existing accounts to true so they never see the tutorial gate.
// Safe to re-run: updating true→true is a no-op; new accounts (created after
// 2026-04-14) start at the default (false) and are not touched by the backfill.
await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed boolean NOT NULL DEFAULT false
`);
await db.execute(sql`
  UPDATE users SET tutorial_completed = true
  WHERE tutorial_completed = false
    AND created_at < '2026-04-14 00:00:00+00'::timestamptz
`);
app.log.info('[migrate] tutorial_completed ensured');

// FB-014: highest_roll_amplified_cents on runs.
await db.execute(sql`
  ALTER TABLE runs ADD COLUMN IF NOT EXISTS highest_roll_amplified_cents integer NOT NULL DEFAULT 0
`);
app.log.info('[migrate] highest_roll_amplified_cents ensured');

// FB-014: leaderboard_entries table + indices.
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id                       uuid        NOT NULL REFERENCES runs(id)  ON DELETE CASCADE,
    display_name                 text        NOT NULL,
    final_bankroll_cents         integer     NOT NULL,
    highest_roll_amplified_cents integer     NOT NULL DEFAULT 0,
    highest_marker_index         smallint    NOT NULL,
    shooters_remaining           smallint    NOT NULL,
    crew_layout                  jsonb       NOT NULL,
    did_win_run                  boolean     NOT NULL,
    created_at                   timestamptz NOT NULL DEFAULT now()
  )
`);
await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_entries_run_id_idx
    ON leaderboard_entries (run_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_winners_idx
    ON leaderboard_entries (final_bankroll_cents DESC, shooters_remaining DESC)
    WHERE did_win_run = true
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_nonwinners_idx
    ON leaderboard_entries (highest_marker_index DESC, final_bankroll_cents DESC)
    WHERE did_win_run = false
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS leaderboard_entries_user_bankroll_idx
    ON leaderboard_entries (user_id, final_bankroll_cents DESC)
`);
app.log.info('[migrate] leaderboard_entries table ensured');

// FB-014: first_name / last_name audit columns on users and leaderboard_entries.
await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text
`);
await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text
`);
await db.execute(sql`
  ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS first_name text
`);
await db.execute(sql`
  ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS last_name text
`);
app.log.info('[migrate] first_name / last_name audit columns ensured');

// KI-030: alias_chosen flag — tracks whether user has explicitly set their public handle.
// All existing users default to false so they are prompted to choose on next sign-in.
await db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_chosen boolean NOT NULL DEFAULT false
`);
app.log.info('[migrate] alias_chosen ensured');

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

await app.listen({ port: PORT, host: '0.0.0.0' });

// ---------------------------------------------------------------------------
// Socket.IO — attach to the Fastify HTTP server AFTER it is bound
// ---------------------------------------------------------------------------
//
// We create Socket.IO here rather than as a Fastify plugin so we get a typed
// `Server` instance we can pass to initIO() — avoiding the need for a custom
// declaration merge on the Fastify instance.

const io = new SocketIO(app.server as HttpServer, {
  cors: {
    origin: originList,
    methods: ['GET', 'POST'],
  },
  // Prefer WebSocket transport; fall back to long-polling on restricted networks.
  transports: ['websocket', 'polling'],
});

// Make the io instance available to all route handlers via the module singleton.
initIO(io);

// ---------------------------------------------------------------------------
// Socket.IO auth middleware
// ---------------------------------------------------------------------------
// Require a Clerk JWT in the handshake auth payload. The token is verified and
// resolved to an internal userId before the connection is accepted.

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.['token'];
  if (typeof token !== 'string' || token.length === 0) {
    return next(new Error('Unauthorized — token required in auth payload'));
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env['CLERK_SECRET_KEY'],
    });
    const user = await resolveUserByClerkId(payload.sub);
    if (!user) return next(new Error('User not found — please re-sign in'));
    // Stash internal UUID on socket.data — downstream ownership checks unchanged.
    socket.data['userId'] = user.id;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// ---------------------------------------------------------------------------
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  app.log.info(`[ws] client connected: ${socket.id} (user: ${socket.data['userId']})`);

  /**
   * 'subscribe:run' — Client joins the room for a specific run.
   *
   * After joining, the client will receive:
   *   - 'cascade:trigger' events as each crew member fires.
   *   - 'turn:settled'    the final bankroll delta and new run state.
   *
   * The client should emit this immediately after the page loads for an
   * in-progress run, or right after creating a new run.
   *
   * Ownership guard: the run must belong to the authenticated socket user.
   */
  socket.on('subscribe:run', async (data: { runId: string }) => {
    if (typeof data.runId !== 'string') return;

    // Verify the requesting user owns this run.
    const run = await db.query.runs.findFirst({
      where:   eq(runs.id, data.runId),
      columns: { userId: true },
    });

    if (!run || run.userId !== socket.data['userId']) {
      socket.emit('error:forbidden', { message: 'Not your run.' });
      return;
    }

    const room = `run:${data.runId}`;
    void socket.join(room);
    app.log.info(`[ws] ${socket.id} joined room ${room}`);
    socket.emit('subscribed', { room });
  });

  socket.on('unsubscribe:run', (data: { runId: string }) => {
    if (typeof data.runId !== 'string') return;
    const room = `run:${data.runId}`;
    void socket.leave(room);
  });

  socket.on('disconnect', (reason) => {
    app.log.info(`[ws] client disconnected: ${socket.id} (${reason})`);
  });
});

app.log.info(`BattleCraps API listening on port ${PORT}`);
app.log.info(`Socket.IO attached — client origins: ${CLIENT_ORIGINS.join(', ')}`);
