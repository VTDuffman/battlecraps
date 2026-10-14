// =============================================================================
// BATTLECRAPS — SARGE'S DOUBLE TIME CLOCK (FB-030, drama FB-033)
// apps/web/src/components/SargeClock.tsx
//
// Point-phase rolls left before TIME'S UP, as a two-digit digital clock in the
// boss header. Gold while running, red for the last two rolls, blinking on the
// last; dimmed on the come-out (the clock only starts once a point is set).
//
// FB-033 drama: in the point phase the clock grows (~1.35×) with a glow that
// pulses harder on the last two rolls. Sounds fire when the roll is REVEALED
// (the store updates phase / bossPointHits in applyPendingSettlement):
//   tick on every point-phase blank (sharper as time runs out),
//   alarm on reaching the last roll, drill whistle on TIME'S UP.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import { SevenSegmentDisplay } from './SevenSegmentDisplay.js';
import { playClockAlarm, playClockTick, playDrillWhistle } from '../hooks/useCrowdAudio.js';

interface SargeClockProps {
  rollLimit:   number;
  labelColor:  string;
}

export const SargeClock: React.FC<SargeClockProps> = ({ rollLimit, labelColor }) => {
  const phase         = useGameStore((s) => s.phase);
  const bossPointHits = useGameStore((s) => s.bossPointHits);

  const inPoint   = phase === 'POINT_ACTIVE';
  const rollsLeft = inPoint ? Math.max(1, rollLimit - bossPointHits) : rollLimit;
  const isLast    = inPoint && rollsLeft === 1;
  const isLow     = inPoint && rollsLeft <= 2;
  const ledColor  = isLow ? '#ef4444' : '#fbbf24';

  // ── Sounds on reveal ────────────────────────────────────────────────────
  const prev = useRef({ phase, bossPointHits });
  useEffect(() => {
    const before = prev.current;
    prev.current = { phase, bossPointHits };

    // TIME'S UP: the point phase ended with the clock expired.
    if (before.phase === 'POINT_ACTIVE' && phase !== 'POINT_ACTIVE') {
      if (useGameStore.getState().lastClockExpired) playDrillWhistle();
      return;
    }
    // A blank on the clock: tick, and sound the alarm on the last roll.
    if (phase === 'POINT_ACTIVE' && before.phase === 'POINT_ACTIVE' && bossPointHits > before.bossPointHits) {
      const left = Math.max(1, rollLimit - bossPointHits);
      playClockTick(left);
      if (left === 1) window.setTimeout(playClockAlarm, 120);
    }
  }, [phase, bossPointHits, rollLimit]);

  return (
    <div className="flex-none flex items-center gap-2">
      <div className="font-pixel text-[7.5px] tracking-widest leading-tight text-right" style={{ color: labelColor }}>
        DOUBLE<br />TIME
      </div>
      <div
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: inPoint ? 'scale(1.35)' : 'scale(1)', transformOrigin: 'right center' }}
      >
        <div
          className={`rounded-sm px-1.5 py-1${inPoint ? (isLow ? ' animate-clock-glow-hard' : ' animate-clock-glow') : ''}`}
          style={{
            background: '#0a0605',
            border:     `1px solid ${ledColor}${inPoint ? '80' : '40'}`,
            boxShadow:  'inset 0 0 6px rgba(0,0,0,0.9)',
            opacity:    inPoint ? 1 : 0.55,
            ['--clock-glow' as string]: ledColor,
          }}
        >
          <SevenSegmentDisplay
            value={String(rollsLeft).padStart(2, '0')}
            color={ledColor}
            height={20}
            label={inPoint ? `${rollsLeft} rolls left to hit the point` : 'Clock starts when the point is set'}
            className={isLast ? 'animate-pulse' : undefined}
          />
        </div>
      </div>
    </div>
  );
};
