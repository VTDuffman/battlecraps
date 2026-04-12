// =============================================================================
// BATTLECRAPS — TABLE BOARD
// apps/web/src/components/TableBoard.tsx
//
// Top-down casino table layout. Bands stacked vertically (far end → player):
//
//   ┌─────────────────────────────────────┐
//   │  TITLE + GAME STATUS (back wall)    │  ← bankroll / shooters / hype / marker
//   ├─────────────────────────────────────┤
//   │  BETTING GRID (Pass, Odds, Hardways)│  ← table felt
//   ├─────────────────────────────────────┤
//   │  DICE ZONE (roll btn)               │  ← toss arc / landing zone
//   ├─────────────────────────────────────┤
//   │  RAIL — 5× CrewPortrait slots       │  ← crew behind the player
//   └─────────────────────────────────────┘
//
// The cascade animation state is threaded through from the Zustand store.
// Each CrewPortrait receives an `isTriggering` prop that is true only when it
// is the HEAD of the cascadeQueue. When the flash animation ends, the portrait
// calls `dequeueEvent()` to advance to the next crew in the sequence.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { MARKER_TARGETS, getMaxBet, isBossMarker } from '@battlecraps/shared';
import {
  useGameStore,
  selectActiveSlot,
  selectActiveBark,
  selectHypeDisplay,
  selectDisplayMarkerIndex,
  type GameState,
} from '../store/useGameStore.js';
import { BettingGrid, ChipSelector } from './BettingGrid.js';
import { BossRoomHeader }  from './BossRoomHeader.js';
import { DiceZone }      from './DiceZone.js';
import { CrewPortrait }  from './CrewPortrait.js';
import { RollLog }       from './RollLog.js';
import { useCrowdAudio }       from '../hooks/useCrowdAudio.js';
import { useAnimatedCounter }  from '../hooks/useAnimatedCounter.js';
import { useFloorTheme }       from '../hooks/useFloorTheme.js';
import { ChipRain }            from './ChipRain.js';
import { CompCardFan }         from './CompCardFan.js';
import { FloorEmblem }         from './FloorEmblem.js';

const selectFlash    = (s: GameState) => ({ flashType: s.flashType, _flashKey: s._flashKey });
const selectWallFlash = (s: GameState) => ({ wallFlash: s.wallFlash, _wallFlashKey: s._wallFlashKey });

export const TableBoard: React.FC = () => {
  const crewSlots    = useGameStore((s) => s.crewSlots);
  const activeSlot   = useGameStore(selectActiveSlot);
  const activeBark   = useGameStore(selectActiveBark);
  const dequeueEvent = useGameStore((s) => s.dequeueEvent);
  const isRolling        = useGameStore((s) => s.isRolling);
  const fireCrew         = useGameStore((s) => s.fireCrew);
  const mechanicFreeze   = useGameStore((s) => s.mechanicFreeze);
  const setMechanicFreeze = useGameStore((s) => s.setMechanicFreeze);
  const socketStatus = useGameStore((s) => s.socketStatus);
  const { flashType, _flashKey }           = useGameStore(selectFlash);
  const { wallFlash, _wallFlashKey }       = useGameStore(selectWallFlash);
  const streak       = useGameStore((s) => s.consecutivePointHits);
  const hype         = useGameStore((s) => s.hype);
  const { muted, toggleMute } = useCrowdAudio();
  const theme = useFloorTheme();

  // Table shake — triggered by ChipRain when a TORRENT payout lands
  const [isShaking, setIsShaking] = useState(false);
  const handleTorrent = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 420);
  }, []);

  const triggerChipRainComplete = useGameStore((s) => s.triggerChipRainComplete);

  const feltClass =
    streak >= 3 || hype >= 2.0 ? 'animate-felt-hot'  :
    streak >= 1 || hype >= 1.2 ? 'animate-felt-warm' :
    'animate-felt-cold';

  // Stable callback passed to every portrait. The portrait that is currently
  // animating will call this; portraits that are not triggering never fire it.
  const handleAnimationEnd = useCallback(() => {
    dequeueEvent();
  }, [dequeueEvent]);

  return (
    <div
      className={[
        'relative w-full max-w-lg mx-auto',
        'h-[100dvh] flex flex-col overflow-hidden',
        'border-x-4',
        'overflow-x-hidden',
        isShaking ? 'animate-table-shake' : '',
      ].join(' ')}
      style={{
        backgroundColor:   theme.feltPrimary,
        backgroundImage:   theme.feltTexture,
        borderColor:       theme.borderHigh,
        // Per-floor CSS custom properties consumed by breathing + flash keyframes
        '--breathe-cold-color': theme.breatheCold,
        '--breathe-warm-color': theme.breatheWarm,
        '--breathe-hot-color':  theme.breatheHot,
        '--flash-win-color':    theme.flashWin,
        '--flash-lose-color':   theme.flashLose,
      } as React.CSSProperties}
    >
      {/* ── Felt breathing overlay (behind all content) ──────────────────── */}
      <div className={`absolute inset-0 pointer-events-none z-[1] ${feltClass}`} />

      {/* ── Chip Rain particle system ─────────────────────────────────────── */}
      <ChipRain onTorrent={handleTorrent} onComplete={triggerChipRainComplete} />

      {/* ── Boss Room Header — self-hides when not in a boss marker ──────── */}
      <BossRoomHeader />

      {/* ── Connection status badge ───────────────────────────────────────── */}
      <StatusBadge status={socketStatus} />

      {/* ── Mute toggle ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded font-pixel text-[8px] bg-black/30 text-white/40 hover:text-white/70 transition-colors"
        aria-label={muted ? 'Unmute crowd audio' : 'Mute crowd audio'}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* ── Comp Card Fan — boss-defeat rewards, top-left corner ─────────── */}
      <CompCardFan />

      {/* ── GAME STATUS (back wall / far end) ────────────────────────────── */}
      <section
        aria-label="Game Status"
        className="flex-none px-4 border-b-2"
        style={{
          borderColor: theme.borderLow,
          paddingTop: 'clamp(8px,1.4dvh,16px)',
          paddingBottom: 'clamp(6px,1dvh,12px)',
        }}
      >
        <GameStatus />
      </section>

      {/* ── GREEN SPACE — dice animation travel zone ─────────────────────── */}
      <div className="relative flex-1">
        <FloorEmblem />
      </div>

      {/* ── BETTING GRID ─────────────────────────────────────────────────── */}
      <section
        aria-label="Betting Grid"
        className="flex-none px-4 border-b-2"
        style={{
          borderColor: theme.borderLow,
          paddingTop: 'clamp(6px,0.8dvh,12px)',
          paddingBottom: 'clamp(6px,0.8dvh,12px)',
        }}
      >
        <BettingGrid />
      </section>

      {/* ── DICE ZONE ────────────────────────────────────────────────────── */}
      <section
        aria-label="Dice Zone"
        className="flex-none border-b-2"
        style={{ borderColor: theme.borderLow }}
      >
        <DiceZone />
      </section>

      {/* ── CHIP RAIL (player's denomination rail) ───────────────────────── */}
      <ChipRail />

      {/* ── QA TRANSACTION LOG ───────────────────────────────────────────── */}
      <RollLog />

      {/* ── CREW RAIL ────────────────────────────────────────────────────── */}
      <section
        aria-label="Crew Rail"
        className="flex-none px-4 border-t-4"
        style={{
          backgroundColor: theme.feltRail,
          borderColor:     theme.borderHigh,
          paddingTop:    'clamp(6px,0.8dvh,12px)',
          paddingBottom: 'clamp(6px,0.8dvh,12px)',
        }}
      >
        {/* Rail header */}
        <div className="flex items-center gap-2" style={{ marginBottom: 'clamp(2px,0.3dvh,8px)' }}>
          <div className="h-px flex-1" style={{ backgroundColor: theme.borderLow }} />
          <span className="font-pixel text-[6px] tracking-widest" style={{ color: theme.accentPrimary }}>
            CREW
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: theme.borderLow }} />
        </div>

        {/* Five portrait slots */}
        <div className="flex justify-around items-end gap-1">
          {crewSlots.map((slot, i) => (
            <CrewPortrait
              key={i}
              slotIndex={i}
              crewId={slot?.crewId ?? null}
              crewName={crewNameFromId(slot?.crewId ?? null)}
              visualId={crewVisualIdFromId(slot?.crewId ?? null)}
              cooldownState={slot?.cooldownState ?? 0}
              isTriggering={activeSlot === i}
              barkSeq={activeSlot === i ? (activeBark?.seq ?? null) : null}
              onAnimationEnd={handleAnimationEnd}
              onFire={!isRolling && slot !== null ? () => { void fireCrew(i); } : undefined}
              onSetFreeze={
                slot?.crewId === 3 && !isRolling && slot.cooldownState === 0 && !mechanicFreeze
                  ? (v) => { void setMechanicFreeze(v); }
                  : undefined
              }
              freezeState={slot?.crewId === 3 ? mechanicFreeze : null}
            />
          ))}
        </div>
      </section>

      {/* ── Back-wall flash (dice hit the far wall at the top) ───────────── */}
      {wallFlash && (
        <div
          key={_wallFlashKey}
          className="absolute top-0 inset-x-0 h-10 pointer-events-none z-40 animate-wall-flash bg-white/40 rounded-b-lg"
        />
      )}

      {/* ── Screen flash overlay ──────────────────────────────────────────── */}
      {flashType && (
        <div
          key={_flashKey}
          className={[
            'absolute inset-0 pointer-events-none z-50',
            flashType === 'win' ? 'animate-screen-flash-win' : 'animate-screen-flash-lose',
          ].join(' ')}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Game Status — bankroll / shooters / hype / marker / point puck
// ---------------------------------------------------------------------------

const GameStatus: React.FC = () => {
  const hypeStr             = useGameStore(selectHypeDisplay);
  const hype                = useGameStore((s) => s.hype);
  const shooters            = useGameStore((s) => s.shooters);
  const bankroll            = useGameStore((s) => s.bankroll);
  const currentMarkerIndex  = useGameStore((s) => s.currentMarkerIndex);
  const displayMarkerIndex  = useGameStore(selectDisplayMarkerIndex);
  const theme               = useFloorTheme();

  const { display: bankrollDisplay, direction: bankrollDir } = useAnimatedCounter(bankroll);
  const bankrollStr = `$${(bankrollDisplay / 100).toFixed(2)}`;
  const bankrollColor =
    bankrollDir === 'up'   ? 'text-green-400' :
    bankrollDir === 'down' ? 'text-red-400'   :
    'text-gold-bright';
  const phase               = useGameStore((s) => s.phase);
  const point               = useGameStore((s) => s.point);
  const streak              = useGameStore((s) => s.consecutivePointHits);
  const _pointRingKey       = useGameStore((s) => s._pointRingKey);
  const pointRingType       = useGameStore((s) => s.pointRingType);

  // Hype heat tier — drives colour and animation intensity
  const hypeHeat: 'cold' | 'warm' | 'hot' | 'blazing' =
    streak >= 4 ? 'blazing' :
    streak === 3 ? 'hot' :
    streak >= 1 ? 'warm' :
    'cold';

  const hypeColour =
    hypeHeat === 'blazing' ? 'text-red-400' :
    hypeHeat === 'hot'     ? 'text-orange-400' :
    hypeHeat === 'warm'    ? 'text-yellow-300' :
    'text-gold';

  const hypeAnim =
    hypeHeat === 'blazing' ? 'animate-hype-blaze' :
    hypeHeat === 'hot'     ? 'animate-hype-hot' :
    Number(hypeStr) > 1.0  ? 'animate-hype-pulse' :
    '';

  // ── Thermometer bar ─────────────────────────────────────────────────────
  // Bar fills from 1.0× (empty) to 4.0× (full); clamped to [0, 1].
  const fillPct = Math.min(Math.max((hype - 1.0) / 3.0, 0), 1);

  const fillGradient =
    fillPct > 0.66 ? 'linear-gradient(to top, #dc2626, #f97316)' :
    fillPct > 0.33 ? 'linear-gradient(to top, #f97316, #fbbf24)' :
                     'linear-gradient(to top, #16a34a, #fbbf24)';

  const barGlow =
    hypeHeat === 'blazing' ? '0 0 12px 3px rgba(248,113,113,0.7)' :
    hypeHeat === 'hot'     ? '0 0  8px 2px rgba(251,146, 60,0.55)':
    hypeHeat === 'warm'    ? '0 0  5px 2px rgba(245,200, 66,0.35)':
    'none';

  const boilClass =
    hypeHeat === 'blazing' ? 'animate-thermo-blazing' :
    hypeHeat === 'hot'     ? 'animate-thermo-hot'     :
    '';

  return (
    <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.5dvh,8px)' }}>

      {/* ── 2-column header: logo + bankroll (left) | hype + shooters (right) ── */}
      <div className="flex items-center gap-3 px-1">

        {/* LEFT column — Vegas logo stack + bankroll beneath */}
        <div className="flex-1 flex flex-col items-center">
          {/* Decorative star row */}
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="h-px w-6 bg-gradient-to-r from-transparent to-gold/40" />
            <span className="font-pixel text-[5px] text-gold/50">✦</span>
            <span className="font-pixel text-[7px] text-gold/70">★</span>
            <span className="font-pixel text-[5px] text-gold/50">✦</span>
            <div className="h-px w-6 bg-gradient-to-l from-transparent to-gold/40" />
          </div>

          {/* "BATTLE" prefix */}
          <div
            className="font-pixel tracking-[0.35em] leading-none"
            style={{
              fontSize: 'clamp(7px, 1.4dvh, 10px)',
              color: '#b8861a',
              textShadow: '0 0 8px rgba(196,125,10,0.4)',
            }}
          >
            BATTLE
          </div>

          {/* "CRAPS" headline */}
          <h1
            className="font-pixel tracking-[0.2em] leading-none"
            style={{
              fontSize: 'clamp(20px, 4dvh, 28px)',
              background: 'linear-gradient(180deg, #ffffff 0%, #f5c842 40%, #c47d0a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter:
                'drop-shadow(0 0 6px rgba(245,200,66,0.8)) drop-shadow(0 0 18px rgba(196,125,10,0.6))',
            }}
          >
            CRAPS
          </h1>

          {/* Tagline */}
          <div className="font-pixel text-[5px] text-gold/40 tracking-[0.4em] mt-0.5">
            · CASINO GAUNTLET ·
          </div>

          {/* Bankroll — directly beneath logo */}
          <div className="mt-1.5 text-center">
            <div className="font-pixel text-[6px] text-white/40 mb-0.5">BANKROLL</div>
            <div className={`font-pixel text-sm transition-colors duration-150 ${bankrollColor}`}>
              {bankrollStr}
            </div>
          </div>
        </div>

        {/* RIGHT column — hype on top, shooters below */}
        <div className="flex flex-col items-center gap-2">
          {/* Hype */}
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 mb-0.5">
              HYPE{streak >= 2 ? ` ${'🔥'.repeat(Math.min(streak, 4))}` : ''}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              {/* Thermometer bar */}
              <div
                className="relative w-[7px] rounded-full overflow-hidden bg-black/50 border border-white/10 flex-none"
                style={{ height: 'clamp(34px, 4dvh, 46px)', boxShadow: barGlow }}
              >
                <div
                  className={`absolute bottom-0 left-0 right-0 rounded-full transition-all duration-500 ${boilClass}`}
                  style={{ height: `${fillPct * 100}%`, background: fillGradient }}
                />
              </div>
              {/* Numeric readout */}
              <div className={`font-pixel text-sm ${hypeColour} ${hypeAnim}`}>
                {hypeStr}
              </div>
            </div>
          </div>

          {/* Shooters */}
          <div className="text-center">
            <div className="font-pixel text-[6px] text-white/40 mb-0.5">SHOOTERS</div>
            <div className="flex gap-1 justify-center">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className={[
                    'w-2 h-2 rounded-full border',
                    i < shooters
                      ? 'bg-gold border-gold/80'
                      : 'bg-transparent border-white/20',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Divider — also serves as the dice throw "back wall" target */}
      <div
        id="wall-divider"
        className="h-px"
        style={{ background: `linear-gradient(to right, transparent, ${theme.accentPrimary}66, transparent)` }}
      />

      {/* Marker progress bar */}
      <MarkerProgress bankroll={bankroll} markerIndex={displayMarkerIndex} liveMarkerIndex={currentMarkerIndex} />

      {/* Point puck + phase label */}
      <div className="flex items-center gap-2 justify-center">
        <div className="relative">
          {/* Ring animation overlay — re-mounts on _pointRingKey to re-fire */}
          <div
            key={_pointRingKey}
            className={[
              'absolute inset-0 rounded-full pointer-events-none',
              pointRingType === 'set' ? 'animate-point-ring-set' :
              pointRingType === 'hit' ? 'animate-point-ring-hit' :
              '',
            ].join(' ')}
          />
          <div
            className={[
              'w-10 h-10 rounded-full border-2 flex items-center justify-center',
              'font-pixel text-[9px] transition-colors duration-300',
              phase === 'POINT_ACTIVE' && point !== null
                ? 'bg-white border-white text-black shadow-[0_0_10px_2px_rgba(255,255,255,0.6)]'
                : 'bg-black border-white/20 text-white/20',
            ].join(' ')}
          >
            {phase === 'POINT_ACTIVE' && point !== null ? point : 'OFF'}
          </div>
        </div>
        <span className="font-pixel text-[7px] text-white/30">
          {phase === 'POINT_ACTIVE' ? 'POINT ACTIVE' : 'COME OUT'}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Marker progress bar
// ---------------------------------------------------------------------------

const MarkerProgress: React.FC<{ bankroll: number; markerIndex: number; liveMarkerIndex: number }> = ({
  bankroll,
  markerIndex,
  liveMarkerIndex,
}) => {
  const target    = MARKER_TARGETS[markerIndex] ?? MARKER_TARGETS[MARKER_TARGETS.length - 1]!;
  const isBoss    = isBossMarker(markerIndex);
  const isCleared = markerIndex !== liveMarkerIndex; // display index behind live = in transition window
  const progress  = isCleared ? 1 : Math.min(bankroll / target, 1);
  const label     = isBoss ? '★ BOSS' : `MARKER ${markerIndex + 1}`;
  const pct       = Math.round(progress * 100);
  const theme     = useFloorTheme();

  return (
    <div className="w-full px-2 space-y-1">
      <div className="flex justify-between items-baseline">
        <span
          className="font-pixel text-[6px]"
          style={{ color: isBoss ? '#f87171' : theme.accentPrimary }}
        >
          {label}
        </span>
        <span className="font-pixel text-[6px] text-white/30">
          ${(bankroll / 100).toFixed(0)} / ${(target / 100).toFixed(0)}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-full border border-white/10 overflow-hidden" style={{ backgroundColor: theme.feltRail }}>
        <div
          className={[
            'h-full rounded-full transition-all duration-500',
            isCleared ? 'animate-marker-smash' : '',
          ].join(' ')}
          style={{
            width: `${pct}%`,
            background: isCleared
              ? 'linear-gradient(90deg, #ffffff, #fef9c3)'
              : isBoss
              ? 'linear-gradient(90deg, #7f1d1d, #ef4444)'
              : `linear-gradient(90deg, ${theme.accentDim}, ${theme.accentBright})`,
          }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chip Rail — denomination selector + table max, lives above the crew
// ---------------------------------------------------------------------------

const ChipRail: React.FC = () => {
  const activeChip         = useGameStore((s) => s.activeChip);
  const isRolling          = useGameStore((s) => s.isRolling);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const bossPointHits      = useGameStore((s) => s.bossPointHits);
  const maxBet             = getMaxBet(currentMarkerIndex, bossPointHits);
  const theme              = useFloorTheme();

  return (
    <section
      aria-label="Chip Rail"
      className="flex-none px-4 border-t-2 bg-black/20"
      style={{
        borderColor:   theme.borderLow,
        paddingTop:    'clamp(6px,0.8dvh,12px)',
        paddingBottom: 'clamp(4px,0.6dvh,8px)',
      }}
    >
      <div className="text-center font-pixel text-[7px] text-white/30" style={{ marginBottom: 'clamp(2px,0.3dvh,8px)' }}>
        TABLE MAX: ${maxBet / 100}
      </div>
      <ChipSelector activeChip={activeChip} disabled={isRolling} />
    </section>
  );
};

// ---------------------------------------------------------------------------
// Socket status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  disconnected: 'bg-red-900/80   text-red-300',
  connecting:   'bg-yellow-900/80 text-yellow-300',
  connected:    'bg-blue-900/80  text-blue-300',
  subscribed:   'bg-green-900/80 text-green-300',
  error:        'bg-red-900/80   text-red-300',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <div
    className={[
      'absolute top-2 right-2 z-10',
      'flex items-center gap-1',
      'px-1.5 py-0.5 rounded',
      'font-pixel text-[5px]',
      STATUS_STYLES[status] ?? 'bg-gray-900 text-gray-400',
    ].join(' ')}
  >
    <div
      className={[
        'w-1.5 h-1.5 rounded-full',
        status === 'subscribed' ? 'bg-green-400 animate-pulse' :
        status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
        'bg-current',
      ].join(' ')}
    />
    {status.toUpperCase()}
  </div>
);

// ---------------------------------------------------------------------------
// Crew name lookup (mirrors the crew IDs in the shared package)
// A proper implementation would read this from the run's crew definitions.
// ---------------------------------------------------------------------------

const CREW_NAMES: Record<number, string> = {
  1:  '"Lefty" McGuffin',
  2:  'Physics Prof',
  3:  'The Mechanic',
  4:  'The Mathlete',
  5:  'Floor Walker',
  6:  'The Regular',
  7:  'Big Spender',
  8:  'The Shark',
  9:  'The Whale',
  10: 'Nervous Intern',
  11: 'Holly (Hype)',
  12: 'Drunk Uncle',
  13: 'The Mimic',
  14: 'Old Pro',
  15: 'Lucky Charm',
};

const CREW_VISUAL_IDS: Record<number, string> = {
  1:  'lefty',
  2:  'physics_prof',
  3:  'mechanic',
  4:  'mathlete',
  5:  'floor_walker',
  6:  'regular',
  7:  'big_spender',
  8:  'shark',
  9:  'whale',
  10: 'nervous_intern',
  11: 'hype_train_holly',
  12: 'drunk_uncle',
  13: 'mimic',
  14: 'old_pro',
  15: 'lucky_charm',
};

function crewNameFromId(crewId: number | null): string | null {
  if (crewId === null) return null;
  return CREW_NAMES[crewId] ?? `Crew #${crewId}`;
}

function crewVisualIdFromId(crewId: number | null): string | null {
  if (crewId === null) return null;
  return CREW_VISUAL_IDS[crewId] ?? null;
}
