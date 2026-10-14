# FB-033: Sarge Boss Moments (Design)

**Status:** Design agreed 2026-10-13. Ready for implementation.
**Pattern:** boss #2 of the per-boss "moments" roll-out started by FB-032 (The Foreman). Remaining bosses follow one at a time.

---

## 1. Summary

Give Sarge (Floor 2, Double Time) the same treatment as the Foreman: a voice, a dramatic clock, a signature win moment and a signature loss moment. His mechanic is unchanged (FB-030): once a point is set you have 6 rolls to hit it, or the 6th blank is a Seven-Out ("TIME'S UP").

Adds one new shared system and extends one:
- **Barks** gain **per-boss event triggers** (Sarge's clock events), not just win/loss/progress.
- **Boss victory moments**: a new per-boss system mirroring defeat cinematics.

## 2. Decisions (2026-10-13)

| # | Question | Decision |
|---|---|---|
| 1 | Clock placement | **Stays in the boss header**, but **grows and pulses during the point phase** (it's a threat, not a goal). |
| 2 | Win moment | **HONORABLY DISCHARGED** stamp + short bugle call. |
| 3 | Bark lines | Start with the drafts below; tune after playtesting. |
| — | Loss moment | **DISHONORABLE DISCHARGE** (agreed in the proposal). |

## 3. Barks: drill-sergeant voice

Shouting caps for orders, deadpan lowercase for grudging praise.

| Trigger | Lines |
|---|---|
| `pointSet` (clock starts) | "CLOCK'S RUNNING, SOLDIER!" · "SIX ROLLS. MOVE IT!" · "THE CLOCK IS NOT YOUR FRIEND." |
| `clockLow` (2 rolls left) | "TWO MORE! I SAID MOVE!" · "YOU CALL THAT HUSTLE?" |
| `lastRoll` (1 roll left) | "LAST CHANCE, MAGGOT!" · "THIS IS IT, PRIVATE!" |
| `beatClock` (point hit) | "…adequate." · "Don't let it go to your head." |
| `timeUp` (clock expired) | "TIME! DROP AND GIVE ME TWENTY!" · "TOO SLOW, RECRUIT!" |
| `win` (other wins, e.g. natural) | "Don't get cocky." · "Lucky shot, soldier." |
| `loss` (craps / seven-out) | "PATHETIC." · "MY GRANDMOTHER ROLLS BETTER." |

**Priority:** timeUp > lastRoll > clockLow > beatClock > pointSet > win > loss. Clock events always bark (they're the drama); win/loss stay chance-based and never talk over a showing bark (FB-032 rules).

### System change
`BossBarkTrigger` gains `pointSet | clockLow | lastRoll | beatClock | timeUp`. A shared per-rule **event deriver** turns roll facts (result, post-roll phase, Sarge's clock count, `clockExpired`) into the event triggers for that boss, in priority order; `pickBossBark` takes the first one the boss has lines for. The Foreman's Cut milestones move onto the same mechanism. Other bosses add their own events later.

## 4. Clock drama (header, point phase)

- **Grow + pulse:** in the point phase the Double Time clock scales up (~1.35×) with a soft glow; on the last two rolls it turns red (already does) and pulses harder; the last roll keeps its blink.
- **Tick:** a mechanical tick on every point-phase roll, sharper as the count drops.
- **Alarm:** a short buzz when the clock reaches the last roll.
- **Whistle:** a drill whistle on TIME'S UP (with the existing popup).
- Reduced motion: no scale/pulse animation; sounds still respect mute/volume.

## 5. Win moment: HONORABLY DISCHARGED

On the roll that clears Sarge's marker, before the boss-victory celebration (held like PAID IN FULL):
1. A cream discharge certificate slides up over the table.
2. A green/gold **HONORABLY DISCHARGED** stamp slams onto it.
3. A short synthesized **bugle call**.
4. Sarge: *"…not bad, soldier. Dismissed."*
~3.5 s, then the normal celebration → pub.

### System: boss victory moments
- `BossConfig.victoryCinematic?: { id, line }` (same shape as `defeatCinematic`); registry `VICTORY_CINEMATICS` in `components/victory/`; host renders over the table.
- **Timing:** generalizes FB-032's `payoffAt` / `PAYOFF_HOLD_MS`: a `celebrationHold` (ms + started-at) that every celebration hand-off timer respects. The Foreman's PAID IN FULL keeps working unchanged (it stays in his register; he gets no `victoryCinematic`).
- Dev Panel: **Victory** preview per boss.

## 6. Loss moment: DISHONORABLE DISCHARGE

When Sarge ends the run (out of shooters, often via TIME'S UP, or bankroll):
1. A discharge form slides up over the table.
2. A red **DISHONORABLE DISCHARGE** stamp slams across it (thud + shake).
3. A pair of **dog tags** drops onto the form: falls, bounces, settles with a metallic jingle.
4. Sarge: *"Drop and give me twenty… thousand."*
~5.5 s (matching DOCK CLOSED's tuned length), then game over. Uses the FB-032 defeat cinematic system (`defeatCinematic { id: 'DISHONORABLE_DISCHARGE', line }`).

The win and loss share the discharge-form visual: honorable if you beat him, dishonorable if he beats you.

## 7. Player-facing copy
All new copy lives in `config.ts` (barks, victory/defeat lines). No change to Sarge's rule text. Update `boss_framework.md` (Sarge section) and CLAUDE.md.

## 8. Out of scope
- Sarge's mechanic (unchanged).
- The other seven bosses (next, one at a time).
- Migrating the Executive's barks onto the generic system.
