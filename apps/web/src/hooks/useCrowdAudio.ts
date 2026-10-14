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

/**
 * FB-034: the charmed crew is in a daze — a soft, detuned Fmaj9 pad that swims
 * (slow vibrato) and droops a little flat, under three slow descending chime
 * twinkles. ≈1.4 s, timed over the portrait's heartbeat.
 */
function playCharmDazeSting(ctx: AudioContext, dest: AudioNode): void {
  const t0  = ctx.currentTime + 0.01;
  const end = t0 + 1.5;

  // Pad: each note is a detuned sine pair (chorus) with a shared woozy LFO.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 4.5;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 9;                     // cents
  lfo.connect(lfoDepth);
  lfo.start(t0);
  lfo.stop(end);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const pad = ctx.createGain();
  pad.gain.setValueAtTime(0.0001, t0);
  pad.gain.exponentialRampToValueAtTime(0.05, t0 + 0.22);   // swell in
  pad.gain.setValueAtTime(0.05, t0 + 0.6);
  pad.gain.exponentialRampToValueAtTime(0.0001, end);       // drift away
  lp.connect(pad);
  pad.connect(dest);

  // F4 A4 C5 E5 G5 — Fmaj9.
  [349.23, 440, 523.25, 659.25, 783.99].forEach((freq) => {
    [-7, 7].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.setValueAtTime(cents, t0);
      osc.detune.linearRampToValueAtTime(cents - 35, end);   // the daze: sags flat
      lfoDepth.connect(osc.detune);
      osc.connect(lp);
      osc.start(t0);
      osc.stop(end + 0.05);
    });
  });

  // Chimes: slow, descending, softening — a sigh.
  [[0.12, 2093, 0.035], [0.42, 1567.98, 0.028], [0.74, 1318.51, 0.02]].forEach(([at, freq, peak]) => {
    pluckHarpString(ctx, dest, freq as number, t0 + (at as number), peak as number);
  });
}

/** Boss sigil impact — sub-bass drop (110 → 38 Hz) layered with a low noise thump (≈900ms) */
function playBossImpactSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;

  // Sub boom: sine pitch-drops like a kick drum, long decay for weight.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(110, t0);
  sub.frequency.exponentialRampToValueAtTime(38, t0 + 0.35);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.0001, t0);
  subEnv.gain.exponentialRampToValueAtTime(0.55, t0 + 0.012);
  subEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
  sub.connect(subEnv);
  subEnv.connect(dest);
  sub.start(t0);
  sub.stop(t0 + 0.92);

  // Thump: lowpassed noise burst for the "slam" transient.
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuf(ctx, 0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t0);
  lp.frequency.exponentialRampToValueAtTime(120, t0 + 0.2);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.35, t0);
  noiseEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  noise.connect(lp);
  lp.connect(noiseEnv);
  noiseEnv.connect(dest);
  noise.start(t0);
  noise.stop(t0 + 0.25);
}

/** Cash-register ka-ching: drawer click + two bright bell partials (≈350ms) */
function playKaChingSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;

  // "Ka" — short highpassed noise click (the mechanism).
  const click = ctx.createBufferSource();
  click.buffer = makeNoiseBuf(ctx, 0.04);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0.25, t0);
  clickEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
  click.connect(hp);
  hp.connect(clickEnv);
  clickEnv.connect(dest);
  click.start(t0);
  click.stop(t0 + 0.05);

  // "Ching" — two inharmonic partials a beat later, like a small bell.
  const tc = t0 + 0.06;
  [2093, 3322].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, tc);
    env.gain.exponentialRampToValueAtTime(i === 0 ? 0.16 : 0.08, tc + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, tc + 0.3);
    osc.connect(env);
    env.connect(dest);
    osc.start(tc);
    osc.stop(tc + 0.32);
  });
}

/** Register bell DING for the Payoff — bright fundamental + harmonics, long ring (≈1.4s) */
function playRegisterBellSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  [[1568, 0.22], [3136, 0.09], [4705, 0.05]].forEach(([freq, peak]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq ?? 1568;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak ?? 0.1, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + 1.42);
  });
}

/** Dead register thunk — the anti-bell for BALANCE DUE (low, muffled, short) */
function playDeadThunkSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.3, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  osc.connect(lp);
  lp.connect(env);
  env.connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.22);
}

/** Roll-up door rattle — bandpassed noise with a fast amplitude chatter (≈650ms) */
function playDoorRattleSting(ctx: AudioContext, dest: AudioNode): void {
  const t0  = ctx.currentTime;
  const dur = 0.65;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuf(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900, t0);
  bp.frequency.linearRampToValueAtTime(600, t0 + dur);
  bp.Q.value = 1.2;
  // Chatter: a square LFO modulating the gain gives the slat-by-slat clatter.
  const chatter = ctx.createGain();
  chatter.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(18, t0);
  lfo.frequency.linearRampToValueAtTime(30, t0 + dur); // speeds up as it falls
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.45;
  lfo.connect(lfoDepth);
  lfoDepth.connect(chatter.gain);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.28, t0 + 0.05);
  env.gain.setValueAtTime(0.28, t0 + dur - 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  noise.connect(bp);
  bp.connect(chatter);
  chatter.connect(env);
  env.connect(dest);
  noise.start(t0);
  noise.stop(t0 + dur);
  lfo.start(t0);
  lfo.stop(t0 + dur);
}

/** Steel door hitting the ground — low thud + inharmonic metallic ring (≈1.2s) */
function playDoorClangSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;

  // Thud body.
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(90, t0);
  thud.frequency.exponentialRampToValueAtTime(42, t0 + 0.25);
  const thudEnv = ctx.createGain();
  thudEnv.gain.setValueAtTime(0.0001, t0);
  thudEnv.gain.exponentialRampToValueAtTime(0.5, t0 + 0.006);
  thudEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
  thud.connect(thudEnv);
  thudEnv.connect(dest);
  thud.start(t0);
  thud.stop(t0 + 0.47);

  // Metallic ring: inharmonic partials, the "clang".
  [[220, 0.14], [587, 0.10], [1241, 0.07], [2093, 0.04]].forEach(([freq, peak]) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq ?? 220;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak ?? 0.05, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + 1.22);
  });

  // Impact grit.
  const grit = ctx.createBufferSource();
  grit.buffer = makeNoiseBuf(ctx, 0.12);
  const gritEnv = ctx.createGain();
  gritEnv.gain.setValueAtTime(0.25, t0);
  gritEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
  grit.connect(gritEnv);
  gritEnv.connect(dest);
  grit.start(t0);
  grit.stop(t0 + 0.12);
}

/**
 * Clock tick — a mechanical click + short blip, sharper (higher, louder) as
 * Sarge's clock runs down. rollsLeft 6 → mellow, 1 → urgent.
 */
function makeClockTickSting(rollsLeft: number) {
  const urgency = Math.max(0, Math.min(5, 6 - rollsLeft)); // 0..5
  return (ctx: AudioContext, dest: AudioNode): void => {
    const t0 = ctx.currentTime;
    const click = ctx.createBufferSource();
    click.buffer = makeNoiseBuf(ctx, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const clickEnv = ctx.createGain();
    clickEnv.gain.setValueAtTime(0.18 + urgency * 0.03, t0);
    clickEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02);
    click.connect(hp);
    hp.connect(clickEnv);
    clickEnv.connect(dest);
    click.start(t0);
    click.stop(t0 + 0.025);

    const blip = ctx.createOscillator();
    blip.type = 'square';
    blip.frequency.value = 1300 + urgency * 220;
    const blipEnv = ctx.createGain();
    blipEnv.gain.setValueAtTime(0.0001, t0);
    blipEnv.gain.exponentialRampToValueAtTime(0.05 + urgency * 0.015, t0 + 0.004);
    blipEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
    blip.connect(blipEnv);
    blipEnv.connect(dest);
    blip.start(t0);
    blip.stop(t0 + 0.07);
  };
}

/** Last-roll alarm — three quick two-tone buzzes (≈450ms) */
function playClockAlarmSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  [880, 660, 880].forEach((freq, i) => {
    const start = t0 + i * 0.15;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.11, start + 0.01);
    env.gain.setValueAtTime(0.11, start + 0.10);
    env.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
    osc.connect(lp);
    lp.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + 0.14);
  });
}

/** Drill whistle for TIME'S UP — trilling pea whistle with a breathy edge (≈650ms) */
function playDrillWhistleSting(ctx: AudioContext, dest: AudioNode): void {
  const t0  = ctx.currentTime;
  const dur = 0.65;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2850, t0);
  // The pea's trill: fast, deep frequency wobble.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 32;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 140;
  lfo.connect(lfoDepth);
  lfoDepth.connect(osc.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
  env.gain.setValueAtTime(0.16, t0 + dur - 0.08);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(env);
  env.connect(dest);

  const breath = ctx.createBufferSource();
  breath.buffer = makeNoiseBuf(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2900;
  bp.Q.value = 2;
  const breathEnv = ctx.createGain();
  breathEnv.gain.setValueAtTime(0.0001, t0);
  breathEnv.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
  breathEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  breath.connect(bp);
  bp.connect(breathEnv);
  breathEnv.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur);
  lfo.start(t0);
  lfo.stop(t0 + dur);
  breath.start(t0);
  breath.stop(t0 + dur);
}

/**
 * Bugle call for HONORABLY DISCHARGED — brassy C-major arpeggio, short-short-
 * short-LONG (G4 C5 E5 G5), sawtooth through a lowpass with a little vibrato (≈1.7s).
 */
function playBugleCallSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  const notes: Array<[number, number, number]> = [
    // [freq, start offset, length]
    [392.00, 0.00, 0.16],
    [523.25, 0.18, 0.16],
    [659.25, 0.36, 0.16],
    [783.99, 0.54, 1.05],
  ];
  notes.forEach(([freq, offset, len]) => {
    const start = t0 + offset;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    if (len > 0.5) {
      // Vibrato on the held note.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = 5;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(start + 0.15);
      lfo.stop(start + len);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, start);
    lp.frequency.linearRampToValueAtTime(2200, start + 0.05); // brassy "blat" attack
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
    env.gain.setValueAtTime(0.11, start + len - 0.06);
    env.gain.exponentialRampToValueAtTime(0.001, start + len);
    osc.connect(lp);
    lp.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + len + 0.01);
  });
}

/** Rubber stamp hitting paper on a desk — low wooden thud + papery slap (≈250ms) */
function playStampThudSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(160, t0);
  thud.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
  const thudEnv = ctx.createGain();
  thudEnv.gain.setValueAtTime(0.0001, t0);
  thudEnv.gain.exponentialRampToValueAtTime(0.45, t0 + 0.005);
  thudEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  thud.connect(thudEnv);
  thudEnv.connect(dest);
  thud.start(t0);
  thud.stop(t0 + 0.24);

  const slap = ctx.createBufferSource();
  slap.buffer = makeNoiseBuf(ctx, 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.8;
  const slapEnv = ctx.createGain();
  slapEnv.gain.setValueAtTime(0.3, t0);
  slapEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
  slap.connect(bp);
  bp.connect(slapEnv);
  slapEnv.connect(dest);
  slap.start(t0);
  slap.stop(t0 + 0.08);
}

/**
 * Dog tags landing — two thin metal tags clinking against each other and the
 * ball chain settling: staggered inharmonic pings + a tiny rattle (≈600ms).
 */
function playDogTagsJingleSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime;
  // [offset, base freq, peak] — first hit loudest, then the clinks and settle.
  const hits: Array<[number, number, number]> = [
    [0.00, 2637, 0.10],
    [0.06, 3520, 0.07],
    [0.15, 2960, 0.05],
    [0.27, 3730, 0.035],
    [0.40, 3136, 0.02],
  ];
  hits.forEach(([offset, freq, peak]) => {
    const start = t0 + offset;
    [1, 2.76].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(i === 0 ? peak : peak * 0.4, start + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(env);
      env.connect(dest);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  });
  // Ball-chain rattle.
  const chain = ctx.createBufferSource();
  chain.buffer = makeNoiseBuf(ctx, 0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const chainEnv = ctx.createGain();
  chainEnv.gain.setValueAtTime(0.04, t0 + 0.02);
  chainEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.27);
  chain.connect(hp);
  hp.connect(chainEnv);
  chainEnv.connect(dest);
  chain.start(t0 + 0.02);
  chain.stop(t0 + 0.27);
}

/** One harp string pluck: triangle body + soft octave shimmer, long decay. */
function pluckHarpString(ctx: AudioContext, dest: AudioNode, freq: number, start: number, peak: number): void {
  [[1, 'triangle', peak], [2, 'sine', peak * 0.25]].forEach(([ratio, type, gain]) => {
    const osc = ctx.createOscillator();
    osc.type = type as OscillatorType;
    osc.frequency.value = freq * (ratio as number);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain as number, start + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    osc.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + 1.15);
  });
}

/** FB-034: harp glissando — a quick rising C-major sweep (≈0.7s) as the heart flies. */
function playHarpGlissandoSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  // C5 → C7, C major.
  const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77,
                 1046.5, 1174.66, 1318.51, 1396.91, 1567.98, 1760, 1975.53, 2093];
  scale.forEach((freq, i) => {
    // Accelerating sweep, softening as it climbs.
    const start = t0 + 0.6 * Math.pow(i / (scale.length - 1), 1.3);
    pluckHarpString(ctx, dest, freq, start, 0.07 - i * 0.003);
  });
}

/**
 * FB-034: the rose — a harp flourish. A quick rising sweep over two octaves,
 * a rolled C-major chord, a falling high shimmer, and the chord again (≈3.5 s).
 */
function playHarpFlourishSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  // Sweep: G4 → G6 in C major.
  const sweep = [392, 440, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99,
                 880, 987.77, 1046.5, 1174.66, 1318.51, 1567.98];
  sweep.forEach((freq, i) => {
    pluckHarpString(ctx, dest, freq, t0 + 0.42 * Math.pow(i / (sweep.length - 1), 1.2), 0.055);
  });
  // Rolled chord: C4 G4 C5 E5 G5 C6, unhurried — lands with the rose.
  [261.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    pluckHarpString(ctx, dest, freq, t0 + 0.62 + i * 0.07, 0.08 - i * 0.008);
  });
  // Petals falling: a slow, high, descending shimmer, then the chord again, softer.
  [2093, 1760, 1567.98, 1318.51, 1174.66, 1046.5].forEach((freq, i) => {
    pluckHarpString(ctx, dest, freq, t0 + 1.35 + i * 0.16, 0.03);
  });
  [261.63, 392, 523.25, 659.25, 783.99].forEach((freq, i) => {
    pluckHarpString(ctx, dest, freq, t0 + 2.45 + i * 0.09, 0.05 - i * 0.006);
  });
}

/** FB-034 defeat: a heart blooms on crew portrait i — a soft harp note, rising per crew. */
function makeHeartBloomSting(i: number): (ctx: AudioContext, dest: AudioNode) => void {
  // A minor-ish rise: A4 C5 E5 A5 C6 — wistful, not triumphant.
  const notes = [440, 523.25, 659.25, 880, 1046.5];
  const freq  = notes[Math.min(i, notes.length - 1)] ?? 440;
  return (ctx, dest) => {
    const t0 = ctx.currentTime + 0.01;
    pluckHarpString(ctx, dest, freq, t0, 0.07);
    pluckHarpString(ctx, dest, freq / 2, t0 + 0.02, 0.04);
  };
}

/**
 * FB-034 defeat: the lipstick kiss — a soft lip smack, then a breathy, voiced
 * "mwah" (a buzz through a formant that opens from "m" to "ah") (≈0.45 s).
 */
function playKissMwahSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;

  // Smack: a very short band-passed noise click.
  const smack = ctx.createBufferSource();
  smack.buffer = makeNoiseBuf(ctx, 0.05);
  const smackBp = ctx.createBiquadFilter();
  smackBp.type = 'bandpass';
  smackBp.frequency.value = 1800;
  smackBp.Q.value = 1.2;
  const smackEnv = ctx.createGain();
  smackEnv.gain.setValueAtTime(0.0001, t0);
  smackEnv.gain.exponentialRampToValueAtTime(0.22, t0 + 0.004);
  smackEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
  smack.connect(smackBp);
  smackBp.connect(smackEnv);
  smackEnv.connect(dest);
  smack.start(t0);
  smack.stop(t0 + 0.05);

  // "mwah": sawtooth voice, pitch lifts then falls, formant opens m → ah.
  const v0 = t0 + 0.03;
  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(260, v0);
  voice.frequency.linearRampToValueAtTime(330, v0 + 0.12);
  voice.frequency.exponentialRampToValueAtTime(210, v0 + 0.42);
  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.Q.value = 3;
  formant.frequency.setValueAtTime(320, v0);
  formant.frequency.exponentialRampToValueAtTime(1100, v0 + 0.14);
  formant.frequency.exponentialRampToValueAtTime(800, v0 + 0.42);
  const breath = ctx.createBufferSource();
  breath.buffer = makeNoiseBuf(ctx, 0.45);
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.25;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, v0);
  env.gain.exponentialRampToValueAtTime(0.16, v0 + 0.07);
  env.gain.setValueAtTime(0.16, v0 + 0.16);
  env.gain.exponentialRampToValueAtTime(0.0001, v0 + 0.44);
  voice.connect(formant);
  breath.connect(breathGain);
  breathGain.connect(formant);
  formant.connect(env);
  env.connect(dest);
  voice.start(v0);
  voice.stop(v0 + 0.46);
  breath.start(v0);
  breath.stop(v0 + 0.45);
}

/** FB-035: the review marker steps — a crisp keyboard clack per step. */
function makeReviewTickSting(steps: number): (ctx: AudioContext, dest: AudioNode) => void {
  return (ctx, dest) => {
    const t0 = ctx.currentTime + 0.01;
    for (let i = 0; i < Math.max(1, steps); i++) {
      const at = t0 + i * 0.09;
      const click = ctx.createBufferSource();
      click.buffer = makeNoiseBuf(ctx, 0.04);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.16, at + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
      click.connect(bp);
      bp.connect(env);
      env.connect(dest);
      click.start(at);
      click.stop(at + 0.04);
      // Key bottoming out — a tiny low knock.
      const knock = ctx.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(180, at);
      knock.frequency.exponentialRampToValueAtTime(90, at + 0.04);
      const kEnv = ctx.createGain();
      kEnv.gain.setValueAtTime(0.0001, at);
      kEnv.gain.exponentialRampToValueAtTime(0.08, at + 0.003);
      kEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      knock.connect(kEnv);
      kEnv.connect(dest);
      knock.start(at);
      knock.stop(at + 0.06);
    }
  };
}

/** FB-035: promoted to Exceptional — a bright two-tone office "ding". */
function playPromotionDingSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  [[1318.51, 0], [1760, 0.16]].forEach(([freq, at]) => {
    [[1, 0.12], [2.76, 0.03]].forEach(([ratio, peak]) => {   // bell partials
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = (freq as number) * (ratio as number);
      const env = ctx.createGain();
      const s = t0 + (at as number);
      env.gain.setValueAtTime(0.0001, s);
      env.gain.exponentialRampToValueAtTime(peak as number, s + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
      osc.connect(env);
      env.connect(dest);
      osc.start(s);
      osc.stop(s + 1.15);
    });
  });
}

/** FB-035: dropped to Action Required — a low, flat double buzz. */
function playReviewWarningSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  [0, 0.22].forEach((at) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 110;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const env = ctx.createGain();
    const s = t0 + at;
    env.gain.setValueAtTime(0.0001, s);
    env.gain.exponentialRampToValueAtTime(0.07, s + 0.01);
    env.gain.setValueAtTime(0.07, s + 0.14);
    env.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    osc.connect(lp);
    lp.connect(env);
    env.connect(dest);
    osc.start(s);
    osc.stop(s + 0.2);
  });
}

/**
 * FB-035 win: the Executive's brass nameplate hits the floor — an inharmonic
 * metal clang with a noise crash, then a smaller bounce (≈0.9 s).
 */
function playPlateClangSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  [[0, 1], [0.2, 0.45]].forEach(([at, level]) => {
    const s = t0 + (at as number);
    const lv = level as number;
    [[523, 0.09], [1310, 0.06], [2147, 0.05], [3390, 0.03], [4710, 0.02]].forEach(([freq, peak]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq as number;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, s);
      env.gain.exponentialRampToValueAtTime((peak as number) * lv, s + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, s + 0.7 * lv + 0.1);
      osc.connect(env);
      env.connect(dest);
      osc.start(s);
      osc.stop(s + 0.85);
    });
    const crash = ctx.createBufferSource();
    crash.buffer = makeNoiseBuf(ctx, 0.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cEnv = ctx.createGain();
    cEnv.gain.setValueAtTime(0.0001, s);
    cEnv.gain.exponentialRampToValueAtTime(0.12 * lv, s + 0.003);
    cEnv.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    crash.connect(hp);
    hp.connect(cEnv);
    cEnv.connect(dest);
    crash.start(s);
    crash.stop(s + 0.2);
  });
}

/** One mallet-bell note (sine + a bright, fast-decaying partial). */
function strikeBell(ctx: AudioContext, dest: AudioNode, freq: number, start: number, peak: number, ring: number): void {
  [[1, peak, ring], [4, peak * 0.25, ring * 0.3]].forEach(([ratio, p, r]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (ratio as number);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(p as number, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + (r as number));
    osc.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + (r as number) + 0.05);
  });
}

/** FB-035 win: an office-chime fanfare — a quick rising arpeggio into a held chord. */
function playOfficeFanfareSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  [783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) => strikeBell(ctx, dest, f, t0 + i * 0.11, 0.08, 0.5));
  [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => strikeBell(ctx, dest, f, t0 + 0.5 + i * 0.02, 0.065, 1.6));
}

/** FB-035 defeat: something lands in a cardboard box (heavy = the lid). */
function makeBoxThumpSting(heavy: boolean): (ctx: AudioContext, dest: AudioNode) => void {
  return (ctx, dest) => {
    const t0 = ctx.currentTime + 0.01;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(heavy ? 120 : 160, t0);
    body.frequency.exponentialRampToValueAtTime(heavy ? 55 : 80, t0 + 0.12);
    const bEnv = ctx.createGain();
    bEnv.gain.setValueAtTime(0.0001, t0);
    bEnv.gain.exponentialRampToValueAtTime(heavy ? 0.22 : 0.13, t0 + 0.006);
    bEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + (heavy ? 0.22 : 0.14));
    body.connect(bEnv);
    bEnv.connect(dest);
    body.start(t0);
    body.stop(t0 + 0.25);
    // Cardboard: a dull, low-passed slap.
    const slap = ctx.createBufferSource();
    slap.buffer = makeNoiseBuf(ctx, 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = heavy ? 900 : 1300;
    const sEnv = ctx.createGain();
    sEnv.gain.setValueAtTime(0.0001, t0);
    sEnv.gain.exponentialRampToValueAtTime(heavy ? 0.2 : 0.1, t0 + 0.004);
    sEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + (heavy ? 0.12 : 0.07));
    slap.connect(lp);
    lp.connect(sEnv);
    sEnv.connect(dest);
    slap.start(t0);
    slap.stop(t0 + 0.12);
  };
}

/** FB-036: coins in the offering bowl — 'drop' clinks down into it, 'rise' shimmers up out of it. */
function makeCoinChimeSting(kind: 'drop' | 'rise'): (ctx: AudioContext, dest: AudioNode) => void {
  return (ctx, dest) => {
    const t0 = ctx.currentTime + 0.01;
    const base = kind === 'drop' ? [2637, 2349, 2093] : [2093, 2637, 3136];
    base.forEach((freq, i) => {
      const at = t0 + i * (kind === 'drop' ? 0.07 : 0.09);
      [[1, 0.05], [2.4, 0.02], [3.9, 0.012]].forEach(([ratio, peak]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * (ratio as number);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(peak as number, at + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'drop' ? 0.25 : 0.45));
        osc.connect(env);
        env.connect(dest);
        osc.start(at);
        osc.stop(at + 0.5);
      });
    });
  };
}

/** FB-036: a deep temple bell — one long toll with inharmonic partials (≈3 s). */
function playBellTollSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  [[1, 0.13, 3.2], [2.0, 0.06, 2.4], [2.76, 0.05, 1.8], [5.4, 0.025, 1.0], [0.5, 0.05, 3.4]].forEach(([ratio, peak, ring]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 146.83 * (ratio as number);   // D3
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak as number, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + (ring as number));
    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + (ring as number) + 0.05);
  });
}

/**
 * FB-036: a choir "aah" — formant-filtered voices. 'minor' (D minor, ≈2 s) for
 * the order's tribute; 'major' (D major, brighter and longer, ≈3 s) for the
 * light through the sanctum doors.
 */
function makeChoirChordSting(mode: 'minor' | 'major'): (ctx: AudioContext, dest: AudioNode) => void {
  return (ctx, dest) => playChoirChordVoices(ctx, dest, mode);
}

function playChoirChordVoices(ctx: AudioContext, dest: AudioNode, mode: 'minor' | 'major'): void {
  const t0  = ctx.currentTime + 0.01;
  const end = t0 + (mode === 'major' ? 3.0 : 2.1);
  const formants = [[700, 0.5], [1150, 0.3]].map(([f, g]) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f as number;
    bp.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = g as number;
    bp.connect(gain);
    return { bp, gain };
  });
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.32, t0 + 0.45);   // slow swell
  out.gain.setValueAtTime(0.32, t0 + 1.3);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  formants.forEach(({ gain }) => gain.connect(out));
  out.connect(dest);
  const chord = mode === 'major'
    ? [146.83, 185.0, 220, 293.66, 369.99]                    // D3 F#3 A3 D4 F#4
    : [146.83, 174.61, 220, 293.66];                          // D3 F3 A3 D4
  chord.forEach((freq) => {
    [-6, 6].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = cents;
      formants.forEach(({ bp }) => osc.connect(bp));
      osc.start(t0);
      osc.stop(end + 0.05);
    });
  });
}

/** FB-036: a candle pinched out — a short, soft breath of noise. */
function playCandleSnuffSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  const puff = ctx.createBufferSource();
  puff.buffer = makeNoiseBuf(ctx, 0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2400, t0);
  bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.18);
  bp.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
  puff.connect(bp);
  bp.connect(env);
  env.connect(dest);
  puff.start(t0);
  puff.stop(t0 + 0.2);
}

/** FB-036: the sanctum doors grind open — a low stone rumble that swells and settles (≈2 s). */
function playDoorsOpenSting(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.01;
  const rumble = ctx.createBufferSource();
  rumble.buffer = makeNoiseBuf(ctx, 2.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(180, t0);
  lp.frequency.linearRampToValueAtTime(420, t0 + 1.0);
  lp.frequency.linearRampToValueAtTime(140, t0 + 2.1);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.32, t0 + 0.5);
  env.gain.setValueAtTime(0.32, t0 + 1.3);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.15);
  rumble.connect(lp);
  lp.connect(env);
  env.connect(dest);
  rumble.start(t0);
  rumble.stop(t0 + 2.2);
  // A final heavy thud as they come to rest.
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(70, t0 + 1.55);
  thud.frequency.exponentialRampToValueAtTime(38, t0 + 1.85);
  const tEnv = ctx.createGain();
  tEnv.gain.setValueAtTime(0.0001, t0 + 1.55);
  tEnv.gain.exponentialRampToValueAtTime(0.25, t0 + 1.57);
  tEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.95);
  thud.connect(tEnv);
  tEnv.connect(dest);
  thud.start(t0 + 1.55);
  thud.stop(t0 + 2.0);
}

/**
 * Runs a sting on the shared module-level AudioContext + master volume.
 * For sounds triggered outside useCrowdAudio (cinematics run while TableBoard,
 * which mounts the hook, is unmounted). Silent when muted.
 */
function playStandalone(sting: (ctx: AudioContext, dest: AudioNode) => void): void {
  const vol = _initSfxVolume();
  if (vol === 0) return;
  if (!globalAudioCtx) {
    globalAudioCtx = new AudioContext();
    masterGain = globalAudioCtx.createGain();
    masterGain.gain.value = vol;
    masterGain.connect(globalAudioCtx.destination);
  }
  const ctx = globalAudioCtx;
  if (ctx.state === 'suspended') void ctx.resume();
  sting(ctx, masterGain ?? ctx.destination);
}

/** Boss-entry impact sting (BossEntryDreadPhase). */
export function playBossImpact(): void {
  playStandalone(playBossImpactSting);
}

/** FB-032: The Foreman skims a roll — ka-ching. */
export function playRegisterKaChing(): void {
  playStandalone(playKaChingSting);
}

/** FB-032: The Foreman is paid off — register bell. */
export function playRegisterBell(): void {
  playStandalone(playRegisterBellSting);
}

/** FB-033: a rubber stamp slams onto paper (HONORABLY / DISHONORABLE DISCHARGE). */
export function playStampThud(): void {
  playStandalone(playStampThudSting);
}

/** FB-033: DISHONORABLE DISCHARGE — dog tags land on the form. */
export function playDogTagsJingle(): void {
  playStandalone(playDogTagsJingleSting);
}

/** FB-033: HONORABLY DISCHARGED — bugle call. */
export function playBugleCall(): void {
  playStandalone(playBugleCallSting);
}

/** FB-033: Sarge's clock ticks (sharper as rollsLeft drops). */
export function playClockTick(rollsLeft: number): void {
  playStandalone(makeClockTickSting(rollsLeft));
}

/** FB-033: Sarge's clock reaches the last roll. */
export function playClockAlarm(): void {
  playStandalone(playClockAlarmSting);
}

/** FB-033: TIME'S UP. */
export function playDrillWhistle(): void {
  playStandalone(playDrillWhistleSting);
}

/** FB-032 defeat: register goes dead on BALANCE DUE. */
export function playDeadThunk(): void {
  playStandalone(playDeadThunkSting);
}

/** FB-032 defeat: the dock door rolls down. */
export function playDoorRattle(): void {
  playStandalone(playDoorRattleSting);
}

/** FB-032 defeat: the dock door slams shut. */
export function playDoorClang(): void {
  playStandalone(playDoorClangSting);
}

/** FB-034: a charmed crew member tries to fire — and drifts off in a daze. */
export function playCharmDaze(): void {
  playStandalone(playCharmDazeSting);
}

/** FB-034 defeat: a heart blooms on the i-th crew portrait. */
export function playHeartBloom(i: number): void {
  playStandalone(makeHeartBloomSting(i));
}

/** FB-034 defeat: her lipstick kiss presses onto the screen. */
export function playKissMwah(): void {
  playStandalone(playKissMwahSting);
}

/** FB-035: the Executive's review marker moved `steps` notches. */
export function playReviewTick(steps: number): void {
  playStandalone(makeReviewTickSting(steps));
}

/** FB-035: promoted to Exceptional. */
export function playPromotionDing(): void {
  playStandalone(playPromotionDingSting);
}

/** FB-035: dropped to Action Required. */
export function playReviewWarning(): void {
  playStandalone(playReviewWarningSting);
}

/** FB-035 win: the Executive's nameplate clangs to the floor. */
export function playPlateClang(): void {
  playStandalone(playPlateClangSting);
}

/** FB-035 win: THE SHOOTER's plate lands — office-chime fanfare. */
export function playOfficeFanfare(): void {
  playStandalone(playOfficeFanfareSting);
}

/** FB-035 defeat: crew packed into the box (heavy = the lid comes down). */
export function playBoxThump(heavy: boolean): void {
  playStandalone(makeBoxThumpSting(heavy));
}

/** FB-036: coins drop into / rise out of the Hierophant's offering bowl. */
export function playCoinChime(kind: 'drop' | 'rise'): void {
  playStandalone(makeCoinChimeSting(kind));
}

/** FB-036: the Hierophant's bell. */
export function playBellToll(): void {
  playStandalone(playBellTollSting);
}

/** FB-036: the order's choir ('minor' for tribute; 'major' when the doors open). */
export function playChoirChord(mode: 'minor' | 'major' = 'minor'): void {
  playStandalone(makeChoirChordSting(mode));
}

/** FB-036 win: a candle in the ring goes out. */
export function playCandleSnuff(): void {
  playStandalone(playCandleSnuffSting);
}

/** FB-036 win: the sanctum doors grind open. */
export function playDoorsOpen(): void {
  playStandalone(playDoorsOpenSting);
}

/** FB-034: THE ROSE — you beat Mme. Le Prix. */
export function playHarpFlourish(): void {
  playStandalone(playHarpFlourishSting);
}

/** FB-034: Mme. Le Prix's heart flies to a new crew member. */
export function playHarpGlissando(): void {
  playStandalone(playHarpGlissandoSting);
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
