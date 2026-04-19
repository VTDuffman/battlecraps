// =============================================================================
// BATTLECRAPS — HOW TO PLAY SCREEN
// apps/web/src/components/tutorial/HowToPlayScreen.tsx
//
// Static three-section reference. No interactivity beyond section navigation.
// Accessible from TitleLobbyScreen at any time.
//
// Sections:
//   1. Craps Basics        — base craps mechanics reference cards
//   2. BattleCraps Rules   — marker system, hype, gauntlet targets
//   3. Crew & Bosses       — card gallery (roster + boss entries)
// =============================================================================

import React, { useState } from 'react';
import { getFloorTheme }      from '../../lib/floorThemes.js';
import { CrapsBasicsSection } from './sections/CrapsBasicsSection.js';
import { BattleCrapsRulesSection } from './sections/BattleCrapsRulesSection.js';
import { CrewAndBossesSection }    from './sections/CrewAndBossesSection.js';

const theme = getFloorTheme(0);

// ---------------------------------------------------------------------------
// Section config
// ---------------------------------------------------------------------------

type SectionId = 'craps-basics' | 'bc-rules' | 'crew-bosses';

interface SectionDef {
  id:       SectionId;
  label:    string;
  icon:     string;
  subtitle: string;
  component: React.FC;
}

const SECTIONS: SectionDef[] = [
  {
    id:        'craps-basics',
    label:     'CRAPS BASICS',
    icon:      '🎲',
    subtitle:  'Come-out, Pass Line, Point, Odds, Hardways',
    component: CrapsBasicsSection,
  },
  {
    id:        'bc-rules',
    label:     'BATTLECRAPS RULES',
    icon:      '🏆',
    subtitle:  'Markers, Hype, Gauntlet, Bosses',
    component: BattleCrapsRulesSection,
  },
  {
    id:        'crew-bosses',
    label:     'CREW & BOSSES',
    icon:      '👥',
    subtitle:  "Your roster, abilities, and who's waiting",
    component: CrewAndBossesSection,
  },
];

// ---------------------------------------------------------------------------
// Section picker (top-level menu)
// ---------------------------------------------------------------------------

interface SectionPickerProps {
  onSelect: (id: SectionId) => void;
  onBack:   () => void;
}

const SectionPicker: React.FC<SectionPickerProps> = ({ onSelect, onBack }) => (
  <div className="flex flex-col h-full">
    {/* Header */}
    <div className="flex-none px-5 pt-5 pb-3 border-b border-white/10 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="font-pixel text-[8px] text-gray-400 hover:text-gray-200 transition-colors active:scale-95"
        aria-label="Back to lobby"
      >
        ← BACK
      </button>
      <div
        className="flex-1 font-pixel text-[10px] text-center tracking-widest"
        style={{ color: theme.accentBright }}
      >
        HOW TO PLAY
      </div>
      <div className="w-12" /> {/* spacer to balance back button */}
    </div>

    {/* Section list */}
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          className="
            w-full text-left rounded border
            px-4 py-4
            transition-all duration-150 active:scale-[0.98]
          "
          style={{
            borderColor: `${theme.accentDim}50`,
            background:  `linear-gradient(135deg, ${theme.feltPrimary}40 0%, #050505 100%)`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentPrimary}80`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = `${theme.accentDim}50`;
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{section.icon}</span>
            <div className="flex-1">
              <div
                className="font-pixel text-[9px] tracking-widest"
                style={{ color: theme.accentBright }}
              >
                {section.label}
              </div>
              <div className="font-dense text-[8px] text-gray-400 mt-0.5">
                {section.subtitle}
              </div>
            </div>
            <span
              className="font-pixel text-[8px]"
              style={{ color: `${theme.accentDim}90` }}
            >
              →
            </span>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Section view (content + back button)
// ---------------------------------------------------------------------------

interface SectionViewProps {
  section: SectionDef;
  onBack:  () => void;
}

const SectionView: React.FC<SectionViewProps> = ({ section, onBack }) => {
  const Component = section.component;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-5 pt-5 pb-3 border-b border-white/10 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-pixel text-[8px] text-gray-400 hover:text-gray-200 transition-colors active:scale-95"
          aria-label="Back to section list"
        >
          ← BACK
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-base">{section.icon}</span>
          <span
            className="font-pixel text-[9px] tracking-widest"
            style={{ color: theme.accentBright }}
          >
            {section.label}
          </span>
        </div>
        <div className="w-12" />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-3">
        <Component />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface HowToPlayScreenProps {
  onBack: () => void;
}

export const HowToPlayScreen: React.FC<HowToPlayScreenProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  const currentSection = activeSection
    ? SECTIONS.find((s) => s.id === activeSection) ?? null
    : null;

  return (
    <div
      className="relative w-full max-w-lg mx-auto h-[100dvh] flex flex-col overflow-hidden border-x-4"
      style={{
        background:   `radial-gradient(ellipse at 50% 30%, ${theme.feltPrimary}50 0%, #010101 60%, #000 100%)`,
        borderColor:  theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 flex-none"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Content area */}
      <div className="flex-1 overflow-hidden pt-1">
        {currentSection ? (
          <SectionView
            section={currentSection}
            onBack={() => setActiveSection(null)}
          />
        ) : (
          <SectionPicker
            onSelect={setActiveSection}
            onBack={onBack}
          />
        )}
      </div>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 flex-none"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
