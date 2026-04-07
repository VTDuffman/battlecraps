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
//   1. On mount, shuffle ALL_CREW and pick the first 3 as the draft pool.
//   2. Player clicks a crew card   → selectedCrew is set; slot rail appears.
//   3. Player clicks a slot        → selectedSlot is set; HIRE button activates.
//   4. Player clicks HIRE          → calls store.recruitCrew(crewId, slotIndex).
//   5. Store sets status → IDLE_TABLE → App unmounts PubScreen, mounts TableBoard.
//   6. SKIP button calls           → store.recruitCrew(null) — no purchase.
// =============================================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  lefty,
  physicsProfessor,
  mechanic,
  mathlete,
  floorWalker,
  regular,
  bigSpender,
  shark,
  whale,
  nervousIntern,
  hypeTrainHolly,
  drunkUncle,
  mimic,
  oldPro,
  luckyCharm,
} from '@battlecraps/shared';
import type { CrewMember } from '@battlecraps/shared';
import { useGameStore, selectBankrollDisplay } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Crew pool — all 15 MVP starter crew, imported from shared
// ---------------------------------------------------------------------------

const ALL_CREW: CrewMember[] = [
  lefty, physicsProfessor, mechanic,
  mathlete, floorWalker, regular,
  bigSpender, shark, whale,
  nervousIntern, hypeTrainHolly, drunkUncle,
  mimic, oldPro, luckyCharm,
];

// ---------------------------------------------------------------------------
// Ability descriptions (mirrors apps/api/src/db/seed.ts)
// ---------------------------------------------------------------------------

const DESCRIPTIONS: Record<number, string> = {
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'On any paired roll, nudges both dice ±1 to land on the active point.',
  3:  'Locks a chosen die value for up to 4 rolls.',
  4:  'Active Hardway bets survive a soft-number hit.',
  5:  'The first Seven Out of a shooter refunds your Pass Line bet.',
  6:  'Grants a free Odds bet equal to your Pass Line on a Natural.',
  7:  'Adds a flat $100 bonus to every Hardway win.',
  8:  'Adds a flat $100 bonus to every Point Hit payout.',
  9:  'Multiplies all winning payouts by 1.2× on every roll.',
  10: 'Adds +0.2× Hype on every Natural.',
  11: 'Adds +0.3× Hype on every Point Hit.',
  12: '33% chance to add +0.5× Hype — or subtract 0.1×.',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'If all others are on cooldown, activates all of them.',
  15: 'When alone on the rail, sets a Hype floor of 2.0×.',
};

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
// Current crew name lookup (mirrors TableBoard.tsx)
// ---------------------------------------------------------------------------

const CREW_NAMES: Record<number, string> = {
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

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CrewCardProps {
  crew:       CrewMember;
  isSelected: boolean;
  canAfford:  boolean;
  onClick:    () => void;
}

const CrewCard: React.FC<CrewCardProps> = ({ crew, isSelected, canAfford, onClick }) => {
  const cat = CATEGORY_STYLES[crew.abilityCategory] ?? CATEGORY_STYLES['WILDCARD']!;
  const portrait = CATEGORY_PORTRAIT_BG[crew.abilityCategory] ?? 'bg-stone-700/40 border-stone-600/50';

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

      {/* Portrait — layered: letter fallback underneath, sprite frame 1 on top.
          background-size: 500% 100% maps the full 5-frame strip so that one
          frame exactly fills the container; background-position: 0 0 = frame 1. */}
      <div
        className={[
          'relative w-full aspect-square rounded border-2 overflow-hidden',
          portrait,
        ].join(' ')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-pixel text-[12px] opacity-60">
            {crew.abilityCategory.charAt(0)}
          </span>
        </div>
        {crew.visualId && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:    `url('/sprites/crew/${crew.visualId}.png')`,
              backgroundSize:     '500% 100%',
              backgroundPosition: '0 0',
              backgroundRepeat:   'no-repeat',
              imageRendering:     'pixelated',
            }}
          />
        )}
      </div>

      {/* Category badge */}
      <div className={['self-start px-1.5 py-0.5 rounded text-[5px] font-pixel', cat.bg, cat.text].join(' ')}>
        {cat.label}
      </div>

      {/* Name */}
      <div className="font-pixel text-[6px] text-amber-100 leading-relaxed">
        {crew.name}
      </div>

      {/* Description */}
      <div className="font-mono text-[8px] text-amber-300/60 leading-tight flex-1">
        {DESCRIPTIONS[crew.id] ?? '???'}
      </div>

      {/* Cost */}
      <div
        className={[
          'font-pixel text-[7px] mt-1',
          canAfford ? 'text-amber-400' : 'text-red-400',
        ].join(' ')}
      >
        {formatCents(crew.baseCost)}
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
  isSelected: boolean;
  onClick:    () => void;
}

const SlotButton: React.FC<SlotButtonProps> = ({ index, occupantId, isSelected, onClick }) => {
  const name = occupantId ? (CREW_NAMES[occupantId] ?? `#${occupantId}`) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col items-center gap-1 px-2 py-2 rounded border transition-all duration-100',
        'active:scale-95 min-w-0',
        isSelected
          ? 'bg-amber-600/40 border-amber-400 shadow shadow-amber-400/40'
          : occupantId
            ? 'bg-stone-800/60 border-amber-700/40 hover:border-amber-500/60'
            : 'bg-stone-900/40 border-stone-700/30 hover:border-amber-600/40',
      ].join(' ')}
    >
      {/* Slot index indicator */}
      <div
        className={[
          'w-5 h-5 rounded flex items-center justify-center font-pixel text-[6px]',
          isSelected ? 'bg-amber-500 text-stone-900' : 'bg-stone-700 text-amber-300/60',
        ].join(' ')}
      >
        {index}
      </div>

      {/* Occupant name */}
      <div className={[
        'font-pixel text-[5px] text-center leading-tight w-12 truncate',
        occupantId
          ? isSelected ? 'text-amber-200' : 'text-amber-400/70'
          : 'text-stone-600',
      ].join(' ')}>
        {name ?? 'EMPTY'}
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// PubFireSlot — compact crew slot with hold-to-fire for the pub screen
// ---------------------------------------------------------------------------

interface PubFireSlotProps {
  crewId:   number | null;
  onFire:   (() => void) | undefined;
}

const PubFireSlot: React.FC<PubFireSlotProps> = ({ crewId, onFire }) => {
  const [holding, setHolding] = useState(false);
  const holdTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const name = crewId ? (CREW_NAMES[crewId] ?? `#${crewId}`) : null;

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
      <div className="flex flex-col items-center gap-1 px-2 py-1.5 rounded border border-stone-700/20 bg-stone-900/20 min-w-0">
        <div className="w-5 h-5 rounded border border-dashed border-stone-700/40" />
        <div className="font-pixel text-[5px] text-stone-700">EMPTY</div>
      </div>
    );
  }

  return (
    <div
      className="group relative flex flex-col items-center gap-1 px-2 py-1.5 rounded border border-amber-800/40 bg-stone-900/40 outline-none min-w-0"
      tabIndex={onFire ? 0 : -1}
    >
      {/* Name */}
      <div className="font-pixel text-[5px] text-amber-300/80 text-center w-12 truncate leading-tight">
        {name}
      </div>

      {/* Fire button — revealed on hover/focus */}
      {onFire && (
        <button
          type="button"
          aria-label={`Fire ${name ?? 'crew member'}`}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          className={[
            'w-5 h-5 rounded-sm flex items-center justify-center',
            'font-pixel text-[7px] leading-none',
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
  const bankrollDisplay = useGameStore(selectBankrollDisplay);
  const bankroll        = useGameStore((s) => s.bankroll);
  const crewSlots       = useGameStore((s) => s.crewSlots);
  const recruitCrew     = useGameStore((s) => s.recruitCrew);
  const fireCrew        = useGameStore((s) => s.fireCrew);

  // Three random crew drawn once on mount and held stable.
  // Filter out crew already seated in any slot so repeats are never offered.
  const [draft] = useState<CrewMember[]>(() => {
    const existingIds = new Set(
      crewSlots.filter(Boolean).map((s) => s!.crewId),
    );
    const available = ALL_CREW.filter((c) => !existingIds.has(c.id));
    return pickRandom(available, Math.min(3, available.length));
  });
  const [selectedCrew,  setSelectedCrew]  = useState<CrewMember | null>(null);
  const [selectedSlot,  setSelectedSlot]  = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);

  const handleCrewClick = useCallback((crew: CrewMember) => {
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
      className="
        relative w-full max-w-lg mx-auto min-h-screen
        flex flex-col overflow-hidden
        border-x-4 border-amber-900/50
      "
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, #3a1800 0%, #180c00 45%, #0d0704 100%)',
      }}
    >
      {/* ── Smoke gradient overlay ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(180,90,0,0.08) 0%, transparent 70%)',
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="relative flex-none px-4 pt-8 pb-6 text-center">
        {/* Amber glow bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: 'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
          }}
        />

        <div className="font-pixel text-[7px] text-amber-400/60 tracking-widest mb-1">
          ✦ MARKER CLEARED ✦
        </div>
        <h1
          className="font-pixel text-[10px] tracking-wide"
          style={{ color: '#f5c842', textShadow: '0 0 20px #c47d0a, 0 0 40px #7a4500' }}
        >
          THE SEVEN-PROOF PUB
        </h1>
        <div className="mt-2 font-mono text-[9px] text-amber-300/50">
          Hire a hand before the next marker…
        </div>

        {/* Divider */}
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />

        {/* Stats row */}
        <div className="mt-3 flex justify-center gap-6">
          <div className="text-center">
            <div className="font-pixel text-[6px] text-amber-500/50 mb-0.5">BANKROLL</div>
            <div className="font-pixel text-[8px] text-amber-200">{bankrollDisplay}</div>
          </div>
          <div className="text-center">
            <div className="font-pixel text-[6px] text-amber-500/50 mb-0.5">SHOOTERS</div>
            <div className="font-pixel text-[8px] text-amber-200">5 ✦✦✦✦✦</div>
          </div>
        </div>
      </header>

      {/* ── Draft cards ──────────────────────────────────────────────────────── */}
      <section className="relative flex-none px-3 pb-4">
        <div className="font-pixel text-[6px] text-amber-600/60 text-center mb-3 tracking-widest">
          — AVAILABLE FOR HIRE —
        </div>

        <div className="grid grid-cols-3 gap-2">
          {draft.map((crew) => (
            <CrewCard
              key={crew.id}
              crew={crew}
              isSelected={selectedCrew?.id === crew.id}
              canAfford={bankroll >= crew.baseCost}
              onClick={() => handleCrewClick(crew)}
            />
          ))}
        </div>
      </section>

      {/* ── Your Crew — fire slots ───────────────────────────────────────────── */}
      <section className="relative flex-none px-3 pb-3">
        <div className="font-pixel text-[6px] text-amber-600/60 text-center mb-2 tracking-widest">
          — YOUR CREW —
        </div>
        <div className="flex justify-around gap-1">
          {crewSlots.map((slot, i) => (
            <PubFireSlot
              key={i}
              crewId={slot?.crewId ?? null}
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
            <div className="font-pixel text-[6px] text-amber-400/70 mb-3 text-center">
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
                  isSelected={selectedSlot === i}
                  onClick={() => handleSlotClick(i)}
                />
              ))}
            </div>

            {/* Overwrite warning */}
            {selectedSlot !== null && crewSlots[selectedSlot]?.crewId != null && (
              <div className="mt-2 text-center font-mono text-[8px] text-amber-500/70">
                ⚠ Replaces {CREW_NAMES[crewSlots[selectedSlot]!.crewId] ?? 'current crew'}
              </div>
            )}

            {/* Hire button */}
            <button
              type="button"
              disabled={!canHire}
              onClick={() => void handleHire()}
              className={[
                'mt-3 w-full py-2 rounded font-pixel text-[7px] tracking-wider',
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
                  : `HIRE FOR ${formatCents(selectedCrew.baseCost)}`}
            </button>

            {/* Cancel selection */}
            <button
              type="button"
              onClick={() => { setSelectedCrew(null); setSelectedSlot(null); }}
              className="mt-1.5 w-full py-1 font-pixel text-[5px] text-amber-600/50 hover:text-amber-400/70 transition-colors"
            >
              CANCEL
            </button>
          </div>
        </section>
      )}

      {/* ── Error message ────────────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="px-4 py-2 mx-3 mb-2 rounded border border-red-700/50 bg-red-900/20">
          <p className="font-mono text-[9px] text-red-300 text-center">{errorMsg}</p>
        </div>
      )}

      {/* ── Spacer ───────────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Skip / Rest button ───────────────────────────────────────────────── */}
      <footer className="flex-none px-4 pb-8">
        <div className="h-px mb-4 bg-gradient-to-r from-transparent via-amber-900/60 to-transparent" />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleSkip()}
          className="
            w-full py-2.5 rounded
            font-pixel text-[7px] tracking-widest
            border border-stone-700/50
            text-stone-500
            hover:text-amber-400/60 hover:border-amber-800/50
            active:scale-95 transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{ background: 'rgba(15, 8, 0, 0.6)' }}
        >
          {isLoading ? 'RESTING…' : '— REST & SKIP TO TABLE —'}
        </button>
      </footer>
    </div>
  );
};
