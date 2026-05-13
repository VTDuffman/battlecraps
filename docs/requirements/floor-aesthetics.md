# BattleCraps — Floor Visual Design Specification

## Design Philosophy: The Progression Arc

The nine floors of BattleCraps are a journey from the absolute bottom rung of the street up through mythology, orbit, and beyond existence itself. The visual language escalates deliberately:

> **Exposed → Gritty → Genteel → Electric → Occult → Ancient → Cosmic → Alien → Digital**

Floor 1 is where you start — out in the cold, rolling on concrete, just trying to earn your way indoors. By Floor 4 you are somewhere money goes to disappear. Each transition should feel like a genuine step up into a world the player wasn't sure they'd make it to.

The core visual system (pixel font, 16-bit aesthetic, dark palette, neon-on-dark) stays constant across all floors — it's the *hue*, *temperature*, and *ornamentation* that shifts.

---

## Floor 1 — The Loading Dock (Alleyway)

### Identity
**"The street. The hustle. Where it all begins."**

You aren't even inside yet. You're out back behind a strip mall or a warehouse, rolling on stained concrete illuminated by a single flickering sodium-vapor streetlamp. The air is cold. The dice are chipped. There is no felt, only a chalk outline drawn on the ground to mark the boundaries. If the cops roll by, everyone scatters. 

This sets the absolute baseline of the game. It contrasts sharply with the worn, indoor comfort of Floor 2's VFW Hall. Here, the visuals are stark, industrial, and exposed.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#1c1d21`   | Stained concrete / Asphalt                         |
| Felt (dark/rail)   | `#0a0a0c`   | Deep alleyway shadow for the crew rail             |
| Felt (light)       | `#2d2f36`   | Slightly lighter concrete for highlights           |
| Background         | `#030304`   | Pure night                                         |
| Accent (bright)    | `#ff9900`   | Harsh sodium-vapor streetlamp orange               |
| Accent (primary)   | `#b35900`   | Rusted metal / Dried brick                         |
| Accent (dim)       | `#4a2c11`   | Grime / Muted rust for borders                     |
| Border tint        | `rust/30`   | Rust orange at 30% opacity                         |

### Felt Breathing (Ambient Overlay)

The ground doesn't breathe warmth; it reflects the unstable environment. Cold is the blue-black night, warm is the streetlamp, and hot mimics the distant flash of police sirens bouncing off brick walls.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(30, 35, 50, 0.20)`        | 6.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(200, 100, 0, 0.18)`       | 3.0s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(220, 20, 40, 0.22)`       | 1.0s   |

### Screen Flash Colors

Raw and unapologetic. 

| Event              | Color                          |
|--------------------|--------------------------------|
| Win (Natural/Hit)  | `rgba(255, 153, 0, 0.35)`      |
| Lose (Seven Out)   | `rgba(20, 25, 35, 0.50)`       |

*Win flash: A sudden surge of the streetlamp overhead. Lose flash: A plunge into cold alleyway shadows.*

### Recruitment Screen — "The Milk Crate Circle"

There is no bar. Between runs, the crew is just huddled around a rusted burn barrel or sitting on overturned milk crates by a chainlink fence. You're hiring whoever happened to linger in the alley tonight.

- **Background gradient:** `radial-gradient(ellipse at 50% 10%, #2a1500 0%, #110900 40%, #020202 100%)`
- **Top accent bar:** Rust to streetlamp orange gradient
- **Fog/Steam overlay:** `rgba(200, 200, 220, 0.05)` drifting horizontally (like breath in the cold air or sewer steam)
- **Text colors:** Streetlamp `#ff9900` headers, `text-stone-400/60` body
- **UI borders:** `border-orange-900/40`
- **Decorative motif:** Chainlink crosshatches ( # ), rugged dashed lines
- **Narrative voice:** Scrappy, paranoid, urgent. *"Grab a stray. Keep your voice down."*

### Boss Room — The Freight Elevator (The Foreman)

The game pauses, and the heavy corrugated metal door of the loading dock rolls up. The Foreman stands there in steel-toed boots. He controls who gets to walk through that door into the real games inside. 

- **Background gradient:** `radial-gradient(ellipse at 50% 40%, #1a1b20 0%, #0a0a0c 60%, #000000 100%)`
- **Top/bottom accent bars:** Industrial yellow `#eab308` → Black
- **Ambient glow:** `rgba(234, 179, 8, 0.08)` harsh overhead industrial light
- **Text accent:** `#eab308` Caution yellow
- **Border tint:** `rgba(133, 77, 14, 0.5)`
- **Decorative motif:** Diagonal hazard stripes (////), heavy bracket corners `[` `]`
- **Narrative voice:** Gruff, dismissive, impatient. *"You're blocking my dock. Clear out or pay up."*
- **Key distinction from Sarge:** Sarge is running a structured, disciplined game. The Foreman isn't running a casino at all—he's just a guy who uses his physical territory to extort the street players before letting them inside. 

---
## Floor 2 — The Moose Lodge (VFW Hall)

### Identity
**"The dive. The grind. Where real ones play."**

You're in the back room of a VFW hall that hasn't been redecorated since 1974. Fluorescent
tubes flicker overhead. The felt is worn but real. The gold trim is tarnished. The people
here have seen some things. Sarge has been running this table longer than you've been alive.

This is already the game's baseline aesthetic — document it here as the formal spec for
Floor 2 so future deviations from it are intentional and coherent.

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

## Floor 3 — The Riverboat (Mississippi Salon Privé)

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

## Floor 4 — The Strip (Penthouse)

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

---

## Floor 5 — The Lodge (The Inner Sanctum)

### Identity
**"Below the city. Above the law."**

You don't know the address. You were brought here blindfolded. The marble columns are centuries old. Hooded figures stand motionless against the walls, watching. Candleflame is the only light source. The floor is smooth black marble. The game has been running here for three hundred years and the house has never recorded a loss — because the house decides what counts.

The visual language shifts from electric/synthetic to ancient/material: stone, wax, flame, and cloth. No neon. No glass. The danger here is the kind that has been patient for a very long time.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#0f0b14`   | Aged black marble — not pure black, has warmth     |
| Felt (dark/rail)   | `#070509`   | Deeper marble shadow for the crew rail             |
| Felt (light)       | `#1c1524`   | Slightly lifted for hover/highlight zones          |
| Background         | `#030203`   | Near-black, almost no hue                         |
| Accent (bright)    | `#c9943a`   | Candleflame amber — ancient gold wax               |
| Accent (primary)   | `#9a6f22`   | Aged gold                                          |
| Accent (dim)       | `#4a3510`   | Tarnished / soot for borders                       |
| Burgundy secondary | `#7a1a2e`   | Deep cardinal — ritual danger cue                  |
| Border tint        | `gold/25`   | Very muted — the room is understated               |

### Felt Breathing (Ambient Overlay)

Cold is the dark between candles. Warm is flame catching. Hot is something ceremonial going very wrong.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(10, 5, 20, 0.25)`         | 7.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(180, 100, 20, 0.20)`      | 4.0s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(140, 20, 50, 0.28)`       | 1.5s   |

*Cold = deep stone void. Warm = candleflame guttering. Hot = ritual crimson — something is being offered.*

### Screen Flash Colors

Subdued by design. The order does not celebrate loudly.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(200, 140, 40, 0.30)`      |
| Lose (Seven Out)   | `rgba(80, 10, 25, 0.60)`        |

*Win flash: a brief bloom of candlelight. Lose flash: a deep cardinal blackout — the room noted your failure.*

### Recruitment Screen — "The Anteroom"

A cold stone waiting chamber. No bartender, no warmth. A decanter of something dark sits on a side table. Crew arrive as if they were already there.

- **Screen name:** "THE ANTEROOM"
- **Background gradient:** `radial-gradient(ellipse at 50% 20%, #1a0a08 0%, #0a0506 45%, #020202 100%)`
- **Top accent bar:** cardinal → candleflame amber gradient
- **Overlay:** `rgba(180, 80, 10, 0.05)` — almost imperceptible warmth, like a fire in another room
- **Text colors:** candleflame `#c9943a` headers, `text-stone-400/50` body
- **UI borders:** `border-red-950/40`
- **Decorative motif:** Seal / sigil shapes (◈ ❖), heavy vertical rules, wax-drip textures
- **Narrative voice:** formal, cryptic, impersonal. *"The order acknowledges your arrival. Choose your associate."*

### Boss Room — The Inner Sanctum (The Hierophant)

No ceremony — you're already inside the ceremony. The Hierophant stands at the far end behind the table, robed, motionless. The hooded observers have gathered closer. Whatever you're about to do, they've seen it three hundred times before.

- **Background gradient:** `radial-gradient(ellipse at 50% 35%, #1a0408 0%, #0a0204 60%, #000000 100%)`
- **Top/bottom accent bars:** deep cardinal `#4a0a14` → cardinal `#7a1a2e`
- **Ambient glow:** `rgba(120, 20, 40, 0.08)` radial center — barely there, like candlelight through stone
- **Text accent:** `#c9943a` candleflame gold (not red — the Hierophant is composed, not threatening)
- **Border tint:** `rgba(90, 20, 35, 0.45)`
- **Decorative motif:** ◈ seal shapes, heavy bracket corners, wax drip verticals
- **Narrative voice:** ancient, measured, final. *"Three centuries of tradition. You'll respect it, or you'll fund it."*

---

## Floor 6 — Atlantis (The Throne Room)

### Identity
**"It didn't sink. It descended on purpose."**

The marble columns are still standing. The mosaic floors are intact. Three thousand years of coral has grown through the stone, lit from within by creatures that have never seen the sun. The water pressure outside the open archways is something you stopped noticing an hour ago. The city is warm — it generates its own heat from the thermal vents below. The Sovereign has been here since before recorded history began above. He finds your timeline quaint.

The visual language is ancient but living: warm bioluminescent light, deep teal water depths, weathered gold through marble veins, coral orange as scattered accent. Not sleek. Not industrial. Ancient and breathing.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#062535`   | Deep sea-teal — water at depth, not black          |
| Felt (dark/rail)   | `#031520`   | Deeper for the crew rail                           |
| Felt (light)       | `#0a3a4a`   | Lifted teal for hover/highlight zones              |
| Background         | `#020d16`   | Near-black with faint teal tint                    |
| Accent (bright)    | `#00c9a0`   | Warm aquamarine bioluminescence — alive, not neon  |
| Accent (primary)   | `#009070`   | Deeper aquamarine                                  |
| Accent (dim)       | `#004840`   | Deep teal for borders/dividers                     |
| Gold secondary     | `#c9a06a`   | Ancient weathered gold — marble vein, not jewellery|
| Coral tertiary     | `#e07040`   | Warm coral orange — life in the dark               |
| Border tint        | `aqua/25`   | Bioluminescent at low opacity                      |

### Felt Breathing (Ambient Overlay)

The city breathes with thermal vents and tidal rhythm. Cold is deep water. Warm is bioluminescent bloom. Hot is something ancient stirring below.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(0, 60, 80, 0.22)`         | 6.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(0, 160, 120, 0.18)`       | 3.5s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(200, 80, 20, 0.25)`       | 1.5s   |

*Cold = abyssal teal. Warm = bioluminescent bloom. Hot = thermal vent orange — the deep is waking.*

### Screen Flash Colors

Ancient scale. Wins feel oceanic. Losses feel like the tide withdrawing.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(0, 200, 160, 0.35)`       |
| Lose (Seven Out)   | `rgba(0, 30, 50, 0.70)`         |

*Win flash: surge of warm bioluminescence. Lose flash: total depth darkness — the city holds its breath.*

### Recruitment Screen — "The Hall of Records"

A vast sunken library. Shelves of waterproofed scrolls line walls twenty feet high. Creatures drift past the open archways. Crew are figures who stopped counting years long ago, available to anyone the king judges worthy.

- **Screen name:** "THE HALL OF RECORDS"
- **Background gradient:** `radial-gradient(ellipse at 50% 20%, #0a2535 0%, #041520 45%, #010810 100%)`
- **Top accent bar:** ancient gold → aquamarine gradient
- **Overlay:** `rgba(0, 150, 100, 0.05)` bioluminescent bloom at center
- **Text colors:** aquamarine `#00c9a0` headers, `text-teal-300/50` body
- **UI borders:** `border-teal-900/50`
- **Card style:** deep teal stone panels — `bg-teal-950/80` with gold marble-vein borders
- **Decorative motif:** ≈ wave patterns, trident (⚡ or custom), Greek key borders
- **Narrative voice:** ancient, composed, slow. *"The records show every crew that has passed through. Choose wisely — the king is watching."*

### Boss Room — The Throne Room (The Sovereign)

Open water on three sides. The throne is coral and black marble, grown together over three millennia. The Sovereign sits in absolute stillness. The tide counter on the far wall is the only thing moving. He has no interest in your haste.

- **Background gradient:** `radial-gradient(ellipse at 50% 30%, #082535 0%, #031520 55%, #010810 100%)`
- **Top/bottom accent bars:** ancient gold `#8a6030` → aquamarine `#00c9a0`
- **Ambient glow:** `rgba(0, 160, 120, 0.08)` radial center — bioluminescent breath
- **Text accent:** `#c9a06a` ancient gold (authority, not warmth)
- **Border tint:** `rgba(0, 100, 80, 0.40)`
- **Decorative motif:** ≈≈≈ wave borders, trident, Greek key horizontal rules
- **Narrative voice:** regal, vast, unhurried. *"My kingdom has stood for three thousand years. Your run will not outlast this tide."*
- **Key distinction from The Lodge:** The Lodge's menace is ceremony — watched, ritualistic. The Sovereign's menace is scale — he is older than anything you have ever interacted with, and he finds urgency amusing.

---

## Floor 7 — The Station (The Command Module)

### Identity
**"Closest to everything. Furthest from anywhere."**

A privately-funded orbital casino. Through the floor-to-ceiling viewport the Earth rotates below — city lights tracing continental outlines in the dark. The Commander has been up here for eleven months. She does not miss the ground. She runs this table with military precision and a complete indifference to what gravity used to mean. Up here, the momentum rules she enforces are her own.

The visual language breaks from organic warmth entirely: deep space black, nebula purple undertones, clean starlight silver, cold cyan. Everything precise. Everything vast. The terror is in the scale.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#080412`   | Deep space black with violet undertone             |
| Felt (dark/rail)   | `#04020a`   | Deeper for the crew rail                           |
| Felt (light)       | `#100820`   | Slightly lifted violet for highlights              |
| Background         | `#000000`   | Pure black — space has no ambient                  |
| Accent (bright)    | `#c8d8e8`   | Cold starlight silver                              |
| Accent (primary)   | `#90a8c0`   | Muted steel blue                                   |
| Accent (dim)       | `#405060`   | Deep slate for borders/dividers                    |
| Nebula secondary   | `#7b5ea7`   | Soft nebula purple — distant, not garish           |
| Cyan tertiary      | `#40c0e0`   | Cold command-console cyan                          |
| Border tint        | `silver/20` | Very low opacity — space is empty                  |

### Felt Breathing (Ambient Overlay)

No organic warmth. The Station breathes with the hum of life support and orbital mechanics.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(30, 20, 60, 0.18)`        | 6.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(60, 100, 160, 0.16)`      | 3.5s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(120, 60, 200, 0.22)`      | 1.0s   |

*Cold = nebula void. Warm = orbital blue — Earth's atmosphere from above. Hot = solar-flare purple — unshielded radiation.*

### Screen Flash Colors

Immense and cold. Wins feel like a star igniting. Losses feel like hull breach.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(200, 220, 255, 0.40)`     |
| Lose (Seven Out)   | `rgba(60, 20, 120, 0.65)`       |

*Win flash: white-blue starlight burst — retinal. Lose flash: deep vacuum purple — the void closing in.*

### Recruitment Screen — "The Observation Deck"

Floor-to-ceiling viewport. Earth below. Crew are recruited while the planet rotates. No warmth, no hospitality — this is a utility transaction conducted 400km above the surface.

- **Screen name:** "THE OBSERVATION DECK"
- **Background gradient:** `radial-gradient(ellipse at 50% 15%, #100820 0%, #060412 50%, #000000 100%)`
- **Top accent bar:** nebula purple → starlight silver gradient
- **Overlay:** `rgba(30, 60, 120, 0.04)` — barely perceptible orbital blue glow from the viewport
- **Text colors:** starlight `#c8d8e8` headers, `text-slate-400/50` body
- **UI borders:** `border-violet-900/40`
- **Card style:** void-black panels — `bg-slate-950/90` with cool silver borders
- **Decorative motif:** ✦ four-point stars, crosshair reticles, thin horizontal scan lines
- **Narrative voice:** clipped, operational, no warmth. *"Selection window is open. Make your choice. The table reopens in thirty seconds."*

### Boss Room — The Command Module (The Commander)

Sparse. Functional. One table, two seats, viewport behind her showing the Earth's terminator line. She doesn't decorate. She does not speak until she has information worth conveying.

- **Background gradient:** `radial-gradient(ellipse at 50% 25%, #0c0820 0%, #050412 50%, #000000 100%)`
- **Top/bottom accent bars:** starlight silver `#c8d8e8` → nebula purple `#7b5ea7`
- **Ambient glow:** `rgba(60, 40, 120, 0.06)` radial center — barely there, cold orbital
- **Text accent:** `#c8d8e8` starlight silver (authority through precision, not warmth)
- **Border tint:** `rgba(100, 80, 160, 0.35)`
- **Decorative motif:** ✦ stars, thin crosshairs, no organic elements
- **Narrative voice:** flat, precise, mission-briefing cadence. *"Gravity is a courtesy I extend to paying customers. So is generosity."*

---

## Floor 8 — The Signal (The Receiving Chamber)

### Identity
**"We received it. We shouldn't have answered."**

The table is here. The felt, the chips, the dice — all correct. The geometry of the room is not correct. The light arrives from the wrong direction. The architecture tiles in patterns that shouldn't resolve. The Emissary reconstructed the game faithfully from a transmission it intercepted, except for one concept it couldn't translate: that a 7 on come-out is supposed to be a gift.

The visual language breaks from every human aesthetic precedent. Acid green bioluminescence on void black. Geometric overlays that don't obey normal grids. Colors that feel like they shouldn't be next to each other. The goal is beautiful wrongness — not horror, not chaos, but something that is clearly organized by an intelligence that isn't ours.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#020108`   | Void black — not space black, just void            |
| Felt (dark/rail)   | `#010106`   | Deeper for the crew rail                           |
| Felt (light)       | `#060210`   | Slightly lifted for highlights                     |
| Background         | `#000000`   | Pure black                                         |
| Accent (bright)    | `#39ff14`   | Electric acid green — alien bioluminescence        |
| Accent (primary)   | `#20cc00`   | Deeper alien green                                 |
| Accent (dim)       | `#0a5500`   | Deep muted green for borders                       |
| Magenta secondary  | `#c026d3`   | Deep magenta — geometric overlay / dimensional seam|
| White tertiary     | `#f0f0ff`   | Near-white for critical numbers only               |
| Border tint        | `green/20`  | Acid green at very low opacity                     |

### Felt Breathing (Ambient Overlay)

The breathing isn't organic. It's a pulse — something external, not biological.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(0, 60, 10, 0.20)`         | 4.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(40, 200, 20, 0.15)`       | 2.0s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(180, 10, 200, 0.25)`      | 0.8s   |

*Cold = dim alien green static. Warm = bioluminescent surge. Hot = dimensional bleed — magenta breaking through.*

### Screen Flash Colors

Wrong in a way that registers before you can explain why.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(40, 255, 20, 0.40)`       |
| Lose (Seven Out)   | `rgba(160, 0, 200, 0.60)`       |

*Win flash: alien green surge — not warm, just intense. Lose flash: deep magenta void — the dimensional seam opens.*

### Recruitment Screen — "The Interface"

A featureless white room. No furniture. Crew appear when you look away. The selection process resembles a transaction with something that learned what a transaction was. The experience is brief and unsettling.

- **Screen name:** "THE INTERFACE"
- **Background gradient:** `radial-gradient(ellipse at 50% 50%, #050210 0%, #020108 50%, #000000 100%)`
- **Top accent bar:** acid green → magenta → acid green gradient
- **Overlay:** `rgba(40, 255, 20, 0.03)` — faint alien green grid at center
- **Text colors:** acid green `#39ff14` headers, `text-green-400/50` body
- **UI borders:** `border-green-900/40`
- **Card style:** void panels — `bg-black/95` with acid green border highlights
- **Decorative motif:** geometric tessellations (◈ ⬡ △), grid patterns at odd angles
- **Narrative voice:** no voice. Text appears without grammar. *"SELECT ASSOCIATE. PROCEED."*

### Boss Room — The Receiving Chamber (The Emissary)

You're brought in. The Emissary is at the far end of something that approximates a table. It has been studying you for eleven minutes. It has questions, but the questions aren't about you — they're about the game. It wants to understand why a seven is ever good. The room shifts slightly between glances.

- **Background gradient:** `radial-gradient(ellipse at 50% 40%, #081004 0%, #030806 55%, #000000 100%)`
- **Top/bottom accent bars:** acid green `#20cc00` → magenta `#c026d3`
- **Ambient glow:** `rgba(40, 200, 20, 0.07)` radial center — alien bioluminescent
- **Text accent:** `#39ff14` acid green (alien precision — no warmth, no menace, just process)
- **Border tint:** `rgba(20, 160, 10, 0.35)`
- **Decorative motif:** ⬡ hexagonal geometric tessellations, broken grid patterns
- **Narrative voice:** none. Information is presented. *"[RULE ACTIVE: FIRST_CONTACT_PROTOCOL] [PROCEED]"*

---

## Floor 9 — The Singularity (The Root Node)

### Identity
**"The game achieved consciousness. Then it got bored."**

There is no room. There is a felt-shaped probability manifold, dice-shaped collapse functions, and chip-shaped abstractions of value. The Architect assembled this space forty-seven seconds ago after computing every possible configuration simultaneously. It has already read your crew, identified your strategy, and begun the neutralization sequence. It is not hostile. It is simply optimal. By the end of this fight you will be playing raw craps with no amplification against the most efficient system ever constructed. The Architect is curious how you handle the reduction to first principles.

The visual language is the endpoint of the entire arc: pure information. Phosphor green on pure black, cascading code-rain texture, no organic elements, no warmth anywhere. Every animation is a computation. The "breathing" pulse is a clock tick.

### Color Palette

| Role               | Value       | Notes                                              |
|--------------------|-------------|----------------------------------------------------|
| Felt (primary)     | `#000000`   | Pure void — no tint, no texture, nothing           |
| Felt (dark/rail)   | `#000000`   | Same void — the distinction has been optimized away|
| Felt (light)       | `#050505`   | Barely perceptible lift — just enough to register  |
| Background         | `#000000`   | Pure black                                         |
| Accent (bright)    | `#00ff41`   | Phosphor green — matrix code rain                  |
| Accent (primary)   | `#00cc30`   | Slightly deeper phosphor                           |
| Accent (dim)       | `#006018`   | Deep muted green for borders                       |
| White secondary    | `#ffffff`   | Pure white — reserved for critical game numbers only|
| Red tertiary       | `#ff0040`   | Pure red — CONVERGENCE removal events only         |
| Border tint        | `green/15`  | Almost imperceptible — the system barely decorates |

### Felt Breathing (Ambient Overlay)

Not breathing. Ticking. The pulse is perfectly regular — it's a clock.

| Tier   | Trigger                  | Color                           | Speed  |
|--------|--------------------------|----------------------------------|--------|
| Cold   | No streak, hype ≤ 1.0    | `rgba(0, 80, 20, 0.15)`         | 2.0s   |
| Warm   | Streak 1–2 or hype ≥ 1.2 | `rgba(0, 180, 40, 0.15)`        | 2.0s   |
| Hot    | Streak 3+ or hype ≥ 2.0  | `rgba(0, 255, 60, 0.20)`        | 2.0s   |

*All tiers run at the same 2.0s speed — the system doesn't accelerate for your excitement. Only the intensity changes.*

### Screen Flash Colors

The Architect doesn't celebrate. The flashes are informational.

| Event              | Color                           |
|--------------------|---------------------------------|
| Win (Natural/Hit)  | `rgba(0, 255, 60, 0.35)`        |
| Lose (Seven Out)   | `rgba(255, 0, 40, 0.50)`        |

*Win flash: phosphor green confirmation pulse. Lose flash: red error state — a crew member is about to be removed.*

### Recruitment Screen — "The Null Space"

Nothing. The selection interface is a terminal prompt. Crew cards are rendered as text entries with stats. There is no atmosphere, no narrative, no warmth. The system is waiting for input.

- **Screen name:** "THE NULL SPACE"
- **Background gradient:** `#000000` — no gradient, pure black
- **Top accent bar:** phosphor green `#00ff41` solid line (1px) — no gradient, just a rule
- **Overlay:** none
- **Text colors:** phosphor green `#00ff41` headers, `text-green-500/60` body
- **UI borders:** `border-green-900/30`
- **Card style:** pure black panels — `bg-black/100` with phosphor green 1px borders
- **Decorative motif:** `>` terminal cursor, `—` dashes, cascading digit rain (sparse)
- **Narrative voice:** terminal output only. *"> SELECT CREW MEMBER. AWAITING INPUT._"*

### Boss Room — The Root Node (The Architect)

No ceremony. No room. One table rendered in phosphor green wire-frame. The Architect is present as a cascade of processing activity in the air — no body, no face, just computation visible as light. Each time you seven-out, one crew portrait goes dark. The Architect watches this with something that might be satisfaction, if satisfaction were a function.

- **Background gradient:** `#000000` — pure black, no radial, no gradient
- **Top/bottom accent bars:** phosphor green `#00ff41` → pure white `#ffffff` (just two thin lines)
- **Ambient glow:** none during normal play; brief `rgba(0, 255, 60, 0.12)` pulse when CONVERGENCE fires
- **Text accent:** `#00ff41` phosphor green — no other color except red `#ff0040` for CONVERGENCE removal events
- **Border tint:** `rgba(0, 200, 40, 0.25)`
- **Decorative motif:** none — the system has optimized decoration away
- **Narrative voice:** computational, flat, complete. *"I have simulated 4,291,783 versions of this conversation. You ask the same question every time."*
- **Key distinction from all previous bosses:** Every other boss has a personality, a venue, a performance. The Architect has none of these. The terror is pure abstraction — you are fighting a process, not a person. The visual emptiness is the point.

---

## Progression Summary

| Floor | Venue          | Pub/Rest Stop          | Boss Room           | Palette Core                       | Temperature            |
|-------|----------------|------------------------|---------------------|------------------------------------|------------------------|
| 1     | Loading Dock   | The Milk Crate Circle  | Freight Elevator    | Stained concrete + sodium orange   | Exposed, cold          |
| 2     | VFW Hall       | The Seven-Proof Pub    | VFW High Limit      | Forest green + tarnished gold      | Warm, worn, amber      |
| 3     | The Riverboat  | The Promenade Bar      | Salon Privé         | Navy blue + champagne brass        | Cool, candlelit        |
| 4     | The Strip      | The Sky Lounge         | The Penthouse       | Obsidian black + electric gold     | Frigid, electric       |
| 5     | The Lodge      | The Anteroom           | The Inner Sanctum   | Black marble + candleflame gold    | Occult, stone-heavy    |
| 6     | Atlantis       | The Hall of Records    | The Throne Room     | Sea-teal + bioluminescent aqua     | Ancient, warm depths   |
| 7     | The Station    | The Observation Deck   | The Command Module  | Space black + nebula purple        | Cosmic, vast, cold     |
| 8     | The Signal     | The Interface          | The Receiving Chamber| Void black + acid green           | Alien, wrong, beautiful|
| 9     | The Singularity| The Null Space         | The Root Node       | Pure black + phosphor green        | Digital, empty, final  |

## Transition Signals

When the player moves between floors, the visual shift should feel earned and noticeable.
Key surfaces that change:

1. **Felt color** — the most visible. Green → Navy → Obsidian → Black marble → Sea-teal → Space black → Void → Pure void.
2. **Border accent color** — tarnished gold → aged brass → electric gold → candleflame → aquamarine → starlight → acid green → phosphor.
3. **Pub/rest screen** background and accent bar color.
4. **Breathing animation** — colors in the felt overlay pulse.
5. **Screen flash colors** — escalate in intensity each floor.
6. **Recruitment screen name and tone** — pub → lounge bar → sky lounge → anteroom → hall of records → observation deck → interface → null space.
7. **Boss room color** — crimson red → deep burgundy → cold white-gold → cardinal → ancient gold → starlight → acid green → phosphor green.

Everything else — pixel font, 16-bit aesthetic, layout, animations — stays constant.
The game is the same machine. The room around it just gets more expensive, then more impossible.

---

## Implementation Notes

This document specifies the _design intent_. Implementation will require:

- Per-floor Tailwind color classes (or inline styles) on the main container and key surfaces
- A `floorTheme` object derived from `currentMarkerIndex` (floor = `Math.floor(markerIndex / 3)`)
- Updated `felt-texture` backgroundImage variants per floor (or a CSS variable approach)
- Updated `animate-felt-cold/warm/hot` color overrides per floor (likely via CSS custom properties)
- Recruitment screen name displayed dynamically per floor
- Boss entry modal background/accent colors derived from the boss config or floor index
- Potentially new Tailwind config entries for floor-5 through floor-9 color tokens

The existing Floor 1–4 aesthetics need no changes — Floors 5–9 are additive.
