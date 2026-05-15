// =============================================================================
// BATTLECRAPS — BOSS ROOM HEADER
// apps/web/src/components/BossRoomHeader.tsx
//
// A persistent banner rendered at the top of the TableBoard during a boss
// fight. Shows the boss name, active rule, and the current minimum Pass Line
// bet with a rising indicator.
//
// Visual tone: military olive / red-alert — honor with dread.
// =============================================================================

import React from 'react';
import { getBossMinBet, GAUNTLET, isBossMarker, type BossRuleParams } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';

export const BossRoomHeader: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectDisplayMarkerIndex);
  const bossPointHits      = useGameStore((s) => s.bossPointHits);
  const currentHype        = useGameStore((s) => s.hype);

  if (!isBossMarker(currentMarkerIndex)) return null;

  const markerConfig = GAUNTLET[currentMarkerIndex];
  const boss         = markerConfig?.boss;
  if (!boss) return null;

  const currentMinBet = getBossMinBet(currentMarkerIndex, bossPointHits);
  const nextMinBet    = getBossMinBet(currentMarkerIndex, bossPointHits + 1);

  const isTidalSurge   = boss.rule === 'TIDAL_SURGE';
  const isOrbitalDecay = boss.rule === 'ORBITAL_DECAY';
  const isFirstContact = boss.rule === 'FIRST_CONTACT_PROTOCOL';
  const tidalParams = isTidalSurge
    ? (boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>)
    : null;
  const tidePos          = bossPointHits;
  const inSurge          = tidalParams !== null && tidePos >= tidalParams.cycleLength;
  const rollsUntilSurge  = tidalParams !== null && !inSurge ? tidalParams.cycleLength - tidePos : 0;
  const surgeRollsLeft   = tidalParams !== null && inSurge
    ? (tidalParams.cycleLength + tidalParams.surgeDuration) - tidePos
    : 0;
  const surgeMinDollars  = tidalParams !== null && markerConfig !== undefined
    ? Math.ceil(markerConfig.targetCents * tidalParams.surgePct / 100)
    : 0;

  return (
    <div
      className="w-full flex-none"
      style={{
        background: 'linear-gradient(180deg, #1a0a00 0%, #2d1200 60%, #1a0a00 100%)',
        borderBottom: '2px solid rgba(180, 30, 30, 0.6)',
        boxShadow: '0 4px 20px rgba(180, 30, 30, 0.25)',
        // isolation: isolate prevents GPU compositing cascade from dice
        // animation causing a white flash in this region (KI-012)
        isolation: 'isolate',
      }}
    >
      {/* Red alert bar */}
      <div
        className="h-0.5 w-full"
        style={{
          background: 'linear-gradient(90deg, transparent, #b91c1c 30%, #ef4444 50%, #b91c1c 70%, transparent)',
        }}
      />

      <div className="px-4 py-2 flex items-center justify-between gap-2">
        {/* Left: boss identity */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex-none w-5 h-5 rounded flex items-center justify-center font-pixel text-[8px]"
            style={{ background: 'rgba(185,28,28,0.5)', border: '1px solid rgba(239,68,68,0.6)' }}
          >
            ★
          </div>
          <div className="min-w-0">
            <div className="font-pixel text-[5px] text-red-400/80 tracking-widest leading-none">
              HIGH LIMIT ROOM
            </div>
            <div className="font-pixel text-[8px] text-red-200 leading-tight truncate">
              {boss.name.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Right: tide counter (TIDAL_SURGE) or min-bet display (RISING_MIN_BETS) */}
        {isTidalSurge && tidalParams !== null ? (
          <div className="flex-none text-right">
            {/* Label row */}
            <div className="font-pixel text-[5px] tracking-widest leading-none"
              style={{ color: inSurge ? '#fbbf24' : 'rgba(0,201,160,0.70)' }}>
              TIDE{inSurge ? ' ⚠ SURGE' : ''}
            </div>
            {/* Pip row: cycleLength normal pips + surgeDuration surge pips */}
            <div className="flex gap-0.5 mt-0.5 justify-end">
              {Array.from({ length: tidalParams.cycleLength + tidalParams.surgeDuration }).map((_, i) => {
                const isSurgePip = i >= tidalParams.cycleLength;
                const isCurrent  = i === tidePos % (tidalParams.cycleLength + tidalParams.surgeDuration);
                return (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      background: isCurrent
                        ? (isSurgePip ? '#fbbf24' : '#00c9a0')
                        : isSurgePip
                          ? 'rgba(251,191,36,0.25)'
                          : 'rgba(0,201,160,0.20)',
                      border: isCurrent
                        ? `1px solid ${isSurgePip ? '#f59e0b' : '#00c9a0'}`
                        : '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                );
              })}
            </div>
            {/* Status line */}
            {inSurge ? (
              <div className="font-pixel text-[5px] leading-none mt-0.5"
                style={{ color: '#fbbf24' }}>
                ${surgeMinDollars.toLocaleString()} MIN / {surgeRollsLeft} ROLL{surgeRollsLeft !== 1 ? 'S' : ''}
              </div>
            ) : (
              <div className="font-pixel text-[5px] leading-none mt-0.5"
                style={{ color: 'rgba(0,201,160,0.55)' }}>
                SURGE IN {rollsUntilSurge}
              </div>
            )}
          </div>
        ) : isFirstContact ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[5px] tracking-widest leading-none"
              style={{ color: 'rgba(57,255,20,0.60)' }}>
              NULL PROTOCOL
            </div>
            <div className="font-pixel text-[8px] leading-tight"
              style={{ color: '#39ff14' }}>
              7/11 = NULL
            </div>
            <div className="font-pixel text-[5px] leading-none mt-0.5"
              style={{ color: 'rgba(57,255,20,0.45)' }}>
              POINTS ONLY
            </div>
          </div>
        ) : isOrbitalDecay ? (
          (() => {
            const hypeStr    = currentHype.toFixed(2) + '×';
            const isBelow1   = currentHype < 1.0;
            const isWarning  = currentHype < 1.25 && currentHype >= 1.0;
            const hypeColor  = isBelow1 ? '#ef4444' : isWarning ? '#fbbf24' : '#c8d8e8';
            return (
              <div className="flex-none text-right">
                <div className="font-pixel text-[5px] tracking-widest leading-none"
                  style={{ color: 'rgba(200,216,232,0.60)' }}>
                  HYPE DECAY
                </div>
                <div className="font-pixel text-[10px] leading-tight"
                  style={{ color: hypeColor }}>
                  {hypeStr}
                </div>
                <div className="font-pixel text-[5px] leading-none mt-0.5"
                  style={{ color: isBelow1 ? '#ef4444' : 'rgba(200,216,232,0.45)' }}>
                  {isBelow1 ? '⚠ PENALTY MODE' : '−0.5× ON 7-OUT'}
                </div>
              </div>
            );
          })()
        ) : currentMinBet !== null ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[5px] text-red-400/70 tracking-widest leading-none">
              MIN BET
            </div>
            <div className="font-pixel text-[10px] text-red-300 leading-tight">
              ${(currentMinBet / 100).toFixed(0)}
            </div>
            {nextMinBet !== null && nextMinBet > currentMinBet && (
              <div className="font-pixel text-[5px] text-red-500/60 leading-none">
                → ${(nextMinBet / 100).toFixed(0)} next
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Rule reminder text */}
      <div
        className="px-4 pb-2 font-pixel text-[5px] text-red-400/50 tracking-wide text-center"
      >
        ⚔ {boss.ruleHeaderText}
      </div>
    </div>
  );
};
