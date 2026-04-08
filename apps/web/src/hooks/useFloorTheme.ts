// =============================================================================
// BATTLECRAPS — useFloorTheme
// apps/web/src/hooks/useFloorTheme.ts
//
// Store-connected hook that returns the FloorTheme for the current marker.
// The theme objects are module-level constants so this selector always returns
// a stable reference — no spurious re-renders between rolls.
// =============================================================================

import { useGameStore } from '../store/useGameStore.js';
import { getFloorTheme, type FloorTheme } from '../lib/floorThemes.js';

export function useFloorTheme(): FloorTheme {
  const markerIndex = useGameStore((s) => s.currentMarkerIndex);
  return getFloorTheme(markerIndex);
}
