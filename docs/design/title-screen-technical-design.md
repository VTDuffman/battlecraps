# Title Lobby Screen — Technical Design

**Feature:** FB-011
**Status:** Design approved — pending implementation

---

## Goal

Every session (page load) starts on a title screen. If an active run exists the player
can continue or start fresh. The only bypass is the "Play Again" path from Game Over,
which skips straight to the first VFW marker screen.

---

## Current Flow

```
Auth → bootstrap() [auto on mount] → connectToRun() → TransitionOrchestrator
```

`bootstrap()` fires automatically in a `useEffect` on mount. The `TITLE` cinematic
transition (in `TransitionOrchestrator`) gates on
`!titleShown && currentMarkerIndex === 0 && status === IDLE_TABLE` — it fires exactly
once ever for first-time players, and is completely separate from the session-start
concept.

---

## New Flow

```
Auth → TitleLobbyScreen → [user picks action] → bootstrap() → TransitionOrchestrator
```

The lobby defers `bootstrap()` until the user makes an explicit choice. "Play Again"
from Game Over continues to call `bootstrap(true)` directly, bypassing the lobby
entirely.

---

## Component Hierarchy Change

**Before:**
```
AuthenticatedApp
  ├─ loading → LoadingScreen
  ├─ error → ErrorScreen
  └─ TransitionOrchestrator
       └─ TableBoard
```

**After:**
```
AuthenticatedApp
  ├─ showTitleLobby → TitleLobbyScreen  ← NEW (rendered before loading/game)
  ├─ loading → LoadingScreen
  ├─ error → ErrorScreen
  └─ TransitionOrchestrator
       └─ TableBoard
```

---

## State Changes in `App.tsx`

Add one local state variable to `AuthenticatedApp`:

```ts
const [showTitleLobby, setShowTitleLobby] = useState(true);
```

**Remove** the auto-call to `bootstrap()` from the `useEffect` on mount. The effect
keeps only `setGetToken(getToken)` and the `disconnect()` cleanup.

**Lobby action handlers** (passed down as props to `TitleLobbyScreen`):
```ts
const handleContinue = () => {
  setShowTitleLobby(false);
  void bootstrap();          // restores existing run from localStorage
};

const handleNewRun = () => {
  setShowTitleLobby(false);
  void bootstrap(true);      // wipes localStorage, creates fresh run
};
```

**`onPlayAgain`** (passed to `TransitionOrchestrator`) remains:
```ts
() => void bootstrap(true)
```
`showTitleLobby` is never set back to `true` during a session — the lobby only appears
on initial page load.

**Remove** the "NEW RUN" button currently hardcoded in the top-left corner of the game
screen (`App.tsx` lines 239–253). That escape hatch is superseded by the lobby's
"New Run" path.

---

## New Component: `TitleLobbyScreen`

**File:** `apps/web/src/components/TitleLobbyScreen.tsx`

**Props:**
```ts
interface TitleLobbyScreenProps {
  hasActiveRun: boolean;      // true if bc_run_id exists in localStorage
  onContinue: () => void;     // only offered when hasActiveRun
  onNewRun: () => void;       // always available
}
```

**Internal state:**
```ts
const [confirming, setConfirming] = useState(false);
```

**Visual structure** (same aesthetic as `TitleScreenPhase` — Floor 1 theme, gold glow):

```
┌─────────────────────────────┐
│  top accent bar             │
│                             │
│   A CRAPS ROGUELITE         │
│                             │
│       BATTLE                │
│       CRAPS                 │   (massive pixel title, gold glow)
│                             │
│  Three floors. Nine markers.│
│  One shooter standing.      │
│                             │
│  ─────────────────────────  │
│                             │
│  [▶ CONTINUE RUN]           │   (only if hasActiveRun)
│  [+ NEW RUN]                │   (always)
│                             │
│  bottom accent bar          │
└─────────────────────────────┘
```

**Confirmation overlay** (inline, no browser `confirm()`):

When the user clicks "New Run" and `hasActiveRun === true`, `confirming` flips to `true`
and a modal overlay appears over the lobby:

```
┌──────────────────────────┐
│  START FRESH?            │
│  Current progress lost.  │
│                          │
│  [CONFIRM]  [CANCEL]     │
└──────────────────────────┘
```

- CONFIRM → calls `onNewRun()`
- CANCEL → `setConfirming(false)` → returns to lobby

When `hasActiveRun === false` (no existing run), clicking "New Run" calls `onNewRun()`
directly — no confirmation needed since there is nothing to overwrite.

---

## Determining `hasActiveRun`

In `AuthenticatedApp`, compute once before rendering and pass to `TitleLobbyScreen`:
```ts
const hasActiveRun = localStorage.getItem(LS_RUN_ID) !== null;
```

This is a snapshot at render time. By the time any action fires, the user's choice
determines what `bootstrap()` does.

---

## Interaction with Existing `TITLE` Cinematic Transition

The `TITLE` transition in `TransitionOrchestrator` (the one-time cinematic for
first-ever players, gated by `titleShown` / `bc_title_shown` in localStorage) is
**preserved unchanged**. The two features serve different purposes:

|  | Title Lobby Screen (new) | TITLE Cinematic (existing) |
|---|---|---|
| **When** | Every session (page load) | Once ever, first-time player only |
| **Purpose** | Navigation: Continue vs New Run | Cinematic intro before first table |
| **Bypass** | Only via Play Again | After first dismissal, never again |

**First-time player flow:**
Lobby (no active run) → "New Run" → Loading → TITLE cinematic → Marker 0 table

**Returning player — continue:**
Lobby → "Continue" → Loading → table resumes at current marker (no cinematic)

**Returning player — new run:**
Lobby → "New Run" → confirmation → Loading → Marker 0 table → MARKER_INTRO
(TITLE cinematic does not re-fire; `titleShown` is already true)

**Play Again from Game Over:**
`bootstrap(true)` called directly → new run → lobby never shown → Marker 0 table

---

## Files Changed

| File | Change |
|---|---|
| `apps/web/src/App.tsx` | Add `showTitleLobby` state; defer `bootstrap()` to lobby handlers; remove auto-bootstrap from `useEffect`; remove hardcoded "NEW RUN" top-left button; render `TitleLobbyScreen` when `showTitleLobby === true` |
| `apps/web/src/components/TitleLobbyScreen.tsx` | **New file** — lobby UI with Continue/New Run buttons and inline confirmation overlay |

**No changes to:**
- `useGameStore.ts` — all lobby state is local to `App.tsx`
- `TransitionOrchestrator.tsx`
- `TitleScreenPhase.tsx`
- Any API routes or shared packages

---

## Edge Cases

| Case | Behavior |
|---|---|
| `bc_run_id` in localStorage but the run is expired/404 on the server | Bootstrap's existing `check.ok` guard handles this — falls through to create a new run. Lobby correctly showed "Continue" since the ID existed locally; the 404 is transparent to the user. |
| User closes browser mid-lobby (before picking) | No run is loaded; localStorage is unchanged. Next session shows lobby again correctly. |
| Victory → Play Again | `bootstrap(true)` called directly; `showTitleLobby` remains `false`. New run created. Lobby not shown. |
| Game Over → Play Again | Same as Victory → Play Again. |
| Network error during bootstrap after lobby choice | Error screen renders as before; retry button calls `bootstrap(true)`. Lobby is not re-shown on retry (already past that gate). |
| Brand-new player (no `bc_run_id`) | Lobby shows single "NEW RUN" button; no confirmation needed (nothing to overwrite). |
