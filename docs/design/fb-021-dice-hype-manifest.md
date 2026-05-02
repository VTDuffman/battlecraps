# Implementation Manifest — FB-021 — NBA Jam Style Dice Hype Visualization

## Step 1: Global Styles & Animations
**Goal:** Add the core CSS keyframes for the "Heating Up", "On Fire" effects, and the retro UI flash overlay.
**Files:** `@apps/web/src/index.css`

**Prompt:**
Please update `@apps/web/src/index.css` to include the following animation keyframes and utility classes at the bottom of the file:
1. Add `@keyframes dice-heat` that pulses `filter: drop-shadow(...) brightness(...) saturate(...)` with an orange cast to simulate heating up.
2. Add `@keyframes dice-fire` that has a rapid, irregular 5-stage flicker of intense red/yellow drop-shadows and contrast bumps to simulate fire.
3. Add `@keyframes hype-flash-enter` that scales down from 1.12 to 1.0, holds, then scales to 0.90 while fading out, applying a slight blur at start and end.
4. Add the corresponding utility classes:
   - `.animate-dice-heat` (animation: dice-heat 1200ms ease-in-out infinite)
   - `.animate-dice-fire` (animation: dice-fire 560ms linear infinite)
   - `.animate-hype-flash` (animation: hype-flash-enter 1600ms cubic-bezier(0.22,1,0.36,1) forwards)

---

## Step 2: Store State & Hype Tier Logic
**Goal:** Track the ephemeral HypeFlash state, trigger it at the exact moment of roll reveal, and expose a tier selector.
**Files:** `@apps/web/src/store/useGameStore.ts`

**Prompt:**
Please update `@apps/web/src/store/useGameStore.ts`:
1. In the `GameState` interface, add `hypeFlash: 'heating-up' | 'on-fire' | null;` and `_hypeFlashKey: number;`.
2. Initialize `hypeFlash: null` and `_hypeFlashKey: 0` in the `create` default values block.
3. In `GameActions`, add `clearHypeFlash(): void;`. Implement it to `set({ hypeFlash: null });`.
4. Inside `connectToRun` and `disconnect`, reset `hypeFlash: null` and `_hypeFlashKey: 0`.
5. Inside `applyPendingSettlement`, before the `set` call, calculate `flashTier`: if `p.rollResult === 'POINT_HIT'`, check `p.newConsecutivePointHits`. If >= 4, it's `'on-fire'`; if >= 2, it's `'heating-up'`. Otherwise `null`.
6. Add `hypeFlash: flashTier` and `_hypeFlashKey: flashTier !== null ? _hypeFlashKey + 1 : _hypeFlashKey` in the `set` call body.
7. At the very bottom of the file, export a new selector:
   `export const selectHypeTier = (s: GameState): 0 | 2 | 3 => s.consecutivePointHits >= 4 ? 3 : s.consecutivePointHits >= 2 ? 2 : 0;`

---

## Step 3: High-Performance Particle Emitter
**Goal:** Create a hook to manage an HTML Canvas 2D particle system that tracks the DOM position of the animated dice in real-time.
**Files:** `@apps/web/src/hooks/useParticleEmitter.ts`

**Prompt:**
Create a new file `@apps/web/src/hooks/useParticleEmitter.ts`.
Implement and export `function useParticleEmitter(diceRef: React.RefObject<HTMLDivElement | null>, active: boolean): React.RefObject<HTMLCanvasElement>`.
Requirements:
1. Return a `canvasRef` pointing to an HTMLCanvasElement.
2. Setup a `useEffect` depending on `active` that runs a `requestAnimationFrame` loop.
3. Size the canvas width/height to `window.innerWidth`/`window.innerHeight` on mount.
4. Inside the rAF tick:
   - Cap `dt` (delta time) at 50ms.
   - READ: Call `active ? diceRef.current?.getBoundingClientRect() : undefined` before any canvas writes.
   - SPAWN: If active and the rect exists, emit 4 particles per die (using the 25% and 75% horizontal marks of the rect for centers).
   - UPDATE: Apply gravity (upward drift), horizontal velocity, and decay to `p.life`. Filter out dead particles (`life <= 0`).
   - WRITE: `clearRect`, set `ctx.globalCompositeOperation = 'lighter'`, and draw overlapping `arc`s based on `p.x, p.y, p.size, p.life, p.hue`.

---

## Step 4: The HypeFlash UI Component
**Goal:** Build the stateless retro overlay component that flashes across the screen when crossing a tier.
**Files:** `@apps/web/src/components/HypeFlash.tsx`

**Prompt:**
Create a new file `@apps/web/src/components/HypeFlash.tsx`.
Implement and export `const HypeFlash: React.FC<{ tier: 'heating-up' | 'on-fire' }>`.
Requirements:
1. Return a `div` wrapper with classes: `fixed left-1/2 z-50 pointer-events-none select-none animate-hype-flash`.
2. Position it via inline style: `style={{ bottom: 'clamp(72px, 12dvh, 100px)' }}`.
3. Inside the div, render a `span` with `font-pixel tracking-widest`.
4. If tier is `'on-fire'`, render "ON FIRE!" with larger text (`text-[clamp(20px,4dvw,28px)]`), `text-red-400`, and a heavy red drop-shadow.
5. If tier is `'heating-up'`, render "HEATING UP!" with slightly smaller text (`text-[clamp(16px,3.2dvw,22px)]`), `text-orange-400`, and an orange drop-shadow.

---

## Step 5: Integrating HypeFlash into the Table Board
**Goal:** Mount the HypeFlash at the board level so it persists correctly over the dice zone and clears itself automatically.
**Files:** `@apps/web/src/components/TableBoard.tsx`

**Prompt:**
Update `@apps/web/src/components/TableBoard.tsx` to integrate the new HypeFlash overlay:
1. Import `HypeFlash` and `useGameStore`.
2. Inside `TableBoard`, use selectors to extract `hypeFlash`, `_hypeFlashKey`, and `clearHypeFlash` from the game store.
3. Add a `useEffect` that checks if `hypeFlash` is truthy. If it is, set a `setTimeout` to call `clearHypeFlash()` after `1600ms`. Ensure the timeout is cleared on cleanup.
4. In the JSX return, render `{hypeFlash !== null && <HypeFlash key={_hypeFlashKey} tier={hypeFlash} />}` as a top-level child of the main container (e.g., alongside the existing screen-flash div).

---

## Step 6: Upgrading the DiceZone with Visual Tiers
**Goal:** Apply the CSS filters and mount the Canvas particle overlay to the actual dice.
**Files:** `@apps/web/src/components/DiceZone.tsx`

**Prompt:**
Update `@apps/web/src/components/DiceZone.tsx` to wire up the new hype visuals:
1. Import `selectHypeTier` from `../store/useGameStore.js` and `useParticleEmitter` from `../hooks/useParticleEmitter.js`.
2. In the component, call `const hypeTier = useGameStore(selectHypeTier);`.
3. Compute `const fireActive = hypeTier === 3 && throwPhase !== 'idle';`.
4. Setup the particle canvas: `const particleCanvasRef = useParticleEmitter(dicePairRef, fireActive);`.
5. Create a local function `diceFilterClass()` that returns `'animate-dice-fire'` if `hypeTier === 3`, `'animate-dice-heat'` if `hypeTier === 2`, and `''` otherwise.
6. In the JSX, add `diceFilterClass()` to the `className` array of the `div` referencing `dicePairRef`.
7. Move `diceExtraClass` out of that `dicePairRef` wrapper div and instead pass it directly to the child `<Die>` components (to prevent CSS `filter` collision between the heat effect and the gold glow).
8. Render the particle canvas inside the root `relative` container div, positioned behind everything else: `{hypeTier === 3 && <canvas ref={particleCanvasRef} className="fixed inset-0 z-40 pointer-events-none" style={{ mixBlendMode: 'screen' }} />}`.