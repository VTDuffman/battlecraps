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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MARKER_TARGETS } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';

interface CrewPortraitProps {
  slotIndex:      number;
  sortableId:     string;
  crewId:         number | null;
  crewName:       string | null;
  visualId:       string | null;
  cooldownState:  number;
  isTriggering:   boolean;
  barkSeq:        number | null;   // changes → re-mounts bark element
  barkCrewId:     number | null;   // when set (Mimic), use this ID for bark text lookup
  onAnimationEnd: () => void;
  /** Called after the 1-second hold-to-fire completes. Undefined = no fire button shown. */
  onFire?:        () => void;
  /** Called when the player commits a die-value lock (1–6). Only shown for The Mechanic. */
  onSetFreeze?:   (value: number) => void;
  /** Current freeze state — non-null while The Mechanic's lock is active. */
  freezeState?:   { lockedValue: number; rollsRemaining: number } | null;
}

// ---------------------------------------------------------------------------
// Ability descriptions — shown in a tooltip on hover.
//
// Additive crew (IDs that pay a floor-scaled cash bonus) are handled
// separately via CREW_ADDITIVE_MULTS + CREW_ADDITIVE_TRIGGERS so the dollar
// amount shown is computed from the current marker target at render time.
// All other crew use the static strings below.
// ---------------------------------------------------------------------------

const ABILITY_DESCRIPTIONS: Record<number, string> = {
  // ── IDs 1–15: Unlock-gated ─────────────────────────────────────────────
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'On any paired roll in the point phase, nudges both dice ±1 pip toward the active point.',
  3:  'Once per shooter: lock a die face (1–6). That die is held for up to 4 rolls, or until a Seven Out.',
  4:  'Active Hardway bets survive a soft-number hit — and earn a floor-scaled bonus when they do.',
  5:  'On Seven Out, refunds your Pass Line bet — except on the final shooter.',
  9:  'Multiplies all winning payouts by 1.2× (fires only on rolls with a positive payout).',
  10: 'Adds +0.30× Hype on every Natural.',
  11: 'Adds +0.15× Hype on every Point Hit.',
  12: '33% chance each roll: +0.5× Hype or −0.25× Hype (no Hype floor).',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'Raises the table bet ceiling from 10% to 15% of the marker target.',
  15: 'Adds +1.0× Hype on the first Seven Out per shooter; that shooter always starts at ≥2.0× Hype.',
  // ── IDs 16–30: Starter roster ──────────────────────────────────────────
  16: 'Adds +0.20× Hype whenever a 6 appears on either die.',
  19: 'Adds +0.2× Hype whenever this roll\'s total is higher than the last.',
  20: 'Adds +0.4× Hype whenever the dice repeat the same total as the last roll.',
  21: 'Adds +0.4× Hype on a Craps Out — turns the worst come-out into a crowd moment.',
  22: 'Adds +0.2× Hype whenever both dice show odd faces (1, 3, or 5).',
  26: 'Adds Hype on Point Set, scaled by difficulty: +0.3 for 4/10, +0.2 for 5/9, +0.1 for 6/8.',
  27: 'Adds +0.2× Hype on any roll totalling 7, come-out or point phase.',
};

// ---------------------------------------------------------------------------
// Additive crew — cash bonuses that scale with the current marker target.
// ADDITIVE_MULT matches the constant in each crew's execute() file.
// ---------------------------------------------------------------------------

const CREW_ADDITIVE_MULTS: Record<number, number> = {
  6:  0.75,  // The Regular
  7:  1.5,   // The Big Spender
  8:  1.25,  // The Shark
  17: 0.75,  // "Ace" McGee
  18: 0.65,  // The Close Call
  23: 1.0,   // The Even Keel
  24: 0.5,   // The Doorman
  25: 0.28,  // The Grinder
  28: 0.50,  // The Bookkeeper
  29: 1.5,   // The Pressure Cooker
  30: 0.45,  // The Contrarian
};

const CREW_ADDITIVE_TRIGGERS: Record<number, string> = {
  6:  'on every Natural',
  7:  'when a Hardway bet wins',
  8:  'on every Point Hit',
  17: 'whenever a 1 appears on either die',
  18: 'when dice show consecutive face values',
  23: 'when both dice show even faces',
  24: 'on every come-out roll',
  25: 'on every blank point-phase roll',
  28: 'on every 3rd roll of the shooter',
  29: 'after 5 consecutive blank rolls (also +0.5× Hype)',
  30: "when this roll's total is lower than the last",
};

function getAbilityDesc(crewId: number, markerTargetCents: number): string {
  const mult    = CREW_ADDITIVE_MULTS[crewId];
  const trigger = CREW_ADDITIVE_TRIGGERS[crewId];
  if (mult !== undefined && trigger !== undefined) {
    const maxBetCents  = Math.floor(markerTargetCents * 0.10);
    const amountCents  = Math.round(mult * maxBetCents / 100) * 100;
    const dollars      = amountCents / 100;
    return `Adds $${dollars} ${trigger}.`;
  }
  return ABILITY_DESCRIPTIONS[crewId] ?? '???';
}

// ---------------------------------------------------------------------------
// Bark text lookup — a short flavour line per crew member ID.
// These are shown as a floating speech-bubble above the portrait.
// Add more as crew are designed; fall back to the crew name.
// ---------------------------------------------------------------------------

const BARK_LINES: Record<number, string> = {
  // ── IDs 1–15: Unlock-gated ─────────────────────────────────────────────
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
  // ── IDs 16–30: Starter roster ──────────────────────────────────────────
  16: '"Six up!"',        // The Lookout
  17: '"Ace!"',           // "Ace" McGee
  18: '"So close!"',      // The Close Call
  19: '"Keep climbing!"', // The Momentum
  20: '"Again!"',         // The Echo
  21: '"Not so bad."',    // The Silver Lining
  22: '"Odds!"',          // The Odd Couple
  23: '"Even money."',    // The Even Keel
  24: '"Welcome back."',  // The Doorman
  25: '"Grind it out."',  // The Grinder
  26: '"Odds noted."',    // The Handicapper
  27: '"Sevens pay."',    // The Mirror
  28: '"On the books."',  // The Bookkeeper
  29: '"RELEASE!"',       // The Pressure Cooker
  30: '"Going down."',    // The Contrarian
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

// ---------------------------------------------------------------------------
// Crew emoji — one icon per crew ID, displayed in the portrait frame.
// ---------------------------------------------------------------------------

export const CREW_EMOJI: Record<number, string> = {
  // ── IDs 1–15: Unlock-gated ─────────────────────────────────────────────
  1:  '🎰', // Lefty
  2:  '🧪', // Physics Professor
  3:  '🔧', // The Mechanic
  4:  '🧮', // The Mathlete
  5:  '🪬', // The Floor Walker
  6:  '🪑', // The Regular
  7:  '💸', // Big Spender
  8:  '🦈', // The Shark
  9:  '🐋', // The Whale
  10: '🫣', // Nervous Intern
  11: '📣', // Hype Train Holly
  12: '🍺', // Drunk Uncle
  13: '👥', // The Mimic
  14: '🦯', // Old Pro
  15: '🍀', // Lucky Charm
  // ── IDs 16–30: Starter roster ──────────────────────────────────────────
  16: '🔭', // The Lookout    — +Hype when a 6 shows
  17: '🃏', // "Ace" McGee    — +$50 when a 1 shows
  18: '😬', // The Close Call — +$100 on consecutive die faces
  19: '📈', // The Momentum   — +Hype when roll total climbs
  20: '🔁', // The Echo       — +Hype on repeated total
  21: '🌤️', // The Silver Lining — +Hype on Craps Out
  22: '🎭', // The Odd Couple — +Hype when both dice odd
  23: '⚖️', // The Even Keel  — +$80 when both dice even
  24: '🚪', // The Doorman    — +$40 on every come-out
  25: '⚙️', // The Grinder    — +$30 on every blank point-phase roll
  26: '📊', // The Handicapper — +Hype on Point Set, scaled by difficulty
  27: '🪞', // The Mirror     — +Hype on any 7
  28: '📒', // The Bookkeeper — +$60 on every 3rd shooter roll
  29: '💥', // The Pressure Cooker — +Hype + floor-scaled bonus after 5 blank rolls
  30: '📉', // The Contrarian — floor-scaled bonus when roll total falls
};

// Die face Unicode characters — index 0 unused; indices 1–6 map to ⚀–⚅
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export const CrewPortrait: React.FC<CrewPortraitProps> = ({
  slotIndex,
  sortableId,
  crewId,
  crewName,
  visualId,
  cooldownState,
  isTriggering,
  barkSeq,
  barkCrewId,
  onAnimationEnd,
  onFire,
  onSetFreeze,
  freezeState,
}) => {
  const portraitRef       = useRef<HTMLDivElement>(null);
  const hype              = useGameStore((s) => s.hype);
  const isRolling         = useGameStore((s) => s.isRolling);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const markerTargetCents = MARKER_TARGETS[currentMarkerIndex] ?? 5000;

  // ── Emoji pulse tier — scales with hype, suppressed while triggering/cooldown
  const onCooldownNow = cooldownState > 0;
  const emojiPulseClass =
    isTriggering || onCooldownNow ? '' :
    hype >= 3.0 ? 'animate-emoji-blazing' :
    hype >= 2.0 ? 'animate-emoji-hot'     :
    hype >= 1.2 ? 'animate-emoji-warm'    :
    '';
  // Negative delay fast-forwards each slot into a different phase of the cycle
  // so the five portraits never pulse in unison.
  const emojiDelay = `${slotIndex * -0.37}s`;

  // ── Die picker state (The Mechanic only) ──────────────────────────────────
  const [pendingDieValue, setPendingDieValue] = useState<number | null>(null);

  // ── Hold-to-fire state ────────────────────────────────────────────────────
  const [holding, setHolding]   = useState(false);
  const holdTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = useCallback(() => {
    if (!onFire) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      onFire();
    }, 1000);
  }, [onFire]);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(false);
  }, []);

  // Cancel on unmount
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  // ── Cooldown fill tracking ─────────────────────────────────────────────────
  // We need the maximum cooldown value (= value right after firing) to compute
  // what fraction of the bar to fill. Track it in a ref so changes don't cause
  // re-renders. Reset when a different crew member is recruited into this slot.
  const maxCooldownRef = useRef(cooldownState);
  const prevCrewIdRef  = useRef(crewId);

  if (crewId !== prevCrewIdRef.current) {
    // Different crew seated — reset the tracked max for the new member
    prevCrewIdRef.current  = crewId;
    maxCooldownRef.current = cooldownState;
  }
  if (cooldownState > maxCooldownRef.current) {
    // Just fired: record the new cooldown length as the max
    maxCooldownRef.current = cooldownState;
  }

  // fillPct: 0 = just fired / empty, 1 = fully charged / ready
  const fillPct = maxCooldownRef.current > 0
    ? 1 - cooldownState / maxCooldownRef.current
    : 1; // never fired yet → show as fully charged

  // When isTriggering flips true, the CSS class `animate-portrait-flash` is
  // applied. We listen for the animationend event to fire onAnimationEnd(),
  // which tells the store to dequeue this event and show the next portrait.
  useEffect(() => {
    const el = portraitRef.current;
    if (!el || !isTriggering) return;

    const handler = (e: AnimationEvent) => {
      // Guard: only respond to the portrait-flash animation on this element.
      // The sprite child also fires animationend which bubbles — ignore those.
      if (e.target !== el) return;
      onAnimationEnd();
    };
    el.addEventListener('animationend', handler);
    return () => el.removeEventListener('animationend', handler);
  }, [isTriggering, onAnimationEnd]);

  const isEmpty  = crewId === null;
  const onCooldown = cooldownState > 0;

  // ── Drag-and-drop sortable ─────────────────────────────────────────────────
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId, disabled: isEmpty || isRolling });

  const style: React.CSSProperties = {
    transform:   CSS.Transform.toString(transform),
    transition,
    opacity:     isDragging ? 0.4 : 1,
    zIndex:      isDragging ? 50  : undefined,
    touchAction: 'none',
  };

  // Cancel any in-progress hold-to-fire the moment a drag begins — otherwise
  // the FIRE countdown can complete mid-drag and fire the crew unexpectedly.
  useEffect(() => {
    if (isDragging) cancelHold();
  }, [isDragging, cancelHold]);

  // Anchor tooltip to the near viewport edge when in an end slot so it doesn't
  // clip. Slot 0 aligns left (extends rightward); slot 4 aligns right (extends
  // leftward); middle slots center normally.
  const tooltipAlignClass =
    slotIndex === 0 ? 'left-0' :
    slotIndex === 4 ? 'right-0' :
    'left-1/2 -translate-x-1/2';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative flex flex-col items-center gap-1 select-none outline-none',
        isTriggering ? 'z-[60]' : '',
        isDragging ? 'cursor-grabbing' : isEmpty ? '' : 'cursor-grab',
      ].join(' ')}
      {...attributes}
      {...listeners}
      tabIndex={onFire ? 0 : -1}
    >
      {/* ── Bark bubble (floats above the portrait while animating) ───────── */}
      <AnimatePresence>
        {isTriggering && barkSeq !== null && (
          <motion.div
            key={barkSeq}
            initial={{ scale: 0.5, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            className="
              absolute -top-16 left-1/2 -translate-x-1/2
              whitespace-nowrap
              text-[30px] font-bold uppercase text-white drop-shadow-lg
              pointer-events-none z-20
            "
          >
            {getBark(barkCrewId ?? crewId, crewName)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ability tooltip (hover, non-empty slots only) ─────────────────── */}
      {!isEmpty && crewId !== null && (
        <div
          className={`
            absolute bottom-full mb-2 ${tooltipAlignClass}
            w-40 px-2 py-1.5 rounded
            font-mono text-[15.625px] text-white/90 leading-snug text-center
            bg-black/90 border border-white/20
            pointer-events-none z-30
            opacity-0 group-hover:opacity-100
            transition-opacity duration-150
          `}
        >
          <div className="font-pixel text-[9.375px] text-gold/70 mb-1">{crewName}</div>
          {getAbilityDesc(crewId, markerTargetCents)}
        </div>
      )}

      {/* ── Portrait frame ────────────────────────────────────────────────── */}
      <motion.div
        animate={{
          scale:  isTriggering ? 1.5 : 1,
          y:      isTriggering ? -40 : 0,
          filter: isTriggering
            ? 'drop-shadow(0px 0px 15px rgba(255,215,0,0.8))'
            : 'none',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
      <div
        ref={portraitRef}
        className={[
          // Base: 16-bit square portrait
          'relative rounded-sm overflow-hidden',
          'border-2 transition-colors duration-150',

          // Empty slot styling
          isEmpty
            ? 'border-felt-light/40 bg-felt-dark/60'
            : 'border-gold/60 bg-felt-dark',

          // Holding: red border + soft glow overrides gold
          holding
            ? 'border-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.45)]'
            : '',

          // Triggering: flash animation takes full visual control
          isTriggering
            ? 'animate-portrait-flash border-white'
            : '',

          // Ready: slow gold border pulse (suppressed while holding)
          !isEmpty && !onCooldown && !isTriggering && !holding
            ? 'animate-portrait-ready'
            : '',

          // Cooldown: dim the portrait
          onCooldown && !isTriggering
            ? 'opacity-50 grayscale'
            : '',
        ].join(' ')}
        style={{ width: 'clamp(50.6px,6.6dvh,70.4px)', height: 'clamp(50.6px,6.6dvh,70.4px)' }}
      >
        {isEmpty ? (
          /* Empty slot — just a dashed inner ring */
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-10 h-10 rounded border border-dashed border-felt-light/30" />
          </div>
        ) : (
          /* Crew icon — large emoji centered in the portrait frame. */
          <div className="w-full h-full bg-felt-dark flex items-center justify-center">
            <span
              className={`leading-none select-none ${emojiPulseClass}`}
              style={{
                fontSize:        'clamp(34.375px, 5dvh, 46.875px)',
                animationDelay:  emojiPulseClass ? emojiDelay : undefined,
              }}
            >
              {crewId !== null ? (CREW_EMOJI[crewId] ?? '?') : '?'}
            </span>
          </div>
        )}

        {/* ── Energy / charge bar ─────────────────────────────────────────
            Always rendered for seated crew. Fills upward as cooldown ticks
            down: 0% = just fired, 100% = ready to fire again.
            3px wide strip on the left edge — visible but unobtrusive.      */}
        {!isEmpty && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/40 z-10">
            <div
              className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out"
              style={{
                height: `${fillPct * 100}%`,
                background: fillPct >= 1
                  ? '#f5c842'                                       // fully charged: gold
                  : `linear-gradient(to top, #f97316, #f5c842 ${fillPct * 130}%)`, // charging: orange → gold
              }}
            />
          </div>
        )}

        {/* ── FIRE tab — persistent strip at bottom of portrait ────────────
            Always visible on occupied slots. At rest: dim red label.
            On hover: brightens. During hold: fill sweeps left-to-right
            and label reads "FIRING…". Re-mounts the fill div each hold
            so the animation always plays from 0%.                           */}
        {onFire && (
          <button
            type="button"
            aria-label={`Fire ${crewName ?? 'crew member'}`}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            className={[
              'absolute bottom-0 left-0 right-0 z-20',
              'h-[14px] overflow-hidden',
              'flex items-center justify-center',
              'font-pixel text-[9.375px] tracking-widest leading-none select-none',
              'border-t transition-all duration-150',
              // Hidden below the portrait edge at rest; slides up on hover/tap/hold.
              // overflow-hidden on the portrait frame clips it when translated out.
              holding
                ? 'translate-y-0 bg-red-800/90 text-red-100 border-red-600'
                : 'translate-y-full group-hover:translate-y-0 group-focus-within:translate-y-0 bg-red-950/85 text-red-400 border-red-800/50',
            ].join(' ')}
          >
            {holding && (
              <div
                key={String(holding)}
                className="absolute inset-0 bg-red-500/35 animate-fire-countdown"
              />
            )}
            <span className="relative z-10">
              {holding ? 'FIRING…' : 'FIRE'}
            </span>
          </button>
        )}
      </div>
      </motion.div>

      {/* ── Slot index / freeze status label ─────────────────────────────── */}
      {freezeState ? (
        <span className="font-pixel text-[9.375px] text-slate-300 leading-none">
          {DIE_FACES[freezeState.lockedValue]} ×{freezeState.rollsRemaining}
        </span>
      ) : (
        <span className="font-pixel text-[9.375px] text-felt-light/60">
          {slotIndex + 1}
        </span>
      )}

      {/* ── Die value picker (The Mechanic only, hover/tap to reveal) ───────
          Two-step: click a die face to highlight → LOCK button confirms.    */}
      {onSetFreeze && !freezeState && (
        <div
          className="
            absolute bottom-full mb-1 left-1/2 -translate-x-1/2
            opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
            transition-opacity duration-150
            pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto
            z-30
          "
        >
          <div
            className="
              bg-black/90 border border-white/20 rounded
              px-1.5 py-1 flex flex-col items-center gap-1
            "
          >
            <div className="font-pixel text-[7.8px] text-slate-400 tracking-widest">LOCK DIE</div>
            <div className="flex gap-0.5">
              {[1,2,3,4,5,6].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPendingDieValue(prev => prev === v ? null : v)}
                  className={[
                    'w-5 h-5 rounded text-[15.625px] leading-none border transition-colors',
                    pendingDieValue === v
                      ? 'bg-amber-500 border-amber-300 text-black'
                      : 'bg-stone-800 border-stone-600 text-white/80 hover:border-amber-500/60',
                  ].join(' ')}
                >
                  {DIE_FACES[v]}
                </button>
              ))}
            </div>
            {pendingDieValue !== null && (
              <button
                type="button"
                onClick={() => { onSetFreeze(pendingDieValue); setPendingDieValue(null); }}
                className="
                  w-full py-0.5 rounded
                  font-pixel text-[7.8px] tracking-wider
                  bg-amber-700 border border-amber-500 text-amber-100
                  hover:bg-amber-600 active:scale-95
                "
              >
                LOCK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
