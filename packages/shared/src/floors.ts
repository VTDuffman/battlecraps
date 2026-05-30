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
 * 'exposed'  — Floor 1 (The Loading Dock): stark, industrial, cold concrete
 * 'gritty'   — Floor 2 (VFW Hall): worn, blue-collar, fluorescent grime
 * 'elegant'  — Floor 3 (The Riverboat): candlelit, mahogany, quiet danger
 * 'electric' — Floor 4 (The Strip): neon, obsidian, pure machine
 * 'occult'   — Floor 5 (The Lodge): deep plum-black, amber candlelight, ritual silence
 * 'ancient'  — Floor 6 (Atlantis): bioluminescent warmth, coral-threaded stone, abyssal depth
 * 'cosmic'   — Floor 7 (The Station): void-black, starlight silver, nebula purple — zero gravity
 * 'alien'    — Floor 8 (The Signal): void black, electric acid green, deep magenta — organised wrongness
 * 'digital'  — Floor 9 (The Null Space): pure black, phosphor green terminal — the abyss at the end of the line
 */
export type FloorAtmosphere = 'exposed' | 'gritty' | 'elegant' | 'electric' | 'occult' | 'ancient' | 'cosmic' | 'alien' | 'digital';

/**
 * The 1-indexed floor number union. Add the next integer here when adding a floor.
 * Any Record<FloorId, …> will then produce a compile-time error at every
 * floor-scoped lookup site that is missing the new floor — making omissions
 * a build failure rather than a silent runtime gap.
 *
 * Keep this in sync with FLOORS below and docs/frameworks/floor-addition-checklist.md.
 */
export type FloorId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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

  // ── Floor 1: The Loading Dock ─────────────────────────────────────────────
  // Stained concrete, sodium-vapor streetlamp, chipped dice. The street.
  // Where it all begins — before you've earned a seat at any real table.
  {
    id:        1,
    name:      'The Loading Dock',
    tagline:   'The street. The hustle. Where it all begins.',
    introLines: [
      'Stained concrete and the harsh glare of a sodium-vapor streetlamp. The air is cold, and the dice are chipped.',
      'The Foreman stands by the freight elevator, steel-toed and impatient. He decides who gets to step inside.',
      "The street always takes its cut. Don't bleed out before the real game even starts.",
    ],
    bossName:   'The Foreman',
    bossTitle:  'Loading Dock Gatekeeper',
    bossVenue:  'The Loading Dock — Freight Elevator',
    bossTeaser: "The Foreman doesn't care if you win or lose. He just wants his cut.",
    atmosphere: 'exposed',
  },

  // ── Floor 2: VFW Hall ─────────────────────────────────────────────────────
  // Gritty blue-collar gambling den. Worn green felt, tarnished gold,
  // fluorescent grime. The first real indoor table.
  {
    id:        2,
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

  // ── Floor 3: The Riverboat ────────────────────────────────────────────────
  // Mississippi paddlewheel casino salon. Deep navy felt, aged champagne
  // brass, mahogany panels. Candlelit, quiet danger dressed as elegance.
  {
    id:        3,
    name:      'The Riverboat',
    tagline:   'Fortune flows with the current.',
    introLines: [
      'Mahogany panels. Candlelight. The paddle wheel churns the dark water below.',
      "Mme. Le Prix does not raise her voice. She doesn't need to.",
      "In the Salon Privé, she will look at one of your crew and that will be enough. They won't hear a word you say until the point resolves.",
    ],
    bossName:   'Mme. Le Prix',
    bossTitle:  'Proprietress of the Salon Privé',
    bossVenue:  'The Riverboat — Salon Privé',
    bossTeaser: "Mme. Le Prix does not silence your crew. She simply looks at one of them.",
    atmosphere: 'elegant',
  },

  // ── Floor 4: The Strip ────────────────────────────────────────────────────
  // Vegas tower penthouse, sixty floors up. Obsidian felt, electric gold,
  // neon magenta. No warmth, no texture, no mercy. Pure money, pure machine.
  {
    id:        4,
    name:      'The Strip',
    tagline:   'Sixty floors up. No safety net.',
    introLines: [
      'Obsidian felt. Floor-to-ceiling glass. The city grid glitters sixty stories below.',
      "The Executive doesn't cheat. He doesn't need to.",
      "Roll a four and it costs you. Roll it twice and it costs more. Roll it a third time — and it's over.",
    ],
    bossName:   'The Executive',
    bossTitle:  'Penthouse Host',
    bossVenue:  'The Strip — Penthouse',
    bossTeaser: "The Executive runs a three-strike room. The first four costs you. The second costs more. The third ends your run.",
    atmosphere: 'electric',
  },

  // ── Floor 5: The Lodge ────────────────────────────────────────────────────
  // Marble columns. Candlelight. Hooded figures. A table three centuries old.
  // The order always collects — win or lose, something is owed.
  {
    id:        5,
    name:      'The Lodge',
    tagline:   "You weren't supposed to know this place existed.",
    introLines: [
      'Marble columns. Candlelight. Hooded figures standing against the walls in silence, watching.',
      "The Hierophant has kept this table running for three centuries. You're here because someone vouched for you. That person is no longer welcome.",
      'The order always collects. Win or lose, something is owed.',
    ],
    bossName:   'The Hierophant',
    bossTitle:  'Keeper of the Rites',
    bossVenue:  'The Lodge — The Inner Sanctum',
    bossTeaser: 'The order always collects. Win or lose, something is owed.',
    atmosphere: 'occult',
  },

  // ── Floor 6: Atlantis ─────────────────────────────────────────────────────
  // Marble columns still standing. Three thousand years of coral grown through
  // the stone, lit from within by creatures that have never seen the sun.
  // The Sovereign never left. The tide obeys him — and so will your minimum bets.
  {
    id:        6,
    name:      'Atlantis',
    tagline:   "It didn't sink. It descended on purpose.",
    introLines: [
      'Marble columns still standing. Mosaic floors intact. Three thousand years of coral grown through the stone, lit from within by creatures that have never seen the sun.',
      "The Sovereign never left. He watched every empire above collapse from this room, and he is not impressed by yours.",
      'The tides here answer to him. He will set them against you.',
    ],
    bossName:   'The Sovereign',
    bossTitle:  'Last King of Atlantis',
    bossVenue:  'Atlantis — The Throne Room',
    bossTeaser: 'The tides have always obeyed the Sovereign. So will your minimum bets.',
    atmosphere: 'ancient',
  },

  // ── Floor 7: The Station ──────────────────────────────────────────────────
  // Void-black and starlight silver. A table in low orbit, eleven months from
  // gravity. The Commander never lost a run — your hype will decay here.
  {
    id:        7,
    name:      'The Station',
    tagline:   "Momentum decays. Everything does, up here.",
    introLines: [
      'The viewport shows nothing but stars and the slow curve of the Earth below. Everything else is silence and the hum of life support.',
      'The Commander has been at this table for eleven months. She does not miss the ground.',
      'Up here, momentum is a resource. And resources decay.',
    ],
    bossName:   'The Commander',
    bossTitle:  'Station Chief, Table Authority',
    bossVenue:  'The Station — The Command Module',
    bossTeaser: 'Every seven-out drains your hype multiplier. There is no floor — until there is.',
    atmosphere: 'cosmic',
  },

  // ── Floor 8: The Signal ───────────────────────────────────────────────────
  // Void black, electric acid green, deep magenta. The table is correct.
  // The room is not. The Emissary reconstructed the game from a transmission —
  // faithfully, except for one concept it could not translate.
  {
    id:        8,
    name:      'The Signal',
    tagline:   "We received it. We shouldn't have answered.",
    introLines: [
      'The table is here. The felt, the chips, the dice — all correct. The geometry of the room is not correct. The light arrives from the wrong direction.',
      'The Emissary studied the transmission for eleven years. It reconstructed the game faithfully, except for one concept it could not translate.',
      "What it couldn't translate was delay. Your crew's earnings don't pay out immediately — they arrive one roll later. Seven-out before then, and the signal is lost entirely.",
    ],
    bossName:   'The Emissary',
    bossTitle:  'First Point of Contact',
    bossVenue:  'The Signal — The Receiving Chamber',
    bossTeaser: "The Emissary understands the game. It simply can't process your crew's earnings in real time.",
    atmosphere: 'alien',
  },

  // ── Floor 9: The Null Space ───────────────────────────────────────────────
  // Pure black. No felt texture. No ambient light. No sound.
  // The Architect built this room from the data of every run ever played.
  // Your crew is temporary. Your patterns are not.
  {
    id:        9,
    name:      'The Null Space',
    tagline:   'End of line.',
    introLines: [
      'Pure black. No felt texture, no ambient light, no sound. Just the table, the dice, and the cursor blinking at the end of a very long terminal session.',
      'The Architect built this place from the data of every run ever played. He knows your patterns. He designed this room specifically for you.',
      'Every seven-out, one of your crew is reclaimed. The table has infinite patience. You do not.',
    ],
    bossName:   'The Architect',
    bossTitle:  'Designer of the Null Space',
    bossVenue:  'The Null Space — The Zero Chamber',
    bossTeaser: 'The Architect reclaims your crew one by one. Five seven-outs and you roll alone.',
    atmosphere: 'digital',
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
 *   getFloorByMarkerIndex(0)  → Floor 1 (The Loading Dock)
 *   getFloorByMarkerIndex(3)  → Floor 2 (VFW Hall)
 *   getFloorByMarkerIndex(6)  → Floor 3 (The Riverboat)
 *   getFloorByMarkerIndex(9)  → Floor 4 (The Strip)
 *   getFloorByMarkerIndex(12) → Floor 5 (The Lodge)
 *   getFloorByMarkerIndex(15) → Floor 6 (Atlantis)
 *   getFloorByMarkerIndex(18) → Floor 7 (The Station)
 *   getFloorByMarkerIndex(21) → Floor 8 (The Signal)
 *   getFloorByMarkerIndex(24) → Floor 9 (The Null Space)
 */
export function getFloorByMarkerIndex(markerIndex: number): FloorConfig {
  const id = Math.floor(markerIndex / 3) + 1;
  return FLOORS.find((f) => f.id === id) ?? FLOORS[FLOORS.length - 1]!;
}
