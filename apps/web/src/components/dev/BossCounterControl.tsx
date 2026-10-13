// =============================================================================
// BATTLECRAPS — DEV BOSS COUNTER CONTROL (FB-028)
// apps/web/src/components/dev/BossCounterControl.tsx
//
// One friendly control per boss rule for the overloaded bossPointHits counter
// (rating, tide stage, seven-outs, charmed slot, escalation step) plus the
// escrow / hype shortcuts for the bosses whose state lives elsewhere.
// Shared by the Scenario Builder and the live Dev Panel.
// =============================================================================

import React from 'react';
import { GAUNTLET, getBossCounterRange, isBossMarker } from '@battlecraps/shared';

const RATING_LABELS = ['Action Required', 'Below Strong', 'Strong', 'Very Strong', 'Exceptional'];

export const devInputCls  = 'bg-black border border-white/20 rounded px-2 py-1 text-white text-sm w-36 text-right';
export const devSelectCls = 'bg-black border border-white/20 rounded px-2 py-1 text-white text-sm max-w-[14rem]';

export const DevRow: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="flex items-center justify-between gap-3 text-sm">
    <span className="text-white/70 shrink-0">
      {label}
      {hint && <span className="block text-[10px] text-white/40">{hint}</span>}
    </span>
    {children}
  </label>
);

interface BossCounterControlProps {
  markerIndex:    number;
  unlockedSlots:  number;
  /** Current counter value; null = "use the real entry value / random charm". */
  counter:        number | null;
  onCounter:      (value: number | null) => void;
  /** Escrow / transmission buffer in dollars (Hierophant, Emissary). */
  escrowDollars:  number;
  onEscrow:       (dollars: number) => void;
  onHype:         (hype: number) => void;
  /** Builder only: offer "Random filled slot" for Le Prix. */
  allowRandomCharm?: boolean;
  /** FB-032 (The Foreman): Cut so far in dollars, and its setter. */
  cutDollars?:    number;
  onCut?:         (dollars: number) => void;
}

export const BossCounterControl: React.FC<BossCounterControlProps> = ({
  markerIndex, unlockedSlots, counter, onCounter, escrowDollars, onEscrow, onHype, allowRandomCharm = false,
  cutDollars = 0, onCut,
}) => {
  const boss = GAUNTLET[markerIndex]?.boss;
  if (!isBossMarker(markerIndex) || !boss) return null;

  const range = getBossCounterRange(markerIndex, unlockedSlots);
  const value = counter ?? 0;
  const numberSelect = (label: string, options: { value: number; label: string }[], hint?: string) => (
    <DevRow label={label} hint={hint}>
      <select className={devSelectCls} value={value} onChange={(e) => onCounter(Number(e.target.value))}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </DevRow>
  );

  switch (boss.rule) {
    case 'CROSS_CALIBRATION':
      return numberSelect('Rating', RATING_LABELS.map((l, i) => ({ value: i, label: `${i} · ${l}` })));
    case 'CONVERGENCE':
      return numberSelect('Seven-outs so far', [0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), 'each removes a crew slot');
    case 'TIDAL_SURGE': {
      const labels = boss.ruleParams.rule === 'TIDAL_SURGE' ? boss.ruleParams.stageLabels : ['LOW', 'EBB', 'HIGH', 'FLOW'];
      return numberSelect('Tide stage', labels.map((l, i) => ({ value: i, label: l })));
    }
    case 'DISABLE_CREW':
      return (
        <DevRow label="Charmed slot">
          <select
            className={devSelectCls}
            value={counter ?? (allowRandomCharm ? '' : 0)}
            onChange={(e) => onCounter(e.target.value === '' ? null : Number(e.target.value))}
          >
            {allowRandomCharm && <option value="">Random filled slot</option>}
            {Array.from({ length: unlockedSlots }, (_, i) => <option key={i} value={i}>Slot {i + 1}</option>)}
          </select>
        </DevRow>
      );
    case 'DOUBLE_TIME':
      return (
        <DevRow label="Clock rolls used" hint="point-phase rolls used; the last one times out">
          <input type="number" min={range?.min ?? 0} max={range?.max ?? 5} className={devInputCls}
            value={value} onChange={(e) => onCounter(Number(e.target.value))} />
        </DevRow>
      );
    case 'TRIBUTE':
    case 'TRANSMISSION_DELAY':
      return (
        <DevRow label={boss.rule === 'TRIBUTE' ? 'Escrow held ($)' : 'Buffered additive ($)'}>
          <input type="number" min={0} className={devInputCls} value={escrowDollars}
            onChange={(e) => onEscrow(Number(e.target.value))} />
        </DevRow>
      );
    case 'ORBITAL_DECAY':
      return (
        <DevRow label="Hype presets" hint="death spiral below 0.75×">
          <div className="flex gap-1">
            {[1.0, 0.8, 0.7].map((h) => (
              <button key={h} type="button" onClick={() => onHype(h)}
                className="border border-white/20 rounded px-2 py-1 text-xs text-white/80">{h.toFixed(2)}×</button>
            ))}
          </div>
        </DevRow>
      );
    case 'EXTORTION_FEE': {
      const payoffDollars = boss.ruleParams.rule === 'EXTORTION_FEE' ? boss.ruleParams.payoffCents / 100 : 25;
      return (
        <DevRow label="Cut so far ($)" hint={`Payoff is $${payoffDollars}`}>
          <span className="flex gap-1">
            <input type="number" min={0} className={`${devInputCls} w-20`} value={cutDollars}
              onChange={(e) => onCut?.(Math.max(0, Number(e.target.value)))} />
            <button type="button" onClick={() => onCut?.(Math.max(0, payoffDollars - 2))}
              className="border border-white/20 rounded px-2 py-1 text-xs text-white/80" title="One win from the Payoff">−$2</button>
          </span>
        </DevRow>
      );
    }
    default:
      return <p className="text-xs text-white/50">No boss state to set for {boss.name}.</p>;
  }
};
