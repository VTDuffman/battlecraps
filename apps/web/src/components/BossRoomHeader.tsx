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
import { getBossMinBet, GAUNTLET, isBossMarker, type BossRuleParams } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';

export const BossRoomHeader: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectDisplayMarkerIndex);
  const bossPointHits      = useGameStore((s) => s.bossPointHits);
  const currentHype        = useGameStore((s) => s.hype);

  if (!isBossMarker(currentMarkerIndex)) return null;

  const markerConfig = GAUNTLET[currentMarkerIndex];
  const boss         = markerConfig?.boss;
  if (!boss) return null;

  const theme = getFloorTheme(currentMarkerIndex);

  const currentMinBet = getBossMinBet(currentMarkerIndex, bossPointHits);
  const nextMinBet    = getBossMinBet(currentMarkerIndex, bossPointHits + 1);

  const isTidalSurge   = boss.rule === 'TIDAL_SURGE';
  const isOrbitalDecay = boss.rule === 'ORBITAL_DECAY';
  const isFirstContact = boss.rule === 'FIRST_CONTACT_PROTOCOL';
  const isConvergence  = boss.rule === 'CONVERGENCE';
  const tidalParams = isTidalSurge
    ? (boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>)
    : null;
  const tidalCycleTotal   = tidalParams !== null ? tidalParams.lowTideDuration + tidalParams.highTideDuration : 0;
  const tidePos           = tidalParams !== null ? bossPointHits % tidalCycleTotal : 0;
  const inHighTide        = tidalParams !== null && tidePos >= tidalParams.lowTideDuration;
  const rollsUntilChange  = tidalParams !== null
    ? (inHighTide ? tidalCycleTotal - tidePos : tidalParams.lowTideDuration - tidePos)
    : 0;

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
            className="flex-none w-[30px] h-[30px] rounded flex items-center justify-center font-pixel text-[12px]"
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
              className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: `${theme.bossStarColor}99` }}
            >
              HIGH LIMIT ROOM
            </div>
            <div
              className="font-pixel text-[12px] leading-tight truncate"
              style={{ color: theme.bossTextColor }}
            >
              {boss.name.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Right: tide state / min-bet / rule indicator */}
        {isTidalSurge && tidalParams !== null ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: inHighTide ? '#fbbf24' : 'rgba(0,201,160,0.70)' }}>
              {inHighTide ? '⚠ HIGH TIDE' : 'LOW TIDE'}
            </div>
            <div className="font-pixel text-[12px] leading-tight"
              style={{ color: inHighTide ? '#fbbf24' : 'rgba(0,201,160,0.85)' }}>
              {inHighTide
                ? `${rollsUntilChange} ROLL${rollsUntilChange !== 1 ? 'S' : ''} LEFT`
                : `HIGH TIDE IN ${rollsUntilChange}`}
            </div>
            {inHighTide && currentMinBet !== null && (
              <div className="font-pixel text-[7.5px] leading-none mt-0.5"
                style={{ color: 'rgba(251,191,36,0.70)' }}>
                MIN ${(currentMinBet / 100).toLocaleString()}
              </div>
            )}
          </div>
        ) : isFirstContact ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none"
              style={{ color: 'rgba(57,255,20,0.60)' }}>
              NULL PROTOCOL
            </div>
            <div className="font-pixel text-[12px] leading-tight"
              style={{ color: '#39ff14' }}>
              7/11 = NULL
            </div>
            <div className="font-pixel text-[7.5px] leading-none mt-0.5"
              style={{ color: 'rgba(57,255,20,0.45)' }}>
              POINTS ONLY
            </div>
          </div>
        ) : isConvergence ? (
          (() => {
            const activeCrewCount = Math.max(0, 5 - bossPointHits);
            const isNaked         = activeCrewCount === 0;
            return (
              <div className="flex-none text-right">
                <div className="font-pixel text-[7.5px] tracking-widest leading-none"
                  style={{ color: 'rgba(57,255,20,0.60)' }}>
                  CONVERGENCE
                </div>
                <div className="font-pixel text-[15px] leading-tight"
                  style={{ color: isNaked ? '#ef4444' : '#39ff14' }}>
                  {isNaked ? '⌀ NAKED CRAPS' : `${activeCrewCount}/5 CREW`}
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
                <div className="font-pixel text-[15px] leading-tight"
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
            <div className="font-pixel text-[15px] leading-tight"
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
