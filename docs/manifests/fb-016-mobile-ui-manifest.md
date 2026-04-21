# FB-016 Implementation Manifest (V2): Mobile-First UI/UX & Readability Overhaul

---

## Phase 1: Foundation (Typography & Config)

### Step 1.1: Font Imports & Tailwind Configuration
**Goal:** Inject the new Space Grotesk font into the application and configure the Tailwind utilities required for the global readability sweep.

**Files to Read:** * `@apps/web/index.html`
* `@apps/web/tailwind.config.ts`
* `@apps/web/src/index.css`

**CLI Prompt:**
```text
Open the following files and apply these exact changes:
1. In @apps/web/index.html: Add the Google Fonts import for Space Grotesk `<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">` inside the `<head>`.
2. In @apps/web/tailwind.config.ts: Add a new `dense` key to the `fontFamily` object configured as `['"Space Grotesk"', 'sans-serif']`.
3. In @apps/web/src/index.css: Add a new utility class `.text-shadow-hard { text-shadow: 1px 1px 0px #000; }` under the `@layer utilities` directive.
Do not modify any other configuration settings.
```[Implemented]

---

## Phase 2: The Roll Log Drawer

### Step 2.1: Rewrite RollLog Component
**Goal:** Convert the static, floating Roll Log into a mobile-friendly Bottom Sheet and correctly place the tutorial spotlight target.

**Files to Read:** * `@apps/web/src/components/RollLog.tsx`

**CLI Prompt:**
```text
Open @apps/web/src/components/RollLog.tsx and rewrite it into a Bottom Sheet Drawer.
Apply the following exact changes:
1. Add local state `const [isOpen, setIsOpen] = useState(false);`. Add a `forceOpen` prop that overrides this state if provided.
2. Render a "View Log" trigger button. Style it to be highly visible (solid background, `font-dense`).
3. Render the main log history panel conditionally (or via CSS transform translating it off-screen) when `isOpen` or `forceOpen` is true. 
4. The history panel must have a fully opaque background (e.g., `bg-felt-dark`), a top border, and occupy the bottom 60% of the screen.
5. CRITICAL: Add the attribute `data-tutorial-zone="roll-log"` specifically to the scrollable history panel container (the drawer body), NOT to the trigger button.
6. Update all text elements inside the log to use the new `font-dense` Tailwind class instead of the pixel fonts. Remove any `text-white/30` or low-opacity classes and replace them with solid colors.
```[Implemented]

### Step 2.2: Reposition in TableBoard
**Goal:** Adjust the mounting point of the RollLog in the main layout so the new trigger button sits cleanly above the Crew Portraits.

**Files to Read:** * `@apps/web/src/components/TableBoard.tsx`

**CLI Prompt:**
```text
Open @apps/web/src/components/TableBoard.tsx and reposition the RollLog component.
Apply the following exact changes:
1. Locate the `<RollLog />` component injection point.
2. Move it so that the "View Log" trigger is anchored between the Dice Zone and the Crew Rail (e.g., just above the `<section aria-label="Crew portraits">`).
3. Ensure its container has `z-index` properties that allow the expanded drawer to overlay the table, but prevent the collapsed trigger from obscuring the crew portraits.
```[Implemented]
---

## Phase 3: The Tutorial Wiring

### Step 3.1: Update Types and Context
**Goal:** Expand the Tutorial definitions and Context provider to support forcing the Roll Log open during specific tutorial beats.

**Files to Read:** * `@apps/web/src/contexts/TutorialContext.tsx`
* `@apps/web/src/lib/tutorialBeats.ts`

**CLI Prompt:**
```text
Open the following files and apply these exact changes to support drawer orchestration:
1. In @apps/web/src/lib/tutorialBeats.ts: Add `'roll-log'` to the `SpotlightZone` union type. Add `requiresDrawer?: boolean;` and `spotlightDelay?: number;` to the `TutorialBeat` interface.
2. In @apps/web/src/contexts/TutorialContext.tsx: Add `forceRollLogOpen: boolean;` and `setForceRollLogOpen: (val: boolean) => void;` to the `TutorialContextValue` interface. 
3. Implement the `forceRollLogOpen` state and provide it in the `<TutorialContext.Provider>`.
```[Implemented]

### Step 3.2: Orchestrate the Overlay
**Goal:** Implement the delayed spotlight calculation logic so the mask doesn't draw until the Roll Log CSS animation finishes expanding.

**Files to Read:** * `@apps/web/src/components/tutorial/TutorialOverlay.tsx`

**CLI Prompt:**
```text
Open @apps/web/src/components/tutorial/TutorialOverlay.tsx and update the state sync logic.
Apply the following exact changes:
1. Extract `setForceRollLogOpen` from `useTutorialContext`.
2. Inside the `useEffect` that monitors the current `tutorialBeat`: check if `beat.requiresDrawer` is true. If so, call `setForceRollLogOpen(true)`. When the beat changes, reset it to `false`.
3. Locate the logic that calculates the `SpotlightMask` coordinates. Wrap this calculation in a `setTimeout` if `beat.spotlightDelay` exists, passing the delay value to the timeout. Ensure the timeout is properly cleared in the cleanup function.
```[Implemented]

---

## Phase 4: Global Contrast & Typography Sweep

### Step 4.1: Sweep Modals and Dense Text
**Goal:** Apply the new `font-dense` class and solid-color high-contrast replacements across the rest of the app's reading material.

**Files to Read:** * `@apps/web/src/components/CrewPortrait.tsx`
* `@apps/web/src/components/tutorial/HowToPlayScreen.tsx`
* `@apps/web/src/transitions/phases/BossEntryPhase.tsx`
* `@apps/web/src/transitions/phases/FloorRevealPhase.tsx`

**CLI Prompt:**
```text
Open the specified files and apply the global contrast and typography sweep:
1. Find all dense paragraph text, ability descriptions, and rules explanations. Add the `font-dense` class to them to override the default pixel font.
2. Replace all instances of low-opacity text colors (e.g., `text-white/30`, `text-white/40`, `text-white/70`, `text-gold/40`) with solid, high-contrast equivalents (e.g., `text-gray-500`, `text-gray-400`, `text-gray-200`, `text-gold-dim`).
3. Add the `text-shadow-hard` class to any small or dense text that sits directly over a textured background or felt to guarantee contrast.
```[Implemented]