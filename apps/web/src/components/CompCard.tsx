// =============================================================================
// BATTLECRAPS — COMP CARD
// apps/web/src/components/CompCard.tsx
//
// Reusable casino comp card component used in two contexts:
//   • 'fan'       — compact 58×76px slot inside CompCardFan HUD stack
//   • 'cinematic' — large centred card in BossVictoryCompPhase
//
// COMP_DEFS and getCompForBossMarker() are also exported so both the HUD and
// the cinematic phase can resolve comp metadata without duplicating the table.
// =============================================================================

import React from 'react';

// ---------------------------------------------------------------------------
// Comp definitions
// ---------------------------------------------------------------------------

export interface CompDef {
  perkId:      number;
  threshold:   number;   // currentMarkerIndex must be >= this to have earned it
  name:        string;
  icon:        string;
  effect:      string;   // mechanical description shown in fan tooltip
  accentColor: string;
}

export const COMP_DEFS: CompDef[] = [
  {
    perkId:      1,
    threshold:   3,
    name:        "Member's Jacket",
    icon:        '🪖',
    effect:      '+1 Shooter granted at each segment reset. Defeat Sarge reward.',
    accentColor: '#d4891a',  // amber — VFW Hall floor
  },
  {
    perkId:      2,
    threshold:   6,
    name:        'Sea Legs',
    icon:        '⚓',
    effect:      'Hype resets to 50% on Seven Out instead of zeroing. Mme. Le Prix reward.',
    accentColor: '#0d9488',  // teal — Riverboat floor
  },
  {
    perkId:      3,
    threshold:   9,
    name:        'Golden Touch',
    icon:        '👑',
    effect:      'Guaranteed Natural on the first come-out of each segment. The Executive reward.',
    accentColor: '#f5c842',  // gold — The Strip floor
  },
];

/**
 * Resolve the CompDef for a boss defeat. Boss markers sit at indices 2, 5, 8;
 * each has threshold = markerIndex + 1 in COMP_DEFS.
 */
export function getCompForBossMarker(markerIndex: number): CompDef | undefined {
  return COMP_DEFS.find((c) => c.threshold === markerIndex + 1);
}

// ---------------------------------------------------------------------------
// CompCard component
// ---------------------------------------------------------------------------

interface CompCardFanProps {
  variant:      'fan';
  name:         string;
  icon:         string;
  accentColor:  string;
  effect:       string;
  showTooltip?: boolean;
}

interface CompCardCinematicProps {
  variant:     'cinematic';
  name:        string;
  icon:        string;
  accentColor: string;
  effect:      string;
  className?:  string;
}

type CompCardProps = CompCardFanProps | CompCardCinematicProps;

export const CompCard: React.FC<CompCardProps> = (props) => {
  // ── Fan variant (inner content only — wrapper lives in CompCardFan) ────────
  if (props.variant === 'fan') {
    const { name, icon, accentColor, effect, showTooltip = false } = props;
    return (
      <>
        {/* Accent strip */}
        <div className="w-full h-[5px] flex-none" style={{ background: accentColor }} />

        {/* Icon */}
        <div className="text-[20px] leading-none mt-1">{icon}</div>

        {/* COMP stamp */}
        <div
          className="font-pixel text-[4px] tracking-widest mt-0.5 leading-none"
          style={{ color: 'rgba(0,0,0,0.35)' }}
        >
          COMP
        </div>

        {/* Card name */}
        <div
          className="font-pixel text-[5px] text-center leading-tight px-0.5 mt-0.5"
          style={{ color: 'rgba(0,0,0,0.75)' }}
        >
          {name}
        </div>

        {/* Tooltip (fan-open hover) */}
        {showTooltip && (
          <div
            className="
              absolute left-full ml-2 top-0
              w-36 px-2 py-1.5 rounded
              font-mono text-[8px] text-white/90 leading-snug
              bg-black/90 border border-white/20
              pointer-events-none z-50
              opacity-0 group-hover:opacity-100
              transition-opacity duration-150
            "
          >
            <div
              className="font-pixel text-[5px] mb-1 tracking-widest"
              style={{ color: accentColor }}
            >
              {name.toUpperCase()}
            </div>
            {effect}
          </div>
        )}
      </>
    );
  }

  // ── Cinematic variant — large centred casino card ──────────────────────────
  const { name, icon, accentColor, effect, className = '' } = props;

  return (
    <div
      className={`relative flex flex-col items-center overflow-hidden rounded-md bg-[#fdf6e3] w-56 shadow-[0_12px_50px_rgba(0,0,0,0.75)] ${className}`}
    >
      {/* Thick top accent strip */}
      <div className="w-full h-3 flex-none" style={{ background: accentColor }} />

      {/* Subtle inner depth shadow */}
      <div
        className="absolute top-3 left-0 right-0 h-2 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15), transparent)' }}
      />

      {/* Large icon */}
      <div className="text-[52px] leading-none mt-5">{icon}</div>

      {/* COMP AWARDED badge */}
      <div
        className="mt-3 px-3 py-0.5 rounded-full font-pixel text-[5px] tracking-[0.3em]"
        style={{
          background: `${accentColor}22`,
          color:      accentColor,
          border:     `1px solid ${accentColor}55`,
        }}
      >
        COMP AWARDED
      </div>

      {/* Comp name */}
      <div
        className="font-pixel text-[13px] text-center leading-tight px-5 mt-3"
        style={{ color: 'rgba(0,0,0,0.85)' }}
      >
        {name}
      </div>

      {/* Divider */}
      <div
        className="w-2/3 h-px mt-3"
        style={{ background: `${accentColor}55` }}
      />

      {/* Effect / flavor text */}
      <p
        className="font-pixel text-[6px] text-center leading-relaxed px-5 mt-2.5 pb-6"
        style={{ color: 'rgba(0,0,0,0.55)' }}
      >
        {effect}
      </p>
    </div>
  );
};
