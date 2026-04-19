// =============================================================================
// BATTLECRAPS — CREW & BOSSES REFERENCE SECTION
// apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx
//
// Card gallery showing recruited crew and bosses.
// - Crew: fetches GET /crew-roster; shows locked crew as redacted
// - Bosses: reads from GAUNTLET config; blurred until player has reached that floor
//
// currentMarkerIndex from store gates boss reveal:
//   - Boss 1 (Floor 1): visible once currentMarkerIndex >= 2
//   - Boss 2 (Floor 2): visible once currentMarkerIndex >= 5
//   - Boss 3 (Floor 3): visible once currentMarkerIndex >= 8
// =============================================================================

import React, { useEffect } from 'react';
import { GAUNTLET }         from '@battlecraps/shared';
import { useGameStore }     from '../../../store/useGameStore.js';
import type { CrewRosterEntry, GameState } from '../../../store/useGameStore.js';
import { CREW_EMOJI }       from '../../CrewPortrait.js';

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
            className={`font-pixel text-[6px] px-1.5 py-0.5 rounded ${rarityStyle.bg} ${rarityStyle.text}`}
          >
            {crew.rarity.toUpperCase()}
          </div>
        </div>
        <div className="font-dense text-[8px] text-gray-500 italic">
          {crew.unlockDescription || 'Unlock condition not yet met.'}
        </div>
        {crew.unlockProgress !== null && crew.unlockThreshold !== null && (
          <div className="space-y-0.5">
            <div className="flex justify-between font-dense text-[7px] text-gray-500">
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-pixel text-[8px] text-white">{crew.name}</span>
            <span
              className={`font-pixel text-[6px] px-1 py-0.5 rounded ${rarityStyle.bg} ${rarityStyle.text}`}
            >
              {crew.rarity.toUpperCase()}
            </span>
            <span
              className={`font-pixel text-[6px] px-1 py-0.5 rounded ${categoryStyle.bg} ${categoryStyle.text}`}
            >
              {crew.abilityCategory}
            </span>
          </div>
          <div className="font-dense text-[8px] text-gray-300 mt-0.5">
            ${(crew.baseCostCents / 100).toFixed(0)} to hire
          </div>
        </div>
      </div>
      {crew.briefDescription && (
        <p className="font-dense text-[8px] text-gray-200 leading-relaxed">
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
  markerIndex: number;   // 2, 5, or 8
  revealed:    boolean;
}

const BossCard: React.FC<BossCardProps> = ({ markerIndex, revealed }) => {
  const marker = GAUNTLET[markerIndex];
  if (!marker?.boss) return null;
  const { boss } = marker;

  if (!revealed) {
    return (
      <div className="border border-red-900/30 rounded p-3 bg-red-950/10 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl grayscale opacity-30">❓</span>
          <div className="flex-1 space-y-1">
            <div className="h-2 w-20 bg-red-900/30 rounded" />
            <div className="h-1.5 w-12 bg-red-900/20 rounded" />
          </div>
          <span className="font-pixel text-[6px] text-red-400/40 border border-red-900/30 px-1.5 py-0.5 rounded">
            FLOOR {Math.floor(markerIndex / 3) + 1}
          </span>
        </div>
        <p className="font-dense text-[8px] text-red-700 italic">
          Defeat the previous boss to reveal.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-red-900/50 rounded p-3 bg-red-950/20 space-y-1.5">
      <div className="flex items-start gap-2">
        <span className="text-2xl flex-none">⚔️</span>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-pixel text-[8px] text-red-300">{boss.name}</span>
            <span className="font-pixel text-[6px] text-red-400/70 border border-red-900/40 px-1 py-0.5 rounded">
              {boss.title}
            </span>
          </div>
          <div className="font-dense text-[7px] text-red-500 mt-0.5">
            Floor {Math.floor(markerIndex / 3) + 1} · Marker {markerIndex + 1}
          </div>
        </div>
      </div>
      <p className="font-dense text-[8px] text-red-300 leading-relaxed">
        {boss.ruleBlurb}
      </p>
      {boss.compDescription && (
        <div className="border-t border-red-900/30 pt-1.5 mt-1">
          <span className="font-pixel text-[6px] text-amber-400">DEFEAT REWARD: </span>
          <span className="font-dense text-[8px] text-amber-300">{boss.compName} — {boss.compDescription}</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Roster section header
// ---------------------------------------------------------------------------

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-pixel text-[7px] text-gray-400 tracking-widest uppercase pt-3 pb-1 border-b border-white/10">
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CrewAndBossesSection: React.FC = () => {
  const crewRoster         = useGameStore((s: GameState) => s.crewRoster);
  const fetchCrewRoster    = useGameStore((s) => s.fetchCrewRoster);
  const currentMarkerIndex = useGameStore((s: GameState) => s.currentMarkerIndex);

  // Trigger a roster fetch if not already loaded
  useEffect(() => {
    void fetchCrewRoster();
  }, [fetchCrewRoster]);

  // Boss reveal thresholds: boss marker index must be <= currentMarkerIndex
  const bossRevealed = (bossMarkerIndex: number) => currentMarkerIndex >= bossMarkerIndex;

  // Split roster into starter and unlocked-gated groups
  const starter  = (crewRoster ?? []).filter((c: CrewRosterEntry) => c.rarity === 'Starter');
  const advanced = (crewRoster ?? []).filter((c: CrewRosterEntry) => c.rarity !== 'Starter');

  return (
    <div className="space-y-1 pb-4">

      {/* ── Bosses ─────────────────────────────────────────────────────────── */}
      <SectionHeader>Bosses</SectionHeader>
      <p className="font-dense text-[9px] text-gray-400 py-2">
        One boss waits at the end of each floor. Defeat them to earn a permanent
        comp perk. Bosses are revealed as you progress.
      </p>
      <div className="space-y-2 mt-1">
        <BossCard markerIndex={2} revealed={bossRevealed(2)} />
        <BossCard markerIndex={5} revealed={bossRevealed(5)} />
        <BossCard markerIndex={8} revealed={bossRevealed(8)} />
      </div>

      {/* ── Crew ───────────────────────────────────────────────────────────── */}
      <SectionHeader>Your Crew</SectionHeader>
      <p className="font-dense text-[9px] text-gray-400 py-2">
        Recruit crew at the pub between markers. Abilities fire left-to-right
        before every roll. Five slots total.
      </p>

      {crewRoster === null ? (
        <div className="font-pixel text-[8px] text-gray-500 text-center py-6 animate-pulse">
          LOADING ROSTER…
        </div>
      ) : (
        <>
          {advanced.length > 0 && (
            <>
              <div className="font-pixel text-[7px] text-amber-300/60 pt-2 pb-1">
                UNLOCKABLE CREW
              </div>
              <div className="space-y-2">
                {advanced.map((crew: CrewRosterEntry) => (
                  <CrewCard key={crew.id} crew={crew} />
                ))}
              </div>
            </>
          )}

          <div className="font-pixel text-[7px] text-gray-400 pt-3 pb-1">
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
