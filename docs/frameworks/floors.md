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
12. [Floor 4 — The Suite](#floor-4--the-suite)
13. [Floor 5 — The Lodge](#floor-5--the-lodge)
14. [Floor 6 — Atlantis](#floor-6--atlantis)
15. [Floor 7 — The Station](#floor-7--the-station)
16. [Floor 8 — The Signal](#floor-8--the-signal)
17. [Floor 9 — The Null Space](#floor-9--the-null-space)

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
├── Floor 4: The Suite         [marker 9]  [marker 10] [marker 11 — BOSS: The Executive]
├── Floor 5: The Lodge         [marker 12] [marker 13] [marker 14 — BOSS: The Hierophant]
├── Floor 6: Atlantis          [marker 15] [marker 16] [marker 17 — BOSS: The Sovereign]
├── Floor 7: The Station       [marker 18] [marker 19] [marker 20 — BOSS: The Commander]
├── Floor 8: The Signal        [marker 21] [marker 22] [marker 23 — BOSS: The Emissary]
└── Floor 9: The Null Space    [marker 24] [marker 25] [marker 26 — BOSS: The Architect]
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
  name:            string;          // Must match FloorConfig.bossName exactly
  title:           string;          // Must match FloorConfig.bossTitle exactly
  dreadTagline:    string;          // Bark on the dread screen
  entryLines:      string[];        // 2–3 lines of boss dialogue (entry screen)
  ruleBlurb:       string;          // Player-facing rule explanation
  ruleHeaderText:  string;          // Persistent banner during the fight
  rule:            BossRuleType;    // The mechanical modifier active during the fight
  ruleParams:      BossRuleParams;  // Typed params for the rule
  compReward:      CompRewardType;  // Permanent perk awarded on defeat ('NONE' on Floor 9)
  compPerkId:      number;          // Appended to runs.comp_perk_ids (0 for slot comps)
  compName / compDescription / compFanLabel; victoryQuote; defeatAnnouncement
  // Full definition: BossConfig in packages/shared/src/config.ts
}
```

---

## Boss Rule Catalogue

Mechanics are documented in full in [`boss_framework.md`](boss_framework.md), which is the canonical reference. Summary:

| Rule | Boss (Floor) | Effect |
|---|---|---|
| `EXTORTION_FEE` | The Foreman (1) | 20% tax on winning profit |
| `DOUBLE_TIME` | Sarge (2) | Roll clock: hit the point within 6 rolls or the 6th blank counts as a Seven-Out |
| `DISABLE_CREW` | Mme. Le Prix (3) | One random crew member charmed per come-out, sits out until the point resolves |
| `CROSS_CALIBRATION` | The Executive (4) | Performance rating 0–4; +15% at Exceptional; bad roll at Action Required ends the run |
| `TRIBUTE` | The Hierophant (5) | Crew cash held until a win, paid with Hype; 75% seized on Seven-Out |
| `TIDAL_SURGE` | The Sovereign (6) | Tide LOW/EBB/HIGH/FLOW (1×/2×/3×/2× min bet), advances each come-out |
| `ORBITAL_DECAY` | The Commander (7) | Tiered Seven-Out Hype drain (0.4/0.6/0.8×), floor 0.25×, death spiral below 0.75× / 0.5× |
| `TRANSMISSION_DELAY` | The Emissary (8) | Crew cash held one roll; all of it evaporates on Seven-Out |
| `CONVERGENCE` | The Architect (9) | Each Seven-Out removes the last crew member to fire; 15% compounding cash cut |

Retired rule types kept in the union for historical safety: `FIRST_CONTACT_PROTOCOL` (old Emissary — naturals nullified). `FOURS_INSTANT_LOSS` (old Executive) has been removed.

---

## How to Add a New Floor

When adding a floor, follow this checklist in order (see also `floor-addition-checklist.md`).
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

The step-by-step checklist (rule type, `BossRuleParams` union member, hook file
and registry, inline `rolls.ts` logic, `BossRoomHeader` display branch, comp
card, docs) lives in [`boss_framework.md` § Adding a New Boss](boss_framework.md#adding-a-new-boss).

---

> **Floor sections below are generated from `packages/shared/src/floors.ts` and `config.ts`** (narrative, markers, boss copy). The *Visual theme tokens* are the original design intent — `apps/web/src/lib/floorThemes.ts` is authoritative where they differ (e.g. Floor 9 shipped as a light "white paper" theme).

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
| 2 | $200 | The Loading Dock — Freight Elevator | **Yes** |

### Boss: The Foreman

| Field | Value |
|---|---|
| **Title** | Loading Dock Gatekeeper |
| **Venue** | The Loading Dock — Freight Elevator |
| **Teaser** | The Foreman doesn't care if you win or lose. He just wants his cut. |
| **Dread tagline** | PAY UP. |
| **Rule** | `EXTORTION_FEE` |
| **Comp reward** | `THE_VIG` — The Vig: You took over the corner. Crew cash abilities pay out 20% more. |
| **Comp perk ID** | 4 |

**Rule effect:** 20% of the profit on every winning payout is taxed (rounded to the dollar). Losing rolls are untaxed.

**Entry lines:**
> You're blocking my dock.
> I don't care who you are or how good you shoot.
> Twenty percent off the top. Every time. Non-negotiable.

**Victory quote:** *"…you got lucky. Don't let me catch you around here again."*

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
| 4 | $500 | VFW Hall | No |
| 5 | $1,000 | VFW Hall — High Limit Room | **Yes** |

### Boss: Sarge

| Field | Value |
|---|---|
| **Title** | The Pit Boss |
| **Venue** | VFW Hall — High Limit Room |
| **Teaser** | Sarge runs on a clock. Six rolls to make your point — not one more. |
| **Dread tagline** | DOUBLE TIME. |
| **Rule** | `DOUBLE_TIME` |
| **Comp reward** | `EXTRA_SHOOTER` — Member's Jacket: +1 SHOOTER at every marker for the rest of the run — they know you earned your seat. |
| **Comp perk ID** | 1 |

**Rule effect:** Once a point is set, the shooter has 6 rolls to hit it. If the 6th roll is a blank, Sarge calls TIME'S UP and it counts as a Seven-Out (bets lost, shooter lost). Crew that react to a dice Seven-Out don't trigger.

**Entry lines:**
> You want to shoot in MY hall? You shoot on MY clock.
> Six rolls to make your point. Not seven. Six.
> Dawdle and you're out, soldier.

**Victory quote:** *"…not bad, soldier. Dismissed."*

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
3. In the Salon Privé, she will look at one of your crew and that will be enough. They won't hear a word you say until the point resolves.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 6 | $1,500 | The Riverboat | No |
| 7 | $2,000 | The Riverboat | No |
| 8 | $4,000 | The Riverboat — Salon Privé | **Yes** |

### Boss: Mme. Le Prix

| Field | Value |
|---|---|
| **Title** | Madame of the Salon Privé |
| **Venue** | The Riverboat — Salon Privé |
| **Teaser** | Mme. Le Prix does not silence your crew. She simply looks at one of them. |
| **Dread tagline** | HOW CHARMING. |
| **Rule** | `DISABLE_CREW` |
| **Comp reward** | `HYPE_RESET_HALF` — The Keepsake: Something of hers stays with you. On Seven Out, you keep half your Hype above 1.0× instead of resetting — 2.0× drops to 1.5×, not 1.0×. |
| **Comp perk ID** | 2 |

**Rule effect:** The Enchantment: before each come-out one random crew member is charmed (❤️) and sits out the cascade through the point phase; a new one is chosen when the point resolves.

**Entry lines:**
> Bienvenue. You may sit.
> Your crew is welcome here — most of them.
> Every come-out, one of yours will be... occupied with other things.

**Victory quote:** *"…improbable. You may keep your winnings."*

**Visual theme tokens:**
- Felt: `#0a1832` (midnight navy)
- Accent: `#c9a96e` (champagne brass)
- Boss tint: `#c9a96e` / crimson `#9b2335`
- Pub name: THE PROMENADE BAR

---

## Floor 4 — The Suite

**Atmosphere:** `electric`
**Tagline:** Sixty floors up. No safety net.
**Intro lines:**
1. Obsidian felt. Floor-to-ceiling glass. The city grid glitters sixty stories below.
2. The Executive doesn't cheat. He doesn't need to.
3. Your performance is being evaluated. It always has been.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 9 | $5,000 | The Suite | No |
| 10 | $7,500 | The Suite | No |
| 11 | $15,000 | The Suite — Corner Office | **Yes** |

### Boss: The Executive

| Field | Value |
|---|---|
| **Title** | CFO, High Limit Division |
| **Venue** | The Suite — Corner Office |
| **Teaser** | The Executive runs a performance review. Every roll updates your rating. Slip to Action Required and roll badly — and you're terminated. |
| **Dread tagline** | YOUR REVIEW IS PENDING. |
| **Rule** | `CROSS_CALIBRATION` |
| **Comp reward** | `BOARD_SEAT` — Board Seat: A fourth crew slot unlocks. Expand your operation. |
| **Comp perk ID** | 0 (slot comp — enforced via `unlockedSlots`) |

**Rule effect:** Performance Review rating 0–4, starting at 2 (Strong). Natural/Point Hit +1, Craps Out/Seven-Out −1. At 4 (Exceptional) winning payouts get +15% of gross profit. A bad roll at 0 (Action Required) ends the run (Pink Slip).

**Entry lines:**
> Sit down. We've been expecting you.
> We've been tracking your performance metrics.
> Every roll moves the needle — one way or another.

**Victory quote:** *"…restructuring was inevitable. Well played."*

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
| 12 | $30,000 | The Lodge | No |
| 13 | $50,000 | The Lodge | No |
| 14 | $100,000 | The Lodge — The Inner Sanctum | **Yes** |

### Boss: The Hierophant

| Field | Value |
|---|---|
| **Title** | Keeper of the Rites |
| **Venue** | The Lodge — The Inner Sanctum |
| **Teaser** | The order always collects. Win or lose, something is owed. |
| **Dread tagline** | THE ORDER COLLECTS. |
| **Rule** | `TRIBUTE` |
| **Comp reward** | `THE_COVENANT` — The Covenant: The Hierophant's tribute on Seven Out is halved. |
| **Comp perk ID** | 5 |

**Rule effect:** Crew cash bonuses pile up in the offering bowl until you win a roll (Natural or Point Hit), then come back multiplied by your Hype. On a Seven-Out the whole offering settles at once and 75% is seized as tribute.

**Entry lines:**
> You were vouched for. That person is no longer welcome.
> Three centuries of tradition: what your crew earns is offered to the order until you win.
> Seven out, and the order keeps three quarters. Every time.

**Victory quote:** *"…the rites acknowledge your offering. Leave before the observers decide otherwise."*

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
| 15 | $150,000 | Atlantis | No |
| 16 | $250,000 | Atlantis | No |
| 17 | $500,000 | Atlantis — The Throne Room | **Yes** |

### Boss: The Sovereign

| Field | Value |
|---|---|
| **Title** | Last King of Atlantis |
| **Venue** | Atlantis — The Throne Room |
| **Teaser** | The tides have always obeyed the Sovereign. So will your minimum bets. |
| **Dread tagline** | THE TIDE TURNS. |
| **Rule** | `TIDAL_SURGE` |
| **Comp reward** | `POSEIDONS_FAVOR` — Poseidon's Favor: The first roll of each shooter can never craps-out — a 2, 3 or 12 doesn't count and your Pass Line stays up. |
| **Comp perk ID** | 6 |

**Rule effect:** A four-stage tide advances each come-out: LOW (1× table minimum) → EBB (2×) → HIGH (3×) → FLOW (2×). Under-minimum come-out bets are rejected.

**Entry lines:**
> Three thousand years. Every empire above you has collapsed from here.
> My table runs on a tide. It turns with every come-out.
> You can see it coming. That was never the point.

**Victory quote:** *"…the tide will return. It always does."*

**Visual theme tokens:**
- Felt: `#062535` (deep sea-teal)
- Accent: `#00c9a0` (warm aquamarine bioluminescent)
- Secondary accent: `#c9a06a` (ancient weathered gold / marble vein)
- Boss tint: `#c9a06a` / deep teal
- Pub name: THE HALL OF RECORDS

---

## Floor 7 — The Station

**Atmosphere:** `cosmic`
**Tagline:** Momentum decays. Everything does, up here.
**Intro lines:**
1. The viewport shows nothing but stars and the slow curve of the Earth below. Everything else is silence and the hum of life support.
2. The Commander has been at this table for eleven months. She does not miss the ground.
3. Up here, momentum is a resource. And resources decay.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 18 | $1,000,000 | The Station | No |
| 19 | $1,500,000 | The Station | No |
| 20 | $3,000,000 | The Station — The Command Module | **Yes** |

### Boss: The Commander

| Field | Value |
|---|---|
| **Title** | Station Chief, Table Authority |
| **Venue** | The Station — The Command Module |
| **Teaser** | Every seven-out drains your hype multiplier. There is no floor — until there is. |
| **Dread tagline** | MOMENTUM DECAYS. |
| **Rule** | `ORBITAL_DECAY` |
| **Comp reward** | `CARGO_HOLD` — Cargo Hold: A fifth crew slot unlocks. Full crew capacity reached. |
| **Comp perk ID** | 0 (slot comp — enforced via `unlockedSlots`) |

**Rule effect:** Each Seven-Out drains Hype by 0.4× (below 1.5×), 0.6× (Heating Up) or 0.8× (On Fire), down to a floor of 0.25×. Death spiral: below 0.75× one crew slot stops firing; below 0.5× the max bet is halved.

**Entry lines:**
> Eleven months up here. I don't miss the ground.
> Your hype is a resource. In this environment, resources decay faster at altitude.
> The higher you climb, the steeper the fall. There is no floor — until there is.

**Victory quote:** *"…orbital mechanics didn't account for you. Gravity's compliments."*

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
1. The table is here. The felt, the chips, the dice — all correct. The geometry of the room is not correct. The light arrives from the wrong direction.
2. The Emissary studied the transmission for eleven years. It reconstructed the game faithfully, except for one concept it could not translate.
3. What it couldn't translate was delay. Your crew's earnings don't pay out immediately — they arrive one roll later. Seven-out before then, and the signal is lost entirely.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 21 | $5,000,000 | The Signal | No |
| 22 | $7,500,000 | The Signal | No |
| 23 | $15,000,000 | The Signal — The Receiving Chamber | **Yes** |

### Boss: The Emissary

| Field | Value |
|---|---|
| **Title** | First Point of Contact |
| **Venue** | The Signal — The Receiving Chamber |
| **Teaser** | The Emissary understands the game. It simply can't process your crew's earnings in real time. |
| **Dread tagline** | WE SHOULD NOT HAVE ANSWERED. |
| **Rule** | `TRANSMISSION_DELAY` |
| **Comp reward** | `THE_FREQUENCY` — The Frequency: Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run. |
| **Comp perk ID** | 8 |

**Rule effect:** Crew cash bonuses are held one roll. On a Seven-Out the whole escrow — including that roll's bonuses — evaporates. Naturals resolve normally.

**Entry lines:**
> The table is here. The felt, the chips, the dice. All correct.
> Your crew's signals arrive one step behind. Everything echoes.
> It has no concept of free money. When the shooter dies, the echo dies with them.

**Victory quote:** *"[The entity pauses for 0.3 seconds. This is the equivalent of applause.]"*

**Visual theme tokens:**
- Felt: `#020108` (void black)
- Accent: `#39ff14` (electric acid green — alien bioluminescence)
- Secondary accent: `#c026d3` (deep magenta geometric overlay)
- Boss tint: `#39ff14` / void black
- Pub name: THE INTERFACE

---

## Floor 9 — The Null Space

**Atmosphere:** `digital`
**Tagline:** End of line.
**Intro lines:**
1. Pure black. No felt texture, no ambient light, no sound. Just the table, the dice, and the cursor blinking at the end of a very long terminal session.
2. The Architect built this place from the data of every run ever played. He knows your patterns. He designed this room specifically for you.
3. Every seven-out, one of your crew is reclaimed. The table has infinite patience. You do not.

### Markers

| Index | Target | Venue | Boss? |
|---|---|---|---|
| 24 | $20,000,000 | The Null Space | No |
| 25 | $30,000,000 | The Null Space | No |
| 26 | $60,000,000 | The Null Space — The Zero Chamber | **Yes** |

### Boss: The Architect

| Field | Value |
|---|---|
| **Title** | Designer of the Null Space |
| **Venue** | The Null Space — The Zero Chamber |
| **Teaser** | The Architect reclaims your crew one by one — a seven-out at a time — until you roll alone. |
| **Dread tagline** | YOUR CREW IS TEMPORARY. |
| **Rule** | `CONVERGENCE` |
| **Comp reward** | None — the final floor; defeating The Architect wins the run. |
| **Comp perk ID** | N/A |

**Rule effect:** Each Seven-Out permanently removes one crew member — the last one that fired (or the highest occupied slot if none fired). Each Seven-Out also compounds a 15% cut to crew cash bonuses. With no crew left, it's naked craps.

**Entry lines:**
> You've been here before. This table was built from the pattern you left behind.
> Every seven-out, one of them disappears. Not gone — just reclaimed.
> By the fifth, you'll be rolling alone. The table will still be here. Will you?

**Victory quote:** *"…the pattern was incomplete after all. Interesting."*

**Visual theme tokens:**
- Felt: `#000000` (pure void — no undertone)
- Accent: `#00ff41` (phosphor green — matrix code rain)
- Secondary accent: `#ffffff` (pure white for critical numbers)
- Boss tint: `#00ff41` / pure black
- Pub name: THE NULL SPACE
