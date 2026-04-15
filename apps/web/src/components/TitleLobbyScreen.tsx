// =============================================================================
// BATTLECRAPS — TITLE LOBBY SCREEN
// apps/web/src/components/TitleLobbyScreen.tsx
//
// Shown at the start of every session (page load) after Clerk auth resolves.
// Gives the player an explicit choice before any run is loaded or created.
//
// - hasActiveRun=true  → "Continue Run" + "New Run" (with confirmation)
// - hasActiveRun=false → "New Run" only (no confirmation — nothing to overwrite)
//
// The only bypass for this screen is onPlayAgain() from Game Over / Victory,
// which calls bootstrap(true) directly without ever returning to the lobby.
//
// Visual tone: Floor 1 theme (gold / green), matching TitleScreenPhase.
// =============================================================================

import React, { useState }    from 'react';
import { getFloorTheme }      from '../lib/floorThemes.js';
import { HowToPlayScreen }    from './tutorial/HowToPlayScreen.js';

const theme = getFloorTheme(0);

interface TitleLobbyScreenProps {
  /** True when bc_run_id is present in localStorage — enables "Continue Run". */
  hasActiveRun: boolean;
  /** Called when the player chooses to resume their existing run. */
  onContinue: () => void;
  /** Called when the player confirms they want to start a fresh run. */
  onNewRun: () => void;
}

export const TitleLobbyScreen: React.FC<TitleLobbyScreenProps> = ({
  hasActiveRun,
  onContinue,
  onNewRun,
}) => {
  const [confirming,   setConfirming]   = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const handleNewRunClick = () => {
    if (hasActiveRun) {
      setConfirming(true);
    } else {
      onNewRun();
    }
  };

  // ── How to Play screen overlay ─────────────────────────────────────────
  if (showHowToPlay) {
    return (
      <HowToPlayScreen onBack={() => setShowHowToPlay(false)} />
    );
  }

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-8
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 45%, ${theme.feltPrimary}60 0%, #010101 55%, #000 100%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Game type badge */}
      <div
        className="font-pixel text-[5px] tracking-[0.5em] border px-5 py-1.5 rounded"
        style={{
          color:       `${theme.accentPrimary}99`,
          borderColor: `${theme.accentDim}40`,
        }}
      >
        A CRAPS ROGUELITE
      </div>

      {/* Title */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h1
          className="font-pixel text-center px-4 leading-none"
          style={{
            fontSize:   'clamp(36px, 11vw, 56px)',
            color:      theme.accentBright,
            textShadow: `
              0 0 30px ${theme.accentBright}90,
              0 0 80px ${theme.accentPrimary}60,
              0 0 140px ${theme.accentPrimary}30
            `,
          }}
        >
          BATTLE<br />CRAPS
        </h1>

        <p
          className="font-mono text-center"
          style={{
            fontSize: '10px',
            color:    `${theme.accentPrimary}70`,
          }}
        >
          Three floors. Nine markers. One shooter standing.
        </p>
      </div>

      {/* Divider */}
      <div
        className="w-16 h-px"
        style={{ background: `${theme.accentDim}40` }}
      />

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-4 w-full px-12">
        {hasActiveRun && (
          <button
            type="button"
            onClick={onContinue}
            className="
              w-full py-3.5 rounded
              font-pixel text-[10px] tracking-widest
              border-2
              text-amber-100
              transition-all duration-150 active:scale-95
            "
            style={{
              borderColor: theme.accentPrimary,
              background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
              boxShadow:   `0 0 24px 6px ${theme.accentPrimary}35`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                `0 0 32px 8px ${theme.accentPrimary}55`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                `0 0 24px 6px ${theme.accentPrimary}35`;
            }}
          >
            ▶ CONTINUE RUN
          </button>
        )}

        <button
          type="button"
          onClick={handleNewRunClick}
          className="
            w-full py-3.5 rounded
            font-pixel text-[10px] tracking-widest
            border-2
            transition-all duration-150 active:scale-95
          "
          style={{
            borderColor: hasActiveRun ? `${theme.accentDim}80` : theme.accentPrimary,
            background:  hasActiveRun ? 'rgba(10,10,10,0.8)' : `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
            color:       hasActiveRun ? `${theme.accentPrimary}99` : '#fef3c7',
            boxShadow:   hasActiveRun ? 'none' : `0 0 24px 6px ${theme.accentPrimary}35`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          }}
        >
          {hasActiveRun ? '+ NEW RUN' : '▶ NEW RUN'}
        </button>

        {/* How to Play — always visible, low visual weight */}
        <button
          type="button"
          onClick={() => setShowHowToPlay(true)}
          className="
            mt-2 w-full py-2 rounded
            font-pixel text-[8px] tracking-widest
            border transition-all duration-150 active:scale-95
          "
          style={{
            borderColor: `${theme.accentDim}30`,
            background:  'transparent',
            color:       `${theme.accentPrimary}60`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = `${theme.accentPrimary}90`;
            (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentDim}60`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = `${theme.accentPrimary}60`;
            (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentDim}30`;
          }}
        >
          ? HOW TO PLAY
        </button>
      </div>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Confirmation overlay — shown when player clicks "New Run" over an active run */}
      {confirming && (
        <div
          className="
            absolute inset-0 flex items-center justify-center
            bg-black/80 backdrop-blur-sm
          "
        >
          <div
            className="
              mx-8 p-8 rounded
              flex flex-col items-center gap-6
              border-2
            "
            style={{
              background:  `radial-gradient(ellipse at 50% 0%, ${theme.feltPrimary}30 0%, #050505 100%)`,
              borderColor: `${theme.accentDim}60`,
            }}
          >
            <div
              className="font-pixel text-[10px] tracking-widest text-center"
              style={{ color: theme.accentBright }}
            >
              START FRESH?
            </div>
            <p
              className="font-mono text-center leading-relaxed"
              style={{ fontSize: '9px', color: `${theme.accentPrimary}70` }}
            >
              Your current run will be lost.
            </p>
            <div className="flex gap-4 w-full">
              <button
                type="button"
                onClick={onNewRun}
                className="
                  flex-1 py-3 rounded
                  font-pixel text-[8px] tracking-widest
                  border-2 text-amber-100
                  transition-all duration-150 active:scale-95
                "
                style={{
                  borderColor: theme.accentPrimary,
                  background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
                }}
              >
                CONFIRM
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="
                  flex-1 py-3 rounded
                  font-pixel text-[8px] tracking-widest
                  border transition-all duration-150 active:scale-95
                "
                style={{
                  borderColor: `${theme.accentDim}40`,
                  background:  'rgba(10,10,10,0.8)',
                  color:       `${theme.accentPrimary}70`,
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
