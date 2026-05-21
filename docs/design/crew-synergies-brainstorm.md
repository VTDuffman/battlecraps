# BattleCraps — Crew Synergies & Combo Brainstorm

> **Context:** This document covers synergies between the existing 30 crew (IDs 1–30) and the proposed 30 new crew (IDs 31–60) documented in `crew-expansion-brainstorm.md`. Not all new crew are implemented yet — treat this as a design reference.

---

## Named Combos

### 1. The Phoenix Loop
**Crew:** Lucky Charm (ID 3) + Warden (ID 47) + Sea Legs comp

- Lucky Charm fires +1.0 hype on every SEVEN_OUT (no cooldown)
- Warden prevents the first seven-out's hype reset (per shooter)
- Sea Legs comp resets hype to 50% instead of 1.0× on seven-out

**Effect:** Each shooter dies, Warden blocks the first decay, Lucky Charm pushes hype up by +1.0, and Sea Legs comp floors the reset at 50%. Cross-shooter hype floors compound over time — a long run turns seven-outs into hype charging events rather than punishments. By shooter 5, you're starting each new shooter at 2.0+× hype before they roll their first come-out.

**Risk:** Requires both specific crew slots and a specific comp. Glass cannon vs. ORBITAL_DECAY (The Commander) — that boss explicitly decays hype on seven-out and ignores comp mitigation.

---

### 2. The Spiral
**Crew:** Pawnbroker (ID 52) + Daredevil (ID 43) + Lucky Charm (ID 3)

- Pawnbroker gives +$X on every seven-out (scales with stack depth, floor-adaptive)
- Daredevil gives a multiplier when the current shooter has more seven-outs than points hit
- Lucky Charm gives +1.0 hype on every seven-out

**Effect:** A full "lose to win" loop. You're deliberately running shooters into the ground — each seven-out feeds Pawnbroker's cash, Lucky Charm's hype, and Daredevil's multiplier all at once. A shooter who seven-outs three times before hitting a point is a goldmine, not a disaster.

**Counter-synergy warning:** Don't run The Grinder (ID 13) in this build — Grinder fires on NO_RESOLUTION, which dilutes your shooter cycle and slows the seven-out churn that The Spiral needs.

---

### 3. The Long Con
**Crew:** Mechanic (ID 31) + Sleeper (ID 37) + Statistician (ID 44) + Understudy (ID 36)

- Mechanic: re-rolls one die if both dice show ≤2 (prevents craps-outs)
- Sleeper: dormant for 5 rolls, then fires a large additive burst (scales with wait)
- Statistician: +hype if current shooter's roll count exceeds their personal best (per session)
- Understudy: absorbs one seven-out per shooter, treating it as a NO_RESOLUTION

**Effect:** Engineered long-shooter survival. Mechanic scrubs the worst come-out failures, Understudy eats one seven-out, and Statistician rewards roll count milestones. Sleeper's 5-roll dormancy aligns with a healthy shooter's natural rhythm — by roll 6 they've usually hit at least one point, so Sleeper fires into a hype-elevated context. A single shooter lasting 15+ rolls with this build is not unusual.

**Floor fit:** Best on F5–F7 where marker targets are high enough that additive scaling makes Sleeper's burst significant.

---

### 4. The Ghost Squad
**Crew:** Night Manager (ID 48) + Mimic (ID 39)

Only 2 slots required.

- Night Manager: +0.45 hype on every NO_RESOLUTION (point phase blank)
- Mimic: copies the last crew ability that triggered and re-fires it (same trigger condition)

**Effect:** On a NO_RESOLUTION roll, Night Manager fires for +0.45. Mimic reads "last triggered crew = Night Manager" and re-fires for another +0.45. Combined: **+0.90 hype per blank point-phase roll** from just 2 crew slots. NO_RESOLUTION rolls are ~65–70% of all point-phase rolls. Three remaining slots are free for PAYOUT crew.

**Stack note:** If another crew fires between Night Manager and Mimic in cascade order, Mimic copies that crew instead. Cascade slot positioning matters — Night Manager must be in slot 4, Mimic in slot 5 for the copy to target Night Manager reliably.

---

### 5. The Symphony
**Crew:** Maestro (ID 55) in slot 5 + 4 diverse-trigger crew in slots 1–4

- Maestro: counts how many distinct crew members fired this turn, then adds +0.15 hype per unique trigger

**Effect:** Maestro rewards crew diversity. With 4 crew each triggering on different conditions (e.g., one on NATURAL, one on POINT_HIT, one on NO_RESOLUTION, one on any roll), Maestro fires for +0.60 hype on the best turns. The design incentive is to avoid stacking multiple crew with the same trigger — width beats depth for The Symphony.

**Best supporting cast:** Lookout (any 6) + Silver Lining (CRAPS_OUT) + Bookkeeper (every 3rd roll) + Holly (POINT_HIT). Four different triggers, all plausible in normal play. Maestro sees all four fire on a good roll sequence and stacks accordingly.

---

### 6. The Precision Counter
**Crew:** Mechanic (ID 31) + Physics Prof (ID 32) + Oracle (ID 38)

Specifically built as a counter to Floor 4's FOURS_INSTANT_LOSS boss (The Executive).

- Oracle: previews the next roll's dice total before it resolves (display only — but informs bet decisions)
- Physics Prof: can nudge one die by ±1 (once per shooter, cooldown `per_shooter`)
- Mechanic: re-rolls low dice to avoid 2s

**Effect:** FOURS_INSTANT_LOSS triggers on any come-out roll of 4. Combined dice showing [1,3] or [2,2] = instant run end. Oracle tells you the total is 4 before resolution. Physics Prof burns their charge to shift a 2 to a 3 (making the total 5). Mechanic scrubs [1,1] come-outs preemptively. This build doesn't win faster — it survives the boss mechanic that normally runs most players out in 2–3 rolls.

---

### 7. The Hardway Detonation
**Crew:** Insider (ID 34) + Mathlete (ID 10) + Sparks (ID 33) + Big Spender (ID 16)

- Insider: +$X additive when a hardway bet wins
- Mathlete: protects hardway from losing on a soft 7-out (hardway stays live)
- Sparks: hardway bets placed at full max-bet automatically
- Big Spender: multiplier on the turn you make a max bet

**Effect:** Full hardway commitment build. Sparks auto-bets max hardway every point phase. Mathlete keeps the hardway alive through soft seven-outs. When the hardway finally fires (7:1 or 9:1 odds), Insider adds a scaled additive on top, and Big Spender's multiplier amplifies the whole turn's payout. A hardway hit on floor 7–8 with this build can swing 30–50% of the marker target in one roll.

**Risk:** Hardways pay rarely. Long droughts are expected. You need the rest of the crew rail and comp choices to keep the bankroll afloat during the dry spells.

---

### 8. The Triple Coroner
**Crew:** Coroner (ID 45) + Mimic (ID 39) + Joker (ID 41)

- Coroner: on any seven-out where dice show [1,6], fires a large additive (reading the death exactly)
- Mimic: copies the last triggered crew
- Joker: randomly doubles or halves the next crew ability's effect (33%/33%/33% split — double/normal/half)

**Effect:** [1,6] is one of the two specific dice combos that makes a 7. Frequency: ~2 of 6 possible sevens = ~1.67% of all rolls, but only relevant on seven-out rolls (which are ~16% of point-phase rolls). So this fires roughly 2.7% of all point-phase rolls. When it does: Joker flips first — if it doubles, Coroner fires for 2× its base, then Mimic copies for another 2× hit. Total: up to **4× Coroner's base additive** on a single roll. 

A max-additive Coroner at F8 hitting double+mimic generates a single-roll payout approaching 40% of marker target. The combo is rare enough to not be degenerate, but memorable enough to feel legendary.

---

### 9. The Beautiful Disaster
**Crew:** Silver Lining (ID 21) + Pawnbroker (ID 52) + Daredevil (ID 43) + Lucky Charm (ID 3)

A full "losing is winning" build, stacking every positive-on-loss trigger in the game.

| Roll | Who Fires |
|------|-----------|
| CRAPS_OUT | Silver Lining (+0.6 hype) |
| SEVEN_OUT | Lucky Charm (+1.0 hype) + Pawnbroker (+cash) + Daredevil (multiplier if loss-heavy shooter) |

**Effect:** Every bad outcome generates something. CRAPS_OUT is normally the worst come-out roll — here it's a free +0.6 hype. Seven-outs are normally devastating — here they spike hype by +1.0, inject cash, and activate Daredevil's multiplier. The fifth slot can run Warden or Sleeper depending on whether you want shooter longevity or additive bursts.

**Best comp pairing:** Sea Legs — hype resets to 50% on seven-out instead of 1.0×. With Lucky Charm's +1.0, that means each shooter starts their death at 1.5× hype at minimum.

---

### 10. The Dynasty
**Crew:** Arms Dealer (ID 50) + Counterfeiter (ID 53) + Landlord (ID 51)

A cross-run macro strategy, not a per-roll combo.

- Arms Dealer: grants +1 shooter per run clear (stacks across playthroughs)
- Counterfeiter: duplicates the highest-value comp effect each run
- Landlord: earns passive income between shooters (scales with run length)

**Effect:** Each completed run compounds the next. By run 3–4, you have 7–8 shooters per floor instead of 5, Counterfeiter is duplicating your strongest comp (e.g., ZERO_POINT → two instances of hype floor at 1.25×), and Landlord's inter-shooter trickle is meaningful at F6+ targets. This isn't the fastest build for a single run — it's the build that makes the 5th run dramatically more powerful than the 1st.

**Note:** Arms Dealer's stacking requires persistent cross-run storage. This mechanic may require backend schema changes to implement.

---

### 11. The AA Meeting
**Crew:** Faith Healer (ID 46) + Drunk Uncle (ID 17) + Warden (ID 47)

Specifically designed as a counter to Floor 7's ORBITAL_DECAY boss (The Commander).

- ORBITAL_DECAY: hype is multiplied by 0.5× on every seven-out — can drop below 1.0×
- Drunk Uncle: random hype change each roll (−0.25 to +0.50, uniform distribution), uncapped downside
- Faith Healer: restores hype toward 1.0× when hype has dropped below 1.0×, once per shooter
- Warden: blocks the first seven-out's hype reset per shooter

**Effect:** ORBITAL_DECAY turns seven-outs into hype halvings. Without mitigation, by seven-out 3, hype is at 0.125×. Warden eats the first halving free. Faith Healer rescues hype from sub-1.0× territory once per shooter. Drunk Uncle's expected value is slightly positive (+0.125 per roll) and can spike hype significantly on good variance — giving you more headroom before ORBITAL_DECAY's halvings become crippling.

**Risk:** Drunk Uncle's uncapped downside means you can still crater. This is a mitigation build, not a full counter. ORBITAL_DECAY is designed to be the hardest boss — The AA Meeting slows the decay, not eliminates it.

---

### 12. The Audit
**Crew:** Accountant (ID 57) + Taxman (ID 58) + Grinder (ID 13) + Bookkeeper (ID 7) + Contrarian (ID 5)

Full additive snowball build.

- Accountant: tracks cumulative additives earned this run, adds a % bonus to each new additive
- Taxman: takes a cut of each additive trigger — but refunds it all at shooter death as a lump sum
- Grinder: ADDITIVE_MULT 0.75× on NO_RESOLUTION (~65–70% frequency)
- Bookkeeper: ADDITIVE_MULT 1.0× every 3rd roll
- Contrarian: ADDITIVE_MULT 1.0× when dice < last roll

**Effect:** Grinder and Bookkeeper and Contrarian pump constant additive volume. Accountant multiplies each new additive by a bonus that grows as the run accumulates total additives. Taxman quietly skims each trigger but returns it all as a lump on seven-out — turning the seven-out from a loss event into a cash event. The build snowballs: more additives → Accountant bonus grows → each trigger is worth more → Accountant grows faster.

**Floor fit:** Weak on F1–F3 (low marker targets = small additive bases). Powerful on F6+ where ADDITIVE_MULT scales make per-trigger values significant.

---

## Boss-Specific Counter Builds

### vs. RISING_MIN_BETS (Floor 2 — Sarge)
**Counter:** Loan Shark (ID 49)

Loan Shark earns interest on large bets. Sarge forces minimum bets upward each turn, which normally threatens your bankroll. Loan Shark flips the script — forced large bets become forced interest payments *to you*. Combined with Big Spender (ID 16), which multiplies turns where you max-bet, Sarge's mechanic actively generates money for this build.

---

### vs. FIRST_CONTACT_PROTOCOL (Floor 8 — The Emissary)
**Counter:** Pure point-phase build

FIRST_CONTACT_PROTOCOL nullifies all 7/11 naturals on come-out, replacing them with a blank re-roll. Come-out NATURAL triggers are suppressed. This forces:

- Drop: The Regular (ID 6) — fires only on NATURAL (now suppressed)
- Drop: Hype Train Holly (ID 4) — fires on POINT_HIT, still valid, keep
- Add: Sleeper (ID 37) — point-phase focused, thrives in long shooter cycles
- Add: Statistician (ID 44) — rewards long roll counts (point phase is now the whole game)

The Emissary inadvertently rewards crew that ignore come-out results entirely. Sleeper's 5-roll dormancy is trivially satisfied when naturals don't end shooters early.

---

### vs. CONVERGENCE (Floor 9 — The Architect)
**Daredevil synergy (ID 43)**

CONVERGENCE removes one crew slot per seven-out (up to 5). By seven-out 3, you have 2 crew. By seven-out 5, you have 0 — naked craps. Daredevil fires a multiplier when the shooter has more seven-outs than point hits.

Reading this interaction: once CONVERGENCE has reduced your crew to 2–3 slots, every seven-out both removes a slot AND charges Daredevil's multiplier higher. The shooter who triggers naked craps arrives already having fired Daredevil multiple times. Position Daredevil in slot 1 — it's the last crew standing when all others are stripped.

---

## Mechanical Discovery: Hedge Fund Manager Timing

**Crew:** Hedge Fund Manager (ID 56) + Mirror (ID 60) + Lucky Charm (ID 3)

Hedge Fund Manager holds winnings from the current shooter and pays them out as a bonus at the *next* shooter's first natural. Mirror duplicates the current shooter's last win. Lucky Charm spikes hype +1.0 on seven-out.

**Discovery:** When the current shooter seven-outs, Lucky Charm fires (+1.0 hype), then the new shooter starts. Hedge Fund Manager's deferred payout fires on their first natural — but hype is now 1.0 higher than it was when the money was earned. The deferred payout is calculated at *settlement time* (current hype), not at *earn time* (previous shooter's hype). This means Lucky Charm's +1.0 hype bonus applies retroactively to money from the previous shooter.

Combined with Mirror having duplicated the previous shooter's last win, Hedge Fund Manager is holding 2× that win to pay out — and it pays out through a hype context that Lucky Charm already inflated.

**In practice:** This is a 2-shooter-cycle delayed payout with hype arbitrage baked in. It doesn't feel broken, but it's mechanically surprising — the kind of interaction that a veteran player discovers and writes a guide about.

---

## Archetype Summary

| Archetype | Core Crew | Style |
|---|---|---|
| Phoenix Loop | Lucky Charm + Warden + Sea Legs | Cross-shooter hype compounding |
| The Spiral | Pawnbroker + Daredevil + Lucky Charm | Lose-to-win momentum |
| The Long Con | Mechanic + Sleeper + Statistician + Understudy | Engineer long shooters |
| Ghost Squad | Night Manager + Mimic | 2-slot hype engine, 3 free slots |
| The Symphony | Maestro + 4 diverse triggers | Diversity rewards, cascade depth |
| Precision Counter | Mechanic + Physics Prof + Oracle | Boss-specific survival (F4) |
| Hardway Detonation | Insider + Mathlete + Sparks + Big Spender | All-in hardway spike |
| Triple Coroner | Coroner + Mimic + Joker | Low-frequency mega-burst |
| Beautiful Disaster | Silver Lining + Pawnbroker + Daredevil + Lucky Charm | Full loss-positive build |
| The Dynasty | Arms Dealer + Counterfeiter + Landlord | Cross-run macro compounding |
| AA Meeting | Faith Healer + Drunk Uncle + Warden | ORBITAL_DECAY counter (F7) |
| The Audit | Accountant + Taxman + Grinder + Bookkeeper + Contrarian | Additive snowball |

---

*Companion documents: `crew-expansion-brainstorm.md` (new crew IDs 31–60), `balance-analysis-crew-scaling.md` (nerf/buff priorities and floor scaling)*
