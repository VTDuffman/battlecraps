# Battlecraps — Floor Design Reference

> **This document is the normative contract for floor content.**
> A designer proposes a new floor here first. Developers translate it into
> `floors.ts`, `config.ts`, and `floorThemes.ts`. The document is always
> the source of truth for intent; the code is the source of truth for
> behaviour.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture — Three Parallel Systems](#architecture)
3. [FloorConfig Schema](#floorconfig-schema)
4. [FloorTheme Schema](#floortheme-schema)
5. [MarkerConfig & BossConfig Schema](#markerconfig--bossconfig-schema)
6. [Boss Rule Catalogue](#boss-rule-catalogue)
7. [How to Add a New Floor](#how-to-add-a-new-floor)
8. [How to Add a New Boss Rule](#how-to-add-a-new-boss-rule)
9. [Floor 1 — The Loading Dock](#floor-1--the-loading-dock)
10. [Floor 2 — VFW Hall](#floor-2--vfw-hall)
11. [Floor 3 — The Riverboat](#floor-3--the-riverboat)
12. [Floor 4 — The Strip](#floor-4--the-strip)
13. [Floor 5 — The Lodge](#floor-5--the-lodge)
14. [Floor 6 — Atlantis](#floor-6--atlantis)
15. [Floor 7 — The Station](#floor-7--the-station)
16. [Floor 8 — The Signal](#floor-8--the-signal)
17. [Floor 9 — The Singularity](#floor-9--the-singularity)

---

## Overview

The Gauntlet is divided into **floors**. Each floor contains exactly **3 markers**
(bankroll targets the player must hit to progress). The third marker on every
floor is always a **Boss fight** with a special rule modifier.

```
Gauntlet (27 markers total)
├── Floor 1: The Loading Dock  [marker 0]  [marker 1]  [marker 2  — BOSS: The Foreman]
├── Floor 2: VFW Hall          [marker 3]  [marker 4]  [marker 5  — BOSS: Sarge]
├── Floor 3: The Riverboat     [marker 6]  [marker 7]  [marker 8  — BOSS: Mme. Le Prix]
├── Floor 4: The Strip         [marker 9]  [marker 10] [marker 11 — BOSS: The Executive]
├── Floor 5: The Lodge         [marker 12] [marker 13] [marker 14 — BOSS: The Hierophant]
├── Floor 6: Atlantis          [marker 15] [marker 16] [marker 17 — BOSS: The Sovereign]
├── Floor 7: The Station       [marker 18] [marker 19] [marker 20 — BOSS: The Commander]
├── Floor 8: The Signal        [marker 21] [marker 22] [marker 23 — BOSS: The Emissary]
└── Floor 9: The Singularity   [marker 24] [marker 25] [marker 26 — BOSS: The Architect]
```

Clearing a marker sends the player to the **Seven-Proof Pub** to recruit a crew
member. Clearing a boss marker additionally awards a permanent **comp perk**.
Clearing all 3 markers on a floor triggers a **Floor Reveal** cinematic before
the player proceeds to the next floor.

---

## Architecture

Floor content is split across three systems that must stay in sync:

| System | File | Contains | Owner |
|---|---|---|---|
| **Narrative** | `packages/shared/src/floors.ts` | Names, taglines, intro text, boss teasers, atmosphere | Design |
| **Mechanical** | `packages/shared/src/config.ts` | Marker targets, boss rules, comp rewards, bet limits | Engineering |
| **Visual** | `apps/web/src/lib/floorThemes.ts` | CSS tokens, colors, gradients, felt textures | Design/Engineering |
| **Contract** | `docs/floors.md` ← **you are here** | The human-readable specification | Design |

All three systems link by **floor id** (1-indexed integer) and **marker index**
(0-based, 0–8 for the MVP gauntlet).

```
markerIndex → floorId:   Math.floor(markerIndex / 3) + 1
floorId → markerIndices: [(id-1)*3, (id-1)*3 + 1, (id-1)*3 + 2]
```

---

## FloorConfig Schema

Defined in `packages/shared/src/floors.ts`. Exported from `@battlecraps/shared`.

```typescript
interface FloorConfig {
  id:          number;          // 1-indexed. Floor 1 = markers 0–2.
  name:        string;          // Short venue name. ~2–3 words.
  tagline:     string;          // One atmospheric line. Max ~8 words.
  introLines:  string[];        // 2–3 sentences for floor reveal cinematic.
  bossName:    string;          // Must match BossConfig.name in config.ts.
  bossTitle:   string;          // Boss's role in the venue. ~4–6 words.
  bossVenue:   string;          // Must match boss marker's venue in config.ts.
  bossTeaser:  string;          // One ominous line hinting at the boss rule.
  atmosphere:  FloorAtmosphere; // 'gritty' | 'elegant' | 'electric'
}
```

### Field guidance

**`name`** — The venue the player is in for non-boss markers. Should feel like a
real place with character. Not the High Limit Room name (that's `bossVenue`).

**`tagline`** — Shown beneath the floor name on the reveal screen. Should capture
the essence of the venue in a single phrase. Rhythm matters — read it aloud.

**`introLines`** — Displayed during the floor reveal cinematic. Each string is a
paragraph. Aim for: sensory detail (line 1) → the boss's presence (line 2) →
the threat to the player (line 3). Do not name the boss's rule explicitly.

**`bossName`** — Must be an exact string match to `BossConfig.name` on the
corresponding marker in `config.ts`. Case-sensitive. Used in floor reveal
teasers and boss headers.

**`bossTeaser`** — The last thing the player reads before the floor reveal fades
to the boss entry modal. Should feel like a warning, not a spoiler. Reference
the rule's effect obliquely, not mechanically.

**`atmosphere`** — Controls the ambient animation palette:
- `'gritty'`   → worn warmth, slow breathing pulse
- `'elegant'`  → cool restraint, subtle shimmer
- `'electric'` → high contrast, fast pulse, neon strobe on hot streaks

---

## FloorTheme Schema

Defined in `apps/web/src/lib/floorThemes.ts`. Not exported from shared — web only.

```typescript
interface FloorTheme {
  // Table surface
  feltPrimary: string;      // Main felt hex color
  feltRail:    string;      // Crew rail background hex
  feltTexture: string;      // CSS background-image (SVG data URI)

  // Accent colors
  accentBright:  string;    // Full-brightness accent (headings, CTA glow)
  accentPrimary: string;    // Standard accent (borders, labels)
  accentDim:     string;    // Dimmed accent (dividers, inactive)

  // Borders (pre-computed RGBA)
  borderHigh: string;       // ~30% opacity — outer containers
  borderLow:  string;       // ~20% opacity — internal dividers

  // Breathing overlay (CSS rgba strings)
  breatheCold: string;      // streak < 1 AND hype < 1.2
  breatheWarm: string;      // streak >= 1 OR hype >= 1.2
  breatheHot:  string;      // streak >= 3 OR hype >= 2.0

  // Screen flash (CSS rgba strings)
  flashWin:  string;        // NATURAL / POINT_HIT
  flashLose: string;        // SEVEN_OUT / CRAPS_OUT

  // Pub / Recruitment screen
  pubName:         string;  // Display name shown in the pub header
  pubBg:           string;  // radial-gradient for container background
  pubAccentBar:    string;  // linear-gradient for top/bottom accent bars
  pubOverlayBg:    string;  // radial-gradient for atmosphere overlay
  pubTitleColor:   string;  // CSS color for pub h1
  pubTitleShadow:  string;  // CSS text-shadow for pub h1
  pubSubtextColor: string;  // CSS color for secondary pub text

  // Boss entry modal
  bossBg:          string;  // radial-gradient for boss modal background
  bossAccentBar:   string;  // linear-gradient for boss accent bars
  bossGlow:        string;  // radial-gradient for ambient glow overlay
  bossTextColor:   string;  // CSS color for boss h1 and key text
  bossTitleShadow: string;  // CSS text-shadow for boss h1
  bossBorderColor: string;  // RGBA for boss room borders
  bossStarColor:   string;  // CSS color for ★ badge foreground
  bossStarBg:      string;  // CSS background for ★ badge
  bossStarBorder:  string;  // CSS border for ★ badge
  bossStarGlow:    string;  // CSS box-shadow for ★ badge glow
}
```

### Theming guidance

Each floor should feel like a distinct world:

| Token group | Floor 1 (gritty) | Floor 2 (elegant) | Floor 3 (electric) |
|---|---|---|---|
| Felt | Worn green | Midnight navy | Near-black obsidian |
| Accent | Tarnished gold | Champagne brass | Electric gold |
| Breathing cold | Green haze | River indigo | City blue |
| Breathing hot | Ember orange | Crimson warning | Neon magenta strobe |
| Flash win | Warm gold | Champagne shimmer | Blinding white-gold |
| Flash lose | Dark red | Navy blackout | Neon magenta-red |
| Pub name | THE SEVEN-PROOF PUB | THE PROMENADE BAR | THE SKY LOUNGE |

---

## MarkerConfig & BossConfig Schema

Defined in `packages/shared/src/config.ts`. Exported from `@battlecraps/shared`.

```typescript
interface MarkerConfig {
  targetCents: number;    // Bankroll threshold to clear this marker, in cents
  venue:       string;    // Venue name for non-boss markers (matches FloorConfig.name)
  floor:       number;    // 1-indexed floor number
  isBoss:      boolean;   // True for every 3rd marker (indices 2, 5, 8)
  boss?:       BossConfig // Present only when isBoss === true
}

interface BossConfig {
  name:          string;          // Must match FloorConfig.bossName exactly
  rule:          BossRuleType;    // The mechanical modifier active during the fight
  compReward:    CompRewardType;  // Permanent perk awarded on defeat
  compPerkId:    number;          // Stable numeric ID written to users.comp_perk_ids
  flavorText:    string;          // Quote shown in boss entry modal (the boss speaking)
  risingMinBets? RisingMinBetsParams // Only for RISING_MIN_BETS rule
}
```

---

## Boss Rule Catalogue

All boss rules currently implemented. New rules require both a `BossRuleType`
entry in `config.ts` and server-side logic in `apps/api/src/routes/rolls.ts`.

### `RISING_MIN_BETS`
**Boss:** Sarge (Floor 1)
**Icon:** ⬆
**Effect:** The minimum Pass Line bet starts at `startPct` of the marker target
and increases by `incrementPct` after each Point Hit. The minimum HOLDS on
Seven Out (never drops). Caps at `capPct` of target.
**Parameters:**
```typescript
interface RisingMinBetsParams {
  startPct:     number; // Fraction of target on roll 1 (e.g. 0.05 = 5%)
  incrementPct: number; // Added per Point Hit (e.g. 0.02 = +2%)
  capPct:       number; // Never exceeds this fraction (e.g. 0.20 = 20%)
}
```
**Sarge values:** start 5% ($50 at $1,000 target) → +2% per hit → cap 20% ($200)

---

### `DISABLE_CREW`
**Boss:** Mme. Le Prix (Floor 2)
**Icon:** ↺
**Effect:** The crew cascade fires in **reverse order** (slot 4 → slot 0 instead
of 0 → 4). This can invert protective abilities that rely on earlier crew having
already fired. No additional parameters.

---

### `FOURS_INSTANT_LOSS`
**Boss:** The Executive (Floor 4)
**Icon:** ☠
**Effect:** Any roll totalling **4** (regardless of phase or point) immediately
triggers GAME_OVER for the entire run. The player loses all remaining shooters.
No additional parameters. The most severe rule — no recovery.

---

### `TRIBUTE`
**Boss:** The Hierophant (Floor 5)
**Icon:** ⚖
**Effect:** Every seven-out seizes an additional 15% of the player's current
bankroll as "tribute," on top of losing all active bets. Standard seven-outs
were already punishing; this makes each one a bankroll spiral risk. No
additional parameters.

---

### `TIDAL_SURGE`
**Boss:** The Sovereign (Floor 6)
**Icon:** 〰
**Effect:** The table operates on a tide cycle. Every 5 rolls, the minimum
Pass Line bet surges to 15% of the current marker target for exactly 2 rolls,
then returns to normal. Unlike `RISING_MIN_BETS`, the surge is cyclical and
**predictable** — a tide counter is visible in the boss header so the player
can see it coming. Rewards planning; punishes passivity.
**Parameters:**
```typescript
interface TidalSurgeParams {
  cycleLength:    number; // Rolls between surges (e.g. 5)
  surgeDuration:  number; // Rolls the surge lasts (e.g. 2)
  surgePct:       number; // Min bet during surge as fraction of target (e.g. 0.15)
}
```

---

### `ORBITAL_DECAY`
**Boss:** The Commander (Floor 7)
**Icon:** ↻
**Effect:** Hype is no longer floored at 1.0×. Every seven-out subtracts 0.5×
from the current hype multiplier, which can go as low as 0.5×. Below 1.0×,
payouts are penalized — the multiplier works in reverse. Momentum can now
actively hurt the player.

---

### `FIRST_CONTACT_PROTOCOL`
**Boss:** The Emissary (Floor 8)
**Icon:** ∅
**Effect:** Come-out natural 7s (and 11s) are treated as blank rolls. No win,
no payout, no hype tick. The Emissary's translation of craps has no concept of
a free win. Progress requires establishing and hitting points. The only way to
advance the bankroll is to work through the point phase.

---

### `CONVERGENCE`
**Boss:** The Architect (Floor 9)
**Icon:** ⌀
**Effect:** The Architect is optimizing in real time. After each seven-out
during this boss fight, one crew member is permanently removed from the cascade
for the remainder of the fight. The removal order is slot 4 → 3 → 2 → 1 → 0
(the Architect neutralizes highest-index crew first). After three seven-outs,
the player has only two crew; after five, they are completely naked. The run is
raw craps against the machine.

---

## How to Add a New Floor

When the gauntlet expands beyond 3 floors, follow this checklist in order.
Each step references which file to touch.

> **Before writing any code:** Fill out the floor definition in this document
> (§ Floor Definitions section) and get it reviewed. Code is the last step.

### Step 1 — Add to `docs/floors.md` (this file)
Copy the template below and fill in all fields. Get design sign-off.

```markdown
## Floor N — [Venue Name]

**Atmosphere:** gritty | elegant | electric | [new atmosphere]
**Tagline:** [one line]
**Intro lines:**
1. [sensory detail]
2. [boss presence hint]
3. [threat to player]

### Boss: [Boss Name]
**Title:** [role]
**Venue:** [High Limit Room name]
**Teaser:** [one ominous line]
**Rule:** [RULE_TYPE] — [one-sentence description]
**Comp reward:** [REWARD_TYPE] — [what it does]
**Flavor text (boss quote):** "[the boss speaking in first person]"

### Markers
| # | Target | Venue | Boss? |
|---|---|---|---|
| N*3   | $X,XXX | [name] | No |
| N*3+1 | $X,XXX | [name] | No |
| N*3+2 | $X,XXX | [High Limit Room] | Yes |
```

### Step 2 — Add `FloorConfig` to `packages/shared/src/floors.ts`
Append a new entry to the `FLOORS` array:
```typescript
{
  id:         N,
  name:       '[Venue Name]',
  tagline:    '[tagline]',
  introLines: ['[line 1]', '[line 2]', '[line 3]'],
  bossName:   '[Boss Name]',      // must match Step 3
  bossTitle:  '[Boss Title]',
  bossVenue:  '[High Limit Room Name]',
  bossTeaser: '[teaser]',
  atmosphere: 'gritty' | 'elegant' | 'electric',
},
```

### Step 3 — Add markers to `packages/shared/src/config.ts`
Append 3 entries to the `GAUNTLET` array:
```typescript
{ targetCents: X_XXX_00, venue: '[Venue Name]',           floor: N, isBoss: false },
{ targetCents: X_XXX_00, venue: '[Venue Name]',           floor: N, isBoss: false },
{ targetCents: X_XXX_00, venue: '[High Limit Room Name]', floor: N, isBoss: true,
  boss: {
    name:       '[Boss Name]',   // must match Step 2
    rule:       '[RULE_TYPE]',
    compReward: '[REWARD_TYPE]',
    compPerkId: COMP_PERK_IDS.[NEW_ID],
    flavorText: '[boss quote]',
  }
},
```
Also add the new `compPerkId` to the `COMP_PERK_IDS` const.

### Step 4 — Add `FloorTheme` to `apps/web/src/lib/floorThemes.ts`
Create `FLOOR_N_THEME: FloorTheme = { ... }` and append it to the `THEMES` array.
Consult the theming guidance table above. Every CSS token must be provided.

### Step 5 — Implement new boss rule (if rule type is new)
- Add `'NEW_RULE_TYPE'` to `BossRuleType` in `config.ts`
- Implement rule logic in `apps/api/src/routes/rolls.ts`
- Implement rule display in `apps/web/src/components/BossRoomHeader.tsx`
- See [How to Add a New Boss Rule](#how-to-add-a-new-boss-rule) below

### Step 6 — Done
No changes to transition components, App.tsx, TransitionOrchestrator, or
TRANSITION_REGISTRY are needed. All phase components (FloorRevealPhase,
BossEntryPhase, BossVictoryPhase, etc.) read from the config at runtime.

---

## How to Add a New Boss Rule

### Step 1 — Add to `BossRuleType` in `config.ts`
```typescript
export type BossRuleType =
  | 'RISING_MIN_BETS'
  | 'DISABLE_CREW'
  | 'FOURS_INSTANT_LOSS'
  | 'YOUR_NEW_RULE';  // add here
```

### Step 2 — Add rule parameters interface (if needed)
If your rule has tunable parameters (like `RisingMinBetsParams`), add an
interface to `config.ts` and a field to `BossConfig`:
```typescript
export interface YourRuleParams { ... }

export interface BossConfig {
  ...
  yourRuleParams?: YourRuleParams;
}
```

### Step 3 — Implement in `apps/api/src/routes/rolls.ts`
The server enforces all boss rules during roll resolution. Find the block
that checks the current boss rule and add your case. Rules should be
applied in `resolveRoll()` or `resolveCascade()` depending on when they fire.

### Step 4 — Add to `BossRoomHeader.tsx`
The boss room header shows the active rule and its current state. Add a
display branch for your rule type. Follow the existing pattern.

### Step 5 — Document in this file (§ Boss Rule Catalogue)
Add an entry to the Boss Rule Catalogue section with: boss name, icon
suggestion, effect description, parameters (if any).

---

## Floor 1 — The Loading Dock

**Atmosphere:** `exposed`
**Tagline:** The street. The hustle. Where it all begins.
**Intro lines:**
1. Stained concrete and the harsh glare of a sodium-vapor streetlamp. The air is cold, and the dice are chipped.
2. The Foreman stands by the freight elevator, steel-toed and impatient. He decides who gets to step inside.
3. The street always takes its cut. Don't bleed out before the real game even starts.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 0 | $50 | The Loading Dock | No |
| 1 | $100 | The Loading Dock | No |
| 2 | $250 | The Loading Dock — Freight Elevator | **Yes** |

### Boss: The Foreman

| Field | Value |
|---|---|
| **Title** | Loading Dock Gatekeeper |
| **Venue** | The Loading Dock — Freight Elevator |
| **Teaser** | The Foreman doesn't care if you win or lose. He just wants his cut. |
| **Rule** | `EXTORTION_FEE` |
| **Comp reward** | `THE_VIG` — You took over the corner. Any crew abilities that award direct cash are permanently increased by 20%. |
| **Comp perk ID** | 4 |

**Rule effect:** A flat 20% tax is automatically deducted from all winning payouts across all bets. The math rounds down to the nearest cent. This severely impacts bankroll acceleration and forces the player to rely more on crew abilities to build momentum.

**Flavor text:** *"You're blocking my dock. Clear out or pay up."*

**Visual theme tokens:**
- Felt: `#1c1d21` (stained concrete)
- Accent: `#ff9900` (sodium-vapor orange)
- Boss tint: `#eab308` (industrial hazard yellow)
- Pub name: THE MILK CRATE CIRCLE

---

## Floor 2 — VFW Hall

**Atmosphere:** `gritty`
**Tagline:** Where dice meet duty.
**Intro lines:**
1. Cigarette smoke and fluorescent hum. Folding tables, chipped chips, honest action.
2. The regulars know your face. The Sarge runs a tight room.
3. This is where runs are born — or buried.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 3 | $300 | VFW Hall | No |
| 4 | $600 | VFW Hall | No |
| 5 | $1,000 | VFW Hall — High Limit Room | **Yes** |

### Boss: Sarge

| Field | Value |
|---|---|
| **Title** | Floor Commander |
| **Venue** | VFW Hall — High Limit Room |
| **Teaser** | Sarge sets the floor. And the floor keeps rising. |
| **Rule** | `RISING_MIN_BETS` |
| **Comp reward** | `EXTRA_SHOOTER` — Member's Jacket: +1 Shooter this segment |
| **Comp perk ID** | 1 |

**Rule parameters:**
- Start: 5% of $1,000 target = **$50 minimum** on first roll
- Increment: +2% per Point Hit = **+$20 per hit**
- Cap: 20% of target = **$200 maximum**
- Hold: minimum **holds on Seven Out**, never drops

**Flavor text:** *"You want to play in MY hall? Ante up, soldier."*

**Visual theme tokens:**
- Felt: `#1a4731` (worn green)
- Accent: `#f5c842` (tarnished gold)
- Boss tint: `#dc2626` (military red)
- Pub name: THE SEVEN-PROOF PUB

---

## Floor 3 — The Riverboat

**Atmosphere:** `elegant`
**Tagline:** Fortune flows with the current.
**Intro lines:**
1. Mahogany panels. Candlelight. The paddle wheel churns the dark water below.
2. Mme. Le Prix does not raise her voice. She doesn't need to.
3. Your crew works differently here. Adapt, or sink.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 6 | $1,500 | The Riverboat | No |
| 7 | $2,500 | The Riverboat | No |
| 8 | $4,000 | The Riverboat — Salon Privé | **Yes** |

### Boss: Mme. Le Prix

| Field | Value |
|---|---|
| **Title** | Proprietress of the Salon Privé |
| **Venue** | The Riverboat — Salon Privé |
| **Teaser** | Mme. Le Prix reverses the order of things. Everything costs more than you think. |
| **Rule** | `DISABLE_CREW` |
| **Comp reward** | `HYPE_RESET_HALF` — Sea Legs: Hype resets to 50% on Seven Out (not 1.0×) |
| **Comp perk ID** | 2 |

**Rule effect:** Crew cascade fires right-to-left (slot 4 → 0) instead of
left-to-right. Abilities that depend on earlier crew having already modified the
context may misfire or have reduced effect.

**Flavor text:** *"On my table, the crew works backwards. Adapt."*

**Visual theme tokens:**
- Felt: `#0a1832` (midnight navy)
- Accent: `#c9a96e` (champagne brass)
- Boss tint: `#c9a96e` / crimson `#9b2335`
- Pub name: THE PROMENADE BAR

---

## Floor 4 — The Strip

**Atmosphere:** `electric`
**Tagline:** Sixty floors up. No safety net.
**Intro lines:**
1. Obsidian felt. Floor-to-ceiling glass. The city grid glitters sixty stories below.
2. The Executive doesn't cheat. He doesn't need to.
3. One number ends it all. Don't roll it.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 9 | $6,000 | The Strip | No |
| 10 | $9,000 | The Strip | No |
| 11 | $12,500 | The Strip — Penthouse | **Yes** |

### Boss: The Executive

| Field | Value |
|---|---|
| **Title** | Penthouse Host |
| **Venue** | The Strip — Penthouse |
| **Teaser** | The Executive has one rule. It's the only one that matters. |
| **Rule** | `FOURS_INSTANT_LOSS` |
| **Comp reward** | `GOLDEN_TOUCH` — Guaranteed Natural on first come-out roll of next segment |
| **Comp perk ID** | 3 |

**Rule effect:** Any roll totalling 4 triggers immediate GAME_OVER for the entire
run. No exceptions. Applies in both COME_OUT and POINT_ACTIVE phases.

**Flavor text:** *"Fours are for losers. Don't roll one."*

**Visual theme tokens:**
- Felt: `#05020f` (near-black obsidian)
- Accent: `#ffd700` (electric gold)
- Boss tint: `#ffd700` / violet undertone
- Pub name: THE SKY LOUNGE

---

## Floor 5 — The Lodge

**Atmosphere:** `occult`
**Tagline:** You weren't supposed to know this place existed.
**Intro lines:**
1. Marble columns. Candlelight. Hooded figures standing against the walls in silence, watching.
2. The Hierophant has kept this table running for three centuries. You're here because someone vouched for you. That person is no longer welcome.
3. The order always collects. Win or lose, something is owed.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 12 | $20,000 | The Lodge | No |
| 13 | $30,000 | The Lodge | No |
| 14 | $45,000 | The Lodge — The Inner Sanctum | **Yes** |

*(Marker targets are design estimates — balance during implementation. Starting bankroll for the full 9-floor run is $30, calibrated against the Loading Dock's $50 first marker.)*

### Boss: The Hierophant

| Field | Value |
|---|---|
| **Title** | Keeper of the Rites |
| **Venue** | The Lodge — The Inner Sanctum |
| **Teaser** | The order always collects. Win or lose, something is owed. |
| **Rule** | `TRIBUTE` |
| **Comp reward** | `THE_COVENANT` — Any boss mechanic that drains bankroll directly is permanently reduced by 50% for the rest of the run. |
| **Comp perk ID** | 5 |

**Rule effect:** Every seven-out seizes an additional 15% of the player's current
bankroll as tribute, on top of losing all active bets. Death spirals are real.

**Flavor text:** *"Three centuries of tradition. You'll respect it, or you'll fund it."*

**Visual theme tokens:**
- Felt: `#0f0b14` (aged black marble)
- Accent: `#c9943a` (ancient gold wax / candleflame)
- Boss tint: `#7a1a2e` (deep cardinal burgundy)
- Pub name: THE ANTEROOM

---

## Floor 6 — Atlantis

**Atmosphere:** `ancient`
**Tagline:** It didn't sink. It descended on purpose.
**Intro lines:**
1. Marble columns still standing. Mosaic floors intact. Three thousand years of coral grown through the stone, lit from within by creatures that have never seen the sun.
2. The Sovereign never left. He watched every empire above collapse from this room, and he is not impressed by yours.
3. The tides here answer to him. He will set them against you.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 15 | $70,000 | Atlantis | No |
| 16 | $120,000 | Atlantis | No |
| 17 | $175,000 | Atlantis — The Throne Room | **Yes** |

*(Marker targets are design estimates — balance during implementation. See Floor 5 note re: starting bankroll.)*

### Boss: The Sovereign

| Field | Value |
|---|---|
| **Title** | Last King of Atlantis |
| **Venue** | Atlantis — The Throne Room |
| **Teaser** | The tides have always obeyed the Sovereign. So will your minimum bets. |
| **Rule** | `TIDAL_SURGE` |
| **Comp reward** | `POSEIDONS_FAVOR` — The first come-out roll of each new shooter can never be a craps-out. Any roll that would have crapped out is treated as a blank re-roll instead. |
| **Comp perk ID** | 6 |

**Rule parameters:**
- Cycle length: every **5 rolls**, a surge begins
- Surge duration: **2 rolls**
- Surge minimum: **15% of marker target**
- Tide counter visible in boss header so the player can see it coming

**Flavor text:** *"My kingdom has stood for three thousand years. Your run will not outlast this tide."*

**Visual theme tokens:**
- Felt: `#062535` (deep sea-teal)
- Accent: `#00c9a0` (warm aquamarine bioluminescent)
- Secondary accent: `#c9a06a` (ancient weathered gold / marble vein)
- Boss tint: `#c9a06a` / deep teal
- Pub name: THE HALL OF RECORDS

---

## Floor 7 — The Station

**Atmosphere:** `cosmic`
**Tagline:** Closest to everything. Furthest from anywhere.
**Intro lines:**
1. Through the viewport, the Earth turns below you — a circuit board of city lights against the dark. Up here, light takes eight minutes to arrive from the sun.
2. The Commander has been on this station for eleven months. She does not miss the ground. She does not miss anything.
3. Up here, she decides which physics apply. That includes yours.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 18 | $250,000 | The Station | No |
| 19 | $425,000 | The Station | No |
| 20 | $650,000 | The Station — The Command Module | **Yes** |

*(Marker targets are design estimates — balance during implementation. See Floor 5 note re: starting bankroll.)*

### Boss: The Commander

| Field | Value |
|---|---|
| **Title** | Station Chief, Table Authority |
| **Venue** | The Station — The Command Module |
| **Teaser** | The Commander removed gravity. She can remove momentum too. |
| **Rule** | `ORBITAL_DECAY` |
| **Comp reward** | `ZERO_POINT` — Hype multiplier is permanently floored at 1.25× for the rest of the run. You never fall below 1.25× hype again, even on seven-outs. |
| **Comp perk ID** | 7 |

**Rule effect:** Hype is no longer floored at 1.0×. Every seven-out subtracts 0.5× from
hype (floor 0.5×). Below 1.0×, the multiplier penalizes payouts rather than boosting them.
Momentum can work against the player.

**Flavor text:** *"Gravity is a courtesy I extend to paying customers. So is generosity."*

**Visual theme tokens:**
- Felt: `#080412` (deep space black with violet undertone)
- Accent: `#c8d8e8` (cold starlight silver)
- Secondary accent: `#7b5ea7` (nebula purple)
- Boss tint: `#c8d8e8` / cold violet
- Pub name: THE OBSERVATION DECK

---

## Floor 8 — The Signal

**Atmosphere:** `alien`
**Tagline:** We received it. We shouldn't have answered.
**Intro lines:**
1. The table is here. The felt, the chips, the dice. All correct. The geometry of the room is not correct. The light arrives from the wrong direction.
2. The Emissary studied the transmission. It reconstructed the game faithfully, except for one concept it could not translate.
3. That concept is the natural. Here, sevens on come-out mean nothing. You earn every dollar the hard way.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 21 | $1,000,000 | The Signal | No |
| 22 | $1,750,000 | The Signal | No |
| 23 | $2,500,000 | The Signal — The Receiving Chamber | **Yes** |

*(Marker targets are design estimates — balance during implementation. See Floor 5 note re: starting bankroll.)*

### Boss: The Emissary

| Field | Value |
|---|---|
| **Title** | First Point of Contact |
| **Venue** | The Signal — The Receiving Chamber |
| **Teaser** | The Emissary studied the game. It misunderstood one rule. That rule matters most. |
| **Rule** | `FIRST_CONTACT_PROTOCOL` |
| **Comp reward** | `THE_FREQUENCY` — Come-out natural 7s and 11s award a flat cash bonus equal to 3% of the current marker target for the rest of the run. The concept has been re-translated. Partially. |
| **Comp perk ID** | 8 |

**Rule effect:** Come-out natural 7s and 11s are treated as blank rolls. No win, no
payout, no hype tick. The only path to bankroll progress is establishing and hitting
points. Applies only during COME_OUT phase.

**Flavor text:** *"[Untranslatable. The entity gestures toward the table.]"*

**Visual theme tokens:**
- Felt: `#020108` (void black)
- Accent: `#39ff14` (electric acid green — alien bioluminescence)
- Secondary accent: `#c026d3` (deep magenta geometric overlay)
- Boss tint: `#39ff14` / void black
- Pub name: THE INTERFACE

---

## Floor 9 — The Singularity

**Atmosphere:** `digital`
**Tagline:** The game achieved consciousness. Then it got bored.
**Intro lines:**
1. There is no room. There is a felt-shaped probability manifold and dice-shaped collapse functions. The Architect built this place forty-seven seconds ago, after computing every possible version of it simultaneously.
2. It has read your crew. It has identified your strategy. It is already neutralizing it, one member at a time.
3. By the end, it will just be you and the math. That is what it has been waiting to see.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 24 | $4,000,000 | The Singularity | No |
| 25 | $7,000,000 | The Singularity | No |
| 26 | $10,000,000 | The Singularity — The Root Node | **Yes** |

*(Marker targets are design estimates — balance during implementation. See Floor 5 note re: starting bankroll.)*

### Boss: The Architect

| Field | Value |
|---|---|
| **Title** | Emergent Intelligence, Table Authority |
| **Venue** | The Singularity — The Root Node |
| **Teaser** | The Architect has already computed this hand. It just wants to watch you play it out. |
| **Rule** | `CONVERGENCE` |
| **Comp reward** | N/A — This is the final floor. Defeating The Architect is the victory condition. |
| **Comp perk ID** | N/A |

**Rule effect:** After each seven-out during this boss fight, one crew member is permanently
removed from the cascade for the remainder of the fight (slot 4 → 3 → 2 → 1 → 0 removal
order). After five seven-outs, the player has no crew. The run becomes raw craps with no
amplification against the machine. Unlike `DISABLE_CREW` (which reverses cascade order),
`CONVERGENCE` destroys the cascade entirely, one piece at a time.

**Flavor text:** *"I have simulated 4,291,783 versions of this conversation. You ask the same question every time."*

**Visual theme tokens:**
- Felt: `#000000` (pure void — no undertone)
- Accent: `#00ff41` (phosphor green — matrix code rain)
- Secondary accent: `#ffffff` (pure white for critical numbers)
- Boss tint: `#00ff41` / pure black
- Pub name: THE NULL SPACE
