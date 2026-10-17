// =============================================================================
// BATTLECRAPS — CHARM TRAP (FB-042, Mme. Le Prix under the glass)
// apps/web/src/components/CharmTrap.tsx
//
// Mme. Le Prix's tracker on the table (BossTableWell lays it out 360×190 and
// scales it to fit). The crew member she has charmed is held under a glass
// cloche — a pink haze, a slow heart pulse — while their rail slot shows a
// faint outline and a ❤️. The dice fly over the glass like any tracker.
//
//   • The charm moves (CharmFlight, [data-charm-trap-anchor] is the glass):
//     the one she held flies home, the heart flies to the next one, who sinks
//     under the glass. The glass stays empty while a flight is under way.
//   • The charmed crew member would have fired (charmingSlot — the rail
//     heartbeat): they press up against the glass, knock twice (muffled), and
//     sink back, dazed.
//   • Her fight ends: the glass empties (THE ROSE shatters it; SHE TAKES THE
//     CREW starts the trapped one from here).
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playGlassKnock } from '../hooks/useCrowdAudio.js';
import { CREW_EMOJI } from './CrewPortrait.js';

const PINK = '#f472b6';
const ROSE = '#fda4af';

export const CharmTrap: React.FC = () => {
  const charmedSlot  = useGameStore((s) => s.charmedCrewSlot);
  const flying       = useGameStore((s) => s.charmFlight !== null);
  const crewSlots    = useGameStore((s) => s.crewSlots);
  // The rail heartbeat runs once the cascade is done — the knock goes with it.
  const knocking     = useGameStore((s) => s.charmingSlot !== null && s.cascadeQueue.length === 0);
  const reduceMotion = useReducedMotion() === true;

  const crewId  = charmedSlot !== null ? (crewSlots[charmedSlot]?.crewId ?? null) : null;
  const trapped = crewId !== null && !flying ? (CREW_EMOJI[crewId] ?? '?') : null;

  // A knock for each heartbeat after mount.
  const [knockKey, setKnockKey] = useState(0);
  const wasKnocking = useRef(knocking);
  useEffect(() => {
    if (knocking && !wasKnocking.current && trapped !== null) {
      setKnockKey((k) => k + 1);
      playGlassKnock();
    }
    wasKnocking.current = knocking;
  }, [knocking]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg"
      style={{
        background: 'radial-gradient(ellipse at 50% 60%, rgba(110,14,56,0.55), rgba(18,3,12,0.92) 75%)',
        border:     `1px solid ${PINK}33`,
      }}
      role="status"
      aria-label={trapped !== null ? 'Mme. Le Prix holds one of your crew under glass — they sit out until the point resolves' : 'Mme. Le Prix is choosing'}
    >
      <div className="font-pixel text-[9px] tracking-[0.3em]" style={{ color: `${ROSE}aa` }}>
        {trapped !== null ? 'UNDER HER SPELL' : 'SHE IS CHOOSING…'}
      </div>

      {/* The cloche */}
      <div className="relative mt-2 flex flex-col items-center">
        {/* knob */}
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: 'linear-gradient(180deg, #fde68a, #b45309)', boxShadow: '0 1px 2px rgba(0,0,0,0.6)' }} />
        {/* dome */}
        <div
          data-charm-trap-anchor=""
          className="relative -mt-0.5 flex items-center justify-center overflow-hidden"
          style={{
            width: 112, height: 104,
            borderRadius: '56px 56px 6px 6px',
            border:       '2px solid rgba(255,255,255,0.32)',
            background:   'radial-gradient(ellipse at 50% 65%, rgba(244,114,182,0.30), rgba(244,114,182,0.06) 70%)',
            boxShadow:    `inset 0 0 18px rgba(244,114,182,0.25), 0 0 16px ${PINK}22`,
          }}
        >
          {/* the trapped crew member (or her rose while she chooses) */}
          <AnimatePresence mode="wait">
            {trapped !== null ? (
              <motion.div
                key={`crew-${charmedSlot}`}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.35 }}
              >
                {/* re-keyed per knock: presses up against the glass, twice, then sinks back */}
                <motion.div
                  key={`knock-${knockKey}`}
                  className="relative flex flex-col items-center"
                  initial={{ scale: 1, y: 8 }}
                  animate={knockKey > 0 && !reduceMotion
                    ? { scale: [1, 1.28, 1.02, 1.2, 1], y: [8, -16, 4, -12, 8] }
                    : { scale: 1, y: 8 }}
                  transition={{ duration: 1.0, times: [0, 0.2, 0.42, 0.62, 1] }}
                >
                  <motion.span
                    className="select-none leading-none"
                    style={{ fontSize: 50, filter: `drop-shadow(0 0 10px ${PINK}aa)` }}
                    animate={reduceMotion ? {} : { scale: [1, 1.06, 1, 1.04, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {trapped}
                  </motion.span>
                  {knockKey > 0 && (
                    <motion.span
                      className="pointer-events-none absolute -top-5 select-none text-[16px] leading-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0, 1, 1, 0], rotate: [0, 0, 20, -20, 0] }}
                      transition={{ duration: 1.8, times: [0, 0.55, 0.65, 0.9, 1] }}
                    >
                      💫
                    </motion.span>
                  )}
                </motion.div>
              </motion.div>
            ) : (
              <motion.span
                key="rose"
                className="select-none leading-none"
                style={{ fontSize: 30, opacity: 0.45 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: flying ? 0 : 0.45 }}
                exit={{ opacity: 0 }}
              >
                🌹
              </motion.span>
            )}
          </AnimatePresence>

          {/* a little heart drifting in the haze */}
          {trapped !== null && !reduceMotion && (
            <motion.span
              className="pointer-events-none absolute right-4 top-6 select-none text-[12px] leading-none"
              animate={{ y: [0, -8, 0], opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              ❤️
            </motion.span>
          )}

          {/* the knocks — rings on the glass where they hit */}
          {knockKey > 0 && !reduceMotion && [0, 0.32].map((d) => (
            <motion.span
              key={`ring-${knockKey}-${d}`}
              className="pointer-events-none absolute left-1/2 top-3 block h-8 w-8 rounded-full"
              style={{ marginLeft: -16, border: '2px solid rgba(255,255,255,0.7)' }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.6], opacity: [0.9, 0] }}
              transition={{ duration: 0.5, delay: 0.18 + d }}
            />
          ))}

          {/* the glass: a curved highlight */}
          <div className="pointer-events-none absolute inset-0" style={{
            borderRadius: '56px 56px 6px 6px',
            background:   'linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 18%, transparent 30%, transparent 78%, rgba(255,255,255,0.10) 90%, transparent 100%)',
          }} />
        </div>
        {/* base */}
        <div style={{ width: 140, height: 10, borderRadius: 3, background: 'linear-gradient(180deg, #fbbf24, #92400e)', boxShadow: '0 3px 8px rgba(0,0,0,0.6)' }} />
      </div>

      <div className="mt-2.5 font-pixel text-[8px] tracking-widest" style={{ color: `${ROSE}88` }}>
        {trapped !== null ? 'SITS OUT UNTIL THE POINT RESOLVES' : 'A NEW CHARM EVERY COME-OUT'}
      </div>
    </div>
  );
};
