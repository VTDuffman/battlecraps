# BattleCraps — Tutorial & How to Play: Technical Design
**Feature:** FB-007
**Status:** Implemented
**Reference:** `docs/requirements/tutorial-user-journey.md`

---

## 1. Overview

This document specifies the complete technical design for the Tutorial & "How to Play" system. The feature has two independent subsystems:

1. **Interactive Tutorial** — an in-world guided walkthrough (Sal the Fixer) that runs on first play, on top of the live `TableBoard`, with spotlight overlays and beat-gated advancement. Auto-launches on first run; always skippable.
2. **How to Play Reference** — a static, client-side-only three-section reference screen accessible from the `TitleLobbyScreen` at any time.

**Design principles from the UX spec (non-negotiable):**
- In-world voice: Sal talks, not a help system
- Action over reading: every interactive beat requires a real player action
- Skip never punishes: available at any point
- No dead ends: tutorial completes into a real run seamlessly

---

## 2. Architecture Decision: Where the Tutorial Lives

### Problem
The tutorial must appear *after* the run is initialized (so the `TableBoard` is available as the backdrop) but *before* the `TITLE` cinematic fires (which is the current "first player" event). The `TransitionOrchestrator` currently fires `TITLE` automatically when `status === 'IDLE_TABLE' && currentMarkerIndex === 0 && !titleShown`.

### Decision: Tutorial Gate as a route layer in `AuthenticatedApp`

The tutorial gate is injected as a **pre-game overlay** in `AuthenticatedApp`, managed with local state in `AuthenticatedApp`. It does **not** enter the `TransitionOrchestrator` system.

Rationale:
- The cinematic transition system (`TransitionOrchestrator`) is designed for between-round cinematics keyed to game state events. The tutorial is a one-time onboarding experience, not a game event.
- Keeping tutorial state in `AuthenticatedApp` local state (and a thin store slice for overlay rendering) avoids polluting `TransitionOrchestrator`'s priority chain.
- The tutorial overlay renders **above** `TableBoard` via `z-index` stacking — `TransitionOrchestrator` stays paused until the overlay is dismissed.

### Flow

```
Login → TitleLobbyScreen → handleNewRun()
  → bootstrap()
  → [if !tutorialCompleted && isFirstRun]:
      showTutorialGate = true
      → KnowledgeGate rendered (in front of TableBoard)
      → User picks: "SHOW ME EVERYTHING" | "YEAH, I KNOW CRAPS" | "SKIP"
      → TutorialOverlay renders on TableBoard for beats 1-11
      → On complete/skip: tutorialCompleted = true, mark in DB
      → Overlay dismissed
  → TransitionOrchestrator fires TITLE normally
  → Run begins
```

The `TransitionOrchestrator` **does not need to know about the tutorial**. It simply won't fire until its parent `AuthenticatedApp` allows the game to render (no change needed to orchestrator logic — because during the tutorial the overlay sits atop the rendered `<TableBoard />`; orchestrator will attempt to fire `TITLE` but the tutorial overlay covers it visually. To prevent TITLE from firing underneath, we gate `TransitionOrchestrator` rendering until the tutorial is dismissed.)

**Gate implementation:** `AuthenticatedApp` conditionally renders `<TransitionOrchestrator>` only after `tutorialGateDismissed` local state is true. During the tutorial, `<TableBoard />` is rendered directly (as the backdrop for the overlay), and the `TutorialOverlay` renders above it.

```
AuthenticatedApp local state:
  showTitleLobby: boolean         (existing)
  loading: boolean                (existing)
  tutorialGateDismissed: boolean  (new) — starts false for new players
  tutorialPath: 'FULL' | 'BC_ONLY' | null  (new)
  tutorialActive: boolean         (new) — true while beats are playing
```

---

## 3. Data Layer

### 3.1 DB Migration: `users.tutorial_completed`

New boolean column on the `users` table:

```sql
ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN NOT NULL DEFAULT false;
```

Drizzle schema addition in `apps/api/src/db/schema.ts`:
```typescript
tutorialCompleted: boolean('tutorial_completed').notNull().default(false),
```

This is the **only** API-persisted tutorial state. Replay from "How to Play" is always available regardless of this flag.

### 3.2 API: Include `tutorialCompleted` in bootstrap responses

**`POST /api/v1/auth/provision`** — extend response to include `tutorialCompleted`:
```typescript
// Response shape change:
interface ProvisionResponse {
  userId: string;
  tutorialCompleted: boolean;  // NEW
}
```

**`POST /api/v1/runs`** and **`GET /api/v1/runs/:id`** — include `tutorialCompleted` from the user row:
```typescript
// Included in CreateRunResponse and run fetch response:
tutorialCompleted: boolean;  // NEW — read from users row joined with run
```

**New endpoint: `POST /api/v1/auth/tutorial-complete`**

Marks tutorial as completed for the authenticated user. Called on skip or on beat completion.

```typescript
// No body needed — clerkId from JWT is sufficient
// Response: 200 OK
```

Implementation: `apps/api/src/routes/auth.ts` — add handler that does:
```typescript
await db.update(users).set({ tutorialCompleted: true }).where(eq(users.clerkId, req.clerkId));
```

### 3.3 Client-side tutorial state

Tutorial step/path state is **not** persisted to the store or server during the tutorial. It lives in `AuthenticatedApp` local state. Only the completion flag hits the API.

The one exception: the `TutorialOverlay` needs to pass bet-observation callbacks down to the game, which requires a thin tutorial context. This is handled via a **React context**, not the Zustand store, to keep tutorial logic isolated.

---

## 4. Component Architecture

```
apps/web/src/
  components/
    tutorial/
      KnowledgeGate.tsx          # "You ever shot dice before?" screen
      TutorialOverlay.tsx        # Main spotlight+beat system
      SalPortrait.tsx            # Sal the Fixer character portrait
      SalDialog.tsx              # Dialog card with text + actions
      SpotlightMask.tsx          # SVG spotlight dimming layer
      BeatSimulatedRoll.tsx      # Visual-only dice animation for beats 1/5/6
      HowToPlayScreen.tsx        # Static 3-section reference
      sections/
        CrapsBasicsSection.tsx   # Beat reference cards (come-out, pass, etc.)
        BattleCrapsRulesSection.tsx
        CrewAndBossesSection.tsx
    TitleLobbyScreen.tsx         # MODIFIED: add "HOW TO PLAY" button
  lib/
    tutorialBeats.ts             # Beat content data — all 11 beats
  hooks/
    useTutorialSpotlight.ts      # Manages spotlighted zone rect tracking
  contexts/
    TutorialContext.tsx          # React context for bet-observation bridge
```

---

## 5. Tutorial Beat Engine

### 5.1 Beat data structure (`lib/tutorialBeats.ts`)

```typescript
export type SpotlightZone =
  | 'none'
  | 'game-status'      // aria-label="Game Status"
  | 'betting-grid'     // aria-label="Betting Grid"
  | 'betting-passline' // Pass Line row specifically
  | 'betting-odds'     // Odds row
  | 'betting-hardways' // Hardway grid
  | 'dice-zone'        // aria-label="Dice Zone"
  | 'crew-rail'        // aria-label="Crew Rail"
  | 'hype-meter'       // hype thermometer + readout
  | 'marker-progress'  // Marker progress bar
  | 'boss-portrait';   // Standalone boss image (Beat 11)

export type BeatAdvanceMode =
  | 'tap'              // Sal dialog "Got it" button
  | 'bet-passline'     // Advance when passLine bet > 0
  | 'bet-odds'         // Advance when odds bet > 0
  | 'bet-hardway'      // Advance when any hardway bet > 0 (optional — also has "Skip")
  | 'simulated-roll'   // Auto-advance after simulated roll animation plays
  | 'animated';        // Auto-advance after a specific animation completes

export interface TutorialBeat {
  id: number;              // 1–11
  path: 'A' | 'B' | 'AB'; // A = craps basics, B = battlecraps, AB = both
  spotlight: SpotlightZone;
  salText: string;         // Primary Sal dialog (gritty voice, no help-panel language)
  salTextMore?: string;    // Optional expanded text on "Tell me more"
  advanceMode: BeatAdvanceMode;
  advanceLabel?: string;   // CTA text for tap/optional advances ("Got it" default)
  skipable?: boolean;      // Beat 7 hardway is optional
  simulatedRoll?: {
    die1: number;
    die2: number;
    result: 'point-set' | 'point-hit' | 'seven-out';
    pointNumber?: number;  // For display purposes on beat 3
  };
}
```

### 5.2 Beat definitions (all 11)

```typescript
export const TUTORIAL_BEATS: TutorialBeat[] = [
  // ── PATH A: Craps Basics (Beats 1–7) ─────────────────────────────────────

  // ── PATH A: Craps Basics (Beats 1–7) ─────────────────────────────────────

  {
    id: 1,
    path: 'A',
    spotlight: 'betting-passline',
    salText: `First thing you need is a Pass Line bet. You're betting with the shooter.\nEvery shooter's turn, you decide: in or out.`,
    salTextMore: `Pass Line pays even money on a win. It's the lowest house edge bet at the table. You want to be on it.`,
    advanceMode: 'bet-passline',
    advanceLabel: 'Put something on the line.',
  },
  {
    id: 2,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Now the come-out roll.\n7 or 11 right here — we win. 2, 3, or 12 — we lose. Anything else sets the point.`,
    advanceMode: 'simulated-roll',
    simulatedRoll: { die1: 4, die2: 2, result: 'point-set', pointNumber: 6 },
  },
  {
    id: 3,
    path: 'A',
    spotlight: 'game-status',
    salText: `There's your point — 6. That puck tells you what we're chasing.\nHit it again before a 7 shows, and we get paid.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  {
    id: 4,
    path: 'A',
    spotlight: 'betting-odds',
    salText: `Here's the angle the house hates. Odds bet. No vig, no edge.\nYou're backing your Pass bet at true odds. Best bet in the building.`,
    salTextMore: `For a point of 6 or 8, odds pay 6:5. For 5 or 9, they pay 3:2. For 4 or 10, they pay 2:1.`,
    advanceMode: 'bet-odds',
    advanceLabel: 'Back it up.',
  },
  {
    id: 5,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `There it is. Point hit. Pass pays even money, odds pays 6:5.\nNew come-out. We keep shooting.`,
    advanceMode: 'simulated-roll',
    simulatedRoll: { die1: 3, die2: 3, result: 'point-hit', pointNumber: 6 },
  },
  {
    id: 6,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `The seven-out. 7 shows before the point — you lose your pass and your odds.\nShooter's done. New shooter steps up.`,
    advanceMode: 'simulated-roll',
    simulatedRoll: { die1: 3, die2: 4, result: 'seven-out' },
  },
  {
    id: 7,
    path: 'A',
    spotlight: 'betting-hardways',
    salText: `Hardways are side bets. Same number, both dice matching.\nHard 6 means a 3 and a 3 — not a 5 and a 1. Wins when it hits hard. Loses on a 7 or a soft hit.`,
    salTextMore: `Hard 4 and 10 pay 7:1. Hard 6 and 8 pay 9:1. Higher payout, higher risk — they lose on any 7 and on any "soft" hit of the number.`,
    advanceMode: 'bet-hardway',
    advanceLabel: 'Place a hardway.',
    skipable: true,
  },

  // ── PATH B: BattleCraps Module (Beats 8–11) ───────────────────────────────

  {
    id: 8,
    path: 'B',
    spotlight: 'marker-progress',
    salText: `This isn't a casino. You've got a target — $300.\nHit it before you seven-out three times and you advance.\nFall short, and you're done.`,
    salTextMore: `Nine markers across three floors. Each floor ends with a boss who changes the rules. Clear all nine and you walk.`,
    advanceMode: 'tap',
    advanceLabel: 'Understood.',
  },
  {
    id: 9,
    path: 'B',
    spotlight: 'hype-meter',
    salText: `Every point you string together, the crowd gets louder.\nThat's your Hype multiplier — it boosts your payouts on a hot streak.\nKeep rolling, it keeps climbing. Seven-out, it resets.`,
    salTextMore: `Hype starts at 1.0× and ticks up +0.05 per consecutive point hit (more at higher hit counts). A seven-out drops it back to 1.0×.`,
    advanceMode: 'animated', // hype meter ticks 1.0 → 1.05 → 1.10 automatically
    advanceLabel: 'Got it.',
  },
  {
    id: 10,
    path: 'B',
    spotlight: 'crew-rail',
    salText: `You're not alone at this table. Your crew works an angle before every roll.\nThey can juice your bets, protect your streak, or find you extra chips.\nPick them right and they chain together.`,
    salTextMore: `Crew abilities fire left to right before each roll. Some need a cooldown. Combinations can stack — the right lineup multiplies your edge.`,
    advanceMode: 'animated', // one crew portrait fires a fake cascade event
    advanceLabel: 'Got it.',
  },
  {
    id: 11,
    path: 'B',
    spotlight: 'boss-portrait',
    salText: `At the end of every floor, someone's waiting.\nThey change the game. Could be rising minimums. Could be your crew going dark.\nLearn their angle before you hit their floor.`,
    advanceMode: 'tap',
    advanceLabel: `Let's move.`,
  },
];
```

---

## 6. Spotlight System (`SpotlightMask.tsx` + `useTutorialSpotlight.ts`)

### 6.1 Implementation approach

Zone elements in `TableBoard` already have `aria-label` attributes (`"Game Status"`, `"Betting Grid"`, `"Dice Zone"`, `"Crew Rail"`). The spotlight system uses `getBoundingClientRect()` on these elements to position the SVG mask.

**For sub-zones** (Pass Line, Odds, Hardways) that don't have existing aria-labels, we add `data-tutorial-zone` attributes to the relevant rows in `BettingGrid.tsx`. These are minimal, non-breaking additions.

### 6.2 SVG mask approach

```tsx
// SpotlightMask.tsx
// Renders: dark overlay with a rectangular cut-out, plus a golden ring

interface SpotlightMaskProps {
  zone: SpotlightZone;
  tableRef: React.RefObject<HTMLDivElement>;
}

// 1. Query the target element via aria-label or data-tutorial-zone
// 2. Get getBoundingClientRect() relative to the table container
// 3. Render:
//    - SVG <rect> fill="rgba(0,0,0,0.78)" with mask cutting out the zone
//    - Positioned <div> with golden border ring + subtle glow pulse
// 4. Re-measure on window resize (ResizeObserver on the table div)
```

`SpotlightZone = 'none'` renders only the dark overlay with no cut-out (used for Knowledge Gate and Beat 11 boss portrait which is not a TableBoard element).

### 6.3 Pointer event handling

- The `TutorialOverlay` wrapper is `pointer-events: auto` to block accidental clicks
- The spotlight cut-out region passes clicks through via a **transparent positioned div** at z-90 that only covers the spotlight zone and has `pointer-events: auto`
- The dark overlay div is `pointer-events: none` (visual only)
- The Sal dialog card is rendered outside the overlay at a fixed position, `pointer-events: auto`

This means during Beat 2, clicks on the Pass Line betting zone work normally. Clicks anywhere else are absorbed by the overlay.

---

## 7. Bet Observation Bridge (`TutorialContext.tsx`)

Beats 2, 4, and 7 advance when the player places a real bet. We cannot poll Zustand state from a tutorial component without coupling — instead, we use a **React context with a callback registration pattern**.

```typescript
// contexts/TutorialContext.tsx
interface TutorialContextValue {
  // Called by BettingGrid when a bet field changes
  onBetChanged: (field: BetField, newAmount: number) => void;
  // Current beat advance mode — BettingGrid reads this to know if it should notify
  activeBeatMode: BeatAdvanceMode | null;
}
```

`BettingGrid.tsx` gets a **single prop addition**: `onBetChanged?: (field: BetField, newAmount: number) => void`. When the tutorial is active, `TutorialOverlay` passes this callback down. When tutorial is inactive, prop is undefined and BettingGrid behavior is unchanged.

`TableBoard` receives an optional `tutorialCallbacks` prop — an object that is passed through to `BettingGrid`. When null/undefined (non-tutorial mode), nothing changes. This is a **two-line change to TableBoard** and a **one-prop addition to BettingGrid**.

---

## 8. Loaded Dice / Tutorial Rolls (`BeatSimulatedRoll.tsx`)

Beats 1, 5, and 6 use the real game engine but with rigged outcomes to guarantee the tutorial progression. Fake UI state is strictly avoided.

- **Backend Integration:** The `POST /api/v1/runs/:id/roll` endpoint accepts an optional `cheat_dice: [number, number]` array. If provided (and the run is in tutorial mode), the server bypasses standard RNG and forces the outcome to match the requested dice.
- **Frontend Execution:** The `BeatSimulatedRoll` component plays the standard visual tumble animation. When the tumble completes (~1200ms), it dispatches the real `rollDice([die1, die2])` action to the Zustand store, passing the rigged values to the backend.
- **Native Resolution:** Because the real engine is used, the game processes the phase changes natively. The point puck physically flips to 'ON', `BettingGrid` validation updates naturally, and win/loss flashes trigger via the standard `TableBoard` systems without requiring custom tutorial-only UI overrides.

---

## 9. Beat 9 Hype Animation (Beat 9 — `animated` advance mode)

Beat 9 spotlights the hype meter and auto-animates it without touching game state.

```typescript
// TutorialOverlay manages a local hypeDisplayValue: number state
// When Beat 9 is active:
//   - CSS transition animates a fake hype thermometer overlay (not the real one)
//   - Ticks: 1.0 → 1.05 → 1.10 over ~2s
//   - Shows before/after payout comparison: "$100 base payout → $110 at 1.10×"
//   - After animation completes, shows "Got it." button
```

The real hype meter in `TableBoard` is covered by the spotlight dim. The tutorial renders its own animated replica inside the spotlight cut-out area.

---

## 10. Beat 10 Crew Animation (Beat 10 — `animated` advance mode)

Beat 10 spotlights the crew rail and fires one fake cascade bark.

The tutorial does not fire a real crew ability (which would require a server round-trip). Instead:
- A **standalone placeholder crew portrait** is rendered by `TutorialOverlay` directly within the spotlighted crew rail area (not dependent on real crew slot state — new players have empty slots)
- The placeholder represents "The Lookout" with their emoji and name
- A scripted bark text is shown: `"+$25 BONUS → The Lookout"` cascade event pop
- After 2s the animation completes and "Got it." appears

This approach requires no changes to `CrewPortrait.tsx` — the tutorial renders its own standalone portrait element, bypassing the real crew rail entirely. `tutorialOverrideTriggering` prop is not needed.

---

## 11. Beat 11 Boss Portrait

Beat 11 shows a boss portrait outside the normal TableBoard UI — it's an overlay panel, not a spotlight on an existing zone.

```tsx
// Rendered as a floating card in TutorialOverlay when spotlight='boss-portrait'
// Shows:
//   - Boss emoji/name: "SARGE" (Floor 1 boss, always — from GAUNTLET[2])
//   - One-line mechanic: ruleBlurb from BossConfig
//   - "You'll meet them at the end of Floor 1."
// Data source: GAUNTLET[2] from @battlecraps/shared — no API needed
```

---

## 12. Closing Beat

After beat 11, `TutorialOverlay` shows the closing sequence:

```
SAL:
"Alright. You know enough to be dangerous.
Floor 1. First marker. $300. Let's move."
```

Sal's portrait slides away (CSS translateY + opacity transition, ~600ms). `TutorialOverlay` unmounts. `AuthenticatedApp` sets `tutorialGateDismissed = true`, which triggers rendering of `<TransitionOrchestrator>` — which then fires the `TITLE` cinematic normally.

Simultaneously, the `POST /api/v1/auth/tutorial-complete` call fires (fire-and-forget).

---

## 13. Knowledge Gate (`KnowledgeGate.tsx`)

```tsx
interface KnowledgeGateProps {
  onFull:   () => void;   // "SHOW ME EVERYTHING" → path A + B
  onBCOnly: () => void;   // "YEAH, I KNOW CRAPS" → path B only
  onSkip:   () => void;   // "Skip Tutorial →" → dismiss immediately
}
```

Rendered as a full-screen overlay above `TableBoard`. Floor 1 theme. Sal portrait lower-left.

```
┌─────────────────────────────────────────────┐
│  [SAL PORTRAIT]  "You ever shot dice        │
│                   before?"                  │
│                                             │
│  [ SHOW ME EVERYTHING        ]              │
│  [ YEAH, I KNOW CRAPS        ]              │
│                                             │
│                    [ Skip Tutorial → ]      │
└─────────────────────────────────────────────┘
```

`onSkip` calls `POST /api/v1/auth/tutorial-complete` and sets `tutorialGateDismissed = true`.

---

## 14. How to Play Reference (`HowToPlayScreen.tsx`)

Fully client-side. Accessible from `TitleLobbyScreen` via a "HOW TO PLAY" button.

### 14.1 Navigation structure

`TitleLobbyScreen` gets a "HOW TO PLAY" link at the bottom. Clicking sets local state `showHowToPlay = true`, rendering `HowToPlayScreen` in place of the lobby.

`HowToPlayScreen` renders a top-level section picker, then the selected section's content. Back button returns to the lobby.

### 14.2 Sections

**Craps Basics** — Static illustrated reference cards, one per concept:
- Come-Out Roll (7/11 = win, 2/3/12 = craps, else = point set)
- The Pass Line (even money, bet with the shooter)
- Point & Puck (what the point puck means, how to hit it)
- Odds Bet (no edge, payout ratios per point: 4/10 → 2:1, 5/9 → 3:2, 6/8 → 6:5)
- Seven-Out (loss condition, shooter change)
- Hardways (matching dice only, 4/10 → 7:1, 6/8 → 9:1, lose on 7 or soft hit)

**BattleCraps Rules** — Reference data pulled from `@battlecraps/shared` constants:
- Marker system + gauntlet targets (from `MARKER_TARGETS` / `GAUNTLET`)
- Hype formula (each consecutive point hit ticks hype; multiplies profits)
- Floor/boss progression overview (3 floors, boss at every 3rd marker)
- Quick-reference: bet caps (10% of marker target), odds caps (3-4-5×)
- Shooters = lives (5 starting, game over at 0)

**Crew & Bosses** — Card gallery, data from `GET /crew-roster` (already implemented):
- Crew cards: emoji + name + briefDescription, grouped by rarity
- Only shows crew the player has encountered/unlocked; locked crew show as `?????` with rarity badge
- Boss cards: `GAUNTLET[2/5/8]` BossConfig data — name + ruleBlurb
- **Bosses remain blurred until the player has reached that boss's marker** (tracked by `currentMarkerIndex` from the run state, or `localStorage` if no active run)

The "Crew & Bosses" section requires the game store to be accessible (for `currentMarkerIndex` and `crewRoster`). Since `HowToPlayScreen` is rendered within `AuthenticatedApp` (post-login), the store is available.

---

## 15. `SalPortrait.tsx`

A styled component rendering Sal the Fixer as an emoji-based pixel portrait (no sprite asset required).

```
┌──────────┐
│ 🎩       │
│ 😤       │  ← gruff expression via emoji layering
│ 🎴  🎴   │  ← cards (fixer motif)
└──────────┘
  SAL THE FIXER
```

Rendered in a styled box with Floor 1 theme border, slight drop shadow. Slides in from bottom-left on mount (CSS `translate + opacity` transition). Slides out on tutorial end.

---

## 16. `AuthenticatedApp` changes

```typescript
// New local state additions:
const [tutorialGateDismissed, setTutorialGateDismissed] = useState(false);
const [tutorialPath, setTutorialPath]     = useState<'FULL' | 'BC_ONLY' | null>(null);
const [tutorialActive, setTutorialActive] = useState(false);
const [tutorialCompleted, setTutorialCompleted] = useState(true); // default true; overridden by bootstrap

// bootstrap() change: read tutorialCompleted from provision + run responses
// If !tutorialCompleted: set tutorialCompleted=false, which causes gate to show
// after game is loaded

// Render chain addition (after loading/error checks, before TransitionOrchestrator):
if (!tutorialGateDismissed && !tutorialCompleted) {
  return (
    <>
      <TableBoard />  {/* backdrop */}
      <KnowledgeGate
        onFull={...}
        onBCOnly={...}
        onSkip={...}
      />
    </>
  );
}

if (tutorialActive) {
  return (
    <>
      <TableBoard />
      <TutorialOverlay
        path={tutorialPath}
        onComplete={handleTutorialComplete}
        onSkip={handleTutorialSkip}
      />
    </>
  );
}

// Normal game render (unchanged):
return (
  <main ...>
    <TransitionOrchestrator onPlayAgain={...}>
      <TableBoard />
    </TransitionOrchestrator>
    <UnlockNotification />
  </main>
);
```

---

## 17. Implementation Tickets (Incremental Shipping Order)

Each ticket is independently shippable and unblocks the next.

---

### T-001 — DB Migration & API Changes
**Size:** Small (2–3 hours)
**Depends on:** Nothing
**Blocks:** T-003, T-004, T-007

**Deliverables:**
- `apps/api/src/db/migrations/migrate-tutorial.ts` — `ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN NOT NULL DEFAULT false`
- `apps/api/src/db/schema.ts` — add `tutorialCompleted` field to `users` table definition
- `apps/api/src/routes/auth.ts` — extend provision response to include `tutorialCompleted`; add `POST /auth/tutorial-complete` handler
- `apps/api/src/routes/runs.ts` — include `tutorialCompleted` in run create + fetch responses
- `apps/web/src/App.tsx` — read `tutorialCompleted` from provision response; store in local state (default `true` so existing users are unaffected)

**Acceptance:** New users get `tutorialCompleted: false` from API; existing users get `true` (column default false but all existing users are considered complete — add a one-time migration that sets `tutorial_completed = true` for all rows created before this migration, i.e. `updatedAt < migration_timestamp`). Actually, simpler: default `false` for new users, and for all existing users set `true` in the migration itself.

**Migration note:** In the migration, after adding the column, run:
```sql
UPDATE users SET tutorial_completed = true WHERE created_at < NOW();
```
This marks all existing accounts as tutorial-complete so they never see the gate.

---

### T-002 — How to Play Static Reference (fully independent)
**Size:** Medium (4–6 hours)
**Depends on:** Nothing (can ship before T-001)
**Blocks:** Nothing

**Deliverables:**
- `apps/web/src/components/tutorial/HowToPlayScreen.tsx` — section picker + all three sections
- `apps/web/src/components/tutorial/sections/CrapsBasicsSection.tsx`
- `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx`
- `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx`
- `apps/web/src/components/TitleLobbyScreen.tsx` — add "HOW TO PLAY" button + local `showHowToPlay` state

**Notes:**
- `BattleCrapsRulesSection` reads `GAUNTLET`, `MARKER_TARGETS`, `getMaxBet` from `@battlecraps/shared` — no API call
- `CrewAndBossesSection` calls `GET /crew-roster` — already implemented; show locked crew as redacted. Read `currentMarkerIndex` from Zustand store for boss reveal gating (0 if no active run).
- Boss cards use `GAUNTLET[2/5/8].bossConfig` from shared config — no API call

**Acceptance:** "HOW TO PLAY" button visible on TitleLobbyScreen. All three sections render correct game data. Crew section respects unlock state. Boss cards blur/reveal by marker reached.

---

### T-003 — Sal Portrait + Knowledge Gate
**Size:** Small-Medium (2–4 hours)
**Depends on:** T-001 (needs `tutorialCompleted` from API)
**Blocks:** T-004

**Deliverables:**
- `apps/web/src/components/tutorial/SalPortrait.tsx` — emoji-based character portrait, slide-in animation
- `apps/web/src/components/tutorial/KnowledgeGate.tsx` — knowledge gate modal with three buttons
- `apps/web/src/App.tsx` — gate rendering logic: show `<TableBoard /> + <KnowledgeGate>` when `!tutorialCompleted && !tutorialGateDismissed`

**Notes:**
- Gate fires only for new players (`tutorialCompleted === false` from API)
- Skip → `POST /auth/tutorial-complete` (fire-and-forget) + dismiss gate
- "SHOW ME EVERYTHING" → set `tutorialPath='FULL'`, `tutorialActive=true`, dismiss gate
- "YEAH, I KNOW CRAPS" → set `tutorialPath='BC_ONLY'`, `tutorialActive=true`, dismiss gate
- At this point, `tutorialActive=true` but `TutorialOverlay` doesn't exist yet — `tutorialGateDismissed=true` falls through to normal game. T-004 adds the overlay rendering.

**Acceptance:** New accounts see the gate over the dimmed TableBoard backdrop. Three buttons work. Skip dismisses and runs start normally. Returning players never see the gate.

---

### T-004 — Tutorial Overlay Shell + Spotlight System
**Size:** Large (8–12 hours)
**Depends on:** T-003
**Blocks:** T-005, T-006

**Deliverables:**
- `apps/web/src/lib/tutorialBeats.ts` — all 11 beat definitions (data only, no component logic)
- `apps/web/src/hooks/useTutorialSpotlight.ts` — measures zone rect via `getBoundingClientRect`, re-measures on resize
- `apps/web/src/components/tutorial/SpotlightMask.tsx` — SVG mask overlay + golden ring
- `apps/web/src/components/tutorial/SalDialog.tsx` — dialog card: Sal text + CTA button + optional "Tell me more" expander
- `apps/web/src/components/tutorial/TutorialOverlay.tsx` — outer shell: progress dots, skip button, beat state machine, renders SpotlightMask + SalDialog
- `apps/web/src/contexts/TutorialContext.tsx` — React context for bet-observation bridge
- `apps/web/src/components/TableBoard.tsx` — add `data-tutorial-zone` attributes to spotlight targets; pass `tutorialCallbacks` prop through to `BettingGrid`
- `apps/web/src/components/BettingGrid.tsx` — add `data-tutorial-zone` to Pass Line, Odds, Hardway rows; accept `onBetChanged` callback prop
- `apps/web/src/App.tsx` — render `<TutorialOverlay>` when `tutorialActive`

**Beat advancement for this ticket:** implement only `tap` mode. `bet-*`, `simulated-roll`, and `animated` modes are stubs (auto-advance after 2s) — filled in by T-005 and T-006.

**Acceptance:** Tutorial overlay renders above TableBoard. Spotlight correctly dims and highlights each zone per beat. Progress dots visible. Skip button works at any beat. `tap` beats advance on "Got it." button click. Beat 11 boss portrait renders as overlay card.

---

### T-005 — Interactive Beats: Path A (Beats 1–7)
**Size:** Large (8–10 hours)
**Depends on:** T-004
**Blocks:** T-007

**Deliverables:**
- `apps/web/src/components/tutorial/BeatSimulatedRoll.tsx` — visual-only dice animation with scripted result flash
- Implement `bet-passline` advance mode in `TutorialOverlay` (watch `onBetChanged` callback)
- Implement `bet-odds` advance mode
- Implement `bet-hardway` advance mode (with optional "Skip" CTA)
- Implement `simulated-roll` advance mode (renders `BeatSimulatedRoll`, auto-advances on animation complete)
- Beat 3 (Establishing Point): animate point puck sliding onto number — done via a tutorial overlay annotation (positioned div over the puck in `game-status` zone) rather than real state change
- Beat 9 hype animation: local hype counter + animated thermometer replica in the spotlight zone

**Acceptance:** Beats 1–7 work end-to-end. Simulated rolls play correctly. Bet placements advance beats. Hardway skip works. Point puck annotation shows correctly.

---

### T-006 — BattleCraps Beats: Path B (Beats 8–11)
**Size:** Medium (4–6 hours)
**Depends on:** T-004
**Can be done in parallel with T-005**

**Deliverables:**
- Beat 8 (Marker): implement `tap` mode with spotlight on `marker-progress` — already works from T-004
- Beat 9 (Hype): implement `animated` mode with fake hype tick animation (local state, overlay replica of thermometer)
- Beat 10 (Crew): implement `animated` mode with standalone placeholder portrait rendered directly by `TutorialOverlay`; no `CrewPortrait.tsx` changes needed
- Beat 11 (Boss): implement `boss-portrait` spotlight — overlay card rendered by `TutorialOverlay` directly using `GAUNTLET[2]` boss data
- Closing beat sequence: Sal slide-away animation → `TransitionOrchestrator` unmount guard released
- `apps/web/src/components/CrewPortrait.tsx` — add optional `tutorialOverrideTriggering?: boolean` prop

**Acceptance:** Beats 8–11 work end-to-end. Crew animation fires fake trigger. Boss portrait shows Sarge data. Closing beat runs and TITLE cinematic fires normally afterward.

---

### T-007 — Polish, Completion Tracking & "How to Play" in-game
**Size:** Small-Medium (3–5 hours)
**Depends on:** T-005, T-006
**Blocks:** Nothing (ships last)

**Deliverables:**
- `POST /api/v1/auth/tutorial-complete` called on beat 11 completion (fire-and-forget)
- `POST /api/v1/auth/tutorial-complete` called on skip at any point
- "HOW TO PLAY" accessible from in-game: add a small button to `TableBoard` (next to mute toggle) that opens `HowToPlayScreen` as a modal overlay (does not interrupt the run)
- Progress dots styling polish
- Sal portrait slide-in/out timing polish
- Mobile touch target audit for all beat CTAs
- Add `data-tutorial-zone` attributes for any zones missed in T-004

**Acceptance:** Tutorial completion is persisted. New players never see gate again after completing or skipping. In-game "HOW TO PLAY" access works mid-run. Skip from any beat works.

---

## 18. File Change Summary

| File | Change Type | Ticket |
|---|---|---|
| `apps/api/src/db/schema.ts` | Add `tutorialCompleted` column | T-001 |
| `apps/api/src/db/migrations/migrate-tutorial.ts` | New migration | T-001 |
| `apps/api/src/routes/auth.ts` | Add `tutorialCompleted` to response; add `POST /auth/tutorial-complete` | T-001 |
| `apps/api/src/routes/runs.ts` | Add `tutorialCompleted` to run responses | T-001 |
| `apps/web/src/App.tsx` | Tutorial gate + overlay routing | T-001, T-003, T-004 |
| `apps/web/src/components/TitleLobbyScreen.tsx` | Add "HOW TO PLAY" button | T-002 |
| `apps/web/src/components/TableBoard.tsx` | Add `data-tutorial-zone`, pass `tutorialCallbacks` | T-004 |
| `apps/web/src/components/BettingGrid.tsx` | Add `data-tutorial-zone`, accept `onBetChanged` | T-004 |
| `apps/web/src/components/CrewPortrait.tsx` | No changes — Beat 10 uses a standalone placeholder portrait | — |
| `apps/web/src/components/tutorial/KnowledgeGate.tsx` | New | T-003 |
| `apps/web/src/components/tutorial/SalPortrait.tsx` | New | T-003 |
| `apps/web/src/components/tutorial/SalDialog.tsx` | New | T-004 |
| `apps/web/src/components/tutorial/SpotlightMask.tsx` | New | T-004 |
| `apps/web/src/components/tutorial/TutorialOverlay.tsx` | New | T-004 |
| `apps/web/src/components/tutorial/BeatSimulatedRoll.tsx` | New | T-005 |
| `apps/web/src/components/tutorial/HowToPlayScreen.tsx` | New | T-002 |
| `apps/web/src/components/tutorial/sections/CrapsBasicsSection.tsx` | New | T-002 |
| `apps/web/src/components/tutorial/sections/BattleCrapsRulesSection.tsx` | New | T-002 |
| `apps/web/src/components/tutorial/sections/CrewAndBossesSection.tsx` | New | T-002 |
| `apps/web/src/lib/tutorialBeats.ts` | New | T-004 |
| `apps/web/src/hooks/useTutorialSpotlight.ts` | New | T-004 |
| `apps/web/src/contexts/TutorialContext.tsx` | New | T-004 |

**No changes to:** `crapsEngine.ts`, `cascade.ts`, `config.ts`, `TransitionOrchestrator.tsx`, `registry.ts`, `useGameStore.ts` (store untouched — tutorial state stays local).

---

## 19. Key Design Constraints

1. **Store isolation.** Tutorial state does not enter `useGameStore`. All beat progression state is in `TutorialOverlay` local state. The only store reads are: `crewSlots` (Beat 10 crew animation), `crewRoster` (How to Play), `currentMarkerIndex` (How to Play boss reveal gating).

2. **TransitionOrchestrator untouched.** No changes to the priority chain, registry, or phase components. The tutorial prevents `TransitionOrchestrator` from mounting by holding back the render; once dismissed, orchestrator fires normally.

3. **Existing player zero impact.** All existing users get `tutorial_completed = true` in the migration. The feature is invisible to them unless they click "HOW TO PLAY" from the lobby.

4. **Skip is always available.** A persistent "Skip Tutorial →" button is visible at every beat and at the Knowledge Gate. It never locks the player in.

---

## 20. Design Decisions (resolved)

All open questions resolved prior to implementation.

1. **Simulated roll visual fidelity (Beat 5):** Show a brief pop-out payout overlay (e.g. `"+$120 POINT HIT!"`) in addition to the win flash. Implemented in `BeatSimulatedRoll.tsx` as a tutorial-local overlay — no store changes, no real bankroll change.

2. **Beat 3 point puck:** Use a fake overlay annotation (option a) — a positioned `<div>` rendered by `TutorialOverlay` over the game-status zone, styled to match the real point puck. Store remains unmodified.

3. **Beat 10 crew empty slots:** Always use a placeholder crew portrait. New players have empty crew slots; the tutorial renders a standalone placeholder portrait with a scripted cascade bark (`"+$25 BONUS → The Lookout"`). Does not depend on real crew slot state.

4. **Returning player How to Play:** Static reference only. Interactive tutorial is first-run exclusive. No "replay tutorial" entry point in this version.

5. **Mobile viewport:** Sal portrait capped at 64×64px. Dialog card `max-height: 40dvh` with internal scroll when "Tell me more" is expanded. Progress dots and skip button always visible outside the card.
