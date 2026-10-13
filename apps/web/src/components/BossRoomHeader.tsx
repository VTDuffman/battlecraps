// =============================================================================
// BATTLECRAPS — BOSS ROOM HEADER
// apps/web/src/components/BossRoomHeader.tsx
//
// A persistent banner rendered at the top of the TableBoard during a boss
// fight. Shows the boss name, active rule, and the current minimum Pass Line
// bet with a rising indicator.
//
// Colors are derived from the floor theme so each boss feels distinct.
// =============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBossMinBet, GAUNTLET, isBossMarker, type BossRuleParams } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';

const RATING_LABELS = ['ACTION REQUIRED', 'BELOW STRONG', 'STRONG', 'VERY STRONG', 'EXCEPTIONAL'] as const;
const RATING_COLORS = ['#ef4444', '#fbbf24', '#c8d8e8', '#4ade80', '#f5c842'] as const;

export const BossRoomHeader: React.FC = () => {
  const currentMarkerIndex  = useGameStore(selectDisplayMarkerIndex);
  const bossPointHits       = useGameStore((s) => s.bossPointHits);
  const crewSlots           = useGameStore((s) => s.crewSlots);
  const unlockedSlots       = useGameStore((s) => s.unlockedSlots);
  const currentHype         = useGameStore((s) => s.hype);
  const executiveRating  = useGameStore((s) => s.executiveRating);
  const executiveBark    = useGameStore((s) => s.executiveBark);

  if (!isBossMarker(currentMarkerIndex)) return null;

  const markerConfig = GAUNTLET[currentMarkerIndex];
  const boss         = markerConfig?.boss;
  if (!boss) return null;

  const theme = getFloorTheme(currentMarkerIndex);

  const currentMinBet = getBossMinBet(currentMarkerIndex, bossPointHits);
  const nextMinBet    = getBossMinBet(currentMarkerIndex, bossPointHits + 1);

  const isTidalSurge        = boss.rule === 'TIDAL_SURGE';
  const isOrbitalDecay      = boss.rule === 'ORBITAL_DECAY';
  const isTransmissionDelay = boss.rule === 'TRANSMISSION_DELAY';
  const isConvergence       = boss.rule === 'CONVERGENCE';
  const isExecutive         = boss.rule === 'CROSS_CALIBRATION';
  const tidalParams = isTidalSurge
    ? (boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>)
    : null;
  const stageCount      = tidalParams !== null ? tidalParams.stageMultipliers.length : 0;
  const stageIndex      = tidalParams !== null ? bossPointHits % stageCount : 0;
  const stageLabel      = tidalParams !== null ? (tidalParams.stageLabels[stageIndex] ?? 'LOW TIDE') : '';
  const stageMultiplier = tidalParams !== null ? (tidalParams.stageMultipliers[stageIndex] ?? 1) : 1;
  const inHighTide      = stageMultiplier > 1;
  const nextStageIndex  = tidalParams !== null ? (stageIndex + 1) % stageCount : 0;
  const nextStageLabel  = tidalParams !== null ? (tidalParams.stageLabels[nextStageIndex] ?? 'LOW TIDE') : '';

  return (
    <div
      className="w-full flex-none"
      style={{
        background:   `linear-gradient(180deg, rgba(0,0,0,0.92) 0%, ${theme.bossBorderColor} 60%, rgba(0,0,0,0.92) 100%)`,
        borderBottom: `2px solid ${theme.bossBorderColor}`,
        boxShadow:    `0 4px 20px ${theme.bossBorderColor}`,
        isolation:    'isolate',
      }}
    >
      {/* Themed accent bar */}
      <div className="h-0.5 w-full" style={{ background: theme.bossAccentBar }} />

      <div className="px-4 py-2 flex items-center justify-between gap-2">
        {/* Left: boss identity */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex-none w-[30px] h-[30px] rounded flex items-center justify-center font-pixel text-r-12"
            style={{
              color:      theme.bossStarColor,
              background: theme.bossStarBg,
              border:     theme.bossStarBorder,
            }}
          >
            ★
          </div>
          <div className="min-w-0">
            <div
              className="font-pixel text-[6.75px] tracking-widest leading-none underline mb-1"
              style={{ color: `${theme.bossStarColor}99` }}
            >
              HIGH LIMIT ROOM
            </div>
            <div
              className="font-pixel text-[13.2px] leading-tight truncate"
              style={{ color: theme.bossTextColor }}
            >
              {boss.name.toUpperCase()}
            </div>
            {/* Executive corporate-speak bark bubble */}
            <AnimatePresence>
              {executiveBark !== null && (
                <motion.div
                  key={executiveBark.key}
                  initial={{ scale: 0.85, opacity: 0, y: -4 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 380, damping: 14 }}
                  className="mt-1 font-pixel text-[8px] leading-snug italic"
                  style={{ color: '#e2e8f0', maxWidth: '160px' }}
                >
                  "{executiveBark.line}"
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: tide state / min-bet / rule indicator */}
        {isExecutive ? (
          (() => {
            const ratingIndex   = executiveRating;
            const label         = ratingIndex !== null ? (RATING_LABELS[ratingIndex] ?? 'STRONG') : null;
            const color         = ratingIndex !== null ? (RATING_COLORS[ratingIndex] ?? '#c8d8e8') : '#c8d8e8';
            const isActionReq   = ratingIndex === 0;
            const isExceptional = ratingIndex === 4;
            return (
              <div className="flex-none text-right">
                <div
                  className="font-pixel text-[7.5px] tracking-widest leading-none"
                  style={{ color: 'rgba(200,216,232,0.60)' }}
                >
                  PERF REVIEW
                </div>
                {label !== null ? (
                  <div
                    className={`font-pixel text-r-12 leading-tight font-bold${isActionReq ? ' animate-executive-action-required' : ''}`}
                    style={{
                      color:      isActionReq ? undefined : color,
                      textShadow: isExceptional ? `0 0 8px ${color}bb, 0 0 18px ${color}55` : undefined,
                    }}
                  >
                    {label}
                  </div>
                ) : (
                  <div
                    className="font-pixel text-r-12 leading-tight"
                    style={{ color: '#c8d8e8' }}
                  >
                    PENDING…
                  </div>
                )}
              </div>
            );
          })()
        ) : isTidalSurge && tidalParams !== null ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: inHighTide ? '#fbbf24' : 'rgba(0,201,160,0.70)' }}>
              {inHighTide ? `⚠ ${stageLabel}` : stageLabel}
            </div>
            {inHighTide && currentMinBet !== null ? (
              <div className="font-pixel text-r-12 leading-tight"
                style={{ color: '#fbbf24' }}>
                MIN ${(currentMinBet / 100).toLocaleString()}
              </div>
            ) : null}
            <div className="font-pixel text-[7.5px] leading-none mt-0.5"
              style={{ color: inHighTide ? 'rgba(251,191,36,0.70)' : 'rgba(0,201,160,0.55)' }}>
              NEXT: {nextStageLabel}
            </div>
          </div>
        ) : isTransmissionDelay ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: 'rgba(57,255,20,0.60)' }}>
              SIGNAL DELAY
            </div>
            <div className="font-pixel text-r-12 leading-tight"
              style={{ color: '#39ff14' }}>
              ADDITIVES HELD
            </div>
            <div className="font-pixel text-[7.5px] leading-none mt-0.5"
              style={{ color: 'rgba(57,255,20,0.45)' }}>
              7-OUT: EVAPORATE
            </div>
          </div>
        ) : isConvergence ? (
          (() => {
            // Each seven-out permanently removes one crew member, so count who's left.
            const activeCrewCount = crewSlots.slice(0, unlockedSlots).filter((c) => c !== null).length;
            const isNaked         = activeCrewCount === 0;
            return (
              <div className="flex-none text-right">
                <div className="font-pixel text-[7.5px] tracking-widest leading-none"
                  style={{ color: 'rgba(57,255,20,0.60)' }}>
                  CONVERGENCE
                </div>
                <div className="font-pixel text-r-15 leading-tight"
                  style={{ color: isNaked ? '#ef4444' : '#39ff14' }}>
                  {isNaked ? '⌀ NAKED CRAPS' : `${activeCrewCount} CREW LEFT`}
                </div>
                <div className="font-pixel text-[7.5px] leading-none mt-0.5"
                  style={{ color: isNaked ? '#ef4444' : 'rgba(57,255,20,0.45)' }}>
                  {isNaked ? 'RAW CRAPS — NO CREW' : '−1 ON 7-OUT'}
                </div>
              </div>
            );
          })()
        ) : isOrbitalDecay ? (
          (() => {
            const hypeStr   = currentHype.toFixed(2) + '×';
            const isBelow1  = currentHype < 1.0;
            const isWarning = currentHype < 1.25 && currentHype >= 1.0;
            const hypeColor = isBelow1 ? '#ef4444' : isWarning ? '#fbbf24' : '#c8d8e8';
            return (
              <div className="flex-none text-right">
                <div className="font-pixel text-[7.5px] tracking-widest leading-none"
                  style={{ color: 'rgba(200,216,232,0.60)' }}>
                  HYPE DECAY
                </div>
                <div className="font-pixel text-r-15 leading-tight"
                  style={{ color: hypeColor }}>
                  {hypeStr}
                </div>
                <div className="font-pixel text-[7.5px] leading-none mt-0.5"
                  style={{ color: isBelow1 ? '#ef4444' : 'rgba(200,216,232,0.45)' }}>
                  {isBelow1 ? '⚠ PENALTY MODE' : '−0.5× ON 7-OUT'}
                </div>
              </div>
            );
          })()
        ) : currentMinBet !== null ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: `${theme.bossStarColor}b3` }}>
              MIN BET
            </div>
            <div className="font-pixel text-r-15 leading-tight"
              style={{ color: theme.bossStarColor }}>
              ${(currentMinBet / 100).toFixed(0)}
            </div>
            {nextMinBet !== null && nextMinBet > currentMinBet && (
              <div className="font-pixel text-[7.5px] leading-none"
                style={{ color: `${theme.bossStarColor}66` }}>
                → ${(nextMinBet / 100).toFixed(0)} next
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Rule reminder text */}
      <div
        className="px-4 pb-2 font-pixel text-[7.5px] tracking-wide text-center"
        style={{ color: `${theme.bossTextColor}70` }}
      >
        ⚔ {boss.ruleHeaderText}
      </div>
    </div>
  );
};
