// =============================================================================
// BATTLECRAPS — TUTORIAL CONTEXT
// apps/web/src/contexts/TutorialContext.tsx
//
// Thin React context for the bet-observation bridge between TutorialOverlay
// and BettingGrid. Keeps tutorial coupling out of the Zustand store.
// =============================================================================

import React, { createContext, useContext } from 'react';
import type { BetField } from '../store/useGameStore.js';
import type { BeatAdvanceMode } from '../lib/tutorialBeats.js';

export interface TutorialCallbacks {
  onBetChanged: (field: BetField, newAmount: number) => void;
}

export interface TutorialContextValue {
  activeBeatMode: BeatAdvanceMode | null;
  onBetChanged:   (field: BetField, newAmount: number) => void;
  forceRollLogOpen: boolean;
  setForceRollLogOpen: (val: boolean) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

interface TutorialProviderProps {
  value: TutorialContextValue;
  children: React.ReactNode;
}

export function TutorialProvider({ value, children }: TutorialProviderProps) {
  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorialContext(): TutorialContextValue | null {
  return useContext(TutorialContext);
}
