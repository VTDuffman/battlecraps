// =============================================================================
// BATTLECRAPS — CROWD AUDIO HOOK
// apps/web/src/hooks/useCrowdAudio.ts
//
// Fully synthesised Web Audio API crowd sounds — no audio asset files needed.
//
// Architecture:
//   • playCheer() — short crowd cheer on win flash (noise burst + rising oscillators)
//   • playGroan() — collective groan on lose flash (low rumble + falling oscillators)
//   • playDiceRattle() — WAV sample on dice throw
//
// All sound output routes through a module-level master GainNode so the volume
// slider can adjust all stings in real-time without touching individual nodes.
//
// Volume / mute state:
//   • bc_sfx_volume localStorage key (float 0–1, default 0.8) — persists slider position.
//     The stored value is always the LAST NON-ZERO preference; muting via the button
//     does NOT overwrite it, so unmuting restores the previous level.
//   • Backward compat: if the legacy 'bc_muted' key is present it is consumed on first
//     init (muted → sfxVolume = 0; unmuted → fall through to bc_sfx_volume default)
//     and then removed. The old key is never written again.
//
// Exports: { muted, toggleMute, sfxVolume, setSfxVolume }
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { GAUNTLET } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SFX_VOLUME_KEY     = 'bc_sfx_volume';
const LEGACY_MUTE_KEY    = 'bc_muted';
const DEFAULT_SFX_VOLUME = 0.8;

// ---------------------------------------------------------------------------
// Module-level state — survives TableBoard mount/unmount cycles
// ---------------------------------------------------------------------------

let globalAudioCtx: AudioContext | null = null;
let masterGain:     GainNode     | null = null;
let diceBuffers:    AudioBuffer[]       = [];

/**
 * The current effective SFX volume (0 = muted). Initialised lazily on first
 * hook call. Kept in sync with both the React state and the GainNode.
 */
let _sfxVolume: number | null = null;

// ---------------------------------------------------------------------------
// Volume initialisation — reads localStorage once, handles legacy key
// ---------------------------------------------------------------------------

function _initSfxVolume(): number {
  if (_sfxVolume !== null) return _sfxVolume;

  // Backward compat: consume and remove the old 'bc_muted' key.
  const legacy = localStorage.getItem(LEGACY_MUTE_KEY);
  if (legacy !== null) {
    localStorage.removeItem(LEGACY_MUTE_KEY);
    if (legacy === '1' || legacy === 'true') {
      // Was muted — start at 0; bc_sfx_volume (if present) holds the restore target.
      _sfxVolume = 0;
      return 0;
    }
    // Was explicitly unmuted via old toggle — fall through to read bc_sfx_volume.
  }

  const stored = parseFloat(localStorage.getItem(SFX_VOLUME_KEY) ?? '');
  _sfxVolume = isNaN(stored) ? DEFAULT_SFX_VOLUME : Math.max(0, Math.min(1, stored));
  return _sfxVolume;
}

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
// Event stings — all output nodes connect to `dest` (the master GainNode)
// ---------------------------------------------------------------------------

/** Short crowd cheer — rising noise burst + upward oscillator sweep */
function playCheer(ctx: AudioContext, dest: AudioNode): void {
  const t0  = ctx.currentTime;
  const dur = 1.3;

  // High-passed noise burst (airy crowd energy)
  const nSrc = ctx.createBufferSource();
  nSrc.buffer = makeNoiseBuf(ctx, dur);
  const hp           = ctx.createBiquadFilter();
  hp.type            = 'highpass';
  hp.frequency.value = 700;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0, t0);
  nEnv.gain.linearRampToValueAtTime(0.13, t0 + 0.06);
  nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  nSrc.connect(hp);
  hp.connect(nEnv);
  nEnv.connect(dest);
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
    env.connect(dest);
    osc.start(t0 + i * 0.025);
    osc.stop(t0 + dur);
  });
}

/** Collective groan — low rumble + descending oscillator sweep */
function playGroan(ctx: AudioContext, dest: AudioNode): void {
  const t0  = ctx.currentTime;
  const dur = 1.7;

  // Low-passed noise (muffled rumble)
  const nSrc = ctx.createBufferSource();
  nSrc.buffer = makeNoiseBuf(ctx, dur);
  const lp           = ctx.createBiquadFilter();
  lp.type            = 'lowpass';
  lp.frequency.value = 500;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0.10, t0);
  nEnv.gain.linearRampToValueAtTime(0.16, t0 + 0.12);
  nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  nSrc.connect(lp);
  lp.connect(nEnv);
  nEnv.connect(dest);
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
    env.connect(dest);
    osc.start(t0 + i * 0.04);
    osc.stop(t0 + dur);
  });
}

// ---------------------------------------------------------------------------
// Dice audio — WAV buffer loader
// ---------------------------------------------------------------------------

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

async function playDiceRattle(ctx: AudioContext, dest: AudioNode): Promise<void> {
  await loadDiceAudio(ctx);
  const selectedBuffer = diceBuffers[Math.floor(Math.random() * diceBuffers.length)];
  if (!selectedBuffer) return;
  const source = ctx.createBufferSource();
  source.buffer = selectedBuffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.75;
  source.connect(gain);
  gain.connect(dest);
  // 0.72 s syncs with the `dice-throw` CSS animation duration
  source.start(ctx.currentTime + 0.72);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCrowdAudio(): {
  muted:        boolean;
  toggleMute:   () => void;
  sfxVolume:    number;
  setSfxVolume: (v: number) => void;
} {
  const [sfxVolume, setSfxVolumeState] = useState<number>(() => _initSfxVolume());

  // Derived — no separate boolean state needed; avoids the muted/volume getting
  // out of sync between renders.
  const muted = sfxVolume === 0;

  const flashType          = useGameStore((s) => s.flashType);
  const _flashKey          = useGameStore((s) => s._flashKey);
  const _rollKey           = useGameStore((s) => s._rollKey);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const isNullSpaceRef = useRef(false);
  isNullSpaceRef.current = GAUNTLET[currentMarkerIndex]?.floor === 9;

  // flashType ref: keeps the _flashKey effect from capturing a stale value
  const flashTypeRef = useRef(flashType);
  flashTypeRef.current = flashType;

  // Capture entry-state keys to suppress ghost sounds on remount
  const initialRollKey  = useRef(_rollKey);
  const initialFlashKey = useRef(_flashKey);

  // ── Singleton AudioContext + master gain ────────────────────────────────
  // Returns null if muted (volume 0) — no context needed, no sounds play.
  function getCtx(): AudioContext | null {
    const vol = _sfxVolume;
    if (vol === null || vol === 0) return null;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioContext();
      masterGain = globalAudioCtx.createGain();
      masterGain.gain.value = vol;
      masterGain.connect(globalAudioCtx.destination);
    }
    const ctx = globalAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  // Convenience — routes to masterGain when available, falls back to destination.
  function getDest(ctx: AudioContext): AudioNode {
    return masterGain ?? ctx.destination;
  }

  // ── Volume control ───────────────────────────────────────────────────────
  const setSfxVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    _sfxVolume = clamped;
    if (masterGain) masterGain.gain.value = clamped;
    // Only persist non-zero values — 0 is the muted state, not a preference.
    if (clamped > 0) localStorage.setItem(SFX_VOLUME_KEY, String(clamped));
    setSfxVolumeState(clamped);
  }, []);

  // ── Mute toggle ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (_sfxVolume === 0) {
      // Unmuting — restore to the saved non-zero preference.
      const restore =
        parseFloat(localStorage.getItem(SFX_VOLUME_KEY) ?? '') || DEFAULT_SFX_VOLUME;
      _sfxVolume = restore;
      if (masterGain) masterGain.gain.value = restore;
      setSfxVolumeState(restore);
    } else {
      // Muting — save the current preference first so we can restore it.
      localStorage.setItem(SFX_VOLUME_KEY, String(_sfxVolume));
      _sfxVolume = 0;
      if (masterGain) masterGain.gain.value = 0;
      setSfxVolumeState(0);
    }
  }, []);

  // ── Event stings: cheer on win flash, groan on lose flash ───────────────
  useEffect(() => {
    if (_flashKey === 0 || _flashKey === initialFlashKey.current) return;
    if (isNullSpaceRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const ft = flashTypeRef.current;
    if (ft === 'win')  playCheer(ctx, getDest(ctx));
    if (ft === 'lose') playGroan(ctx, getDest(ctx));
  }, [_flashKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dice rattle on throw ────────────────────────────────────────────────
  useEffect(() => {
    if (_rollKey === 0 || _rollKey === initialRollKey.current) return;
    if (isNullSpaceRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    void playDiceRattle(ctx, getDest(ctx));
  }, [_rollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { muted, toggleMute, sfxVolume, setSfxVolume };
}
