# BattleCraps Tutorial: Implementation Manifest (Path B & Polish)

*Note: To maximize token efficiency, run `/clear` or `/compact` in your Claude Code CLI between each step.*

### Step 1: Append Path B Beats Data
**Goal:** Add the BattleCraps mechanics (Marker, Hype, Crew, Boss) into the beat sequence. Because we previously modified Path A to end with the "Big Win" on Beat 9, we need to append these as Beats 10-13 and shift the `/pub` redirect to the very end of Path B.
**Files to Read:** `apps/web/src/lib/tutorialBeats.ts`

**Prompt:**
> I need to add the Path B (BattleCraps Module) beats to the tutorial sequence.
> 
> 1. Append four new beats to the `TUTORIAL_BEATS` array with `path: 'B'`. 
> 2. Assign them IDs 10, 11, 12, and 13.
> 3. Beat 10: `spotlight: 'marker-progress'`, `advanceMode: 'tap'`, `salText` explains the $300 marker target.
> 4. Beat 11: `spotlight: 'hype-meter'`, `advanceMode: 'animated'`, `salText` explains the Hype multiplier.
> 5. Beat 12: `spotlight: 'crew-rail'`, `advanceMode: 'animated'`, `salText` explains Crew abilities.
> 6. Beat 13: `spotlight: 'boss-portrait'`, `advanceMode: 'tap'`, `salText` explains Floor Bosses. Add `advanceLabel: 'TO THE PUB!'`.
> 7. Modify the existing Beat 9 (the Hard 8 win): Change its `advanceLabel` from 'TO THE PUB!' back to 'Got it.', so the flow naturally continues into Path B for players who selected 'SHOW ME EVERYTHING'.

---

### Step 2: Implement Fake Visual Overlays for Path B
**Goal:** Beats 11 and 12 use the `animated` mode, which holds the CTA disabled for a few seconds. During this time, we need to render fake visual representations of the Hype Meter and Crew bark over the darkened board, without touching the real game store.
**Files to Read:** `apps/web/src/components/tutorial/TutorialOverlay.tsx`

**Prompt:**
> I need to add visual overlays for the Path B animated beats.
> 
> 1. Inside `TutorialOverlay.tsx`, locate the JSX block where `isSimulatedRoll` and `isBossPortrait` are handled.
> 2. Add a new conditional render block for `currentBeat.spotlight === 'hype-meter'`. Render a stylized, absolute-positioned fake Hype Thermometer that uses CSS to visually animate from 1.0x to 1.10x over 2 seconds. Position it near the spotlightRect.
> 3. Add another conditional render block for `currentBeat.spotlight === 'crew-rail'`. Render a fake Crew Portrait (e.g., 'The Lookout') inside the spotlighted area. Include a CSS-animated cascade popup `div` that floats up saying '+$25 BONUS' over 2 seconds.
> 4. Do not modify or import the Zustand store for these visuals; they must be standalone UI elements tied strictly to the `currentBeat.spotlight` value.

---

### Step 3: API Completion Tracking (T-007)
**Goal:** Wire up the backend completion flag so players don't see the tutorial gate on subsequent logins.
**Files to Read:** `apps/web/src/components/tutorial/TutorialOverlay.tsx`, `apps/web/src/components/tutorial/KnowledgeGate.tsx`

**Prompt:**
> I need to wire up the API completion tracking for the tutorial.
> 
> 1. In `TutorialOverlay.tsx`, locate the `advance` function. Inside the block where `nextIndex >= beats.length` (the closing sequence), add a fire-and-forget fetch call: `void fetch('/api/v1/auth/tutorial-complete', { method: 'POST' });`.
> 2. Still in `TutorialOverlay.tsx`, locate the `onSkip` handler (or where the skip button calls the `onSkip` prop) and add the exact same fetch call before the prop is invoked.
> 3. In `KnowledgeGate.tsx`, locate the `onSkip` handler and add the exact same fetch call so skipping the gate permanently marks the tutorial as complete.

---

### Step 4: In-Game "How To Play" Button (T-007)
**Goal:** Allow players to access the static reference screen (which we built in T-002) at any time during a live run without losing their game state.
**Files to Read:** `apps/web/src/components/TableBoard.tsx`

**Prompt:**
> I need to add an in-game 'How To Play' access button.
> 
> 1. In `TableBoard.tsx`, add a new local state `showHowToPlay` defaulting to false.
> 2. Render a small '?' or 'HOW TO PLAY' button in the UI (position it near the top nav or mute toggle).
> 3. Add an `onClick` handler to set `showHowToPlay` to true.
> 4. Conditionally render `<HowToPlayScreen onClose={() => setShowHowToPlay(false)} />` at the bottom of the component if `showHowToPlay` is true. Ensure it is rendered in a full-screen overlay container with a high z-index so it covers the table entirely.