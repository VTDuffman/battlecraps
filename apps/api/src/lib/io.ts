// =============================================================================
// BATTLECRAPS — SOCKET.IO SINGLETON
// apps/api/src/lib/io.ts
//
// Holds the single Socket.IO Server instance for the process.
// Initialised once in server.ts after Fastify starts listening.
// Route handlers import getIO() to emit events.
//
// ROOM CONVENTION:
//   - When a client connects and subscribes to a run, the client emits:
//       socket.emit('subscribe:run', { runId })
//   - The server joins that socket to the room `run:{runId}`.
//   - The roll handler emits cascade events to `run:{runId}` so any
//     connected viewers (future multi-spectator feature) receive them.
// =============================================================================

import type { Server as SocketIOServer } from 'socket.io';

let _io: SocketIOServer | null = null;

/** Called once from server.ts after the HTTP server is bound. */
export function initIO(io: SocketIOServer): void {
  if (_io !== null) {
    throw new Error('Socket.IO already initialised — initIO() called twice.');
  }
  _io = io;
}

/**
 * Returns the Socket.IO server instance.
 * Throws if called before initIO() — this is a programmer error, not a runtime
 * error, so a hard throw is appropriate.
 */
export function getIO(): SocketIOServer {
  if (_io === null) {
    throw new Error('Socket.IO not initialised — call initIO() first.');
  }
  return _io;
}
