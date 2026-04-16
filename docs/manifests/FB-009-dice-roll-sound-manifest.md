# FB-009 Implementation Manifest: Dice Roll Sound Effect

This manifest breaks down the implementation of the procedural dice roll audio effect into surgical, isolated steps designed for execution via Claude Code CLI.

---

### Step 1: State Wiring (The Trigger)

**Goal:** Introduce a monotonic counter to the game store that increments exactly once per roll. This provides a clean dependency for the audio hook to watch, avoiding double-fires that could happen if we watched the `isRolling` boolean directly.

**Files to Read:** * `@apps/web/src/store/useGameStore.ts`

**CLI Prompt:**
```text
Open @apps/web/src/store/useGameStore.ts and make the following surgical additions:
1. In the `GameState` interface, add `_rollKey: number;`
2. In the initial state object, add `_rollKey: 0,`
3. Inside the `rollDice` action, find the `set((state) => ({ ... }))` block that sets `isRolling: true`. Add `_rollKey: state._rollKey + 1` to that exact state update. 
Do not modify any other logic or formatting.
```

---

### Step 2: Audio Synthesis & Hook Trigger

**Goal:** Build the procedural audio synthesis for the dice rattle (two soft bandpass-filtered noise bursts) and wire it to fire whenever the new `_rollKey` increments.

**Files to Read:** * `@apps/web/src/hooks/useCrowdAudio.ts`
* `@apps/web/src/store/useGameStore.ts` (read-only for the hook)

**CLI Prompt:**
```text
Open @apps/web/src/hooks/useCrowdAudio.ts and make the following changes:
1. Import `useGameStore` from `../store/useGameStore.js` at the top of the file.
2. Above the `useCrowdAudio` hook, create a new standalone function `const playDiceRattle = (ctx: AudioContext) => { ... }`. 
3. Inside `playDiceRattle`, reuse the existing `makeNoiseBuf(ctx)` logic to create two soft, bandpass-filtered noise bursts (center freq ~800Hz) to simulate wooden dice hitting felt. Each burst should be ~80ms long, with a ~40ms gap between them. Apply a gain envelope with a fast attack and gentle decay.
4. Inside the `useCrowdAudio` hook body, add `const _rollKey = useGameStore((s) => s._rollKey);`.
5. Add a new `useEffect` that depends on `_rollKey`. Inside it, check if `_rollKey > 0`, `!mutedRef.current`, and `audioCtxRef.current` exists. If all are true, execute `playDiceRattle(audioCtxRef.current)`.
Do not touch the existing cheer/groan synthesis functions or the mute toggle logic.
```

# FB-009 Implementation Manifest: Packaged Dice Audio (WAV)

This manifest replaces the procedural audio synthesis with a high-fidelity Buffer Source implementation, randomly selecting between two audio samples to prevent ear fatigue.

---

### Step 1: Audio Buffer Implementation

**Goal:** Rip out the procedural noise math and replace it with a loader that fetches `/audio/dice-roll-1.wav` and `/audio/dice-roll-2.wav`, decodes them into memory, and plays one at random when triggered.

**Files to Read:** * `@apps/web/src/hooks/useCrowdAudio.ts`

**CLI Prompt:**
```text
Open @apps/web/src/hooks/useCrowdAudio.ts and completely replace the procedural `playDiceRattle` function with a Buffer Source implementation. 
Apply the following exact changes:
1. Above the hook, declare a cache for the audio: `let diceBuffers: AudioBuffer[] = [];`
2. Create a new async loader function `loadDiceAudio = async (ctx: AudioContext)`:
   - If `diceBuffers.length > 0`, return early.
   - Fetch both `/audio/dice-roll-1.wav` and `/audio/dice-roll-2.wav`.
   - Convert both responses to array buffers and decode them using `ctx.decodeAudioData()`.
   - Push both decoded buffers into the `diceBuffers` array.
3. Rewrite the `playDiceRattle = async (ctx: AudioContext)` function:
   - First, `await loadDiceAudio(ctx);`
   - Select a random buffer from `diceBuffers` using `Math.random()`.
   - Create a source: `const source = ctx.createBufferSource();`
   - Assign the buffer: `source.buffer = selectedBuffer;`
   - Connect it: `source.connect(ctx.destination);`
   - Play it: `source.start(0);`
Do not modify the `useEffect` trigger watching `_rollKey` or any otheroffice

# FB-009 Implementation Manifest: Dice Audio Timing Fix

### Step 1: Delay Audio Playback to Sync with Wall Impact

**Goal:** Delay the playback of the `.wav` file by exactly 720ms so that the sound effect begins exactly when the CSS `dice-throw` animation reaches the back wall, rather than playing in the air during the throw.

**Files to Read:** * `@apps/web/src/hooks/useCrowdAudio.ts`

**CLI Prompt:**
```text
Open @apps/web/src/hooks/useCrowdAudio.ts and update the `playDiceRattle` function to delay playback.
Apply the following exact change:
1. Find the line where the audio source is started: `source.start(0);`
2. Change this to start exactly 720ms in the future using the audio context's current time: `source.start(ctx.currentTime + 0.72);`
3. Add a brief comment above it noting that 0.72s syncs with the `dice-throw` CSS animation duration.
Do not modify the audio loader or any other hooks in the file.