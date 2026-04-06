// =============================================================================
// BATTLECRAPS — SOCKET.IO CLIENT SINGLETON
// apps/web/src/lib/socket.ts
//
// One socket for the lifetime of the browser tab.
// Import `socket` wherever you need to emit or listen. The Zustand store is
// the only place that calls socket.on() — all other modules just emit.
// =============================================================================

import { io } from 'socket.io-client';

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001';

/**
 * The shared Socket.IO client instance.
 *
 * autoConnect: false — the store calls socket.connect() explicitly after the
 * user is authenticated and a runId is available, so we don't burn a connection
 * on the login screen.
 */
export const socket = io(API_URL, {
  autoConnect:  false,
  transports:   ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay:    1_000,
  reconnectionAttempts: 10,
});
