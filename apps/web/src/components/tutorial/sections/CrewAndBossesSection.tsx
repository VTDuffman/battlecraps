// =============================================================================
// BATTLECRAPS — CREW & BOSSES REFERENCE SECTION
// apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx
//
// Card gallery showing recruited crew and bosses.
// - Crew: fetches GET /crew-roster; shows locked crew as redacted
// - Bosses: reads from GAUNTLET config; blurred until player has reached that floor
//
// currentMarkerIndex from store gates boss reveal:
//   Bosses at marker indices 2, 5, 8, 11, 14, 17, 20, 23, 26 — one per floor.
//   A boss card is revealed once currentMarkerIndex >= that boss's marker index.
// =============================================================================

import React, { useEffect } from 'react';
import { GAUNTLET }                from '@battlecraps/shared';
import { useGameStore }            from '../../../store/useGameStore.js';
import type { CrewRosterEntry, GameState } from '../../../store/useGameStore.js';
import { CREW_EMOJI }              from '../../CrewPortrait.js';
import { getCompForBossMarker }    from '../../CompCard.js';
import { getFloorTheme }           from '../../../lib/floorThemes.js';

// ---------------------------------------------------------------------------
// Rarity styles (mirrors PubScreen)
// ---------------------------------------------------------------------------

const RARITY_STYLES: Record<string, { bg: string; text: string }> = {
  Starter:   { bg: 'bg-stone-700/60',  text: 'text-stone-300' },
  Common:    { bg: 'bg-stone-600/60',  text: 'text-stone-200' },
  Uncommon:  { bg: 'bg-green-900/60',  text: 'text-green-300' },
  Rare:      { bg: 'bg-blue-900/60',   text: 'text-blue-300' },
  Epic:      { bg: 'bg-purple-900/60', text: 'text-purple-300' },
  Legendary: { bg: 'bg-amber-900/60',  text: 'text-amber-300' },
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  DICE:     { bg: 'bg-blue-900/50',   text: 'text-blue-300' },
  TABLE:    { bg: 'bg-green-900/50',  text: 'text-green-300' },
  PAYOUT:   { bg: 'bg-yellow-900/50', text: 'text-yellow-300' },
  HYPE:     { bg: 'bg-purple-900/50', text: 'text-purple-300' },
  WILDCARD: { bg: 'bg-red-900/50',    text: 'text-red-300' },
};

// ---------------------------------------------------------------------------
// Crew card
// ---------------------------------------------------------------------------

const CrewCard: React.FC<{ crew: CrewRosterEntry }> = ({ crew }) => {
  const rarityStyle   = RARITY_STYLES[crew.rarity] ?? RARITY_STYLES['Common']!;
  const categoryStyle = CATEGORY_STYLES[crew.abilityCategory] ?? CATEGORY_STYLES['DICE']!;
  const emoji         = CREW_EMOJI[crew.id] ?? '🎲';

  if (!crew.isAvailable) {
    // Locked crew — redacted display
    return (
      <div className="border border-white/10 rounded p-3 bg-white/[0.02] opacity-50 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl grayscale">🔒</span>
          <div className="flex-1 space-y-1">
            <div className="h-2 w-24 bg-white/10 rounded" />
            <div className="h-1.5 w-16 bg-white/5 rounded" />
          </div>
          <div
            className={`font-pixel text-r-14 px-1.5 py-0.5 rounded ${rarityStyle.bg} ${rarityStyle.text}`}
          >
            {crew.rarity.toUpperCase()}
          </div>
        </div>
        <div className="text-r-12 text-white/30 italic">
          {crew.unlockDescription || 'Unlock condition not yet met.'}
        </div>
        {crew.unlockProgress !== null && crew.unlockThreshold !== null && (
          <div className="space-y-0.5">
            <div className="flex justify-between text-r-11 text-white/30">
              <span>PROGRESS</span>
              <span>{crew.unlockProgress} / {crew.unlockThreshold}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/20"
                style={{ width: `${Math.min((crew.unlockProgress / crew.unlockThreshold) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded p-3 bg-white/[0.02] space-y-1.5">
      <div className="flex items-start gap-2">
        <span className="text-2xl flex-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <span className="font-pixel text-r-12 text-white/90">{crew.name}</span>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span
              className={`font-pixel text-r-7 px-1 py-0.5 rounded ${rarityStyle.bg} ${rarityStyle.text}`}
            >
              {crew.rarity.toUpperCase()}
            </span>
            <span
              className={`font-pixel text-r-7 px-1 py-0.5 rounded ${categoryStyle.bg} ${categoryStyle.text}`}
            >
              {crew.abilityCategory}
            </span>
          </div>
        </div>
      </div>
      {crew.briefDescription && (
        <p className="font-mono text-r-12 text-white/60 leading-relaxed">
          {crew.briefDescription}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Boss card
// ---------------------------------------------------------------------------

interface BossCardProps {
  markerIndex: number;   // 2, 5, 8, 11, 14, 17, 20, 23, 26 — one per floor
  revealed:    boolean;
}

const BossCard: React.FC<BossCardProps> = ({ markerIndex, revealed }) => {
  const marker = GAUNTLET[markerIndex];
  if (!marker?.boss) return null;
  const { boss } = marker;

  if (!revealed) {
    return (
      <div
        className="rounded p-3 space-y-1.5"
        style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl grayscale opacity-30">❓</span>
          <div className="flex-1 space-y-1">
            <div className="h-2 w-20 rounded" style={{ background: 'rgba(255,255,255,0.10)' }} />
            <div className="h-1.5 w-12 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <span
            className="font-pixel text-r-11 px-1.5 py-0.5 rounded self-center"
            style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            FLOOR {Math.floor(markerIndex / 3) + 1}
          </span>
        </div>
        <p className="font-mono text-r-12 italic" style={{ color: 'rgba(255,255,255,0.20)' }}>
          Defeat the previous boss to reveal.
        </p>
      </div>
    );
  }

  const ft = getFloorTheme(markerIndex);
  // Floor 9 theme is designed for white backgrounds; flip to light tones in the dark HTP context
  const isNullSpace = Math.floor(markerIndex / 3) === 8;
  const textColor   = isNullSpace ? '#f0f0f0' : ft.bossTextColor;
  const accentHi    = isNullSpace ? '#cccccc' : ft.accentBright;
  const accentMid   = isNullSpace ? '#999999' : ft.accentPrimary;
  const accentLo    = isNullSpace ? '#555555' : ft.accentDim;
  const borderColor = isNullSpace ? 'rgba(255,255,255,0.20)' : ft.bossBorderColor;
  const borderFaint = isNullSpace ? 'rgba(255,255,255,0.10)' : ft.borderLow;

  const compIcon = getCompForBossMarker(markerIndex)?.icon ?? '⚡';

  return (
    <div
      className="rounded p-3 space-y-1.5"
      style={{ border: `1px solid ${borderColor}`, background: accentLo + '1a' }}
    >
      <div className="flex items-start gap-2">
        <span className="text-2xl flex-none">{compIcon}</span>
        <div className="flex-1">
          <span className="font-pixel text-r-12" style={{ color: textColor }}>
            {boss.name}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span
              className="font-pixel text-r-7 px-1 py-0.5 rounded"
              style={{ color: accentHi + 'b3', border: `1px solid ${accentLo + '99'}` }}
            >
              {boss.title}
            </span>
            <span className="font-mono text-r-11" style={{ color: accentMid + '99' }}>
              Floor {Math.floor(markerIndex / 3) + 1} · Marker {markerIndex + 1}
            </span>
          </div>
        </div>
      </div>
      <p className="font-mono text-r-12 leading-relaxed" style={{ color: textColor + 'b3' }}>
        {boss.ruleBlurb}
      </p>
      {boss.compDescription && (
        <div className="pt-1.5 mt-1" style={{ borderTop: `1px solid ${borderFaint}` }}>
          <span className="font-pixel text-r-7" style={{ color: accentHi + '99' }}>DEFEAT REWARD: </span>
          <span className="font-mono text-r-12" style={{ color: accentMid + '99' }}>
            {boss.compName} — {boss.compDescription}
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Roster section header
// ---------------------------------------------------------------------------

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-pixel text-r-11 text-white/40 tracking-widest uppercase pt-3 pb-1 border-b border-white/10">
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CrewAndBossesSection: React.FC = () => {
  const crewRoster           = useGameStore((s: GameState) => s.crewRoster);
  const fetchCrewRoster      = useGameStore((s) => s.fetchCrewRoster);
  const currentMarkerIndex   = useGameStore((s: GameState) => s.currentMarkerIndex);
  const highestMarkerReached = useGameStore((s: GameState) => s.highestMarkerReached);

  // Trigger a roster fetch if not already loaded
  useEffect(() => {
    void fetchCrewRoster();
  }, [fetchCrewRoster]);

  // A boss is revealed only after the player has beaten them (advanced past
  // their marker index). Uses the lifetime high-water mark so prior runs
  // permanently unlock boss cards the player has already defeated.
  const bossRevealed = (bossMarkerIndex: number) =>
    Math.max(currentMarkerIndex, highestMarkerReached) >= bossMarkerIndex + 1;

  // Split roster into starter and unlocked-gated groups
  const starter  = (crewRoster ?? []).filter((c: CrewRosterEntry) => c.rarity === 'Starter');
  const advanced = (crewRoster ?? []).filter((c: CrewRosterEntry) => c.rarity !== 'Starter');

  return (
    <div className="space-y-1 pb-4">

      {/* ── Bosses ─────────────────────────────────────────────────────────── */}
      <SectionHeader>Bosses</SectionHeader>
      <p className="font-mono text-r-14 text-white/40 py-2">
        One boss waits at the end of each floor. Defeat them to earn a permanent
        comp perk. Bosses are revealed as you progress.
      </p>
      <div className="space-y-2 mt-1">
        {[2, 5, 8, 11, 14, 17, 20, 23, 26].map((idx) => (
          <BossCard key={idx} markerIndex={idx} revealed={bossRevealed(idx)} />
        ))}
      </div>

      {/* ── Crew ───────────────────────────────────────────────────────────── */}
      <SectionHeader>Your Crew</SectionHeader>
      <p className="font-mono text-r-14 text-white/40 py-2">
        Recruit crew at the pub between markers. Abilities fire left-to-right
        before every roll. Start with three slots — earn more by defeating bosses.
      </p>

      {crewRoster === null ? (
        <div className="font-pixel text-r-12 text-white/30 text-center py-6 animate-pulse">
          LOADING ROSTER…
        </div>
      ) : (
        <>
          {advanced.length > 0 && (
            <>
              <div className="font-pixel text-r-11 text-amber-300/60 pt-2 pb-1">
                UNLOCKABLE CREW
              </div>
              <div className="space-y-2">
                {advanced.map((crew: CrewRosterEntry) => (
                  <CrewCard key={crew.id} crew={crew} />
                ))}
              </div>
            </>
          )}

          <div className="font-pixel text-r-11 text-white/40 pt-3 pb-1">
            STARTER CREW — ALWAYS AVAILABLE
          </div>
          <div className="space-y-2">
            {starter.map((crew: CrewRosterEntry) => (
              <CrewCard key={crew.id} crew={crew} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
