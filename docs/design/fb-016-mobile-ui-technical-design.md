# FB-016 — Mobile-First UI/UX & Readability Overhaul
## Technical Design Document

**Status:** Draft
**Feature branch target:** `feature/fb-016-mobile-ui`
**Depends on:** No open feature branches.

---

## 1. Overview

The current UI suffers from three compounding readability failures on mobile:

1. **Sub-12px pixel fonts** everywhere — `text-[6px]`, `text-[7px]`, `text-[8px]`, `text-[9px]` appear in `TableBoard.tsx`, `RollLog.tsx`, and across child components.
2. **Low-opacity text over textured backgrounds** — patterns like `text-white/30`, `text-white/40`, `text-gold/40` produce poor contrast against the felt texture, especially on OLED screens in mixed lighting.
3. **Fixed floating RollLog** — the `fixed bottom-4 right-4 z-50` panel covers interactive game controls and is unusable on 375px-wide phones.

This document specifies the exact implementation strategy for each of the four sub-deliverables.

---

## 2. Typography: The HD-Retro Stack

### 2.1 Font Selection

The third-tier "Dense Text" font is **Space Grotesk**. Rationale:

- Designed for UI density — its metrics are compact but the x-height is tall, so 14px reads like 16px of most other fonts.
- Geometric-but-not-sterile: has a subtle constructed quality that complements the pixel art aesthetic without clashing.
- Variable-weight support: a single `@import` request covers 300–700 weight range for tight/bold distinctions in labels.
- Already in the same Google Fonts CDN domain as the existing fonts, so no new preconnect is needed.

The **three tiers** are:

| Tier | Font | Tailwind class | Min size | Use cases |
|---|---|---|---|---|
| **Display** | Press Start 2P | `font-pixel` | `text-[12px]` | Game titles, boss names, section headers (`CREW`, `BANKROLL`), critical state flashes (`POINT ACTIVE`), `ROLL LOG` drawer header |
| **Data** | Share Tech Mono | `font-mono` | `text-[12px]` | Bankroll values, bet amounts, chip denominations, timestamps in Roll Log, marker dollar targets |
| **Dense Text** | Space Grotesk | `font-dense` | `text-sm` (14px) | Crew ability descriptions, Roll Log receipt lines, How To Play body text, transition/boss modal body copy, any prose > 2 words |

### 2.2 `index.html` Change

The existing Google Fonts `<link>` on line 11 loads five families as a single request. Space Grotesk is appended to the same request to keep it as one HTTP round-trip:

**Before (line 11):**
```html
<link
  href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&family=Special+Elite&family=IM+Fell+English:ital@0;1&family=Bebas+Neue&display=swap"
  rel="stylesheet"
/>
```

**After:**
```html
<link
  href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&family=Space+Grotesk:wght@400;500;600&family=Special+Elite&family=IM+Fell+English:ital@0;1&family=Bebas+Neue&display=swap"
  rel="stylesheet"
/>
```

`wght@400;500;600` covers normal, medium, and semibold — sufficient for all planned uses. Variable-range `300..700` would be larger; only request what's used.

### 2.3 `tailwind.config.ts` Change

Add `dense` to the `fontFamily` extension block:

```ts
fontFamily: {
  pixel: ['"Press Start 2P"', 'monospace'],
  mono:  ['"Share Tech Mono"', 'monospace'],
  dense: ['"Space Grotesk"', 'system-ui', 'sans-serif'],   // ADD
},
```

`system-ui` is the fallback — iOS uses San Francisco, Android uses Roboto. Both are acceptable substitutes if the CDN font has not loaded yet.

### 2.4 The 12px Minimum Enforcement Strategy

The sub-12px sizes appear as explicit Tailwind arbitrary values (`text-[6px]`, `text-[7px]`, `text-[8px]`, `text-[9px]`). These are concentrated in:

- `TableBoard.tsx` — section headers, `BANKROLL`/`HYPE`/`SHOOTERS` labels, `COME OUT` phase label
- `RollLog.tsx` — receipt body text, timestamps
- Other components not yet audited

**Approach:** A global sweep replaces all sub-12px sizes. The permitted minimum sizes are:

| Size token | px value | Use |
|---|---|---|
| `text-[12px]` | 12px | Smallest `font-pixel` label (section headers, pill badges) |
| `text-xs` | 12px | Smallest `font-mono` data value |
| `text-sm` | 14px | Standard `font-dense` body text, receipt lines |
| `text-base` | 16px | Primary data values (bankroll display, bet amounts) |

Labels that were decorative at 6-7px (e.g., "· CASINO GAUNTLET ·") should either be removed or bumped to `text-[12px]` with `tracking-[0.2em]` to maintain the spacing feel while hitting the floor.

---

## 3. High Contrast & Solid Colors

### 3.1 The Problem

The codebase makes heavy use of Tailwind's opacity modifier shorthand (`text-white/30`, `bg-black/75`) which produces semi-transparent values that read differently depending on what's behind them. Over the felt texture, these are borderline illegible on mobile displays.

### 3.2 Replacement Map

The following substitutions are the canonical replacements. Every instance of a left-side value in the codebase should be migrated to its right-side equivalent:

| Current (opacity variant) | Replace with | Rationale |
|---|---|---|
| `text-white/30` | `text-gray-500` (#6b7280) | Solid mid-gray; same perceived luminance on dark felt |
| `text-white/40` | `text-gray-400` (#9ca3af) | Solid light-gray; secondary label tier |
| `text-white/70` | `text-gray-200` (#e5e7eb) | Near-white; subdued primary text |
| `text-white/80` | `text-white` | Full white; fine at this opacity — just use solid |
| `text-white/20` | `text-gray-600` (#4b5563) | Inactive/disabled indicators |
| `text-white/10` | `text-gray-700` (#374151) | Borders on dark panels |
| `text-gold/40` | `text-gold-dim` (`#8a6810`) | Solid dim-gold; already in theme palette |
| `text-gold/50` | `text-gold-dim` | Same |
| `text-gold/70` | `text-gold` (`#d4a017`) | Solid gold |
| `bg-black/75` | `bg-felt-dark` (`#0f2a1d`) | Opaque dark felt panel — blocks texture completely |
| `bg-black/30` | `bg-felt-rail` (`#0c1f15`) | Opaque rail background |
| `bg-black/20` | `bg-felt-dark/90` (or `bg-felt-dark`) | Opaque or near-opaque panel |
| `border-white/10` | `border-felt-light` (`#256040`) | Solid felt-light border |
| `border-white/20` | `border-felt-light` | Same |
| `border-gold/20` | `border-gold-dim` | Solid dim-gold border |
| `border-gold/30` | `border-gold-dim` | Same |

**Exception — intentional overlays:** Screen flash overlays (`animate-screen-flash-win`, `animate-screen-flash-lose`) and the felt-breathing overlay (`absolute inset-0 pointer-events-none`) are deliberately transparent. These are animation system elements and are explicitly exempt from this replacement sweep.

### 3.3 Hard Drop-Shadow Utility

Add a utility class to `index.css` for text floating directly over the felt texture (not inside a panel):

```css
@layer utilities {
  .text-shadow-hard {
    text-shadow: 1px 1px 0px #000000;
  }
}
```

Apply `text-shadow-hard` to:
- Any `font-pixel` label rendered directly inside the flex container without an opaque backing panel (e.g., the `CREW` header text, the `COME OUT`/`POINT ACTIVE` phase label, the `TABLE MAX` label in ChipRail)
- Roll Log receipt text when the drawer background is solid but sits over the felt transition zone

### 3.4 Opaque Panel Requirements

Every data panel must use a solid opaque background. The priority panels to fix:

| Panel | Current background | Target background |
|---|---|---|
| RollLog drawer | `bg-black/75 backdrop-blur-sm` | `bg-felt-dark` + `border-2 border-felt-light` |
| ChipRail section | `bg-black/20` | `bg-felt-dark` |
| StatusBadge | e.g. `bg-red-900/80` | `bg-red-950` (solid) |
| Mute / HTP buttons | `bg-black/30` | `bg-felt-rail` |

---

## 4. Roll Log Bottom Sheet

### 4.1 Architecture Decision

The current `RollLog` uses `position: fixed; bottom: 4; right: 4` — it floats outside the document flow entirely and covers the bottom-right of the table including the Crew Rail.

The replacement uses two separate DOM elements:

1. **The Trigger Tab** — an in-flow `flex-none` element inside the `TableBoard` flex column, positioned between the Chip Rail and the Crew Rail.
2. **The Sheet Drawer** — a `fixed inset-x-0 bottom-0` overlay that slides up via CSS `transform: translateY()` transition.

### 4.2 DOM Placement in `TableBoard.tsx`

The critical constraint is that the trigger must not overlap the Crew Rail. Since `TableBoard` is a `flex flex-col h-[100dvh]` container, inserting the trigger as a `flex-none` sibling immediately before the Crew Rail section guarantees it is always visually above the rail and never overlaid on it at rest.

**Current JSX order (simplified):**
```
<TableBoard>          ← flex flex-col h-[100dvh]
  ...
  <ChipRail />        ← flex-none (inside dice-zone wrapper)
  <RollLog />         ← currently fixed, outside flow
  <CrewRail />        ← flex-none, last child
</TableBoard>
```

**New JSX order:**
```
<TableBoard>
  ...
  <ChipRail />
  <RollLogTrigger />  ← NEW: flex-none, in flow, above crew rail
  <CrewRail />
  <RollLogDrawer />   ← NEW: fixed overlay, only visible when open
</TableBoard>
```

The `RollLog` component is refactored into two pieces exported from `RollLog.tsx`:

- **`RollLogTrigger`** — the always-visible tab that lives in the document flow
- **`RollLog`** — retains its existing export name; now renders both trigger (in-flow placeholder) and the fixed drawer

Or more precisely, `RollLog` becomes a compound component that renders the trigger in-flow where it is placed in JSX, and portals the drawer to `document.body` via `ReactDOM.createPortal` (or simply renders it in the same position — since `fixed` positioning is relative to the viewport, not the parent).

### 4.3 `RollLogTrigger` Specification

```
Height: 32px (h-8)
Background: bg-felt-dark (opaque, solid)
Border: border-t-2 border-felt-light
Padding: px-4
Layout: flex items-center justify-between
```

Left side of the trigger bar:
```
<span class="font-pixel text-[12px] text-gold tracking-widest">ROLL LOG</span>
```

Right side (chevron + unread count):
```
<div class="flex items-center gap-2">
  {unreadCount > 0 && (
    <span class="font-mono text-xs bg-gold text-black rounded-full px-1.5 leading-tight">
      {unreadCount}
    </span>
  )}
  <span class="font-pixel text-[12px] text-gray-400">{isOpen ? '▼' : '▲'}</span>
</div>
```

The **unread count badge** shows how many new receipts have arrived since the drawer was last opened. This gives players awareness of activity without the log always being visible. Clear count when drawer opens; increment on each new `rollHistory` entry while drawer is closed.

### 4.4 Drawer Specification

```css
/* Applied to the drawer wrapper */
position: fixed;
inset-x: 0;
bottom: 0;
z-index: 60;              /* above z-50 screen flash */
max-height: 75dvh;
background: #0f2a1d;      /* felt-dark */
border-top: 3px solid #256040;  /* felt-light */
transition: transform 300ms ease-out;

/* Collapsed */
transform: translateY(100%);

/* Expanded */
transform: translateY(0);
```

The `300ms ease-out` matches the existing `transition-all duration-300` convention used elsewhere in the project.

**Drawer header** (sticky at top of drawer):
```
height: 40px
font-pixel text-[12px] text-gold tracking-widest
"ROLL LOG" label + close button (×)
border-bottom: 1px solid felt-light
```

**Drawer body** (scrollable):
```
overflow-y: auto
overscroll-behavior: contain
padding: 0 16px 16px
max-height: calc(75dvh - 40px)
```

### 4.5 Receipt Typography (Updated)

Inside the drawer, all text switches to the Dense Text tier:

| Element | Current | New |
|---|---|---|
| Timestamp | `text-[8px] text-white/30 font-mono` | `font-mono text-xs text-gray-500` |
| Receipt line text | `text-[9px] font-mono` | `font-dense text-sm text-gray-200` |
| Net delta | `font-semibold text-[9px]` | `font-dense text-sm font-semibold` |
| Win prefix (+) | `text-green-400` | `text-green-400` (unchanged) |
| Loss prefix (−) | `text-red-400` | `text-red-400` (unchanged) |

### 4.6 State Management

The drawer's open/closed state lives inside the `RollLog` component itself as local `useState`. This keeps it self-contained and avoids polluting the Zustand store — **except** for the tutorial override case, which is handled via context (see Section 5).

```ts
const [isManualOpen, setIsManualOpen] = useState(false);
const tutorialCtx = useTutorialContext();
const isOpen = isManualOpen || (tutorialCtx?.forceRollLogOpen ?? false);
```

When the tutorial forces the drawer open, the user can still tap the trigger to close it manually (`isManualOpen` takes precedence once touched).

---

## 5. Tutorial State Synchronization

### 5.1 Problem Statement

`SpotlightMask` calls `document.querySelector('[data-tutorial-zone="<zone>"]')?.getBoundingClientRect()` to position the golden spotlight ring. If a future tutorial beat spotlights the Roll Log content, two things must happen:

1. The drawer must be fully open before `getBoundingClientRect()` runs — otherwise the zone element is off-screen and the rect has `{ top: 0, height: 0 }`.
2. The drawer must close automatically when the player advances past that beat.

### 5.2 Changes to `TutorialContextValue`

Extend the context interface in `TutorialContext.tsx`:

```ts
export interface TutorialContextValue {
  activeBeatMode:   BeatAdvanceMode | null;
  onBetChanged:     (field: BetField, newAmount: number) => void;
  forceRollLogOpen: boolean;                 // NEW — forces drawer open during spotlight
}
```

The provider (wherever `TutorialProvider` wraps the tree — currently inferred to be in `TutorialOverlay` or `App.tsx`) must supply this new field. When no beat is active or the active beat does not require the drawer, `forceRollLogOpen` is `false`.

### 5.3 Changes to `tutorialBeats.ts`

Add two new fields to `TutorialBeat`:

```ts
export interface TutorialBeat {
  // ... existing fields ...
  requiresDrawer?: 'roll-log';   // NEW — drawer that must be open before spotlight fires
  spotlightDelay?: number;       // NEW — ms to wait after drawer opens before positioning spotlight
}
```

Add `'roll-log'` to the `SpotlightZone` union:

```ts
export type SpotlightZone =
  | 'none'
  | 'game-status'
  | 'bankroll-zone'
  | 'betting-grid'
  | 'betting-passline'
  | 'betting-odds'
  | 'betting-hardways'
  | 'dice-zone'
  | 'crew-rail'
  | 'marker-progress'
  | 'hype-meter'
  | 'boss-portrait'
  | 'roll-log';                  // NEW
```

Any future beat that spotlights `'roll-log'` should set:
```ts
{
  spotlight: 'roll-log',
  requiresDrawer: 'roll-log',
  spotlightDelay: 350,           // drawer transition is 300ms + 50ms buffer
  // ...
}
```

### 5.4 TutorialOverlay Orchestration Logic

The component that manages beat advancement (TutorialOverlay — not read in this analysis but implied by the architecture) must be updated with this logic:

```
When activeBeat changes:
  1. If activeBeat.requiresDrawer === 'roll-log':
       a. Set forceRollLogOpen = true in context
       b. Wait activeBeat.spotlightDelay ms (default 0)
       c. THEN trigger SpotlightMask position calculation
  2. Else:
       a. Set forceRollLogOpen = false
       b. Trigger SpotlightMask position calculation immediately (no change from current)

When player advances past a beat that had requiresDrawer:
  1. Set forceRollLogOpen = false
     (drawer closes automatically via context → isOpen derivation in RollLog)
```

The `spotlightDelay` wait can be implemented with `setTimeout` inside a `useEffect` that watches `activeBeat`:

```ts
useEffect(() => {
  if (!activeBeat) return;
  const delay = activeBeat.spotlightDelay ?? 0;
  const timer = setTimeout(() => {
    recalculateSpotlight();   // existing spotlight positioning function
  }, delay);
  return () => clearTimeout(timer);
}, [activeBeat?.id]);
```

### 5.5 `data-tutorial-zone` Placement Inside the Drawer

The spotlight target element must be inside the drawer body (not the trigger) so that `getBoundingClientRect()` returns useful coordinates when the drawer is open:

```tsx
<div
  className="max-h-[calc(75dvh-40px)] overflow-y-auto overscroll-contain px-4 pb-4"
  data-tutorial-zone="roll-log"   // ← spotlight target
>
  {/* receipt list */}
</div>
```

When the drawer is closed (`transform: translateY(100%)`), this element is technically in the DOM but off-screen. The `forceRollLogOpen` + `spotlightDelay` mechanism ensures the spotlight never tries to target it in that state.

---

## 6. Implementation Order

These four sub-deliverables are largely independent but should be shipped in this order to minimize merge complexity:

1. **Typography foundation** (font addition to `index.html` + `tailwind.config.ts`) — zero visual risk, pure addition.
2. **Roll Log Bottom Sheet** — self-contained component refactor. No tutorial changes yet; the drawer opens/closes manually.
3. **Global contrast sweep** — systematic find-and-replace pass. Can be done in parallel with step 2 after step 1 is merged.
4. **Tutorial sync** — extends context + beat definitions. Depends on the drawer component from step 2 being stable.

---

## 7. Files to Modify

| File | Change |
|---|---|
| `apps/web/index.html` | Add `Space+Grotesk:wght@400;500;600` to Google Fonts request |
| `apps/web/tailwind.config.ts` | Add `dense` to `fontFamily` |
| `apps/web/src/index.css` | Add `.text-shadow-hard` utility |
| `apps/web/src/components/RollLog.tsx` | Full rewrite: `RollLogTrigger` + drawer sheet; accept `forceOpen` from context |
| `apps/web/src/components/TableBoard.tsx` | Replace `<RollLog />` with `<RollLogTrigger />` placed between ChipRail and CrewRail; keep `<RollLog />` for the drawer |
| `apps/web/src/contexts/TutorialContext.tsx` | Add `forceRollLogOpen: boolean` to `TutorialContextValue` |
| `apps/web/src/lib/tutorialBeats.ts` | Add `requiresDrawer?` and `spotlightDelay?` to `TutorialBeat`; add `'roll-log'` to `SpotlightZone` |
| `apps/web/src/components/tutorial/TutorialOverlay.tsx` | Add drawer-open orchestration logic + `spotlightDelay` handling |
| All components with low-opacity text | Contrast sweep per Section 3.2 replacement map |

---

## 8. What Is NOT Changing

- The Zustand store (`useGameStore.ts`) — no new fields for roll log open state.
- The `rollHistory` data structure in `@battlecraps/shared` — no changes to receipt format.
- The `BettingGrid`, `DiceZone`, `CrewPortrait` components — typography updates only (size/font class changes, no structural changes).
- The dice animation system (`index.css` keyframes) — fully exempt from the contrast sweep.
- The `SpotlightMask` positioning algorithm itself — only the timing of when it fires is changed (via `spotlightDelay`).
