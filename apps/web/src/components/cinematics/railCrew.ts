// =============================================================================
// BATTLECRAPS — RAIL CREW (FB-034 / FB-035)
// apps/web/src/components/cinematics/railCrew.ts
//
// Defeat cinematics that take YOUR crew (Le Prix's SHE TAKES THE CREW, the
// Executive's TERMINATED box) measure the real portraits on the crew rail so
// stand-ins can start exactly where your crew sits, then hide the rail
// portrait as its stand-in leaves (restored on unmount).
// =============================================================================

import { useGameStore } from '../../store/useGameStore.js';
import { CREW_EMOJI } from '../CrewPortrait.js';

export interface RailMember {
  /** Rail slot index. */
  slot:  number;
  emoji: string;
  /** Portrait centre + size, in viewport px. */
  x:     number;
  y:     number;
  size:  number;
  /** 0-based order among the occupied slots. */
  order: number;
}

/**
 * The occupied crew slots and where their portraits are on screen. Falls back
 * to a row near the bottom when the rail isn't visible (some Dev previews).
 */
export function measureRailCrew(): RailMember[] {
  const { crewSlots, unlockedSlots } = useGameStore.getState();
  const occupied = crewSlots.slice(0, unlockedSlots)
    .map((slot, i) => ({ slot: i, crewId: slot?.crewId ?? null }))
    .filter((m): m is { slot: number; crewId: number } => m.crewId !== null);

  return occupied.map((m, order) => {
    const el = document.querySelector(`[data-slot-index="${m.slot}"]`);
    const r  = el?.getBoundingClientRect();
    const onScreen = r !== undefined && r.width > 0;
    const size = onScreen ? r.width : 56;
    return {
      slot:  m.slot,
      emoji: CREW_EMOJI[m.crewId] ?? '?',
      x:     onScreen ? r.left + r.width / 2 : window.innerWidth * ((order + 1) / (occupied.length + 1)),
      // The wrapper's top is the portrait's top; the portrait is square.
      y:     onScreen ? r.top + r.width / 2 : window.innerHeight * 0.82,
      size,
      order,
    };
  });
}

/** Hide / show a rail portrait while its stand-in is away. */
export function setRailHidden(slot: number, hidden: boolean): void {
  const el = document.querySelector<HTMLElement>(`[data-slot-index="${slot}"]`);
  if (el) el.style.visibility = hidden ? 'hidden' : '';
}
