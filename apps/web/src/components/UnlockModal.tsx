// =============================================================================
// BATTLECRAPS — CINEMATIC UNLOCK MODAL
// apps/web/src/components/UnlockModal.tsx
//
// Full-screen overlay shown when a crew member is unlocked mid-game.
// Mounts when unlockModalReady && unacknowledgedUnlocks.length > 0.
// Drops in from y: -100vh via framer-motion spring, then triggers a CSS
// screen-shake on landing. "Got It" calls acknowledgeUnlock() to drain
// the queue one-by-one.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { CREW_EMOJI } from './CrewPortrait.js';

// ---------------------------------------------------------------------------
// Rarity colour palette — matches PubScreen.tsx RARITY_STYLES
// ---------------------------------------------------------------------------

const RARITY_PALETTE: Record<string, {
  border: string;
  glow:   string;
  badge:  string;
  text:   string;
}> = {
  Common:    { border: 'border-stone-400',  glow: 'shadow-[0_0_24px_rgba(168,162,158,0.4)]', badge: 'bg-stone-700 text-stone-300',   text: 'text-stone-200'  },
  Uncommon:  { border: 'border-green-400',  glow: 'shadow-[0_0_24px_rgba(74,222,128,0.45)]',  badge: 'bg-green-900 text-green-300',   text: 'text-green-200'  },
  Rare:      { border: 'border-blue-400',   glow: 'shadow-[0_0_24px_rgba(96,165,250,0.5)]',   badge: 'bg-blue-900 text-blue-300',     text: 'text-blue-200'   },
  Epic:      { border: 'border-purple-400', glow: 'shadow-[0_0_28px_rgba(167,139,250,0.55)]', badge: 'bg-purple-900 text-purple-300', text: 'text-purple-200' },
  Legendary: { border: 'border-amber-400',  glow: 'shadow-[0_0_32px_rgba(251,191,36,0.65)]',  badge: 'bg-amber-900 text-amber-300',   text: 'text-amber-200'  },
};

const DEFAULT_PALETTE = RARITY_PALETTE['Common']!;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UnlockModal: React.FC = () => {
  const unacknowledgedUnlocks = useGameStore((s) => s.unacknowledgedUnlocks);
  const unlockModalReady      = useGameStore((s) => s.unlockModalReady);
  const activeTransition      = useGameStore((s) => s.activeTransition);
  const crewRoster            = useGameStore((s) => s.crewRoster);
  const acknowledgeUnlock     = useGameStore((s) => s.acknowledgeUnlock);
  const fetchCrewRoster       = useGameStore((s) => s.fetchCrewRoster);

  const [isShaking, setIsShaking] = useState(false);

  const crewId  = unacknowledgedUnlocks[0];
  // Suppress during boss sequences — the unlock arrived late from the server and
  // should not interrupt the dread intro or victory celebration. clearTransition()
  // re-sets unlockModalReady after these transitions complete.
  const suppressed = activeTransition === 'BOSS_ENTRY' || activeTransition === 'BOSS_VICTORY';
  const visible = unlockModalReady && crewId !== undefined && !suppressed;

  // Pre-fetch roster so modal has crew data (covers mid-game and resume paths).
  useEffect(() => {
    if (visible && crewRoster === null) {
      void fetchCrewRoster();
    }
  }, [visible, crewRoster, fetchCrewRoster]);

  // Reset shake state whenever a new crew ID appears in position 0.
  useEffect(() => {
    setIsShaking(false);
  }, [crewId]);

  if (!visible || crewId === undefined) return null;

  const crewEntry        = crewRoster?.find((c) => c.id === crewId) ?? null;
  const emoji            = CREW_EMOJI[crewId] ?? '🎰';
  const name             = crewEntry?.name ?? '???';
  const rarity           = crewEntry?.rarity ?? 'Common';
  const unlockCondition  = crewEntry?.unlockDescription || null;
  const quote            = crewEntry?.unlockQuote || null;
  const briefDescription = crewEntry?.briefDescription || null;
  const palette          = RARITY_PALETTE[rarity] ?? DEFAULT_PALETTE;

  const handleAnimationComplete = (definition: string) => {
    if (definition === 'visible') setIsShaking(true);
  };

  const handleGotIt = () => {
    void acknowledgeUnlock(crewId);
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9990] bg-black/75" />

      {/* Centred card wrapper */}
      <div className="fixed inset-0 z-[9991] flex items-center justify-center pointer-events-none px-4">
        <motion.div
          key={`unlock-card-${crewId}`}
          variants={{
            hidden:  { y: '-100vh' },
            visible: { y: 0 },
          }}
          initial="hidden"
          animate="visible"
          transition={{ type: 'spring', damping: 22, stiffness: 220 }}
          onAnimationComplete={handleAnimationComplete}
          className={[
            'pointer-events-auto',
            'relative w-full max-w-sm',
            'bg-black border-2',
            palette.border,
            palette.glow,
            isShaking ? 'animate-unlock-shake' : '',
          ].join(' ')}
          style={{ borderRadius: 0 }}
        >
          {/* Rarity banner */}
          <div className={`w-full py-1 text-center font-pixel text-[7px] tracking-widest ${palette.badge}`}>
            {rarity.toUpperCase()} CREW UNLOCKED
          </div>

          {/* Unlock condition — what the player did to earn this */}
          {unlockCondition ? (
            <div className="px-6 pt-3 pb-1">
              <p className="font-mono text-[10px] text-white/45 text-center leading-4">
                {unlockCondition}
              </p>
            </div>
          ) : crewRoster === null ? (
            <div className="px-6 pt-3 pb-1">
              <p className="font-mono text-[10px] text-white/25 text-center animate-pulse">
                Loading…
              </p>
            </div>
          ) : null}

          {/* Emoji */}
          <div className="flex justify-center pt-5 pb-4">
            <span
              className="text-7xl select-none"
              style={{ filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.3))' }}
              aria-hidden
            >
              {emoji}
            </span>
          </div>

          {/* Crew name */}
          <div className="text-center px-6 pb-3">
            <p className={`font-pixel text-[10px] leading-6 ${palette.text}`}>
              {name}
            </p>
          </div>

          {/* Character quote — in the crew member's own voice */}
          {quote && (
            <div className="px-6 pb-4">
              <p className="font-mono text-[11px] text-white/70 text-center leading-5 italic">
                "{quote}"
              </p>
            </div>
          )}

          {/* Divider + ability description */}
          {briefDescription && (
            <>
              <div className="mx-6 border-t border-white/10 mb-3" />
              <div className="px-6 pb-5">
                <p className="font-mono text-[9px] text-white/40 tracking-widest uppercase mb-1 text-center">
                  Description
                </p>
                <p className="font-mono text-[11px] text-white/60 text-center leading-5">
                  {briefDescription}
                </p>
              </div>
            </>
          )}

          {/* Got It button */}
          <div className="flex justify-center pb-6">
            <button
              type="button"
              onClick={handleGotIt}
              className="
                px-8 py-2
                font-pixel text-[8px] tracking-widest
                bg-gold text-black
                border-2 border-gold-bright
                hover:bg-gold-bright active:scale-95
                transition-all duration-75
                shadow-[0_0_12px_rgba(212,160,23,0.5)]
                hover:shadow-[0_0_20px_rgba(245,200,66,0.7)]
              "
              style={{ borderRadius: 0 }}
            >
              GOT IT
            </button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body,
  );
};
