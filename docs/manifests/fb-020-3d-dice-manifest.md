# Implementation Manifest: FB-020 — 3D Physics Dice Animation

## Step 1: Package Dependencies & Type Definitions
**Goal:** Add the necessary Three.js and Cannon.js libraries to the web app.
**Files:**
- `@apps/web/package.json`

**Prompt:**
Update the dependencies in the `apps/web/package.json` file.
Add `"three": "^0.165.0"`, `"@react-three/fiber": "^8.17.0"`, and `"@react-three/cannon": "^6.6.0"` to the `dependencies` block.
Add `"@types/three": "^0.165.0"` to the `devDependencies` block.
Do not make any other changes to the file.

--- Implemented ---

## Step 2: Texture Generation & Quaternion Utilities
**Goal:** Create pure JavaScript utilities to programmatically draw the dice pips and define the canonical "Face Up" quaternions for late-snapping.
**Files:**
- (New files in `@apps/web/src/components/dice/`)

**Prompt:**
Create two new files in a new directory: `apps/web/src/components/dice/`.

1. Create `faceQuaternions.ts`. Export a record `FACE_UP_QUATERNIONS` mapping numbers 1-6 to `THREE.Quaternion` objects (1: identity, 2: -90° Z, 3: -90° X, 4: +90° X, 5: +90° Z, 6: 180° X). Export a function `buildTargetQuaternion(faceValue: number, randomYaw: THREE.Quaternion): THREE.Quaternion` that multiplies the randomYaw by the appropriate face quaternion.

2. Create `createFaceTexture.ts`. Export a function `createFaceTexture(value: number, isLocked: boolean): THREE.CanvasTexture`. It should create a 128x128 canvas, draw a rounded rectangle background (color `#b0b0b0` if locked, `#e8dcc8` if normal), and draw circular pips (color `#444444` if locked, `#1a0a00` if normal) according to standard Western die pip layouts. Return a `new THREE.CanvasTexture(canvas)`.

--- Implemented --- 

## Step 3: Physics Boundaries
**Goal:** Construct the invisible physical container (floor and walls) for the Cannon.js simulation.
**Files:**
- `@apps/web/src/components/dice/PhysicsBoundaries.tsx` (New file)

**Prompt:**
Create a new file `apps/web/src/components/dice/PhysicsBoundaries.tsx`.

Import `usePlane` from `@react-three/cannon`. Export a single component `PhysicsBoundaries` that renders the following invisible collision planes using `usePlane`:
1. `Floor`: type 'Static', position `[0, -1.0, 0]`, rotation `[-Math.PI / 2, 0, 0]`, material `{ friction: 0.55, restitution: 0.35 }`.
2. `WallBack`: type 'Static', position `[0, 0, -3.5]`, rotation `[0, 0, 0]`.
3. `WallLeft`: type 'Static', position `[-3, 0, 0]`, rotation `[0, Math.PI / 2, 0]`.
4. `WallRight`: type 'Static', position `[3, 0, 0]`, rotation `[0, -Math.PI / 2, 0]`.

All planes should return `null` so they do not render visually.

--- Implemented --- 

## Step 4: The 3D Die Component (Physics & Late-Snap)
**Goal:** Build the single die mesh, map the textures to its 6 faces, and implement the imperative physics throw and late-snap `useFrame` logic.
**Files:**
- `@apps/web/src/components/dice/Die.tsx` (New file)
- `@apps/web/src/components/dice/faceQuaternions.ts` (Read)
- `@apps/web/src/components/dice/createFaceTexture.ts` (Read)

**Prompt:**
Create `apps/web/src/components/dice/Die.tsx`.

Export a `Die` component that takes props: `index` (0 or 1), `throwPhase` (string), `targetValue` (number | null), `isLocked` (boolean), `onWallHit` (function), and `onLanded` (function).

1. Use `useBox` from `@react-three/cannon` (mass 0.1, box size [1,1,1], material matching the floor).
2. Use `createFaceTexture` to memoize the 6 `MeshStandardMaterial` textures based on `isLocked` and apply them to the mesh. Clean up textures on unmount.
3. In a `useEffect` watching `throwPhase`: if phase becomes 'throwing', reset the die to a spawn position based on its `index`, assign a random starting rotation, and apply a forward `velocity` + random `angularVelocity` impulse using the cannon `api`. Set a `randomYaw` ref using a random rotation around the Y axis.
4. In `useFrame`: track the physics velocity. If phase is 'throwing' and the die crosses z < -2.5, call `onWallHit` exactly once. If phase is 'landing', velocity < 0.05 m/s, and a `targetValue` exists, calculate the target quaternion using `buildTargetQuaternion`, kill velocity, and use `slerpQuaternions` over 80ms to snap the die to the target. Call `onLanded` when the slerp finishes.

--- Implemented ---

## Step 5: The DiceCanvas Scene Wrapper
**Goal:** Set up the R3F `<Canvas>`, lights, camera, and state coordination gate for the two dice.
**Files:**
- `@apps/web/src/components/dice/DiceCanvas.tsx` (New file)
- `@apps/web/src/components/dice/Die.tsx` (Read)
- `@apps/web/src/components/dice/PhysicsBoundaries.tsx` (Read)

**Prompt:**
Create `apps/web/src/components/dice/DiceCanvas.tsx`.

Export a `DiceCanvas` component taking props: `throwPhase`, `targetDice` (array of 2 numbers or null), `mechanicFreeze` (object or null), `diceExtraClass`, `onWallHit`, and `onBothLanded`.

Render an R3F `<Canvas>` with `frameloop={throwPhase === 'idle' ? 'demand' : 'always'}`, `shadows`, `dpr={[1, 2]}`, and a fixed camera at `[0, 3.5, 5]` looking at `[0,0,0]`.
Add `<ambientLight intensity={0.55} />` and a directional light with shadows.
Wrap the scene in `<Physics gravity={[0, -30, 0]}>`.
Render `<PhysicsBoundaries />` and two `<Die>` components.

Coordinate `onWallHit`: only fire the parent prop the FIRST time a die calls it per throw.
Coordinate `onBothLanded`: only fire the parent prop when BOTH dice have called their landed callback.
Pass `mechanicFreeze.lockedValue` to die 0 if `mechanicFreeze` is active.

--- Implemented --- 

## Step 6: CSS Animation Deletion
**Goal:** Strip out the old 2D CSS animations to prevent conflicting animation loops and save bundle size.
**Files:**
- `@apps/web/src/index.css`

**Prompt:**
Modify `apps/web/src/index.css`.

Find and carefully delete the three keyframe blocks: `@keyframes dice-throw`, `@keyframes dice-tumble`, and `@keyframes dice-land`.
Also delete their corresponding utility classes: `.animate-dice-throw`, `.animate-dice-tumble`, and `.animate-dice-land`.

Do NOT delete `dice-converge`, `dice-gold-glow`, `point-ring-set`, `point-ring-hit`, or any of the flash/popup animations.

--- Implemented ---

## Step 7: DiceZone Integration & DOM Cleanup
**Goal:** Inject the `DiceCanvas` into the main application UI, connect it to Zustand state, and remove the legacy interval flipping logic.
**Files:**
- `@apps/web/src/components/DiceZone.tsx`
- `@apps/web/src/components/dice/DiceCanvas.tsx` (Read)

**Prompt:**
Modify `apps/web/src/components/DiceZone.tsx`.

1. Delete the `displayDice` state, the `flipInterval` ref, the `startFlip` function, the `clearFlip` function, and the `randomDie` helper.
2. Delete the `diceAnimClass` function entirely.
3. Delete the `--dice-travel` pixel measurement logic inside the throw-triggering effects.
4. Remove `perspective: 500px` from the main container.
5. In the JSX, delete the `dicePairRef` div and the legacy `Die` / `DiePlaceholder` components.
6. Replace that removed block with a new wrapper: `<div className={['relative flex-1 flex items-center justify-center', diceExtraClass].join(' ')} style={{ minHeight: 'clamp(120px, 22dvh, 180px)' }}>`.
7. Inside that wrapper, render `<DiceCanvas />`, passing `throwPhase`, `targetDice={throwPhase === 'idle' ? (lastDice ?? null) : pendingDice.current}`, `mechanicFreeze`, `diceExtraClass`, `onWallHit={onThrowEnd}`, and `onBothLanded={onLandEnd}`. Ensure `ResultPopup` stays beneath it in the markup but physically positioned over it via its existing z-index.

---Implemented ---