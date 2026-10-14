// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: TERMINATED (FB-035, The Executive)
// apps/web/src/components/defeat/TerminatedCinematic.tsx
//
// The Executive ended your run. The Pink Slip — rebuilt big: a pink HR memo
// slides in (a Performance Improvement Plan if you were PIP-terminated, a
// Position Elimination otherwise), a red TERMINATED stamp slams onto it; then
// the memo is filed up out of the way, a banker's box slides in, YOUR crew
// (measured from the rail) are packed into it one by one, the lid comes down,
// and the box is carried off. "Security will see you out."
// Replaces the old PinkSlipModal. Built at the rose's scale.
//
// Timeline (ms): 300 memo in → 1500 stamp (thud, jolt) → 2900 memo filed up,
// box in → 3500 crew packed (300 apart, 0.7 s each) → lid ≈ last + 250 →
// box carried off + line 400 later → fade 1.8 s after the lid → onFinish
// 2.2 s after the lid (≈7.6 s with five crew; under the 9 s safety net).
// =============================================================================

import React, { useEffect, useLayoutEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playBoxThump, playStampThud } from '../../hooks/useCrowdAudio.js';
import { measureRailCrew, setRailHidden, type RailMember } from '../cinematics/railCrew.js';
import type { DefeatCinematicProps } from './registry.js';

const MEMO_AT      = 300;
const STAMP_AT     = 1500;
const IMPACT_AT    = 1700;   // where the stamp lands in its slam
const FILE_AT      = 2900;
const PACK_AT      = 3500;
const PACK_STEP    = 300;
const PACK_S       = 0.7;
const LID_AFTER    = 250;    // last crew in → lid
const EMPTY_LID_AT = 3600;
const OFF_AFTER    = 500;    // lid → box carried off
const LINE_AFTER   = 400;
const FADE_AFTER   = 1800;
const FINISH_AFTER = 2200;

const PINK  = '#fde2ea';
const STAMP = '#b91c1c';

/** Where the box sits (viewport fractions) and its size. */
const BOX_Y = 0.6;
const boxW  = (): number => Math.min(window.innerWidth * 0.72, 320);
const BOX_H = 150;

const MEMO_VARIANTS = {
  pip: {
    title: 'Performance Improvement Plan',
    re:    'Continued Performance Deficiency',
    body:  ['Effective immediately, your employment has been terminated.',
            'Your rating reached Action Required and your performance did not improve. This outcome is final and not subject to appeal.'],
  },
  eliminated: {
    title: 'Notice of Position Elimination',
    re:    'Restructuring',
    body:  ['Effective immediately, your seat at this table has been eliminated.',
            'This decision reflects an ongoing restructuring and is final.'],
  },
} as const;

const PackedCrew: React.FC<{ m: RailMember; slotX: number; packed: boolean; reduceMotion: boolean }> = ({ m, slotX, packed, reduceMotion }) => {
  const toX = slotX - m.x;
  const toY = window.innerHeight * BOX_Y - BOX_H * 0.15 - m.y;
  return (
    <motion.div
      className="absolute flex items-center justify-center rounded-sm border-2"
      style={{
        left: m.x - m.size / 2, top: m.y - m.size / 2, width: m.size, height: m.size,
        background: '#0f2a1d', borderColor: 'rgba(212,160,23,0.6)', zIndex: 2,
      }}
      initial={{ x: 0, y: 0 }}
      animate={packed
        ? (reduceMotion
            ? { x: toX, y: toY, opacity: 1 }
            : { x: [0, toX * 0.5, toX], y: [0, Math.min(toY, 0) - 90, toY], rotate: [0, m.order % 2 ? 14 : -14, m.order % 2 ? 6 : -6], scale: [1, 1.1, 0.85] })
        : { x: 0, y: 0 }}
      transition={{ duration: reduceMotion ? 0.3 : PACK_S, times: reduceMotion ? undefined : [0, 0.5, 1], ease: 'easeInOut' }}
    >
      <span className="select-none leading-none" style={{ fontSize: m.size * 0.6 }}>{m.emoji}</span>
    </motion.div>
  );
};

export const TerminatedCinematic: React.FC<DefeatCinematicProps> = ({ line, pipTermination, onFinish }) => {
  const reduceMotion = useReducedMotion();
  const memo = pipTermination ? MEMO_VARIANTS.pip : MEMO_VARIANTS.eliminated;

  const [crew, setCrew]       = useState<RailMember[] | null>(null);
  const [memoIn, setMemoIn]   = useState(false);
  const [stamped, setStamped] = useState(false);
  const [impact, setImpact]   = useState(false);
  const [filed, setFiled]     = useState(false);
  const [packed, setPacked]   = useState(0);
  const [lid, setLid]         = useState(false);
  const [off, setOff]         = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]   = useState(false);

  useLayoutEffect(() => { setCrew(measureRailCrew()); }, []);

  useEffect(() => {
    if (!crew) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(MEMO_AT,   () => setMemoIn(true));
    at(STAMP_AT,  () => setStamped(true));
    at(IMPACT_AT, () => { setImpact(true); playStampThud(); });
    at(FILE_AT,   () => setFiled(true));
    crew.forEach((m, i) => {
      const start = PACK_AT + i * PACK_STEP;
      at(start, () => { setPacked(i + 1); setRailHidden(m.slot, true); });
      at(start + PACK_S * 1000, () => playBoxThump(false));
    });
    const lidAt = crew.length > 0 ? PACK_AT + (crew.length - 1) * PACK_STEP + PACK_S * 1000 + LID_AFTER : EMPTY_LID_AT;
    at(lidAt, () => { setLid(true); playBoxThump(true); });
    at(lidAt + OFF_AFTER, () => setOff(true));
    at(lidAt + OFF_AFTER + LINE_AFTER, () => setShowLine(true));
    at(lidAt + FADE_AFTER + OFF_AFTER, () => setFading(true));
    at(lidAt + FINISH_AFTER + OFF_AFTER, onFinish);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      crew.forEach((m) => setRailHidden(m.slot, false));
    };
  }, [crew]); // eslint-disable-line react-hooks/exhaustive-deps

  const w = boxW();
  const boxTop = window.innerHeight * BOX_Y - BOX_H / 2;
  // Spread the packed crew across the box's opening.
  const slotXs = (crew ?? []).map((_, i, all) => window.innerWidth / 2 + (i - (all.length - 1) / 2) * Math.min(48, (w - 40) / Math.max(1, all.length)));
  const boxCarry = off ? (reduceMotion ? { opacity: 0 } : { x: window.innerWidth, rotate: 4 }) : { x: 0 };

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* Cold office dim */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(30,41,59,0.6), rgba(0,0,0,0.8))' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      />

      {/* The memo */}
      {memoIn && (
        <div className="absolute inset-x-0 top-0 flex justify-center px-4" style={{ paddingTop: '12vh' }}>
          <motion.div
            className={`relative w-full max-w-md ${impact && !filed && !reduceMotion ? 'animate-dock-impact-shake' : ''}`}
            style={{
              background: PINK, border: '1px solid #f9a8d4',
              boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
              transformOrigin: 'top center',
            }}
            initial={reduceMotion ? { opacity: 0 } : { y: '-110%', opacity: 0, rotate: -2 }}
            animate={filed
              ? (reduceMotion ? { opacity: 0.5, scale: 0.6, y: '-8vh' } : { y: '-9vh', scale: 0.56, rotate: -4, opacity: 0.9 })
              : { y: 0, opacity: 1, rotate: 0 }}
            transition={{ duration: filed ? 0.55 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="h-2 w-full" style={{ background: STAMP }} />
            <div className="border-b px-7 pb-3 pt-5 text-center" style={{ borderColor: '#f9a8d4' }}>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.35em] text-stone-500">INTERNAL MEMO — CONFIDENTIAL</div>
              <div className="font-mono text-[14px] font-bold uppercase tracking-widest text-stone-900">{memo.title}</div>
            </div>
            <div className="flex flex-col gap-3 px-7 py-5">
              <div className="flex flex-col gap-1">
                {[['TO', 'Player (Current Occupant, Table)'], ['FROM', 'The Executive, Office of Standards'], ['RE', memo.re]].map(([k, v]) => (
                  <div key={k} className="flex gap-3 font-mono text-[11px]">
                    <span className="w-9 shrink-0 text-right text-stone-500">{k}:</span>
                    <span className="text-stone-800">{v}</span>
                  </div>
                ))}
              </div>
              <div className="h-px" style={{ background: '#f9a8d4' }} />
              <div className="flex flex-col gap-2 font-mono text-[12px] leading-relaxed text-stone-800">
                {memo.body.map((t) => <p key={t}>{t}</p>)}
                <p className="italic text-stone-600">We wish you the best in your future endeavors.</p>
              </div>
              <div className="text-right font-mono text-[11px] italic text-stone-700">— The Executive</div>
            </div>

            {/* TERMINATED */}
            {stamped && (
              <motion.div
                className="pointer-events-none absolute left-1/2 top-1/2 select-none whitespace-nowrap font-mono font-black uppercase"
                style={{
                  x: '-50%', y: '-50%',
                  fontSize: 'clamp(34px, 10vw, 54px)', letterSpacing: '0.12em',
                  color: 'rgba(185,28,28,0.88)', border: '5px solid rgba(185,28,28,0.88)',
                  padding: '2px 16px', borderRadius: 6, mixBlendMode: 'multiply',
                }}
                initial={reduceMotion ? { opacity: 0, rotate: -12 } : { scale: 3, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: -12 }}
                transition={reduceMotion ? { duration: 0.3 } : { duration: 0.22, ease: [0.5, 0, 0.75, 0] }}
              >
                TERMINATED
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {/* The banker's box: back wall, your crew, front panel, lid */}
      {filed && crew && (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={boxCarry}
          transition={{ duration: 0.65, ease: 'easeIn' }}
        >
          <motion.div
            className="absolute inset-0"
            initial={reduceMotion ? { opacity: 0 } : { y: window.innerHeight * 0.5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            {/* back wall */}
            <div className="absolute" style={{
              left: window.innerWidth / 2 - w / 2 + 8, top: boxTop - 26, width: w - 16, height: 40,
              background: '#7c5a32', borderRadius: 2, zIndex: 1,
            }} />
          </motion.div>

          {crew.map((m, i) => (
            <PackedCrew key={m.slot} m={m} slotX={slotXs[i] ?? window.innerWidth / 2} packed={packed > i} reduceMotion={reduceMotion === true} />
          ))}

          <motion.div
            className="absolute"
            style={{ left: window.innerWidth / 2 - w / 2, top: boxTop, width: w, height: BOX_H, zIndex: 3 }}
            initial={reduceMotion ? { opacity: 0 } : { y: window.innerHeight * 0.5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            {/* front panel */}
            <div className="relative flex h-full w-full flex-col items-center justify-center" style={{
              background: 'linear-gradient(180deg, #c49a63, #a87d48)',
              border: '2px solid #6b4a24', borderRadius: 3,
              boxShadow: '0 16px 30px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.25)',
            }}>
              {/* handle cut-out */}
              <span className="absolute top-3 block rounded-full" style={{ width: 54, height: 12, background: '#3f2a12' }} />
              <div className="mt-4 rounded-sm px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.25em]" style={{ background: '#f8f4e8', color: '#3f2a12', border: '1px solid #6b4a24' }}>
                PERSONAL EFFECTS
              </div>
            </div>
            {/* lid */}
            {lid && (
              <motion.div
                className="absolute"
                style={{ left: -8, width: w + 16, height: 26, background: 'linear-gradient(180deg, #d4a970, #b08550)', border: '2px solid #6b4a24', borderRadius: 3, top: -30 }}
                initial={reduceMotion ? { opacity: 0 } : { y: -window.innerHeight * 0.3, rotate: -6, opacity: 0 }}
                animate={{ y: 0, rotate: 0, opacity: 1 }}
                transition={{ duration: 0.25, ease: [0.5, 0, 0.75, 0] }}
              />
            )}
          </motion.div>
        </motion.div>
      )}

      {/* His line */}
      {showLine && (
        <div className="absolute inset-x-0 flex justify-center px-5" style={{ top: `${BOX_Y * 100 - 6}%` }}>
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(19px, 5.2vw, 26px)', color: '#f1f5f9', letterSpacing: '0.02em',
              textShadow: '0 2px 8px rgba(0,0,0,0.95), 0 0 18px rgba(185,28,28,0.35)',
            }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(248,113,113,0.85)' }}>
              — THE EXECUTIVE
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
