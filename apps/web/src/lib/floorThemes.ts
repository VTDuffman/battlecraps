// =============================================================================
// BATTLECRAPS — FLOOR THEME REGISTRY
// apps/web/src/lib/floorThemes.ts
//
// Single source of truth for all per-floor visual tokens.
// Derive the current floor from markerIndex: floor = Math.floor(markerIndex / 3)
//
// Usage:
//   import { getFloorTheme } from '../lib/floorThemes';
//   const theme = getFloorTheme(currentMarkerIndex);
// =============================================================================

export interface FloorTheme {
  // ── Felt / table surface ──────────────────────────────────────────────────
  /** Primary felt hex color — used as backgroundColor on the table container */
  feltPrimary: string;
  /** Darker felt variant — used for the crew rail background */
  feltRail: string;
  /** SVG felt texture data URI — 4×4 px repeating fabric pattern */
  feltTexture: string;

  // ── Accent colors ─────────────────────────────────────────────────────────
  /** Primary accent color (gold/brass/electric) — bright variant */
  accentBright: string;
  /** Primary accent color — standard variant */
  accentPrimary: string;
  /** Primary accent color — dim variant for dividers */
  accentDim: string;

  // ── Border colors (pre-computed RGBA strings) ─────────────────────────────
  /** Border color at ~30% opacity — outer container, crew rail */
  borderHigh: string;
  /** Border color at ~20% opacity — internal section dividers */
  borderLow: string;

  // ── Felt breathing animation (CSS custom properties) ─────────────────────
  /** rgba(...) color string for the cold-tier breathing overlay */
  breatheCold: string;
  /** rgba(...) color string for the warm-tier breathing overlay */
  breatheWarm: string;
  /** rgba(...) color string for the hot-tier breathing overlay */
  breatheHot: string;

  // ── Screen flash colors (CSS custom properties) ───────────────────────────
  /** rgba(...) for the win flash (Natural / Point Hit) */
  flashWin: string;
  /** rgba(...) for the lose flash (Seven Out / Craps Out) */
  flashLose: string;

  // ── Pub / Recruitment screen ──────────────────────────────────────────────
  /** Display name for the between-marker rest screen */
  pubName: string;
  /** Radial-gradient CSS string for the pub container background */
  pubBg: string;
  /** Linear-gradient CSS string for the top accent bar */
  pubAccentBar: string;
  /** Radial-gradient CSS string for the smoke/atmosphere overlay */
  pubOverlayBg: string;
  /** CSS color string for the pub h1 title */
  pubTitleColor: string;
  /** CSS text-shadow string for the pub h1 title */
  pubTitleShadow: string;
  /** CSS color string for secondary pub text (tagline, labels) */
  pubSubtextColor: string;

  // ── Boss entry modal ───────────────────────────────────────────────────────
  /** Radial-gradient CSS string for the boss modal container background */
  bossBg: string;
  /** Linear-gradient CSS string for top/bottom accent bars */
  bossAccentBar: string;
  /** Radial-gradient CSS string for the central ambient glow overlay */
  bossGlow: string;
  /** CSS color string for boss h1 title and key accent elements */
  bossTextColor: string;
  /** CSS text-shadow for the boss h1 title */
  bossTitleShadow: string;
  /** RGBA string for boss room border (border-x-4 on root, box decorations) */
  bossBorderColor: string;
  /** CSS color for the star badge foreground */
  bossStarColor: string;
  /** CSS background for the star badge */
  bossStarBg: string;
  /** CSS border for the star badge */
  bossStarBorder: string;
  /** CSS box-shadow for the star badge glow */
  bossStarGlow: string;
}

// =============================================================================
// Utility — felt texture SVG data URI
// =============================================================================

/**
 * Generates the repeating 4×4 px felt texture SVG as a CSS background-image
 * data URI, tinted to the given base hex color.
 *
 * The three rects simulate woven fabric:
 *   - Base fill:  the provided color at full opacity
 *   - Dark pixel: 15% darker, 60% opacity
 *   - Light pixel: 8% lighter, 40% opacity
 *
 * Instead of computing HSL shifts at runtime, each theme provides pre-computed
 * dark/light hex values inline for predictability.
 */
function feltTextureUri(base: string, dark: string, light: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect width='4' height='4' fill='${base}'/><rect x='0' y='0' width='1' height='1' fill='${dark}' opacity='0.6'/><rect x='2' y='2' width='1' height='1' fill='${light}' opacity='0.4'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// =============================================================================
// Floor 1 — The Moose Lodge (VFW Hall)
// =============================================================================
// Gritty blue-collar gambling den. Worn green felt, tarnished gold, fluorescent
// grime. The existing baseline aesthetic, now formally documented.

const FLOOR_1_THEME: FloorTheme = {
  // Felt
  feltPrimary: '#1a4731',
  feltRail:    '#0c1f15',
  feltTexture: feltTextureUri('#1a4731', '#163d2a', '#1e5238'),

  // Accents
  accentBright:  '#f5c842',
  accentPrimary: '#d4a017',
  accentDim:     '#8a6810',

  // Borders
  borderHigh: 'rgba(212,160,23,0.30)',
  borderLow:  'rgba(212,160,23,0.20)',

  // Breathing
  breatheCold: 'rgba(37,96,64,0.28)',
  breatheWarm: 'rgba(212,160,23,0.22)',
  breatheHot:  'rgba(220,80,30,0.28)',

  // Screen flash
  flashWin:  'rgba(245,200,66,0.32)',
  flashLose: 'rgba(160,20,20,0.42)',

  // Pub — The Seven-Proof Pub
  pubName:       'THE SEVEN-PROOF PUB',
  pubBg:         'radial-gradient(ellipse at 50% 20%, #3a1800 0%, #180c00 45%, #0d0704 100%)',
  pubAccentBar:  'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
  pubOverlayBg:  'radial-gradient(ellipse at 50% 0%, rgba(180,90,0,0.08) 0%, transparent 70%)',
  pubTitleColor: '#f5c842',
  pubTitleShadow: '0 0 20px #c47d0a, 0 0 40px #7a4500',
  pubSubtextColor: 'rgba(245,211,130,0.50)',

  // Boss — VFW High Limit Room (Sarge)
  bossBg:         'radial-gradient(ellipse at 50% 30%, #1a0800 0%, #0d0400 55%, #050201 100%)',
  bossAccentBar:  'linear-gradient(90deg, transparent, #7f1d1d 30%, #dc2626 50%, #7f1d1d 70%, transparent)',
  bossGlow:       'radial-gradient(ellipse at 50% 40%, rgba(180,20,20,0.08) 0%, transparent 65%)',
  bossTextColor:  '#dc2626',
  bossTitleShadow: '0 0 30px rgba(220,38,38,0.6), 0 0 80px rgba(127,29,29,0.4)',
  bossBorderColor: 'rgba(127,29,29,0.60)',
  bossStarColor:   '#f87171',
  bossStarBg:      'rgba(127,29,29,0.40)',
  bossStarBorder:  '2px solid rgba(220,38,38,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(220,38,38,0.20)',
};

// =============================================================================
// Floor 2 — The Riverboat (Salon Privé)
// =============================================================================
// Mississippi paddlewheel casino salon. Deep navy felt like river water at
// midnight. Aged champagne brass replaces tarnished yellow-gold. Candlelit,
// mahogany-paneled, quiet danger dressed as elegance.

const FLOOR_2_THEME: FloorTheme = {
  // Felt — midnight navy
  feltPrimary: '#0a1832',
  feltRail:    '#060e1e',
  feltTexture: feltTextureUri('#0a1832', '#070f22', '#0e2040'),

  // Accents — champagne brass
  accentBright:  '#c9a96e',
  accentPrimary: '#a07830',
  accentDim:     '#604a1c',

  // Borders
  borderHigh: 'rgba(160,120,48,0.30)',
  borderLow:  'rgba(160,120,48,0.20)',

  // Breathing — river water → indigo gaslight → crimson warning
  breatheCold: 'rgba(15,30,80,0.25)',
  breatheWarm: 'rgba(80,40,120,0.22)',
  breatheHot:  'rgba(160,30,80,0.28)',

  // Screen flash — champagne shimmer / navy blackout
  flashWin:  'rgba(201,169,110,0.35)',
  flashLose: 'rgba(20,10,60,0.65)',

  // Pub — The Promenade Bar
  pubName:       'THE PROMENADE BAR',
  pubBg:         'radial-gradient(ellipse at 50% 20%, #0e0820 0%, #06040f 45%, #030208 100%)',
  pubAccentBar:  'linear-gradient(90deg, transparent, #604a1c 30%, #c9a96e 50%, #604a1c 70%, transparent)',
  pubOverlayBg:  'radial-gradient(ellipse at 50% 0%, rgba(140,80,0,0.06) 0%, transparent 70%)',
  pubTitleColor: '#c9a96e',
  pubTitleShadow: '0 0 20px #a07830, 0 0 40px #3a2800',
  pubSubtextColor: 'rgba(201,169,110,0.50)',

  // Boss — Salon Privé (Mme. Le Prix)
  bossBg:         'radial-gradient(ellipse at 50% 30%, #1a0614 0%, #0a0310 55%, #040108 100%)',
  bossAccentBar:  'linear-gradient(90deg, transparent, #4a0e24 30%, #9b2335 50%, #4a0e24 70%, transparent)',
  bossGlow:       'radial-gradient(ellipse at 50% 40%, rgba(140,30,70,0.10) 0%, transparent 65%)',
  bossTextColor:  '#c9a96e',
  bossTitleShadow: '0 0 30px rgba(201,169,110,0.50), 0 0 80px rgba(100,60,20,0.35)',
  bossBorderColor: 'rgba(100,25,50,0.55)',
  bossStarColor:   '#c9a96e',
  bossStarBg:      'rgba(74,14,36,0.40)',
  bossStarBorder:  '2px solid rgba(155,35,53,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(155,35,53,0.20)',
};

// =============================================================================
// Floor 3 — The Strip (The Penthouse)
// =============================================================================
// Vegas tower penthouse, 60 floors up. The felt is near-black obsidian. Gold
// hardens from warm to electric. Neon magenta pulses in the breathing overlay.
// No warmth, no texture, no mercy. Pure money, pure machine.

const FLOOR_3_THEME: FloorTheme = {
  // Felt — near-black obsidian with violet undertone
  feltPrimary: '#05020f',
  feltRail:    '#020109',
  feltTexture: feltTextureUri('#05020f', '#030109', '#080318'),

  // Accents — electric gold
  accentBright:  '#ffd700',
  accentPrimary: '#d4a800',
  accentDim:     '#7a5f00',

  // Borders
  borderHigh: 'rgba(212,168,0,0.50)',
  borderLow:  'rgba(212,168,0,0.30)',

  // Breathing — city blue → electric violet → neon magenta strobe
  breatheCold: 'rgba(0,80,160,0.15)',
  breatheWarm: 'rgba(120,20,160,0.18)',
  breatheHot:  'rgba(255,30,100,0.25)',

  // Screen flash — blinding white-gold / neon magenta-red
  flashWin:  'rgba(255,240,80,0.45)',
  flashLose: 'rgba(220,20,80,0.55)',

  // Pub — The Sky Lounge
  pubName:       'THE SKY LOUNGE',
  pubBg:         'radial-gradient(ellipse at 50% 15%, #100020 0%, #050010 50%, #000000 100%)',
  pubAccentBar:  'linear-gradient(90deg, transparent, #a0004a 30%, #ffd700 50%, #a0004a 70%, transparent)',
  pubOverlayBg:  'radial-gradient(ellipse at 50% 0%, rgba(0,80,200,0.04) 0%, rgba(200,20,80,0.04) 100%)',
  pubTitleColor: '#ffd700',
  pubTitleShadow: '0 0 20px rgba(255,215,0,0.60), 0 0 60px rgba(180,0,80,0.30)',
  pubSubtextColor: 'rgba(200,200,220,0.45)',

  // Boss — The Penthouse (The Executive)
  bossBg:         'radial-gradient(ellipse at 50% 25%, #0a0615 0%, #040210 50%, #000000 100%)',
  bossAccentBar:  'linear-gradient(90deg, transparent, #7a5f00 30%, #ffd700 50%, #7a5f00 70%, transparent)',
  bossGlow:       'radial-gradient(ellipse at 50% 40%, rgba(80,30,160,0.06) 0%, transparent 65%)',
  bossTextColor:  '#ffd700',
  bossTitleShadow: '0 0 30px rgba(255,215,0,0.50), 0 0 80px rgba(100,80,0,0.30)',
  bossBorderColor: 'rgba(180,140,0,0.50)',
  bossStarColor:   '#ffd700',
  bossStarBg:      'rgba(80,60,0,0.35)',
  bossStarBorder:  '2px solid rgba(212,168,0,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(212,168,0,0.25)',
};

// =============================================================================
// Theme registry + public API
// =============================================================================

const THEMES: FloorTheme[] = [FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME];

/**
 * Returns the FloorTheme for the given gauntlet marker index.
 * Floor is derived as Math.floor(markerIndex / 3), clamped to [0, 2].
 */
export function getFloorTheme(markerIndex: number): FloorTheme {
  const floor = Math.max(0, Math.min(2, Math.floor(markerIndex / 3)));
  return THEMES[floor]!;
}

/**
 * Returns the zero-based floor number (0, 1, or 2) for a marker index.
 * Exported for use in components that need the floor number directly.
 */
export function getFloorIndex(markerIndex: number): number {
  return Math.max(0, Math.min(2, Math.floor(markerIndex / 3)));
}
