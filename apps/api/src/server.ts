// =============================================================================
// BATTLECRAPS — FASTIFY SERVER BOOTSTRAP
// apps/api/src/server.ts
// =============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIO } from 'socket.io';
import type { Server as HttpServer } from 'node:http';

import { initIO } from './lib/io.js';
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
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  app.log.info(`[ws] client connected: ${socket.id}`);

  /**
   * 'subscribe:run' — Client joins the room for a specific run.
   *
   * After joining, the client will receive:
   *   - 'cascade:trigger' events as each crew member fires.
   *   - 'turn:settled'    the final bankroll delta and new run state.
   *
   * The client should emit this immediately after the page loads for an
   * in-progress run, or right after creating a new run.
   */
  socket.on('subscribe:run', (data: { runId: string }) => {
    if (typeof data.runId !== 'string') return;
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
