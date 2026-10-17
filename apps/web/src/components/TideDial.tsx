// =============================================================================
// BATTLECRAPS — TIDE DIAL (FB-037, The Sovereign)
// apps/web/src/components/TideDial.tsx
//
// The Sovereign's tide, on the table (FB-042 — BossTableWell lays it out
// 360×170 and scales it to fit; his room still clears on bankroll). Four segments — LOW · EBB · HIGH · FLOW —
// with the current stage lit and the next one marked, the stage's name and
// its one-line rule. "You can see it coming."
// =============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, getTideStage, type BossRuleParams, type TideEffect } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { isRuleOn, paramsOfRule, ruleCounter } from '../lib/bossRules.js';

const TEAL  = '#5eead4';
const AMBER = '#fbbf24';
const RED   = '#f87171';

const EFFECT_COLOR: Record<TideEffect, string> = {
  DEAD_CALM: TEAL,
  UNDERTOW:  AMBER,
  HIGH_TIDE: RED,
};

export const TideDial: React.FC = () => {
  // FB-040: her own fight, or her room in The Architect's (its own tide).
  const on           = useGameStore((s) => isRuleOn(s, 'TIDAL_SURGE'));
  const counter      = useGameStore((s) => ruleCounter(s, 'TIDAL_SURGE'));
  const reduceMotion = useReducedMotion() === true;

  const params = paramsOfRule('TIDAL_SURGE');
  if (!on || params === null) return null;
  const now    = getTideStage(params, counter);
  const next   = getTideStage(params, counter + 1);
  const color  = EFFECT_COLOR[now.effect];
  const stages = [0, 1, 2, 3].map((i) => getTideStage(params, i));

  return (
    <div
      className="relative flex h-full w-full flex-col justify-center rounded-lg px-4 py-3"
      style={{
        background: 'linear-gradient(180deg, rgba(4,30,46,0.85), rgba(2,18,30,0.9))',
        border:     `1px solid ${color}55`,
        boxShadow:  now.effect === 'HIGH_TIDE' ? `0 0 14px 3px ${RED}44` : 'none',
        transition: 'border-color 400ms, box-shadow 400ms',
      }}
      role="status"
      aria-label={`The tide: ${now.tide}, ${now.name} — ${now.rule}. Next: ${next.name}.`}
    >
      {/* the four stages */}
      <div className="flex gap-1.5">
        {stages.map((st) => {
          const isNow  = st.index === now.index;
          const isNext = st.index === next.index;
          const c = EFFECT_COLOR[st.effect];
          return (
            <div key={st.index} className="flex flex-1 flex-col items-center">
              <div
                className="h-4 w-full rounded-sm"
                style={{
                  background: isNow ? c : `${c}2a`,
                  boxShadow:  isNow ? `0 0 8px 1px ${c}aa` : 'none',
                  outline:    isNext ? `1px dashed ${c}aa` : 'none',
                  outlineOffset: 1,
                  transition: 'background 300ms, box-shadow 300ms',
                }}
              />
              <span className="mt-1.5 font-pixel text-[8px] leading-none tracking-wide"
                style={{ color: isNow ? c : 'rgba(186,230,253,0.4)' }}>
                {st.tide.replace(' TIDE', '')}{isNext ? ' ▸' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* the stage, its rule, and what's next */}
      <motion.div
        key={now.index}
        className="mt-4 text-center"
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="font-pixel text-[19px] font-bold leading-tight" style={{ color, textShadow: `0 0 8px ${color}88` }}>
          {now.effect === 'DEAD_CALM' ? now.name : `⚠ ${now.name}`}
        </div>
        <div className="mt-1 font-pixel text-[10px] leading-tight tracking-wide" style={{ color: `${color}cc` }}>
          {now.rule}
        </div>
        <div className="mt-2.5 font-pixel text-[8.5px] leading-none tracking-widest" style={{ color: 'rgba(186,230,253,0.5)' }}>
          NEXT COME-OUT: {next.name}
        </div>
      </motion.div>
    </div>
  );
};
