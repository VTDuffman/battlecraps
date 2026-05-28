// =============================================================================
// BATTLECRAPS — FLOOR MUSIC HOOK
// apps/web/src/hooks/useFloorMusic.ts
//
// Plays a looping floor-N.mp3 track for floors 1–8 via HTMLAudioElement.
// Floor 9 ("The Null Space") is intentional silence: any playing track fades
// out over 1000 ms and no new track is started.
//
// Architecture:
//   • Single HTMLAudioElement, swapped on floor change.
//   • Floor changes: 300 ms fade-out on the old track, then 500 ms fade-in on
//     the new one (1000 ms fade-out for the transition INTO floor 9).
//   • Lazy-start: audio is not attempted until the first user interaction
//     (click or keydown) to satisfy browser autoplay policy.
//   • Module-level audio state (same pattern as useCrowdAudio's globalAudioCtx)
//     survives TableBoard mount/unmount cycles. TableBoard is unmounted during
//     cinematic transitions (activeTransition !== null in the
//     TransitionOrchestrator). The unmount cleanup fades out the current track;
//     the remount effect restarts it — giving a clean musical pause through
//     each cinematic and a smooth resume on return to gameplay.
//   • Mute state persisted to localStorage under 'bc_music_muted'.
//   • Volume level persisted to localStorage under 'bc_music_volume' (default 0.8).
//     The stored value is always the last non-zero preference — muting via the
//     button does NOT overwrite it, so unmuting restores the previous level.
//
// Exports: { isMusicMuted, toggleMusic, musicVolume, setMusicVolume }
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUSIC_MUTED_KEY    = 'bc_music_muted';
const MUSIC_VOLUME_KEY   = 'bc_music_volume';
const DEFAULT_MUSIC_VOLUME = 0.8;

const FADE_IN_MS        = 500;
const FADE_OUT_MS       = 300;
const FADE_OUT_F9_MS    = 1000; // intentional extended fade for The Null Space
const FADE_TICK_MS      = 16;   // ~60 fps

// ---------------------------------------------------------------------------
// Module-level state — survives TableBoard mount/unmount cycles
// ---------------------------------------------------------------------------

let _hasInteracted:     boolean                              = false;
let _audio:             HTMLAudioElement | null              = null;
let _activeMusicFloor:  number | null                        = null;
let _fadeTimer:         ReturnType<typeof setInterval> | null = null;

/**
 * The current preferred (non-muted) music volume, 0.01–1.0.
 * Initialised from bc_music_volume on first hook call; updated by setMusicVolume.
 * Fade-in targets this value so the slider and fade are always in sync.
 */
let _musicVolume: number = DEFAULT_MUSIC_VOLUME;

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/** Reads current mute preference from localStorage (always fresh). */
function _getStoredMuted(): boolean {
  return localStorage.getItem(MUSIC_MUTED_KEY) === '1';
}

/** Reads stored volume preference; returns DEFAULT_MUSIC_VOLUME when absent. */
function _getStoredMusicVolume(): number {
  const stored = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY) ?? '');
  return isNaN(stored) || stored <= 0 ? DEFAULT_MUSIC_VOLUME : Math.min(1, stored);
}

// ---------------------------------------------------------------------------
// Fade helper
// ---------------------------------------------------------------------------

/**
 * Linearly ramps `audio.volume` from its current value to `targetVolume` over
 * `durationMs`. Returns the interval ID so the caller can cancel the fade.
 * `onDone` fires once the ramp completes (at the exact final tick).
 * Uses wall-clock elapsed time so a delayed tick never stalls or overshoots.
 */
function startFade(
  audio: HTMLAudioElement,
  targetVolume: number,
  durationMs: number,
  onDone?: () => void,
): ReturnType<typeof setInterval> {
  const startVolume = audio.volume;
  const startTime   = Date.now();

  const id = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const t       = Math.min(elapsed / durationMs, 1);
    audio.volume  = startVolume + (targetVolume - startVolume) * t;
    if (t >= 1) {
      clearInterval(id);
      audio.volume = targetVolume;
      onDone?.();
    }
  }, FADE_TICK_MS);

  return id;
}

// ---------------------------------------------------------------------------
// Module-level audio helpers
// ---------------------------------------------------------------------------

function _cancelFade(): void {
  if (_fadeTimer !== null) {
    clearInterval(_fadeTimer);
    _fadeTimer = null;
  }
}

function _stopAudio(): void {
  _cancelFade();
  if (_audio) {
    _audio.pause();
    _audio.src        = '';
    _audio            = null;
    _activeMusicFloor = null;
  }
}

/**
 * Creates a fresh Audio element for `floor` and fades in from silence to
 * `_musicVolume`. No-ops for floor 9 (intentional silence) or when muted.
 * The superseded-element guard (`_audio !== audio`) prevents race conditions
 * when `_playFloor` is called again before the previous `play()` resolves.
 */
function _playFloor(floor: number): void {
  _stopAudio();
  if (floor === 9 || _getStoredMuted()) return;

  const targetVol  = _musicVolume;          // capture at call time
  const audio      = new Audio(`/audio/music/floor-${floor}.mp3`);
  audio.loop       = true;
  audio.volume     = 0;
  _audio           = audio;
  _activeMusicFloor = floor;

  void audio.play()
    .then(() => {
      if (_audio !== audio) return; // superseded by a later call
      _fadeTimer = startFade(audio, targetVol, FADE_IN_MS, () => {
        _fadeTimer = null;
      });
    })
    .catch(() => {
      // Autoplay blocked despite the interaction gate — clear state so the
      // next interaction can retry.
      if (_audio === audio) { _audio = null; _activeMusicFloor = null; }
      _hasInteracted = false;
    });
}

/**
 * Fades out the current track then (unless transitioning to floor 9 or muted)
 * calls `_playFloor` for the new floor. If nothing is currently playing the
 * new track starts immediately.
 */
function _transitionToFloor(newFloor: number): void {
  const isFloor9  = newFloor === 9;
  const fadeOutMs = isFloor9 ? FADE_OUT_F9_MS : FADE_OUT_MS;

  _cancelFade();

  if (_audio && !_audio.paused) {
    const captured = _audio;
    _fadeTimer = startFade(captured, 0, fadeOutMs, () => {
      _fadeTimer = null;
      captured.pause();
      if (_audio === captured) { _audio = null; _activeMusicFloor = null; }
      if (!isFloor9 && !_getStoredMuted()) _playFloor(newFloor);
    });
  } else {
    _stopAudio();
    if (!isFloor9 && !_getStoredMuted()) _playFloor(newFloor);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFloorMusic(currentFloor: number): {
  isMusicMuted:   boolean;
  toggleMusic:    () => void;
  musicVolume:    number;
  setMusicVolume: (v: number) => void;
} {
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(_getStoredMuted);

  // Initialize _musicVolume from localStorage on first render (module default
  // is DEFAULT_MUSIC_VOLUME; this overwrites it with the stored preference).
  const [musicVolume, setMusicVolumeState] = useState<number>(() => {
    _musicVolume = _getStoredMusicVolume();
    return _musicVolume;
  });

  // Keeps the current floor accessible inside callbacks and effects without
  // becoming a dependency that recreates them on every floor change.
  const currentFloorRef = useRef(currentFloor);
  currentFloorRef.current = currentFloor;

  // Tracks whether we're muted inside callbacks (avoids stale closure captures).
  const isMusicMutedRef = useRef(isMusicMuted);
  isMusicMutedRef.current = isMusicMuted;

  // Tracks the last floor we actually handed to _playFloor / _transitionToFloor.
  const prevPlayedFloorRef = useRef<number | null>(null);

  // ── Mount / unmount lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (_hasInteracted) {
      const floor = currentFloorRef.current;
      prevPlayedFloorRef.current = floor;
      _playFloor(floor);
    }

    return () => {
      _cancelFade();
      if (_audio && !_audio.paused) {
        const captured = _audio;
        _fadeTimer = startFade(captured, 0, FADE_OUT_MS, () => {
          _fadeTimer = null;
          captured.pause();
          if (_audio === captured) { _audio = null; _activeMusicFloor = null; }
        });
      } else {
        _stopAudio();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Floor-change effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!_hasInteracted)                             return;
    if (prevPlayedFloorRef.current === currentFloor) return;
    prevPlayedFloorRef.current = currentFloor;
    _transitionToFloor(currentFloor);
  }, [currentFloor]);

  // ── First user interaction (autoplay gate) ───────────────────────────────
  useEffect(() => {
    if (_hasInteracted) return;

    const handleInteraction = () => {
      if (_hasInteracted) return;
      _hasInteracted = true;

      const floor = currentFloorRef.current;
      prevPlayedFloorRef.current = floor;
      _playFloor(floor);
    };

    document.addEventListener('click',   handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click',   handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume control ───────────────────────────────────────────────────────
  const setMusicVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    _musicVolume = clamped;
    // Only persist non-zero values — 0 is not a meaningful preference.
    if (clamped > 0) localStorage.setItem(MUSIC_VOLUME_KEY, String(clamped));
    // Apply immediately if audio is running and not muted.
    if (_audio && !isMusicMutedRef.current && !_audio.paused) {
      _cancelFade();
      _audio.volume = clamped;
    }
    setMusicVolumeState(clamped);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mute toggle ──────────────────────────────────────────────────────────
  const toggleMusic = useCallback(() => {
    const next = !_getStoredMuted();
    localStorage.setItem(MUSIC_MUTED_KEY, next ? '1' : '0');
    setIsMusicMuted(next);

    if (next) {
      // Muting — save the current intended volume so unmute can restore it.
      if (_musicVolume > 0) localStorage.setItem(MUSIC_VOLUME_KEY, String(_musicVolume));
      _cancelFade();
      if (_audio && !_audio.paused) {
        const captured = _audio;
        _fadeTimer = startFade(captured, 0, FADE_OUT_MS, () => {
          _fadeTimer = null;
          captured.pause();
        });
      }
    } else {
      // Unmuting — restore volume and restart the current floor's track.
      _musicVolume = _getStoredMusicVolume();
      if (_hasInteracted) {
        const floor = currentFloorRef.current;
        prevPlayedFloorRef.current = floor;
        _playFloor(floor);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isMusicMuted, toggleMusic, musicVolume, setMusicVolume };
}
