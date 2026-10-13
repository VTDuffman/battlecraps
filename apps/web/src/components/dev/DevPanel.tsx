// =============================================================================
// BATTLECRAPS — LIVE DEV PANEL (FB-028 Phase 4)
// apps/web/src/components/dev/DevPanel.tsx
//
// Slide-out drawer on dev runs: edit run state mid-game, jump markers, force a
// game over, inspect raw state, and copy the current state as a DevScenario.
// Toggle with the backtick key (`) or the DEV tab. Locked while a roll or
// cascade is in flight. Every change goes through the dev routes (server
// re-checks the allowlist and refuses real runs), then re-hydrates the store.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GAUNTLET,
  MARKER_TARGETS,
  getBossCounterRange,
  type DevScenario,
  type DevScenarioPoint,
} from '@battlecraps/shared';
import { useGameStore, selectIsCascading, type DevRunPayload } from '../../store/useGameStore.js';
import { BossCounterControl, DevRow, devInputCls, devSelectCls } from './BossCounterControl.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
const MAGENTA  = '#d0208a';

function markerLabel(i: number): string {
  const m = GAUNTLET[i];
  if (!m) return `Marker ${i}`;
  const target = `$${((MARKER_TARGETS[i] ?? 0) / 100).toLocaleString()}`;
  return `F${m.floor} · ${m.isBoss ? 'BOSS' : `M${(i % 3) + 1}`} · ${m.boss ? m.boss.name : m.venue} · ${target}`;
}

/** Current run → a DevScenario preset (paste into packages/shared/src/devScenarios.ts). */
function toScenario(p: DevRunPayload): DevScenario {
  const scenario: DevScenario = {
    name:                 `Captured — ${markerLabel(p.currentMarkerIndex)}`,
    markerIndex:          p.currentMarkerIndex,
    bankrollCents:        p.bankroll,
    shooters:             p.shooters,
    hype:                 Math.round(p.hype * 100) / 100,
    consecutivePointHits: p.consecutivePointHits,
    crew:                 p.crewSlots.slice(0, p.unlockedSlots).map((s) => s?.crewId ?? null),
    unlockedSlots:        p.unlockedSlots,
    compPerkIds:          p.compPerkIds,
    entry:                'table',
    ignoreUnlocks:        true,
  };
  if (p.phase === 'POINT_ACTIVE' && p.point !== null) {
    scenario.point = p.point as DevScenarioPoint;
    scenario.bets  = p.bets;
  }
  if (getBossCounterRange(p.currentMarkerIndex, p.unlockedSlots) !== null) scenario.bossCounter = p.bossPointHits;
  if (p.pendingAdditiveCents > 0) scenario.pendingAdditiveCents = p.pendingAdditiveCents;
  return scenario;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h3 className="text-[11px] tracking-widest" style={{ color: MAGENTA }}>{title}</h3>
    {children}
  </section>
);

const smallBtn = 'border border-white/20 rounded px-2 py-1 text-xs text-white/85 hover:border-white/50 disabled:opacity-40';

const DevPanel: React.FC = () => {
  const runId              = useGameStore((s) => s.runId);
  const getToken           = useGameStore((s) => s.getToken);
  const applyDevRunPayload = useGameStore((s) => s.applyDevRunPayload);
  const payload            = useGameStore((s) => s.devLastRunPayload);
  const lastRoll           = useGameStore((s) => s.devLastRoll);
  const isRolling          = useGameStore((s) => s.isRolling);
  const isAutoCollecting   = useGameStore((s) => s.isAutoCollecting);
  const isCascading        = useGameStore(selectIsCascading);

  const [open,       setOpen]       = useState(false);
  const [pending,    setPending]    = useState(false);
  const [message,    setMessage]    = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bankroll,   setBankroll]   = useState('');
  const [hype,       setHype]       = useState('');
  const [jumpTo,     setJumpTo]     = useState(0);
  const [jumpEntry,  setJumpEntry]  = useState<'transition' | 'table'>('transition');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const locked = isRolling || isAutoCollecting || isCascading || pending;

  // ── Toggle with backtick (ignored while typing in a field) ──────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '`') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const devFetch = useCallback(async (method: 'GET' | 'PATCH' | 'POST', path: string, body?: unknown): Promise<DevRunPayload> => {
    const token = await getToken?.();
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as DevRunPayload & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }, [getToken]);

  // Refresh the inspector snapshot whenever the panel opens (no store merge,
  // so bets placed but not yet rolled are left alone).
  useEffect(() => {
    if (!open || !runId) return;
    void devFetch('GET', `/runs/${runId}`)
      .then((p) => useGameStore.setState({ devLastRunPayload: p }))
      .catch((err: unknown) => setMessage({ kind: 'err', text: err instanceof Error ? err.message : String(err) }));
  }, [open, runId, devFetch]);

  // Keep form fields in step with the latest server state.
  useEffect(() => {
    if (!payload) return;
    setBankroll(String(payload.bankroll / 100));
    setHype(String(Math.round(payload.hype * 100) / 100));
    setJumpTo(payload.currentMarkerIndex);
  }, [payload]);

  const run = async (label: string, action: () => Promise<DevRunPayload>, reconnect: boolean) => {
    setPending(true);
    setMessage(null);
    try {
      const p = await action();
      applyDevRunPayload(p, { reconnect });
      setMessage({ kind: 'ok', text: label });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  };

  const patch = (label: string, body: Record<string, unknown>) =>
    run(label, () => devFetch('PATCH', `/dev/runs/${runId}`, body), false);

  const copyScenario = async () => {
    if (!payload) return;
    const text = JSON.stringify(toScenario(payload), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ kind: 'ok', text: 'Scenario JSON copied — paste into devScenarios.ts' });
    } catch {
      window.prompt('Copy scenario JSON:', text);
    }
  };

  if (!runId) return null;

  const target = payload ? (MARKER_TARGETS[payload.currentMarkerIndex] ?? 0) : 0;

  const drawer = (
    <>
      {/* Edge tab */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/3 z-[150] rounded-l-md px-1.5 py-3 font-mono text-[10px] font-bold tracking-widest text-white shadow-lg"
          style={{ backgroundColor: MAGENTA, writingMode: 'vertical-rl' }}
          title="Dev panel (`)"
        >
          DEV ◂
        </button>
      )}

      {open && (
        <aside className="fixed inset-y-0 right-0 z-[160] w-[min(22rem,100vw)] overflow-y-auto border-l font-mono text-white shadow-2xl backdrop-blur-md"
          style={{ borderColor: MAGENTA, backgroundColor: 'rgba(11, 11, 16, 0.88)' }}>
          <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#0b0b10] px-4 py-3">
            <h2 className="text-sm font-bold tracking-widest" style={{ color: MAGENTA }}>DEV PANEL</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-lg leading-none text-white/60 hover:text-white" aria-label="Close">✕</button>
          </div>

          <div className="space-y-5 p-4">
            {payload ? (
              <p className="text-xs text-white/60">
                {markerLabel(payload.currentMarkerIndex)}<br />
                {payload.status} · ${(payload.bankroll / 100).toLocaleString()} · {payload.hype.toFixed(2)}× · {payload.shooters} shooters
              </p>
            ) : <p className="text-xs text-white/40">Loading run…</p>}

            {locked && <p className="text-xs text-amber-300">Locked while a roll is resolving…</p>}
            {message && (
              <p className={`text-xs break-words ${message.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
            )}

            {payload && (
              <>
                <Section title="QUICK EDITS">
                  <DevRow label="Bankroll ($)">
                    <span className="flex gap-1">
                      <input type="number" min={0} className={`${devInputCls} w-24`} value={bankroll} onChange={(e) => setBankroll(e.target.value)} />
                      <button type="button" disabled={locked} className={smallBtn}
                        onClick={() => void patch('Bankroll set', { bankrollCents: Math.max(0, Math.round(Number(bankroll) * 100)) })}>Set</button>
                    </span>
                  </DevRow>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: '+$100', cents: payload.bankroll + 10_000 },
                      { label: '+10%',  cents: Math.round(payload.bankroll * 1.1) },
                      { label: '−10%',  cents: Math.round(payload.bankroll * 0.9) },
                      { label: 'Target −$1', cents: Math.max(0, target - 100) },
                    ].map((b) => (
                      <button key={b.label} type="button" disabled={locked} className={smallBtn}
                        onClick={() => void patch(`Bankroll ${b.label}`, { bankrollCents: b.cents })}>{b.label}</button>
                    ))}
                  </div>
                  <DevRow label="Hype (×)">
                    <span className="flex gap-1">
                      <input type="number" min={0.25} max={10} step={0.05} className={`${devInputCls} w-24`} value={hype} onChange={(e) => setHype(e.target.value)} />
                      <button type="button" disabled={locked} className={smallBtn}
                        onClick={() => void patch('Hype set', { hype: Number(hype) })}>Set</button>
                    </span>
                  </DevRow>
                  <DevRow label="Shooters">
                    <span className="flex items-center gap-1">
                      <button type="button" disabled={locked || payload.shooters <= 0} className={smallBtn}
                        onClick={() => void patch('Shooter removed', { shooters: payload.shooters - 1 })}>−</button>
                      <span className="w-6 text-center">{payload.shooters}</span>
                      <button type="button" disabled={locked || payload.shooters >= 7} className={smallBtn}
                        onClick={() => void patch('Shooter added', { shooters: payload.shooters + 1 })}>+</button>
                    </span>
                  </DevRow>
                  <button type="button" disabled={locked} className={smallBtn}
                    onClick={() => void patch('Bets cleared (refunded)', { clearBets: true })}>Clear bets (refund)</button>
                </Section>

                {GAUNTLET[payload.currentMarkerIndex]?.isBoss && (
                  <Section title={`BOSS · ${GAUNTLET[payload.currentMarkerIndex]?.boss?.name.toUpperCase() ?? ''}`}>
                    <fieldset disabled={locked}>
                      <BossCounterControl
                        markerIndex={payload.currentMarkerIndex}
                        unlockedSlots={payload.unlockedSlots}
                        counter={payload.bossPointHits}
                        onCounter={(v) => { if (v !== null) void patch('Boss state set', { bossCounter: v }); }}
                        escrowDollars={payload.pendingAdditiveCents / 100}
                        onEscrow={(d) => void patch('Escrow set', { pendingAdditiveCents: Math.max(0, Math.round(d * 100)) })}
                        onHype={(h) => void patch('Hype set', { hype: h })}
                      />
                    </fieldset>
                  </Section>
                )}

                <Section title="JUMP">
                  <select className={`${devSelectCls} w-full max-w-none`} value={jumpTo} onChange={(e) => setJumpTo(Number(e.target.value))}>
                    {GAUNTLET.map((_, i) => <option key={i} value={i}>{markerLabel(i)}</option>)}
                  </select>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={jumpEntry === 'transition'} onChange={() => setJumpEntry('transition')} disabled={jumpTo === 0} />
                      With cinematics
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={jumpEntry === 'table'} onChange={() => setJumpEntry('table')} />
                      Straight to table
                    </label>
                  </div>
                  <button type="button" disabled={locked} className={smallBtn}
                    onClick={() => void run(
                      jumpEntry === 'transition' && jumpTo > 0
                        ? 'Jumped — tap ✓ TARGET MET — ADVANCE to play the clear'
                        : 'Jumped',
                      () => devFetch('POST', `/dev/runs/${runId}/jump`, { markerIndex: jumpTo, entry: jumpTo === 0 ? 'table' : jumpEntry }),
                      true,
                    )}>Jump</button>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button type="button" disabled={locked || payload.bankroll >= target} className={smallBtn}
                      onClick={() => void patch('Bankroll at target — tap ✓ TARGET MET — ADVANCE', { bankrollCents: target, clearBets: true })}>
                      Clear this marker
                    </button>
                    {confirmEnd ? (
                      <>
                        <button type="button" disabled={locked} className={`${smallBtn} border-red-500 text-red-300`}
                          onClick={() => { setConfirmEnd(false); void run('Game over forced', () => devFetch('POST', `/dev/runs/${runId}/force`, { action: 'GAME_OVER' }), true); }}>
                          Confirm game over
                        </button>
                        <button type="button" className={smallBtn} onClick={() => setConfirmEnd(false)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" disabled={locked} className={smallBtn} onClick={() => setConfirmEnd(true)}>Force game over</button>
                    )}
                  </div>
                </Section>

                <Section title="INSPECTOR">
                  <button type="button" className={smallBtn} onClick={() => void copyScenario()}>Copy as scenario</button>
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-white/70">Run state</summary>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-black/60 p-2 text-white/80">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </details>
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-white/70">Last roll response</summary>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-black/60 p-2 text-white/80">
                      {lastRoll === null ? '— no roll yet —' : JSON.stringify(lastRoll, null, 2)}
                    </pre>
                  </details>
                </Section>
              </>
            )}

            <p className="text-[10px] text-white/30">Toggle: ` (backtick) · Dice: 🎲 DEV button</p>
          </div>
        </aside>
      )}
    </>
  );

  return createPortal(drawer, document.body);
};

export default DevPanel;
