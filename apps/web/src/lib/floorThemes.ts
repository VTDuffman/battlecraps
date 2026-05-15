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
// Floor 1 — The Loading Dock
// =============================================================================
// Stained concrete, sodium-vapor streetlamp orange, cold alleyway shadows.
// The absolute baseline — out back behind a warehouse before you're even inside.

const FLOOR_1_THEME: FloorTheme = {
  // Felt — stained concrete / asphalt
  feltPrimary: '#1c1d21',
  feltRail:    '#0a0a0c',
  feltTexture: feltTextureUri('#1c1d21', '#0a0a0c', '#2d2f36'),

  // Accents — sodium-vapor orange
  accentBright:  '#ff9900',
  accentPrimary: '#b35900',
  accentDim:     '#4a2c11',

  // Borders — rust orange
  borderHigh: 'rgba(179,89,0,0.30)',
  borderLow:  'rgba(179,89,0,0.20)',

  // Breathing — night cold / streetlamp warm / police siren hot
  breatheCold: 'rgba(30,35,50,0.20)',
  breatheWarm: 'rgba(200,100,0,0.18)',
  breatheHot:  'rgba(220,20,40,0.22)',

  // Screen flash — streetlamp surge / alleyway shadow plunge
  flashWin:  'rgba(255,153,0,0.35)',
  flashLose: 'rgba(20,25,35,0.50)',

  // Pub — The Milk Crate Circle
  pubName:         'THE MILK CRATE CIRCLE',
  pubBg:           'radial-gradient(ellipse at 50% 10%, #2a1500 0%, #110900 40%, #020202 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #7a3800 30%, #ff9900 50%, #7a3800 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 0%, rgba(200,200,220,0.05) 0%, transparent 70%)',
  pubTitleColor:   '#ff9900',
  pubTitleShadow:  '0 0 20px #b35900, 0 0 40px #4a2c11',
  pubSubtextColor: 'rgba(255,153,0,0.45)',

  // Boss — Freight Elevator (The Foreman)
  bossBg:          'radial-gradient(ellipse at 50% 40%, #1a1b20 0%, #0a0a0c 60%, #000000 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #78350f 30%, #eab308 50%, #78350f 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(234,179,8,0.08) 0%, transparent 65%)',
  bossTextColor:   '#eab308',
  bossTitleShadow: '0 0 30px rgba(234,179,8,0.50), 0 0 80px rgba(120,53,15,0.35)',
  bossBorderColor: 'rgba(133,77,14,0.50)',
  bossStarColor:   '#eab308',
  bossStarBg:      'rgba(120,53,15,0.40)',
  bossStarBorder:  '2px solid rgba(234,179,8,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(234,179,8,0.20)',
};

// =============================================================================
// Floor 2 — The Moose Lodge (VFW Hall)
// =============================================================================
// Gritty blue-collar gambling den. Worn green felt, tarnished gold, fluorescent
// grime. The first real indoor table.

const FLOOR_2_THEME: FloorTheme = {
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
// Floor 3 — The Riverboat (Salon Privé)
// =============================================================================
// Mississippi paddlewheel casino salon. Deep navy felt like river water at
// midnight. Aged champagne brass replaces tarnished yellow-gold. Candlelit,
// mahogany-paneled, quiet danger dressed as elegance.

const FLOOR_3_THEME: FloorTheme = {
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
// Floor 4 — The Strip (The Penthouse)
// =============================================================================
// Vegas tower penthouse, 60 floors up. The felt is near-black obsidian. Gold
// hardens from warm to electric. Neon magenta pulses in the breathing overlay.
// No warmth, no texture, no mercy. Pure money, pure machine.

const FLOOR_4_THEME: FloorTheme = {
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
// Floor 5 — The Lodge (The Inner Sanctum)
// =============================================================================
// Marble columns, candlelight, hooded observers. Deep plum-black felt, aged
// amber gold accents, cardinal-red rites. Occult ritual dressed as craps.

const FLOOR_5_THEME: FloorTheme = {
  // Felt — deep plum-black
  feltPrimary: '#0f0b14',
  feltRail:    '#070509',
  feltTexture: feltTextureUri('#0f0b14', '#07040a', '#16101d'),

  // Accents — aged amber gold
  accentBright:  '#c9943a',
  accentPrimary: '#9a6e28',
  accentDim:     '#4a3412',

  // Borders — amber at low opacity
  borderHigh: 'rgba(154,110,40,0.35)',
  borderLow:  'rgba(154,110,40,0.20)',

  // Breathing — occult violet / amber candle / cardinal blood
  breatheCold: 'rgba(40,20,70,0.25)',
  breatheWarm: 'rgba(160,90,20,0.20)',
  breatheHot:  'rgba(180,20,40,0.28)',

  // Screen flash — amber flare / plum-black abyss
  flashWin:  'rgba(201,148,58,0.38)',
  flashLose: 'rgba(30,10,50,0.60)',

  // Pub — The Anteroom
  pubName:         'THE ANTEROOM',
  pubBg:           'radial-gradient(ellipse at 50% 20%, #1a0d28 0%, #0a0610 45%, #040208 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #6b4a18 30%, #c9943a 50%, #6b4a18 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 0%, rgba(80,40,120,0.06) 0%, transparent 70%)',
  pubTitleColor:   '#c9943a',
  pubTitleShadow:  '0 0 20px #9a6e28, 0 0 40px #3a2008',
  pubSubtextColor: 'rgba(201,148,58,0.48)',

  // Boss — The Inner Sanctum (The Hierophant)
  bossBg:          'radial-gradient(ellipse at 50% 30%, #2a0810 0%, #140408 55%, #060102 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #4a0a14 30%, #7a1a2e 50%, #4a0a14 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(120,20,40,0.12) 0%, transparent 65%)',
  bossTextColor:   '#c9943a',
  bossTitleShadow: '0 0 30px rgba(201,148,58,0.50), 0 0 80px rgba(74,10,20,0.40)',
  bossBorderColor: 'rgba(122,26,46,0.55)',
  bossStarColor:   '#c9943a',
  bossStarBg:      'rgba(74,10,20,0.45)',
  bossStarBorder:  '2px solid rgba(122,26,46,0.55)',
  bossStarGlow:    '0 0 20px 4px rgba(122,26,46,0.25)',
};

// =============================================================================
// Floor 6 — Atlantis (The Throne Room)
// =============================================================================
// Marble columns. Three thousand years of coral. Bioluminescent warmth.
// The Sovereign never left — and neither did the tide.

const FLOOR_6_THEME: FloorTheme = {
  // Felt — deep sea-teal
  feltPrimary: '#062535',
  feltRail:    '#031520',
  feltTexture: feltTextureUri('#062535', '#041d2a', '#0a3a4a'),

  // Accents — warm aquamarine bioluminescence
  accentBright:  '#00c9a0',
  accentPrimary: '#009070',
  accentDim:     '#004840',

  // Borders — aquamarine at low opacity
  borderHigh: 'rgba(0,144,112,0.30)',
  borderLow:  'rgba(0,144,112,0.20)',

  // Breathing — abyssal teal / bioluminescent bloom / thermal vent orange
  breatheCold: 'rgba(0,60,80,0.22)',
  breatheWarm: 'rgba(0,160,120,0.18)',
  breatheHot:  'rgba(200,80,20,0.25)',

  // Screen flash — bioluminescent surge / total depth darkness
  flashWin:  'rgba(0,200,160,0.35)',
  flashLose: 'rgba(0,30,50,0.70)',

  // Pub — The Hall of Records
  pubName:         'THE HALL OF RECORDS',
  pubBg:           'radial-gradient(ellipse at 50% 20%, #0a2535 0%, #041520 45%, #010810 100%)',
  pubAccentBar:    'linear-gradient(90deg, transparent, #005840 30%, #00c9a0 50%, #005840 70%, transparent)',
  pubOverlayBg:    'radial-gradient(ellipse at 50% 50%, rgba(0,150,100,0.05) 0%, transparent 70%)',
  pubTitleColor:   '#00c9a0',
  pubTitleShadow:  '0 0 20px #009070, 0 0 40px #004840',
  pubSubtextColor: 'rgba(0,201,160,0.48)',

  // Boss — The Throne Room (The Sovereign)
  bossBg:          'radial-gradient(ellipse at 50% 30%, #082535 0%, #031520 55%, #010810 100%)',
  bossAccentBar:   'linear-gradient(90deg, transparent, #5a4020 30%, #c9a06a 50%, #5a4020 70%, transparent)',
  bossGlow:        'radial-gradient(ellipse at 50% 40%, rgba(0,160,120,0.08) 0%, transparent 65%)',
  bossTextColor:   '#c9a06a',
  bossTitleShadow: '0 0 30px rgba(201,160,106,0.50), 0 0 80px rgba(0,100,80,0.35)',
  bossBorderColor: 'rgba(0,100,80,0.45)',
  bossStarColor:   '#c9a06a',
  bossStarBg:      'rgba(0,80,60,0.40)',
  bossStarBorder:  '2px solid rgba(0,160,120,0.50)',
  bossStarGlow:    '0 0 20px 4px rgba(0,160,120,0.20)',
};

// =============================================================================
// Theme registry + public API
// =============================================================================

const THEMES: FloorTheme[] = [
  FLOOR_1_THEME, FLOOR_2_THEME, FLOOR_3_THEME,
  FLOOR_4_THEME, FLOOR_5_THEME, FLOOR_6_THEME,
];

/**
 * Returns the FloorTheme for the given gauntlet marker index.
 * Floor is derived as Math.floor(markerIndex / 3), clamped to [0, 5].
 */
export function getFloorTheme(markerIndex: number): FloorTheme {
  const floor = Math.max(0, Math.min(5, Math.floor(markerIndex / 3)));
  return THEMES[floor]!;
}

/**
 * Returns the zero-based floor number (0–5) for a marker index.
 * Exported for use in components that need the floor number directly.
 */
export function getFloorIndex(markerIndex: number): number {
  return Math.max(0, Math.min(5, Math.floor(markerIndex / 3)));
}
