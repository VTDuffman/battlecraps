# FB-042: Under the Glass — Boss Mechanics on the Table (Design)

**Status:** Implemented 2026-10-17.
**Pattern:** presentation only. No rule, server or payload changes.

---

## 1. Summary

Each boss's mechanic tracker sits in the game-status section (the cash register, performance meter, offering bowl, tide dial, orbit gauge and transmission line under the marker progress bar; Sarge's clock in the boss header). In a boss room the header and status section are squeezed to make room for it, so on a phone the tracker is cramped. Meanwhile the green space below, which holds the floor logo (`FloorEmblem`) and gives the dice room to fly, does little.

**The change:** in a boss room, the boss's tracker replaces the floor logo. It sits **under glass, set into the felt**, and the dice fly over it on every throw, as they do over the logo today. The boss is the table.

## 2. Decisions (2026-10-17)

| # | Question | Decision |
|---|---|---|
| 1 | Where | The green space (the dice travel zone). In boss rooms the tracker replaces `FloorEmblem`. |
| 2 | The floor logo in boss rooms | **Dropped.** The boss is the floor at that point. Non-boss markers keep it. |
| 3 | Sarge's clock | **Moves** to the table: a big clock face under the glass. |
| 4 | The Architect ("N CREW LEFT") | **Later.** Stays in the header; his table display is part of FB-040 (Convergence). |
| 5 | Mme. Le Prix (no tracker today) | **She traps the charmed crew member under the glass.** |
| 6a | The glass itself (after Phase 1 review) | **Figurative — no frame.** No well border, inset shadow or sheen; the tracker simply spans the width of the field and the dice fly over it. |
| 6 | The Foreman's register | Moves to the table; the status section gets a small "CUT $12 / $25" in its place. |

## 3. Why it already nearly works

The dice throw measures the distance from the dice to the bottom of the game-status section (`#wall-divider`) and flies the dice up across the whole green space (`--dice-travel`, `DiceZone.tsx`). The dice are drawn on a higher layer than the green space (the DiceZone container is `z-[2]`, the dice pair `z-10` while thrown), which is why they pass over the logo. Anything placed in the green space passes under them **as long as it never creates a stacking layer above the dice.** The bounce point doesn't move.

## 4. The glass well (`BossTableWell`)

A new component rendered in the green space in place of `FloorEmblem` when the current marker is a boss marker with a table tracker (`FloorEmblem` everywhere else, including The Architect for now).

- **Picks the tracker** by `boss.rule`. This selection moves out of `MarkerProgress` (`TableBoard.tsx`) and into the well. It uses the same display-marker / `isCleared` logic, so a tracker stays mounted through the celebration hold where it does today (the Foreman's PAID IN FULL stamp needs that).
- **Layers (bottom → top):** the felt → the tracker → the glass → the dice.
- **The glass:** a soft diagonal sheen, a darker inner edge so it reads as an inset well in the felt, a faint felt-coloured rim. The felt's breathing glow passes over it like it does over the logo. The tracker stays fully readable through it.
- **Fit-to-space:** the green space's height varies a lot (short on phones). The well measures its box (`ResizeObserver`) and scales the tracker to fit, with a maximum scale so it doesn't balloon on desktop. Trackers can also take a `size` hint.
- **No input:** `pointer-events: none`. No tracker has controls.
- **Overflow:** the green space clips (`overflow-hidden`). Pop-ups that hang outside a tracker (RECEIVED +$X, +15% · $X, PAID IN FULL) need room inside the well or a nudge inward.

## 5. Each tracker

Each was designed as a short strip under a progress bar. On the table it gets a real box, so each gets a size pass.

| Boss | Tracker | Notes |
|---|---|---|
| The Foreman | `CashRegister` | Already has `size="large"`. Status section shows a small "CUT $X / $25" readout instead of the register; the progress bar stays hidden for payoff markers. |
| Sarge | `SargeClock` | Out of `BossRoomHeader`, onto the table as a big clock face (grow / pulse / tick / alarm / TIME'S UP as today). |
| Mme. Le Prix | *new* trapped crew | See §6. |
| The Executive | `PerformanceMeter` | Wider meter, bigger tier labels; FINAL WARNING alarm fills the glass. |
| The Hierophant | `OfferingBowl` | Bigger bowl; the eye can sit above it. |
| The Sovereign | `TideDial` | Gains the most height. `TideWater` (the full-screen flood) is unchanged. |
| The Commander | `OrbitGauge` | Gains the most height — a proper planet and orbit. |
| The Emissary | `TransmissionLine` | Full width of the well; the NO SIGNAL static can fill the glass. |

## 6. Mme. Le Prix — the trapped crew member

- **Charmed:** the charmed crew member's portrait sinks out of the crew rail and settles under the glass in a dreamy pink haze with a slow heart pulse. Their rail slot keeps a faint outline with a small ❤️.
- **The charm moves (each come-out):** the trapped crew member floats back up to their slot; `CharmFlight`'s heart now lands on the glass instead of her name, and pulls the next one down. The entry charm starts at the glass.
- **They would have fired** (`charmFired`, today's heartbeat + daze on the portrait): they press up against the glass with a muffled knock, then sink back, dazed.
- **The dice** fly over them like every other tracker.
- **Rail:** the trapped slot can't be dragged (`useSortable` disabled for it); the other crew can still be reordered around it.
- **THE ROSE (win):** the glass cracks, the trapped crew member flies back to the rail, then the rose plays as today.
- **SHE TAKES THE CREW (loss):** kept. The trapped crew member is no longer on the rail, so `measureRailCrew()` needs that one's start point under the glass; it leaves first, the rest follow. (Alternative to decide in Phase 3: she pulls the whole crew under the glass.)

## 7. The header gets its room back

With the trackers gone, the boss-room squeeze in `TableBoard` (`compact={isBossRoom}` on `GameStatus`, tighter `#wall-divider` padding) can come off. Check the boss header on a phone afterwards.

## 8. Unchanged (check, don't rework)

- Full-screen effects and cinematics aim at the bankroll (`data-bankroll-readout`), shooter pips (`data-shooter-pip`), boss name (`data-boss-name-anchor`) and crew portraits (`data-slot-index`) — none of those move. `TideWater` measures pips and bankroll only.
- The tutorial spotlights the progress bar (`marker-progress`), which stays where it is; the tutorial never meets a boss tracker.
- The particle canvas (fixed, portaled) is unaffected.

## 9. Optional polish

- A soft dice shadow on the glass as they pass.
- A faint glint sweeping the glass on each throw.

## 10. Docs

`CLAUDE.md` (the trackers' new home, Le Prix's trap), `boss_framework.md` (each boss's "front and center" line), backlog.
