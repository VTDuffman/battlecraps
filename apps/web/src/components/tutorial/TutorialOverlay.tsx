// =============================================================================
// BATTLECRAPS — TUTORIAL OVERLAY
// apps/web/src/components/tutorial/TutorialOverlay.tsx
//
// Outer shell for the in-world tutorial. Renders SpotlightMask + SalDialog
// above the live TableBoard. Manages the beat state machine.
//
// Advance mode implementations (T-005):
//   tap          — CTA button active immediately; user taps to advance
//   bet-passline — CTA disabled; advance fires when BettingGrid reports a
//                  Pass Line bet > 0 via TutorialContext.onBetChanged
//   bet-odds     — same, watching the odds field
//   bet-hardway  — same, watching any hard4/6/8/10 field; beat is skipable
//   manual-roll  — CTA disabled; cheat dice buffered in store; overlay watches
//                  isRolling false→true→false then waits PUCK_SETTLE_MS before
//                  advancing — player hits the real Roll button to proceed
//   animated     — CTA disabled for ANIMATED_STUB_DELAY_MS then becomes active
//                  (T-006 will replace with real hype/crew animation)
//
// Beat filtering by path:
//   FULL    → beats 1–11
//   BC_ONLY → beats 8–11 (path B only)
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TUTORIAL_BEATS }        from '../../lib/tutorialBeats.js';
import { useTutorialSpotlight }  from '../../hooks/useTutorialSpotlight.js';
import { TutorialProvider }      from '../../contexts/TutorialContext.js';
import { SpotlightMask }         from './SpotlightMask.js';
import { SalDialog }             from './SalDialog.js';
import { useGameStore }          from '../../store/useGameStore.js';
import { GAUNTLET }              from '@battlecraps/shared';
import type { BeatAdvanceMode, SpotlightZone } from '../../lib/tutorialBeats.js';
import type { BetField }         from '../../store/useGameStore.js';
import type { TutorialContextValue } from '../../contexts/TutorialContext.js';

interface TutorialOverlayProps {
  path:       'FULL' | 'BC_ONLY';
  onComplete: () => void;
  onSkip:     () => void;
  children?:  React.ReactNode;
}

// ms the CTA stays disabled for 'animated' beats (T-006 stub)
const ANIMATED_STUB_DELAY_MS = 2000;

// ms to wait after isRolling drops to false for puck slide-in to settle
const PUCK_SETTLE_MS = 500;

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  path,
  onComplete,
  onSkip,
  children,
}) => {
  const tableRef  = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Measure the container so the SVG overlay sizes correctly
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const measure = () => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filter beats by path
  const beats = TUTORIAL_BEATS.filter((b) =>
    path === 'BC_ONLY' ? b.path === 'B' : true,
  );

  const [beatIndex,          setBeatIndex]          = useState(0);
  const [waiting,            setWaiting]            = useState(false);
  const [closing,            setClosing]            = useState(false);
  const [showClosingMessage, setShowClosingMessage] = useState(false);

  // Active beat mode exposed to BettingGrid via TutorialContext
  const [activeBeatMode, setActiveBeatMode] = useState<BeatAdvanceMode | null>(null);

  // forceRollLogOpen: controlled here so the beat sync useEffect can set it
  const [forceRollLogOpen, setForceRollLogOpen] = useState(false);

  // Delayed spotlight zone — updated immediately or after spotlightDelay ms
  const [activeSpotlightZone, setActiveSpotlightZone] = useState<SpotlightZone>('none');

  const currentBeat = beats[beatIndex];

  // ── Store subscriptions for manual-roll support ──────────────────────────
  const isRolling           = useGameStore((s) => s.isRolling);
  const setTutorialCheatDice = useGameStore((s) => s.setTutorialCheatDice);

  // Tracks whether the current manual-roll beat's roll has started
  const rollStartedRef = useRef(false);

  // Sync activeBeatMode and forceRollLogOpen when beat changes
  useEffect(() => {
    if (!currentBeat) return;
    setActiveBeatMode(currentBeat.advanceMode);
    setForceRollLogOpen(currentBeat.requiresDrawer === true);
    return () => { setForceRollLogOpen(false); };
  }, [currentBeat]);

  // Sync activeSpotlightZone — delayed if beat.spotlightDelay is set
  useEffect(() => {
    if (!currentBeat) {
      setActiveSpotlightZone('none');
      return;
    }
    const zone = currentBeat.spotlight ?? 'none';
    if (currentBeat.spotlightDelay) {
      const timer = setTimeout(() => setActiveSpotlightZone(zone), currentBeat.spotlightDelay);
      return () => clearTimeout(timer);
    }
    setActiveSpotlightZone(zone);
  }, [currentBeat]);

  // ── Per-mode waiting logic ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentBeat) return;
    const mode = currentBeat.advanceMode;

    // tap: CTA immediately active
    if (mode === 'tap') {
      setWaiting(false);
      return;
    }

    // bet-* modes: CTA stays disabled; advance comes from handleBetChanged
    if (mode === 'bet-passline' || mode === 'bet-odds' || mode === 'bet-hardway') {
      setWaiting(true);
      return;
    }

    // simulated-roll: CTA stays disabled (legacy; no active beats use this)
    if (mode === 'simulated-roll') {
      setWaiting(true);
      return;
    }

    // manual-roll: CTA stays disabled; player uses the real Roll button
    if (mode === 'manual-roll') {
      setWaiting(true);
      return;
    }

    // animated (T-006 stub): hold CTA disabled for ANIMATED_STUB_DELAY_MS
    setWaiting(true);
    const timer = setTimeout(() => setWaiting(false), ANIMATED_STUB_DELAY_MS);
    return () => clearTimeout(timer);
  }, [currentBeat]);

  // ── manual-roll: buffer cheat dice on beat entry ────────────────────────
  useEffect(() => {
    if (!currentBeat || currentBeat.advanceMode !== 'manual-roll') return;
    rollStartedRef.current = false;
    const { simulatedRoll } = currentBeat;
    setTutorialCheatDice(simulatedRoll ? [simulatedRoll.die1, simulatedRoll.die2] : null);
    return () => { setTutorialCheatDice(null); };
  }, [currentBeat, setTutorialCheatDice]);

  // ── Beat advance ────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (waiting && currentBeat?.advanceMode === 'tap') return;
    if (!currentBeat) return;

    const nextIndex = beatIndex + 1;
    if (nextIndex >= beats.length) {
      void fetch('/api/v1/auth/tutorial-complete', { method: 'POST' });
      setShowClosingMessage(true);
    } else {
      setBeatIndex(nextIndex);
    }
  }, [beatIndex, beats.length, currentBeat, waiting]);

  // ── Closing message advance (fires after the true last beat) ─────────────
  const handleClosingAdvance = useCallback(() => {
    setClosing(true);
    setTimeout(() => onComplete(), 600);
  }, [onComplete]);

  // ── manual-roll: watch isRolling to auto-advance after roll settles ─────
  useEffect(() => {
    if (!currentBeat || currentBeat.advanceMode !== 'manual-roll') return;

    if (isRolling) {
      rollStartedRef.current = true;
      return;
    }

    if (!rollStartedRef.current) return; // roll hasn't started yet
    rollStartedRef.current = false;

    const timer = setTimeout(() => advance(), PUCK_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isRolling, currentBeat, advance]);

  // ── Bet-observation bridge (called by BettingGrid via TutorialContext) ──
  const handleBetChanged = useCallback((field: BetField, newAmount: number) => {
    if (!currentBeat) return;
    const mode = currentBeat.advanceMode;
    if (newAmount <= 0) return;

    if (mode === 'bet-passline' && field === 'passLine') advance();
    if (mode === 'bet-odds'     && field === 'odds')     advance();
    if (
      mode === 'bet-hardway' &&
      (field === 'hard4' || field === 'hard6' || field === 'hard8' || field === 'hard10')
    ) advance();
  }, [currentBeat, advance]);

  const contextValue: TutorialContextValue = {
    activeBeatMode,
    onBetChanged: handleBetChanged,
    forceRollLogOpen,
    setForceRollLogOpen,
  };

  // ── Spotlight ────────────────────────────────────────────────────────────
  const spotlightZone = currentBeat?.spotlight ?? 'none';
  const spotlightRect = useTutorialSpotlight(activeSpotlightZone, tableRef as React.RefObject<HTMLDivElement>);

  // ── Closing / no-beat guard ──────────────────────────────────────────────
  if (closing) {
    return (
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-600"
        style={{ opacity: 0 }}
      />
    );
  }

  // ── Closing message — shown after the true last beat of the selected path ─
  if (showClosingMessage) {
    const closingAdvanceLabel = path === 'BC_ONLY' ? "Let's Roll!" : 'To the Pub!';
    const closingSalText = path === 'BC_ONLY'
      ? "You knew craps, now you know BattleCraps. Get out there and show 'em how it's done!"
      : "You're looking good. Go to the pub to select your first crew member and get back to rollin'!";
    return (
      <TutorialProvider value={contextValue}>
        {children}
        <div
          ref={tableRef}
          className="absolute inset-0"
          style={{ zIndex: 59, pointerEvents: 'none' }}
        >
          <SalDialog
            salText={closingSalText}
            advanceLabel={closingAdvanceLabel}
            onAdvance={handleClosingAdvance}
            onSkip={() => { void fetch('/api/v1/auth/tutorial-complete', { method: 'POST' }); onSkip(); }}
            waiting={false}
            beatId={beats.length}
            totalBeats={beats.length}
            spotlightZone="none"
            isClosing={false}
          />
        </div>
      </TutorialProvider>
    );
  }

  if (!currentBeat) {
    return <div className="absolute inset-0 pointer-events-none" />;
  }

  const advanceLabel = currentBeat.advanceLabel ?? 'Got it.';

  const isBossPortrait = currentBeat.spotlight === 'boss-portrait';
  const bossConfig     = GAUNTLET[2]?.boss;

  return (
    <TutorialProvider value={contextValue}>
      {children}
      <div
        ref={tableRef}
        className="absolute inset-0"
        style={{ zIndex: 59, pointerEvents: 'none' }}
      >
        {/* Dark overlay + spotlight cut-out */}
        {!isBossPortrait && (
          <SpotlightMask
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
            rect={spotlightRect}
          />
        )}

        {/* Full dark overlay for boss portrait beat */}
        {isBossPortrait && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.82)', zIndex: 60 }}
          />
        )}

        {/* ── Boss portrait card (Beat 11) ─────────────────────────────────── */}
        {isBossPortrait && bossConfig && (
          <div
            className="absolute inset-x-4 flex items-center justify-center"
            style={{ top: '30%', zIndex: 65, pointerEvents: 'none' }}
          >
            <div
              className="rounded-lg border-2 px-6 py-5 flex flex-col items-center gap-3"
              style={{
                borderColor: 'rgba(220,38,38,0.60)',
                background:  'radial-gradient(ellipse at 50% 30%, #1a0800 0%, #0d0400 55%, #050201 100%)',
                boxShadow:   '0 0 30px 8px rgba(220,38,38,0.15)',
              }}
            >
              <div className="font-pixel text-[7px] tracking-widest text-red-400">
                END OF FLOOR 1
              </div>
              <div className="font-pixel text-2xl text-red-400">★</div>
              <div className="font-pixel text-lg tracking-widest text-red-300">
                {bossConfig.name.toUpperCase()}
              </div>
              <p className="font-dense text-[9px] text-gray-300 text-center leading-relaxed max-w-[220px]">
                {bossConfig.ruleBlurb}
              </p>
              <div className="font-pixel text-[7px] text-red-500">
                You'll meet them at the end of Floor 1.
              </div>
            </div>
          </div>
        )}

        {/* Sal dialog — always rendered above everything */}
        <SalDialog
          salText={currentBeat.salText}
          salTextMore={currentBeat.salTextMore}
          advanceLabel={advanceLabel}
          onAdvance={advance}
          onSkip={() => { void fetch('/api/v1/auth/tutorial-complete', { method: 'POST' }); onSkip(); }}
          waiting={waiting}
          skipable={currentBeat.skipable}
          beatId={currentBeat.id}
          totalBeats={beats.length}
          spotlightZone={spotlightZone}
          isClosing={closing}
        />
      </div>
    </TutorialProvider>
  );
};
