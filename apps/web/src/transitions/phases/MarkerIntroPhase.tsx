// =============================================================================
// BATTLECRAPS — MARKER INTRO PHASE
// apps/web/src/transitions/phases/MarkerIntroPhase.tsx
//
// Auto-advancing orientation card shown once per marker after the pub and
// before the player's first roll. Gives the player a moment to absorb:
//   • Which floor they are on
//   • Which marker within that floor (pip display)
//   • The target bankroll they are chasing
//   • A contextual warning if the next marker is a boss fight
//
// Reads from the LIVE store (not celebrationSnapshot) because this phase
// fires AFTER the pub — the new marker state is the correct state to show.
//
// Advance mode: 'auto' at 2500ms. The player can also tap to skip early
// (future enhancement — Phase 3 wires auto-advance only for simplicity).
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { GAUNTLET, isBossMarker }  from '@battlecraps/shared';
import { getFloorByMarkerIndex }   from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

export const MarkerIntroPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const marker      = GAUNTLET[currentMarkerIndex];
  const floor       = getFloorByMarkerIndex(currentMarkerIndex);
  const theme       = getFloorTheme(currentMarkerIndex);
  const nextIsBoss  = isBossMarker(currentMarkerIndex);

  // Position within the floor: 0, 1, or 2 (maps to pip display)
  const posInFloor = currentMarkerIndex % 3;

  if (!marker) return null;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-6
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 35%, ${theme.feltPrimary}cc 0%, #050505 70%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Floor label */}
      <div
        className="font-pixel text-[6px] tracking-[0.3em]"
        style={{ color: `${theme.accentPrimary}99` }}
      >
        FLOOR {floor.id} — {floor.name.toUpperCase()}
      </div>

      {/* Pip progress display — position within the floor */}
      <div className="flex items-center gap-3">
        {[0, 1, 2].map((i) => {
          const isActive   = i === posInFloor;
          const isCleared  = i < posInFloor;
          const isUpcoming = i > posInFloor;
          const isBossPos  = i === 2;

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="w-3 h-3 rounded-full transition-all"
                style={{
                  background: isActive
                    ? theme.accentBright
                    : isCleared
                      ? `${theme.accentPrimary}60`
                      : `${theme.accentDim}30`,
                  boxShadow: isActive
                    ? `0 0 10px 2px ${theme.accentBright}80`
                    : 'none',
                  outline: isBossPos
                    ? `1px solid ${theme.accentDim}80`
                    : 'none',
                  outlineOffset: '2px',
                }}
              />
              {isBossPos && (
                <div
                  className="font-pixel text-[4px]"
                  style={{ color: `${theme.accentDim}80` }}
                >
                  BOSS
                </div>
              )}
              {!isBossPos && isUpcoming && (
                <div className="h-[10px]" /> // spacer to keep alignment
              )}
              {!isBossPos && !isUpcoming && <div className="h-[10px]" />}
            </div>
          );
        })}
      </div>

      {/* Target amount */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className="font-pixel text-[7px] tracking-widest"
          style={{ color: `${theme.accentPrimary}80` }}
        >
          {nextIsBoss ? '⚔ BOSS MARKER TARGET' : 'MARKER TARGET'}
        </div>

        <div
          className="font-pixel text-[28px] tabular-nums"
          style={{
            color:      theme.accentBright,
            textShadow: `0 0 20px ${theme.accentBright}60, 0 0 60px ${theme.accentPrimary}30`,
          }}
        >
          ${(marker.targetCents / 100).toLocaleString()}
        </div>

        <div
          className="font-pixel text-[6px] tracking-widest"
          style={{ color: `${theme.accentPrimary}60` }}
        >
          {marker.venue.toUpperCase()}
        </div>
      </div>

      {/* Boss warning */}
      {nextIsBoss && (
        <div
          className="px-6 py-3 mx-8 rounded text-center"
          style={{
            background:  'rgba(0,0,0,0.55)',
            border:      `1px solid ${theme.bossBorderColor}`,
          }}
        >
          <p
            className="font-pixel text-[6px] tracking-wide"
            style={{ color: theme.bossTextColor }}
          >
            ★ {floor.bossName.toUpperCase()} AWAITS IN THE HIGH LIMIT ROOM
          </p>
          <p
            className="font-mono text-[7px] mt-1 italic"
            style={{ color: `${theme.bossTextColor}70` }}
          >
            {floor.bossTeaser}
          </p>
        </div>
      )}

      {/* Tap to skip (subtle affordance) */}
      <button
        type="button"
        onClick={onAdvance}
        className="absolute bottom-6 font-pixel text-[5px] tracking-widest opacity-30 hover:opacity-60 transition-opacity"
        style={{ color: theme.accentPrimary }}
      >
        TAP TO CONTINUE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
