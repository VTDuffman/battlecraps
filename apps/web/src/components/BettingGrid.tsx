// =============================================================================
// BATTLECRAPS — BETTING GRID
// apps/web/src/components/BettingGrid.tsx
//
// The top half of the table. Contains:
//   - A chip selector row (pick your denomination before placing)
//   - Pass Line (available during COME_OUT)
//   - Odds (only active during POINT_ACTIVE)
//   - Hardways × 4 (H4, H6, H8, H10)
//
// Interaction model:
//   Left-click  → placeBet(field, activeChip)  — deducts from bankroll instantly
//   Right-click → removeBet(field)             — returns entire bet to bankroll
// =============================================================================

import React, { useCallback } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import type { BetField } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Chip denominations available for selection
// ---------------------------------------------------------------------------

const CHIPS: { cents: number; label: string; color: string }[] = [
  { cents: 100,   label: '$1',  color: '#c0c0c0' },
  { cents: 500,   label: '$5',  color: '#c0392b' },
  { cents: 1_000, label: '$10', color: '#2980b9' },
  { cents: 2_500, label: '$25', color: '#27ae60' },
  { cents: 5_000, label: '$50', color: '#8e44ad' },
];

function formatCents(cents: number): string {
  if (cents === 0) return '';
  if (cents < 100) return `${cents}¢`;
  return `$${cents / 100}`;
}

// ---------------------------------------------------------------------------
// Chip selector
// ---------------------------------------------------------------------------

export const ChipSelector: React.FC<{ activeChip: number; disabled: boolean }> = ({
  activeChip,
  disabled,
}) => {
  const setActiveChip = useGameStore((s) => s.setActiveChip);

  return (
    <div className="flex justify-center gap-2" style={{ marginBottom: 'clamp(4px,0.8dvh,12px)' }}>
      {CHIPS.map(({ cents, label, color }) => {
        const isActive = activeChip === cents;
        return (
          <button
            key={cents}
            type="button"
            disabled={disabled}
            onClick={() => setActiveChip(cents)}
            className={[
              'rounded-full border-2 flex items-center justify-center',
              'font-pixel text-[6px] transition-all duration-100',
              disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95',
              isActive
                ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.4)] scale-110'
                : 'opacity-60 hover:opacity-90',
            ].join(' ')}
            style={{
              background: isActive ? color : 'transparent',
              borderColor: color,
              color: isActive ? '#fff' : color,
              width: 'clamp(28px,3.5dvh,36px)',
              height: 'clamp(28px,3.5dvh,36px)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Individual bet zone
// ---------------------------------------------------------------------------

interface BetZoneProps {
  label:           string;
  sublabel?:       string;
  field:           BetField;
  amount:          number;
  committedAmount: number;
  disabled:        boolean;
  highlight?:      boolean;
  wide?:           boolean;
  popAmount?:      number;   // cents — show floating pop if > 0
  popKey?:         number;   // React key to re-fire animation each reveal
  popDelay?:       number;   // ms stagger delay
  streakCount?:    number;   // consecutive point hits — shows flame badge >= 2
}

const BetZone: React.FC<BetZoneProps> = ({
  label,
  sublabel,
  field,
  amount,
  committedAmount,
  disabled,
  highlight = false,
  wide = false,
  popAmount = 0,
  popKey = 0,
  popDelay = 0,
  streakCount = 0,
}) => {
  const placeBet   = useGameStore((s) => s.placeBet);
  const removeBet  = useGameStore((s) => s.removeBet);
  const activeChip = useGameStore((s) => s.activeChip);

  // A bet is "locked" when the entire amount is committed from the last roll.
  // Right-click is a no-op in this state — nothing pending to undo.
  const isLocked  = committedAmount > 0 && amount <= committedAmount;
  const hasPending = amount > committedAmount;

  const handleClick = useCallback(() => {
    placeBet(field, activeChip);
  }, [field, activeChip, placeBet]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!hasPending) return; // nothing above the committed floor — no-op
    removeBet(field);
  }, [field, removeBet, hasPending]);

  const hasBet = amount > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={[
        'relative flex flex-col items-center justify-center',
        'border-2 rounded transition-all duration-150',
        'font-pixel text-center',
        wide ? 'col-span-2' : '',

        highlight
          ? 'border-gold bg-gold/20 shadow-[0_0_12px_2px_rgba(212,160,23,0.4)]'
          : hasBet
            ? 'border-gold/70 bg-felt-light/40'
            : 'border-felt-light/30 bg-felt-dark/40',

        disabled
          ? 'opacity-30 cursor-not-allowed'
          : 'cursor-pointer hover:border-gold/80 hover:bg-felt-light/20 active:scale-95',
      ].join(' ')}
      style={{ height: 'clamp(46px,6.8dvh,64px)' }}
    >
      <span className="text-[7px] text-white/80 leading-tight">{label}</span>
      {sublabel && (
        <span className="text-[6px] text-white/40 mt-0.5">{sublabel}</span>
      )}

      {/* Chip stack overlay */}
      {hasBet && (
        <div
          className={[
            'absolute -top-2 -right-2',
            'w-7 h-7 rounded-full',
            'flex items-center justify-center',
            'border-2 font-pixel text-[6px] text-white shadow-md',
            // Locked chips use a muted orange to signal "can't undo";
            // pending chips use the standard chip-red.
            isLocked
              ? 'bg-amber-700/80 border-amber-400/60'
              : 'bg-chip-red border-white/80 animate-bet-drop',
          ].join(' ')}
        >
          {formatCents(amount)}
        </div>
      )}

      {/* Lock icon on the chip when fully committed */}
      {isLocked && (
        <div className="absolute -top-2 -right-2 w-7 h-7 flex items-end justify-start pointer-events-none">
          <span className="text-[7px] leading-none text-amber-300/80">🔒</span>
        </div>
      )}

      {/* Pass line streak badge — bottom-left, visible when streak >= 2 */}
      {streakCount >= 2 && (
        <div
          className={[
            'absolute bottom-1 left-1 pointer-events-none',
            'font-pixel leading-none',
            streakCount >= 4
              ? 'text-[9px] text-red-400 animate-hype-blaze'
              : streakCount === 3
                ? 'text-[8px] text-orange-400 animate-hype-hot'
                : 'text-[7px] text-yellow-300',
          ].join(' ')}
        >
          {'🔥'.repeat(Math.min(streakCount, 4))}
        </div>
      )}

      {/* Floating payout pop */}
      {popAmount > 0 && (
        <div
          key={popKey}
          className="absolute bottom-full left-1/2 -translate-x-1/2 pointer-events-none font-pixel text-[8px] text-yellow-300 animate-payout-pop"
          style={{ animationDelay: `${popDelay}ms` }}
        >
          +${(popAmount / 100).toFixed(2)}
        </div>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Betting Grid
// ---------------------------------------------------------------------------

export const BettingGrid: React.FC = () => {
  const phase                = useGameStore((s) => s.phase);
  const point                = useGameStore((s) => s.point);
  const bets                 = useGameStore((s) => s.bets);
  const committedBets        = useGameStore((s) => s.committedBets);
  const isRolling            = useGameStore((s) => s.isRolling);
  const payoutPops           = useGameStore((s) => s.payoutPops);
  const _popsKey             = useGameStore((s) => s._popsKey);
  const consecutivePointHits = useGameStore((s) => s.consecutivePointHits);
  const isComeOut     = phase === 'COME_OUT' || phase === null;
  const isPointActive = phase === 'POINT_ACTIVE';

  return (
    <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.5dvh,8px)' }}>
      {/* ── Row 1: Pass Line + Odds ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        <BetZone
          label="PASS LINE"
          sublabel="1:1"
          field="passLine"
          amount={bets.passLine}
          committedAmount={committedBets.passLine}
          disabled={isRolling || isPointActive}
          wide
          popAmount={payoutPops?.passLine ?? 0}
          popKey={_popsKey}
          popDelay={0}
          streakCount={consecutivePointHits}
        />
        <BetZone
          label="ODDS"
          sublabel={point ? oddsLabel(point) : 'TRUE ODDS'}
          field="odds"
          amount={bets.odds}
          committedAmount={committedBets.odds}
          disabled={isRolling || isComeOut}
          wide
          popAmount={payoutPops?.odds ?? 0}
          popKey={_popsKey}
          popDelay={80}
        />
      </div>

      {/* ── Row 2: Four Hardways ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { field: 'hard4'  as BetField, label: 'HARD 4',  sublabel: '7:1' },
            { field: 'hard6'  as BetField, label: 'HARD 6',  sublabel: '9:1' },
            { field: 'hard8'  as BetField, label: 'HARD 8',  sublabel: '9:1' },
            { field: 'hard10' as BetField, label: 'HARD 10', sublabel: '7:1' },
          ]
        ).map(({ field, label, sublabel }, idx) => (
          <BetZone
            key={field}
            label={label}
            sublabel={sublabel}
            field={field}
            amount={bets.hardways[field as keyof typeof bets.hardways]}
            committedAmount={committedBets.hardways[field as keyof typeof committedBets.hardways]}
            disabled={isRolling}
            popAmount={payoutPops?.hardwayField === field ? (payoutPops?.hardways ?? 0) : 0}
            popKey={_popsKey}
            popDelay={160 + idx * 80}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function oddsLabel(point: number): string {
  const map: Record<number, string> = {
    4: '2:1', 5: '3:2', 6: '6:5',
    8: '6:5', 9: '3:2', 10: '2:1',
  };
  return map[point] ?? 'TRUE ODDS';
}
