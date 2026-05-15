// =============================================================================
// MIGRATION: migrate-loading-dock.ts
// FB-015 — The Loading Dock (Floor 1)
//
// Run with:
//   cd apps/api && npx tsx --env-file=../../.env src/db/migrate-loading-dock.ts
//
// Operations:
//   1. runs              — shift current_marker_index +3 on all non-terminal runs
//                          (Loading Dock prepended; old indices 0–8 → 3–11)
//   2. runs (terminal)   — shift current_marker_index +3 on GAME_OVER/TRANSITION
//                          runs for historical accuracy
//   3. leaderboard_entries — shift highest_marker_index +3 on all entries
// =============================================================================

import { db } from './client.js';
import { sql } from 'drizzle-orm';

console.log('[migrate-loading-dock] Starting…');

// ── 1 & 2. runs — shift all rows ─────────────────────────────────────────────
// Cap at 11 (new final marker index) to guard against any edge-case value.
await db.execute(sql`
  UPDATE runs
  SET current_marker_index = LEAST(current_marker_index + 3, 11)
`);
console.log('[migrate-loading-dock] runs: current_marker_index shifted +3 (capped at 11).');

// ── 3. leaderboard_entries — shift highest_marker_index ──────────────────────
await db.execute(sql`
  UPDATE leaderboard_entries
  SET highest_marker_index = LEAST(highest_marker_index + 3, 11)
`);
console.log('[migrate-loading-dock] leaderboard_entries: highest_marker_index shifted +3 (capped at 11).');

console.log('[migrate-loading-dock] Done.');
process.exit(0);
