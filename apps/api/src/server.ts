// =============================================================================
// BATTLECRAPS — FASTIFY SERVER BOOTSTRAP
// apps/api/src/server.ts
// =============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIO } from 'socket.io';
import type { Server as HttpServer } from 'node:http';

import { eq } from 'drizzle-orm';

import { initIO } from './lib/io.js';
import { db }     from './db/client.js';
import { runs }   from './db/schema.js';
import { rollsPlugin }     from './routes/rolls.js';
import { bootstrapPlugin } from './routes/bootstrap.js';
import { recruitPlugin }   from './routes/recruit.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';

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
  origin: CLIENT_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

await app.register(rollsPlugin,     { prefix: '/api/v1' });
await app.register(bootstrapPlugin, { prefix: '/api/v1' });
await app.register(recruitPlugin,   { prefix: '/api/v1' });

// Health check — used by container orchestration and CI smoke tests
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

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
    origin: CLIENT_ORIGIN,
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
// Require a userId in the handshake auth payload. In production this would be
// a JWT verified here; for now we mirror the x-user-id header convention.

io.use((socket, next) => {
  const userId = socket.handshake.auth?.['userId'];
  if (typeof userId !== 'string' || userId.length === 0) {
    return next(new Error('Unauthorized — userId required in auth payload'));
  }
  // Stash on socket.data so downstream handlers can reference it.
  socket.data['userId'] = userId;
  next();
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
app.log.info(`Socket.IO attached — client origin: ${CLIENT_ORIGIN}`);
