// =============================================================================
// BATTLECRAPS — DEV DICE CONTROL (FB-028 Phase 3)
// apps/web/src/components/dev/DevDiceControl.tsx
//
// Floating widget (dev runs only) to queue exact dice for upcoming rolls.
// Each roll consumes the first queued pair, sent as cheat_dice; the server
// honours it only for allowlisted devs on dev runs. Presets adapt to the
// current phase / point. Lazy-loaded from TableBoard.
// =============================================================================

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore, selectIsCascading } from '../../store/useGameStore.js';

const MAGENTA = '#d0208a';

type Pair = [number, number];

/** Easy (non-pair) way to roll each point; hard way for 4/6/8/10. */
const EASY: Record<number, Pair> = { 4: [1, 3], 5: [2, 3], 6: [2, 4], 8: [3, 5], 9: [4, 5], 10: [4, 6] };
const HARD: Record<number, Pair> = { 4: [2, 2], 6: [3, 3], 8: [4, 4], 10: [5, 5] };

interface Preset { label: string; dice: Pair }

function presetsFor(phase: string | null, point: number | null): Preset[] {
  if (phase === 'POINT_ACTIVE' && point !== null) {
    const list: Preset[] = [];
    const easy = EASY[point];
    const hard = HARD[point];
    if (easy) list.push({ label: `Hit ${point} (easy)`, dice: easy });
    if (hard) list.push({ label: `Hit ${point} (hard)`, dice: hard });
    list.push({ label: 'Seven-out', dice: [3, 4] });
    list.push({ label: 'No decision (3)', dice: [1, 2] });
    for (const n of [4, 6, 8, 10]) {
      const h = HARD[n];
      if (n !== point && h) list.push({ label: `Hard ${n}`, dice: h });
    }
    for (const n of [6, 8]) {
      const e = EASY[n];
      if (n !== point && e) list.push({ label: `Easy ${n}`, dice: e });
    }
    return list;
  }
  return [
    { label: 'Natural 7', dice: [3, 4] },
    { label: 'Yo 11',     dice: [5, 6] },
    { label: 'Craps 2',   dice: [1, 1] },
    { label: 'Craps 3',   dice: [1, 2] },
    { label: 'Craps 12',  dice: [6, 6] },
    ...[4, 5, 6, 8, 9, 10].map((p) => ({ label: `Point ${p}`, dice: EASY[p] ?? ([1, 1] as Pair) })),
    { label: 'Hard 6 point', dice: [3, 3] },
    { label: 'Hard 8 point', dice: [4, 4] },
  ];
}

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const face = (n: number) => DIE_FACES[n - 1] ?? String(n);

const DevDiceControl: React.FC = () => {
  const phase         = useGameStore((s) => s.phase);
  const point         = useGameStore((s) => s.point);
  const queue         = useGameStore((s) => s.devDiceQueue);
  const pushDevDice   = useGameStore((s) => s.pushDevDice);
  const removeDevDice = useGameStore((s) => s.removeDevDice);
  const clearDevDice  = useGameStore((s) => s.clearDevDice);
  const isRolling     = useGameStore((s) => s.isRolling);
  const isCascading   = useGameStore(selectIsCascading);

  const [open, setOpen] = useState(false);
  const [d1,   setD1]   = useState(3);
  const [d2,   setD2]   = useState(4);

  const busy    = isRolling || isCascading;
  const presets = presetsFor(phase, point);

  const panel = (
    <div className="fixed bottom-20 right-3 z-[150] font-mono text-white select-none">
      {open ? (
        <div className="w-64 rounded-lg border shadow-2xl p-3 space-y-2 backdrop-blur-md" style={{ borderColor: MAGENTA, backgroundColor: 'rgba(11, 11, 16, 0.88)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest" style={{ color: MAGENTA }}>DEV DICE</span>
            <button type="button" className="text-white/60 hover:text-white" onClick={() => setOpen(false)} aria-label="Collapse">▾</button>
          </div>

          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy}
                onClick={() => pushDevDice(p.dice)}
                className="border border-white/20 rounded px-1.5 py-0.5 text-[11px] text-white/85 hover:border-white/50 disabled:opacity-40"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-sm">
            {[{ v: d1, s: setD1 }, { v: d2, s: setD2 }].map(({ v, s }, i) => (
              <select key={i} value={v} onChange={(e) => s(Number(e.target.value))}
                className="bg-black border border-white/20 rounded px-1 py-0.5">
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ))}
            <span className="text-white/50 text-xs">= {d1 + d2}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => pushDevDice([d1, d2])}
              className="ml-auto rounded px-2 py-0.5 text-xs font-bold disabled:opacity-40"
              style={{ backgroundColor: MAGENTA }}
            >
              QUEUE
            </button>
          </div>

          <div className="border-t border-white/10 pt-2">
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
              <span>Next rolls {queue.length === 0 && '— random'}</span>
              {queue.length > 0 && (
                <button type="button" onClick={clearDevDice} className="hover:text-white">clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {queue.map(([a, b], i) => (
                <span key={`${i}-${a}-${b}`} className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-sm">
                  {i === 0 && <span className="text-[9px]" style={{ color: MAGENTA }}>NEXT</span>}
                  {face(a)}{face(b)}<span className="text-[10px] text-white/50">{a + b}</span>
                  <button type="button" onClick={() => removeDevDice(i)} className="text-white/40 hover:text-white text-xs" aria-label="Remove">✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full px-3 py-1.5 text-xs font-bold tracking-widest shadow-lg border"
          style={{ borderColor: MAGENTA, color: 'white', backgroundColor: 'rgba(208,32,138,0.85)' }}
        >
          🎲 DEV{queue.length > 0 ? ` · ${queue.length}` : ''}
        </button>
      )}
    </div>
  );

  return createPortal(panel, document.body);
};

export default DevDiceControl;
