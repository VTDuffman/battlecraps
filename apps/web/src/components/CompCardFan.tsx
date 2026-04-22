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

import React, { useEffect, useState } from 'react';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { COMP_DEFS, CompCard }                    from './CompCard.js';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CompCardFan: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectDisplayMarkerIndex);
  const seenCompCount      = useGameStore((s) => s.seenCompCount);
  const markCompsAnimated  = useGameStore((s) => s.markCompsAnimated);

  const earnedComps = COMP_DEFS.filter((c) => currentMarkerIndex >= c.threshold);

  const [isOpen,    setIsOpen]    = useState(false);
  const [dealingIn, setDealingIn] = useState<number | null>(null);

  // On mount (and whenever earnedComps.length changes): if there are more
  // earned comps than the store has seen, the newest card is new and should
  // animate. Using the store value (not a local ref) means this survives the
  // component unmount that happens during the boss victory transition.
  useEffect(() => {
    if (earnedComps.length > seenCompCount) {
      setDealingIn(earnedComps.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              if (dealingIn === i) {
                setDealingIn(null);
                markCompsAnimated(earnedComps.length);
              }
            }}
          >
            <CompCard
              variant="fan"
              name={comp.name}
              icon={comp.icon}
              effect={comp.effect}
              accentColor={comp.accentColor}
              showTooltip={isOpen}
            />
          </div>
        ))}

        {/* ── "COMPS" label below the stack ──────────────────────────────── */}
        {!isOpen && (
          <div
            className="
              absolute left-1/2 -translate-x-1/2
              font-pixel text-[5px] text-gold/60 whitespace-nowrap tracking-widest
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
