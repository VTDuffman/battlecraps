// =============================================================================
// BATTLECRAPS — CREW PORTRAIT
// apps/web/src/components/CrewPortrait.tsx
//
// A single 16-bit styled crew slot in the Rail.
//
// Props:
//   slotIndex     — position (0–4), displayed as a slot number.
//   crewId        — if non-null, a crew member is in this slot.
//   crewName      — display name for label and bark.
//   cooldownState — >0 renders a cooldown overlay with remaining count.
//   isTriggering  — true while this slot is the head of the cascade queue.
//                   Plays the portrait-flash animation and shows the bark text.
//   barkSeq       — monotonic key; changing this re-triggers the bark animation
//                   even if the same crew fires twice consecutively.
//   onAnimationEnd — called when the flash animation completes so the store
//                    can dequeue and advance to the next portrait.
// =============================================================================

import React, { useEffect, useRef } from 'react';

interface CrewPortraitProps {
  slotIndex:      number;
  crewId:         number | null;
  crewName:       string | null;
  cooldownState:  number;
  isTriggering:   boolean;
  barkSeq:        number | null;   // changes → re-mounts bark element
  onAnimationEnd: () => void;
}

// ---------------------------------------------------------------------------
// Ability descriptions — shown in a tooltip on hover.
// ---------------------------------------------------------------------------

const ABILITY_DESCRIPTIONS: Record<number, string> = {
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'Occasionally swaps a 7 for the active Point number.',
  3:  'Locks a chosen die value for up to 4 rolls.',
  4:  'Active Hardway bets survive a soft-number hit.',
  5:  'The first Seven Out of a shooter refunds your Pass Line bet.',
  6:  'Grants a free Odds bet equal to your Pass Line on a Natural.',
  7:  'Doubles the Pass Line bet size when Hype > 2×.',
  8:  'Adds a flat $100 bonus to every Point Hit payout.',
  9:  'Multiplies all winning payouts by 1.2× on every roll.',
  10: 'Adds +0.2× Hype on every Natural.',
  11: 'Adds +0.3× Hype on every Point Hit.',
  12: '25% chance to add +0.5× Hype — or subtract 0.1×.',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'If all others are on cooldown, activates all of them.',
  15: 'When alone on the rail, sets a Hype floor of 2.0×.',
};

// ---------------------------------------------------------------------------
// Bark text lookup — a short flavour line per crew member ID.
// These are shown as a floating speech-bubble above the portrait.
// Add more as crew are designed; fall back to the crew name.
// ---------------------------------------------------------------------------

const BARK_LINES: Record<number, string> = {
  1:  '"Lucky!"',       // Lefty
  2:  '"Physics!"',     // Physics Professor
  3:  '"Click click."', // The Mechanic
  4:  '"Calculated."',  // The Mathlete
  5:  '"Stay up!"',     // The Floor Walker
  6:  '"Another one."', // The Regular
  7:  '"Big spender!"', // Big Spender
  8:  '"Feast!"',       // The Shark
  9:  '"1.2×!"',        // The Whale
  10: '"Uh oh…"',       // Nervous Intern
  11: '"HYPE TRAIN!"',  // Hype Train Holly
  12: '"Hic!"',         // Drunk Uncle
  13: '"Copycat!"',     // The Mimic
  14: '"I\'ve seen worse."', // Old Pro
  15: '"2× floor!"',    // Lucky Charm
};

function getBark(crewId: number | null, crewName: string | null): string {
  if (crewId !== null) {
    const line = BARK_LINES[crewId];
    if (line !== undefined) return line;
  }
  return crewName ? `"${crewName}!"` : '…';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CrewPortrait: React.FC<CrewPortraitProps> = ({
  slotIndex,
  crewId,
  crewName,
  cooldownState,
  isTriggering,
  barkSeq,
  onAnimationEnd,
}) => {
  const portraitRef = useRef<HTMLDivElement>(null);

  // When isTriggering flips true, the CSS class `animate-portrait-flash` is
  // applied. We listen for the animationend event to fire onAnimationEnd(),
  // which tells the store to dequeue this event and show the next portrait.
  useEffect(() => {
    const el = portraitRef.current;
    if (!el || !isTriggering) return;

    const handler = () => {
      onAnimationEnd();
    };
    el.addEventListener('animationend', handler, { once: true });
    return () => el.removeEventListener('animationend', handler);
  }, [isTriggering, onAnimationEnd]);

  const isEmpty  = crewId === null;
  const onCooldown = cooldownState > 0;

  return (
    <div className="group relative flex flex-col items-center gap-1 select-none">
      {/* ── Bark bubble (floats above the portrait while animating) ───────── */}
      {isTriggering && barkSeq !== null && (
        <div
          key={barkSeq}
          className="
            absolute -top-8 left-1/2 -translate-x-1/2
            whitespace-nowrap
            font-pixel text-[7px] text-white
            bg-black/80 border border-white/30
            px-1.5 py-0.5 rounded
            animate-bark-rise
            pointer-events-none z-20
          "
        >
          {getBark(crewId, crewName)}
        </div>
      )}

      {/* ── Ability tooltip (hover, non-empty slots only) ─────────────────── */}
      {!isEmpty && crewId !== null && (
        <div
          className="
            absolute bottom-full mb-2 left-1/2 -translate-x-1/2
            w-40 px-2 py-1.5 rounded
            font-mono text-[8px] text-white/90 leading-snug text-center
            bg-black/90 border border-white/20
            pointer-events-none z-30
            opacity-0 group-hover:opacity-100
            transition-opacity duration-150
          "
        >
          <div className="font-pixel text-[6px] text-gold/70 mb-1">{crewName}</div>
          {ABILITY_DESCRIPTIONS[crewId] ?? '???'}
        </div>
      )}

      {/* ── Portrait frame ────────────────────────────────────────────────── */}
      <div
        ref={portraitRef}
        className={[
          // Base: 16-bit square portrait
          'relative w-16 h-16 rounded-sm overflow-hidden',
          'border-2 transition-colors duration-150',

          // Empty slot styling
          isEmpty
            ? 'border-felt-light/40 bg-felt-dark/60'
            : 'border-gold/60 bg-felt-dark',

          // Triggering: apply the glow animation
          isTriggering
            ? 'animate-portrait-flash border-white'
            : '',

          // Cooldown: dim the portrait
          onCooldown && !isTriggering
            ? 'opacity-50 grayscale'
            : '',
        ].join(' ')}
      >
        {isEmpty ? (
          /* Empty slot — just a dashed inner ring */
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-10 h-10 rounded border border-dashed border-felt-light/30" />
          </div>
        ) : (
          /* Crew sprite placeholder — replace with actual sprite sheet in Phase 5 */
          <div className="w-full h-full flex items-center justify-center bg-felt-dark">
            <span className="font-pixel text-[8px] text-gold/80 text-center leading-tight px-1">
              {crewName?.split(' ').pop() ?? '?'}
            </span>
          </div>
        )}

        {/* Cooldown counter badge */}
        {onCooldown && (
          <div
            className="
              absolute inset-0 flex items-center justify-center
              bg-black/60
            "
          >
            <span className="font-pixel text-[10px] text-white/80">
              {cooldownState}
            </span>
          </div>
        )}
      </div>

      {/* ── Slot index label ─────────────────────────────────────────────── */}
      <span className="font-pixel text-[6px] text-felt-light/60">
        {slotIndex + 1}
      </span>
    </div>
  );
};
