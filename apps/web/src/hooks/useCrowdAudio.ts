// =============================================================================
// BATTLECRAPS — CROWD AUDIO HOOK
// apps/web/src/hooks/useCrowdAudio.ts
//
// Fully synthesised Web Audio API crowd sounds — no audio asset files needed.
//
// Architecture:
//   • playCheer() — short crowd cheer on win flash (noise burst + rising oscillators)
//   • playGroan() — collective groan on lose flash (low rumble + falling oscillators)
//
// Init policy:
//   AudioContext is lazy-created on the first flash event (win or lose).
//   The screen-flash fires after the dice settle, so the Roll button click
//   has already satisfied the browser autoplay policy by then.
//
// Mute toggle:
//   Persisted to localStorage ('bc_muted'). The mute icon is rendered by the
//   caller (TableBoard); this hook just returns { muted, toggleMute }.
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Noise buffer factory
// ---------------------------------------------------------------------------

function makeNoiseBuf(ctx: AudioContext, seconds: number): AudioBuffer {
  const n   = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ---------------------------------------------------------------------------
// Event stings
// ---------------------------------------------------------------------------

/** Short crowd cheer — rising noise burst + upward oscillator sweep */
function playCheer(ctx: AudioContext): void {
  const t0  = ctx.currentTime;
  const dur = 1.3;

  // High-passed noise burst (airy crowd energy)
  const nSrc = ctx.createBufferSource();
  nSrc.buffer = makeNoiseBuf(ctx, dur);
  const hp          = ctx.createBiquadFilter();
  hp.type           = 'highpass';
  hp.frequency.value = 700;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0, t0);
  nEnv.gain.linearRampToValueAtTime(0.13, t0 + 0.06);
  nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  nSrc.connect(hp);
  hp.connect(nEnv);
  nEnv.connect(ctx.destination);
  nSrc.start(t0);
  nSrc.stop(t0 + dur);

  // Rising sawtooth oscillators (crowd voices sweeping up)
  [160, 240, 330, 440, 560].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f + Math.random() * 30, t0 + i * 0.025);
    osc.frequency.linearRampToValueAtTime(f * 1.45, t0 + dur * 0.65);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0 + i * 0.025);
    env.gain.linearRampToValueAtTime(0.020, t0 + i * 0.025 + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t0 + i * 0.025);
    osc.stop(t0 + dur);
  });
}

/** Collective groan — low rumble + descending oscillator sweep */
function playGroan(ctx: AudioContext): void {
  const t0  = ctx.currentTime;
  const dur = 1.7;

  // Low-passed noise (muffled rumble)
  const nSrc = ctx.createBufferSource();
  nSrc.buffer = makeNoiseBuf(ctx, dur);
  const lp          = ctx.createBiquadFilter();
  lp.type           = 'lowpass';
  lp.frequency.value = 500;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0.10, t0);
  nEnv.gain.linearRampToValueAtTime(0.16, t0 + 0.12);
  nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  nSrc.connect(lp);
  lp.connect(nEnv);
  nEnv.connect(ctx.destination);
  nSrc.start(t0);
  nSrc.stop(t0 + dur);

  // Falling sine oscillators
  [360, 260, 200].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0 + i * 0.04);
    osc.frequency.exponentialRampToValueAtTime(f * 0.52, t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.026, t0 + i * 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t0 + i * 0.04);
    osc.stop(t0 + dur);
  });
}

// ---------------------------------------------------------------------------
// Dice audio — WAV buffer loader
// ---------------------------------------------------------------------------

let diceBuffers: AudioBuffer[] = [];

async function loadDiceAudio(ctx: AudioContext): Promise<void> {
  if (diceBuffers.length > 0) return;
  const [res1, res2] = await Promise.all([
    fetch('/audio/dice-roll-1.wav'),
    fetch('/audio/dice-roll-2.wav'),
  ]);
  const [ab1, ab2] = await Promise.all([res1.arrayBuffer(), res2.arrayBuffer()]);
  const [buf1, buf2] = await Promise.all([
    ctx.decodeAudioData(ab1),
    ctx.decodeAudioData(ab2),
  ]);
  diceBuffers.push(buf1, buf2);
}

async function playDiceRattle(ctx: AudioContext): Promise<void> {
  await loadDiceAudio(ctx);
  const selectedBuffer = diceBuffers[Math.floor(Math.random() * diceBuffers.length)];
  if (!selectedBuffer) return;
  const source = ctx.createBufferSource();
  source.buffer = selectedBuffer;
  source.connect(ctx.destination);
  // 0.72 s syncs with the `dice-throw` CSS animation duration
  source.start(ctx.currentTime + 0.72);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bc_muted';

export function useCrowdAudio(): { muted: boolean; toggleMute: () => void } {
  const ctxRef = useRef<AudioContext | null>(null);

  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const flashType = useGameStore((s) => s.flashType);
  const _flashKey = useGameStore((s) => s._flashKey);
  const _rollKey  = useGameStore((s) => s._rollKey);

  // flashType ref: keeps the _flashKey effect from capturing a stale value
  const flashTypeRef = useRef(flashType);
  flashTypeRef.current = flashType;

  // ── Lazy AudioContext init on first flash event ─────────────────────────
  // No murmur — AudioContext is created only when needed for a sting.
  function getCtx(): AudioContext | null {
    if (mutedRef.current) return null;
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  // ── Event stings: cheer on win flash, groan on lose flash ───────────────
  useEffect(() => {
    if (_flashKey === 0) return; // initial mount, no flash yet
    const ctx = getCtx();
    if (!ctx) return;
    const ft = flashTypeRef.current;
    if (ft === 'win')  playCheer(ctx);
    if (ft === 'lose') playGroan(ctx);
  }, [_flashKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dice rattle on throw ────────────────────────────────────────────────
  useEffect(() => {
    if (_rollKey === 0) return;
    const ctx = getCtx();
    if (!ctx) return;
    void playDiceRattle(ctx);
  }, [_rollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mute toggle ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => { ctxRef.current?.close(); };
  }, []);

  return { muted, toggleMute };
}
