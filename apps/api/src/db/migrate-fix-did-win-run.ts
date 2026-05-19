// =============================================================================
// ONE-TIME MIGRATION: Retroactive did_win_run correction (KI-062)
// apps/api/src/db/migrate-fix-did-win-run.ts
//
// BACKGROUND
// ----------
// Three code paths in rolls.ts did not increment currentMarkerIndex past the
// final gauntlet position when winning on SEVEN_OUT or via pre-roll auto-clear.
// As a result, submitLeaderboardEntry computed didWinRun = false for those runs
// (since GAUNTLET.length - 1 >= GAUNTLET.length is false) and routed them to
// "Gone but Not Forgotten" instead of Hall of Fame / Trailblazers.
//
// This script retroactively sets did_win_run = true for affected rows.
//
// TARGETING LOGIC
// ---------------
// The original game had 4 floors / 12 markers (GAUNTLET.length = 12).
// Floors: Loading Dock → VFW Hall → Riverboat → Strip (boss at index 11, $12,500).
// Confirmed via DB inspection: 4 Trailblazer wins all have highestMarkerIndex = 12
// (POINT_HIT wins correctly advanced to currentMarkerIndex = GAUNTLET.length = 12).
// SEVEN_OUT/auto-clear wins with the bug stayed at highestMarkerIndex = 11.
//
// The date cutoff was removed — all entries postdate 2026-05-13 (leaderboard
// tracking went live after FB-014 shipped, which overlapped with the 12-marker era).
//
// The bankroll floor ($12,500) doubles as a safety check: the current game's
// Floor 4 boss (index 11) still has the same $12,500 target, but a player losing
// at marker 11 in the current game would have far less (or $0) remaining. The one
// known match — DoubleJ at $24,338 — has bankroll 1.95× the target, consistent
// with a win, not an out-of-shooters loss.
//
// Run once from the API workspace:
//   cd apps/api && npx tsx --env-file=.env src/db/migrate-fix-did-win-run.ts
// =============================================================================

import { and, eq, gte } from 'drizzle-orm';
import { db }            from './client.js';
import { leaderboardEntries } from './schema.js';

const ORIGINAL_LAST_MARKER_INDEX  = 11;        // GAUNTLET.length was 12; last valid index = 11
const ORIGINAL_LAST_TARGET_CENTS  = 1_250_000; // $12,500 — Strip boss (marker-11) target

async function run(): Promise<void> {
  console.log('[migrate-fix-did-win-run] Starting retroactive did_win_run correction…');

  const updated = await db
    .update(leaderboardEntries)
    .set({ didWinRun: true })
    .where(and(
      eq(leaderboardEntries.didWinRun, false),
      eq(leaderboardEntries.highestMarkerIndex, ORIGINAL_LAST_MARKER_INDEX),
      gte(leaderboardEntries.finalBankrollCents, ORIGINAL_LAST_TARGET_CENTS),
    ))
    .returning({ id: leaderboardEntries.id, displayName: leaderboardEntries.displayName });

  if (updated.length === 0) {
    console.log('[migrate-fix-did-win-run] No rows matched — nothing to update.');
  } else {
    console.log(`[migrate-fix-did-win-run] Corrected ${updated.length} row(s):`);
    for (const row of updated) {
      console.log(`  • ${row.id} — ${row.displayName}`);
    }
  }

  console.log('[migrate-fix-did-win-run] Done.');
  process.exit(0);
}

run().catch((err: unknown) => {
  console.error('[migrate-fix-did-win-run] Fatal error:', err);
  process.exit(1);
});
