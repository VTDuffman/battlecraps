// =============================================================================
// BATTLECRAPS — UNLOCK RECAP PHASE (gated)
// apps/web/src/transitions/phases/UnlockRecapPhase.tsx
//
// Inserted into VICTORY, BOSS_VICTORY, and GAME_OVER sequences. Each unlocked
// crew card gets a cinematic spotlight (drops in full-size, mirrors UnlockModal)
// then snaps into a growing grid. Cards reveal in rarity order (Common → Legendary)
// so the most exciting reveals land last. Pass-through if no unlocks earned.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { motion }                              from 'framer-motion';
import type { PhaseComponentProps }            from '../types.js';
import { useGameStore }                        from '../../store/useGameStore.js';
import type { CrewRosterEntry }                from '../../store/useGameStore.js';
import { CREW_EMOJI }                          from '../../components/CrewPortrait.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_RANK: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4,
};

const SPOTLIGHT_MS = 1200; // ms card stays large before snapping
const SNAP_MS      = 350;  // snap-out animation duration
const GAP_MS       = 150;  // pause between snap finish and next spotlight

const RARITY_PALETTE: Record<string, {
  border: string; badge: string; text: string; glow: string;
}> = {
  Common:    { border: '#a8a29e', badge: '#44403c', text: '#e7e5e4', glow: 'rgba(168,162,158,0.4)'  },
  Uncommon:  { border: '#4ade80', badge: '#14532d', text: '#bbf7d0', glow: 'rgba(74,222,128,0.45)'  },
  Rare:      { border: '#60a5fa', badge: '#1e3a5f', text: '#bfdbfe', glow: 'rgba(96,165,250,0.5)'   },
  Epic:      { border: '#c084fc', badge: '#3b0764', text: '#e9d5ff', glow: 'rgba(167,139,250,0.55)' },
  Legendary: { border: '#fbbf24', badge: '#78350f', text: '#fde68a', glow: 'rgba(251,191,36,0.65)'  },
};

const DEFAULT_PALETTE = RARITY_PALETTE['Common']!;

// ---------------------------------------------------------------------------
// UnlockRecapPhase
// ---------------------------------------------------------------------------

export const UnlockRecapPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const crewUnlockedThisRun = useGameStore((s) => s.crewUnlockedThisRun);
  const crewRoster          = useGameStore((s) => s.crewRoster);
  const fetchCrewRoster     = useGameStore((s) => s.fetchCrewRoster);

  const rawIds = useRef(crewUnlockedThisRun).current;

  // Sorted ID snapshot — populated once when roster first loads.
  const sortedRef = useRef<number[] | null>(null);
  if (crewRoster !== null && sortedRef.current === null && rawIds.length > 0) {
    sortedRef.current = [...rawIds].sort((a, b) => {
      const ra = crewRoster.find((c) => c.id === a)?.rarity ?? 'Common';
      const rb = crewRoster.find((c) => c.id === b)?.rarity ?? 'Common';
      return (RARITY_RANK[ra] ?? 0) - (RARITY_RANK[rb] ?? 0);
    });
  }

  // spotlightIdx: -2 = waiting for roster | -1 = all done | 0+ = active
  const [spotlightIdx, setSpotlightIdx] = useState(-2);
  const [isSnapping,   setIsSnapping]   = useState(false);
  const [gridCount,    setGridCount]    = useState(0);
  const [showButton,   setShowButton]   = useState(false);

  // Pass-through when nothing was unlocked this run.
  useEffect(() => {
    if (rawIds.length === 0) onAdvance();
  }, [rawIds, onAdvance]);

  // Fetch roster if not yet loaded.
  useEffect(() => {
    if (crewRoster === null) void fetchCrewRoster();
  }, [crewRoster, fetchCrewRoster]);

  // Kick off sequence once sorted IDs are ready.
  useEffect(() => {
    if (crewRoster === null || sortedRef.current === null || spotlightIdx !== -2) return;
    setSpotlightIdx(0);
  }, [crewRoster, spotlightIdx]);

  // Per-card sequence: spotlight → snap → grid reveal → next card.
  useEffect(() => {
    if (spotlightIdx < 0 || sortedRef.current === null) return;
    const sorted = sortedRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setIsSnapping(true), SPOTLIGHT_MS));

    timers.push(setTimeout(() => {
      setGridCount((c) => c + 1);
      const nextIdx = spotlightIdx + 1;
      if (nextIdx < sorted.length) {
        setIsSnapping(false);
        setSpotlightIdx(nextIdx);
      } else {
        setIsSnapping(false);
        setSpotlightIdx(-1);
      }
    }, SPOTLIGHT_MS + SNAP_MS));

    return () => timers.forEach(clearTimeout);
  }, [spotlightIdx]);

  // Show the continue button once all cards have snapped into the grid.
  // Kept in its own effect so its timer isn't cancelled by the animation
  // loop's cleanup when spotlightIdx flips to -1.
  useEffect(() => {
    if (spotlightIdx !== -1) return;
    const timer = setTimeout(() => setShowButton(true), 400);
    return () => clearTimeout(timer);
  }, [spotlightIdx]);

  if (rawIds.length === 0) return null;

  // Loading state while roster is in-flight.
  if (crewRoster === null) {
    return (
      <div
        className="relative w-full max-w-lg mx-auto min-h-[100dvh] flex items-center justify-center border-x-4"
        style={{
          background:  'radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #000 65%)',
          borderColor: '#d4a017',
        }}
      >
        <p className="font-pixel text-r-8 animate-pulse" style={{ color: '#f5c842' }}>LOADING…</p>
      </div>
    );
  }

  const sorted    = sortedRef.current ?? rawIds;
  const spotlitId = spotlightIdx >= 0 && spotlightIdx < sorted.length
    ? (sorted[spotlightIdx] ?? null)
    : null;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-8
        border-x-4 overflow-hidden
      "
      style={{
        background:  'radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #000 65%)',
        borderColor: '#d4a017',
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: 'linear-gradient(90deg, #92400e, #d4a017, #92400e)' }}
      />

      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center px-6">
        <div
          className="font-pixel text-r-5 tracking-[0.4em]"
          style={{ color: 'rgba(245,200,66,0.55)' }}
        >
          THIS RUN YOU UNLOCKED
        </div>
        <div
          className="font-pixel text-r-12 tracking-wide"
          style={{ color: '#f5c842', textShadow: '0 0 20px rgba(245,200,66,0.5)' }}
        >
          NEW CREW
        </div>
      </div>

      {/* Grid — cards snap into place here one by one */}
      <div className="flex flex-wrap justify-center gap-4 px-6">
        {sorted.map((crewId, i) => {
          const inGrid  = i < gridCount;
          const entry   = crewRoster.find((c) => c.id === crewId) ?? null;
          const emoji   = CREW_EMOJI[crewId] ?? '🎰';
          const name    = entry?.name   ?? '???';
          const rarity  = entry?.rarity ?? 'Common';
          const palette = RARITY_PALETTE[rarity] ?? DEFAULT_PALETTE;
          return (
            <div
              key={crewId}
              className="transition-all duration-500 ease-out"
              style={{
                opacity:   inGrid ? 1 : 0,
                transform: inGrid ? 'translateY(0) scale(1)' : 'translateY(-20px) scale(0.8)',
              }}
            >
              <UnlockCard emoji={emoji} name={name} rarity={rarity} palette={palette} />
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-10 py-3
          font-pixel text-r-9 tracking-widest
          border-2 text-amber-100
          transition-opacity duration-500
          active:scale-95
        "
        style={{
          opacity:       showButton ? 1 : 0,
          pointerEvents: showButton ? 'auto' : 'none',
          borderColor:   '#d4a017',
          background:    'linear-gradient(180deg, rgba(26,71,49,0.8) 0%, #000 100%)',
          boxShadow:     '0 0 20px 4px rgba(212,160,23,0.3)',
        }}
      >
        ▶ CONTINUE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: 'linear-gradient(90deg, #92400e, #d4a017, #92400e)' }}
      />

      {/* Spotlight overlay — rendered above everything else */}
      {spotlitId !== null && (
        <SpotlightCard
          key={spotlightIdx}
          crewId={spotlitId}
          entry={crewRoster.find((c) => c.id === spotlitId) ?? null}
          isSnapping={isSnapping}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SpotlightCard — cinematic full-size reveal, mirrors UnlockModal
// ---------------------------------------------------------------------------

const SpotlightCard: React.FC<{
  crewId:     number;
  entry:      CrewRosterEntry | null;
  isSnapping: boolean;
}> = ({ crewId, entry, isSnapping }) => {
  const [isShaking, setIsShaking] = useState(false);

  const emoji   = CREW_EMOJI[crewId] ?? '🎰';
  const rarity  = entry?.rarity ?? 'Common';
  const name    = entry?.name   ?? '???';
  const palette = RARITY_PALETTE[rarity] ?? DEFAULT_PALETTE;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      {/* Scrim fades out during snap */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          background:         'rgba(0,0,0,0.72)',
          opacity:            isSnapping ? 0 : 1,
          transitionDuration: `${SNAP_MS}ms`,
        }}
      />

      {/* Shake wrapper (CSS) wrapping the framer-motion card */}
      <div
        className={`relative z-10 w-full max-w-sm ${isShaking ? 'animate-unlock-shake' : ''}`}
        onAnimationEnd={() => setIsShaking(false)}
      >
        <motion.div
          variants={{
            hidden:   { y: '-100vh', scale: 1,   opacity: 1 },
            visible:  { y: 0,        scale: 1,   opacity: 1 },
            snapping: { y: 60,       scale: 0.2, opacity: 0 },
          }}
          initial="hidden"
          animate={isSnapping ? 'snapping' : 'visible'}
          transition={
            isSnapping
              ? { duration: SNAP_MS / 1000, ease: 'easeIn' }
              : { type: 'spring', damping: 22, stiffness: 220 }
          }
          onAnimationComplete={(def) => {
            if (def === 'visible') setIsShaking(true);
          }}
          className="border-2 bg-black"
          style={{
            borderColor:  palette.border,
            boxShadow:    `0 0 32px ${palette.glow}, inset 0 0 60px rgba(0,0,0,0.8)`,
            borderRadius: 0,
          }}
        >
          {/* Rarity banner */}
          <div
            className="w-full py-1 text-center font-pixel text-r-7 tracking-widest"
            style={{ background: palette.badge, color: palette.text }}
          >
            {rarity.toUpperCase()} CREW UNLOCKED
          </div>

          {/* Emoji */}
          <div className="flex justify-center pt-8 pb-5">
            <span
              className="text-7xl select-none"
              style={{ filter: `drop-shadow(0 0 16px ${palette.glow})` }}
              aria-hidden
            >
              {emoji}
            </span>
          </div>

          {/* Crew name */}
          <div className="text-center px-6 pb-8">
            <p className="font-pixel text-r-10 leading-6" style={{ color: palette.text }}>
              {name}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UnlockCard — compact grid card displayed after spotlight snaps in
// ---------------------------------------------------------------------------

const UnlockCard: React.FC<{
  emoji:   string;
  name:    string;
  rarity:  string;
  palette: { border: string; badge: string; text: string; glow: string };
}> = ({ emoji, name, rarity, palette }) => (
  <div
    className="flex flex-col items-center w-28 border-2 bg-black"
    style={{ borderColor: palette.border, boxShadow: `0 0 20px ${palette.glow}` }}
  >
    {/* Rarity badge */}
    <div
      className="w-full py-0.5 text-center font-pixel text-r-5 tracking-widest"
      style={{ background: palette.badge, color: palette.text }}
    >
      {rarity.toUpperCase()}
    </div>

    {/* Emoji */}
    <div className="flex justify-center py-4">
      <span
        className="text-4xl select-none"
        style={{ filter: `drop-shadow(0 0 8px ${palette.glow})` }}
        aria-hidden
      >
        {emoji}
      </span>
    </div>

    {/* Name */}
    <div className="text-center px-2 pb-3">
      <p className="font-pixel text-r-5 leading-4" style={{ color: palette.text }}>
        {name}
      </p>
    </div>
  </div>
);
