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
import { GAUNTLET, isBossMarker, MAX_CONVERGENCE_ROOMS, type BossRuleParams } from '@battlecraps/shared';
import { BossBarkFloat } from './BossBarkFloat.js';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';


export const BossRoomHeader: React.FC = () => {
  const currentMarkerIndex  = useGameStore(selectDisplayMarkerIndex);
  const bossPointHits       = useGameStore((s) => s.bossPointHits);
  const phase               = useGameStore((s) => s.phase);
  const roomsInForce        = useGameStore((s) => s.convergenceRooms.length);
  const currentHype         = useGameStore((s) => s.hype);

  if (!isBossMarker(currentMarkerIndex)) return null;

  const markerConfig = GAUNTLET[currentMarkerIndex];
  const boss         = markerConfig?.boss;
  if (!boss) return null;

  const theme = getFloorTheme(currentMarkerIndex);


  const isConvergence       = boss.rule === 'CONVERGENCE';

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
            className="flex-none w-[30px] h-[30px] rounded flex items-center justify-center"
            style={{
              fontSize:   '18px',
              lineHeight: 1,
              color:      theme.bossStarColor,
              background: theme.bossStarBg,
              border:     theme.bossStarBorder,
            }}
            role="img"
            aria-label={`${boss.name} sigil`}
          >
            {boss.sigil}
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
              data-boss-name-anchor=""
            >
              {boss.name.toUpperCase()}
            </div>
            {/* FB-032: generic boss bark — flashes here, then floats down-right */}
            <BossBarkFloat />
          </div>
        </div>

        {/* Right: The Architect's rooms (FB-040). Every boss's tracker is on the table (FB-042). */}
        {isConvergence ? (
          <div className="flex-none text-right">
            <div className="font-pixel text-[7.5px] tracking-widest leading-none" style={{ color: 'rgba(103,232,249,0.65)' }}>
              CONVERGENCE
            </div>
            <div className="font-pixel text-r-15 leading-tight" style={{ color: '#67e8f9' }}>
              ROOM {roomsInForce} / {MAX_CONVERGENCE_ROOMS}
            </div>
            <div className="font-pixel text-[7.5px] leading-none mt-0.5" style={{ color: 'rgba(103,232,249,0.45)' }}>
              +1 ON 7-OUT · THEY STACK
            </div>
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
