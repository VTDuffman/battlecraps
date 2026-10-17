// =============================================================================
// BATTLECRAPS — FOREMAN SKIM (FB-040, The Foreman's room in The Architect's fight)
// apps/web/src/components/ForemanSkim.tsx
//
// In The Architect's fight The Foreman's room has no Payoff — he just takes 20%
// of every winning profit. A green register panel: "−20% OF EVERY WIN", and each
// skim pops "SKIMMED −$X" with a ka-ching. Driven by lastConvergence.skimCents.
// Nothing fires on mount.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playRegisterKaChing } from '../hooks/useCrowdAudio.js';

const GREEN = '#7CFC9A';

const dollars = (cents: number): string => {
  const d = cents / 100;
  return d >= 1e6 ? `$${(d / 1e6).toFixed(2)}M` : d >= 1e3 ? `$${Math.round(d / 1e3)}k` : `$${Math.round(d)}`;
};

export const ForemanSkim: React.FC = () => {
  const last = useGameStore((s) => s.lastConvergence);
  const mountKey = useRef(last?.key ?? 0);
  const [pop, setPop] = useState<{ cents: number; key: number } | null>(null);

  useEffect(() => {
    if (!last || last.key === mountKey.current || !last.skimCents || last.skimCents <= 0) return;
    setPop({ cents: last.skimCents, key: last.key });
    playRegisterKaChing();
  }, [last?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg"
      style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(10,40,20,0.55), rgba(2,10,5,0.9) 75%)', border: `1px solid ${GREEN}33` }}
      role="status"
      aria-label="The Foreman's room: he skims 20% of every winning profit"
    >
      <div className="font-pixel text-[9px] tracking-[0.3em]" style={{ color: `${GREEN}99` }}>THE FOREMAN'S ROOM</div>
      <div className="mt-2 flex items-center gap-3">
        <span className="leading-none" style={{ fontSize: 26 }} aria-hidden="true">💵</span>
        <span className="font-mono text-[44px] font-bold leading-none" style={{ color: GREEN, textShadow: `0 0 8px ${GREEN}88` }}>−20%</span>
        <span className="leading-none" style={{ fontSize: 26 }} aria-hidden="true">💵</span>
      </div>
      <div className="mt-2 font-pixel text-[9px] tracking-widest" style={{ color: `${GREEN}aa` }}>OF EVERY WIN — NO PAYOFF IN HERE</div>
      <AnimatePresence>
        {pop !== null && (
          <motion.div
            key={pop.key}
            className="pointer-events-none absolute right-3 top-3 font-pixel text-[13px] font-bold"
            style={{ color: GREEN, textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [6, 0, -4, -10] }}
            transition={{ duration: 1.6, times: [0, 0.12, 0.7, 1] }}
            onAnimationComplete={() => setPop(null)}
          >
            SKIMMED −{dollars(pop.cents)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
