// =============================================================================
// BATTLECRAPS — COMP CARD FAN
// apps/web/src/components/CompCardFan.tsx
//
// Casino comp card stack displayed in the top-left corner of the board.
// Cards are earned by defeating bosses and fan open on tap to reveal details.
//
// Earned comps are derived from currentMarkerIndex thresholds — no API needed:
//   >= 3 → Sarge defeated      → Member's Jacket (+1 Shooter per segment)
//   >= 6 → Mme. Le Prix beaten → Sea Legs       (Hype resets to 50% not zero)
//   >= 9 → The Executive down  → Golden Touch   (Guaranteed first Natural)
//
// Animation: newly earned cards play animate-comp-deal-in (slide from top-left
// with rotation + spring overshoot). Only NEW cards animate — existing cards
// are already in place when the component mounts or re-renders.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, selectDisplayMarkerIndex, type GameState } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Comp definitions
// ---------------------------------------------------------------------------

interface CompDef {
  perkId:      number;
  threshold:   number;   // currentMarkerIndex must be >= this to have earned it
  name:        string;
  icon:        string;
  effect:      string;
  accentColor: string;
}

const COMP_DEFS: CompDef[] = [
  {
    perkId:      1,
    threshold:   3,
    name:        "Member's Jacket",
    icon:        '🪖',
    effect:      '+1 Shooter granted at each segment reset. Defeat Sarge reward.',
    accentColor: '#d4891a',  // amber — VFW Hall floor
  },
  {
    perkId:      2,
    threshold:   6,
    name:        'Sea Legs',
    icon:        '⚓',
    effect:      'Hype resets to 50% on Seven Out instead of zeroing. Mme. Le Prix reward.',
    accentColor: '#0d9488',  // teal — Riverboat floor
  },
  {
    perkId:      3,
    threshold:   9,
    name:        'Golden Touch',
    icon:        '👑',
    effect:      'Guaranteed Natural on the first come-out of each segment. The Executive reward.',
    accentColor: '#f5c842',  // gold — The Strip floor
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CompCardFan: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectDisplayMarkerIndex);

  const earnedComps = COMP_DEFS.filter((c) => currentMarkerIndex >= c.threshold);

  const [isOpen,     setIsOpen]     = useState(false);
  const [dealingIn,  setDealingIn]  = useState<number | null>(null);

  // Track previous count to trigger deal-in animation only on newly earned cards.
  const prevCountRef = useRef(earnedComps.length);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = earnedComps.length;

    if (curr > prev) {
      // A new card was just earned — animate it in (index = curr - 1)
      setDealingIn(curr - 1);
    }

    prevCountRef.current = curr;
  }, [earnedComps.length]);

  // Nothing to show yet.
  if (earnedComps.length === 0) return null;

  return (
    // Absolute within the board container; clears the mute button (top-2 left-2 ~ 32px + padding)
    <div className="absolute top-12 left-2 z-50 select-none">
      {/* ── Tap-outside backdrop ─────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Card stack container ─────────────────────────────────────────────── */}
      {/* Height just matches a single card so absolute children can overflow down */}
      <div
        className="relative w-[58px] h-[76px] cursor-pointer"
        onClick={() => setIsOpen((o) => !o)}
      >
        {earnedComps.map((comp, i) => (
          <div
            key={comp.perkId}
            className={[
              'group absolute inset-0 rounded-sm',
              'border-2 border-gold/60',
              'bg-[#fdf6e3]',
              'flex flex-col items-center overflow-hidden',
              'transition-transform duration-300 ease-out',
              'shadow-[2px_2px_8px_rgba(0,0,0,0.55)]',
              dealingIn === i ? 'animate-comp-deal-in' : '',
            ].join(' ')}
            style={{
              // Closed: slight fan (back cards peep out); Open: spread downward
              transform: isOpen
                ? `translateY(${i * 86}px) rotate(0deg)`
                : `translateY(${i * 2}px) rotate(${(i - 1) * 5}deg)`,
              transitionDelay: isOpen
                ? `${i * 70}ms`
                : `${(earnedComps.length - 1 - i) * 50}ms`,
              // Front card on top when closed; top card on top when open
              zIndex: isOpen ? earnedComps.length - i : i + 1,
            }}
            onAnimationEnd={() => {
              if (dealingIn === i) setDealingIn(null);
            }}
          >
            {/* ── Accent strip (floor colour) ────────────────────────────── */}
            <div
              className="w-full h-[5px] flex-none"
              style={{ background: comp.accentColor }}
            />

            {/* ── Icon ──────────────────────────────────────────────────── */}
            <div className="text-[20px] leading-none mt-1">{comp.icon}</div>

            {/* ── COMP stamp ─────────────────────────────────────────────── */}
            <div
              className="font-pixel text-xs tracking-widest mt-0.5 leading-none"
              style={{ color: 'rgba(0,0,0,0.35)' }}
            >
              COMP
            </div>

            {/* ── Card name ──────────────────────────────────────────────── */}
            <div
              className="font-pixel text-xs text-center leading-tight px-0.5 mt-0.5"
              style={{ color: 'rgba(0,0,0,0.75)' }}
            >
              {comp.name}
            </div>

            {/* ── Tooltip (visible only when fan is open, on hover/tap) ─── */}
            {isOpen && (
              <div
                className="
                  absolute left-full ml-2 top-0
                  w-36 px-2 py-1.5 rounded
                  font-dense text-xs text-white leading-snug
                  bg-black/90 border border-white/20
                  pointer-events-none z-50
                  opacity-0 group-hover:opacity-100
                  transition-opacity duration-150
                "
              >
                <div
                  className="font-pixel text-xs mb-1 tracking-widest"
                  style={{ color: comp.accentColor }}
                >
                  {comp.name.toUpperCase()}
                </div>
                {comp.effect}
              </div>
            )}
          </div>
        ))}

        {/* ── "COMPS" label below the stack ──────────────────────────────── */}
        {!isOpen && (
          <div
            className="
              absolute left-1/2 -translate-x-1/2
              font-pixel text-xs text-gold-dim whitespace-nowrap tracking-widest
            "
            style={{ top: `calc(76px + ${(earnedComps.length - 1) * 2 + 6}px)` }}
          >
            COMPS
          </div>
        )}
      </div>
    </div>
  );
};
