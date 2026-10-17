// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: SHE TAKES THE CREW (FB-034, Mme. Le Prix)
// apps/web/src/components/defeat/SheTakesTheCrewCinematic.tsx
//
// Mme. Le Prix ended your run, and she keeps your crew. The table sinks into
// wine-dark; a big ❤️ blooms on every one of YOUR crew portraits (measured
// from the rail, so it's your actual crew), each with a harp note; then one by
// one they lift off the rail and drift up to her name, shrinking into her with
// a pink flash; finally a huge glossy lipstick kiss presses onto the screen
// like a stamp on glass ("mwah" + thud + jolt) and she has the last word.
// Built at the same scale as her win moment (THE ROSE): big wins, big losses.
// FB-042: the crew member she was already holding under her glass on the
// table goes first, straight from the glass.
//
// Timeline (ms): 0 dim → 300 hearts bloom (staggered 260) → 1700 crew lift
// off (staggered 380, 1.5 s each) → last arrives ≈4700 → 4900 kiss → 5500
// line → 7300 fade → 7700 onFinish (game over continues; under the store's
// 9 s safety net). An empty rail skips straight to the kiss.
// =============================================================================

import React, { useEffect, useLayoutEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { measureRailCrew, setRailHidden, type RailMember } from '../cinematics/railCrew.js';
import { useGameStore } from '../../store/useGameStore.js';
import { playHarpGlissando, playHeartBloom, playKissMwah, playStampThud } from '../../hooks/useCrowdAudio.js';
import type { DefeatCinematicProps } from './registry.js';

const BLOOM_AT     = 300;
const BLOOM_STEP   = 260;
const LIFT_AT      = 1700;
const LIFT_STEP    = 380;
const LIFT_S       = 1.5;
const AFTER_LAST   = 200;   // beat between the last arrival and the kiss
const LINE_AFTER   = 600;   // kiss → line
const FADE_AFTER   = 2400;  // kiss → fade
const FINISH_AFTER = 2800;  // kiss → onFinish
const EMPTY_KISS_AT = 1000;

type Member = RailMember;
interface Pt { x: number; y: number }

function measureCrew(): { members: Member[]; target: Pt; fromGlass: number | null } {
  const nameEl = document.querySelector('[data-boss-name-anchor]');
  const nr     = nameEl?.getBoundingClientRect();
  const target = nr && nr.width > 0
    ? { x: nr.left + Math.min(nr.width, 160) / 2, y: nr.top + nr.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight * 0.12 };
  // FB-042: the one under her glass starts from the glass, and leaves first.
  const members = measureRailCrew();
  const trapped = useGameStore.getState().freedCharmSlot;
  const glass   = document.querySelector('[data-charm-trap-anchor]')?.getBoundingClientRect();
  const held    = members.find((m) => m.slot === trapped);
  if (held && glass && glass.width > 0) {
    const fromGlass = { ...held, x: glass.left + glass.width / 2, y: glass.top + glass.height * 0.55 };
    return { members: [fromGlass, ...members.filter((m) => m !== held)].map((m, order) => ({ ...m, order })), target, fromGlass: fromGlass.slot };
  }
  return { members, target, fromGlass: null };
}

const CrewStandIn: React.FC<{ m: Member; target: Pt; bloomed: boolean; lifted: boolean; reduceMotion: boolean }> = ({
  m, target, bloomed, lifted, reduceMotion,
}) => {
  const dx = target.x - m.x, dy = target.y - m.y;
  // Lift straight up first, then curve in toward her name.
  const lift = {
    x:       [0, dx * 0.05, dx * 0.45, dx],
    y:       [0, -70, dy * 0.7, dy],
    scale:   [1.15, 1.35, 0.9, 0.15],
    rotate:  [0, (m.order % 2 ? 8 : -8), (m.order % 2 ? -6 : 6), 0],
    opacity: [1, 1, 1, 0],
  };
  return (
    <motion.div
      className="absolute flex items-center justify-center rounded-sm border-2"
      style={{
        left: m.x - m.size / 2, top: m.y - m.size / 2, width: m.size, height: m.size,
        background: '#0f2a1d',
        borderColor: bloomed ? '#f472b6' : 'rgba(212,160,23,0.6)',
        boxShadow: bloomed ? '0 0 22px 8px rgba(244,114,182,0.6)' : 'none',
        transition: 'border-color 200ms, box-shadow 300ms',
      }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={lifted
        ? (reduceMotion ? { opacity: 0 } : lift)
        : bloomed ? { scale: 1.15 } : { scale: 1 }}
      transition={lifted
        ? { duration: reduceMotion ? 0.5 : LIFT_S, times: reduceMotion ? undefined : [0, 0.2, 0.7, 1], ease: 'easeInOut' }
        : { type: 'spring', stiffness: 300, damping: 14 }}
    >
      <span className="select-none leading-none" style={{ fontSize: m.size * 0.6 }}>{m.emoji}</span>
      {/* The big ❤️ that blooms over the portrait */}
      {bloomed && (
        <motion.span
          className="pointer-events-none absolute select-none leading-none"
          style={{ fontSize: m.size * 0.95, filter: 'drop-shadow(0 0 10px rgba(244,114,182,0.95))' }}
          initial={{ scale: 0, opacity: 0, y: 0 }}
          animate={{ scale: [0, 1.9, 1.1], opacity: [0, 1, 1], y: [0, -m.size * 0.15, -m.size * 0.55] }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          ❤️
        </motion.span>
      )}
    </motion.div>
  );
};

export const SheTakesTheCrewCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion();
  const [scene, setScene]     = useState<{ members: Member[]; target: Pt; fromGlass: number | null } | null>(null);
  const [bloomed, setBloomed] = useState(0);   // how many hearts have bloomed
  const [lifted, setLifted]   = useState(0);   // how many crew have lifted off
  const [arrivals, setArrivals] = useState(0); // pink flashes at her name
  const [kissed, setKissed]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]   = useState(false);

  useLayoutEffect(() => { setScene(measureCrew()); }, []);

  useEffect(() => {
    if (!scene) return;
    const n = scene.members.length;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    // Their rail slot is already empty — they're under the glass.
    if (scene.fromGlass !== null) setRailHidden(scene.fromGlass, true);

    scene.members.forEach((m, i) => {
      at(BLOOM_AT + i * BLOOM_STEP, () => { setBloomed(i + 1); playHeartBloom(i); });
      at(LIFT_AT + i * LIFT_STEP, () => { setLifted(i + 1); setRailHidden(m.slot, true); });
      at(LIFT_AT + i * LIFT_STEP + LIFT_S * 1000, () => setArrivals(i + 1));
    });
    if (n > 0) at(LIFT_AT, playHarpGlissando);

    const kissAt = n > 0 ? LIFT_AT + (n - 1) * LIFT_STEP + LIFT_S * 1000 + AFTER_LAST : EMPTY_KISS_AT;
    at(kissAt, () => { setKissed(true); playKissMwah(); playStampThud(); });
    at(kissAt + LINE_AFTER, () => setShowLine(true));
    at(kissAt + FADE_AFTER, () => setFading(true));
    at(kissAt + FINISH_AFTER, onFinish);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      scene.members.forEach((m) => setRailHidden(m.slot, false));
    };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {/* Wine-dark dim */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(110,10,48,0.55), rgba(0,0,0,0.75))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {scene && (
        <>
          {/* A pink flash at her name each time one of your crew reaches her */}
          {arrivals > 0 && (
            <motion.span
              key={arrivals}
              className="pointer-events-none absolute block rounded-full"
              style={{ left: scene.target.x - 70, top: scene.target.y - 70, width: 140, height: 140,
                       background: 'radial-gradient(circle, rgba(251,113,133,0.8), rgba(190,18,60,0.25) 50%, transparent 72%)' }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.4, 1.8], opacity: [0, 1, 0] }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          )}

          {scene.members.map((m, i) => (
            <CrewStandIn
              key={m.slot}
              m={m}
              target={scene.target}
              bloomed={bloomed > i}
              lifted={lifted > i}
              reduceMotion={reduceMotion === true}
            />
          ))}
        </>
      )}

      {/* The kiss — pressed onto the glass, then her line */}
      {kissed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 animate-dock-impact-shake">
          <motion.span
            className="block select-none leading-none"
            style={{
              fontSize: 'clamp(200px, 56vw, 320px)',
              filter: 'drop-shadow(0 0 24px rgba(244,63,94,0.55)) drop-shadow(0 12px 18px rgba(0,0,0,0.6))',
            }}
            initial={{ scale: reduceMotion ? 1 : 2.4, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 0.95, rotate: -10 }}
            transition={reduceMotion
              ? { duration: 0.4 }
              : { duration: 0.32, ease: [0.5, 0, 0.75, 0] }}  // accelerates into the glass
          >
            💋
          </motion.span>

          {showLine && (
            <motion.div
              className="mt-4 max-w-md text-center italic"
              style={{
                fontFamily:    'Georgia, "Times New Roman", serif',
                fontSize:      'clamp(19px, 5.2vw, 26px)',
                color:         '#fde2e4',
                letterSpacing: '0.02em',
                textShadow:    '0 2px 8px rgba(0,0,0,0.95), 0 0 20px rgba(190,18,60,0.55)',
              }}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              &ldquo;{line}&rdquo;
              <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: '#f9a8d4', opacity: 0.85 }}>
                — MME. LE PRIX
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};
