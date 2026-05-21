// =============================================================================
// BATTLECRAPS — THE SEVEN-PROOF PUB
// apps/web/src/components/PubScreen.tsx
//
// Shown whenever run.status === 'TRANSITION' (after a gauntlet marker is hit).
// The player can hire one of three randomly-offered crew members, placing them
// in any of the five rail slots (overwriting the occupant if needed), or skip
// and go straight back to the table with fresh shooters.
//
// Data flow:
//   1. On mount, fetch GET /api/v1/crew-roster; pick 3 available crew as draft.
//   2. Player clicks a crew card   → selectedCrew is set; slot rail appears.
//   3. Player clicks a slot        → selectedSlot is set; HIRE button activates.
//   4. Player clicks HIRE          → calls store.recruitCrew(crewId, slotIndex).
//   5. Store sets status → IDLE_TABLE → App unmounts PubScreen, mounts TableBoard.
//   6. SKIP button calls           → store.recruitCrew(null) — no purchase.
// =============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  isBossMarker,
  GAUNTLET,
} from '@battlecraps/shared';
import { useGameStore, selectBankrollDisplay } from '../store/useGameStore.js';
import type { CrewRosterEntry, PubDraftEntry } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';
import { CREW_EMOJI } from './CrewPortrait.js';

// ---------------------------------------------------------------------------
// Category badge styles
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DICE:     { bg: 'bg-blue-900/60',   text: 'text-blue-300',   label: 'DICE' },
  TABLE:    { bg: 'bg-green-900/60',  text: 'text-green-300',  label: 'TABLE' },
  PAYOUT:   { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'PAYOUT' },
  HYPE:     { bg: 'bg-purple-900/60', text: 'text-purple-300', label: 'HYPE' },
  WILDCARD: { bg: 'bg-red-900/60',    text: 'text-red-300',    label: 'WILD' },
};

const CATEGORY_PORTRAIT_BG: Record<string, string> = {
  DICE:     'bg-blue-800/40   border-blue-600/50',
  TABLE:    'bg-green-800/40  border-green-600/50',
  PAYOUT:   'bg-yellow-800/40 border-yellow-600/50',
  HYPE:     'bg-purple-800/40 border-purple-600/50',
  WILDCARD: 'bg-red-800/40    border-red-600/50',
};

// ---------------------------------------------------------------------------
// Rarity badge styles
// ---------------------------------------------------------------------------

const RARITY_STYLES: Record<string, { bg: string; text: string }> = {
  Starter:   { bg: 'bg-stone-700/60',  text: 'text-stone-300' },
  Common:    { bg: 'bg-stone-600/60',  text: 'text-stone-200' },
  Uncommon:  { bg: 'bg-green-900/60',  text: 'text-green-300' },
  Rare:      { bg: 'bg-blue-900/60',   text: 'text-blue-300' },
  Epic:      { bg: 'bg-purple-900/60', text: 'text-purple-300' },
  Legendary: { bg: 'bg-amber-900/60',  text: 'text-amber-300' },
};

// ---------------------------------------------------------------------------
// Current crew name lookup (fallback for IDs 1–15 seated before roster loads)
// ---------------------------------------------------------------------------

const CREW_NAMES_FALLBACK: Record<number, string> = {
  1:  '"Lefty" McGuffin',  2: 'Physics Prof',
  3:  'The Mechanic',      4: 'The Mathlete',
  5:  'Floor Walker',      6: 'The Regular',
  7:  'Big Spender',       8: 'The Shark',
  9:  'The Whale',         10: 'Nervous Intern',
  11: 'Holly (Hype)',      12: 'Drunk Uncle',
  13: 'The Mimic',         14: 'Old Pro',
  15: 'Lucky Charm',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CrewCardProps {
  crew:       PubDraftEntry;
  isSelected: boolean;
  canAfford:  boolean;
  onClick:    () => void;
}

const CrewCard: React.FC<CrewCardProps> = ({ crew, isSelected, canAfford, onClick }) => {
  const cat     = CATEGORY_STYLES[crew.abilityCategory] ?? CATEGORY_STYLES['WILDCARD']!;
  const portrait = CATEGORY_PORTRAIT_BG[crew.abilityCategory] ?? 'bg-stone-700/40 border-stone-600/50';
  const rarity  = RARITY_STYLES[crew.rarity] ?? RARITY_STYLES['Common']!;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canAfford}
      className={[
        'relative flex flex-col gap-2 p-3 rounded-lg text-left',
        'border transition-all duration-150',
        'active:scale-95',
        isSelected
          ? 'bg-amber-800/50 border-amber-400/80 shadow-lg shadow-amber-500/20'
          : canAfford
            ? 'bg-stone-900/70 border-amber-700/30 hover:border-amber-500/60 hover:bg-amber-900/30'
            : 'bg-stone-900/30 border-stone-700/30 opacity-50 cursor-not-allowed',
      ].join(' ')}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-400 rotate-45" />
      )}

      {/* Portrait — emoji centered in a category-themed frame. */}
      <div
        className={[
          'w-full aspect-square rounded border-2 overflow-hidden',
          'flex items-center justify-center',
          portrait,
        ].join(' ')}
      >
        <span className="leading-none select-none" style={{ fontSize: 'clamp(42px, 7.5dvh, 60px)' }}>
          {CREW_EMOJI[crew.id] ?? '?'}
        </span>
      </div>

      {/* Badges row: category + rarity */}
      <div className="flex gap-1 flex-wrap">
        <div className={['self-start px-1.5 py-0.5 rounded text-[7.5px] font-pixel', cat.bg, cat.text].join(' ')}>
          {cat.label}
        </div>
        <div className={['self-start px-1.5 py-0.5 rounded text-[7.5px] font-pixel', rarity.bg, rarity.text].join(' ')}>
          {crew.rarity.toUpperCase()}
        </div>
      </div>

      {/* Name */}
      <div className="font-pixel text-[9px] text-amber-100 leading-relaxed">
        {crew.name}
      </div>

      {/* Description */}
      <div className="font-mono text-[12px] text-amber-300/60 leading-tight flex-1">
        {crew.briefDescription ?? '???'}
      </div>

      {/* Cost */}
      <div
        className={[
          'font-pixel text-[10.5px] mt-1',
          canAfford ? 'text-amber-400' : 'text-red-400',
        ].join(' ')}
      >
        {formatCents(crew.hireCostCents)}
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Slot button in the slot-picker rail
// ---------------------------------------------------------------------------

interface SlotButtonProps {
  index:      number;
  occupantId: number | null;
  occupantName: string | null;
  isSelected: boolean;
  onClick:    () => void;
}

const SlotButton: React.FC<SlotButtonProps> = ({ index, occupantId, isSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'flex flex-col items-center justify-center gap-1 px-2 py-2 rounded border transition-all duration-100',
      'active:scale-95 min-w-0 h-14',
      isSelected
        ? 'bg-amber-600/40 border-amber-400 shadow shadow-amber-400/40'
        : occupantId
          ? 'bg-stone-800/60 border-amber-700/40 hover:border-amber-500/60'
          : 'bg-stone-900/40 border-stone-700/30 hover:border-amber-600/40',
    ].join(' ')}
  >
    {occupantId ? (
      <span className="text-[26px] leading-none">{CREW_EMOJI[occupantId] ?? '?'}</span>
    ) : (
      <>
        <div
          className={[
            'w-5 h-5 rounded flex items-center justify-center font-pixel text-[11.25px]',
            isSelected ? 'bg-amber-500 text-stone-900' : 'bg-stone-700 text-amber-300/60',
          ].join(' ')}
        >
          {index}
        </div>
        <div className="font-pixel text-[9.375px] text-center leading-tight text-stone-600">
          EMPTY
        </div>
      </>
    )}
  </button>
);

// ---------------------------------------------------------------------------
// PubFireSlot — compact crew slot with hold-to-fire for the pub screen
// ---------------------------------------------------------------------------

interface PubFireSlotProps {
  crewId:      number | null;
  crewName:    string | null;
  description: string | null;
  onFire:      (() => void) | undefined;
}

const PubFireSlot: React.FC<PubFireSlotProps> = ({ crewId, crewName, description, onFire }) => {
  const [holding, setHolding] = useState(false);
  const holdTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startHold() {
    if (!onFire) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      onFire();
    }, 1000);
  }

  function cancelHold() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    setHolding(false);
  }

  if (!crewId) {
    // Empty slot — dim placeholder, no fire button
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-2 h-16 rounded border border-stone-700/20 bg-stone-900/20 min-w-0">
        <div className="w-5 h-5 rounded border border-dashed border-stone-700/40" />
        <div className="font-pixel text-[9.375px] text-stone-700">EMPTY</div>
      </div>
    );
  }

  return (
    <div
      className="group relative flex flex-col items-center justify-center px-2 h-16 rounded border border-amber-800/40 bg-stone-900/40 outline-none min-w-0"
      tabIndex={onFire ? 0 : -1}
    >
      {/* Emoji portrait */}
      <div className="text-[30px] leading-none">{CREW_EMOJI[crewId]}</div>

      {/* Tooltip — floats above slot on hover */}
      {description && (
        <div className="
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          w-44 px-2 py-1.5 rounded
          font-mono text-[10px] text-white/90 leading-snug
          bg-black/90 border border-white/20
          pointer-events-none z-50
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          whitespace-normal text-left
        ">
          <div className="font-pixel text-[6.25px] mb-1 tracking-widest text-amber-300/80">
            {crewName?.toUpperCase()}
          </div>
          {description}
        </div>
      )}

      {/* Fire button — revealed on hover/focus */}
      {onFire && (
        <button
          type="button"
          aria-label={`Fire ${crewName ?? 'crew member'}`}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          className={[
            'absolute bottom-1 left-1/2 -translate-x-1/2',
            'w-5 h-5 rounded-sm flex items-center justify-center',
            'font-pixel text-[13.125px] leading-none',
            'bg-red-900/70 text-red-300 border border-red-700/60',
            'transition-opacity duration-150',
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            holding ? 'opacity-100 bg-red-700/90' : '',
          ].join(' ')}
        >
          ✕
        </button>
      )}

      {/* Hold-to-fire countdown bar */}
      {holding && (
        <div
          key="holding"
          className="absolute bottom-0 left-0 h-[3px] bg-red-500 rounded-b animate-fire-countdown"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main PubScreen
// ---------------------------------------------------------------------------

export const PubScreen: React.FC = () => {
  const bankrollDisplay    = useGameStore(selectBankrollDisplay);
  const bankroll           = useGameStore((s) => s.bankroll);
  const crewSlots          = useGameStore((s) => s.crewSlots);
  const recruitCrew        = useGameStore((s) => s.recruitCrew);
  const fireCrew           = useGameStore((s) => s.fireCrew);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  // The pub belongs to the floor just cleared, not the floor about to start.
  // Theme from prevMarker so cross-floor pubs stay in the completed floor's aesthetic.
  const prevMarkerForTheme = Math.max(0, currentMarkerIndex - 1);
  const theme              = getFloorTheme(prevMarkerForTheme);

  // ── Roster from store ─────────────────────────────────────────────────────
  // clearTransition() triggers fetchCrewRoster() before setting status=TRANSITION,
  // so the roster is typically ready (or nearly ready) when PubScreen mounts.

  const crewRoster         = useGameStore((s) => s.crewRoster);
  const fetchCrewRoster    = useGameStore((s) => s.fetchCrewRoster);

  // If the store fetch hasn't completed yet (race condition), kick it off here.
  useEffect(() => {
    if (crewRoster === null) void fetchCrewRoster();
  }, [crewRoster, fetchCrewRoster]);

  // Determine if this pub visit follows a boss victory with an EXTRA_SHOOTER comp.
  // currentMarkerIndex was already incremented by rolls.ts on transition, so the
  // marker just cleared is at index - 1.
  const prevMarkerIndex  = currentMarkerIndex - 1;
  const isComped         = prevMarkerIndex >= 0
    && isBossMarker(prevMarkerIndex)
    && GAUNTLET[prevMarkerIndex]?.boss?.compReward === 'EXTRA_SHOOTER';
  const upcomingShooters = isComped ? 6 : 5;

  // ── Server-generated draft ────────────────────────────────────────────────
  // Fetched once from GET /runs/:id/pub-draft. The server injects any crew
  // unlocked this turn via guaranteedPubDraftIds so they always appear here.

  const pubDraft      = useGameStore((s) => s.pubDraft);
  const fetchPubDraft = useGameStore((s) => s.fetchPubDraft);
  const [draftLoading, setDraftLoading] = useState(true);

  // Guard against React StrictMode's double-effect invocation: both calls would
  // see pubDraft.length === 0 before either resolves, causing two concurrent
  // server requests. The second would land after guaranteedPubDraftIds is cleared
  // by the first, overwriting the guaranteed draft with a plain 3-item draft.
  const draftFetchedRef = useRef(false);

  useEffect(() => {
    if (draftFetchedRef.current) return;
    draftFetchedRef.current = true;
    setDraftLoading(true);
    void fetchPubDraft().finally(() => setDraftLoading(false));
  }, []); // mount-only; fetchPubDraft is a stable Zustand action

  // Build a name lookup from the full roster (falls back to static map while loading).
  const crewNameMap: Record<number, string> = crewRoster
    ? Object.fromEntries(crewRoster.map((c) => [c.id, c.name]))
    : CREW_NAMES_FALLBACK;

  const crewDescriptionMap: Record<number, string> = crewRoster
    ? Object.fromEntries(crewRoster.filter((c) => c.briefDescription).map((c) => [c.id, c.briefDescription!]))
    : {};

  const [selectedCrew,  setSelectedCrew]  = useState<PubDraftEntry | null>(null);
  const [selectedSlot,  setSelectedSlot]  = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);

  const handleCrewClick = useCallback((crew: PubDraftEntry) => {
    if (selectedCrew?.id === crew.id) {
      // Toggle off if already selected
      setSelectedCrew(null);
      setSelectedSlot(null);
    } else {
      setSelectedCrew(crew);
      setSelectedSlot(null);
    }
    setErrorMsg(null);
  }, [selectedCrew]);

  const handleSlotClick = useCallback((idx: number) => {
    setSelectedSlot(prev => prev === idx ? null : idx);
    setErrorMsg(null);
  }, []);

  const handleHire = useCallback(async () => {
    if (!selectedCrew || selectedSlot === null) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await recruitCrew(selectedCrew.id, selectedSlot);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Hire failed.');
      setIsLoading(false);
    }
    // On success the status changes → App unmounts this component; no need to reset.
  }, [selectedCrew, selectedSlot, recruitCrew]);

  const handleSkip = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await recruitCrew(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Skip failed.');
      setIsLoading(false);
    }
  }, [recruitCrew]);

  const canHire = selectedCrew !== null && selectedSlot !== null && !isLoading;

  return (
    <div
      className="relative w-full max-w-lg mx-auto min-h-[100dvh] flex flex-col overflow-hidden border-x-4"
      style={{
        background:  theme.pubBg,
        borderColor: theme.borderHigh,
      }}
    >
      {/* ── Atmosphere overlay ──────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.pubOverlayBg }}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="relative flex-none px-4 pt-8 pb-6 text-center">
        {/* Top accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: theme.pubAccentBar }}
        />

        <div className="font-pixel text-[13.125px] tracking-widest mb-1" style={{ color: theme.pubSubtextColor }}>
          ✦ MARKER CLEARED ✦
        </div>
        <h1
          className="font-pixel text-[18.75px] tracking-wide"
          style={{ color: theme.pubTitleColor, textShadow: theme.pubTitleShadow }}
        >
          {theme.pubName}
        </h1>
        <div className="mt-2 font-mono text-[16.875px]" style={{ color: theme.pubSubtextColor }}>
          Hire a hand before the next marker…
        </div>

        {/* Divider */}
        <div
          className="mt-4 h-px"
          style={{ background: `linear-gradient(to right, transparent, ${theme.accentDim}80, transparent)` }}
        />

        {/* Stats row */}
        <div className="mt-3 flex justify-center gap-6">
          <div className="text-center">
            <div className="font-pixel text-[11.25px] mb-0.5" style={{ color: theme.pubSubtextColor }}>BANKROLL</div>
            <div className="font-pixel text-[15px]" style={{ color: theme.accentBright }}>{bankrollDisplay}</div>
          </div>
          <div className="text-center">
            <div className="font-pixel text-[11.25px] mb-0.5" style={{ color: theme.pubSubtextColor }}>SHOOTERS</div>
            <div className="font-pixel text-[15px]" style={{ color: theme.accentBright }}>
              {upcomingShooters} {'✦'.repeat(5)}
              {isComped && <span className="ml-px" style={{ color: theme.accentBright }}>✦</span>}
            </div>
            {isComped && (
              <div className="font-pixel text-[9.375px] tracking-widest mt-0.5" style={{ color: theme.accentBright }}>
                +1 COMP
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Draft cards ──────────────────────────────────────────────────────── */}
      <section className="relative flex-none px-3 pb-4">
        <div className="font-pixel text-[11.25px] text-center mb-3 tracking-widest" style={{ color: theme.pubSubtextColor }}>
          — AVAILABLE FOR HIRE —
        </div>

        {/* Loading state */}
        {draftLoading && (
          <div className="text-center font-mono text-[16.875px] text-amber-300/40 py-4 animate-pulse">
            Loading crew…
          </div>
        )}

        {!draftLoading && (
          <div className="grid grid-cols-3 gap-2">
            {pubDraft.map((crew) => (
              <CrewCard
                key={crew.id}
                crew={crew}
                isSelected={selectedCrew?.id === crew.id}
                canAfford={bankroll >= crew.hireCostCents}
                onClick={() => handleCrewClick(crew)}
              />
            ))}
            {pubDraft.length === 0 && (
              <div className="col-span-3 text-center font-mono text-[16.875px] text-amber-300/40 py-4">
                No crew available to hire.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Your Crew — fire slots ───────────────────────────────────────────── */}
      <section className="relative flex-none px-3 pb-3">
        <div className="font-pixel text-[11.25px] text-center mb-2 tracking-widest" style={{ color: theme.pubSubtextColor }}>
          — YOUR CREW —
        </div>
        <div className="flex justify-around gap-1">
          {crewSlots.map((slot, i) => (
            <PubFireSlot
              key={i}
              crewId={slot?.crewId ?? null}
              crewName={slot ? (crewNameMap[slot.crewId] ?? `#${slot.crewId}`) : null}
              description={slot ? (crewDescriptionMap[slot.crewId] ?? null) : null}
              onFire={slot !== null ? () => { void fireCrew(i); } : undefined}
            />
          ))}
        </div>
      </section>

      {/* ── Slot picker (slides in when a crew is selected) ───────────────────── */}
      {selectedCrew && (
        <section className="relative flex-none px-3 pb-4">
          <div
            className="rounded-lg border border-amber-700/40 p-3"
            style={{ background: 'rgba(60, 30, 0, 0.6)' }}
          >
            <div className="font-pixel text-[11.25px] text-amber-400/70 mb-3 text-center">
              PLACE&nbsp;
              <span className="text-amber-300">{selectedCrew.name.toUpperCase()}</span>
              &nbsp;IN SLOT:
            </div>

            {/* Five slot buttons */}
            <div className="flex justify-around gap-1">
              {crewSlots.map((slot, i) => (
                <SlotButton
                  key={i}
                  index={i}
                  occupantId={slot?.crewId ?? null}
                  occupantName={slot ? (crewNameMap[slot.crewId] ?? `#${slot.crewId}`) : null}
                  isSelected={selectedSlot === i}
                  onClick={() => handleSlotClick(i)}
                />
              ))}
            </div>

            {/* Overwrite warning */}
            {selectedSlot !== null && crewSlots[selectedSlot]?.crewId != null && (
              <div className="mt-2 text-center font-mono text-[15px] text-amber-500/70">
                ⚠ Replaces {crewNameMap[crewSlots[selectedSlot]!.crewId] ?? 'current crew'}
              </div>
            )}

            {/* Hire button */}
            <button
              type="button"
              disabled={!canHire}
              onClick={() => void handleHire()}
              className={[
                'mt-3 w-full py-2 rounded font-pixel text-[13.125px] tracking-wider',
                'border transition-all duration-150',
                canHire
                  ? 'bg-amber-700 border-amber-500 text-amber-100 hover:bg-amber-600 active:scale-95 shadow shadow-amber-900/50'
                  : 'bg-stone-800/50 border-stone-700/30 text-stone-600 cursor-not-allowed',
              ].join(' ')}
            >
              {isLoading
                ? 'HIRING…'
                : selectedSlot === null
                  ? 'SELECT A SLOT'
                  : `HIRE FOR ${formatCents(selectedCrew.hireCostCents)}`}
            </button>

            {/* Cancel selection */}
            <button
              type="button"
              onClick={() => { setSelectedCrew(null); setSelectedSlot(null); }}
              className="mt-1.5 w-full py-1 font-pixel text-[9.375px] text-amber-600/50 hover:text-amber-400/70 transition-colors"
            >
              CANCEL
            </button>
          </div>
        </section>
      )}

      {/* ── Error message ────────────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="px-4 py-2 mx-3 mb-2 rounded border border-red-700/50 bg-red-900/20">
          <p className="font-mono text-[16.875px] text-red-300 text-center">{errorMsg}</p>
        </div>
      )}

      {/* ── Spacer ───────────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Skip / Rest button ───────────────────────────────────────────────── */}
      <footer className="flex-none px-4 pb-8">
        <div
          className="h-px mb-4"
          style={{ background: `linear-gradient(to right, transparent, ${theme.accentDim}99, transparent)` }}
        />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleSkip()}
          className="
            w-full py-2.5 rounded
            font-pixel text-[13.125px] tracking-widest
            border
            active:scale-95 transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{
            background:  'rgba(0, 0, 0, 0.60)',
            color:       theme.accentDim,
            borderColor: theme.borderLow,
          }}
        >
          {isLoading ? 'RESTING…' : '— REST & SKIP TO TABLE —'}
        </button>
      </footer>
    </div>
  );
};
