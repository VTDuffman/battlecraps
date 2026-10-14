# FB-035: The Executive Boss Moments (Design)

**Status:** Design agreed 2026-10-14. Ready for implementation.
**Pattern:** boss #4 of the per-boss "moments" roll-out (FB-032 Foreman, FB-033 Sarge, FB-034 Le Prix). The Executive's Pink Slip (FB-027) inspired the pattern; this brings him up to the scale the pattern has since reached ("big wins, big losses").

---

## 1. Summary

The Executive (Floor 4, The Suite — Corner Office, `CROSS_CALIBRATION`). Mechanic unchanged: a Performance Review rating 0–4 (Action Required → Exceptional), starting at Strong (2); Natural / Point Hit +1, Craps Out / Seven Out −1; +15% gross profit at Exceptional; a bad roll at Action Required is PIP termination (game over).

**Today vs. the pattern:**

| Piece | Today | Gap |
|---|---|---|
| Barks | Separate legacy system — store-local `EXECUTIVE_BARKS_UP/DOWN`, a bubble in the header, fires on **every** rating change | Too chatty; silent on his big moments; not on the shared system |
| Mechanic drama | "PERF REVIEW" label + coloured text in the header; Action Required pulses | Small for the thing his whole fight is about |
| Win | None (generic victory quote) | Missing |
| Loss | `PinkSlipModal` over GameOverScreen, PIP only — static memo, small TERMINATED label, OK button, no sound | Smaller than its descendants; ordinary losses get nothing |

## 2. Decisions (2026-10-14)

| # | Question | Decision |
|---|---|---|
| 1 | Barks | **Migrate to the shared bark system** so every boss runs on the same mechanic. Event-driven. |
| 2 | Mechanic drama | **A real performance meter.** |
| 3 | Win moment | **The nameplate swap.** |
| 4 | Loss moment | **The Pink Slip, rebuilt as a defeat cinematic + the box of crew**, for **every** run-ending loss in his fight (PIP and ordinary). |

## 3. Barks (shared `bossBarks.ts`)

Events in `deriveBossBarkEvents` `CROSS_CALIBRATION`, highest priority first:

| Event | When | Bark | Lines |
|---|---|---|---|
| `promoted` | rating reaches 4 (Exceptional) | always | "Now *that's* executive presence." · "Let's fast-track this one." |
| `finalWarning` | rating reaches 0 (Action Required) | always | "Consider this your formal notice." · "One more and we part ways." |
| `bonusPaid` | the +15% Exceptional bonus paid out this roll | 50% (frequent while at Exceptional) | "Don't spend it all in one quarter." · "Bonus approved. Don't get used to it." |
| `ratingUp` | rating rose (not to 4) | 40% | trimmed from today's UP lines — "You're really moving the needle." · "Excellent value-add." · "I'm seeing real alignment." |
| `ratingDown` | rating fell (not to 0) | 40% | "We need to discuss your engagement metrics." · "I'm concerned about your trajectory." · "I'd like to loop in HR on this one." |
| `win` / `loss` | fallback | chance | (none — rating events cover his voice) |

Frequent events use `EVENT_BARK_CHANCE` (never over a showing bark; a skip is silence). The legacy `EXECUTIVE_BARKS_*`, `executiveBark` state and the header bubble are removed. **Server:** `turn:settled` gains `exceptionalBonusCents` (the bonus actually paid) so the client can bark and show the +15% tag.

Voice: clipped corporate-speak, polite and cold. Player references neutral ("this one", "you").

## 4. The performance meter

Front and center under the marker progress bar (the Executive still clears on bankroll, so the bar stays), replacing the header text:
- A **5-step review scale** — ACTION REQUIRED · BELOW STRONG · STRONG · VERY STRONG · EXCEPTIONAL — with a **marker that slides** to the new rating when it changes, plus a soft office tick ("clack") per step and a ding on promotion.
- **Exceptional:** the scale glows gold; when a bonus pays, a **"+15% · $X"** tag pops off the meter.
- **Action Required:** the meter turns red with a slow alarm pulse and **"FINAL WARNING"** beneath it.
- Reduced motion: no slide/pulse; colours and labels only.

## 5. Win moment: the nameplate swap

On the roll that clears his marker (celebration hold):
1. A big brass **nameplate** on the Corner Office door reads **THE EXECUTIVE**.
2. It's **pried off** (two screws spin out), tips, and **falls with a clang** out of frame.
3. A new plate **slides in**: **THE SHOOTER**, with a gold glint sweeping across it.
4. **Ticker tape** rains down; an office-chime fanfare.
5. His line: *"…restructuring was inevitable. Well played."*

~5.5–6 s, own hold in `VICTORY_HOLD_MS_BY_ID`. `victoryCinematic { id: 'NAMEPLATE_SWAP', line }`.

## 6. Loss moment: terminated

On any run-ending roll in his fight (`defeatCinematic { id: 'TERMINATED', line }`):
1. The **pink memo** slides in (the Pink Slip document, bigger). Its subject depends on how you lost: PIP termination → *Performance Improvement Plan — Continued Performance Deficiency*; any other loss → *Position Eliminated — Restructuring*.
2. **TERMINATED** stamp slams on (thud + jolt) — big, red.
3. The memo slides aside; a **banker's box** slides in; **your real crew portraits** (measured from the rail) drop into it one by one (a soft cardboard thump each); the lid shuts; the box slides off screen.
4. His line: *"Security will see you out."*

~7–7.5 s, inside the 9 s defeat safety net. Replaces `PinkSlipModal` (removed from `App.tsx`) and its OK button — timed like the other defeat cinematics. `pipTermination` stays in the payload and selects the memo variant.

## 7. Copy

All in `config.ts` (`barks`, `victoryCinematic`, `defeatCinematic`). Update `boss_framework.md`, `CLAUDE.md` (the "Pink Slip is separate" note goes away), backlog.

## 8. Out of scope

His mechanic and numbers; the remaining five bosses.
