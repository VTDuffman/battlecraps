// =============================================================================
// BATTLECRAPS — PERFORMANCE METER (FB-035, The Executive)
// apps/web/src/components/PerformanceMeter.tsx
//
// The Executive's Performance Review, on the table (FB-042 — BossTableWell
// lays it out 360×170 and scales it to fit; his room still clears on bankroll,
// so the progress bar stays). A 5-step
// review scale with a marker that slides when the rating moves — a keyboard
// clack per step, an office ding on reaching Exceptional, a low buzz on
// dropping to Action Required.
//   • Exceptional: the scale glows gold; each +15% bonus pops "+15% · $X".
//   • Action Required: the meter goes red with a slow alarm pulse and
//     FINAL WARNING underneath.
//
// Driven by executiveRating / exceptionalBonus from applyPendingSettlement().
// Nothing sounds on mount (fight entry / hydration), only on new rolls.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playPromotionDing, playReviewTick, playReviewWarning } from '../hooks/useCrowdAudio.js';
import { ruleCounter } from '../lib/bossRules.js';

export const RATING_LABELS = ['ACTION REQUIRED', 'BELOW STRONG', 'STRONG', 'VERY STRONG', 'EXCEPTIONAL'] as const;
const SHORT_LABELS         = ['ACTION', 'BELOW', 'STRONG', 'V.STRONG', 'EXCEPT.'] as const;
export const RATING_COLORS = ['#ef4444', '#fbbf24', '#c8d8e8', '#4ade80', '#f5c842'] as const;

const GOLD = '#f5c842';
const RED  = '#ef4444';

export const PerformanceMeter: React.FC = () => {
  // executiveRating is set by every roll in the fight and at pub exit; fall
  // back to the raw boss counter (the rating) so the meter never waits for
  // the first roll.
  const rating       = useGameStore((s) => s.executiveRating ?? Math.min(4, Math.max(0, ruleCounter(s, 'CROSS_CALIBRATION'))));
  const bonus        = useGameStore((s) => s.exceptionalBonus);
  const reduceMotion = useReducedMotion();

  // Sounds only on changes after mount.
  const prevRating = useRef<number | null>(rating);
  useEffect(() => {
    const prev = prevRating.current;
    prevRating.current = rating;
    if (prev === null || rating === null || prev === rating) return;
    if (rating === 4)      playPromotionDing();
    else if (rating === 0) playReviewWarning();
    else                   playReviewTick(Math.abs(rating - prev));
  }, [rating]);

  // The bonus pop only for bonuses paid after mount.
  const mountBonusKey = useRef(bonus?.key ?? 0);
  const showBonus = bonus !== null && bonus.key !== mountBonusKey.current;

  if (rating === null) return null;

  const isExceptional = rating === 4;
  const isActionReq   = rating === 0;
  const label         = RATING_LABELS[rating] ?? 'STRONG';
  const color         = RATING_COLORS[rating] ?? '#c8d8e8';

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-center rounded-lg px-4 py-3 ${isActionReq && !reduceMotion ? 'animate-review-alarm' : ''}`}
      style={{
        background: 'rgba(8,12,20,0.72)',
        border:     `1px solid ${isActionReq ? RED : isExceptional ? GOLD : 'rgba(200,216,232,0.25)'}`,
        boxShadow:  isExceptional ? `0 0 14px 3px ${GOLD}55` : isActionReq ? `0 0 12px 2px ${RED}55` : 'none',
        transition: 'border-color 300ms, box-shadow 400ms',
      }}
      role="status"
      aria-label={`Performance review: ${label}`}
    >
      {/* Header row: title + current rating */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[9px] tracking-widest" style={{ color: 'rgba(200,216,232,0.65)' }}>
          PERFORMANCE REVIEW
        </span>
        <motion.span
          key={rating}
          className="font-pixel text-[17px] font-bold leading-none"
          style={{ color, textShadow: isExceptional ? `0 0 8px ${GOLD}bb` : isActionReq ? `0 0 8px ${RED}aa` : undefined }}
          initial={reduceMotion ? false : { scale: 1.35, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16 }}
        >
          {label}
        </motion.span>
      </div>

      {/* The scale: five segments, the marker rides above the current one */}
      <div className="relative mt-6">
        <motion.div
          className="absolute -top-4 z-10 h-0 w-0"
          style={{
            marginLeft:  -9,
            borderLeft:  '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop:   `12px solid ${color}`,
            filter:      `drop-shadow(0 0 4px ${color})`,
          }}
          initial={false}
          animate={{ left: `${(rating + 0.5) * 20}%` }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
        />
        <div className="flex gap-1">
          {RATING_COLORS.map((c, i) => {
            const active = i === rating;
            return (
              <div
                key={i}
                className="h-4 flex-1 rounded-sm"
                style={{
                  background: active ? c : `${c}33`,
                  boxShadow:  active ? `0 0 8px 1px ${c}aa` : 'none',
                  transition: 'background 250ms, box-shadow 250ms',
                }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1">
          {SHORT_LABELS.map((l, i) => (
            <span
              key={l}
              className="flex-1 text-center font-pixel text-[8px] leading-none tracking-wide"
              style={{ color: i === rating ? (RATING_COLORS[i] ?? '#c8d8e8') : 'rgba(200,216,232,0.35)' }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Status line */}
      {(isActionReq || isExceptional) && (
        <div
          className={`mt-3 text-center font-pixel text-[10px] tracking-widest ${isActionReq && !reduceMotion ? 'animate-executive-action-required' : ''}`}
          style={{ color: isActionReq ? RED : GOLD }}
        >
          {isActionReq ? '⚠ FINAL WARNING — ONE MORE BAD ROLL' : '★ +15% ON EVERY WIN'}
        </div>
      )}

      {/* +15% · $X — pops off the meter each time the bonus pays */}
      <AnimatePresence>
        {showBonus && bonus !== null && (
          <motion.span
            key={bonus.key}
            className="pointer-events-none absolute right-3 top-12 z-20 whitespace-nowrap font-pixel text-[15px] font-bold"
            style={{ color: GOLD, textShadow: `0 0 10px ${GOLD}, 0 2px 4px rgba(0,0,0,0.9)` }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={reduceMotion ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], y: [0, -14, -26, -40], scale: [0.6, 1.2, 1, 1] }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          >
            +15% · ${Math.round(bonus.cents / 100).toLocaleString('en-US')}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};
