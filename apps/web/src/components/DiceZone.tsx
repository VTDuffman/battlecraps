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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Roll result metadata
// ---------------------------------------------------------------------------

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

// Glow color for the result popup border/background per result type
const POPUP_GLOW: Record<string, string> = {
  NATURAL:   'border-gold-bright shadow-[0_0_32px_8px_rgba(245,200,66,0.45)]',
  POINT_HIT: 'border-gold-bright shadow-[0_0_32px_8px_rgba(245,200,66,0.45)]',
  CRAPS_OUT: 'border-red-500 shadow-[0_0_28px_6px_rgba(239,68,68,0.4)]',
  SEVEN_OUT: 'border-red-500 shadow-[0_0_28px_6px_rgba(239,68,68,0.4)]',
  POINT_SET: 'border-blue-400 shadow-[0_0_24px_6px_rgba(96,165,250,0.35)]',
};

// Animation phase for the dice throw sequence
type ThrowPhase = 'idle' | 'throwing' | 'tumbling' | 'landing' | 'result' | 'result-out';

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---------------------------------------------------------------------------
// Result Popup
// ---------------------------------------------------------------------------

interface ResultPopupProps {
  result:    string;
  total:     number;
  phase:     'result' | 'result-out';
}

const ResultPopup: React.FC<ResultPopupProps> = ({ result, total, phase }) => {
  const label    = ROLL_RESULT_LABELS[result] ?? result;
  const colour   = ROLL_RESULT_COLOURS[result] ?? 'text-white';
  const glow     = POPUP_GLOW[result] ?? 'border-white/40';
  const animCls  = phase === 'result-out' ? 'animate-result-pop-out' : 'animate-result-pop-in';

  return (
    <div
      className={[
        'absolute inset-x-2 z-20',
        'flex flex-col items-center justify-center gap-1 py-3 px-4',
        'rounded-lg border-2 bg-black/80 backdrop-blur-sm',
        'pointer-events-none',
        glow,
        animCls,
      ].join(' ')}
      style={{ top: '50%', transform: 'translateY(-50%)' }}
    >
      <span className={`font-pixel text-base leading-tight ${colour}`}>{label}</span>
      <span className="font-pixel text-[9px] text-white/60">— {total} —</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DiceZone
// ---------------------------------------------------------------------------

export const DiceZone: React.FC = () => {
  const runId                  = useGameStore((s) => s.runId);
  const isRolling              = useGameStore((s) => s.isRolling);
  const rollDice               = useGameStore((s) => s.rollDice);
  const applyPendingSettlement = useGameStore((s) => s.applyPendingSettlement);
  const triggerWallFlash       = useGameStore((s) => s.triggerWallFlash);
  const triggerPointRing       = useGameStore((s) => s.triggerPointRing);
  const bets          = useGameStore((s) => s.bets);
  const lastDice      = useGameStore((s) => s.lastDice);
  const lastResult    = useGameStore((s) => s.lastRollResult);
  const lastDelta     = useGameStore((s) => s.lastDelta);
  const lastBetDelta  = useGameStore((s) => s.lastBetDelta);
  const _betDeltaKey  = useGameStore((s) => s._betDeltaKey);
  const status        = useGameStore((s) => s.status);

  // ── Throw animation state ─────────────────────────────────────────────────
  const [throwPhase, setThrowPhase]   = useState<ThrowPhase>('idle');
  const [displayDice, setDisplayDice] = useState<[number, number]>([1, 1]);
  const [diceExtraClass, setDiceExtraClass] = useState('');
  const pendingDice   = useRef<[number, number] | null>(null);
  const pendingResult = useRef<string | null>(null);
  const flipInterval  = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef      = useRef<ThrowPhase>('idle'); // always mirrors throwPhase for use in closures

  function setPhase(p: ThrowPhase) {
    phaseRef.current = p;
    setThrowPhase(p);
  }

  // Stop face-flipping
  function clearFlip() {
    if (flipInterval.current) {
      clearInterval(flipInterval.current);
      flipInterval.current = null;
    }
  }

  // Start rapid face-flipping
  function startFlip() {
    clearFlip();
    flipInterval.current = setInterval(() => {
      setDisplayDice([randomDie(), randomDie()]);
    }, 80);
  }

  // Advance from tumbling to landing once the server result is available
  function landDice() {
    clearFlip();
    if (pendingDice.current) {
      setDisplayDice(pendingDice.current);
    }
    setPhase('landing');
  }

  // ── Watch lastDice for server result ──────────────────────────────────────
  // `lastDice` updates when `turn:settled` arrives. Buffer the values and,
  // if we are already in the tumbling phase, advance to landing immediately.
  const lastDiceRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    // Ignore the initial mount value and identical re-renders
    if (lastDice === lastDiceRef.current) return;
    lastDiceRef.current = lastDice;

    if (lastDice === null) return; // run reset — ignore

    if (phaseRef.current === 'idle') {
      // No animation running (e.g. game loaded with existing dice) — just show
      setDisplayDice(lastDice);
      return;
    }

    // Buffer the result for use at landing
    pendingDice.current   = lastDice;
    pendingResult.current = lastResult; // lastResult also updated by turn:settled

    if (phaseRef.current === 'tumbling') {
      landDice();
    }
    // If still 'throwing', the onAnimationEnd callback will call landDice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDice]);

  // Also capture lastResult when it changes during tumbling
  useEffect(() => {
    if (phaseRef.current !== 'idle' && lastResult !== null) {
      pendingResult.current = lastResult;
    }
  }, [lastResult]);

  // ── Animation callbacks ───────────────────────────────────────────────────

  const onThrowEnd = useCallback(() => {
    // Fire back-wall flash at the top of the screen via the store
    triggerWallFlash();

    setPhase('tumbling');

    // If server already responded during the throw, land immediately
    if (pendingDice.current) {
      // Small delay so tumble animation has a frame to mount
      setTimeout(landDice, 50);
    }
    // Otherwise, the useEffect watching lastDice will call landDice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerWallFlash]);

  const onTumbleEnd = useCallback(() => {
    // Guard: if we transitioned to landing already via the useEffect, skip
    if (phaseRef.current !== 'tumbling') return;
    // Server hasn't responded yet — hold in tumbling (animation is 'forwards',
    // so the dice stay at the tumbled position). The useEffect will land us.
  }, []);

  const onLandEnd = useCallback(() => {
    const result = pendingResult.current ?? lastResult;

    // Fire dice micro-animation + point puck ring at the landing moment
    if (result === 'POINT_SET') {
      setDiceExtraClass('animate-dice-converge');
      triggerPointRing('set');
      setTimeout(() => setDiceExtraClass(''), 570);
    } else if (result === 'POINT_HIT') {
      setDiceExtraClass('animate-dice-gold-glow');
      triggerPointRing('hit');
      setTimeout(() => setDiceExtraClass(''), 570);
    }

    // Only show result popup for meaningful results (not NO_RESOLUTION)
    if (result && result !== 'NO_RESOLUTION') {
      setPhase('result');
      // Auto-dismiss popup after 2 seconds, then apply deferred game state
      // (bankroll, bets, hype, phase, shooters) as the popup fades out.
      // This is the reveal moment — the player has read the result before
      // any chips clear or numbers change.
      setTimeout(() => {
        setPhase('result-out');
        applyPendingSettlement();
        setTimeout(() => setPhase('idle'), 220);
      }, 2000);
    } else {
      // NO_RESOLUTION: no popup, apply immediately so the table stays live
      applyPendingSettlement();
      setPhase('idle');
    }
    pendingDice.current   = null;
    pendingResult.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult, applyPendingSettlement, triggerPointRing]);

  // ── Roll handler ──────────────────────────────────────────────────────────

  const canRoll =
    !isRolling &&
    throwPhase === 'idle' &&
    runId !== null &&
    bets.passLine > 0 &&
    (status === 'IDLE_TABLE' || status === 'POINT_ACTIVE');

  const handleRoll = useCallback(async () => {
    if (!canRoll) return;
    pendingDice.current   = null;
    pendingResult.current = null;
    setPhase('throwing');
    startFlip();
    await rollDice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRoll, rollDice]);

  // Cleanup on unmount
  useEffect(() => () => clearFlip(), []);

  // ── Post-roll WIN flash ───────────────────────────────────────────────────
  const [showDelta, setShowDelta] = useState(false);
  useEffect(() => {
    if (lastDelta !== null && lastDelta > 0) {
      setShowDelta(true);
      const t = setTimeout(() => setShowDelta(false), 1800);
      return () => clearTimeout(t);
    }
  }, [lastDelta]);

  // ── Bet-placement LOSS flash ──────────────────────────────────────────────
  const [showBetDelta, setShowBetDelta] = useState(false);
  useEffect(() => {
    if (lastBetDelta !== null && lastBetDelta < 0) {
      setShowBetDelta(true);
      const t = setTimeout(() => setShowBetDelta(false), 1200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_betDeltaKey]);

  // ── Dice CSS class per phase ──────────────────────────────────────────────
  function diceAnimClass(): string {
    switch (throwPhase) {
      case 'throwing': return 'animate-dice-throw';
      case 'tumbling':  return 'animate-dice-tumble';
      case 'landing':   return 'animate-dice-land';
      default:          return '';
    }
  }

  const showingDice = throwPhase === 'idle' ? (lastDice ?? null) : displayDice;
  const popupResult = pendingResult.current ?? lastResult;
  const popupTotal  = showingDice ? showingDice[0] + showingDice[1] : 0;

  return (
    <div className="relative flex flex-row items-center gap-4 px-4 py-3 [perspective:500px]">

      {/* ── LEFT: dice display + overlays ───────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center min-h-[64px]">

        {/* Animated dice pair */}
        <div
          className={['flex gap-4 items-center', diceAnimClass(), diceExtraClass, throwPhase !== 'idle' ? 'relative z-10' : ''].join(' ')}
          onAnimationEnd={(e) => {
            if (e.currentTarget !== e.target) return;
            if (throwPhase === 'throwing') onThrowEnd();
            else if (throwPhase === 'tumbling') onTumbleEnd();
            else if (throwPhase === 'landing') onLandEnd();
          }}
        >
          {showingDice ? (
            <>
              <Die value={showingDice[0]} />
              <Die value={showingDice[1]} />
            </>
          ) : (
            <>
              <DiePlaceholder />
              <DiePlaceholder />
            </>
          )}
        </div>

        {/* Result popup — overlaid over the dice column */}
        {(throwPhase === 'result' || throwPhase === 'result-out') &&
          popupResult &&
          popupResult !== 'NO_RESOLUTION' && (
            <ResultPopup
              result={popupResult}
              total={popupTotal}
              phase={throwPhase as 'result' | 'result-out'}
            />
          )}

        {/* Small persistent result label */}
        {throwPhase === 'idle' && lastResult && lastResult !== 'NO_RESOLUTION' && (
          <span
            className={[
              'absolute bottom-0 left-1/2 -translate-x-1/2',
              'font-pixel text-[7px]',
              ROLL_RESULT_COLOURS[lastResult] ?? 'text-white',
            ].join(' ')}
          >
            {ROLL_RESULT_LABELS[lastResult] ?? lastResult}
          </span>
        )}

        {/* Post-roll WIN flash */}
        {showDelta && lastDelta !== null && lastDelta > 0 && (
          <div
            key={lastDelta}
            className="absolute top-0 left-1/2 -translate-x-1/2 font-pixel text-lg animate-bark-rise pointer-events-none text-gold-bright"
          >
            {`+$${(lastDelta / 100).toFixed(2)}`}
          </div>
        )}

        {/* Bet-placement LOSS flash */}
        {showBetDelta && lastBetDelta !== null && (
          <div
            key={_betDeltaKey}
            className="absolute top-0 left-1/2 -translate-x-1/2 font-pixel text-lg animate-bark-rise pointer-events-none text-red-400"
          >
            {`-$${(Math.abs(lastBetDelta) / 100).toFixed(2)}`}
          </div>
        )}
      </div>

      {/* ── RIGHT: roll button ───────────────────────────────────────────── */}
      <button
        type="button"
        disabled={!canRoll}
        onClick={() => void handleRoll()}
        className={[
          'flex-none px-6 py-4 rounded',
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
        {isRolling || throwPhase !== 'idle' ? 'ROLLING…' : 'ROLL'}
      </button>
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
    <div className="relative w-12 h-12 bg-[#e8dcc8] rounded-lg border-2 border-[#2a1a0a] shadow-[3px_3px_0px_#2a1a0a]">
      {dots.map(([x, y], i) => (
        <div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full bg-[#1a0a00]"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
    </div>
  );
};

const DiePlaceholder: React.FC = () => (
  <div className="w-12 h-12 rounded-md border-2 border-dashed border-white/20 bg-felt-dark/60" />
);
