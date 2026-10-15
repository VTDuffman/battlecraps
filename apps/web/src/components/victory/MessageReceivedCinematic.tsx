// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: MESSAGE RECEIVED (FB-039, The Emissary)
// apps/web/src/components/victory/MessageReceivedCinematic.tsx
//
// You beat The Emissary, and it finally sends something you can read. The
// screen goes dark under faint falling alien glyphs; INCOMING TRANSMISSION
// flickers in; its message arrives as a line of cycling glyphs that decode,
// one character at a time, into its line — then MESSAGE RECEIVED locks in.
// First contact, in your favour. Built at the scale of THE ROSE.
//
// Timeline (ms): 0 dark → 300 INCOMING TRANSMISSION (chirps) → 900 the glyph
// line appears → 1500 decode, left to right, over ~3 s → 4600 MESSAGE RECEIVED
// (chord) → 8000 fade → 8400 onFinish. Runs inside the celebration hold.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playDecodeTick, playIncomingTransmission, playMessageReceived } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const INCOMING_AT = 300;
const GLYPHS_AT   = 900;
const DECODE_AT   = 1500;
const DECODE_MS   = 3000;
const RECEIVED_AT = DECODE_AT + DECODE_MS + 100;   // 4600
const FADE_AT     = 8000;
const FINISH_AT   = 8400;

const GREEN   = '#39ff14';
const MAGENTA = '#e879f9';
const ALIEN   = '⏃⏚☊⎅⟒⎎☌⊑⟟⟊☍⌰⋔⋏⍜⌿⍾⍀⌇⏁⎍⎐⍙⌖⊬⋉';
const glyph   = (): string => ALIEN[Math.floor(Math.random() * ALIEN.length)] ?? '⟒';

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const MessageReceivedCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [incoming, setIncoming] = useState(false);
  const [glyphsOn, setGlyphsOn] = useState(false);
  const [decoded,  setDecoded]  = useState(0);            // characters decoded so far
  const [scramble, setScramble] = useState<string[]>(() => Array.from(line, () => glyph()));
  const [received, setReceived] = useState(false);
  const [fading,   setFading]   = useState(false);

  const rain = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left: (i / 16) * 100 + rand(i) * 4, dur: 4 + rand(i + 20) * 4, delay: rand(i + 40) * 3,
    text: Array.from({ length: 14 }, (_, k) => ALIEN[Math.floor(rand(i * 31 + k) * ALIEN.length)] ?? '⟒').join('\n'),
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(INCOMING_AT, () => { setIncoming(true); playIncomingTransmission(); });
    at(GLYPHS_AT,   () => setGlyphsOn(true));
    // decode one character at a time (ticks every few characters)
    const n = line.length;
    for (let i = 1; i <= n; i++) {
      at(DECODE_AT + Math.round((i / n) * DECODE_MS), () => {
        setDecoded(i);
        if (i % 3 === 0) playDecodeTick();
      });
    }
    at(RECEIVED_AT, () => { setReceived(true); playMessageReceived(); });
    at(FADE_AT,     () => setFading(true));
    at(FINISH_AT,   onFinish);
    // the undecoded glyphs keep cycling
    const cycle = window.setInterval(() => setScramble((prev) => prev.map(() => glyph())), 70);
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.clearInterval(cycle); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chars = Array.from(line);

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1, background: 'radial-gradient(ellipse at 50% 45%, #12062a 0%, #06020f 70%, #000 100%)' }}>
      {/* faint falling glyph columns */}
      {!reduceMotion && rain.map((c, i) => (
        <motion.pre
          key={i}
          className="pointer-events-none absolute top-0 m-0 font-mono text-[13px] leading-[1.15]"
          style={{ left: `${c.left}%`, color: i % 3 === 0 ? `${MAGENTA}55` : `${GREEN}40` }}
          initial={{ y: '-60vh' }}
          animate={{ y: '110vh' }}
          transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: 'linear' }}
        >
          {c.text}
        </motion.pre>
      ))}

      {/* scanlines */}
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(57,255,20,0.04) 0 1px, transparent 1px 3px)' }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        {incoming && (
          <motion.div
            className="mb-5 font-pixel text-r-10 tracking-[0.35em]"
            style={{ color: received ? GREEN : MAGENTA, textShadow: `0 0 10px ${received ? GREEN : MAGENTA}` }}
            initial={{ opacity: 0 }}
            animate={received ? { opacity: 1, scale: [1.25, 1] } : { opacity: reduceMotion ? 1 : [0, 1, 0.3, 1, 0.5, 1] }}
            transition={received ? { duration: 0.35 } : { duration: 1.2 }}
          >
            {received ? '▣ MESSAGE RECEIVED' : '◌ INCOMING TRANSMISSION'}
          </motion.div>
        )}

        {glyphsOn && (
          <motion.div
            className="max-w-xl text-center"
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(17px, 4.6vw, 23px)', lineHeight: 1.5, letterSpacing: '0.04em' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {chars.map((ch, i) => {
              const done = reduceMotion || i < decoded;
              return (
                <span key={i} style={{
                  color: done ? '#e5f9e0' : `${GREEN}cc`,
                  textShadow: done ? `0 0 8px ${GREEN}66` : `0 0 6px ${GREEN}`,
                }}>
                  {ch === ' ' ? ' ' : done ? ch : (scramble[i] ?? glyph())}
                </span>
              );
            })}
            {received && (
              <motion.div className="mt-3 font-pixel text-r-8 tracking-widest" style={{ color: `${MAGENTA}cc` }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
                — THE EMISSARY
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
