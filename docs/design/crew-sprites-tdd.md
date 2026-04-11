# Crew Portraits — Technical Design Document

**Status:** In Design / Asset Generation Phase
**Scope:** 15 crew member portrait sprites for the BattleCraps game rail

---

## 1. Current State

The crew portrait system has complete infrastructure but no image assets:

- **`CrewPortrait.tsx`** renders a 64×64px box with a literal placeholder comment:
  ```tsx
  /* Crew sprite placeholder — replace with actual sprite sheet in Phase 5 */
  ```
- **`visualId`** field exists on the `CrewMember` DB model but the UI does not consume it
- **`animate-portrait-flash`** CSS class is already wired and fires on cascade trigger
- **`isTriggering`** prop drives the animation dequeue — cascade animation infrastructure is complete
- No image assets exist anywhere in the repo

The rail is fully functional; it just has no faces.

---

## 2. Options Considered

### Option A — AI-generated static sprites with CSS effects
Generate a single idle frame per character via AI (Midjourney, Stable Diffusion). Animate via CSS filters, border glow, and shake transforms on trigger.

**Pros:** Fast to generate, minimal per-character asset work, no Aseprite needed.
**Cons:** No character motion — the "flash" is just a CSS glow, not a personality moment. Static portraits feel cheap next to the dice animation. Characters are less memorable.

---

### Option B — Hand-drawn Aseprite sprites
Artist draws each character frame by frame in Aseprite at 64×64px. 4–5 frames per character: idle (2-frame breathing loop) + trigger (2-frame reaction).

**Pros:** Highest quality output, full artistic control, pixel-perfect consistency across all 15 characters.
**Cons:** Requires a pixel artist (not available in-house). Timeline: weeks to months. Blocking dependency on an external resource.

---

### Option C — AI static, no animation frames
Use AI-generated images cropped to 64×64, displayed as `<img>` with CSS glow on trigger. No sprite sheets, no frame animation.

**Pros:** Simplest possible implementation. Can be done in an afternoon.
**Cons:** No motion at all on trigger. The cascade animation moment — the character's "personality beat" — is completely lost. The game's best feedback loop is undermined.

---

### Option D — AI-generated sprite sheets (RECOMMENDED)
Generate per-character sprite sheets using AI with Aseprite cleanup. Horizontal strip format: 5 frames × 64px = 320×64px PNG per character. CSS `steps()` animation drives playback.

**Pros:** Full character motion on cascade trigger. Personality visible at a glance. AI generation makes it achievable solo. Matches the 16-bit aesthetic. Infrastructure slots directly into existing `animate-portrait-flash` system.
**Cons:** Requires Aseprite or similar for pixel cleanup and frame separation. AI output needs curation — not every generation will be usable. Midjourney prompt iteration takes time.

---

### Option E — SVG vector portraits
Design each character as an SVG with CSS animation on trigger (transform, filter, color shift).

**Pros:** Resolution-independent, small file sizes, easy to tweak colors.
**Cons:** SVG character art at this detail level requires as much manual effort as hand-drawing. Doesn't look 16-bit — it looks like a flat icon. Wrong aesthetic for the game.

---

## 3. Recommendation: Option D

Option D is the right call for this project at this stage:

1. **It serves the game loop.** The cascade trigger moment is the most emotionally charged beat in BattleCraps. A character flinching, reacting, or celebrating when their ability fires is a core part of the "oh that's my crew" feeling. CSS glow alone doesn't deliver that.

2. **It's solo-achievable.** Midjourney can generate a plausible 16-bit character concept in a few iterations. Aseprite can clean it into a proper sprite sheet in an hour per character. 15 characters × 1–2 hours = one concentrated weekend of asset work.

3. **The infrastructure is already there.** `animate-portrait-flash`, `isTriggering`, the cascade queue — everything is wired and waiting for a PNG. The code change is minimal.

4. **It's reversible.** If a character's sprite turns out weak, you swap one file. The system doesn't care which asset is in the sprite sheet.

---

## 4. Art Direction

### Visual language
- **Style:** 16-bit JRPG portrait style — think Final Fantasy VI character select, Chrono Trigger battle menu. Not NES pixel art; not modern HD. The goal is "Super Nintendo casino."
- **Palette:** 16–24 colors per character maximum. Dark backgrounds (deep casino felt green, near-black navy, dark burgundy). Characters pop with bright accent colors (neon, gold, vivid primaries).
- **Format:** Bust shot (head + upper chest), facing 3/4 toward camera. Fills the 64×64 frame with personality — no dead space.
- **Mood:** Each character has a clear archetype. The sprite should read instantly: "that's the drunk uncle," "that's the shark." Silhouette first.

### Sprite sheet format
```
[ idle-1 ][ idle-2 ][ trigger-1 ][ trigger-2 ][ trigger-3 ]
   64px      64px       64px          64px         64px
|<----------------------- 320px ----------------------->|
```

- **Frames 1–2:** Idle breathing loop (subtle shift — eyes blink, chest moves)
- **Frames 3–5:** Trigger reaction (the personality moment — leans forward, raises fist, flashes, reacts to their ability firing)
- **File:** `apps/web/public/sprites/crew/{visualId}.png` (320×64, indexed PNG)
- **`image-rendering: pixelated`** applied via CSS — never `smooth`

---

## 5. Per-Character Art Brief

### Lefty McGuffin (`lefty`)
**Archetype:** Old-school gambler, perpetual luck case
**Idle:** Weathered face, lucky dice dangling from his hat brim. Slow blink.
**Trigger:** Grins and tosses his lucky dice — they glow gold. Wink.
**Key visual:** Lucky dice charm, battered fedora, stubble

---

### The Physics Prof (`physics_prof`)
**Archetype:** Absent-minded academic
**Idle:** Wire-frame glasses, chalk dust on collar, half-distracted look
**Trigger:** Leans forward, eyes sharp — calculates. Mini equation flash over head.
**Key visual:** Thick glasses, pocket protector, chalkboard green tint

---

### The Mechanic (`mechanic`)
**Archetype:** Blue-collar fixer, hands-on
**Idle:** Work goggles pushed up on forehead, oil smudge on cheek
**Trigger:** Reaches in, adjusts something — wrench glints. Knowing smirk.
**Key visual:** Goggles, coveralls, grease stains, wrench

---

### The Mathlete (`mathlete`)
**Archetype:** Intense young competitor
**Idle:** Tournament shirt, sharp eyes, mentally calculating
**Trigger:** Stands up — victory pose. Fist pump. Numbers flash.
**Key visual:** Competition jersey, calculator watch, determined expression

---

### The Floor Walker (`floor_walker`)
**Archetype:** Casino insider, smooth operator
**Idle:** Suit jacket, laminated badge, arms folded — watching the floor
**Trigger:** Subtle hand gesture — refund signal. Cool nod to player.
**Key visual:** Casino badge, suit, poker face with knowing eyes

---

### The Regular (`regular`)
**Archetype:** Longtime local, knows the staff
**Idle:** Comfortable in his element — casual clothes, familiar smile
**Trigger:** Leans back and taps the rail. Wink. "I know the guy."
**Key visual:** Worn lucky cap, beer in hand, lived-in face

---

### The Big Spender (`big_spender`)
**Archetype:** High roller, flash and cash
**Idle:** Pinstripe suit, diamond cufflinks, chips in hand
**Trigger:** Slaps a fat stack on the rail. Gold coins burst.
**Key visual:** Stacks of chips, gold watch, flashy tie

---

### The Shark (`shark`)
**Archetype:** Cold predator, all business
**Idle:** Lean face, calculating eyes, suit with no tie — not here for fun
**Trigger:** Slow smile. Eyes flash. A single chip slides forward.
**Key visual:** Sharp suit, predatory grin, minimal expression tells everything

---

### The Whale (`whale`)
**Archetype:** Legendary high roller — operates on a different level
**Idle:** Immaculate suit, total stillness, faint satisfied expression
**Trigger:** A single eyebrow lift. The table shakes. Multiplier aura glow.
**Key visual:** Impeccable grooming, massive stack of chips, faint power glow

---

### The Nervous Intern (`nervous_intern`)
**Archetype:** Out of their depth, somehow winning
**Idle:** Rumpled shirt, wide eyes, coffee cup, sweating slightly
**Trigger:** Gasps — can't believe it. Drops coffee. Jumps.
**Key visual:** Loose tie, coffee stain, deer-in-headlights energy

---

### Hype-Train Holly (`holly`)
**Archetype:** The hype machine — pure energy
**Idle:** Megaphone in hand, electric hair, barely contained excitement
**Trigger:** SCREAMS into megaphone. Hair goes even bigger. Lightning bolts.
**Key visual:** Megaphone, wild hair with literal sparks, neon accent colors

---

### The Drunk Uncle (`drunk_uncle`)
**Archetype:** Unpredictable wildcard — could go either way
**Idle:** Suspenders over undershirt, paper crown, drink in hand, swaying
**Trigger (positive):** Spills drink, laughs, lucky horseshoe glows
**Trigger (negative):** Knocks something over, wild-eyed, dice scramble
**Key visual:** Paper crown, suspenders, perpetual beverage, chaotic aura

---

### The Mimic (`mimic`)
**Archetype:** Shape-shifter, undefined identity
**Idle:** Deliberately vague features — mask-like face, question mark energy
**Trigger:** Face ripples and briefly mirrors the character to their left
**Key visual:** Shifting colors, mirror-like sheen, neutral base with hints of other characters

---

### The Old Pro (`old_pro`)
**Archetype:** Veteran of a thousand runs
**Idle:** Weathered but serene. Has seen everything. Steady gaze.
**Trigger:** Slow nod. "+1 Shooter" token materializes in his hand.
**Key visual:** Age lines, casino chips from many different tables, quiet confidence

---

### The Lucky Charm (`lucky_charm`)
**Archetype:** Pure luck avatar — small, potent
**Idle:** Four-leaf clover motifs, golden glow, cheerful composure
**Trigger:** Glows brighter — hype floor lock engages. Stars orbit briefly.
**Key visual:** Clover imagery, gold trim, warm aura, always smiling

---

## 6. Midjourney Prompt Template

Use this base structure for all character generations. Iterate on the `[CHARACTER DESCRIPTION]` section per character.

```
pixel art portrait, 16-bit SNES style, [CHARACTER DESCRIPTION],
bust shot 3/4 angle facing camera, 64x64 pixel sprite,
dark casino background, neon accent lighting,
Final Fantasy VI character select portrait style,
limited color palette 16-24 colors, no anti-aliasing,
sharp pixel edges, image-rendering pixelated
--ar 1:1 --style raw --v 6
```

**For trigger frames**, add:
```
...action pose, reacting to winning dice roll, expressive face,
same character same palette [attach idle frame as reference image]
```

**Upres workflow:**
1. Generate at 512×512 or 1024×1024
2. Import into Aseprite
3. Scale down to 64×64 using nearest-neighbor (no interpolation)
4. Touch up — ensure key visual reads clearly at 64×64
5. Add idle frame 2 (micro-variation: blink, slight head shift)
6. Add trigger frames 3–5 (escalating reaction)
7. Export as horizontal strip: 320×64 PNG, indexed color

---

## 7. Technical Implementation Plan

### 7.1 Asset delivery
Place finished sprite sheets at:
```
apps/web/public/sprites/crew/
  lefty.png
  physics_prof.png
  mechanic.png
  mathlete.png
  floor_walker.png
  regular.png
  big_spender.png
  shark.png
  whale.png
  nervous_intern.png
  holly.png
  drunk_uncle.png
  mimic.png
  old_pro.png
  lucky_charm.png
```

Each file: 320×64px, indexed PNG (transparency on background if desired).

### 7.2 `CrewPortrait.tsx` changes

Replace the placeholder div with a sprite-driven component:

```tsx
// Current placeholder:
/* Crew sprite placeholder — replace with actual sprite sheet in Phase 5 */

// Replace with:
<div
  className={clsx(
    'portrait-sprite',
    isTriggering && 'portrait-sprite--trigger'
  )}
  style={{ backgroundImage: `url('/sprites/crew/${member.visualId}.png')` }}
/>
```

Props needed: `member.visualId` (already in DB), `isTriggering` (already passed).

### 7.3 CSS infrastructure

Add to global stylesheet or Tailwind `@layer components`:

```css
.portrait-sprite {
  width: 64px;
  height: 64px;
  image-rendering: pixelated;
  image-rendering: crisp-edges; /* Firefox */
  background-size: 320px 64px;
  background-position: 0 0;
  background-repeat: no-repeat;
  animation: portrait-idle 0.8s steps(1) infinite;
}

@keyframes portrait-idle {
  0%   { background-position: 0 0; }
  50%  { background-position: -64px 0; }
  100% { background-position: 0 0; }
}

.portrait-sprite--trigger {
  animation: portrait-trigger 0.4s steps(1) forwards;
}

@keyframes portrait-trigger {
  0%   { background-position: -128px 0; }
  33%  { background-position: -192px 0; }
  66%  { background-position: -256px 0; }
  100% { background-position: 0 0; }
}
```

The `steps(1)` timing function ensures hard pixel-frame cuts with zero interpolation — essential for 16-bit authenticity.

### 7.4 `visualId` wiring

The `visualId` field is already on the `CrewMember` DB model. Verify it is included in:
- `GET /recruit` response payload
- `POST /recruit` response (crew slot data returned)
- Client `GameState.crew[]` type

No DB schema changes required.

### 7.5 Fallback behavior

Until sprites are available, the portrait can fall back to a solid color tile derived from `visualId`. This means the game remains playable during asset production — characters are distinguishable by position and name even without sprites.

```tsx
// Fallback if sprite fails to load:
onError={() => { /* show colored placeholder */ }}
```

---

## 8. Implementation Order

1. **Art first:** Generate and clean all 15 sprite sheets. Do not start technical implementation until at least 3 characters are done — validate the format works at 64×64 before committing to the full pipeline.
2. **CSS infrastructure:** Add `.portrait-sprite` and animation keyframes. Smoke test with one character.
3. **`CrewPortrait.tsx`:** Swap placeholder for sprite div. Verify `isTriggering` triggers `portrait-sprite--trigger` correctly.
4. **`visualId` wiring audit:** Confirm all 15 `visualId` values in the DB seed match the filenames above.
5. **Polish pass:** Adjust idle loop timing, trigger animation speed, and background colors per character to taste.

---

*Written during BattleCraps playtesting — 2026-03-24*
