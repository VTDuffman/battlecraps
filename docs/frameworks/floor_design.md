# BattleCraps — Floor Visual Design Specification

## Design Philosophy: The Progression Arc

The three floors of BattleCraps are not just difficulty tiers — they are a journey through
three distinct worlds of gambling culture, each with its own smell, sound, and soul. The
visual language escalates deliberately:

> **Gritty → Genteel → Electric**

Floor 1 is where you start — rough, honest, slightly illegal. By Floor 3 you are somewhere
money goes to disappear. Each transition should feel like a genuine step up into a world the
player wasn't sure they'd make it to.

The core visual system (pixel font, 16-bit aesthetic, dark palette, neon-on-dark) stays
constant across all floors — it's the _hue_, _temperature_, and _ornamentation_ that shifts.
Think of it as the same band playing three different venues.

---

## Floor 1 — The Moose Lodge (VFW Hall)

### Identity
**"The dive. The grind. Where real ones play."**

You're in the back room of a VFW hall that hasn't been redecorated since 1974. Fluorescent
tubes flicker overhead. The felt is worn but real. The gold trim is tarnished. The people
here have seen some things. Sarge has been running this table longer than you've been alive.

This is already the game's baseline aesthetic — document it here as the formal spec for
Floor 1 so future deviations from it are intentional and coherent.

### Color Palette

| Role               | Value       | Notes                                   |
|--------------------|-------------|-----------------------------------------|
| Felt (primary)     | `#1a4731`   | Classic worn casino green               |
| Felt (dark/rail)   | `#0c1f15`   | Deeper green for the crew rail          |
| Felt (light)       | `#256040`   | Lighter green for hover/highlight zones |
| Background         | `#000000`   | Pure black                              |
| Accent (bright)    | `#f5c842`   | Tarnished yellow-gold                   |
| Accent (primary)   | `#d4a017`   | Main gold                               |
| Accent (dim)       | `#8a6810`   | Muted gold for borders/dividers         |
| Border tint        | `gold/30`   | Gold at 30% opacity                     |

### Felt Breathing (Ambient Overlay)

| Tier   | Trigger                  | Color                          | Speed  |
|--------|--------------------------|--------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(37, 96, 64, 0.28)`       | 5.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(212, 160, 23, 0.22)`     | 3.0s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(220, 80, 30, 0.28)`      | 1.5s   |

### Screen Flash Colors

| Event              | Color                          |
|--------------------|--------------------------------|
| Win (Natural/Hit)  | `rgba(245, 200, 66, 0.32)`     |
| Lose (Seven Out)   | `rgba(160, 20, 20, 0.42)`      |

### Recruitment Screen — "The Seven-Proof Pub"

A literal dive bar. Sticky floors, Miller Lite neon sign, pool cue leaning against the wall.
The crew hangs out here between runs and you can hire them before heading back in.

- **Background gradient:** `radial-gradient(ellipse at 50% 20%, #3a1800 0%, #180c00 45%, #0d0704 100%)`
- **Top accent bar:** amber/gold horizontal gradient
- **Smoke overlay:** `rgba(180, 90, 0, 0.08)` radial at top
- **Text colors:** amber `#f5c842` headers, `text-amber-300/50` body
- **UI borders:** `border-amber-900/50`
- **Decorative motif:** stars (✦ ★), horizontal rule dividers in amber
- **Narrative voice:** casual, working-class, slight world-weariness. _"Hire a hand before the next marker…"_

### Boss Room — VFW High Limit Room (Sarge)

Ominous but military. The back room nobody talks about. Red-tinged darkness. The kind of
place that smells like gun oil and regret.

- **Background gradient:** `radial-gradient(ellipse at 50% 30%, #1a0800 0%, #0d0400 55%, #050201 100%)`
- **Top/bottom accent bars:** deep red `#7f1d1d` → crimson `#dc2626`
- **Ambient glow:** `rgba(180, 20, 20, 0.08)` radial center
- **Text accent:** `#dc2626` crimson
- **Border tint:** `rgba(127, 29, 29, 0.4)`
- **Decorative motif:** ★ (single military star), strict horizontal rules
- **Narrative voice:** authoritarian, clipped, no warmth. _"There is no shame in surviving this far. There will be, if you leave early."_

---

## Floor 2 — The Riverboat (Mississippi Salon Privé)

### Identity
**"The upgrade. Old money, new danger."**

You've earned your way off the back-room table and onto a paddlewheel casino drifting down
the Mississippi. Gaslit chandeliers cast a warm amber glow over mahogany paneling. The
other players are in waistcoats. Mme. Le Prix moves between the tables like she owns the
river — because on this boat, she does. This is classy, but it's still a trap.

The visual language steps up from gritty to refined: deep navy replaces green felt,
aged brass replaces tarnished gold, candlelight replaces fluorescence. The _danger_ is
still here — it's just dressed better.

### Color Palette

| Role               | Value       | Notes                                        |
|--------------------|-------------|----------------------------------------------|
| Felt (primary)     | `#0a1832`   | Deep navy blue — river water at midnight      |
| Felt (dark/rail)   | `#060e1e`   | Deeper navy for rail                          |
| Felt (light)       | `#122040`   | Slightly lighter navy for highlights          |
| Background         | `#04030d`   | Near-black with faint indigo tint             |
| Accent (bright)    | `#c9a96e`   | Warm champagne gold — aged, more refined      |
| Accent (primary)   | `#a07830`   | Antique brass                                 |
| Accent (dim)       | `#604a1c`   | Tarnished brass for borders/dividers          |
| Crimson secondary  | `#8b1a3a`   | Deep rose/burgundy — reserved for danger cues |
| Border tint        | `brass/30`  | Aged brass at 30% opacity                     |

### Felt Breathing (Ambient Overlay)

The felt "breathes" with water and candlelight rather than casino warmth. The hot tier
shifts to rose-crimson — the color of something going wrong below deck.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(15, 30, 80, 0.25)`        | 6.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(80, 40, 120, 0.22)`       | 3.5s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(160, 30, 80, 0.28)`       | 1.5s   |

_Cold = deep river navy. Warm = indigo gaslight. Hot = crimson warning._

### Screen Flash Colors

Refined but still visceral — wins are champagne, losses feel like drowning.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(201, 169, 110, 0.35)`     |
| Lose (Seven Out)   | `rgba(20, 10, 60, 0.65)`        |

_Win flash: pale champagne gold shimmer. Lose flash: deep indigo blackout — like the lights
going out on a sinking boat._

### Recruitment Screen — "The Promenade Bar"

Between markers, the player retreats to the Promenade Deck bar — a narrow, elegant lounge
with velvet stools, a lacquered bar, and the sound of the paddlewheel churning outside.
More refined than the Pub. Less friendly.

- **Screen name:** "THE PROMENADE BAR"
- **Background gradient:** `radial-gradient(ellipse at 50% 20%, #0e0820 0%, #060410 45%, #020108 100%)`
- **Top accent bar:** brass/champagne horizontal gradient — `transparent → #a07830 → #c9a96e → #a07830 → transparent`
- **Smoke/candlelight overlay:** `rgba(140, 80, 0, 0.06)` at top (warmer, dimmer)
- **Text colors:** champagne `#c9a96e` headers, `text-stone-300/50` body
- **UI borders:** `border-indigo-900/60`
- **Card style:** darker stone panels with brass trim — replace `bg-stone-900/70` with `bg-slate-950/80`
- **Decorative motif:** ♦ ♣ playing card suits, thin horizontal brass rules, river wave motif (≈≈≈)
- **Narrative voice:** polished, slightly formal, faintly condescending. _"The next table is waiting. Choose your associate wisely."_

### Boss Room — Salon Privé (Mme. Le Prix)

The back parlor. No sign on the door. You don't knock — you're brought here. Burgundy
velvet walls, a single chandelier, and Mme. Le Prix at the center of everything, absolutely
composed. The danger here isn't ominous — it's _refined_. That's worse.

- **Screen name:** "SALON PRIVÉ"
- **Background gradient:** `radial-gradient(ellipse at 50% 30%, #1a0614 0%, #0a0310 55%, #040108 100%)`
- **Top/bottom accent bars:** deep burgundy `#4a0e24` → rose `#9b2335`
- **Ambient glow:** `rgba(140, 30, 70, 0.10)` radial center — very soft, like candlelight through velvet
- **Text accent:** `#c9a96e` champagne gold (not red — she's not a threat, she's an invitation)
- **Border tint:** `rgba(100, 25, 50, 0.45)`
- **Decorative motif:** ♦ diamond, horizontal rules in champagne, subtle fleur-de-lis feel
- **Narrative voice:** silky, controlled, faintly amused. _"On my table, the crew works backwards. Adapt."_
- **Key distinction from Sarge:** The tone is not military-menacing but socially menacing — the danger
  of someone who is always three steps ahead and will let you figure that out yourself.

---

## Floor 3 — The Strip (Penthouse)

### Identity
**"The pinnacle. Where the money gets mythological."**

You're in the penthouse of a Vegas tower that costs more per night than most people make in
a year. The city is laid out 60 floors below you like a circuit board on fire. The Executive
doesn't need to threaten you — the altitude does it. The table here isn't green. The chips
aren't ceramic. Nothing about this room is meant to make you comfortable.

The visual language breaks the casino conventions established by Floors 1 and 2. The felt
goes near-black. The gold becomes electric. The neon that's been implied throughout the
game is finally everywhere. This isn't a casino — it's a machine.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#05020f`   | Near-black with deep violet undertone              |
| Felt (dark/rail)   | `#020109`   | Deeper violet-black                                |
| Felt (light)       | `#0a0520`   | Slightly lifted violet for highlights              |
| Background         | `#000000`   | Pure black — no compromise                        |
| Accent (bright)    | `#ffd700`   | Electric gold — brighter, harder than Floors 1–2  |
| Accent (primary)   | `#d4a800`   | Saturated gold                                     |
| Accent (dim)       | `#7a5f00`   | Deep gold for borders                              |
| Neon secondary     | `#ff2080`   | Electric magenta — the strip's signature color     |
| Neon tertiary      | `#00d4ff`   | Electric cyan — city lights bleed                  |
| Border tint        | `gold/50`   | Gold at full 50% — more assertive than Floors 1–2  |

### Felt Breathing (Ambient Overlay)

The felt pulses with city light bleed — not organic warmth, but electricity. The hot tier
hits neon magenta: the color of the strip at 3am when things stop making sense.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(0, 80, 160, 0.15)`        | 5.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(120, 20, 160, 0.18)`      | 2.5s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(255, 30, 100, 0.25)`      | 1.0s   |

_Cold = distant city blue. Warm = violet electric. Hot = neon magenta strobe._

### Screen Flash Colors

The most extreme tier. Wins are blinding. Losses are neon violence.

| Event              | Color                            |
|--------------------|----------------------------------|
| Win (Natural/Hit)  | `rgba(255, 240, 80, 0.45)`       |
| Lose (Seven Out)   | `rgba(220, 20, 80, 0.55)`        |

_Win flash: near-white electric gold — retinal. Lose flash: neon magenta-red — alarming in
a way that green felt has no right to be._

### Recruitment Screen — "The Sky Lounge"

No "pub" here. Between markers, the player is ushered into the tower's sky lounge — floor-
to-ceiling glass, the city below, the crew arranged like they've been here all along. It's
cold, expensive, and utterly silent except for the ambient hum of the HVAC.

- **Screen name:** "THE SKY LOUNGE"
- **Background gradient:** `radial-gradient(ellipse at 50% 15%, #100020 0%, #050010 50%, #000000 100%)`
- **Top accent bar:** neon magenta → electric gold gradient — `transparent → #a0004a → #ffd700 → #a0004a → transparent`
- **City glow overlay:** `rgba(0, 80, 200, 0.04)` at base, `rgba(200, 20, 80, 0.04)` at top — dual-tone
- **Text colors:** electric gold `#ffd700` headers, `text-slate-300/50` body
- **UI borders:** `border-violet-900/60`
- **Card style:** obsidian panels — `bg-slate-950/90` with neon-tinted border highlights
- **Decorative motif:** ♠ spades, city grid lines (thin horizontal/vertical rules), no warm organic elements
- **Narrative voice:** terse, corporate, zero empathy. _"Select your asset. The table opens in thirty seconds."_

### Boss Room — The Penthouse (The Executive)

No ceremony. No warmth. Pure black room, one table, The Executive at the far end.
He doesn't speak until he has to. The accent bars aren't red — they're cold gold and white,
the colors of a boardroom, not a battlefield. He's not angry. He's just already won.

- **Screen name:** "THE PENTHOUSE"
- **Background gradient:** `radial-gradient(ellipse at 50% 25%, #0a0615 0%, #040210 50%, #000000 100%)`
- **Top/bottom accent bars:** white `#ffffff` → electric gold `#ffd700` — _no red_
- **Ambient glow:** `rgba(80, 30, 160, 0.06)` radial center — barely there, cold violet
- **Text accent:** `#ffd700` electric gold (not red — authority, not aggression)
- **Border tint:** `rgba(180, 140, 0, 0.40)`
- **Decorative motif:** clean horizontal rules, minimal — no stars, no suits, just money
- **Narrative voice:** flat, clinical, final. _"Fours are for losers. Don't roll one."_
- **Key distinction from Sarge and Mme. Le Prix:** Where Sarge intimidates and Mme. Le Prix
  seduces, The Executive simply _judges_. No decoration, no warmth, no texture. The terror
  is in how _quiet_ it is.

---

## Progression Summary

| Floor | Venue          | Pub/Rest Stop        | Boss Room       | Palette Core                    | Temperature       |
|-------|----------------|----------------------|-----------------|---------------------------------|-------------------|
| 1     | VFW Hall       | The Seven-Proof Pub  | VFW High Limit  | Forest green + tarnished gold   | Warm, worn, amber |
| 2     | The Riverboat  | The Promenade Bar    | Salon Privé     | Navy blue + champagne brass     | Cool, candlelit   |
| 3     | The Strip      | The Sky Lounge       | The Penthouse   | Obsidian black + electric gold  | Frigid, electric  |

## Transition Signals

When the player moves between floors, the visual shift should feel earned and noticeable.
Key surfaces that change:

1. **Felt color** — the most visible. Green → Navy → Obsidian.
2. **Border accent color** — tarnished gold → aged brass → electric gold.
3. **Pub/rest screen** background and accent bar color.
4. **Breathing animation** — colors in the felt overlay pulse.
5. **Screen flash colors** — escalate in intensity each floor.
6. **Recruitment screen name and tone** — pub → lounge bar → sky lounge.
7. **Boss room color** — crimson red → deep burgundy → cold white-gold.

Everything else — pixel font, 16-bit aesthetic, layout, animations — stays constant.
The game is the same machine. The room around it just gets more expensive.

---

## Implementation Notes

This document specifies the _design intent_. Implementation will require:

- Per-floor Tailwind color classes (or inline styles) on the main container and key surfaces
- A `floorTheme` object derived from `currentMarkerIndex` (floor = `Math.floor(markerIndex / 3)`)
- Updated `felt-texture` backgroundImage variants per floor (or a CSS variable approach)
- Updated `animate-felt-cold/warm/hot` color overrides per floor (likely via CSS custom properties)
- Recruitment screen name displayed dynamically per floor
- Boss entry modal background/accent colors derived from the boss config or floor index
- Potentially new Tailwind config entries for floor-2/floor-3 color tokens

The existing Floor 1 aesthetic needs no changes — Floor 2 and Floor 3 are additive.
