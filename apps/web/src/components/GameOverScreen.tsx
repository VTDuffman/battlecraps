// =============================================================================
// BATTLECRAPS — GAME OVER SCREEN
// apps/web/src/components/GameOverScreen.tsx
//
// Rendered when run.status === 'GAME_OVER'.
//
// Aesthetic: harsh neon-red brutalist — stark black background, clinical
// terminal font, aggressive red glow. A deliberate tonal contrast to both
// the warm amber Pub and the green casino felt of the table.
//
// Displays:
//   - "GAME OVER" header with neon bleed + tone-calibrated tagline
//   - Gauntlet pip strip — 9 pips (3 per floor) showing exactly how far they got
//   - Run stats: markers cleared, final bankroll
//   - The crew that was on the rail when the run ended
//   - A prominent PLAY AGAIN button (calls onPlayAgain → bootstrap)
// =============================================================================

import React from 'react';
import { MARKER_TARGETS } from '@battlecraps/shared';
import { useGameStore, selectBankrollDisplay } from '../store/useGameStore.js';
import { getFloorTheme }  from '../lib/floorThemes.js';
import { CREW_EMOJI } from './CrewPortrait.js';

// ---------------------------------------------------------------------------
// Crew name lookup (mirrors TableBoard.tsx)
// ---------------------------------------------------------------------------

const CREW_NAMES: Record<number, string> = {
  1:  '"Lefty"',   2: 'Prof',
  3:  'Mechanic',  4: 'Mathlete',
  5:  'Walker',    6: 'Regular',
  7:  'Spender',   8: 'Shark',
  9:  'Whale',    10: 'Intern',
  11: 'Holly',    12: 'Uncle',
  13: 'Mimic',    14: 'Old Pro',
  15: 'Lucky',
};

// ---------------------------------------------------------------------------
// Floor themes for pip strip — indexed by floorIdx (0 = Floor 1, etc.)
// ---------------------------------------------------------------------------

const FLOOR_PIP_THEMES = [
  getFloorTheme(0),  // Floor 1 — VFW Hall
  getFloorTheme(3),  // Floor 2 — Riverboat
  getFloorTheme(6),  // Floor 3 — The Strip
] as const;

// ---------------------------------------------------------------------------
// Tone-calibrated tagline — shifts based on how far the player got.
// Only shown on GAME OVER (not victory).
// ---------------------------------------------------------------------------

function getToneTagline(cleared: number): string {
  if (cleared === 0) return "The house didn't even break a sweat.";
  if (cleared <= 2)  return "Floor 1 had your number.";
  if (cleared === 3) return "You cleared the VFW. The Riverboat cut you short.";
  if (cleared <= 5)  return "The Riverboat cut the run short.";
  if (cleared === 6) return "Two floors down. The Strip finished it.";
  return "You made it to The Strip. So close."; // 7–8
}

// Category colors for the crew badge in the end screen
const CATEGORY_BG: Record<string, string> = {
  DICE:     '#1e3a5f',
  TABLE:    '#1a3a1a',
  PAYOUT:   '#3a2e00',
  HYPE:     '#2d1a4a',
  WILDCARD: '#3a0a0a',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GameOverScreenProps {
  onPlayAgain: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GameOverScreen: React.FC<GameOverScreenProps> = ({ onPlayAgain }) => {
  const bankrollDisplay    = useGameStore(selectBankrollDisplay);
  const bankroll           = useGameStore((s) => s.bankroll);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const crewSlots          = useGameStore((s) => s.crewSlots);
  const maxBankrollCents   = useGameStore((s) => s.maxBankrollCents);

  const markersCleared   = currentMarkerIndex;
  const totalMarkers     = MARKER_TARGETS.length;
  const isVictory        = markersCleared >= totalMarkers;
  const seatedCrewCount  = crewSlots.filter(Boolean).length;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen
        flex flex-col overflow-hidden
        bg-black border-x-4 border-red-900/70
      "
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,0,0,0.015) 3px, rgba(255,0,0,0.015) 4px)',
      }}
    >
      {/* ── Top bleed bar ─────────────────────────────────────────────────── */}
      <div
        className="flex-none h-1"
        style={{ background: 'linear-gradient(90deg, transparent, #dc2626 30%, #ef4444 50%, #dc2626 70%, transparent)' }}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-none flex flex-col items-center pt-12 pb-6 px-4">
        {isVictory ? (
          <>
            <div className="font-pixel text-[8px] text-yellow-400/80 tracking-widest mb-2">
              ✦ GAUNTLET CLEARED ✦
            </div>
            <h1
              className="font-pixel text-[18px] tracking-wider"
              style={{
                color: '#fbbf24',
                textShadow: '0 0 20px #f59e0b, 0 0 60px #d97706, 0 0 100px #92400e',
              }}
            >
              YOU WIN
            </h1>
          </>
        ) : (
          <>
            <div className="font-pixel text-[8px] text-red-700/70 tracking-widest mb-2">
              ✦ RUN ENDED ✦
            </div>
            <h1
              className="font-pixel text-[18px] tracking-wider"
              style={{
                color: '#ef4444',
                textShadow: '0 0 20px #dc2626, 0 0 60px #991b1b, 0 0 100px #7f1d1d',
              }}
            >
              GAME OVER
            </h1>
            <p className="mt-3 font-pixel text-[6px] text-red-500/50 tracking-wider text-center">
              {getToneTagline(markersCleared)}
            </p>
          </>
        )}

        {/* Harsh divider */}
        <div className="mt-6 w-full h-px bg-red-900/60" />
      </header>

      {/* ── Gauntlet pip strip ──────────────────────────────────────────────── */}
      {!isVictory && (
        <section className="flex-none px-4 pb-5">
          <div className="font-pixel text-[5px] text-red-800/50 tracking-widest text-center mb-3">
            — GAUNTLET PROGRESS —
          </div>
          <GauntletPips cleared={markersCleared} />
        </section>
      )}

      {/* ── Stats block ─────────────────────────────────────────────────────── */}
      <section className="flex-none px-4 pb-6">
        <div
          className="rounded border border-red-900/50 overflow-hidden"
          style={{ background: 'rgba(30, 0, 0, 0.6)' }}
        >
          <StatRow label="FINAL BANKROLL" value={bankrollDisplay} highlight={bankroll > 25_000} />
          <StatRow
            label="MARKERS CLEARED"
            value={`${markersCleared} / ${totalMarkers}`}
            highlight={markersCleared > 0}
          />
          <StatRow label="CREW ON RAIL" value={`${seatedCrewCount} / 5`} />
          {maxBankrollCents > 0 && (
            <StatRow
              label="PERSONAL BEST"
              value={`$${(maxBankrollCents / 100).toLocaleString()}`}
              highlight={bankroll >= maxBankrollCents && bankroll > 25_000}
              isPersonalBest={bankroll >= maxBankrollCents && bankroll > 25_000}
            />
          )}
        </div>
      </section>

      {/* ── End-of-run crew rail ─────────────────────────────────────────────── */}
      <section className="flex-none px-4 pb-6">
        <div className="font-pixel text-[6px] text-red-700/60 tracking-widest mb-3 text-center">
          — LAST CREW STANDING —
        </div>

        <div className="flex justify-around gap-1">
          {crewSlots.map((slot, i) => (
            <EndCrewSlot key={i} index={i} crewId={slot?.crewId ?? null} />
          ))}
        </div>
      </section>

      {/* ── Spacer ───────────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Play Again ──────────────────────────────────────────────────────── */}
      <footer className="flex-none px-4 pb-10">
        <div className="w-full h-px mb-6 bg-red-900/40" />

        <button
          type="button"
          onClick={onPlayAgain}
          className="
            w-full py-4 rounded
            font-pixel text-[10px] tracking-widest
            border-2 border-red-500
            text-red-100
            transition-all duration-150
            active:scale-95
          "
          style={{
            background: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)',
            boxShadow: '0 0 0px 0px rgba(239,68,68,0)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 0 20px 4px rgba(239,68,68,0.4), inset 0 0 20px rgba(239,68,68,0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 0 0px 0px rgba(239,68,68,0)';
          }}
        >
          ▶ PLAY AGAIN
        </button>

        <p className="mt-3 text-center font-pixel text-[5px] text-red-900/60 tracking-wider">
          NEW RUN · $250 BANKROLL · FRESH CREW SLOTS
        </p>
      </footer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  isPersonalBest?: boolean;
}> = ({ label, value, highlight = false, isPersonalBest = false }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-red-900/30 last:border-b-0">
    <span className="font-pixel text-[6px] text-red-700/70 tracking-wider">
      {label}
      {isPersonalBest && (
        <span className="ml-1.5 text-yellow-500/80">★ NEW</span>
      )}
    </span>
    <span
      className={[
        'font-mono text-[11px]',
        highlight ? 'text-green-400' : 'text-red-300/80',
      ].join(' ')}
    >
      {value}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Gauntlet pip strip
//
// 9 pips grouped 3-3-3 by floor, separated by thin vertical rules.
// Cleared pips use the floor's felt/accent palette; boss pips (★) use the
// bright accent so they stand out. Uncleared pips are near-invisible.
// ---------------------------------------------------------------------------

const GauntletPips: React.FC<{ cleared: number }> = ({ cleared }) => (
  <div className="flex items-center justify-center gap-3">
    {FLOOR_PIP_THEMES.map((ft, floorIdx) => (
      <React.Fragment key={floorIdx}>
        {/* Floor separator — thin vertical rule between floors */}
        {floorIdx > 0 && (
          <div
            className="h-5 w-px flex-none"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />
        )}

        {/* 3 pips for this floor */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((markerInFloor) => {
            const markerIdx = floorIdx * 3 + markerInFloor;
            const isBoss    = markerInFloor === 2;   // boss = 3rd of each floor (indices 2, 5, 8)
            const isCleared = markerIdx < cleared;

            return (
              <div
                key={markerInFloor}
                className="flex items-center justify-center rounded-sm flex-none"
                style={{
                  width:      22,
                  height:     22,
                  background: isCleared
                    ? isBoss
                      ? `${ft.accentBright}cc`
                      : `${ft.feltPrimary}dd`
                    : 'rgba(0,0,0,0.45)',
                  border: `1px solid ${
                    isCleared
                      ? isBoss ? ft.accentBright : `${ft.accentPrimary}aa`
                      : 'rgba(255,255,255,0.06)'
                  }`,
                  boxShadow: isCleared
                    ? `0 0 8px 1px ${ft.accentPrimary}35`
                    : 'none',
                }}
              >
                <span
                  className="font-pixel leading-none select-none"
                  style={{
                    fontSize: isBoss ? '8px' : '7px',
                    color: isCleared
                      ? isBoss
                        ? ft.feltPrimary           // ★ on bright boss pip — use felt for contrast
                        : ft.accentBright          // ● on normal pip
                      : 'rgba(255,255,255,0.10)',  // dim for uncleared
                  }}
                >
                  {isBoss ? '★' : '●'}
                </span>
              </div>
            );
          })}
        </div>
      </React.Fragment>
    ))}
  </div>
);

// ---------------------------------------------------------------------------

const EndCrewSlot: React.FC<{ index: number; crewId: number | null }> = ({ index, crewId }) => {
  const name = crewId ? (CREW_NAMES[crewId] ?? `#${crewId}`) : null;

  return (
    <div
      className={[
        'flex flex-col items-center gap-1 px-1.5 py-2 rounded border',
        crewId
          ? 'border-red-800/60'
          : 'border-red-900/20 opacity-30',
      ].join(' ')}
      style={{
        minWidth: 52,
        background: crewId ? CATEGORY_BG['DICE'] : 'rgba(10,0,0,0.4)',
      }}
    >
      {/* Slot number */}
      <div className="font-pixel text-[5px] text-red-800/60">{index}</div>

      {/* Portrait placeholder */}
      <div
        className="w-7 h-7 rounded flex items-center justify-center border border-red-900/40"
        style={{ background: crewId ? 'rgba(80,10,10,0.6)' : 'rgba(20,0,0,0.4)' }}
      >
        {crewId ? (
          <span className="text-base leading-none">
            {CREW_EMOJI[crewId] ?? (name ?? '?').charAt(0)}
          </span>
        ) : (
          <span className="font-pixel text-[7px] text-red-900/40">—</span>
        )}
      </div>

      {/* Name */}
      <div className={[
        'font-pixel text-[4px] text-center leading-tight',
        crewId ? 'text-red-300/70' : 'text-red-900/30',
      ].join(' ')}>
        {name ?? 'EMPTY'}
      </div>
    </div>
  );
};
