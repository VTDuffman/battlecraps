// =============================================================================
// BATTLECRAPS — SAL DIALOG CARD
// apps/web/src/components/tutorial/SalDialog.tsx
//
// Speech card for Sal the Fixer. Shows primary salText, optional "Tell me more"
// expander, and a CTA button to advance the beat.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { getFloorTheme } from '../../lib/floorThemes.js';
import { SalPortrait }   from './SalPortrait.js';
import type { SpotlightZone } from '../../lib/tutorialBeats.js';

const theme = getFloorTheme(0);

interface SalDialogProps {
  salText:      string;
  salTextMore?: string;
  advanceLabel: string;
  onAdvance:    () => void;
  onSkip:       () => void;
  /** True while an animated/simulated beat is running — disables the CTA */
  waiting?:     boolean;
  /** If true, beat is optional — show a "Skip" secondary below the CTA */
  skipable?:    boolean;
  beatId:       number;
  totalBeats:   number;
  spotlightZone?: SpotlightZone;
  /** True during overlay close — triggers slide-out */
  isClosing?:   boolean;
}

export const SalDialog: React.FC<SalDialogProps> = ({
  salText,
  salTextMore,
  advanceLabel,
  onAdvance,
  onSkip,
  waiting = false,
  skipable = false,
  beatId,
  totalBeats,
  spotlightZone,
  isClosing = false,
}) => {
  const isUpperZone = spotlightZone === 'dice-zone' || spotlightZone === 'crew-rail' || spotlightZone === 'betting-passline';
  const [expanded, setExpanded] = useState(false);
  const [visible,  setVisible]  = useState(false);

  // Reset expander when beat changes
  React.useEffect(() => {
    setExpanded(false);
  }, [beatId]);

  // One-frame defer to trigger slide-in
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const active = visible && !isClosing;
  const slideDir = isUpperZone ? '-100%' : '100%';

  return (
    <div
      className={`absolute inset-x-0 flex flex-col ${isUpperZone ? 'top-0' : 'bottom-0'}`}
      style={{
        zIndex:     70,
        pointerEvents: 'auto',
        ...(isUpperZone && { paddingTop: '10%' }),
        transform:  active ? 'translateY(0)' : `translateY(${slideDir})`,
        opacity:    active ? 1 : 0,
        transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease-out',
      }}
    >
      {/* Tutorial skip — always visible at top-right of dialog */}
      <div className="flex justify-end px-4 pb-1">
        <button
          type="button"
          onClick={onSkip}
          className="font-pixel text-[7px] tracking-widest transition-colors flex items-center"
          style={{ color: `${theme.accentDim}60`, minHeight: '44px', paddingLeft: '12px', paddingRight: '4px' }}
        >
          Skip Tutorial →
        </button>
      </div>

      {/* Dialog card */}
      <div
        className="mx-3 mb-3 rounded-lg border overflow-hidden"
        style={{
          borderColor:  theme.accentDim,
          background:   'rgba(5,5,5,0.97)',
          boxShadow:    `0 -4px 24px 4px rgba(0,0,0,0.6), 0 0 0 1px ${theme.accentDim}30`,
          maxHeight:    '40dvh',
        }}
      >
        {/* Header row */}
        <div
          className="flex items-center gap-3 px-4 py-2 border-b"
          style={{ borderColor: `${theme.accentDim}40` }}
        >
          <SalPortrait size="sm" isClosing={isClosing} />
          <div className="flex-1">
            {/* Progress dots */}
            <div className="flex gap-1 mb-1">
              {Array.from({ length: totalBeats }, (_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width:      i === beatId - 1 ? 10 : 6,
                    height:     6,
                    transition: 'width 300ms ease, background-color 300ms ease',
                    backgroundColor: i < beatId - 1
                      ? `${theme.accentDim}90`
                      : i === beatId - 1
                        ? '#fbbf24'
                        : 'rgba(255,255,255,0.12)',
                    boxShadow: i === beatId - 1 ? '0 0 6px 1px rgba(251,191,36,0.50)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sal text body */}
        <div
          className="px-4 py-3 overflow-y-auto"
          style={{ maxHeight: 'calc(40dvh - 100px)' }}
        >
          <p
            className="font-mono leading-relaxed whitespace-pre-line"
            style={{ fontSize: '10px', color: `${theme.accentPrimary}CC` }}
          >
            {salText}
          </p>

          {/* "Tell me more" expander */}
          {salTextMore && (
            <>
              {expanded ? (
                <p
                  className="font-mono leading-relaxed mt-2 pt-2 border-t whitespace-pre-line"
                  style={{
                    fontSize: '10px',
                    color: 'rgba(255,255,255,0.50)',
                    borderColor: `${theme.accentDim}30`,
                  }}
                >
                  {salTextMore}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-2 font-pixel text-[7px] tracking-wider transition-opacity hover:opacity-80 flex items-center"
                  style={{ color: theme.accentDim, minHeight: '44px', paddingRight: '16px' }}
                >
                  Tell me more ▾
                </button>
              )}
            </>
          )}
        </div>

        {/* CTA row */}
        <div
          className="flex gap-2 px-4 py-2 border-t"
          style={{ borderColor: `${theme.accentDim}40` }}
        >
          <button
            type="button"
            onClick={waiting ? undefined : onAdvance}
            disabled={waiting}
            className="flex-1 rounded border font-pixel text-[8px] tracking-widest transition-all active:scale-[0.98]"
            style={{
              minHeight:   '44px',
              borderColor: waiting ? `${theme.accentDim}40` : theme.accentPrimary,
              color:        waiting ? `${theme.accentDim}50` : '#fef3c7',
              background:   waiting
                ? 'rgba(10,10,10,0.6)'
                : `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
              boxShadow: waiting ? 'none' : `0 0 12px 2px ${theme.accentPrimary}20`,
            }}
          >
            {waiting ? '…' : advanceLabel}
          </button>

          {/* Optional skip for skipable beats */}
          {skipable && !waiting && (
            <button
              type="button"
              onClick={onAdvance}
              className="px-3 rounded border font-pixel text-[7px] tracking-wider transition-all active:scale-[0.98]"
              style={{
                minHeight:   '44px',
                borderColor: `${theme.accentDim}40`,
                color:        `${theme.accentDim}80`,
                background:   'rgba(10,10,10,0.6)',
              }}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
