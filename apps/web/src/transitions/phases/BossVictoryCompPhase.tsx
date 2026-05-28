// =============================================================================
// BATTLECRAPS — BOSS VICTORY COMP PHASE (gated)
// apps/web/src/transitions/phases/BossVictoryCompPhase.tsx
//
// Second phase of the BOSS_VICTORY transition. Shown after BossVictoryPhase
// (the defeat announcement auto-phase). This is the ceremonial comp reveal —
// what the player EARNED for surviving the High Limit Room.
//
// Shows:
//   • "FOR VALOR IN THE HIGH LIMIT ROOM" header
//   • Comp award badge with reward name and description
//   • "COLLECT & VISIT THE PUB" CTA
//
// Reads from celebrationSnapshot (not live store) to preserve the boss identity
// for the correct defeated marker, not the already-incremented next marker.
// =============================================================================

import React, { useState, useEffect } from 'react';
import type { PhaseComponentProps }    from '../types.js';
import { useGameStore }                from '../../store/useGameStore.js';
import { GAUNTLET }                    from '@battlecraps/shared';
import { getFloorTheme }               from '../../lib/floorThemes.js';
import { CompCard, getCompForBossMarker } from '../../components/CompCard.js';

/** True for the two slot-unlock comps — display a reveal screen, not a CompCard fan. */
function isSlotUnlock(reward: string | undefined): boolean {
  return reward === 'BOARD_SEAT' || reward === 'CARGO_HOLD';
}

export const BossVictoryCompPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  const boss     = snapshot ? GAUNTLET[snapshot.markerIndex]?.boss : undefined;
  const theme    = snapshot ? getFloorTheme(snapshot.markerIndex) : null;
  const compDef  = snapshot ? getCompForBossMarker(snapshot.markerIndex) : undefined;

  const [showCard,   setShowCard]   = useState(false);
  const [showButton, setShowButton] = useState(false);

  // Floor 9 (compReward === 'NONE'): skip the comp screen entirely.
  // onAdvance() must be called in an effect — not during render.
  useEffect(() => {
    if (boss?.compReward === 'NONE') {
      onAdvance();
    }
  }, [boss?.compReward, onAdvance]);

  // Timed reveal: content at 600ms, button at 1400ms.
  // Applies to both normal comps AND slot-unlock comps — same pacing.
  useEffect(() => {
    if (!boss || boss.compReward === 'NONE') return;
    const t1 = setTimeout(() => setShowCard(true),   600);
    const t2 = setTimeout(() => setShowButton(true), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [boss]);

  if (!boss || !theme || boss.compReward === 'NONE') return null;

  // ── Slot-unlock branch (BOARD_SEAT / CARGO_HOLD) ─────────────────────────
  // Skip the CompCard fan; show a full-screen slot unlock reveal instead.
  if (isSlotUnlock(boss.compReward)) {
    const slotNumber = boss.compReward === 'BOARD_SEAT' ? 4 : 5;
    return (
      <div
        className="
          relative w-full max-w-lg mx-auto min-h-[100dvh]
          flex flex-col items-center justify-center gap-6
          border-x-4
          overflow-hidden
        "
        style={{
          background:  theme.bossBg,
          borderColor: theme.bossBorderColor,
        }}
      >
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: theme.bossAccentBar }} />
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: theme.bossGlow }} />

        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center px-8">
          <div className="font-pixel font-normal text-[7.59375px] tracking-[0.35em]" style={{ color: `${theme.bossTextColor}70` }}>
            FOR VALOR IN THE HIGH LIMIT ROOM
          </div>
          <div className="font-pixel text-[16.70625px] tracking-widest" style={{ color: `${theme.bossTextColor}b0` }}>
            {boss.name.toUpperCase()} — DEFEATED
          </div>
        </div>

        {/* Slot unlock reveal — drops in after header */}
        {showCard && (
          <div
            className="
              flex flex-col items-center gap-3 px-8 text-center
              animate-comp-deal-in
            "
          >
            {/* Slot count indicator */}
            <div className="flex gap-2">
              {Array.from({ length: slotNumber }, (_, i) => (
                <div
                  key={i}
                  className="w-10 h-12 rounded border-2 flex items-center justify-center"
                  style={{
                    borderColor: i === slotNumber - 1 ? theme.bossStarColor : `${theme.bossTextColor}50`,
                    background:  i === slotNumber - 1 ? `${theme.bossStarBg}60` : `${theme.bossTextColor}08`,
                    boxShadow:   i === slotNumber - 1 ? theme.bossStarGlow : undefined,
                  }}
                >
                  <span className="font-pixel text-[8px]" style={{ color: i === slotNumber - 1 ? theme.bossStarColor : `${theme.bossTextColor}30` }}>
                    {i === slotNumber - 1 ? 'NEW' : '✓'}
                  </span>
                </div>
              ))}
            </div>

            {/* Label */}
            <div>
              <div
                className="font-pixel text-[10px] tracking-[0.4em] mb-1"
                style={{ color: `${theme.bossTextColor}60` }}
              >
                NEW CREW SLOT UNLOCKED
              </div>
              <div
                className="font-pixel text-[22px] tracking-wider"
                style={{ color: theme.bossStarColor, textShadow: theme.bossStarGlow }}
              >
                {boss.compName}
              </div>
              <div
                className="font-pixel text-[9px] tracking-wide mt-2 leading-relaxed"
                style={{ color: `${theme.bossTextColor}70` }}
              >
                {boss.compDescription}
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={onAdvance}
          className={`
            px-9 py-2.5 rounded
            font-pixel text-[10.8px] tracking-widest
            border-2
            transition-all duration-150 active:scale-95
            transition-opacity duration-500
            ${showButton ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            color:       theme.bossStarColor,
            borderColor: theme.bossTextColor,
            background:  `linear-gradient(180deg, ${theme.bossStarBg} 0%, rgba(0,0,0,0.8) 100%)`,
            boxShadow:   theme.bossStarGlow,
          }}
        >
          ▶ CONTINUE TO PUB
        </button>

        <p
          className={`font-pixel text-[8.25px] tracking-wide text-center px-10 transition-opacity duration-500 ${showButton ? 'opacity-100' : 'opacity-0'}`}
          style={{ color: `${theme.bossTextColor}40` }}
        >
          Visit the pub to fill your new slot.<br />
          Fresh shooters. Fresh trouble.
        </p>

        {/* Bottom accent bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: theme.bossAccentBar }} />
      </div>
    );
  }

  // ── Normal comp branch (CompCard fan) ────────────────────────────────────
  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-6
        border-x-4
        overflow-hidden
      "
      style={{
        background:  theme.bossBg,
        borderColor: theme.bossBorderColor,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.bossGlow }}
      />

      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center px-8">
        <div
          className="font-pixel font-normal text-[7.59375px] tracking-[0.35em]"
          style={{ color: `${theme.bossTextColor}70` }}
        >
          FOR VALOR IN THE HIGH LIMIT ROOM
        </div>
        <div
          className="font-pixel text-[16.70625px] tracking-widest"
          style={{ color: `${theme.bossTextColor}b0` }}
        >
          {boss.name.toUpperCase()} — DEFEATED
        </div>
      </div>

      {/* Comp award card — large cinematic version, drops in after header */}
      {showCard && (
        <CompCard
          variant="cinematic"
          name={boss.compName}
          icon={compDef?.icon ?? '★'}
          effect={boss.compDescription}
          accentColor={compDef?.accentColor ?? theme.bossStarColor}
          className="animate-comp-deal-in"
        />
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className={`
          px-9 py-2.5 rounded
          font-pixel text-[10.8px] tracking-widest
          border-2
          transition-all duration-150 active:scale-95
          transition-opacity duration-500
          ${showButton ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          color:       theme.bossStarColor,
          borderColor: theme.bossTextColor,
          background:  `linear-gradient(180deg, ${theme.bossStarBg} 0%, rgba(0,0,0,0.8) 100%)`,
          boxShadow:   theme.bossStarGlow,
        }}
      >
        ▶ COLLECT &amp; VISIT THE PUB
      </button>

      <p
        className={`font-pixel text-[8.25px] tracking-wide text-center px-10 transition-opacity duration-500 ${showButton ? 'opacity-100' : 'opacity-0'}`}
        style={{ color: `${theme.bossTextColor}40` }}
      >
        Your crew awaits at the pub.<br />
        Fresh shooters. Fresh trouble.
      </p>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};
