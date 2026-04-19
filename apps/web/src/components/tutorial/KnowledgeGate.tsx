// =============================================================================
// BATTLECRAPS — KNOWLEDGE GATE
// apps/web/src/components/tutorial/KnowledgeGate.tsx
//
// "You ever shot dice before?" — pre-tutorial choice screen.
// Rendered as an absolute overlay above <TableBoard /> in AuthenticatedApp.
//
// Three paths:
//   SHOW ME EVERYTHING  → onFull()   — beats 1–11 (craps basics + BattleCraps)
//   YEAH, I KNOW CRAPS  → onBCOnly() — beats 8–11 (BattleCraps rules only)
//   Skip Tutorial →     → onSkip()   — dismiss immediately, mark complete
// =============================================================================

import React from 'react';
import { getFloorTheme } from '../../lib/floorThemes.js';
import { SalPortrait }   from './SalPortrait.js';

const theme = getFloorTheme(0);

interface KnowledgeGateProps {
  onFull:   () => void;
  onBCOnly: () => void;
  onSkip:   () => void;
}

export const KnowledgeGate: React.FC<KnowledgeGateProps> = ({ onFull, onBCOnly, onSkip }) => (
  <div
    className="absolute inset-0 z-50 flex flex-col items-center justify-center"
    style={{ background: 'rgba(0,0,0,0.88)' }}
  >
    <div className="w-full max-w-lg mx-auto px-8 py-10 flex flex-col items-center gap-7">

      {/* Sal portrait + opening line */}
      <div className="flex flex-col items-center gap-4">
        <SalPortrait size="md" />
        <p
          className="font-mono text-center leading-relaxed max-w-xs"
          style={{ fontSize: '11px', color: `${theme.accentPrimary}CC` }}
        >
          "You ever shot dice before?"
        </p>
      </div>

      {/* Divider */}
      <div
        className="w-12 h-px flex-none"
        style={{ background: `${theme.accentDim}40` }}
      />

      {/* Choice buttons */}
      <div className="flex flex-col gap-3 w-full">

        {/* Primary — full tutorial */}
        <button
          type="button"
          onClick={onFull}
          className="
            w-full py-4 rounded border-2
            font-pixel text-[9px] tracking-widest
            transition-all duration-150 active:scale-[0.98]
          "
          style={{
            borderColor: theme.accentPrimary,
            background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
            color:        '#fef3c7',
            boxShadow:    `0 0 20px 4px ${theme.accentPrimary}30`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              `0 0 28px 6px ${theme.accentPrimary}50`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              `0 0 20px 4px ${theme.accentPrimary}30`;
          }}
        >
          SHOW ME EVERYTHING
          <div className="font-dense text-[7px] text-gray-400 mt-1 normal-case tracking-normal font-normal">
            Full craps basics + BattleCraps rules
          </div>
        </button>

        {/* Secondary — BC-only */}
        <button
          type="button"
          onClick={onBCOnly}
          className="
            w-full py-4 rounded border
            font-pixel text-[9px] tracking-widest
            transition-all duration-150 active:scale-[0.98]
          "
          style={{
            borderColor: `${theme.accentDim}80`,
            background:  'rgba(10,10,10,0.8)',
            color:        `${theme.accentPrimary}CC`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          }}
        >
          YEAH, I KNOW CRAPS
          <div className="font-dense text-[7px] text-gray-400 mt-1 normal-case tracking-normal font-normal">
            Just show me the BattleCraps rules
          </div>
        </button>
      </div>

      {/* Skip link */}
      <button
        type="button"
        onClick={() => { void fetch('/api/v1/auth/tutorial-complete', { method: 'POST' }); onSkip(); }}
        className="font-pixel text-[7px] tracking-widest transition-colors duration-150"
        style={{ color: `${theme.accentDim}60` }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = `${theme.accentDim}90`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = `${theme.accentDim}60`;
        }}
      >
        Skip Tutorial →
      </button>

    </div>
  </div>
);
