// =============================================================================
// BATTLECRAPS — CASH REGISTER (FB-032, The Foreman)
// apps/web/src/components/CashRegister.tsx
//
// Readout for The Foreman's Cut — shown front and center in place of the marker
// progress bar (TableBoard MarkerProgress): "THE CUT $18 / $25" with mechanical
// rolling digits. Each skim rolls the digits up with a "+$N" pop and a
// ka-ching; reaching the Payoff slams a PAID IN FULL stamp over the table with
// a register bell. The store holds the marker-clear celebration for
// PAYOFF_HOLD_MS so the stamp lands first.
//
// Driven by lastBossCut / _cutKey / payoffAt from applyPendingSettlement().
// Nothing fires on mount (hydration), only on new rolls.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../store/useGameStore.js';
import { playRegisterBell, playRegisterKaChing } from '../hooks/useCrowdAudio.js';

const REGISTER_GREEN = '#7CFC9A';
const STAMP_RED      = '#e11d48';
const STAMP_MS       = 1600;

// ---------------------------------------------------------------------------
// Rolling digit — a 0–9 strip translated to the current digit
// ---------------------------------------------------------------------------

const RollingDigit: React.FC<{ digit: number }> = ({ digit }) => (
  <span className="relative inline-block overflow-hidden align-bottom" style={{ width: '0.62em', height: '1.1em' }}>
    <span
      className="absolute left-0 top-0 flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none"
      style={{ transform: `translateY(-${digit * 1.1}em)` }}
    >
      {Array.from({ length: 10 }, (_, d) => (
        <span key={d} className="block text-center" style={{ height: '1.1em', lineHeight: '1.1em' }}>{d}</span>
      ))}
    </span>
  </span>
);

/** Whole dollars as rolling digits, left-padded so the width never jumps. */
const RollingDollars: React.FC<{ cents: number; minDigits: number }> = ({ cents, minDigits }) => {
  const digits = String(Math.max(0, Math.floor(cents / 100))).padStart(minDigits, '0').split('').map(Number);
  return (
    <span className="inline-flex">
      {digits.map((d, i) => <RollingDigit key={digits.length - i} digit={d} />)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CashRegister: React.FC<{
  payoffCents: number;
  /** 'large' = front-and-center under the table (replaces the marker progress bar). */
  size?: 'small' | 'large';
}> = ({ payoffCents, size = 'small' }) => {
  const large = size === 'large';
  const total    = useGameStore((s) => s.bossProgressCents);
  const lastCut  = useGameStore((s) => s.lastBossCut);
  const cutKey   = useGameStore((s) => s._cutKey);
  const payoffAt = useGameStore((s) => s.payoffAt);

  const [pop, setPop]           = useState<{ amount: number; key: number } | null>(null);
  const [stampKey, setStampKey] = useState<number | null>(null);

  // Ignore whatever the store held when we mounted (page load / reconnect).
  const mountCutKey   = useRef(cutKey);
  const mountPayoffAt = useRef(payoffAt);

  // ── Ka-ching on each skim ────────────────────────────────────────────────
  useEffect(() => {
    if (cutKey === mountCutKey.current || !lastCut || lastCut.amount <= 0) return;
    setPop({ amount: lastCut.amount, key: cutKey });
    playRegisterKaChing();
    const t = window.setTimeout(() => setPop(null), 1100);
    return () => window.clearTimeout(t);
  }, [cutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PAID IN FULL ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (payoffAt === null || payoffAt === mountPayoffAt.current) return;
    setStampKey(payoffAt);
    // Let the ka-ching ring first, then the bell.
    const bell = window.setTimeout(playRegisterBell, 250);
    const done = window.setTimeout(() => setStampKey(null), STAMP_MS);
    return () => { window.clearTimeout(bell); window.clearTimeout(done); };
  }, [payoffAt]);

  const paidOff   = total >= payoffCents;
  const minDigits = String(Math.floor(payoffCents / 100)).length;

  return (
    <div className="relative flex-none flex items-center gap-1.5" aria-live="polite">
      {/* Label sits left of the counter, on the same line. */}
      <div className={`font-pixel tracking-widest leading-none ${large ? 'text-r-11' : 'text-[7.5px]'}`} style={{ color: 'rgba(124,252,154,0.70)' }}>
        THE CUT
      </div>
      <div
        className={`inline-flex items-baseline gap-1 rounded font-mono font-bold leading-none ${large ? 'px-3 py-1.5' : 'px-1.5 py-0.5'}${paidOff ? ' animate-register-flash' : ''}`}
        style={{
          fontSize:   large ? '30px' : '16px',
          color:      REGISTER_GREEN,
          background: 'rgba(0,0,0,0.75)',
          border:     `1px solid ${REGISTER_GREEN}55`,
          boxShadow:  `inset 0 0 6px ${REGISTER_GREEN}22`,
          textShadow: `0 0 6px ${REGISTER_GREEN}88`,
        }}
        aria-label={`The Cut: $${Math.floor(total / 100)} of $${Math.floor(payoffCents / 100)}`}
      >
        <span>$</span>
        <RollingDollars cents={total} minDigits={minDigits} />
        <span className="opacity-60" style={{ fontSize: large ? '14px' : '10px' }}>/ ${Math.floor(payoffCents / 100)}</span>
      </div>

      {pop && (
        <div
          key={pop.key}
          className={`pointer-events-none absolute left-1/2 top-full font-pixel animate-kaching-pop ${large ? 'text-r-15' : 'text-r-10'}`}
          style={{ color: REGISTER_GREEN, textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
        >
          +${Math.round(pop.amount / 100)}
        </div>
      )}

      {stampKey !== null && createPortal(
        <div
          key={stampKey}
          className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3 animate-payoff-stamp">
            <div
              className="font-pixel px-5 py-3 tracking-widest"
              style={{
                fontSize:   'clamp(26px, 8vw, 44px)',
                color:      STAMP_RED,
                border:     `5px double ${STAMP_RED}`,
                borderRadius: '6px',
                background: 'rgba(10,0,4,0.55)',
                textShadow: '0 0 12px rgba(225,29,72,0.55)',
                transform:  'rotate(-8deg)',
              }}
            >
              PAID IN FULL
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
