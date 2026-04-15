// =============================================================================
// BATTLECRAPS — SAL THE FIXER PORTRAIT
// apps/web/src/components/tutorial/SalPortrait.tsx
//
// Emoji-based character portrait for Sal the Fixer.
// No sprite assets required — emoji layering creates the gritty fixer look.
// Slides in on mount via CSS transform + opacity transition.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { getFloorTheme } from '../../lib/floorThemes.js';

const theme = getFloorTheme(0);

interface SalPortraitProps {
  size?: 'sm' | 'md';
}

export const SalPortrait: React.FC<SalPortraitProps> = ({ size = 'md' }) => {
  const [visible, setVisible] = useState(false);

  // Defer visibility by one frame to trigger the slide-in transition
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isMd      = size === 'md';
  const boxClass  = isMd ? 'w-20 h-20' : 'w-14 h-14';
  const hatSize   = isMd ? 'text-3xl'  : 'text-2xl';
  const faceSize  = isMd ? 'text-2xl'  : 'text-xl';
  const cardSize  = isMd ? 'text-lg'   : 'text-sm';
  const labelSize = isMd ? 'text-[6px]' : 'text-[5px]';

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      style={{
        transform:  visible ? 'translateY(0)' : 'translateY(16px)',
        opacity:    visible ? 1 : 0,
        transition: 'transform 400ms ease-out, opacity 300ms ease-out',
      }}
    >
      {/* Portrait box */}
      <div
        className={`${boxClass} flex flex-col items-center justify-center rounded border-2 bg-black/80 relative overflow-hidden flex-none`}
        style={{
          borderColor: theme.accentDim,
          boxShadow:   `0 0 14px 3px ${theme.accentPrimary}20`,
        }}
      >
        {/* Scanline texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0.10) 1px, transparent 1px, transparent 2px)',
          }}
        />
        {/* Emoji stack */}
        <span className={`${hatSize} leading-none`}>🎩</span>
        <span className={`${faceSize} leading-none`}>😤</span>
        <div className={`${cardSize} leading-none flex gap-0.5 mt-0.5`}>
          <span>🎴</span>
          <span>🎴</span>
        </div>
      </div>

      {/* Name label */}
      <div
        className={`font-pixel ${labelSize} tracking-widest`}
        style={{ color: `${theme.accentPrimary}80` }}
      >
        SAL THE FIXER
      </div>
    </div>
  );
};
