// =============================================================================
// BATTLECRAPS — TUTORIAL SPOTLIGHT HOOK
// apps/web/src/hooks/useTutorialSpotlight.ts
//
// Measures the bounding rect of a spotlight zone element and re-measures on
// window resize. Uses aria-label for section-level zones and data-tutorial-zone
// for sub-zones inside BettingGrid.
// =============================================================================

import { useState, useEffect, useCallback, RefObject } from 'react';
import type { SpotlightZone } from '../lib/tutorialBeats.js';

export interface SpotlightRect {
  top:    number;
  left:   number;
  width:  number;
  height: number;
}

function queryZoneElement(
  zone: SpotlightZone,
): Element | null {
  switch (zone) {
    case 'none':
    case 'boss-portrait':
      return null;
    case 'game-status':
      return document.querySelector('[data-tutorial-zone="game-status"]');
    case 'bankroll-zone':
      return document.querySelector('[data-tutorial-zone="bankroll-zone"]');
    case 'betting-grid':
      return document.querySelector('[aria-label="Betting Grid"]');
    case 'dice-zone':
      return document.querySelector('[data-tutorial-zone="dice-zone"]');
    case 'crew-rail':
      return document.querySelector('[data-tutorial-zone="crew-rail"]');
    case 'hype-meter':
      return document.querySelector('[data-tutorial-zone="hype-meter"]');
    case 'marker-progress':
      return document.querySelector('[data-tutorial-zone="marker-progress"]');
    case 'betting-passline':
      return document.querySelector('[data-tutorial-zone="betting-passline"]');
    case 'betting-odds':
      return document.querySelector('[data-tutorial-zone="betting-odds"]');
    case 'betting-hardways':
      return document.querySelector('[data-tutorial-zone="betting-hardways"]');
    default:
      return null;
  }
}

export function useTutorialSpotlight(
  zone: SpotlightZone,
  tableRef: RefObject<HTMLDivElement | null>,
): SpotlightRect | null {
  const measure = useCallback((): SpotlightRect | null => {
    const container = tableRef.current;
    if (!container) return null;
    if (zone === 'none' || zone === 'boss-portrait') return null;

    const el = queryZoneElement(zone);
    if (!el) return null;

    const containerRect = container.getBoundingClientRect();
    const elRect        = el.getBoundingClientRect();

    return {
      top:    elRect.top    - containerRect.top,
      left:   elRect.left   - containerRect.left,
      width:  elRect.width,
      height: elRect.height,
    };
  }, [zone, tableRef]);

  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    setRect(measure());
    const observer = new ResizeObserver(() => setRect(measure()));
    if (tableRef.current) observer.observe(tableRef.current);
    return () => observer.disconnect();
  }, [measure, tableRef]);

  return rect;
}
