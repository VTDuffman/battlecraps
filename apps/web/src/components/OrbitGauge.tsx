// =============================================================================
// BATTLECRAPS — ORBIT GAUGE (FB-038, The Commander)
// apps/web/src/components/OrbitGauge.tsx
//
// The Commander's orbital bleed, under the glass on the table (FB-042 —
// BossTableWell lays it out at 360×200 and scales it to fit). A planet sits in the middle; your ship circles it on an orbit whose
// radius IS your hype — 1.0× skims the atmosphere, On Fire is a high, wide
// orbit. Every roll the bleed tightens the orbit toward the planet; hype gains
// fire the thrusters and lift it. Like a real orbit, the lower you are the
// faster you whip around — a decaying orbit feels like falling in.
// Faint rings mark Heating Up (1.5×) and On Fire (2.5×).
//
// Driven by the store's hype + lastOrbit (bleed / gain events). The ship's
// motion runs on an animation frame. A bleed pings (playOrbitDecay); a gain
// fires the thrusters (playThrusters).
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playOrbitDecay, playThrusters } from '../hooks/useCrowdAudio.js';

const W = 360, H = 200;
const CX = W / 2, CY = H / 2 + 6;
const PLANET_R = 20;
const ATMO_R   = 27;
const R_MIN    = 33;    // 1.0× — skimming the atmosphere
const R_SPAN   = 30;    // + this at MAX_HYPE
const MAX_HYPE = 3.5;
const RX = 2.3, RY = 1.22;   // ellipse stretch (a tilted orbit)

const radiusFor = (hype: number): number =>
  R_MIN + R_SPAN * Math.min(1, Math.max(0, (hype - 1) / (MAX_HYPE - 1)));

const tierColor = (hype: number): string =>
  hype >= 2.5 ? '#fb923c' : hype >= 1.5 ? '#fbbf24' : '#c8d8e8';

const Ring: React.FC<{ hype: number; label: string; color: string }> = ({ hype, label, color }) => {
  const r = radiusFor(hype);
  return (
    <g>
      <ellipse cx={CX} cy={CY} rx={r * RX} ry={r * RY} fill="none" stroke={color} strokeOpacity={0.22} strokeDasharray="2 5" />
      <text x={CX + r * RX + 4} y={CY + 3} fill={color} fillOpacity={0.55} fontSize={8} fontFamily='"Press Start 2P", monospace'>{label}</text>
    </g>
  );
};

export const OrbitGauge: React.FC = () => {
  const hype         = useGameStore((s) => s.hype);
  const lastOrbit    = useGameStore((s) => s.lastOrbit);
  const reduceMotion = useReducedMotion() === true;

  // The orbit's radius eases to the new hype (springy, like a burn or a fall).
  const radius = useSpring(radiusFor(hype), { stiffness: 50, damping: 14 });
  useEffect(() => { radius.set(radiusFor(hype)); }, [hype, radius]);

  // The ship: angular speed rises as the orbit drops (∝ r^-1.5).
  const angle = useRef(Math.PI * 0.25);
  const shipX = useMotionValue(CX + radiusFor(hype) * RX);
  const shipY = useMotionValue(CY);
  const ringRx = useMotionValue(radiusFor(hype) * RX);
  const ringRy = useMotionValue(radiusFor(hype) * RY);
  useAnimationFrame((_, delta) => {
    const r = radius.get();
    ringRx.set(r * RX); ringRy.set(r * RY);
    if (!reduceMotion) angle.current += (delta / 1000) * 1.6 * Math.pow(R_MIN / r, 1.5);
    shipX.set(CX + Math.cos(angle.current) * r * RX);
    shipY.set(CY + Math.sin(angle.current) * r * RY);
  });

  // Events (only rolls after mount): a bleed tightens the orbit; a gain fires the thrusters.
  const mountKey = useRef(lastOrbit?.key ?? 0);
  const prevHype = useRef(hype);
  const [event, setEvent] = useState<{ gain: number; bleed: number; key: number } | null>(null);
  useEffect(() => {
    const before = prevHype.current;
    prevHype.current = hype;
    if (!lastOrbit || lastOrbit.key === mountKey.current) return;
    // The roll paid at hype + bleed; anything above where it started was a burn.
    const gain  = Math.max(0, lastOrbit.hype + lastOrbit.bleed - before);
    const bleed = lastOrbit.bleed;
    if (gain < 0.005 && bleed <= 0) return;
    setEvent({ gain, bleed, key: lastOrbit.key });
    const timers: number[] = [];
    if (gain >= 0.005) playThrusters();
    if (bleed > 0) timers.push(window.setTimeout(playOrbitDecay, gain >= 0.005 ? 550 : 0));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [lastOrbit?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = tierColor(hype);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg"
      style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(30,41,82,0.85), rgba(5,8,20,0.95) 75%)', border: `1px solid ${color}44` }}
      role="status"
      aria-label={`Orbit: hype ${hype.toFixed(2)}×, bleeding 20% of the height above 1.0× each roll`}
    >
      {/* stars */}
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{
        backgroundImage: 'radial-gradient(1px 1px at 12% 22%, #fff, transparent), radial-gradient(1px 1px at 78% 18%, #fff, transparent), radial-gradient(1px 1px at 33% 80%, #cbd5e1, transparent), radial-gradient(1px 1px at 88% 72%, #fff, transparent), radial-gradient(1px 1px at 55% 12%, #cbd5e1, transparent), radial-gradient(1px 1px at 6% 64%, #fff, transparent), radial-gradient(1px 1px at 66% 90%, #cbd5e1, transparent), radial-gradient(1px 1px at 22% 46%, #fff, transparent), radial-gradient(1px 1px at 92% 40%, #cbd5e1, transparent), radial-gradient(1.5px 1.5px at 44% 30%, #fff, transparent), radial-gradient(1px 1px at 72% 58%, #fff, transparent)',
      }} />

      <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="orbit-planet" cx="38%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0c1445" />
          </radialGradient>
        </defs>

        <Ring hype={1.5} label="1.5×" color="#fbbf24" />
        <Ring hype={2.5} label="2.5×" color="#fb923c" />

        {/* your orbit */}
        <motion.ellipse cx={CX} cy={CY} rx={ringRx} ry={ringRy} fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={1.2} />

        {/* the planet + atmosphere */}
        <circle cx={CX} cy={CY} r={ATMO_R} fill="#38bdf8" fillOpacity={0.12} />
        <circle cx={CX} cy={CY} r={PLANET_R} fill="url(#orbit-planet)" />

        {/* the ship */}
        <motion.g style={{ x: shipX, y: shipY }}>
          <AnimatePresence>
            {event !== null && event.gain >= 0.005 && !reduceMotion && (
              <motion.circle key={`burn-${event.key}`} r={7} fill="#fb923c"
                initial={{ opacity: 0.9, scale: 0.5 }} animate={{ opacity: 0, scale: 2.4 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }} />
            )}
          </AnimatePresence>
          <circle r={4} fill="#f8fafc" />
          <circle r={7.5} fill={color} fillOpacity={0.35} />
        </motion.g>
      </svg>

      {/* readouts */}
      <div className="pointer-events-none absolute left-2.5 top-2">
        <div className="font-pixel text-[8px] tracking-widest" style={{ color: 'rgba(200,216,232,0.6)' }}>ORBIT</div>
        <div className="font-pixel text-[18px] font-bold leading-tight" style={{ color, textShadow: `0 0 8px ${color}88` }}>{hype.toFixed(2)}×</div>
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2.5 text-right font-pixel text-[8px] leading-tight tracking-wide" style={{ color: 'rgba(200,216,232,0.5)' }}>
        −20% / ROLL ABOVE 1×<br />7-OUT → 1.00×
      </div>

      {/* the bleed / the burn */}
      <AnimatePresence>
        {event !== null && (
          <motion.div
            key={`ev-${event.key}`}
            className="pointer-events-none absolute right-2.5 top-2 text-right font-pixel text-[11px] font-bold leading-snug"
            style={{ color: event.gain >= 0.005 ? '#fb923c' : '#94a3b8' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-4, 0, 2, 8] }}
            transition={{ duration: 1.8, times: [0, 0.12, 0.7, 1] }}
            onAnimationComplete={() => setEvent(null)}
          >
            {event.gain >= 0.005 && <span>▲ BURN +{event.gain.toFixed(2)}×</span>}
            {event.gain >= 0.005 && event.bleed > 0 && <br />}
            {event.bleed > 0 && <span style={{ color: '#94a3b8' }}>▼ ORBIT DECAY −{event.bleed.toFixed(2)}×</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
