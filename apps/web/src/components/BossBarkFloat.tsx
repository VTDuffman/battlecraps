// =============================================================================
// BATTLECRAPS — BOSS BARK FLOAT (FB-032)
// apps/web/src/components/BossBarkFloat.tsx
//
// The generic boss bark (lines in config.ts `barks`, rules in shared
// bossBarks.ts). Like the crew barks but downward: the line flashes in a little
// bigger at the boss name, then drifts diagonally down-right across the table
// while fading out.
//
// Rendered through a portal at fixed coordinates measured from an anchor in
// the boss header, because the header's stacking context sits under the table
// and would clip an in-place float.
// =============================================================================

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';

const FLOAT_S = 2.6;

export const BossBarkFloat: React.FC = () => {
  const bossBark      = useGameStore((s) => s.bossBark);
  const clearBossBark = useGameStore((s) => s.clearBossBark);
  const reduceMotion  = useReducedMotion();

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  // Measure where to start each time a new bark arrives.
  useLayoutEffect(() => {
    if (!bossBark || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setOrigin({ x: r.left, y: r.top });
  }, [bossBark?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Zero-size anchor at the bark's start point (under the boss name). */}
      <span ref={anchorRef} className="block h-0 w-0" aria-hidden="true" />
      <span className="sr-only" role="status">{bossBark ? bossBark.line : ''}</span>

      {origin !== null && createPortal(
        <AnimatePresence>
          {bossBark !== null && (
            <motion.div
              key={bossBark.key}
              className="pointer-events-none fixed z-[110] font-pixel font-bold italic leading-snug text-white"
              style={{
                left:       origin.x,
                top:        origin.y,
                maxWidth:   'min(280px, 70vw)',
                fontSize:   'clamp(12px, 3.6vw, 16px)',
                textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7)',
                transformOrigin: 'left center',
              }}
              initial={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
              animate={reduceMotion
                ? { opacity: [0, 1, 1, 0], scale: 1, x: 0, y: 0 }
                : {
                    opacity: [0, 1, 1, 0],
                    scale:   [0.6, 1.3, 1, 0.95],
                    x:       [0, 0, 36, 150],
                    y:       [0, 0, 26, 120],
                  }}
              transition={{ duration: FLOAT_S, times: [0, 0.12, 0.45, 1], ease: 'easeOut' }}
              onAnimationComplete={() => {
                if (useGameStore.getState().bossBark?.key === bossBark.key) clearBossBark();
              }}
            >
              "{bossBark.line}"
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};
