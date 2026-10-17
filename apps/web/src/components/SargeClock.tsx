// =============================================================================
// BATTLECRAPS — SARGE'S DOUBLE TIME CLOCK (FB-030, drama FB-033)
// apps/web/src/components/SargeClock.tsx
//
// Point-phase rolls left before TIME'S UP, as a big two-digit digital clock on
// the table (FB-042 — BossTableWell). Gold while running, red for the last two
// rolls, blinking on the last; dimmed on the come-out (the clock only starts
// once a point is set).
//
// FB-033 drama: in the point phase the clock grows with a glow that pulses
// harder on the last two rolls. Sounds fire when the roll is REVEALED
// (the store updates phase / bossPointHits in applyPendingSettlement):
//   tick on every point-phase blank (sharper as time runs out),
//   alarm on reaching the last roll, drill whistle on TIME'S UP.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { GAUNTLET } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';
import { SevenSegmentDisplay } from './SevenSegmentDisplay.js';
import { playClockAlarm, playClockTick, playDrillWhistle } from '../hooks/useCrowdAudio.js';
import { paramsOfRule, ruleCounter } from '../lib/bossRules.js';

export const SargeClock: React.FC = () => {
  const phase         = useGameStore((s) => s.phase);
  // FB-040: his own fight, or his room in The Architect's (its own clock).
  const bossPointHits = useGameStore((s) => ruleCounter(s, 'DOUBLE_TIME'));
  const markerIndex   = useGameStore((s) => s.currentMarkerIndex);
  const rollLimit     = paramsOfRule('DOUBLE_TIME')?.rollLimit ?? 6;
  const labelColor    = `${getFloorTheme(markerIndex).bossStarColor}b3`;

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

  const glowClass = inPoint ? (isLow ? 'hard' : 'soft') : null;

  return (
    // The clock face grows a little in the point phase and pulses with the
    // label; dimmed on the come-out.
    <div
      className="flex h-full w-full flex-col items-center justify-center rounded-lg"
      style={{
        background: 'radial-gradient(ellipse at 50% 55%, rgba(40,26,8,0.55), rgba(8,6,4,0.9) 75%)',
        border:     `1px solid ${ledColor}${inPoint ? '55' : '22'}`,
        transition: 'border-color 300ms',
        ['--clock-glow' as string]: ledColor,
      }}
    >
      <div
        className={`font-pixel text-[15px] tracking-[0.3em] leading-none whitespace-nowrap${glowClass === 'hard' ? ' animate-clock-label-glow-hard' : glowClass === 'soft' ? ' animate-clock-label-glow' : ''}`}
        style={{ color: inPoint ? ledColor : labelColor }}
      >
        DOUBLE TIME
      </div>
      <div
        className="mt-3 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: inPoint ? 'scale(1.12)' : 'scale(1)' }}
      >
        <div
          className={`rounded-md px-4 py-3${inPoint ? (isLow ? ' animate-clock-glow-hard' : ' animate-clock-glow') : ''}`}
          style={{
            background: '#0a0605',
            border:     `2px solid ${ledColor}${inPoint ? '80' : '40'}`,
            boxShadow:  'inset 0 0 10px rgba(0,0,0,0.9)',
            opacity:    inPoint ? 1 : 0.55,
            ['--clock-glow' as string]: ledColor,
          }}
        >
          <SevenSegmentDisplay
            value={String(rollsLeft).padStart(2, '0')}
            color={ledColor}
            height={64}
            label={inPoint ? `${rollsLeft} rolls left to hit the point` : 'Clock starts when the point is set'}
            className={isLast ? 'animate-pulse' : undefined}
          />
        </div>
      </div>
      <div className="mt-3 font-pixel text-[9px] tracking-widest" style={{ color: inPoint ? `${ledColor}cc` : labelColor }}>
        {inPoint ? (isLast ? 'LAST ROLL — HIT IT OR IT’S A SEVEN-OUT' : 'ROLLS LEFT TO HIT THE POINT') : 'CLOCK STARTS WHEN THE POINT IS SET'}
      </div>
    </div>
  );
};
