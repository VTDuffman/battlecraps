// =============================================================================
// BATTLECRAPS — SPOTLIGHT MASK
// apps/web/src/components/tutorial/SpotlightMask.tsx
//
// Dark overlay with a rectangular cut-out highlighting the active zone.
// Uses 4 solid blocking panels around the hole so pointer events pass through
// the spotlight area to the live UI beneath. The SVG mask approach was
// replaced because SVG absorbs pointer events even over the transparent region.
// =============================================================================

import React from 'react';
import type { SpotlightRect } from '../../hooks/useTutorialSpotlight.js';

const PADDING = 6; // px — expand the spotlight slightly beyond the element
const OVERLAY  = 'rgba(0,0,0,0.78)';

interface SpotlightMaskProps {
  containerWidth:  number;
  containerHeight: number;
  rect:            SpotlightRect | null; // null → full dark overlay, no cut-out
}

export const SpotlightMask: React.FC<SpotlightMaskProps> = ({
  containerWidth,
  containerHeight,
  rect,
}) => {
  const hasCutout = rect !== null;

  const cx = hasCutout ? rect.left   - PADDING : 0;
  const cy = hasCutout ? rect.top    - PADDING : 0;
  const cw = hasCutout ? rect.width  + PADDING * 2 : 0;
  const ch = hasCutout ? rect.height + PADDING * 2 : 0;

  const panelBase: React.CSSProperties = {
    position: 'absolute',
    background: OVERLAY,
    pointerEvents: 'auto',
    zIndex: 60,
  };

  if (!hasCutout) {
    // Full-screen block — no spotlight hole
    return (
      <div
        style={{
          ...panelBase,
          top: 0, left: 0,
          width: containerWidth,
          height: containerHeight,
        }}
      />
    );
  }

  return (
    <>
      {/* Top panel */}
      <div style={{ ...panelBase, top: 0, left: 0, width: containerWidth, height: cy }} />
      {/* Bottom panel */}
      <div style={{ ...panelBase, top: cy + ch, left: 0, width: containerWidth, height: Math.max(0, containerHeight - cy - ch) }} />
      {/* Left panel */}
      <div style={{ ...panelBase, top: cy, left: 0, width: Math.max(0, cx), height: ch }} />
      {/* Right panel */}
      <div style={{ ...panelBase, top: cy, left: cx + cw, width: Math.max(0, containerWidth - cx - cw), height: ch }} />

      {/* Golden ring border around the spotlight cut-out */}
      <div
        className="absolute pointer-events-none rounded"
        style={{
          top:     cy,
          left:    cx,
          width:   cw,
          height:  ch,
          zIndex:  61,
          border:  '2px solid rgba(212,160,23,0.80)',
          boxShadow: '0 0 12px 3px rgba(212,160,23,0.35), inset 0 0 8px 1px rgba(212,160,23,0.10)',
          animation: 'tutorialRingPulse 2s ease-in-out infinite',
        }}
      />
    </>
  );
};
