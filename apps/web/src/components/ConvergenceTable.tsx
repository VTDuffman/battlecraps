// =============================================================================
// BATTLECRAPS — CONVERGENCE TABLE (FB-040, The Architect)
// apps/web/src/components/ConvergenceTable.tsx
//
// The Architect's tracker on the table (BossTableWell lays it out 360×250).
//   • The rooms rail: eight tiles. Rooms in force are lit with their boss's
//     sigil and a live readout (Sarge's clock, the review, the tide, the bowl,
//     the orbit, the signal, the skim, the charmed crew); the newest glows.
//     Rooms not yet built are blueprint tiles with "?" — the order is unknown.
//   • Below it, the newest room's own tracker (ROOM_TRACKERS), full width.
//     Older rooms live on as their tiles. Re-keyed per room, so a rebuilt room
//     starts fresh.
// =============================================================================

import React from 'react';
import { motion } from 'framer-motion';
import { GAUNTLET, MAX_CONVERGENCE_ROOMS, getTideStage, type BossRuleType } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { paramsOfRule } from '../lib/bossRules.js';
import { ROOM_TRACKERS } from './tableTrackers.js';
import { CREW_EMOJI } from './CrewPortrait.js';

const RAIL_H   = 58;
const BOX_H    = 250;
const ROOM_H   = BOX_H - RAIL_H - 6;
const BLUEPRINT = '#67e8f9';

const ROOM_COLOR: Partial<Record<BossRuleType, string>> = {
  EXTORTION_FEE:      '#7CFC9A',
  DOUBLE_TIME:        '#fbbf24',
  DISABLE_CREW:       '#f472b6',
  CROSS_CALIBRATION:  '#c8d8e8',
  TRIBUTE:            '#fcd34d',
  TIDAL_SURGE:        '#5eead4',
  ORBITAL_DECAY:      '#93c5fd',
  TRANSMISSION_DELAY: '#39ff14',
};
const SHORT_RATING = ['ACTION', 'BELOW', 'STRONG', 'V.STRG', 'EXCPT'] as const;

const short = (cents: number): string => {
  const d = cents / 100;
  return d >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `$${Math.round(d / 1e3)}k` : `$${Math.round(d)}`;
};

/** A room's live readout on its tile. */
function useReadout(rule: BossRuleType): string {
  return useGameStore((s) => {
    const st = s.convergenceState;
    switch (rule) {
      case 'EXTORTION_FEE':      return '−20%';
      case 'DOUBLE_TIME': {
        const limit = paramsOfRule('DOUBLE_TIME')?.rollLimit ?? 6;
        return s.phase === 'POINT_ACTIVE' ? String(Math.max(1, limit - (st?.clock ?? 0))).padStart(2, '0') : String(limit).padStart(2, '0');
      }
      case 'DISABLE_CREW':       return s.charmedCrewSlot !== null ? (CREW_EMOJI[s.crewSlots[s.charmedCrewSlot]?.crewId ?? -1] ?? '❤️') : '❤️';
      case 'CROSS_CALIBRATION':  return SHORT_RATING[s.executiveRating ?? st?.rating ?? 2] ?? 'STRONG';
      case 'TRIBUTE':            return short(s.escrowHeldCents);
      case 'TIDAL_SURGE': {
        const p = paramsOfRule('TIDAL_SURGE');
        return p ? getTideStage(p, st?.tide ?? 0).tide.replace(' TIDE', '') : '';
      }
      case 'ORBITAL_DECAY':      return `${s.hype.toFixed(2)}×`;
      case 'TRANSMISSION_DELAY': return s.signalDarkRolls > 0 ? `DARK ${s.signalDarkRolls}` : 'LAG';
      default:                   return '';
    }
  });
}

const RoomTile: React.FC<{ room: number; newest: boolean }> = ({ room, newest }) => {
  const boss  = GAUNTLET[room]?.boss;
  const rule  = boss?.rule ?? 'CONVERGENCE';
  const color = ROOM_COLOR[rule] ?? '#e5e7eb';
  const text  = useReadout(rule);
  return (
    <motion.div
      className="relative flex flex-1 flex-col items-center justify-center rounded-md"
      style={{
        background: `linear-gradient(180deg, ${color}26, rgba(0,0,0,0.6))`,
        border:     `1px solid ${color}${newest ? 'cc' : '55'}`,
        boxShadow:  newest ? `0 0 10px 2px ${color}55` : 'none',
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      title={boss?.name}
    >
      <span className="select-none leading-none" style={{ fontSize: 16 }}>{boss?.sigil ?? '?'}</span>
      <span className="mt-1 max-w-full truncate px-0.5 font-pixel text-[7px] leading-none" style={{ color }}>{text}</span>
    </motion.div>
  );
};

const BlueprintTile: React.FC = () => (
  <div
    className="flex flex-1 items-center justify-center rounded-md"
    style={{ border: `1px dashed ${BLUEPRINT}55`, background: `repeating-linear-gradient(0deg, ${BLUEPRINT}0d 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, ${BLUEPRINT}0d 0 1px, transparent 1px 8px)` }}
  >
    <span className="font-pixel text-[13px]" style={{ color: `${BLUEPRINT}66` }}>?</span>
  </div>
);

export const ConvergenceTable: React.FC = () => {
  const rooms  = useGameStore((s) => s.convergenceRooms);
  const newest = rooms[rooms.length - 1];
  const rule   = newest !== undefined ? GAUNTLET[newest]?.boss?.rule : undefined;
  const tracker = rule !== undefined ? ROOM_TRACKERS[rule] : undefined;
  const scale   = tracker ? Math.min(1, ROOM_H / tracker.height) : 1;

  return (
    <div className="flex h-full w-full flex-col" role="status" aria-label={`The Architect: ${rooms.length} of ${MAX_CONVERGENCE_ROOMS} rooms in force`}>
      {/* the rooms rail */}
      <div className="flex gap-1" style={{ height: RAIL_H }}>
        {Array.from({ length: MAX_CONVERGENCE_ROOMS }, (_, i) => {
          const room = rooms[i];
          return room !== undefined
            ? <RoomTile key={`r-${room}`} room={room} newest={i === rooms.length - 1} />
            : <BlueprintTile key={`b-${i}`} />;
        })}
      </div>

      {/* the newest room, full size */}
      <div className="relative mt-1.5 w-full" style={{ height: ROOM_H }}>
        {tracker && newest !== undefined ? (
          <motion.div
            key={`room-${newest}`}
            className="absolute left-0 top-0"
            style={{ width: `${100 / scale}%`, height: tracker.height, scale, originX: 0, originY: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <tracker.Component />
          </motion.div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg font-pixel text-[9px] tracking-widest"
            style={{ border: `1px dashed ${BLUEPRINT}55`, color: `${BLUEPRINT}88` }}>
            THE BLUEPRINT IS LOADING…
          </div>
        )}
      </div>
    </div>
  );
};
