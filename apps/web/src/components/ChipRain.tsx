// =============================================================================
// BATTLECRAPS — CHIP RAIN
// apps/web/src/components/ChipRain.tsx
//
// Particle system that fires chips from winning bet zones up to the bankroll
// display whenever a payout lands. Intensity scales with payout size:
//
//   Drizzle  (< $5)    —  6 chips, modest arc
//   Shower   ($5–$25)  — 12 chips, medium arc
//   Downpour ($25–$100)— 20 chips, tall arc, wide spread
//   Torrent  (> $100)  — 32 chips + table shake + KA-CHING banner
//
// Each chip is an absolutely-positioned div driven by a single shared
// CSS keyframe (chip-arc). Per-chip trajectory variation comes from CSS
// custom properties (--cx-apex, --cy-apex, etc.) set inline. No canvas,
// no external library.
//
// The component renders its wrapper div unconditionally (so the ref is
// always valid for dimension measurement) but it has no visual footprint
// when no animation is running.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import type { BetField } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = 'drizzle' | 'shower' | 'downpour' | 'torrent';

interface ChipParticle {
  id:       number;
  color:    string;   // fill hex
  border:   string;   // border hex
  size:     number;   // px diameter
  startX:   number;   // px from container left
  startY:   number;   // px from container top
  apexTx:   number;   // px horizontal displacement at arc apex
  apexTy:   number;   // px vertical displacement at arc apex (negative = up)
  endTx:    number;   // px horizontal displacement at landing
  endTy:    number;   // px vertical displacement at landing (negative = up)
  rotApex:  number;   // deg rotation at apex
  rotEnd:   number;   // deg rotation at landing
  duration: number;   // ms
  delay:    number;   // ms
}

interface SpawnSource {
  field:  BetField;
  amount: number;  // cents
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_THRESHOLD: Record<Tier, number> = {
  drizzle:  0,
  shower:   500,    // $5
  downpour: 2500,   // $25
  torrent:  10000,  // $100
};

const TIER_COUNT: Record<Tier, number> = {
  drizzle:  6,
  shower:   12,
  downpour: 20,
  torrent:  32,
};

const TIER_BASE_DURATION: Record<Tier, number> = {
  drizzle:   650,
  shower:    820,
  downpour:  980,
  torrent:  1150,
};

/**
 * Spawn origins as [xFraction, yFraction] of the container.
 * Calibrated to the TableBoard layout:
 *   Betting grid starts ~55 % down; pass/odds row at ~60 %, hardways at ~67 %.
 */
const SPAWN_FRACS: Record<BetField, [number, number]> = {
  passLine: [0.250, 0.60],
  odds:     [0.750, 0.60],
  hard4:    [0.125, 0.67],
  hard6:    [0.375, 0.67],
  hard8:    [0.625, 0.67],
  hard10:   [0.875, 0.67],
};

/** Chip colours match the bet type that won. */
const CHIP_COLORS: Record<BetField, { fill: string; border: string }> = {
  passLine: { fill: '#f5c842', border: '#d4a017' },  // gold
  odds:     { fill: '#2980b9', border: '#1a5276' },  // blue
  hard4:    { fill: '#c0392b', border: '#7b241c' },  // red
  hard6:    { fill: '#c0392b', border: '#7b241c' },
  hard8:    { fill: '#c0392b', border: '#7b241c' },
  hard10:   { fill: '#c0392b', border: '#7b241c' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTier(totalCents: number): Tier {
  if (totalCents >= TIER_THRESHOLD.torrent)  return 'torrent';
  if (totalCents >= TIER_THRESHOLD.downpour) return 'downpour';
  if (totalCents >= TIER_THRESHOLD.shower)   return 'shower';
  return 'drizzle';
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateParticles(
  sources: SpawnSource[],
  tier:    Tier,
  width:   number,
  height:  number,
): ChipParticle[] {
  if (sources.length === 0) return [];

  const count    = TIER_COUNT[tier];
  const baseDur  = TIER_BASE_DURATION[tier];
  const totalAmt = sources.reduce((s, src) => s + src.amount, 0);

  // Bankroll landing zone — top-left area of the HUD row
  const targetX = width  * 0.28;
  const targetY = height * 0.09;

  const particles: ChipParticle[] = [];

  for (let i = 0; i < count; i++) {
    // Weighted-random source selection (more chips from higher-payout zones)
    let r = Math.random() * totalAmt;
    let source = sources[sources.length - 1]!;
    for (const s of sources) { r -= s.amount; if (r <= 0) { source = s; break; } }

    const [xFrac, yFrac] = SPAWN_FRACS[source.field];
    const spawnX = xFrac * width  + rnd(-12, 12);
    const spawnY = yFrac * height + rnd(-8,  8);

    // Arc apex: partway horizontally toward bankroll, high up the table
    const apexX = spawnX + (targetX - spawnX) * rnd(0.35, 0.55) + rnd(-50, 50);
    const apexY = height * rnd(0.18, 0.28);

    // Landing scatter around bankroll display
    const landX = targetX + rnd(-80, 80);
    const landY = targetY + rnd(-20, 20);

    const colors = CHIP_COLORS[source.field];

    particles.push({
      id:       i,
      color:    colors.fill,
      border:   colors.border,
      size:     rnd(14, 20),
      startX:   spawnX,
      startY:   spawnY,
      apexTx:   apexX  - spawnX,
      apexTy:   apexY  - spawnY,   // negative → moving upward
      endTx:    landX  - spawnX,
      endTy:    landY  - spawnY,   // negative → above spawn
      rotApex:  rnd(-120,  120),
      rotEnd:   rnd(-360,  360),
      duration: baseDur * rnd(0.82, 1.18),
      delay:    i * (tier === 'torrent' ? 28 : 18) + rnd(0, 30),
    });
  }

  return particles;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChipRainProps {
  /** Called when a TORRENT-tier payout is detected — lets TableBoard shake. */
  onTorrent?: () => void;
}

export const ChipRain: React.FC<ChipRainProps> = ({ onTorrent }) => {
  const payoutPops = useGameStore((s) => s.payoutPops);
  const _popsKey   = useGameStore((s) => s._popsKey);

  // Wrapper ref — always mounted so we can read container dimensions
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [particles,    setParticles]    = useState<ChipParticle[]>([]);
  const [kachingKey,   setKachingKey]   = useState(0);
  const [kachingAmt,   setKachingAmt]   = useState(0);
  const [showKaching,  setShowKaching]  = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!payoutPops || _popsKey === 0) return;

    const total = payoutPops.passLine + payoutPops.odds + payoutPops.hardways;
    if (total <= 0) return;

    const tier = getTier(total);

    // Build spawn source list from whichever zones paid out this roll
    const sources: SpawnSource[] = [];
    if (payoutPops.passLine > 0)
      sources.push({ field: 'passLine', amount: payoutPops.passLine });
    if (payoutPops.odds > 0)
      sources.push({ field: 'odds', amount: payoutPops.odds });
    if (payoutPops.hardways > 0 && payoutPops.hardwayField)
      sources.push({ field: payoutPops.hardwayField, amount: payoutPops.hardways });

    const width  = wrapperRef.current?.clientWidth  ?? 400;
    const height = wrapperRef.current?.clientHeight ?? 800;

    const newParticles = generateParticles(sources, tier, width, height);
    setParticles(newParticles);

    if (tier === 'torrent') {
      onTorrent?.();
      setKachingAmt(total);
      setKachingKey((k) => k + 1);
      setShowKaching(true);
    }

    // Clear after all chip animations complete
    if (clearTimer.current) clearTimeout(clearTimer.current);
    const maxDur = Math.max(...newParticles.map((p) => p.duration + p.delay));
    clearTimer.current = setTimeout(() => {
      setParticles([]);
      setShowKaching(false);
    }, maxDur + 400);
  }, [_popsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (clearTimer.current) clearTimeout(clearTimer.current); };
  }, []);

  return (
    <div ref={wrapperRef} className="absolute inset-0 pointer-events-none z-30">
      {particles.map((chip) => (
        <div
          key={chip.id}
          className="absolute rounded-full animate-chip-arc"
          style={{
            width:       chip.size,
            height:      chip.size,
            left:        chip.startX,
            top:         chip.startY,
            background:  chip.color,
            border:      `2px solid ${chip.border}`,
            boxShadow:   `0 0 5px ${chip.color}99`,
            animationDuration: `${chip.duration}ms`,
            animationDelay:    `${chip.delay}ms`,
            '--cx-apex': `${chip.apexTx}px`,
            '--cy-apex': `${chip.apexTy}px`,
            '--cr-apex': `${chip.rotApex}deg`,
            '--cx-end':  `${chip.endTx}px`,
            '--cy-end':  `${chip.endTy}px`,
            '--cr-end':  `${chip.rotEnd}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* KA-CHING banner — TORRENT tier only */}
      {showKaching && (
        <div
          key={kachingKey}
          className="absolute font-pixel text-gold-bright animate-kaching-pop"
          style={{
            left:       '50%',
            top:        '52%',
            fontSize:   '13px',
            whiteSpace: 'nowrap',
            textShadow: '0 0 24px rgba(245,200,66,0.9), 0 0 8px rgba(245,200,66,0.6)',
          }}
        >
          {`KA-CHING! +$${(kachingAmt / 100).toFixed(2)}`}
        </div>
      )}
    </div>
  );
};
