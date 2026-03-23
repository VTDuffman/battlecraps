// =============================================================================
// BATTLECRAPS — ANIMATED COUNTER HOOK
// apps/web/src/hooks/useAnimatedCounter.ts
//
// Smoothly counts a numeric value toward a target using requestAnimationFrame.
//
// Usage:
//   const { display, direction } = useAnimatedCounter(bankroll);
//
// Behaviour:
//   • Starts from the current VISUAL position (not the previous target), so
//     rapid successive changes chain without snapping.
//   • Cubic ease-out: decelerates as it approaches target — feels like coins
//     physically settling.
//   • Duration scales linearly with |delta|, clamped to [80, 1200] ms:
//       $1  →  ~80 ms  (bet placements barely register)
//       $10 →  ~300 ms
//       $50 →  ~1 s
//       $100+ → 1.2 s  (max drama, never drags)
// =============================================================================

import { useState, useEffect, useRef } from 'react';

export type CountDirection = 'up' | 'down' | 'idle';

export interface AnimatedCounter {
  display:   number;          // current display value (cents)
  direction: CountDirection;  // drives colour in the UI
}

const DURATION_SCALE = 0.22;  // ms per cent of delta
const DURATION_MIN   = 80;    // ms — fastest possible animation
const DURATION_MAX   = 1200;  // ms — slowest possible animation

function scaledDuration(deltaCents: number): number {
  return Math.round(
    Math.min(Math.max(DURATION_MIN + Math.abs(deltaCents) * DURATION_SCALE, DURATION_MIN), DURATION_MAX),
  );
}

/** Cubic ease-out: t ∈ [0,1] → decelerate toward target */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useAnimatedCounter(target: number): AnimatedCounter {
  // Initialise display to target so there's no animation on first mount
  const [display,   setDisplay]   = useState(target);
  const [direction, setDirection] = useState<CountDirection>('idle');

  // Refs that survive re-renders without causing them
  const displayRef  = useRef(target);   // current visual position
  const rafRef      = useRef<number>(0);
  const startTsRef  = useRef<number>(0);
  const animFromRef = useRef(target);   // value at animation start
  const animToRef   = useRef(target);   // value we're counting toward
  const durationRef = useRef(0);

  useEffect(() => {
    if (target === animToRef.current) return; // already heading here

    // Cancel any in-flight animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const from = displayRef.current;
    const to   = target;

    animFromRef.current = from;
    animToRef.current   = to;
    durationRef.current = scaledDuration(to - from);
    startTsRef.current  = 0; // reset — assigned on first tick

    setDirection(to > from ? 'up' : 'down');

    function tick(ts: number) {
      if (startTsRef.current === 0) startTsRef.current = ts;

      const elapsed  = ts - startTsRef.current;
      const progress = Math.min(elapsed / durationRef.current, 1);
      const eased    = easeOut(progress);
      const current  = Math.round(animFromRef.current + (animToRef.current - animFromRef.current) * eased);

      displayRef.current = current;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = animToRef.current;
        setDisplay(animToRef.current);
        setDirection('idle');
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);

  return { display, direction };
}
