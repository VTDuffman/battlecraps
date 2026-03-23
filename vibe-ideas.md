# BattleCraps — Vibe Enhancement Ideas

Ten ideas for visual animations and effects to make the game more exciting.
Roughly ordered from "tight polish" to "big spectacle."

---

## 1. Dice Roll Shake + Tumble
Before the result lands, the dice visually shake and tumble — rapid random face flips at decreasing speed, like a slot machine winding down. The final value "snaps" in with a bounce. Currently the dice just update instantly; this adds anticipation to every roll.

---

## 2. Bankroll Counter Odometer
Instead of the bankroll number jumping to its new value, it counts up/down like an odometer — fast on big swings, slow on small ones. Wins count up in green, losses tick down in red. The animation speed scales with the dollar amount so a $500 hit feels dramatically different from a $5 win.

---

## 3. NATURAL / POINT HIT Screen Flash
On a Natural or Point Hit, the entire table background flashes a burst of gold/white light that fades in ~400ms. On Seven Out, a brief deep-red pulse. These full-screen "heartbeat" flashes communicate the result viscerally before the player reads any text.

---

## 4. Hype Multiplier Heat Gradient
The Hype multiplier display (currently just a number) gains a color temperature that rises with the value — cool blue at 1.0×, amber at 1.5×, deep orange at 2.0×, pulsing red at 3.0×+. The background glow behind the hype counter intensifies at high multipliers, making a hot streak feel genuinely dangerous.

---

## 5. Chip Rain on Big Wins
When a payout exceeds a threshold (e.g., 3× the bet), coins/chips particle-spray upward from the bet zone and arc into the bankroll display. The count and arc height scale with the win size. Small wins get 3–5 chips; a max-odds Point Hit on 4 or 10 gets a torrent.

---

## 6. Crew Portrait Charged State
Between rolls, crew members on cooldown have a "charging" fill animation — a vertical energy bar inside their portrait that refills over time. When they're ready to fire, their portrait emits a subtle idle pulse/glow. When they fire, the portrait slams bright white then fades. Makes the crew rail feel alive even when nothing is happening.

---

## 7. Pass Line "On a Roll" Streak Indicator
A consecutive-points-hit streak counter appears on the Pass Line zone — a small flame icon with the streak number (e.g. 🔥×3). The flame grows taller with each consecutive hit. Breaking the streak (Seven Out) extinguishes it with a puff. Purely cosmetic, but streaks are the emotional core of craps.

---

## 8. Dice Face Micro-Animation on Point
When the point is set, the two dice that made the total slide together and the point number glows on the table puck with a brief radial ring-pulse. On a Point Hit, the same dice arrangement re-appears for a split second ("you did it again") before the payout fires. Reinforces the narrative of the shooter's journey.

---

## 9. Cascading Score Pop-Ups
Each payout line in the resolution (Pass Line, Odds, Hardway) pops up as a floating "+$X.XX" number that rises and fades from the bet zone, staggered 80ms apart. The net delta still appears in the roll log, but these floating numbers give spatial feedback right where the chips were — the player's eye doesn't need to leave the table.

---

## 10. "The Crowd" Ambient Sound Reactive Background
The felt table texture subtly "breathes" — on a hot streak the background shimmer quickens and warms, on a cold streak it slows and cools. Pair this with optional ambient crowd audio: quiet murmur at baseline, rising chatter on consecutive wins, a muted groan on Seven Out. No UI chrome needed — purely atmospheric, but it transforms the emotional register of the entire session.

---

## Implementation Priority Notes

Highest bang-for-buck (feel vs. effort):
- **#3 Screen Flash** — minimal code, maximum visceral impact
- **#9 Floating Payout Pops** — spatial feedback right at the bet zones
- **#2 Odometer Bankroll** — makes every win/loss feel weighted

These three together would make the game feel dramatically more alive without touching any game logic.
