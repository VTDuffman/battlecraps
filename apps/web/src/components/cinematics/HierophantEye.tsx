// =============================================================================
// BATTLECRAPS — THE HIEROPHANT'S EYE (FB-036)
// apps/web/src/components/cinematics/HierophantEye.tsx
//
// His great eye, drawn as SVG (not the 👁️ emoji) so its lids can actually
// open and close. Shared by THE EYE CLOSES (win: it looks you over and shuts)
// and THE ORDER COLLECTS (loss: it opens wide and burns).
// =============================================================================

import React, { useId } from 'react';
import { motion } from 'framer-motion';

const AMBER = '#f59e0b';
const W = 260;
const H = 130;

export const HierophantEye: React.FC<{
  /** Lids open (true) or shut (false); the lids animate between the two. */
  open:          boolean;
  /** Where the lids start, so the eye can open from shut (or close from open). */
  initiallyOpen: boolean;
  /** The iris looks left, then right, before settling. */
  lookAround?:   boolean;
  /** A fierce glow + a narrowed pupil (the order collecting). */
  burning?:      boolean;
  reduceMotion:  boolean;
}> = ({ open, initiallyOpen, lookAround = false, burning = false, reduceMotion }) => {
  const uid    = useId().replace(/:/g, '');
  const almond = `M 10 ${H / 2} Q ${W / 2} -${H * 0.55} ${W - 10} ${H / 2} Q ${W / 2} ${H * 1.55} 10 ${H / 2} Z`;
  const lidT   = { duration: reduceMotion ? 0.3 : 0.9, ease: [0.45, 0, 0.55, 1] as const };
  const topY   = (o: boolean) => (o ? -H : -H / 2 + 2);
  const botY   = (o: boolean) => (o ? H : H / 2 - 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 'min(70vw, 300px)', overflow: 'visible' }} aria-hidden="true">
      <defs>
        <clipPath id={`eye-clip-${uid}`}><path d={almond} /></clipPath>
        <radialGradient id={`eye-iris-${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor={burning ? '#fff7d6' : '#fde68a'} />
          <stop offset="45%"  stopColor={burning ? '#f97316' : '#d97706'} />
          <stop offset="100%" stopColor="#451a03" />
        </radialGradient>
        <radialGradient id={`eye-white-${uid}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="#fdf4e3" />
          <stop offset="100%" stopColor={burning ? '#c2410c' : '#b9a58a'} />
        </radialGradient>
      </defs>

      <motion.path
        d={almond} fill="none" stroke={burning ? '#f97316' : AMBER} strokeWidth={3}
        animate={{ filter: burning ? 'drop-shadow(0 0 26px #f97316)' : `drop-shadow(0 0 12px ${AMBER})` }}
        transition={{ duration: 0.6 }}
      />

      <g clipPath={`url(#eye-clip-${uid})`}>
        <rect x={0} y={-20} width={W} height={H + 40} fill={`url(#eye-white-${uid})`} />
        <motion.g
          initial={{ x: 0 }}
          animate={lookAround && !reduceMotion ? { x: [0, -34, -34, 30, 30, 0] } : { x: 0 }}
          transition={{ duration: 1.4, delay: 0.4, times: [0, 0.18, 0.42, 0.6, 0.85, 1], ease: 'easeInOut' }}
        >
          <circle cx={W / 2} cy={H / 2} r={40} fill={`url(#eye-iris-${uid})`} />
          <motion.circle
            cx={W / 2} cy={H / 2} fill="#0c0a09"
            initial={{ r: 17 }}
            animate={{ r: burning ? 7 : 17 }}
            transition={{ duration: 0.5 }}
          />
          <circle cx={W / 2 + 8} cy={H / 2 - 9} r={5} fill="rgba(255,255,255,0.8)" />
        </motion.g>
        <motion.rect x={0} width={W} height={H} fill="#2a0f2e"
          initial={{ y: topY(initiallyOpen) }} animate={{ y: topY(open) }} transition={lidT} />
        <motion.rect x={0} width={W} height={H} fill="#24092a"
          initial={{ y: botY(initiallyOpen) }} animate={{ y: botY(open) }} transition={lidT} />
      </g>

      {/* the closed seam */}
      <motion.path
        d={`M 14 ${H / 2} Q ${W / 2} ${H / 2 + 18} ${W - 14} ${H / 2}`}
        fill="none" stroke={AMBER} strokeWidth={2.5} strokeLinecap="round"
        initial={{ opacity: initiallyOpen ? 0 : 0.9 }}
        animate={{ opacity: open ? 0 : 0.9 }}
        transition={{ duration: 0.4, delay: open ? 0 : 0.7 }}
      />
    </svg>
  );
};
