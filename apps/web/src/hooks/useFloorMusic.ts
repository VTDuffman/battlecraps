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
//   • Mute state is persisted to localStorage under 'bc_music_muted',
//     independent of the SFX mute key ('bc_muted').
//
// Exports: { isMusicMuted, toggleMusic }
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUSIC_STORAGE_KEY = 'bc_music_muted';
const FADE_IN_MS        = 500;
const FADE_OUT_MS       = 300;
const FADE_OUT_F9_MS    = 1000; // intentional extended fade for The Null Space
const FADE_TICK_MS      = 16;   // ~60 fps

// ---------------------------------------------------------------------------
// Module-level state — survives TableBoard mount/unmount cycles
// (same pattern as useCrowdAudio.ts globalAudioCtx)
// ---------------------------------------------------------------------------

let _hasInteracted:     boolean                              = false;
let _audio:             HTMLAudioElement | null              = null;
let _activeMusicFloor:  number | null                        = null;
let _fadeTimer:         ReturnType<typeof setInterval> | null = null;

/** Reads current mute preference from localStorage (always fresh). */
function _getStoredMuted(): boolean {
  return localStorage.getItem(MUSIC_STORAGE_KEY) === '1';
}

// ---------------------------------------------------------------------------
// Fade helper
// ---------------------------------------------------------------------------

/**
 * Linearly ramps `audio.volume` from its current value to `targetVolume` over
 * `durationMs`. Returns the interval ID so the caller can cancel the fade.
 * `onDone` fires once the ramp completes (at the exact final tick).
 * Uses wall-clock elapsed time so a delayed tick never stalls or overshoots
 * the ramp.
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
    _audio.src       = '';
    _audio           = null;
    _activeMusicFloor = null;
  }
}

/**
 * Creates a fresh Audio element for `floor` and fades in from silence.
 * No-ops for floor 9 (intentional silence) or when the player has muted music.
 * The superseded-element guard (`_audio !== audio`) prevents race conditions
 * when `_playFloor` is called again before the previous `play()` resolves.
 */
function _playFloor(floor: number): void {
  _stopAudio();
  if (floor === 9 || _getStoredMuted()) return;

  const audio      = new Audio(`/audio/music/floor-${floor}.mp3`);
  audio.loop       = true;
  audio.volume     = 0;
  _audio           = audio;
  _activeMusicFloor = floor;

  void audio.play()
    .then(() => {
      if (_audio !== audio) return; // superseded by a later call
      _fadeTimer = startFade(audio, 0.60, FADE_IN_MS, () => {
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
 * calls `_playFloor` for the new floor.  If nothing is currently playing the
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
  isMusicMuted: boolean;
  toggleMusic:  () => void;
} {
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(_getStoredMuted);

  // Keeps the current floor accessible inside callbacks and effects without
  // becoming a dependency that recreates them on every floor change.
  const currentFloorRef = useRef(currentFloor);
  currentFloorRef.current = currentFloor;

  // Tracks the last floor we actually handed to _playFloor / _transitionToFloor.
  // Prevents the floor-change effect from double-firing when only a dependency
  // identity refreshes without the floor value changing.
  const prevPlayedFloorRef = useRef<number | null>(null);

  // ── Mount / unmount lifecycle ────────────────────────────────────────────
  //
  // On mount  — start music for the current floor if the player has already
  //             interacted (i.e. this is a remount after a cinematic).
  //
  // On unmount — gracefully fade out whatever is playing.  The module-level
  //             interval keeps running after the component is gone, so the
  //             fade completes even though React has already torn down the
  //             component tree.
  //
  // The cleanup is always registered (not just when _hasInteracted is true
  // at mount time) because the player may interact after the first mount and
  // start audio; that audio must still be faded when the component later
  // unmounts.
  useEffect(() => {
    if (_hasInteracted) {
      const floor = currentFloorRef.current;
      prevPlayedFloorRef.current = floor;
      _playFloor(floor);
    }

    return () => {
      _cancelFade();
      if (_audio && !_audio.paused) {
        // Start a module-level fade-out; it outlives the React component.
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
  //
  // A one-time listener on click and keydown — whichever fires first satisfies
  // the browser's autoplay requirement.  `{ once: true }` auto-removes after
  // the first fire; the cleanup handles the case where the component unmounts
  // before any interaction occurs.
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

  // ── Mute toggle ──────────────────────────────────────────────────────────
  const toggleMusic = useCallback(() => {
    const next = !_getStoredMuted();
    localStorage.setItem(MUSIC_STORAGE_KEY, next ? '1' : '0');
    setIsMusicMuted(next);

    if (next) {
      // Muting — fade out and pause whatever is playing
      _cancelFade();
      if (_audio && !_audio.paused) {
        const captured = _audio;
        _fadeTimer = startFade(captured, 0, FADE_OUT_MS, () => {
          _fadeTimer = null;
          captured.pause();
        });
      }
    } else {
      // Unmuting — start current floor's track if interaction has occurred
      if (_hasInteracted) {
        const floor = currentFloorRef.current;
        prevPlayedFloorRef.current = floor;
        _playFloor(floor);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isMusicMuted, toggleMusic };
}
