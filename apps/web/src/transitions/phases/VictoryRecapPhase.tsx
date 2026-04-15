// =============================================================================
// BATTLECRAPS — VICTORY RECAP PHASE (gated)
// apps/web/src/transitions/phases/VictoryRecapPhase.tsx
//
// Second phase of the VICTORY transition. Shows the final run stats after the
// explosion reveal. Gated — the player advances when ready.
//
// Shows:
//   • MARKERS CLEARED: 9 / 9
//   • FINAL BANKROLL: $X
//   • PERSONAL BEST indicator (★ NEW if this run set a new record)
//   • Three floor checkmarks confirming all floors conquered
//   • CTA to continue to the send-off
//
// Reads from the live store — game is over, no race condition risk.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore, selectBankrollDisplay } from '../../store/useGameStore.js';
import { GAUNTLET, FLOORS }                    from '@battlecraps/shared';
import { getFloorTheme }                       from '../../lib/floorThemes.js';

const theme = getFloorTheme(8); // Floor 3 victory palette

export const VictoryRecapPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const bankrollDisplay  = useGameStore(selectBankrollDisplay);
  const bankroll         = useGameStore((s) => s.bankroll);
  const maxBankrollCents = useGameStore((s) => s.maxBankrollCents);

  const totalMarkers  = GAUNTLET.length;
  const isNewPersonalBest = bankroll >= maxBankrollCents && bankroll > 25_000;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-6
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 30%, ${theme.feltPrimary}aa 0%, #000 60%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Header */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="font-pixel text-[6px] tracking-[0.4em]"
          style={{ color: `${theme.accentPrimary}80` }}
        >
          FINAL STANDINGS
        </div>
        <div
          className="font-pixel text-[14px] tracking-wide"
          style={{
            color:      theme.accentBright,
            textShadow: `0 0 20px ${theme.accentBright}60`,
          }}
        >
          GAUNTLET CLEARED
        </div>
      </div>

      {/* Stats block */}
      <div
        className="w-full max-w-xs mx-auto rounded overflow-hidden"
        style={{
          border:     `1px solid ${theme.accentDim}40`,
          background: 'rgba(0,0,0,0.55)',
        }}
      >
        <RecapRow
          label="MARKERS CLEARED"
          value={`${totalMarkers} / ${totalMarkers}`}
          theme={theme}
          highlight
        />
        <RecapRow
          label="FINAL BANKROLL"
          value={bankrollDisplay}
          theme={theme}
          highlight={bankroll > 25_000}
        />
        {maxBankrollCents > 0 && (
          <RecapRow
            label={isNewPersonalBest ? 'PERSONAL BEST ★ NEW' : 'PERSONAL BEST'}
            value={`$${(maxBankrollCents / 100).toLocaleString()}`}
            theme={theme}
            highlight={isNewPersonalBest}
          />
        )}
        <RecapRow
          label="FLOORS CONQUERED"
          value={`${FLOORS.length} / ${FLOORS.length}`}
          theme={theme}
          highlight
        />
      </div>

      {/* Floor checkmarks */}
      <div className="flex items-center gap-4">
        {FLOORS.map((floor) => {
          const ft = getFloorTheme((floor.id - 1) * 3);
          return (
            <div
              key={floor.id}
              className="flex flex-col items-center gap-0.5"
            >
              <div
                className="font-pixel text-[5px] tracking-wide"
                style={{ color: ft.accentBright }}
              >
                ✓
              </div>
              <div
                className="font-pixel text-[4px]"
                style={{ color: `${ft.accentPrimary}99` }}
              >
                {floor.name.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-10 py-3 rounded
          font-pixel text-[9px] tracking-widest
          border-2
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          borderColor: theme.accentPrimary,
          background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #000 100%)`,
          boxShadow:   `0 0 20px 4px ${theme.accentPrimary}30`,
        }}
      >
        ▶ CONTINUE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

const RecapRow: React.FC<{
  label: string;
  value: string;
  theme: ReturnType<typeof getFloorTheme>;
  highlight?: boolean;
}> = ({ label, value, theme, highlight = false }) => (
  <div
    className="flex items-center justify-between px-4 py-3"
    style={{ borderBottom: `1px solid ${theme.accentDim}20` }}
  >
    <span
      className="font-pixel text-[6px] tracking-wider"
      style={{ color: `${theme.accentPrimary}80` }}
    >
      {label}
    </span>
    <span
      className="font-mono text-[11px]"
      style={{ color: highlight ? theme.accentBright : `${theme.accentPrimary}cc` }}
    >
      {value}
    </span>
  </div>
);
