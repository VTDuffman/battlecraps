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
import { getBossMinBet, GAUNTLET, isBossMarker } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';

export const BossRoomHeader: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectDisplayMarkerIndex);
  const bossPointHits      = useGameStore((s) => s.bossPointHits);

  if (!isBossMarker(currentMarkerIndex)) return null;

  const markerConfig = GAUNTLET[currentMarkerIndex];
  const boss         = markerConfig?.boss;
  if (!boss) return null;

  const currentMinBet = getBossMinBet(currentMarkerIndex, bossPointHits);
  const nextMinBet    = getBossMinBet(currentMarkerIndex, bossPointHits + 1);

  return (
    <div
      className="w-full flex-none"
      style={{
        background: 'linear-gradient(180deg, #1a0a00 0%, #2d1200 60%, #1a0a00 100%)',
        borderBottom: '2px solid rgba(180, 30, 30, 0.6)',
        boxShadow: '0 4px 20px rgba(180, 30, 30, 0.25)',
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

        {/* Right: min-bet display */}
        {currentMinBet !== null && (
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
        )}
      </div>

      {/* Rule reminder text */}
      <div
        className="px-4 pb-2 font-pixel text-[5px] text-red-400/50 tracking-wide text-center"
      >
        {boss.rule === 'RISING_MIN_BETS' && '⚔ ANTE RISES ON POINT HIT — MIN BET HOLDS ON 7-OUT'}
        {boss.rule === 'DISABLE_CREW'    && '⚔ CREW CASCADE IS REVERSED — RIGHTMOST FIRES FIRST'}
        {boss.rule === 'FOURS_INSTANT_LOSS' && '⚔ ROLLING A TOTAL OF 4 IS INSTANT BUST'}
      </div>
    </div>
  );
};
