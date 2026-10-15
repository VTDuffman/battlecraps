// =============================================================================
// BATTLECRAPS — DEV SCENARIO BUILDER (FB-028 Phase 2)
// apps/web/src/components/dev/DevScenarioBuilder.tsx
//
// Developer-only modal: pick a preset or a marker, tweak any field, create a
// dev run. Lazy-loaded from TitleLobbyScreen only when `isDev`, so players never
// download it. The server re-checks the allowlist on POST /dev/runs.
//
// On success the new run id is written to localStorage (bc_run_id) and
// onCreated() lets App load it through the normal Continue Run path.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GAUNTLET,
  MARKER_TARGETS,
  DEV_SCENARIOS,
  getRealisticDefaults,
  isBossMarker,
  type DevScenario,
  type DevScenarioPoint,
} from '@battlecraps/shared';
import { useGameStore } from '../../store/useGameStore.js';
import type { CrewRosterEntry } from '../../store/useGameStore.js';
import { BossCounterControl, DevRow, devInputCls, devSelectCls } from './BossCounterControl.js';

const API_BASE  = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
const LS_RUN_ID = 'bc_run_id';

const MAGENTA = '#d0208a';
const POINTS: readonly DevScenarioPoint[] = [4, 5, 6, 8, 9, 10];

/** Perk comps (slot comps are expressed through unlockedSlots instead). */
const PERK_COMPS = GAUNTLET
  .map((m) => m.boss)
  .filter((b): b is NonNullable<typeof b> => b !== undefined && b.compReward !== 'NONE' && b.compPerkId > 0)
  .map((b) => ({ id: b.compPerkId, name: b.compName, boss: b.name }));

// ---------------------------------------------------------------------------
// Form state — dollars in the UI, cents on the wire
// ---------------------------------------------------------------------------

interface FormState {
  presetName:      string;
  markerIndex:     number;
  entry:           'table' | 'transition';
  bankroll:        number;   // dollars
  escrow:          number;   // dollars
  cut:             number;   // dollars — FB-032 Foreman Cut so far
  shooters:        number;
  hype:            number;
  point:           DevScenarioPoint | null;
  passLine:        number;   // dollars, only used with a point
  unlockedSlots:   3 | 4 | 5;
  crew:            (number | null)[];
  compPerkIds:     number[];
  bossCounter:     number | null; // null = use the real entry value (or random charm)
  ignoreUnlocks:   boolean;
  /** FB-039: Emissary signal — carried from a preset (no form inputs). */
  signal:          Pick<DevScenario, 'signalTransitCents' | 'signalTransitHype' | 'signalDarkRolls'>;
}

function formFromMarker(markerIndex: number, keep?: Pick<FormState, 'crew' | 'ignoreUnlocks'>): FormState {
  const d = getRealisticDefaults(markerIndex);
  return {
    presetName:    '',
    markerIndex:   d.markerIndex,
    entry:         d.entry,
    bankroll:      d.bankrollCents / 100,
    escrow:        0,
    cut:           0,
    shooters:      d.shooters,
    hype:          d.hype,
    point:         null,
    passLine:      0,
    unlockedSlots: d.unlockedSlots,
    crew:          keep?.crew ?? [null, null, null, null, null],
    compPerkIds:   d.compPerkIds,
    bossCounter:   null,
    ignoreUnlocks: keep?.ignoreUnlocks ?? false,
    signal:        {},
  };
}

function formFromPreset(preset: DevScenario): FormState {
  const base = formFromMarker(preset.markerIndex);
  const crew: (number | null)[] = [null, null, null, null, null];
  (preset.crew ?? []).slice(0, 5).forEach((id, i) => { crew[i] = id; });
  return {
    ...base,
    presetName:    preset.name ?? '',
    entry:         preset.entry ?? base.entry,
    bankroll:      preset.bankrollCents !== undefined ? preset.bankrollCents / 100 : base.bankroll,
    escrow:        (preset.pendingAdditiveCents ?? 0) / 100,
    cut:           (preset.bossProgressCents ?? 0) / 100,
    shooters:      preset.shooters ?? base.shooters,
    hype:          preset.hype ?? base.hype,
    point:         preset.point ?? null,
    passLine:      (preset.bets?.passLine ?? 0) / 100,
    unlockedSlots: preset.unlockedSlots ?? base.unlockedSlots,
    crew,
    compPerkIds:   preset.compPerkIds ?? base.compPerkIds,
    bossCounter:   preset.bossCounter ?? null,
    ignoreUnlocks: preset.ignoreUnlocks ?? false,
    signal:        {
      ...(preset.signalTransitCents !== undefined ? { signalTransitCents: preset.signalTransitCents } : {}),
      ...(preset.signalTransitHype  !== undefined ? { signalTransitHype:  preset.signalTransitHype }  : {}),
      ...(preset.signalDarkRolls    !== undefined ? { signalDarkRolls:    preset.signalDarkRolls }    : {}),
    },
  };
}

function toScenario(f: FormState): DevScenario {
  const scenario: DevScenario = {
    markerIndex:   f.markerIndex,
    entry:         f.entry,
    bankrollCents: Math.round(f.bankroll * 100),
    shooters:      f.shooters,
    hype:          f.hype,
    unlockedSlots: f.unlockedSlots,
    crew:          f.crew.slice(0, f.unlockedSlots),
    compPerkIds:   f.compPerkIds,
    ignoreUnlocks: f.ignoreUnlocks,
    ...f.signal,
  };
  if (f.presetName)          scenario.name = f.presetName;
  if (f.escrow > 0)          scenario.pendingAdditiveCents = Math.round(f.escrow * 100);
  if (f.cut > 0)             scenario.bossProgressCents = Math.round(f.cut * 100);
  if (f.bossCounter !== null) scenario.bossCounter = f.bossCounter;
  if (f.point !== null) {
    scenario.point = f.point;
    if (f.passLine > 0) {
      scenario.bets = { passLine: Math.round(f.passLine * 100), odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } };
    }
  }
  return scenario;
}

function markerLabel(i: number): string {
  const m = GAUNTLET[i];
  if (!m) return `Marker ${i}`;
  const target = `$${((MARKER_TARGETS[i] ?? 0) / 100).toLocaleString()}`;
  const slot   = m.isBoss ? 'BOSS' : `M${(i % 3) + 1}`;
  const who    = m.boss ? m.boss.name : m.venue;
  return `F${m.floor} · ${slot} · ${who} · ${target}`;
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="border border-white/10 rounded p-3 space-y-2">
    <legend className="px-1 text-[11px] tracking-widest" style={{ color: MAGENTA }}>{title}</legend>
    {children}
  </fieldset>
);

const Row       = DevRow;
const inputCls  = devInputCls;
const selectCls = devSelectCls;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DevScenarioBuilderProps {
  onClose:   () => void;
  /** Called after the run is created and its id stored in localStorage. */
  onCreated: () => void;
}

const DevScenarioBuilder: React.FC<DevScenarioBuilderProps> = ({ onClose, onCreated }) => {
  const getToken = useGameStore((s) => s.getToken);

  const [form,    setForm]    = useState<FormState>(() => formFromMarker(0));
  const [roster,  setRoster]  = useState<CrewRosterEntry[] | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value, presetName: key === 'presetName' ? (value as string) : f.presetName }));

  // ── Crew roster (names + unlock status) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken?.();
        const res = await fetch(`${API_BASE}/api/v1/crew-roster`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!res.ok) throw new Error(`crew-roster ${res.status}`);
        const data = (await res.json()) as CrewRosterEntry[] | { roster: CrewRosterEntry[] };
        const list = Array.isArray(data) ? data : data.roster;
        if (!cancelled) setRoster([...list].sort((a, b) => a.id - b.id));
      } catch (err) {
        if (!cancelled) setError(`Couldn't load crew roster: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const crewOptions = useMemo(
    () => (roster ?? []).filter((c) => form.ignoreUnlocks || c.isAvailable),
    [roster, form.ignoreUnlocks],
  );

  const marker      = GAUNTLET[form.markerIndex];
  const boss        = marker?.boss;
  const isBoss      = isBossMarker(form.markerIndex);
  const entryDefault = getRealisticDefaults(form.markerIndex).bossCounter;

  // ── Actions ─────────────────────────────────────────────────────────────
  const onPreset = (name: string) => {
    const preset = DEV_SCENARIOS.find((p) => p.name === name);
    setError(null);
    setForm(preset ? formFromPreset(preset) : formFromMarker(form.markerIndex, form));
  };

  const onMarker = (i: number) => {
    setError(null);
    setForm((f) => formFromMarker(i, f));
  };

  const setCrew = (slot: number, id: number | null) =>
    setForm((f) => {
      const crew = [...f.crew];
      crew[slot] = id;
      return { ...f, crew };
    });

  const toggleComp = (id: number) =>
    setForm((f) => ({
      ...f,
      compPerkIds: f.compPerkIds.includes(id) ? f.compPerkIds.filter((c) => c !== id) : [...f.compPerkIds, id],
    }));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/dev/runs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body:    JSON.stringify(toScenario(form)),
      });
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string; lockedCrewIds?: number[] };
      if (!res.ok || !body.runId) {
        const locked = body.lockedCrewIds?.length ? ` (locked: ${body.lockedCrewIds.join(', ')})` : '';
        throw new Error(`${body.error ?? `HTTP ${res.status}`}${locked}`);
      }
      localStorage.setItem(LS_RUN_ID, body.runId);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  // ── Boss control (per rule) — shared with the live Dev Panel ─────────────
  const bossControl = isBoss ? (
    <BossCounterControl
      markerIndex={form.markerIndex}
      unlockedSlots={form.unlockedSlots}
      counter={boss?.rule === 'DISABLE_CREW' ? form.bossCounter : (form.bossCounter ?? entryDefault)}
      onCounter={(v) => set('bossCounter', v)}
      escrowDollars={form.escrow}
      onEscrow={(d) => set('escrow', d)}
      cutDollars={form.cut}
      onCut={(d) => set('cut', d)}
      onHype={(h) => set('hype', h)}
      allowRandomCharm
    />
  ) : null;


  // ── Render ──────────────────────────────────────────────────────────────
  const modal = (
    <div className="fixed inset-0 z-[200] bg-black/85 flex items-start justify-center overflow-y-auto font-mono">
      <div className="w-full max-w-md m-4 rounded-lg border bg-[#0b0b10] text-white shadow-2xl" style={{ borderColor: MAGENTA }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-bold tracking-widest" style={{ color: MAGENTA }}>DEV RUN · SCENARIO BUILDER</h2>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none" aria-label="Close">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <Section title="PRESET">
            <select className={`${selectCls} w-full max-w-none`} value={form.presetName} onChange={(e) => onPreset(e.target.value)}>
              <option value="">— Custom —</option>
              {DEV_SCENARIOS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </Section>

          <Section title="POSITION">
            <select className={`${selectCls} w-full max-w-none`} value={form.markerIndex} onChange={(e) => onMarker(Number(e.target.value))}>
              {GAUNTLET.map((_, i) => <option key={i} value={i}>{markerLabel(i)}</option>)}
            </select>
            <div className="flex gap-4 text-sm pt-1">
              <label className="flex items-center gap-1">
                <input type="radio" checked={form.entry === 'table'} onChange={() => set('entry', 'table')} />
                Start at table
              </label>
              <label className={`flex items-center gap-1 ${form.markerIndex === 0 ? 'opacity-40' : ''}`}>
                <input type="radio" disabled={form.markerIndex === 0} checked={form.entry === 'transition'} onChange={() => set('entry', 'transition')} />
                Arrive via transition
              </label>
            </div>
            <p className="text-[10px] text-white/40">
              {form.entry === 'transition'
                ? 'Starts on the previous marker at its target — tap ADVANCE for the real clear → celebration → pub. Boss state, hype & shooters reset to the real entry values.'
                : 'Entry cinematics (marker intro / floor reveal / boss entry) still play.'}
            </p>
          </Section>

          <Section title="MONEY & TABLE">
            <Row label="Bankroll ($)">
              <input type="number" min={0} className={inputCls} value={form.bankroll} onChange={(e) => set('bankroll', Number(e.target.value))} />
            </Row>
            <Row label="Shooters">
              <input type="number" min={1} max={7} className={inputCls} value={form.shooters} onChange={(e) => set('shooters', Number(e.target.value))} />
            </Row>
            <Row label="Hype (×)">
              <input type="number" min={0.25} max={10} step={0.05} className={inputCls} value={form.hype} onChange={(e) => set('hype', Number(e.target.value))} />
            </Row>
            <Row label="Point">
              <select className={selectCls} value={form.point ?? ''} onChange={(e) => set('point', e.target.value === '' ? null : Number(e.target.value) as DevScenarioPoint)}>
                <option value="">Come-out</option>
                {POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Row>
            {form.point !== null && (
              <Row label="Pass line ($)" hint="0 = table minimum">
                <input type="number" min={0} className={inputCls} value={form.passLine} onChange={(e) => set('passLine', Number(e.target.value))} />
              </Row>
            )}
          </Section>

          <Section title="CREW">
            <Row label="Active slots">
              <select className={selectCls} value={form.unlockedSlots} onChange={(e) => set('unlockedSlots', Number(e.target.value) as 3 | 4 | 5)}>
                {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Row>
            {roster === null && !error && <p className="text-xs text-white/40">Loading roster…</p>}
            {Array.from({ length: form.unlockedSlots }, (_, slot) => (
              <Row key={slot} label={`Slot ${slot + 1}`}>
                <select className={selectCls} value={form.crew[slot] ?? ''} onChange={(e) => setCrew(slot, e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">— empty —</option>
                  {crewOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.isAvailable ? '' : ' 🔒'} · {c.rarity}</option>
                  ))}
                </select>
              </Row>
            ))}
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={form.ignoreUnlocks} onChange={(e) => set('ignoreUnlocks', e.target.checked)} />
              Ignore unlocks (all 30 crew)
            </label>
          </Section>

          <Section title="COMPS">
            {PERK_COMPS.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={form.compPerkIds.includes(c.id)} onChange={() => toggleComp(c.id)} />
                {c.name} <span className="text-white/40 text-xs">({c.boss})</span>
              </label>
            ))}
            <p className="text-[10px] text-white/40">Board Seat / Cargo Hold are set via Active slots.</p>
          </Section>

          {isBoss && boss && (
            <Section title={`BOSS · ${boss.name.toUpperCase()}`}>
              {bossControl}
            </Section>
          )}

          {error && <p className="text-sm text-red-400 break-words">{error}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={() => { void create(); }}
            className="w-full py-3 rounded font-bold tracking-widest text-white disabled:opacity-50 active:scale-95 transition"
            style={{ backgroundColor: MAGENTA }}
          >
            {busy ? 'CREATING…' : 'CREATE DEV RUN'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default DevScenarioBuilder;
