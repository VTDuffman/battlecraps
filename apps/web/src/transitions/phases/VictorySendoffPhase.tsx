// =============================================================================
// BATTLECRAPS — VICTORY SEND-OFF PHASE (gated)
// apps/web/src/transitions/phases/VictorySendoffPhase.tsx
//
// Third and final phase of the VICTORY transition. The emotional send-off —
// a congratulatory moment before the player starts a new run.
//
// "▶ START OVER" calls onAdvance → handleAdvance → clearTransition('VICTORY')
// → victoryComplete = true → TransitionOrchestrator's useEffect calls
// onPlayAgain() → new run bootstraps.
//
// Reads from the live store for final bankroll display.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { getFloorTheme }           from '../../lib/floorThemes.js';

const theme = getFloorTheme(8); // Floor 3 — where it ended

export const VictorySendoffPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const bankroll = useGameStore((s) => s.bankroll);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen h-[100dvh]
        flex flex-col items-center justify-center gap-7
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 35%, ${theme.feltPrimary}99 0%, #000 60%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Final bankroll — the number they earned */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div
          className="font-pixel text-[6px] tracking-[0.3em]"
          style={{ color: `${theme.accentPrimary}70` }}
        >
          YOU LEAVE WITH
        </div>
        <div
          className="font-pixel tabular-nums"
          style={{
            fontSize:   'clamp(32px, 9vw, 48px)',
            color:      theme.accentBright,
            textShadow: `0 0 30px ${theme.accentBright}80, 0 0 80px ${theme.accentPrimary}40`,
          }}
        >
          ${(bankroll / 100).toLocaleString()}
        </div>
      </div>

      {/* Divider */}
      <div
        className="w-20 h-px"
        style={{ background: `${theme.accentDim}40` }}
      />

      {/* Flavor text */}
      <div className="flex flex-col gap-3 px-10 max-w-sm text-center">
        <p
          className="font-mono leading-relaxed"
          style={{ fontSize: '10px', color: `${theme.accentPrimary}bb` }}
        >
          VFW Hall. The Riverboat. The Penthouse.
          Three floors, nine markers, one shooter left standing.
        </p>
        <p
          className="font-mono leading-relaxed"
          style={{ fontSize: '9px', color: `${theme.accentPrimary}60` }}
        >
          They said the dice were cold. You made them answer.
        </p>
      </div>

      {/* CTA — calls onAdvance which triggers the new-run chain */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-12 py-3.5 rounded
          font-pixel text-[10px] tracking-widest
          border-2
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          borderColor: theme.accentPrimary,
          background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
          boxShadow:   `0 0 24px 6px ${theme.accentPrimary}35`,
        }}
      >
        ▶ START OVER
      </button>

      {/* Footnote */}
      <p
        className="font-pixel text-[5px] tracking-wider text-center px-10"
        style={{ color: `${theme.accentDim}50` }}
      >
        NEW RUN · $250 BANKROLL · FRESH CREW SLOTS
      </p>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
