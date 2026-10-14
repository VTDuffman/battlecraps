// =============================================================================
// BATTLECRAPS — COVENANT FLASH (FB-036)
// apps/web/src/components/CovenantFlash.tsx
//
// The Covenant ("The Order Protects") just kept your shooter on a Seven Out —
// once per marker. A ring of candle-light blooms over the table with THE ORDER
// PROTECTS and "your shooter stays", under a bell and a bright choir chord.
// Non-blocking; nothing on mount (hydration), only on a new save.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playBellToll, playChoirChord } from '../hooks/useCrowdAudio.js';

const SHOW_MS = 2200;
const AMBER   = '#f59e0b';

export const CovenantFlash: React.FC = () => {
  const key          = useGameStore((s) => s._covenantKey);
  const reduceMotion = useReducedMotion() === true;
  const mountKey     = useRef(key);
  const [showing, setShowing] = useState<number | null>(null);

  useEffect(() => {
    if (key === mountKey.current) return;
    setShowing(key);
    playBellToll();
    playChoirChord('major');
    const id = window.setTimeout(() => setShowing(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [key]);

  return createPortal(
    <AnimatePresence>
      {showing !== null && (
        <motion.div
          key={showing}
          className="pointer-events-none fixed inset-0 z-[108] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          role="status"
        >
          <motion.div
            className="absolute rounded-full"
            style={{ width: 'min(80vw, 380px)', height: 'min(80vw, 380px)', background: 'radial-gradient(circle, rgba(252,211,77,0.35), rgba(245,158,11,0.12) 45%, transparent 70%)' }}
            initial={{ scale: 0.4 }}
            animate={{ scale: reduceMotion ? 1 : [0.4, 1.15, 1] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          <motion.div
            className="relative text-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="mb-1 select-none text-[34px] leading-none" style={{ filter: `drop-shadow(0 0 12px ${AMBER})` }}>🕯️</div>
            <div className="font-pixel text-r-14 font-bold tracking-widest" style={{ color: '#fcd34d', textShadow: `0 0 14px ${AMBER}, 0 2px 4px rgba(0,0,0,0.9)` }}>
              THE ORDER PROTECTS
            </div>
            <div className="mt-1.5 italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(14px, 4vw, 18px)', color: '#fde68a', textShadow: '0 2px 6px rgba(0,0,0,0.95)' }}>
              The Covenant holds — your shooter stays.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
