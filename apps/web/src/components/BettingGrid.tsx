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

import React, { useCallback, useEffect, useRef } from 'react';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import type { BetField } from '../store/useGameStore.js';
import { getMaxBet, getTideStage, GAUNTLET, isBossMarker } from '@battlecraps/shared';
import { getFloorIndex } from '../lib/floorThemes.js';
import { useTutorialContext } from '../contexts/TutorialContext.js';
import { isRuleOn, paramsOfRule, ruleCounter, selectTableMarkerIndex } from '../lib/bossRules.js';

// ---------------------------------------------------------------------------
// Chip denominations — dynamically derived from the current marker's max bet
// ---------------------------------------------------------------------------

type Chip = { cents: number; label: string; color: string };

const CHIP_COLORS = ['#c0c0c0', '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#0d9488'];

function formatChipLabel(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${d / 1_000_000}M`;
  if (d >= 1_000) return `$${d / 1_000}K`;
  return `$${d}`;
}

// Casino standard chip denominations, in cents (ascending).
const CASINO_DENOMS_CENTS: readonly number[] = [
  100,         // $1
  500,         // $5
  1_000,       // $10
  2_500,       // $25
  5_000,       // $50
  10_000,      // $100
  25_000,      // $250
  50_000,      // $500
  100_000,     // $1K
  250_000,     // $2.5K
  500_000,     // $5K
  1_000_000,   // $10K
  2_500_000,   // $25K
  5_000_000,   // $50K
  10_000_000,  // $100K
  25_000_000,  // $250K
  50_000_000,  // $500K
  100_000_000, // $1M
  250_000_000, // $2.5M
  500_000_000, // $5M
];

function chipsForMarker(markerIndex: number): Chip[] {
  const maxBet = getMaxBet(markerIndex);

  // Build chip set: standard casino denoms below maxBet, plus maxBet itself as top chip.
  const denoms = CASINO_DENOMS_CENTS.filter((d) => d < maxBet);
  denoms.push(maxBet);

  // Keep at most 6 chips, always preserving the largest (maxBet).
  const selected = denoms.length > 6 ? denoms.slice(denoms.length - 6) : denoms;

  return selected.map((cents, i) => ({
    cents,
    label: formatChipLabel(cents),
    color: CHIP_COLORS[i % CHIP_COLORS.length]!,
  }));
}

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
  const setActiveChip      = useGameStore((s) => s.setActiveChip);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const chips              = chipsForMarker(currentMarkerIndex);

  return (
    <div className="w-full flex justify-center gap-2" style={{ marginBottom: 'clamp(2px,0.4dvh,12px)' }}>
      {chips.map(({ cents, label, color }) => {
        const isActive = activeChip === cents;
        return (
          <button
            key={cents}
            type="button"
            disabled={disabled}
            onClick={() => setActiveChip(cents)}
            className={[
              'rounded-full border-2 flex items-center justify-center',
              'font-pixel text-r-7 transition-all duration-100',
              disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95',
              isActive
                ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.4)] scale-110'
                : 'opacity-60 hover:opacity-90',
            ].join(' ')}
            style={{
              background: isActive ? color : 'transparent',
              borderColor: color,
              color: isActive ? '#fff' : color,
              width: 'clamp(28px,3.5dvh,45px)',
              height: 'clamp(28px,3.5dvh,45px)',
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
  tutorialZone?:   string;   // data-tutorial-zone attribute for spotlight targeting
  /** FB-037: The Sovereign's Dead Calm — the square is under water (and disabled). */
  waterlogged?:    boolean;
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
  waterlogged = false,
  popAmount = 0,
  popKey = 0,
  popDelay = 0,
  streakCount = 0,
  tutorialZone,
}) => {
  const placeBet        = useGameStore((s) => s.placeBet);
  const removeBet       = useGameStore((s) => s.removeBet);
  const activeChip      = useGameStore((s) => s.activeChip);
  const isNullSpace     = getFloorIndex(useGameStore(selectTableMarkerIndex)) === 8;

  // A bet is "locked" when the entire amount is committed from the last roll.
  // Right-click is a no-op in this state — nothing pending to undo.
  const isLocked   = committedAmount > 0 && amount <= committedAmount;
  const hasPending = amount > committedAmount;

  // Long-press tracking — used to suppress the click that fires after a
  // touch-triggered removal so the bet isn't immediately re-placed.
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress    = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!hasPending) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      removeBet(field);
    }, 500);
  }, [field, removeBet, hasPending]);

  // Cancel on move so that scrolling doesn't accidentally trigger removal.
  const handleTouchEnd  = cancelLongPress;
  const handleTouchMove = cancelLongPress;

  useEffect(() => () => cancelLongPress(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const tutorialCtx = useTutorialContext();

  const handleClick = useCallback(() => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return; // long press already handled removal — suppress the tap click
    }
    placeBet(field, activeChip);
    tutorialCtx?.onBetChanged(field, amount + activeChip);
  }, [field, activeChip, placeBet, tutorialCtx, amount]);

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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      data-tutorial-zone={tutorialZone}
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

        waterlogged
          ? 'cursor-not-allowed border-cyan-700/60'
          : disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'cursor-pointer hover:border-gold/80 hover:bg-felt-light/20 active:scale-95',
      ].join(' ')}
      style={{ height: 'clamp(36px,5.2dvh,64px)' }}
    >
      {/* FB-037: waterlogged — sea water sloshing in the square, bubbles rising */}
      {waterlogged && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm" aria-hidden="true">
          <span className="animate-waterlog-slosh absolute inset-x-[-10%] bottom-0 block" style={{
            height: '64%',
            background: 'linear-gradient(180deg, rgba(103,232,249,0.45) 0%, rgba(14,116,144,0.55) 30%, rgba(8,51,68,0.75) 100%)',
            borderTop: '2px solid rgba(207,250,254,0.7)',
          }} />
          {[18, 46, 74].map((left, i) => (
            <span key={left} className="animate-waterlog-bubble absolute block rounded-full" style={{
              left: `${left}%`, bottom: '8%', width: 5, height: 5,
              border: '1px solid rgba(207,250,254,0.8)', animationDelay: `${i * 0.7}s`,
            }} />
          ))}
          <span className="absolute right-1 top-0.5 select-none text-[11px] leading-none">💧</span>
        </span>
      )}
      <span className="relative text-r-8 leading-tight" style={{ color: waterlogged ? 'rgba(207,250,254,0.9)' : isNullSpace ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.80)' }}>{label}</span>
      {sublabel && (
        <span className="relative text-r-7 mt-0.5" style={{ color: waterlogged ? 'rgba(165,243,252,0.85)' : isNullSpace ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)' }}>{sublabel}</span>
      )}

      {/* Chip stack overlay */}
      {hasBet && (
        <div
          className={[
            'absolute -top-2.5 -right-2.5',
            'w-[35px] h-[35px] rounded-full',
            'flex items-center justify-center',
            'border-2 font-pixel text-r-7 text-yellow-300 shadow-md',
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
        <div className="absolute -top-2.5 -right-2.5 w-[35px] h-[35px] flex items-end justify-start pointer-events-none">
          <span className="text-r-8 leading-none text-amber-300/80">🔒</span>
        </div>
      )}

      {/* Pass line streak badge — bottom-left, visible when streak >= 2 */}
      {streakCount >= 2 && (
        <div
          className={[
            'absolute bottom-1 left-1 pointer-events-none',
            'font-pixel leading-none',
            streakCount >= 4
              ? 'text-r-10 text-red-400 animate-hype-blaze'
              : streakCount === 3
                ? 'text-r-9 text-orange-400 animate-hype-hot'
                : 'text-r-8 text-yellow-300',
          ].join(' ')}
        >
          {'🔥'.repeat(Math.min(streakCount, 4))}
        </div>
      )}

      {/* Floating payout pop */}
      {popAmount > 0 && (
        <div
          key={popKey}
          className="absolute bottom-full left-1/2 -translate-x-1/2 pointer-events-none font-pixel text-r-9 text-yellow-300 animate-payout-pop"
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
  // FB-037: The Sovereign's Dead Calm (LOW TIDE) — no odds bets.
  const isDeadCalm = useGameStore((s) => {
    const params = paramsOfRule('TIDAL_SURGE');
    return isRuleOn(s, 'TIDAL_SURGE') && params !== null && getTideStage(params, ruleCounter(s, 'TIDAL_SURGE')).effect === 'DEAD_CALM';
  });
  const isComeOut     = phase === 'COME_OUT' || phase === null;
  const isPointActive = phase === 'POINT_ACTIVE';
  const tutorialCtx   = useTutorialContext();
  const isBetHardwayBeat = tutorialCtx?.activeBeatMode === 'bet-hardway';

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
          tutorialZone="betting-passline"
        />
        <BetZone
          label="ODDS"
          sublabel={isDeadCalm ? 'WATERLOGGED' : point ? oddsLabel(point) : 'TRUE ODDS'}
          field="odds"
          amount={bets.odds}
          committedAmount={committedBets.odds}
          disabled={isRolling || isComeOut || isDeadCalm}
          waterlogged={isDeadCalm}
          wide
          popAmount={payoutPops?.odds ?? 0}
          popKey={_popsKey}
          popDelay={80}
          tutorialZone="betting-odds"
        />
      </div>

      {/* ── Row 2: Four Hardways ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2" data-tutorial-zone="betting-hardways">
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
            disabled={isRolling || (isBetHardwayBeat && field !== 'hard8')}
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
