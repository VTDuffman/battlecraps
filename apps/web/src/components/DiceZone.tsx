// =============================================================================
// BATTLECRAPS — DICE ZONE
// apps/web/src/components/DiceZone.tsx
//
// The centre strip of the table. Shows:
//   - The last dice roll (placeholder squares until Phase 5 3D dice).
//   - The roll result label (NATURAL, SEVEN OUT, etc.).
//   - The active POINT marker (a puck that appears when phase = POINT_ACTIVE).
//   - The ROLL button (triggers the POST /runs/:id/roll API call).
//   - A delta flash (+$X or -$X) that appears briefly after settlement.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { MARKER_TARGETS } from '@battlecraps/shared';
import { useGameStore, selectBankrollDisplay, selectHypeDisplay } from '../store/useGameStore.js';

const ROLL_RESULT_LABELS: Record<string, string> = {
  NATURAL:       'NATURAL!',
  CRAPS_OUT:     'CRAPS OUT',
  POINT_SET:     'POINT SET',
  POINT_HIT:     'POINT HIT!',
  SEVEN_OUT:     'SEVEN OUT',
  NO_RESOLUTION: '—',
};

const ROLL_RESULT_COLOURS: Record<string, string> = {
  NATURAL:       'text-gold-bright',
  CRAPS_OUT:     'text-red-400',
  POINT_SET:     'text-blue-300',
  POINT_HIT:     'text-gold-bright',
  SEVEN_OUT:     'text-red-500',
  NO_RESOLUTION: 'text-white/30',
};

export const DiceZone: React.FC = () => {
  const runId         = useGameStore((s) => s.runId);
  const userId        = useGameStore((s) => s.userId);
  const isRolling     = useGameStore((s) => s.isRolling);
  const rollDice      = useGameStore((s) => s.rollDice);
  const phase         = useGameStore((s) => s.phase);
  const point         = useGameStore((s) => s.point);
  const lastDice      = useGameStore((s) => s.lastDice);
  const lastResult    = useGameStore((s) => s.lastRollResult);
  const lastDelta     = useGameStore((s) => s.lastDelta);
  const lastBetDelta  = useGameStore((s) => s.lastBetDelta);
  const _betDeltaKey  = useGameStore((s) => s._betDeltaKey);
  const bets          = useGameStore((s) => s.bets);
  const bankrollStr   = useGameStore(selectBankrollDisplay);
  const hypeStr       = useGameStore(selectHypeDisplay);
  const status             = useGameStore((s) => s.status);
  const shooters           = useGameStore((s) => s.shooters);
  const bankroll           = useGameStore((s) => s.bankroll);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  // Post-roll WIN flash — only fires for positive deltas (net profit after roll).
  // Losses are intentionally excluded here; the deduction was already shown
  // at bet-placement time via the animation below.
  const [showDelta, setShowDelta] = useState(false);
  useEffect(() => {
    if (lastDelta !== null && lastDelta > 0) {
      setShowDelta(true);
      const t = setTimeout(() => setShowDelta(false), 1800);
      return () => clearTimeout(t);
    }
  }, [lastDelta]);

  // Bet-placement LOSS flash — fires immediately when the player places a chip.
  // Keyed on _betDeltaKey so it re-triggers even if the same amount is placed twice.
  const [showBetDelta, setShowBetDelta] = useState(false);
  useEffect(() => {
    if (lastBetDelta !== null && lastBetDelta < 0) {
      setShowBetDelta(true);
      const t = setTimeout(() => setShowBetDelta(false), 1200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_betDeltaKey]);

  const canRoll =
    !isRolling &&
    runId !== null &&
    (status === 'IDLE_TABLE' || status === 'POINT_ACTIVE');

  const handleRoll = useCallback(async () => {
    if (!canRoll) return;
    await rollDice();
  }, [canRoll, rollDice]);

  return (
    <div className="relative flex flex-col items-center gap-3 py-4">

      {/* ── HUD row: bankroll | shooters | hype ────────────────────────── */}
      <div className="w-full flex justify-between items-center px-2">
        <div className="text-left">
          <div className="font-pixel text-[7px] text-white/40 mb-0.5">BANKROLL</div>
          <div className="font-pixel text-sm text-gold-bright">{bankrollStr}</div>
        </div>

        <div className="text-center">
          <div className="font-pixel text-[7px] text-white/40 mb-0.5">SHOOTERS</div>
          <div className="flex gap-1 justify-center">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-2.5 h-2.5 rounded-full border',
                  i < shooters
                    ? 'bg-gold border-gold/80'
                    : 'bg-transparent border-white/20',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="font-pixel text-[7px] text-white/40 mb-0.5">HYPE</div>
          <div className={`font-pixel text-sm text-gold ${Number(hypeStr) > 1.0 ? 'animate-hype-pulse' : ''}`}>
            {hypeStr}
          </div>
        </div>
      </div>

      {/* ── Marker progress bar ─────────────────────────────────────────── */}
      <MarkerProgress bankroll={bankroll} markerIndex={currentMarkerIndex} />

      {/* ── Point puck ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div
          className={[
            'w-10 h-10 rounded-full border-2 flex items-center justify-center',
            'font-pixel text-[9px] transition-all duration-300',
            phase === 'POINT_ACTIVE' && point !== null
              ? 'bg-white border-white text-black shadow-[0_0_10px_2px_rgba(255,255,255,0.6)]'
              : 'bg-black border-white/20 text-white/20',
          ].join(' ')}
        >
          {phase === 'POINT_ACTIVE' && point !== null ? point : 'OFF'}
        </div>
        <span className="font-pixel text-[7px] text-white/30">
          {phase === 'POINT_ACTIVE' ? 'POINT ACTIVE' : 'COME OUT'}
        </span>
      </div>

      {/* ── Dice display ───────────────────────────────────────────────── */}
      <div className="flex gap-4 items-center">
        {lastDice ? (
          <>
            <Die value={lastDice[0]} />
            <Die value={lastDice[1]} />
          </>
        ) : (
          <>
            <DiePlaceholder />
            <DiePlaceholder />
          </>
        )}
      </div>

      {/* ── Roll result label ───────────────────────────────────────────── */}
      <div className="h-6 flex items-center">
        {lastResult && lastResult !== 'NO_RESOLUTION' && (
          <span
            className={[
              'font-pixel text-[9px]',
              ROLL_RESULT_COLOURS[lastResult] ?? 'text-white',
            ].join(' ')}
          >
            {ROLL_RESULT_LABELS[lastResult] ?? lastResult}
          </span>
        )}
      </div>

      {/* ── Post-roll WIN flash ──────────────────────────────────────────── */}
      {showDelta && lastDelta !== null && lastDelta > 0 && (
        <div
          key={lastDelta}
          className="absolute top-6 font-pixel text-lg animate-bark-rise pointer-events-none text-gold-bright"
        >
          {`+$${(lastDelta / 100).toFixed(2)}`}
        </div>
      )}

      {/* ── Bet-placement LOSS flash ─────────────────────────────────────── */}
      {showBetDelta && lastBetDelta !== null && (
        <div
          key={_betDeltaKey}
          className="absolute top-6 font-pixel text-lg animate-bark-rise pointer-events-none text-red-400"
        >
          {`-$${(Math.abs(lastBetDelta) / 100).toFixed(2)}`}
        </div>
      )}

      {/* ── Roll button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        disabled={!canRoll}
        onClick={() => void handleRoll()}
        className={[
          'mt-1 px-8 py-2 rounded',
          'font-pixel text-[10px]',
          'border-2 transition-all duration-150',
          canRoll
            ? [
                'bg-gold border-gold-bright text-black',
                'hover:bg-gold-bright hover:shadow-[0_0_14px_3px_rgba(245,200,66,0.5)]',
                'active:scale-95',
              ].join(' ')
            : 'bg-felt-dark border-white/10 text-white/20 cursor-not-allowed',
        ].join(' ')}
      >
        {isRolling ? 'ROLLING…' : 'ROLL'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Marker Progress Bar
// ---------------------------------------------------------------------------

const MarkerProgress: React.FC<{ bankroll: number; markerIndex: number }> = ({
  bankroll,
  markerIndex,
}) => {
  const target   = MARKER_TARGETS[markerIndex] ?? MARKER_TARGETS[MARKER_TARGETS.length - 1]!;
  const isBoss   = markerIndex === MARKER_TARGETS.length - 1;
  const progress = Math.min(bankroll / target, 1);
  const label    = isBoss ? '★ BOSS' : `MARKER ${markerIndex + 1}`;
  const pct      = Math.round(progress * 100);

  return (
    <div className="w-full px-2 space-y-1">
      <div className="flex justify-between items-baseline">
        <span
          className={[
            'font-pixel text-[6px]',
            isBoss ? 'text-red-400' : 'text-gold/60',
          ].join(' ')}
        >
          {label}
        </span>
        <span className="font-pixel text-[6px] text-white/30">
          ${(bankroll / 100).toFixed(0)} / ${(target / 100).toFixed(0)}
        </span>
      </div>

      {/* Track */}
      <div className="h-1.5 w-full rounded-full bg-felt-dark border border-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isBoss
              ? 'linear-gradient(90deg, #7f1d1d, #ef4444)'
              : 'linear-gradient(90deg, #8a6810, #f5c842)',
          }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dice sub-components (placeholder until Phase 5 3D dice)
// ---------------------------------------------------------------------------

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};

const Die: React.FC<{ value: number }> = ({ value }) => {
  const dots = DOT_POSITIONS[value] ?? [];
  return (
    <div className="relative w-12 h-12 bg-white rounded-md border-2 border-white/80 shadow-md">
      {dots.map(([x, y], i) => (
        <div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full bg-black"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
    </div>
  );
};

const DiePlaceholder: React.FC = () => (
  <div className="w-12 h-12 rounded-md border-2 border-dashed border-white/20 bg-felt-dark/60" />
);
