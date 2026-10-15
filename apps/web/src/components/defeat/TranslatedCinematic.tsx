// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: TRANSLATED (FB-039, The Emissary)
// apps/web/src/components/defeat/TranslatedCinematic.tsx
//
// The Emissary ended your run, and it takes the table with it. The room goes
// green-dark; one by one YOUR crew portraits (measured from the rail) and the
// bankroll dissolve into alien glyphs, and the felt flickers with them. A
// column of green light opens from above — a tractor beam — and every glyph
// is drawn into it and up, out of sight. The beam snaps shut, the screen is
// left as a sea of untranslatable symbols, and it has the last word.
// Built at the scale of MESSAGE RECEIVED: big wins, big losses.
//
// Timeline (ms): 0 dim → 400 pieces dissolve (staggered 260) → 2300 the beam
// opens (hum, 3.1 s) → 2500 glyphs rise into it (staggered) → 5400 the beam
// snaps shut, the glyph sea → 5900 line → 7900 fade → 8300 onFinish (under the
// store's 9 s safety net).
// =============================================================================

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { measureRailCrew, setRailHidden } from '../cinematics/railCrew.js';
import { playGlyphDissolve, playTractorBeam, playTranslationComplete } from '../../hooks/useCrowdAudio.js';
import type { DefeatCinematicProps } from './registry.js';

const DISSOLVE_AT   = 400;
const DISSOLVE_STEP = 260;
const BEAM_AT       = 2300;
const RISE_AT       = 2500;
const RISE_SPREAD   = 1300;   // glyph rise delays spread over this
const RISE_S        = 1.5;
const SEA_AT        = 5400;
const LINE_AT       = 5900;
const FADE_AT       = 7900;
const FINISH_AT     = 8300;

const GREEN   = '#39ff14';
const MAGENTA = '#e879f9';
const ALIEN   = '⏃⏚☊⎅⟒⎎☌⊑⟟⟊☍⌰⋔⋏⍜⌿⍾⍀⌇⏁⎍⎐⍙⌖⊬⋉';
const pick = (r: number): string => ALIEN[Math.floor(r * ALIEN.length)] ?? '⟒';

/** A piece of the table that gets translated: a crew portrait or the bankroll. */
interface Piece { key: string; x: number; y: number; w: number; h: number; label: string; slot: number | null }
interface Glyph { piece: number; ch: string; x: number; y: number; bx: number; by: number; delay: number; size: number; color: string }

function measurePieces(): Piece[] {
  const crew: Piece[] = measureRailCrew().map((m) => ({
    key: `c${m.slot}`, x: m.x, y: m.y, w: m.size, h: m.size, label: m.emoji, slot: m.slot,
  }));
  const bank = document.querySelector('[data-bankroll-readout]');
  const r = bank?.getBoundingClientRect();
  const bankroll: Piece[] = r && r.width > 0
    ? [{ key: 'bank', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: bank?.textContent ?? '$', slot: null }]
    : [];
  return [...bankroll, ...crew];
}

function hideBankroll(hidden: boolean): void {
  const el = document.querySelector<HTMLElement>('[data-bankroll-readout]');
  if (el) el.style.visibility = hidden ? 'hidden' : '';
}

export const TranslatedCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [pieces, setPieces]       = useState<Piece[] | null>(null);
  const [dissolved, setDissolved] = useState(0);    // pieces translated so far
  const [motes, setMotes]         = useState(false); // the felt flickers into glyphs
  const [beam, setBeam]           = useState(false);
  const [rising, setRising]       = useState(false);
  const [sea, setSea]             = useState(false);
  const [showLine, setShowLine]   = useState(false);
  const [fading, setFading]       = useState(false);

  useLayoutEffect(() => { setPieces(measurePieces()); }, []);

  const beamX = typeof window === 'undefined' ? 0 : window.innerWidth / 2;

  // Every piece becomes a little cluster of glyphs; the felt adds loose motes.
  const glyphs = useMemo<Glyph[]>(() => {
    if (!pieces) return [];
    const out: Glyph[] = [];
    let seed = 1;
    const r = () => { const x = Math.sin(seed++ * 9301 + 49297) * 233280; return x - Math.floor(x); };
    pieces.forEach((p, pi) => {
      const n = p.slot === null ? 10 : 8;
      for (let k = 0; k < n; k++) {
        const x = p.x + (r() - 0.5) * p.w;
        const y = p.y + (r() - 0.5) * p.h;
        out.push({ piece: pi, ch: pick(r()), x, y, bx: (r() - 0.5) * 40, by: (r() - 0.5) * 40 - 10,
                   delay: r() * RISE_SPREAD, size: 16 + r() * 10, color: r() < 0.25 ? MAGENTA : GREEN });
      }
    });
    const W = window.innerWidth, H = window.innerHeight;
    for (let k = 0; k < 28; k++) {
      out.push({ piece: -1, ch: pick(r()), x: W * (0.06 + r() * 0.88), y: H * (0.28 + r() * 0.5), bx: 0, by: -8,
                 delay: r() * RISE_SPREAD, size: 13 + r() * 9, color: r() < 0.3 ? MAGENTA : GREEN });
    }
    return out;
  }, [pieces]);

  const seaText = useMemo(() => {
    let seed = 7;
    const r = () => { const x = Math.sin(seed++ * 7919 + 104729) * 233280; return x - Math.floor(x); };
    return Array.from({ length: 34 }, () => Array.from({ length: 40 }, () => pick(r())).join(' ')).join('\n');
  }, []);

  useEffect(() => {
    if (!pieces) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    pieces.forEach((p, i) => {
      at(DISSOLVE_AT + i * DISSOLVE_STEP, () => {
        setDissolved(i + 1);
        playGlyphDissolve();
        if (p.slot === null) hideBankroll(true);
        else setRailHidden(p.slot, true);
      });
    });
    at(DISSOLVE_AT + 200, () => setMotes(true));
    at(BEAM_AT, () => { setBeam(true); playTractorBeam((SEA_AT - BEAM_AT) / 1000); });
    at(RISE_AT, () => setRising(true));
    at(SEA_AT,  () => { setBeam(false); setSea(true); playTranslationComplete(); });
    at(LINE_AT, () => setShowLine(true));
    at(FADE_AT, () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      hideBankroll(false);
      pieces.forEach((p) => { if (p.slot !== null) setRailHidden(p.slot, false); });
    };
  }, [pieces]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* green-dark dim */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(10,60,20,0.55), rgba(2,6,4,0.85))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: sea ? 1 : 0.85 }}
        transition={{ duration: 0.6 }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(57,255,20,0.05) 0 1px, transparent 1px 3px)' }} />

      {/* the pieces, before they dissolve */}
      {pieces?.map((p, i) => i >= dissolved && (
        <div key={p.key} className="absolute flex items-center justify-center"
          style={{ left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h }}>
          <span className="select-none leading-none" style={{ fontSize: p.slot === null ? 16 : p.w * 0.6, color: '#e5f9e0' }}>{p.label}</span>
        </div>
      ))}

      {/* a flash where each piece dissolves */}
      {pieces?.map((p, i) => i < dissolved && (
        <motion.span key={`f-${p.key}`} className="pointer-events-none absolute block rounded-full"
          style={{ left: p.x - 50, top: p.y - 50, width: 100, height: 100, background: `radial-gradient(circle, ${GREEN}aa, transparent 65%)` }}
          initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.6 }} />
      ))}

      {/* the tractor beam */}
      <motion.div
        className="pointer-events-none absolute inset-y-0"
        style={{
          left: '50%', width: 'min(40vw, 260px)', x: '-50%', transformOrigin: 'top center',
          background: `linear-gradient(90deg, transparent, ${GREEN}33 20%, ${GREEN}77 50%, ${GREEN}33 80%, transparent)`,
          boxShadow: `0 0 60px 20px ${GREEN}22`,
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={beam ? { scaleX: [0, 1.15, 1], opacity: [0, 1, 0.9] } : sea ? { scaleX: [1, 0.02], opacity: [1, 0] } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: beam ? 0.6 : 0.25, ease: 'easeOut' }}
      >
        {beam && !reduceMotion && (
          <div className="absolute inset-0 animate-signal-static" style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${GREEN}22 0 2px, transparent 2px 14px)`,
          }} />
        )}
      </motion.div>
      {sea && (
        <motion.span className="pointer-events-none absolute left-1/2 top-0 block h-full -translate-x-1/2"
          style={{ width: 6, background: '#eaffea', boxShadow: `0 0 40px 16px ${GREEN}` }}
          initial={{ opacity: 1, scaleY: 1 }} animate={{ opacity: 0, scaleY: 0 }} transition={{ duration: 0.45 }} />
      )}

      {/* the glyphs — burst out of each piece, then drawn up the beam */}
      {glyphs.map((g, i) => {
        const shown = g.piece === -1 ? motes : g.piece < dissolved;
        if (!shown || sea) return null;
        const dx = beamX - g.x + (((i * 37) % 60) - 30);
        const dy = -g.y - 80;
        return (
          <motion.span
            key={i}
            className="pointer-events-none absolute select-none font-mono leading-none"
            style={{ left: g.x, top: g.y, fontSize: g.size, color: g.color, textShadow: `0 0 8px ${g.color}` }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={rising
              ? (reduceMotion ? { opacity: 0 } : { x: [g.bx, dx, dx], y: [g.by, g.by - 30, dy], opacity: [1, 1, 0], scale: [1, 0.9, 0.5] })
              : { x: g.bx, y: g.by, opacity: g.piece === -1 ? 0.7 : 1, scale: 1 }}
            transition={rising
              ? { duration: RISE_S, delay: g.delay / 1000, times: [0, 0.4, 1], ease: 'easeIn' }
              : { duration: 0.45, ease: 'easeOut', delay: g.piece === -1 ? (i % 12) * 0.08 : 0 }}
          >
            {g.ch}
          </motion.span>
        );
      })}

      {/* the sea of untranslatable symbols, and its line */}
      {sea && (
        <motion.pre
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre text-center font-mono text-[15px] leading-[1.6]"
          style={{ color: `${GREEN}38` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          {seaText}
        </motion.pre>
      )}
      {showLine && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <motion.div
            className="max-w-md rounded-md px-4 py-3 text-center"
            style={{ background: 'rgba(2,8,4,0.85)', border: `1px solid ${GREEN}55`, boxShadow: `0 0 30px ${GREEN}22` }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className="mb-2 font-pixel text-r-8 tracking-[0.3em]" style={{ color: MAGENTA, textShadow: `0 0 8px ${MAGENTA}` }}>
              ▣ TRANSLATED
            </div>
            <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(17px, 4.6vw, 22px)', color: '#e5f9e0', textShadow: `0 0 8px ${GREEN}66` }}>
              {line}
            </div>
            <div className="mt-2 font-pixel text-r-8 tracking-widest" style={{ color: `${GREEN}aa` }}>— THE EMISSARY</div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
