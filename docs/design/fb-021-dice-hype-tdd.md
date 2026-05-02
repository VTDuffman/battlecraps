# FB-021 — NBA Jam Style Dice Hype Visualization
## Technical Design Document

**Status:** Draft  
**Area:** `apps/web/src/` — DiceZone, useGameStore, new hooks/components  
**Dependencies:** Existing `consecutivePointHits` state (already tracked); `applyPendingSettlement` reveal flow  

---

## 1. Overview

Add two escalating visual tiers to the 2D dice when the player is on a hot streak — matching the *NBA Jam* "Heating Up / On Fire" aesthetic. The effects use:

- **CSS `filter` animation** — persistent glow on the dice at rest, applied as a keyframe class on the dice pair div.
- **Canvas particle emitter** — fire-trail particles that trail the dice *during the throw animation* at Tier 3 only. Implemented in a dedicated `useParticleEmitter` hook.
- **HypeFlash overlay** — a full-viewport "HEATING UP!" / "ON FIRE!" announcement triggered at the settlement reveal moment (inside `applyPendingSettlement`), matching the timing of the existing screen-flash and payout-pop system.

---

## 2. Tier Definition

Tiers are derived from `consecutivePointHits` (already in `GameState`), which tracks the current shooter's consecutive point hits and resets on Seven Out or marker clear.

| Tier | Condition | Label |
|------|-----------|-------|
| 0 — Normal | `consecutivePointHits < 2` | No effect |
| 2 — Heating Up | `consecutivePointHits` in `[2, 3]` | "HEATING UP!" |
| 3 — On Fire | `consecutivePointHits >= 4` | "ON FIRE!" |

The tier is **derived client-side** — it does not need to be stored on the server or added to `GameState`. A selector handles the mapping.

### Selector

Add to the bottom of `useGameStore.ts` alongside the existing selectors:

```typescript
// apps/web/src/store/useGameStore.ts

/** 0 = normal, 2 = heating up, 3 = on fire */
export const selectHypeTier = (s: GameState): 0 | 2 | 3 =>
  s.consecutivePointHits >= 4 ? 3 :
  s.consecutivePointHits >= 2 ? 2 :
  0;
```

---

## 3. Store Changes

### 3.1 New State Fields

Add to the `GameState` interface:

```typescript
// In GameState:

/**
 * Transient tier to show in the HypeFlash overlay.
 * Set by applyPendingSettlement() at the reveal moment on POINT_HIT rolls.
 * null = no flash currently requested.
 */
hypeFlash: 'heating-up' | 'on-fire' | null;

/**
 * Increments each time hypeFlash is set, even to the same tier.
 * Used as the React key on <HypeFlash> so the CSS animation re-fires
 * on back-to-back POINT_HIT rolls without the component unmounting.
 */
_hypeFlashKey: number;
```

### 3.2 Default Values

```typescript
// In the create() initial state block:
hypeFlash:    null,
_hypeFlashKey: 0,
```

### 3.3 Reset on connectToRun / disconnect

Both `connectToRun` and `disconnect` must zero the fields:

```typescript
hypeFlash:     null,
_hypeFlashKey: 0,
```

### 3.4 Trigger in `applyPendingSettlement`

The HypeFlash must fire at the **reveal moment** — the same `set()` call that applies bankroll, bets, and screen flash. This guarantees the announcement appears exactly when `applyPendingSettlement` runs (i.e., when the result popup begins to fade, 2 s after dice land).

In `applyPendingSettlement()`, add before the final `set({...})` call:

```typescript
// Only announce on a POINT_HIT roll, and only when crossing into a tier.
// newConsecutivePointHits is the value AFTER this hit is recorded.
const newHits = p.newConsecutivePointHits;
const flashTier: 'heating-up' | 'on-fire' | null =
  p.rollResult === 'POINT_HIT'
    ? newHits >= 4 ? 'on-fire'
    : newHits >= 2 ? 'heating-up'
    : null
  : null;
```

Then include in the `set({...})` body:

```typescript
hypeFlash:     flashTier,
_hypeFlashKey: flashTier !== null ? _hypeFlashKey + 1 : _hypeFlashKey,
```

> **Why only POINT_HIT?** `consecutivePointHits` can also increment via certain crew effects, but the flash should only play at the naturally dramatic "point hit" reveal moment. This keeps the announcement semantically tied to the dice result popup already on screen.

---

## 4. CSS Visual Tiers

All keyframe rules go in `apps/web/src/index.css`, in the existing dice micro-animation block.

### 4.1 Tier 2 — Heating Up (orange ember shimmer)

```css
@keyframes dice-heat {
  /* Slow breathe: orange corona expands and contracts */
  0%, 100% {
    filter:
      drop-shadow(0 0  4px rgba(251, 146,  60, 0.65))
      drop-shadow(0 0  8px rgba(251, 146,  60, 0.35))
      brightness(1.07)
      saturate(1.08);
  }
  50% {
    filter:
      drop-shadow(0 0  7px rgba(251, 146,  60, 0.90))
      drop-shadow(0 0 14px rgba(251, 146,  60, 0.55))
      brightness(1.13)
      saturate(1.14);
  }
}

.animate-dice-heat { animation: dice-heat 1200ms ease-in-out infinite; }
```

**Design rationale:**  
`drop-shadow` layers create depth (tight core + soft halo). `brightness` lifts the ivory die face slightly so it visually "warms up" without turning orange. `saturate` enhances the existing ivory/cream color so the warm cast reads on the felt without requiring a color change to the die itself.

### 4.2 Tier 3 — On Fire (white-hot core + red outer glow + 60-fps flicker)

```css
@keyframes dice-fire {
  /* Fast irregular flicker — three different intensities */
  0% {
    filter:
      drop-shadow(0 0  3px rgba(255, 255, 180, 0.95))
      drop-shadow(0 0 10px rgba(248, 113, 113, 0.85))
      drop-shadow(0 0 22px rgba(220,  38,  38, 0.50))
      brightness(1.18)
      saturate(1.25)
      contrast(1.06);
  }
  30% {
    filter:
      drop-shadow(0 0  6px rgba(255, 255, 200, 1.00))
      drop-shadow(0 0 14px rgba(248, 113, 113, 1.00))
      drop-shadow(0 0 28px rgba(220,  38,  38, 0.70))
      brightness(1.24)
      saturate(1.35)
      contrast(1.08);
  }
  55% {
    filter:
      drop-shadow(0 0  2px rgba(255, 255, 150, 0.75))
      drop-shadow(0 0  7px rgba(248, 113, 113, 0.65))
      drop-shadow(0 0 16px rgba(220,  38,  38, 0.35))
      brightness(1.10)
      saturate(1.12)
      contrast(1.03);
  }
  80% {
    filter:
      drop-shadow(0 0  5px rgba(255, 255, 200, 0.95))
      drop-shadow(0 0 12px rgba(248, 113, 113, 0.90))
      drop-shadow(0 0 24px rgba(220,  38,  38, 0.60))
      brightness(1.20)
      saturate(1.28)
      contrast(1.07);
  }
  100% {
    filter:
      drop-shadow(0 0  3px rgba(255, 255, 180, 0.95))
      drop-shadow(0 0 10px rgba(248, 113, 113, 0.85))
      drop-shadow(0 0 22px rgba(220,  38,  38, 0.50))
      brightness(1.18)
      saturate(1.25)
      contrast(1.06);
  }
}

.animate-dice-fire { animation: dice-fire 560ms linear infinite; }
```

**Design rationale:**  
Three `drop-shadow` layers = white-hot contact point → red mid-corona → deep-red outer glow. `contrast(1.06)` sharpens the dot pips so they don't get lost in the bright surrounding field. The 560 ms `linear` loop creates the irregular "flame lick" flicker characteristic of real fire (non-symmetrical intensity curve across the keyframes).

### 4.3 HypeFlash Overlay Animations

```css
@keyframes hype-flash-enter {
  0%   { transform: translate(-50%, 24px) scale(0.55); opacity: 0; filter: blur(4px); }
  18%  { transform: translate(-50%, -4px) scale(1.12); opacity: 1; filter: blur(0px); }
  28%  { transform: translate(-50%,  0px) scale(1.00); opacity: 1; filter: blur(0px); }
  75%  { transform: translate(-50%,  0px) scale(1.00); opacity: 1; filter: blur(0px); }
  100% { transform: translate(-50%, -16px) scale(0.90); opacity: 0; filter: blur(2px); }
}

.animate-hype-flash { animation: hype-flash-enter 1600ms cubic-bezier(0.22,1,0.36,1) forwards; }
```

---

## 5. `useParticleEmitter` Hook

**File:** `apps/web/src/hooks/useParticleEmitter.ts`

### 5.1 Position Tracking: `getBoundingClientRect` vs CSS variable

| Approach | Trade-off |
|---|---|
| `getBoundingClientRect` once per rAF | Forces one layout reflow per frame. Trivial cost when batched correctly (read-before-write). Always accurate — returns the *visually transformed* rect. |
| Reconstruct from `--dice-travel` + keyframe math | Zero forced reflows, but requires re-implementing the full multi-axis keyframe interpolation in JavaScript. Fragile: any keyframe edit must be mirrored in JS. |

**Decision: `getBoundingClientRect`, called once at the top of every rAF tick (read phase).**

The browser already computes the composited transform to paint the dice. `getBoundingClientRect` reads that computed value; it does not trigger an extra layout pass when called as the first operation in a rAF callback (before any DOM writes). This is the standard "read-then-write" batching pattern.

### 5.2 Interface

```typescript
// apps/web/src/hooks/useParticleEmitter.ts

interface Particle {
  id:    number;
  x:     number;   // viewport px
  y:     number;   // viewport px
  vx:    number;   // px per frame
  vy:    number;   // px per frame
  life:  number;   // 1.0 → 0; drives alpha and size
  decay: number;   // subtracted from life each frame (~0.035–0.065)
  size:  number;   // spawn radius px
  hue:   number;   // HSL hue, 0–55 (red → orange → warm yellow)
}

/**
 * Manages a canvas-based fire-trail particle system that follows the dice
 * during the throw animation. The caller is responsible for mounting the
 * returned canvas ref as a fixed full-viewport overlay with pointer-events: none.
 *
 * @param diceRef   Ref to the animated dice pair div. Position is sampled via
 *                  getBoundingClientRect() each frame — always accurate under
 *                  CSS transform.
 * @param active    True while fire particles should emit. Set to false when
 *                  throwPhase === 'idle' or the player's streak drops below Tier 3.
 *                  Particles already in flight continue until their life expires
 *                  so there is no pop on deactivation.
 */
export function useParticleEmitter(
  diceRef: React.RefObject<HTMLDivElement | null>,
  active:  boolean,
): React.RefObject<HTMLCanvasElement>
```

### 5.3 Implementation Sketch

```typescript
export function useParticleEmitter(
  diceRef: React.RefObject<HTMLDivElement | null>,
  active:  boolean,
): React.RefObject<HTMLCanvasElement> {

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const particles   = useRef<Particle[]>([]);
  const rafId       = useRef<number>(0);
  const nextId      = useRef(0);
  const lastTime    = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to viewport once. Add resize listener if needed for
    // orientation changes; omit for now (game is portrait-locked).
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function tick(timestamp: number) {
      const dt = Math.min(timestamp - lastTime.current, 50); // cap at 50 ms (tab-hidden guard)
      lastTime.current = timestamp;

      // ── READ (all DOM reads before any writes) ──────────────────────────
      const diceRect = active ? diceRef.current?.getBoundingClientRect() : undefined;

      // ── SPAWN ────────────────────────────────────────────────────────────
      if (active && diceRect) {
        // Emit from the center of each die separately.
        // diceRect spans both dice; split at midpoint for die 1 / die 2.
        const cx1 = diceRect.left + diceRect.width * 0.25;
        const cx2 = diceRect.left + diceRect.width * 0.75;
        const cy  = diceRect.top  + diceRect.height * 0.5;
        for (let i = 0; i < 4; i++) {
          emit(cx1, cy);
          emit(cx2, cy);
        }
      }

      // ── UPDATE ───────────────────────────────────────────────────────────
      const dtFactor = dt / (1000 / 60); // normalise to 60 fps
      for (const p of particles.current) {
        p.x    += p.vx * dtFactor;
        p.y    += p.vy * dtFactor;
        p.vy   -= 0.06 * dtFactor; // slight upward drift (reverse gravity = fire rises)
        p.life -= p.decay * dtFactor;
      }
      particles.current = particles.current.filter((p) => p.life > 0);

      // ── WRITE ────────────────────────────────────────────────────────────
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.globalCompositeOperation = 'lighter'; // additive blend → fire colours add to white
      for (const p of particles.current) {
        ctx!.globalAlpha = p.life * 0.75;
        ctx!.fillStyle   = `hsl(${p.hue}, 100%, ${50 + p.life * 20}%)`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha              = 1;
      ctx!.globalCompositeOperation = 'source-over';

      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]); // re-bind when active toggles so spawn logic updates

  function emit(x: number, y: number) {
    particles.current.push({
      id:    nextId.current++,
      x,
      y:     y + (Math.random() - 0.5) * 6,
      vx:    (Math.random() - 0.5) * 1.6,
      vy:    -(Math.random() * 2.0 + 0.8),
      life:  1.0,
      decay: 0.035 + Math.random() * 0.030,
      size:  3 + Math.random() * 3,
      hue:   Math.random() * 55,         // red (0) → orange → warm yellow (55)
    });
  }

  return canvasRef;
}
```

### 5.4 Performance: Preventing Layout Thrashing

The single rule: **all `getBoundingClientRect` calls happen before any canvas draw calls within the same rAF tick.** The sketch above enforces this via the READ → SPAWN → UPDATE → WRITE section ordering. The browser batches the layout query with its own layout pass, so no extra reflow is triggered.

Additional safeguards:

| Concern | Mitigation |
|---|---|
| Particle array growth | Cull dead particles (life ≤ 0) every frame. Hard cap at 200 particles via `particles.current.length < 200` guard in `emit()`. |
| Tab hidden | Cap `dt` at 50 ms to avoid a particle burst on tab re-focus after a gap. |
| Canvas resize | Resize once on mount. The canvas is `fixed` full-viewport; portrait-locked game means this is safe. Add `ResizeObserver` only if landscape support ships. |
| Low-end devices | Check `navigator.hardwareConcurrency < 4` in the hook init; if true, halve the particles-per-frame count (emit 2 instead of 4 per die). |
| Inactive loop cost | When `active` is false, the rAF loop continues but skips the emit and `getBoundingClientRect` steps. It still clears the canvas and draws in-flight particles until they expire, then costs only `clearRect` each frame. This avoids a pop when deactivating mid-flight. Alternatively, cancel the rAF when `particles.current.length === 0 && !active` and restart on next `active = true`. |

---

## 6. `HypeFlash` Component

**File:** `apps/web/src/components/HypeFlash.tsx`

### 6.1 Props

```typescript
interface HypeFlashProps {
  tier: 'heating-up' | 'on-fire';
  /**
   * Used as the React key by the parent — not a prop inside HypeFlash itself.
   * Incrementing the key remounts the component so the CSS animation re-fires
   * on back-to-back hits without needing internal state.
   */
}
```

### 6.2 Implementation Sketch

```tsx
export const HypeFlash: React.FC<HypeFlashProps> = ({ tier }) => {
  const isOnFire = tier === 'on-fire';

  return (
    <div
      className={[
        'fixed left-1/2 z-50 pointer-events-none select-none',
        'animate-hype-flash',
      ].join(' ')}
      style={{ bottom: 'clamp(72px, 12dvh, 100px)' }}
    >
      <span
        className={[
          'font-pixel tracking-widest',
          isOnFire
            ? 'text-[clamp(20px,4dvw,28px)] text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.9)]'
            : 'text-[clamp(16px,3.2dvw,22px)] text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]',
        ].join(' ')}
      >
        {isOnFire ? 'ON FIRE!' : 'HEATING UP!'}
      </span>
    </div>
  );
};
```

The component has no internal state — it is stateless. The parent mounts it via `key={_hypeFlashKey}`, and the CSS animation (`hype-flash-enter`) runs to completion and stops (`forwards` fill). The parent clears `hypeFlash` from the store after the animation duration via a `useEffect` timeout so the overlay node is unmounted after ~1600 ms.

### 6.3 Placement

`HypeFlash` should be rendered in **`TableBoard`** (the parent of `DiceZone`), not inside `DiceZone` itself. The fixed positioning makes the mount location irrelevant for visuals, but keeping it in `TableBoard` ensures it unmounts when the table unmounts (transition phases), avoiding a stale overlay during celebrations.

```tsx
// In TableBoard.tsx — alongside the existing screen-flash overlay:
{hypeFlash !== null && (
  <HypeFlashClearer key={_hypeFlashKey} tier={hypeFlash} />
)}
```

Where `HypeFlashClearer` is a thin wrapper that:
1. Renders `<HypeFlash tier={tier} />`
2. In a `useEffect`, calls `clearHypeFlash()` after 1600 ms

Or inline with a local `useEffect`:

```tsx
// In TableBoard, consume hypeFlash from store:
const hypeFlash    = useGameStore((s) => s.hypeFlash);
const _hypeFlashKey = useGameStore((s) => s._hypeFlashKey);
const clearHypeFlash = useGameStore((s) => s.clearHypeFlash);

useEffect(() => {
  if (!hypeFlash) return;
  const t = setTimeout(clearHypeFlash, 1600);
  return () => clearTimeout(t);
}, [_hypeFlashKey, hypeFlash, clearHypeFlash]);
```

### 6.4 `clearHypeFlash` Store Action

Add to `GameActions`:

```typescript
/** Clears the hypeFlash state after the overlay animation completes. */
clearHypeFlash(): void;
```

Implementation:

```typescript
clearHypeFlash() {
  set({ hypeFlash: null });
},
```

---

## 7. `DiceZone` Changes

### 7.1 Derive tier and consume store fields

```typescript
// Add to existing store subscriptions in DiceZone:
const hype               = useGameStore(selectHypeTier);        // 0 | 2 | 3
const consecutiveHits    = useGameStore((s) => s.consecutivePointHits);
```

### 7.2 Dice-pair filter class

Replace the existing `diceAnimClass()` composition block so the filter class is layered on top:

```typescript
function diceFilterClass(): string {
  if (hypeTier === 3) return 'animate-dice-fire';
  if (hypeTier === 2) return 'animate-dice-heat';
  return '';
}
```

Apply to the dice pair div:

```tsx
<div
  ref={dicePairRef}
  className={[
    'flex gap-4 items-center',
    diceAnimClass(),
    diceExtraClass,
    diceFilterClass(),           // ← new
    throwPhase !== 'idle' ? 'relative z-10' : '',
  ].join(' ')}
  onAnimationEnd={...}
>
```

> **Conflict note:** `diceExtraClass` applies `animate-dice-gold-glow` on `POINT_HIT`. Both `dice-gold-glow` and `dice-heat`/`dice-fire` animate the `filter` property. CSS will apply the *last* class that sets the property. To resolve, `diceExtraClass` should be applied directly to the individual `<Die>` elements rather than the pair div — or use inline style for the glow so filter precedence is explicit. This is a two-line refactor within the existing `onLandEnd` callback; details deferred to implementation.

### 7.3 Particle canvas

```typescript
// Add near the top of DiceZone:
const fireActive = hypeTier === 3 && throwPhase !== 'idle';
const particleCanvasRef = useParticleEmitter(dicePairRef, fireActive);
```

Mount the canvas as a fixed viewport overlay **inside** the DiceZone return, but because it uses `position: fixed` it will render above everything:

```tsx
{/* Particle canvas — fixed full-viewport, pointer-events: none */}
{hypeTier === 3 && (
  <canvas
    ref={particleCanvasRef}
    className="fixed inset-0 z-40 pointer-events-none"
    style={{ mixBlendMode: 'screen' }}
  />
)}
```

`mixBlendMode: screen` is an additional blending layer applied by the compositing engine on top of the canvas's own `ctx.globalCompositeOperation = 'lighter'`. Between the two, fire particles will brighten the felt background convincingly without requiring a separate translucent background layer.

---

## 8. Synchronization Flow (End-to-End)

```
Player rolls dice
  │
  ├─ throwPhase → 'throwing' (CSS animation starts)
  │   └─ fireActive = (hypeTier === 3) → particle emitter begins
  │
  ├─ throwPhase → 'tumbling' / 'landing'
  │   └─ particles continue trailing the die rects
  │
  └─ onLandEnd() fires
      ├─ throwPhase → 'result'  (POINT HIT popup appears)
      └─ [2000 ms later] throwPhase → 'result-out'
            └─ applyPendingSettlement() called ← THE REVEAL MOMENT
                  │
                  ├─ newConsecutivePointHits computed from payload
                  ├─ hypeFlash = 'heating-up' | 'on-fire' | null
                  ├─ _hypeFlashKey++  (if flash)
                  ├─ flashType, bankroll, bets, hype, etc. all applied atomically
                  └─ HypeFlash mounts (key=_hypeFlashKey), TableBoard clears after 1600 ms

  throwPhase → 'idle'
    └─ fireActive = false → particle emitter stops spawning; in-flight particles expire naturally
```

This guarantees:
1. The "HEATING UP!" / "ON FIRE!" announcement appears **after** the player has seen the result popup, not during the suspense window.
2. The fire-trail particles are visible **during the throw arc**, where they look most dramatic.
3. The persistent CSS filter glow on the dice at rest is always present when `hypeTier >= 2`, giving continuous visual feedback even between rolls.

---

## 9. File Change Summary

| File | Change |
|---|---|
| `apps/web/src/store/useGameStore.ts` | Add `hypeFlash`, `_hypeFlashKey` to `GameState`; add `clearHypeFlash` to `GameActions`; populate in `applyPendingSettlement`; zero in `connectToRun`/`disconnect`; add `selectHypeTier` selector |
| `apps/web/src/index.css` | Add `@keyframes dice-heat`, `@keyframes dice-fire`, `@keyframes hype-flash-enter`; add `.animate-dice-heat`, `.animate-dice-fire`, `.animate-hype-flash` |
| `apps/web/src/hooks/useParticleEmitter.ts` | New file — full hook implementation |
| `apps/web/src/components/HypeFlash.tsx` | New file — overlay component |
| `apps/web/src/components/DiceZone.tsx` | Add `diceFilterClass()`, mount `<canvas ref={particleCanvasRef}>`, consume `selectHypeTier` |
| `apps/web/src/components/TableBoard.tsx` | Subscribe to `hypeFlash`/`_hypeFlashKey`; render `<HypeFlash>`; call `clearHypeFlash` via `useEffect` timeout |

---

## 10. Out of Scope

- **Audio:** A "sizzle" or crowd-cheer sting on hype tier entry is a natural companion but belongs in a separate audio backlog item. The existing `useCrowdAudio` hook's `flashType` pathway would be the integration point.
- **Tier 1 (first hit):** A subtle single drop-shadow pulse on the very first consecutive hit (1 hit) is possible with a one-shot animation class but was not requested. Revisit during implementation if the jump from Tier 0 to Tier 2 feels abrupt.
- **Mobile/low-power:** The particle emitter performance note (halve spawn rate on `hardwareConcurrency < 4`) is documented but not fully specced. Validate on the target device during implementation.
- **`diceExtraClass` filter conflict:** The gold-glow micro-animation on `POINT_HIT` uses the same `filter` CSS property. Full resolution is deferred to implementation; the recommended fix (move `diceExtraClass` to individual `<Die>` elements) is a small surgical change.
