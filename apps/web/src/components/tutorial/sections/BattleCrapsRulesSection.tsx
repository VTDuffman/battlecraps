// =============================================================================
// BATTLECRAPS — BATTLECRAPS RULES REFERENCE SECTION
// apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx
//
// Static reference for BattleCraps-specific systems.
// Reads constants directly from @battlecraps/shared — no API call.
// =============================================================================

import React from 'react';
import { GAUNTLET } from '@battlecraps/shared';

// ── Floor names ────────────────────────────────────────────────────────────

const FLOOR_NAMES = ['VFW Hall', 'The Riverboat', 'The Strip'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-pixel text-[7px] text-gray-400 tracking-widest uppercase pt-3 pb-1 border-b border-white/10">
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string; valueColor?: string }> = ({
  label, value, valueColor = 'text-gray-100',
}) => (
  <div className="flex justify-between items-baseline py-1 border-b border-white/5">
    <span className="font-dense text-[9px] text-gray-300">{label}</span>
    <span className={`font-pixel text-[8px] ${valueColor}`}>{value}</span>
  </div>
);

// ── Main component ──────────────────────────────────────────────────────────

export const BattleCrapsRulesSection: React.FC = () => {
  // Build floor data from the shared GAUNTLET constant
  const floors = [0, 1, 2].map((f) => {
    const markers = GAUNTLET.filter((m) => m.floor === f + 1);
    return { name: FLOOR_NAMES[f]!, markers };
  });

  return (
    <div className="space-y-1 pb-4 font-mono text-[9px]">

      {/* ── Gauntlet Structure ─────────────────────────────────────────────── */}
      <SectionHeader>The Gauntlet</SectionHeader>
      <p className="font-dense text-gray-300 leading-relaxed py-2">
        Nine markers across three floors. Each floor ends with a boss fight.
        Clear all nine to win the run.
      </p>

      {floors.map((floor, fi) => (
        <div key={fi} className="mt-2">
          <div className="font-pixel text-[7px] text-amber-300/70 mb-1">
            Floor {fi + 1} — {floor.name}
          </div>
          <div className="space-y-0.5">
            {floor.markers.map((m, mi) => {
              const globalIdx = fi * 3 + mi;
              const isBoss = m.isBoss;
              return (
                <div
                  key={mi}
                  className={[
                    'flex justify-between items-center px-2 py-1.5 rounded',
                    isBoss
                      ? 'border border-red-900/50 bg-red-950/30'
                      : 'border border-white/5 bg-white/[0.02]',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-pixel text-[7px] ${isBoss ? 'text-red-400' : 'text-gray-500'}`}
                    >
                      {isBoss ? '★ BOSS' : `MK ${globalIdx + 1}`}
                    </span>
                    {isBoss && m.boss && (
                      <span className="text-[8px] text-red-300/70">{m.boss.name}</span>
                    )}
                  </div>
                  <span
                    className={`font-pixel text-[8px] ${isBoss ? 'text-red-300' : 'text-gray-200'}`}
                  >
                    {dollars(m.targetCents)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Shooter Lives ──────────────────────────────────────────────────── */}
      <SectionHeader>Shooter Lives</SectionHeader>
      <p className="font-dense text-gray-300 leading-relaxed py-2">
        You start each run with <span className="text-amber-300">5 shooter lives</span>.
        Each Seven Out costs one. Reach zero and the run ends.
        Certain boss comp perks can add lives back.
      </p>

      {/* ── Marker System ─────────────────────────────────────────────────── */}
      <SectionHeader>Marker System</SectionHeader>
      <div className="py-2 space-y-1">
        <Row label="Starting bankroll" value="$250.00" />
        <Row label="Bet max" value="10% of marker target" />
        <Row label="Odds cap (4/10)" value="3× Pass Line" />
        <Row label="Odds cap (5/9)" value="4× Pass Line" />
        <Row label="Odds cap (6/8)" value="5× Pass Line" />
      </div>
      <p className="font-dense text-gray-400 leading-relaxed">
        Hit the target bankroll to clear the marker and advance. Fall short
        with no lives left and the run ends.
      </p>

      {/* ── Hype Multiplier ───────────────────────────────────────────────── */}
      <SectionHeader>Hype Multiplier</SectionHeader>
      <p className="font-dense text-gray-300 leading-relaxed py-2">
        Every consecutive point hit by the current shooter increases your Hype
        multiplier. It boosts the profit portion of every winning payout.
      </p>
      <div className="space-y-0.5">
        <Row label="Starting Hype"      value="1.00×" />
        <Row label="Tick (1st hit)"     value="+0.05×" valueColor="text-green-400" />
        <Row label="Tick (2nd hit)"     value="+0.10×" valueColor="text-green-400" />
        <Row label="Tick (3rd hit)"     value="+0.15×" valueColor="text-green-400" />
        <Row label="Tick (4th+ hit)"    value="+0.20×" valueColor="text-green-400" />
        <Row label="Seven Out"          value="Resets to 1.00×" valueColor="text-red-400" />
      </div>
      <div className="mt-2 border border-amber-900/40 rounded bg-amber-950/20 p-3">
        <div className="font-pixel text-[7px] text-amber-300 mb-1">PAYOUT FORMULA</div>
        <div className="font-dense text-gray-200 leading-relaxed">
          Final payout = stake returned + ⌈ gross profit × Hype ⌉
        </div>
        <div className="font-dense text-gray-500 text-[8px] mt-1">
          Example: $100 Pass Line wins $100 base. At 1.5× Hype, profit is $150 (not $100).
        </div>
      </div>

      {/* ── Odds Payout Quick Reference ───────────────────────────────────── */}
      <SectionHeader>Odds Payout Quick Reference</SectionHeader>
      <div className="grid grid-cols-3 gap-1 py-2 text-center">
        {[
          { point: '4 / 10', pays: '2:1',  max: '3×' },
          { point: '5 / 9',  pays: '3:2',  max: '4×' },
          { point: '6 / 8',  pays: '6:5',  max: '5×' },
        ].map(({ point, pays, max }) => (
          <div key={point} className="border border-white/10 rounded p-2 bg-black/20">
            <div className="font-pixel text-[7px] text-amber-300">{point}</div>
            <div className="font-pixel text-[9px] text-green-400 mt-0.5">{pays}</div>
            <div className="font-dense text-gray-500 text-[7px] mt-0.5">cap {max} Pass</div>
          </div>
        ))}
      </div>

      {/* ── Hardway Payouts ───────────────────────────────────────────────── */}
      <SectionHeader>Hardway Payouts</SectionHeader>
      <div className="grid grid-cols-2 gap-1 py-2 text-center">
        {[
          { bet: 'Hard 4',  pays: '7:1' },
          { bet: 'Hard 10', pays: '7:1' },
          { bet: 'Hard 6',  pays: '9:1' },
          { bet: 'Hard 8',  pays: '9:1' },
        ].map(({ bet, pays }) => (
          <div key={bet} className="border border-white/10 rounded p-1.5 bg-black/20">
            <div className="font-pixel text-[7px] text-amber-300">{bet}</div>
            <div className="font-pixel text-[8px] text-green-400 mt-0.5">{pays}</div>
          </div>
        ))}
      </div>

    </div>
  );
};
