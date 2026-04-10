// =============================================================================
// BATTLECRAPS — FLOOR & TRANSITION DEFINITIONS
// packages/shared/src/floors.ts
//
// Phase 1: TransitionType, CelebrationSnapshot
// Phase 2: FloorConfig, FLOORS registry, floor helper functions
//
// ARCHITECTURE NOTE — two parallel systems, one conceptual unit:
//
//   packages/shared/src/config.ts   — MECHANICAL data
//     GAUNTLET, MarkerConfig, BossConfig, boss rules, marker targets,
//     min/max bet helpers. Source of truth for game engine logic.
//
//   packages/shared/src/floors.ts   — NARRATIVE & DISPLAY data
//     FloorConfig, FLOORS, floor names, atmosphere, intro text, boss teasers.
//     Source of truth for transition components and floor reveal content.
//
//   apps/web/src/lib/floorThemes.ts — VISUAL data
//     FloorTheme, CSS tokens, gradients, colors per floor.
//     Source of truth for all styling decisions.
//
//   docs/floors.md                  — HUMAN CONTRACT
//     The normative document that defines what a floor IS. A designer adds a
//     floor here first; developers translate it into config.ts + floors.ts +
//     floorThemes.ts. floors.md is the handoff document.
//
// All three systems are linked by floorId (1-indexed). To look up narrative
// content for a marker at index 4: getFloorByMarkerIndex(4) → Floor 2.
// To look up the theme: getFloorTheme(4) → FLOOR_2_THEME.
// To look up mechanical data: GAUNTLET[4] → MarkerConfig.
// =============================================================================

// ---------------------------------------------------------------------------
// TRANSITION TYPE
// ---------------------------------------------------------------------------

/**
 * The type of game transition currently in progress.
 *
 * Drives the TransitionOrchestrator in the web client to select the
 * correct phase sequence from the TRANSITION_REGISTRY.
 *
 * Active in Phase 1:
 *   MARKER_CLEAR  — Celebration after hitting a marker target
 *   BOSS_ENTRY    — Ominous boss introduction before the High Limit Room
 *   BOSS_VICTORY  — Triumph screen after defeating a boss
 *
 * Added in later phases:
 *   TITLE         — First-load cinematic (Phase 6)
 *   MARKER_INTRO  — Brief orientation card after pub, before first roll (Phase 3)
 *   FLOOR_REVEAL  — Full-screen new-floor announcement (Phase 4)
 *   VICTORY       — Full victory cinematic after clearing all 9 markers (Phase 8)
 *   GAME_OVER     — End screen after all shooters are lost (Phase 9)
 */
export type TransitionType =
  | 'TITLE'
  | 'MARKER_CLEAR'
  | 'MARKER_INTRO'
  | 'FLOOR_REVEAL'
  | 'BOSS_ENTRY'
  | 'BOSS_VICTORY'
  | 'VICTORY'
  | 'GAME_OVER';

// ---------------------------------------------------------------------------
// CELEBRATION SNAPSHOT
// ---------------------------------------------------------------------------

/**
 * Frozen snapshot of the game state at the moment a marker was cleared.
 *
 * Held in the Zustand store during the MARKER_CLEAR / BOSS_VICTORY celebration
 * sequence so that all phase components display the OLD marker state (the one
 * that was just beaten) rather than the already-incremented logical state.
 *
 * WHY THIS EXISTS — the chip-rain race condition:
 *   The server sends newMarkerIndex (already incremented) in turn:settled.
 *   The store updates its logical state immediately for correctness. But the
 *   UI must continue to show the marker the player just BEAT during the
 *   celebration, not the next target they haven't reached yet.
 *
 *   Without this snapshot, components that read currentMarkerIndex from the
 *   store will flash the new (higher) target during chip rain — confusing and
 *   incorrect. With the snapshot, every phase component reads from here instead
 *   of the live store during the celebration window.
 *
 * LIFECYCLE:
 *   1. applyPendingSettlement() detects runStatus === 'TRANSITION'
 *   2. Captures snapshot from the CURRENT (pre-update) store state
 *   3. Store logical state updates (currentMarkerIndex advances, etc.)
 *   4. UI reads from celebrationSnapshot for all display during celebration
 *   5. clearTransition() is called when the player clicks through all phases
 *   6. Snapshot is nulled — new state is now safe to render (pub screen)
 */
export interface CelebrationSnapshot {
  /** The 0-based index of the marker that was just cleared. */
  markerIndex: number;
  /** Target bankroll for the cleared marker, in cents. */
  targetCents: number;
  /** 1-indexed floor number for the cleared marker (1, 2, or 3). */
  floorId: number;
  /** Player bankroll immediately before the clearing roll was settled. */
  bankrollBefore: number;
  /** Player bankroll after the clearing roll (includes the payout). */
  bankrollAfter: number;
  /** True when the cleared marker was a boss fight. Drives BOSS_VICTORY vs MARKER_CLEAR routing. */
  isBossVictory: boolean;
}

// ---------------------------------------------------------------------------
// FLOOR CONFIG
// ---------------------------------------------------------------------------

/**
 * The thematic atmosphere of a floor.
 * Drives ambient animation intensity, breathing overlay palette, and
 * (in future phases) sound design cues.
 *
 * 'gritty'   — Floor 1 (VFW Hall): worn, blue-collar, fluorescent grime
 * 'elegant'  — Floor 2 (The Riverboat): candlelit, mahogany, quiet danger
 * 'electric' — Floor 3 (The Strip): neon, obsidian, pure machine
 */
export type FloorAtmosphere = 'gritty' | 'elegant' | 'electric';

/**
 * The complete narrative and display configuration for a single floor.
 *
 * This is the DISPLAY layer — it contains everything transition components
 * need to present a floor to the player (names, text, atmosphere).
 * It does NOT contain mechanical data (bet limits, boss rules, marker targets);
 * those live in config.ts / GAUNTLET.
 *
 * Link to mechanical data: GAUNTLET[markerIndex] where
 *   markerIndex ∈ [(id-1)*3, (id-1)*3 + 2]
 *
 * Link to visual data: getFloorTheme(markerIndex) in floorThemes.ts
 *
 * See docs/floors.md for the full design specification and field-by-field
 * guidance for adding new floors.
 */
export interface FloorConfig {
  /**
   * 1-indexed floor number. Matches MarkerConfig.floor in config.ts.
   * Floor 1 covers marker indices 0–2, Floor 2 covers 3–5, Floor 3 covers 6–8.
   */
  readonly id: number;

  /**
   * Short venue name. Displayed in progress UI, floor reveal headline,
   * and any screen that references the current location.
   * Example: 'VFW Hall', 'The Riverboat', 'The Strip'
   */
  readonly name: string;

  /**
   * One-line atmospheric tagline. Shown beneath the floor name on the
   * floor reveal screen. Should capture the essence of the venue in
   * under 8 words.
   * Example: 'Where dice meet duty.'
   */
  readonly tagline: string;

  /**
   * 2–3 sentences of flavor text shown during the floor reveal cinematic
   * (Phase 4). Each string is displayed as a separate paragraph.
   * Should paint a sensory picture: sights, sounds, the vibe of the room.
   * Should hint at the boss without naming their rule.
   */
  readonly introLines: readonly string[];

  /**
   * Display name of this floor's final boss.
   * Must match BossConfig.name on the floor's third marker in config.ts.
   * Used in floor reveal teasers and boss entry/victory headers.
   */
  readonly bossName: string;

  /**
   * Short title describing the boss's role in the venue.
   * Shown beneath the boss name on the floor reveal screen.
   * Example: 'Floor Commander', 'Proprietress of the Salon Privé'
   */
  readonly bossTitle: string;

  /**
   * Name of the boss's High Limit Room. Should match the venue string
   * on the boss marker in config.ts for consistency.
   * Example: 'VFW Hall — High Limit Room'
   */
  readonly bossVenue: string;

  /**
   * One sentence shown at the bottom of the floor reveal that hints at
   * the boss's mechanic without fully revealing it. Builds anticipation.
   * Should be ominous but not technically specific.
   * Example: 'Sarge sets the floor. And the floor keeps rising.'
   */
  readonly bossTeaser: string;

  /**
   * Thematic atmosphere of this floor.
   * Drives ambient animation palette and future sound design cues.
   * See FloorAtmosphere for full documentation.
   */
  readonly atmosphere: FloorAtmosphere;
}

// ---------------------------------------------------------------------------
// FLOORS REGISTRY
// ---------------------------------------------------------------------------

/**
 * The complete ordered list of floors in the Gauntlet.
 *
 * FLOORS is indexed by (floorId - 1): FLOORS[0] = Floor 1, etc.
 * Always use getFloorById() or getFloorByMarkerIndex() for lookups —
 * do not rely on array index directly, as future floors may not be contiguous.
 *
 * To add a new floor: see docs/floors.md § "Adding a New Floor".
 */
export const FLOORS: readonly FloorConfig[] = [

  // ── Floor 1: VFW Hall ─────────────────────────────────────────────────────
  // Gritty blue-collar gambling den. Worn green felt, tarnished gold,
  // fluorescent grime. The entry point — familiar but not forgiving.
  {
    id:        1,
    name:      'VFW Hall',
    tagline:   'Where dice meet duty.',
    introLines: [
      'Cigarette smoke and fluorescent hum. Folding tables, chipped chips, honest action.',
      'The regulars know your face. The Sarge runs a tight room.',
      'This is where runs are born — or buried.',
    ],
    bossName:   'Sarge',
    bossTitle:  'Floor Commander',
    bossVenue:  'VFW Hall — High Limit Room',
    bossTeaser: 'Sarge sets the floor. And the floor keeps rising.',
    atmosphere: 'gritty',
  },

  // ── Floor 2: The Riverboat ────────────────────────────────────────────────
  // Mississippi paddlewheel casino salon. Deep navy felt, aged champagne
  // brass, mahogany panels. Candlelit, quiet danger dressed as elegance.
  {
    id:        2,
    name:      'The Riverboat',
    tagline:   'Fortune flows with the current.',
    introLines: [
      'Mahogany panels. Candlelight. The paddle wheel churns the dark water below.',
      "Mme. Le Prix does not raise her voice. She doesn't need to.",
      'Your crew works differently here. Adapt, or sink.',
    ],
    bossName:   'Mme. Le Prix',
    bossTitle:  'Proprietress of the Salon Privé',
    bossVenue:  'The Riverboat — Salon Privé',
    bossTeaser: 'Mme. Le Prix reverses the order of things. Everything costs more than you think.',
    atmosphere: 'elegant',
  },

  // ── Floor 3: The Strip ────────────────────────────────────────────────────
  // Vegas tower penthouse, sixty floors up. Obsidian felt, electric gold,
  // neon magenta. No warmth, no texture, no mercy. Pure money, pure machine.
  {
    id:        3,
    name:      'The Strip',
    tagline:   'Sixty floors up. No safety net.',
    introLines: [
      'Obsidian felt. Floor-to-ceiling glass. The city grid glitters sixty stories below.',
      "The Executive doesn't cheat. He doesn't need to.",
      "One number ends it all. Don't roll it.",
    ],
    bossName:   'The Executive',
    bossTitle:  'Penthouse Host',
    bossVenue:  'The Strip — Penthouse',
    bossTeaser: "The Executive has one rule. It's the only one that matters.",
    atmosphere: 'electric',
  },

];

// ---------------------------------------------------------------------------
// FLOOR HELPERS
// ---------------------------------------------------------------------------

/**
 * Look up a floor by its 1-indexed id.
 * Returns undefined if no floor with that id exists.
 */
export function getFloorById(id: number): FloorConfig | undefined {
  return FLOORS.find((f) => f.id === id);
}

/**
 * Look up the floor for a given 0-based marker index.
 * Floor is derived as Math.floor(markerIndex / 3) + 1.
 * Clamps to the last floor if markerIndex exceeds the gauntlet length.
 *
 * Examples:
 *   getFloorByMarkerIndex(0) → Floor 1 (VFW Hall)
 *   getFloorByMarkerIndex(4) → Floor 2 (The Riverboat)
 *   getFloorByMarkerIndex(8) → Floor 3 (The Strip)
 */
export function getFloorByMarkerIndex(markerIndex: number): FloorConfig {
  const id = Math.floor(markerIndex / 3) + 1;
  return FLOORS.find((f) => f.id === id) ?? FLOORS[FLOORS.length - 1]!;
}
