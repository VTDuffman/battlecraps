# BattleCraps Tutorial — UX/Design Proposal

## Context
Playtesters unfamiliar with craps are hitting the table cold with no mental model. The tutorial must bridge two knowledge gaps: (1) base craps mechanics and (2) BattleCraps-specific systems. It should feel like part of the game world, not bolted-on help text.

---

## Entry Points

| Trigger | Behavior |
|---|---|
| First run, any new player | Tutorial auto-launches before Floor 1 begins |
| Main menu "HOW TO PLAY" | Always visible; lets player replay any section independently |
| Skip button | Available at any point; drops player straight into run |

---

## The Knowledge Gate

The tutorial opens **before** the first run's Floor 1 transition — after the player has signed in and their run is initialized, but before the Title cinematic plays.

```
╔══════════════════════════════════════╗
║  SAL THE FIXER (portrait, left)      ║
║                                      ║
║  "You ever shot dice before?"        ║
║                                      ║
║  [ YEAH, I KNOW CRAPS ]              ║
║  [ SHOW ME EVERYTHING  ]             ║
║                                      ║
║                  [ Skip Tutorial → ] ║
╚══════════════════════════════════════╝
```

- **"Yeah, I know craps"** → jumps to BattleCraps Module only
- **"Show me everything"** → starts at Craps Basics, flows into BattleCraps Module
- **"Skip"** → dismisses, starts run immediately

---

## The Guide: "Sal the Fixer"

A tutorial-specific NPC portrait — a gruff, world-weary veteran who knows every angle in every casino. Appears in a small inset portrait (lower-left or lower-right) during tutorial moments. Speaks in the game's gritty, cinematic voice.

- NOT a floating tooltip box. NOT a help panel. A character.
- Sal reacts to what's happening at the table ("Nice. You're learning.")
- Sal's dialog card has a dismiss ("Got it") and a "Tell me more" option for optional depth
- Sal disappears completely once the tutorial ends or is skipped

---

## Path A: Full Tutorial (craps novice)

Seven beats. Each beat = one spotlight moment on the live table.
The table is dimmed; the relevant zone glows. Player must take one real action to advance.

### Beat 1 — The Come-Out Roll
> "First thing you need: a come-out. That's the opening roll of the shooter's turn.
> 7 or 11 right here — we win. 2, 3, or 12 — we lose. Anything else sets the point."

*No player action needed. A simulated roll plays. Result: point established.*

### Beat 2 — The Pass Line
> "The Pass Line is your bread and butter. You're betting with the shooter.
> Every shooter's turn, you decide: in or out."

*Spotlight: Pass Line bet zone. Sal prompts: "Put something on the line."
Player places a Pass bet. Advance.*

### Beat 3 — Establishing the Point
> "There's your point — [4/5/6/8/9/10]. That puck tells you what we're chasing.
> Hit it again before a 7 shows, and we get paid."

*Point puck slides onto number. Player watches one or two rolls. Advance.*

### Beat 4 — Odds Bets
> "Here's the angle the house hates. Odds bet. No vig, no edge.
> You're backing your Pass bet at true odds. Best bet in the building."

*Spotlight: Odds zone behind Pass. Player places an odds bet.
Brief callout showing the payout ratio for the active point. Advance.*

### Beat 5 — Winning a Point
> "There it is. Point hit. Pass pays even money, odds pays [2:1 / 3:2 / 6:5].
> New come-out. We keep shooting."

*Simulated winning roll plays. Payout animation. Advance.*

### Beat 6 — Seven-Out
> "The seven-out. 7 shows before the point — you lose your pass and your odds.
> Shooter's done. New shooter steps up."

*Simulated 7-out plays. Chips pulled. Advance.*

### Beat 7 — Hardways
> "Hardways are side bets. Same number, both dice matching.
> Hard 6 means a 3 and a 3 — not a 5 and a 1. Higher payout, higher risk.
> Wins when it hits hard. Loses on a 7 or a soft hit."

*Spotlight: Hardway grid. Show Hard 6 vs Soft 6 side-by-side.
Player optionally places a hardway. Advance to BattleCraps Module.*

---

## Path B: BattleCraps Module (both paths converge here)

Four beats. Same spotlight/glow mechanic — now on BattleCraps-specific UI elements.

### Beat 8 — The Marker
> "This isn't a casino. You've got a target — $300.
> Hit it before you seven-out three times and you advance.
> Fall short, and you're done."

*Spotlight: Marker/target progress bar at top of screen.
Show the target number, current bankroll, outs remaining. Advance.*

### Beat 9 — Hype
> "Every point you string together, the crowd gets louder.
> That's your Hype multiplier — it's a tax on your hot streak.
> Keep rolling, it keeps climbing. Seven-out, it resets."

*Spotlight: Hype meter. Animate it ticking from 1.0× → 1.05× → 1.10×.
Show a before/after payout comparison demonstrating the multiplier effect. Advance.*

### Beat 10 — Your Crew
> "You're not alone at this table. Your crew works an angle before every roll.
> They can juice your bets, protect your streak, or find you extra chips.
> Pick them right and they chain together."

*Spotlight: Crew slot panel.
Animate one crew member firing their ability — show the cascade event text.
Brief callout: "Crew abilities chain from left to right." Advance.*

### Beat 11 — The Boss
> "At the end of every floor, someone's waiting.
> They change the game. Could be rising minimums. Could be your crew going dark.
> Learn their angle before you hit their floor."

*Show a stylized Boss portrait (Sarge or whoever is Floor 1's boss).
One sentence on their mechanic. "You'll meet them at the end of Floor 1." Advance.*

---

## Closing Beat

```
SAL:
"Alright. You know enough to be dangerous.
Floor 1. First marker. $300. Let's move."
```

*Sal's portrait slides away. Title cinematic plays. Run begins normally.*

---

## Main Menu "How to Play" — Independent Access

Three sections, each independently navigable. Accessible at any time from the title screen or the in-game menu.

```
HOW TO PLAY
─────────────────────────────────────
  [ Craps Basics      ]   →
  [ BattleCraps Rules ]   →
  [ Crew & Bosses     ]   →
─────────────────────────────────────
```

- **Craps Basics** — Static illustrated reference card for each beat (come-out, pass line, point, odds, hardways, seven-out). No interactivity — scannable reference.
- **BattleCraps Rules** — Marker system, hype formula, floor/boss progression. Includes quick-reference for payout odds and gauntlet targets.
- **Crew & Bosses** — Card gallery. Each recruited crew member's ability explained. Each boss's mechanic explained. Unlocks/reveals as player encounters them (bosses remain blurred until met).

---

## Design Principles

- **In-world voice, always.** Sal talks like he's been on this floor for 30 years. Not "This is the Pass Line bet which pays 1:1 on a win."
- **Action over reading.** Every beat requires one action (place a bet, watch a roll). The player is doing, not reading.
- **Respect their time.** Progress dots visible at all times. Skip never punishes.
- **No dead ends.** Tutorial completes into a real run seamlessly. No "returning to menu."
- **Craps knowledge first, BattleCraps second.** Even for adaptive players, the BattleCraps layer is always explained — the gate only skips the base craps section.
