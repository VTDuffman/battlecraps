// =============================================================================
// BATTLECRAPS — TABLE BOARD
// apps/web/src/components/TableBoard.tsx
//
// Top-down casino table layout. Three visual bands stacked vertically:
//
//   ┌─────────────────────────────────────┐
//   │  BETTING GRID (Pass, Odds, Hardways)│  ← top half
//   ├─────────────────────────────────────┤
//   │  DICE ZONE (point puck / roll btn)  │  ← centre
//   ├─────────────────────────────────────┤
//   │  RAIL — 5× CrewPortrait slots       │  ← bottom
//   └─────────────────────────────────────┘
//
// The cascade animation state is threaded through from the Zustand store.
// Each CrewPortrait receives an `isTriggering` prop that is true only when it
// is the HEAD of the cascadeQueue. When the flash animation ends, the portrait
// calls `dequeueEvent()` to advance to the next crew in the sequence.
// =============================================================================

import React, { useCallback } from 'react';
import {
  useGameStore,
  selectActiveSlot,
  selectActiveBark,
} from '../store/useGameStore.js';
import { BettingGrid }   from './BettingGrid.js';
import { DiceZone }      from './DiceZone.js';
import { CrewPortrait }  from './CrewPortrait.js';
import { RollLog }       from './RollLog.js';

export const TableBoard: React.FC = () => {
  const crewSlots    = useGameStore((s) => s.crewSlots);
  const activeSlot   = useGameStore(selectActiveSlot);
  const activeBark   = useGameStore(selectActiveBark);
  const dequeueEvent = useGameStore((s) => s.dequeueEvent);
  const socketStatus = useGameStore((s) => s.socketStatus);

  // Stable callback passed to every portrait. The portrait that is currently
  // animating will call this; portraits that are not triggering never fire it.
  const handleAnimationEnd = useCallback(() => {
    dequeueEvent();
  }, [dequeueEvent]);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto
        min-h-screen flex flex-col
        bg-felt-texture
        border-x-4 border-gold/30
        overflow-hidden
      "
    >
      {/* ── Connection status badge ───────────────────────────────────────── */}
      <StatusBadge status={socketStatus} />

      {/* ── BETTING GRID ─────────────────────────────────────────────────── */}
      <section
        aria-label="Betting Grid"
        className="
          flex-none
          px-4 pt-4 pb-3
          border-b-2 border-gold/20
        "
      >
        {/* Decorative header */}
        <div className="text-center mb-3">
          <h1 className="font-pixel text-[8px] text-gold tracking-widest">
            BATTLECRAPS
          </h1>
          <div className="mt-1 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>

        <BettingGrid />
      </section>

      {/* ── DICE ZONE ────────────────────────────────────────────────────── */}
      <section
        aria-label="Dice Zone"
        className="
          flex-1
          flex flex-col items-center justify-center
          px-4
          border-b-2 border-gold/20
        "
      >
        <DiceZone />
      </section>

      {/* ── QA TRANSACTION LOG ───────────────────────────────────────────── */}
      <RollLog />

      {/* ── CREW RAIL ────────────────────────────────────────────────────── */}
      <section
        aria-label="Crew Rail"
        className="
          flex-none
          px-4 py-3
          bg-felt-rail
          border-t-4 border-gold/30
        "
      >
        {/* Rail header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-px flex-1 bg-gold/20" />
          <span className="font-pixel text-[6px] text-gold/50 tracking-widest">
            CREW
          </span>
          <div className="h-px flex-1 bg-gold/20" />
        </div>

        {/* Five portrait slots */}
        <div className="flex justify-around items-end gap-1">
          {crewSlots.map((slot, i) => (
            <CrewPortrait
              key={i}
              slotIndex={i}
              crewId={slot?.crewId ?? null}
              crewName={crewNameFromId(slot?.crewId ?? null)}
              cooldownState={slot?.cooldownState ?? 0}
              isTriggering={activeSlot === i}
              barkSeq={activeSlot === i ? (activeBark?.seq ?? null) : null}
              onAnimationEnd={handleAnimationEnd}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Socket status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  disconnected: 'bg-red-900/80   text-red-300',
  connecting:   'bg-yellow-900/80 text-yellow-300',
  connected:    'bg-blue-900/80  text-blue-300',
  subscribed:   'bg-green-900/80 text-green-300',
  error:        'bg-red-900/80   text-red-300',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <div
    className={[
      'absolute top-2 right-2 z-10',
      'flex items-center gap-1',
      'px-1.5 py-0.5 rounded',
      'font-pixel text-[5px]',
      STATUS_STYLES[status] ?? 'bg-gray-900 text-gray-400',
    ].join(' ')}
  >
    <div
      className={[
        'w-1.5 h-1.5 rounded-full',
        status === 'subscribed' ? 'bg-green-400 animate-pulse' :
        status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
        'bg-current',
      ].join(' ')}
    />
    {status.toUpperCase()}
  </div>
);

// ---------------------------------------------------------------------------
// Crew name lookup (mirrors the crew IDs in the shared package)
// A proper implementation would read this from the run's crew definitions.
// ---------------------------------------------------------------------------

const CREW_NAMES: Record<number, string> = {
  1:  '"Lefty" McGuffin',
  2:  'Physics Prof',
  3:  'The Mechanic',
  4:  'The Mathlete',
  5:  'Floor Walker',
  6:  'The Regular',
  7:  'Big Spender',
  8:  'The Shark',
  9:  'The Whale',
  10: 'Nervous Intern',
  11: 'Holly (Hype)',
  12: 'Drunk Uncle',
  13: 'The Mimic',
  14: 'Old Pro',
  15: 'Lucky Charm',
};

function crewNameFromId(crewId: number | null): string | null {
  if (crewId === null) return null;
  return CREW_NAMES[crewId] ?? `Crew #${crewId}`;
}
