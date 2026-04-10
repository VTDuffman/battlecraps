// =============================================================================
// BATTLECRAPS — TRANSITION PHASE TYPES
// apps/web/src/transitions/types.ts
//
// Client-side type definitions for the TransitionOrchestrator phase system.
// These live in the web package because PhaseComponentProps is a React concept.
// The shared TransitionType and CelebrationSnapshot live in @battlecraps/shared.
// =============================================================================

// ---------------------------------------------------------------------------
// Phase advance mode
// ---------------------------------------------------------------------------

/**
 * Controls how the PhasePlayer advances to the next phase in a sequence.
 *
 * 'auto'      — Advances automatically after `duration` ms (no player input).
 *               Use for cinematic moments: floor reveals, explosion intros.
 * 'gated'     — Waits for the player to click a CTA button (onAdvance prop).
 *               Use for information modals where the player must acknowledge.
 * 'animation' — Waits for a named animation to call back via onAdvance.
 *               Use when timing must be tied to actual animation completion,
 *               not a fixed duration (e.g. ChipRain onComplete in Phase 3).
 */
export type PhaseAdvanceMode = 'auto' | 'gated' | 'animation';

// ---------------------------------------------------------------------------
// Phase descriptor
// ---------------------------------------------------------------------------

/**
 * A single atomic step within a transition sequence.
 *
 * The TRANSITION_REGISTRY maps each TransitionType to an ordered array of
 * these descriptors. The PhasePlayer renders the current phase's component
 * and wires up the appropriate advance trigger.
 */
export interface TransitionPhase {
  /**
   * Unique ID within the sequence.
   * Used as the React key on the PhasePlayer so re-mounting fires correctly
   * when the same component type appears multiple times in a sequence.
   */
  id: string;

  /** How this phase advances to the next. */
  advanceMode: PhaseAdvanceMode;

  /**
   * Duration in milliseconds before auto-advance.
   * Required when advanceMode === 'auto'. Ignored otherwise.
   */
  duration?: number;

  /**
   * Named animation event key (reserved for Phase 3 ChipRain onComplete).
   * Required when advanceMode === 'animation'. Ignored otherwise.
   */
  animationKey?: string;

  /**
   * Key into PHASE_COMPONENT_MAP in registry.ts.
   * Must match exactly — a missing key is a runtime error logged to console.
   */
  component: string;
}

// ---------------------------------------------------------------------------
// Phase component props
// ---------------------------------------------------------------------------

/**
 * Props injected by PhasePlayer into every phase component.
 *
 * Components are responsible for calling onAdvance() exactly once when they
 * are done — either immediately (auto phases do this via useEffect), after
 * a timer, or when the player interacts with a CTA.
 *
 * onAdvance() is NOT a cleanup function. Calling it triggers the orchestrator
 * to evaluate whether to advance to the next phase or complete the sequence.
 * Do not call it in a cleanup/unmount handler.
 */
export interface PhaseComponentProps {
  /** Signal that this phase is complete. The orchestrator advances the sequence. */
  onAdvance: () => void;
}
