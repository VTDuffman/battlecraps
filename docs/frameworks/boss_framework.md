# BattleCraps Boss Framework — Reference

> Canonical reference for boss design. All vibe copy, mechanic parameters, and comp data live in `packages/shared/src/config.ts` — this document explains the architecture and serves as the design record for adding new bosses.

---

## Overview

Bosses appear at every 3rd marker in the gauntlet (0-based indices 2, 5, 8, 11, …, 26 — the final marker of each floor). A boss fight is a normal craps session with one additional mechanical modifier active for its entire duration. The modifier is defined by the boss's `rule` field and enforced server-side via the boss rule hook architecture.

There are nine bosses across the 9-floor gauntlet:

| Index | Floor | Target | Boss | Rule |
|---|---|---|---|---|
| 2  | 1 — The Loading Dock | $200 | The Foreman | `EXTORTION_FEE` |
| 5  | 2 — VFW Hall | $1,000 | Sarge | `DOUBLE_TIME` |
| 8  | 3 — Riverboat | $4,000 | Mme. Le Prix | `DISABLE_CREW` |
| 11 | 4 — The Suite | $15,000 | The Executive | `CROSS_CALIBRATION` |
| 14 | 5 — The Lodge | $100,000 | The Hierophant | `TRIBUTE` |
| 17 | 6 — Atlantis | $500,000 | The Sovereign | `TIDAL_SURGE` |
| 20 | 7 — The Station | $3,000,000 | The Commander | `ORBITAL_DECAY` |
| 23 | 8 — The Signal | $15,000,000 | The Emissary | `TRANSMISSION_DELAY` |
| 26 | 9 — The Null Space | $60,000,000 | The Architect | `CONVERGENCE` |

---

## Data Shape — `BossConfig`

Every boss is fully described by a `BossConfig` object stored in `GAUNTLET[i].boss` in `packages/shared/src/config.ts`. No boss data lives anywhere else — UI components read directly from this config.

```
BossConfig
├── Identity
│   ├── name            "Sarge"
│   └── title           "The Pit Boss"
│
├── Vibe copy
│   ├── dreadTagline    1–3 word bark on the dread screen
│   ├── entryLines      2–3 lines of boss dialogue
│   ├── ruleBlurb       One sentence explaining the mechanic
│   ├── victoryQuote    What the boss says when defeated
│   └── defeatAnnouncement  Header on the victory screen
│
├── Mechanic
│   ├── rule            BossRuleType — which hook fires
│   ├── ruleHeaderText  Short persistent text in BossRoomHeader during fight
│   └── ruleParams      Discriminated union — typed params for the hook
│
└── Comp
    ├── compReward       CompRewardType enum
    ├── compPerkId       Numeric ID appended to runs.comp_perk_ids on defeat (0 for slot comps)
    ├── compName         "MEMBER'S JACKET"
    ├── compDescription  One-sentence description of the comp effect
    └── compFanLabel     Short label on the CompCardFan victory card
```

---

## Boss Rule Hook Architecture

Boss rules mirror the crew `execute()` pattern. Each rule type has its own hook file implementing the `BossRuleHooks` interface, and the registry in `packages/shared/src/bossRules/index.ts` maps every `BossRuleType` to its implementation. Most current bosses need state the pure hooks can't reach (escrow balances, hype history, crew persistence), so their logic is **inline in `apps/api/src/routes/rolls.ts`** and their hook object is empty — it still must be registered.

### Hook interface (`bossRules/types.ts`)

```typescript
export interface BossRuleHooks {
  // Called pre-roll, on the COME-OUT only (rolls.ts). null = allow; string = reject (422).
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null;

  // Post-classify, pre-cascade. Currently unused by any rule.
  modifyOutcome?(ctx: TurnContext, params: BossRuleParams, state: BossRuleState): TurnContext;

  // Start of resolveCascade(): the slot indices to execute, in order. [] skips the loop.
  modifyCascadeOrder?(slotCount: number, params: BossRuleParams, state?: BossRuleState): number[];

  // After settleTurn(), before bankroll credit. Return the (possibly reduced) payout.
  modifyPayout?(payoutCents: number, baseStakeReturned: number,
                params: BossRuleParams, state: BossRuleState): number;

  // Currently unused (TRIBUTE's escrow seizure is inline). Kept for extensibility.
  modifySevenOut?(bankrollAfterLoss: number, params: BossRuleParams, state: BossRuleState): number;
}

export interface BossRuleState {
  bossPointHits:  number;   // the per-fight counter — meaning depends on the rule (see below)
  markerIndex:    number;   // 0-based index into GAUNTLET
  covenantActive: boolean;  // player holds THE_COVENANT (currently unread by any hook)
}
```

### Hook files

| File | Rule | Hook(s) used | Behavior |
|---|---|---|---|
| `extortionFee.ts` | `EXTORTION_FEE` | `modifyPayout` | Deducts `round(profit × taxPct)` (to the dollar) from winning payouts |
| `doubleTime.ts` | `DOUBLE_TIME` | *(none)* | Roll clock inline in `rolls.ts`: a blank on the last allowed point-phase roll becomes a SEVEN_OUT |
| `disableCrew.ts` | `DISABLE_CREW` | `modifyCascadeOrder` | Every slot except the charmed one (`bossPointHits`) |
| `tidalSurge.ts` | `TIDAL_SURGE` | `validateBet` | Come-out Pass Line below the current tide minimum → rejected (422) |
| `tribute.ts` | `TRIBUTE` | *(none)* | Escrow + seizure inline in `rolls.ts` |
| `orbitalDecay.ts` | `ORBITAL_DECAY` | *(none)* | Orbital bleed inline in `rolls.ts` (FB-038) |
| `firstContactProtocol.ts` | `CROSS_CALIBRATION`, `TRANSMISSION_DELAY`, `FIRST_CONTACT_PROTOCOL` (retired) | *(none)* | Shared empty hooks object; logic inline in `rolls.ts` |
| `convergence.ts` | `CONVERGENCE` | *(none)* | His rooms run their bosses' own rules via `rulesInForce` in `rolls.ts` (shared `convergence.ts` — FB-040) |

### What `bossPointHits` means per rule

| Rule | Counter meaning | Changes on |
|---|---|---|
| `DOUBLE_TIME` | Point-phase rolls used against the clock | +1 on each blank; reset to 0 by any other result |
| `DISABLE_CREW` | Charmed slot index | Reselected after each come-out resolution |
| `CROSS_CALIBRATION` | Performance rating 0–4 (enters at 2) | ±1 per Natural/Point Hit vs Craps Out/Seven-Out |
| `TIDAL_SURGE` | Tide stage (mod 4) | +1 on each come-out resolution (Natural, Craps Out, Point Hit, Seven-Out) |
| `CONVERGENCE` | Seven-Outs this fight = rooms built − 1 (cap 7); the rooms' own counters are in `convergence_state` | +1 on SEVEN_OUT (incl. a Covenant save) |

Every marker-entry write uses `getBossEntryCounter(markerIndex)` (2 for The Executive, else 0); Le Prix's entry charm comes from `pickEntryCharmSlot()`.

### Server execution order (`apps/api/src/routes/rolls.ts`)

```
1.  Bet validation      table max (10%, Old Pro 15%), regular min, the Sovereign's Dead Calm
                        (no odds), then bossHooks.validateBet() — come-out only
2.  Dice                server RNG (or tutorial/dev forced dice)
3.  (removed — the Commander's death spiral went in FB-038)
4.  resolveRoll()       classify + base payouts (Mechanic freeze applied here)
5.  Base hype tick      Point Hit +0.15–0.30, Natural +0.10, Craps Out −0.05 (skipped if Poseidon blocks)
6.  modifyOutcome()     (unused)
7.  Poseidon's Favor    shooter's first-roll CRAPS_OUT → NO_RESOLUTION, Pass Line kept
8.  resolveCascade()    bossHooks.modifyCascadeOrder() (Le Prix)
8b. Sarge's clock       DOUBLE_TIME: blank on the last allowed roll → SEVEN_OUT (clockExpired)
9.  Boss bookkeeping    Executive PIP check; Le Prix charm reselection
10. Additive pipeline   The Vig ×1.2 → Architect load-bearing ×0.85^N → escrow hold (Hierophant) → signal lag (Emissary: land last roll's packet, send this roll's)
11. settleTurn()        then bossHooks.modifyPayout() (Foreman), then Executive +15% at Exceptional
12. Bankroll extras     The Frequency bonus → escrow release/seizure
13. computeNextState()  boss counters, Commander decay / The Keepsake, Architect demolition,
                        Pressure Cooker streak; escrow held on a marker-clearing roll is paid out
14. Persist + emit      `turn:settled` (bossRating, charmFired, pipTermination,
                        crapsOutBlocked, clockExpired, removedCrewSlot …)
```

---

## The Nine Bosses

**On the table (FB-042, "Under the Glass").** In a boss room the boss's tracker replaces the floor logo on the felt (`BossTableWell`, registry `TABLE_TRACKERS`): laid out at a design size, scaled to fit the field's height and stretched to its width, and the dice fly over it on every throw (a glint sweeps it; a soft dice shadow follows the dice across it). Every boss but The Architect has one; the boss header keeps the name, barks and rule line. The status section keeps the marker progress bar (The Foreman: a plain "THE CUT $X / $25" line).

### The Foreman — Floor 1

**Rule:** `EXTORTION_FEE` | **Payoff:** $25 (the marker's $200 target still sets bet limits / hire costs / additive scaling, but never clears it) | **Index:** 2

**"The Cut" and "The Payoff" (FB-032).** The Foreman skims 20% off every winning payout: his **Cut**. The Cut accumulates on a cash register on the table (FB-042; the status section shows a plain "THE CUT $X / $25" line in place of the progress bar); when it reaches the **Payoff**, he looks the other way and the marker clears through the normal celebration → pub. **The Payoff is the only way out:** bankroll never clears this marker. Losses don't reduce the Cut, so it can't push you backwards. Losing all shooters short of the Payoff is game over.

**Implementation note:** `modifyPayout` taxes the profit portion only (`payoutCents − baseStakeReturned`), rounded to the nearest dollar; losing rolls are untaxed. `rolls.ts` adds each roll's skim (pre-tax − post-tax payout) to `runs.boss_progress_cents` and passes `payoffReached` to `computeNextState`, whose single `clearsMarker()` check uses the Cut for payoff markers (`getBossPayoffCents()`) and bankroll everywhere else. The pre-roll auto-clear uses the same rule. Every roll emits `bossCut { amount, total, payoff, paidOff }`; the client's `CashRegister` rolls the digits, plays a ka-ching, and on the Payoff stamps PAID IN FULL with a register bell (the celebration is held `PAYOFF_HOLD_MS` for it). The Cut resets to 0 on every marker entry.

```typescript
ruleParams: { rule: 'EXTORTION_FEE', taxPct: 0.20, payoffCents: 2_500 }
```

The $25 appears in `ruleBlurb` / `ruleHeaderText` / `entryLines`; update them if `payoffCents` changes.

**Defeat cinematic (FB-032 pilot): "DOCK CLOSED".** If the Foreman ends your run (last shooter or bankroll), the register flashes BALANCE DUE $N (Payoff − Cut) with a dead thunk, a steel roll-up door rattles down over the table and slams (clang + shake), "DOCK CLOSED" is stenciled across it, and he says "Come back when you got my money." Then the normal game-over flow.

**Barks (FB-032 pilot):** lines in `config.ts` `barks` (win / loss / progress50 / progress80 / payoff); rules in shared `bossBarks.ts`; flash in at the boss name and float down-right across the table while fading (`BossBarkFloat`).

**Comp:** The Vig — crew cash bonuses (`additives`) × 1.2, applied post-cascade in `rolls.ts`.

---

### Sarge — Floor 2

**Rule:** `DOUBLE_TIME` | **Target:** $1,000 | **Index:** 5 | **Spec:** FB-030

**"Double Time" — the roll clock.** Once a point is set, the shooter has `rollLimit` (6) point-phase rolls to hit it. If the 6th roll is a blank, Sarge calls **"TIME'S UP!"** and it counts as a Seven-Out:
- Pass Line and Odds are lost, and all Hardways clear (a Hardway that won on that roll still pays).
- The shooter is lost, and Hype resets (The Keepsake applies).

The clock starts on the first roll after the point is set; come-out rolls never tick it. A real Seven-Out or a Point Hit resolves the point normally and resets the clock.

**Implementation note:** no hook logic.
- **Counter:** `bossPointHits` counts point-phase rolls used — +1 on each `NO_RESOLUTION`, reset to 0 by every other result.
- **The timeout:** in `rolls.ts`, after `resolveCascade`, a `NO_RESOLUTION` with `bossPointHits + 1 >= rollLimit` is rebuilt as `SEVEN_OUT`. All bets go to zero in `resolvedBets`, and the crew save flags (`sevenOutBlocked`, `passLineProtected`, `hardwayProtected`) are cleared.
- **Why after the cascade:**
  - Blank-roll crew (the Grinder) still pay for that roll.
  - Crew that react to a dice Seven-Out don't trigger: Lefty, Floor Walker, Lucky Charm. If Lefty re-rolls a real 7 into a blank on the last roll, time is still up.
- **Client:** `clockExpired: true` is sent in the roll response and `turn:settled`. The dice show `TIME'S UP!`, and a big two-digit seven-segment clock on the table (`SargeClock`, FB-042 — formerly in the header) counts rolls left, `06` → `01` — gold, red for the last two, blinking on the last, dimmed on the come-out.

**Odds:** a 6-roll clock times out 18% (4/10), 14% (5/9) and 11% (6/8) of points.

**History:** until FB-030 (2026-10-13) Sarge used `RISING_MIN_BETS` — a come-out minimum rising 2% per Point Hit, with a 5% fine for coming out under it. Replaced because it overlapped The Sovereign's tide. FB-031 ("Orders") is the reserve alternative.

```typescript
ruleParams: { rule: 'DOUBLE_TIME', rollLimit: 6 }
```

**Boss moments (FB-033):**
- **Barks** (`config.ts` `barks`, events from `deriveBossBarkEvents`): pointSet / clockLow (2 left) / lastRoll (1 left) / beatClock (point hit) / timeUp always bark; natural / craps sometimes.
- **Clock drama** (`SargeClock.tsx`, on the table): the clock grows and pulses in the point phase (faster on the last two rolls); tick per blank (sharper as it runs down), alarm on the last roll, drill whistle on TIME'S UP.
- **Victory — HONORABLY DISCHARGED** (`victoryCinematic`): certificate slides up, a small green stamp comes down onto its blank band (thud + jolt), bugle call, "…not bad, soldier. Dismissed." (~4.6s, inside the celebration hold).
- **Defeat — DISHONORABLE DISCHARGE** (`defeatCinematic`): NOTICE OF DISCHARGE, red stamp, dog tags drop and jingle, "Drop and give me twenty… thousand." (~6.2s). Both moments share `components/cinematics/DischargeForm.tsx`.

**Comp:** Member's Jacket — +1 shooter (6 instead of 5) at every marker for the rest of the run. `recruit.ts` checks `run.compPerkIds` at every pub exit.

---

### Mme. Le Prix — Floor 3

**Rule:** `DISABLE_CREW` | **Target:** $4,000 | **Index:** 8

**"The Enchantment."** Before each come-out roll, Mme. Le Prix enchants one randomly selected crew member, who sits out the cascade. The charm persists through any point phase and lifts on resolution (Natural, Craps Out, Point Hit or Seven-Out), when a new filled slot is chosen for the next come-out. Every other crew member fires normally.

**Entry charm:** chosen when the player leaves the pub (`recruit.ts`) via shared `pickEntryCharmSlot()`, so it reflects the crew that will actually play the fight. The client holds it in `pendingBossEntryCharm` and reveals the ❤️ after the boss-entry cinematic (a run resumed mid-point charms the slot straight away — there is no entry cinematic then).

**Boss moments (FB-034):**
- **Barks** — soft, purring lowercase. `charmFired` (the charmed crew would have fired) always barks; `charmed` (the ❤️ moved to someone new) barks 50% of the time and never over a showing bark (`EVENT_BARK_CHANCE` in `bossBarks.ts`) — a skip is silence, so she stays quiet despite re-charming most come-outs. Win / loss sometimes.
- **Under the glass** (FB-042, `CharmTrap.tsx` on the table): the charmed crew member is held under a glass cloche (pink haze, heart pulse; her 🌹 while it's empty). Their rail slot shows a faint dashed outline + ❤️ and can't be dragged; a reorder that would shift the trapped slot is refused (the charm is held by slot index).
- **The heart's flight** (`CharmFlight.tsx`, store `charmFlight` with `stage` 'heart' → 'sink'): when the ❤️ moves, the heart flies from the glass (`[data-charm-trap-anchor]`) to the new crew member while the one she held flies home, then the new one sinks under the glass (clink). Harp glissando; 💗 trail. Without the glass on screen it falls back to the FB-034 arc via her name.
- **Charm heartbeat:** when `turn:settled` carries `charmFired: true`, the crew who was actually blocked (the *old* charmed slot) presses up against the glass with two muffled knocks (`playGlassKnock`) and sinks back, dazed 💫, while their rail slot beats pink and a 💗 drifts off it, and `playCharmDaze()` plays (a detuned pad that sags flat + descending chimes); then the heart flies on. Rolling stays locked until it settles (`charmingSlot`, 2.5 s safety net). Replaced the old "OOH LA LA!" bubble.
- **Victory — THE ROSE** (`victoryCinematic`): a big rose is thrown in, lands with a pink bloom, a spiral burst of petals plus a petal shower, harp flourish, "…improbable. You may keep your winnings." (~5.7 s; own celebration hold, `VICTORY_HOLD_MS_BY_ID`).
- **Victory — THE ROSE** also opens with the glass cracking and shattering (`playGlassShatter`) as the one she held flies home (store `freedCharmSlot`; +1.2 s).
- **Defeat — SHE TAKES THE CREW** (`defeatCinematic`): the one under the glass leaves first, straight from the glass; hearts bloom on your real crew portraits (measured from the rail), they drift up into her name one by one, a huge 💋 presses onto the glass ("mwah" + thud), "Your crew stays with me… forever." (~7.7 s with five crew).

**Implementation note:** `modifyCascadeOrder` returns every slot except the charmed one. The charmed slot index (0-based) is stored in `bossPointHits`; `rolls.ts` reselects it with the server RNG after each come-out resolution and emits it as `charmedCrewSlot`.

**History:** originally a full crew shutdown (`modifyCascadeOrder` → `[]`); briefly a 35% additive tax ("The Tariff", FB-026 Step 2); replaced by The Enchantment on 2026-05-30.

**Comp:** The Keepsake — on Seven Out, keep half the Hype above 1.0× instead of resetting: `nextHype = 1 + (hype − 1) / 2` (plus any crew hype gained that roll). 2.0× → 1.5×. Not applied during the Commander fight, where Orbital Decay replaces the reset.

---

### The Executive — Floor 4

**Rule:** `CROSS_CALIBRATION` | **Target:** $15,000 | **Index:** 11

A 5-tier Performance Review rating (0–4) is tracked via `bossPointHits` for the duration of the fight. The rating initializes to 2 (Strong) when the player enters the boss fight.

**Rating movement:**
- Natural or Point Hit → +1 (capped at 4, "Exceptional")
- Craps Out or Seven-Out → −1 (floored at 0, "Action Required")
- Point Set or No Resolution → neutral, no change

**PIP termination:** Rolling a Craps Out or Seven-Out while the rating is already at 0 (Action Required) triggers an immediate GAME_OVER. The `turn:settled` WebSocket payload includes `pipTermination: true`; the client plays the PIP variant of his TERMINATED defeat cinematic (FB-035).

**Exceptional bonus:** While the rating is at 4, the payout is enhanced by 15% of gross profit (rounded to nearest dollar). Applied after `settleTurn` and the Foreman's tax layer.

**Implementation note:** No hook logic. All logic is inline in `rolls.ts`. `bossRating: { index, changed, direction }` is emitted on every roll in the fight, and `exceptionalBonusCents` whenever the +15% pays.

**Boss moments (FB-035):**
- **Barks** (shared `bossBarks.ts`, migrated from his old header bubble): `promoted` (reached Exceptional) and `finalWarning` (reached Action Required) always bark; `bonusPaid` 50%; ordinary `ratingUp` / `ratingDown` 40% — a skip is silence. Clipped corporate-speak.
- **Performance meter** (`PerformanceMeter.tsx`, on the table): five-step review scale, a ▼ marker springs to the new rating with a keyboard clack per step; Exceptional glows gold and pops "+15% · $X" per bonus (office ding on promotion); Action Required pulses red with FINAL WARNING (low double buzz).
- **Victory — THE NAMEPLATE SWAP** (`victoryCinematic`): his brass plate on the Corner Office door loses its screws and clangs to the floor; THE SHOOTER slides in with a glint, office-chime fanfare and ticker tape; "…restructuring was inevitable. Well played." (~5.9 s, hold 6.3 s).
- **Defeat — TERMINATED** (`defeatCinematic`, every loss in his fight): pink HR memo (PIP → Performance Improvement Plan; otherwise Notice of Position Elimination), TERMINATED stamp slams, your real crew packed into a PERSONAL EFFECTS box which is carried off; "Security will see you out." (~7.6 s). Replaced `PinkSlipModal`.

```typescript
ruleParams: { rule: 'CROSS_CALIBRATION' }
```

**Comp:** Board Seat — `unlockedSlots` becomes 4 (`compPerkId: 0`; slot comps use `unlockedSlots`, not `compPerkIds`).

---

### The Hierophant — Floor 5

**Rule:** `TRIBUTE` | **Target:** $100,000 | **Index:** 14

**The offering (crew-bonus escrow, FB-036).** Crew cash bonuses (`additives`, after The Vig) are not paid on the roll they're earned. They pile up in `runs.pending_additive_cents` until a **winning roll** (Natural or Point Hit), which releases everything held — including that roll's bonuses — **multiplied by the Hype** at that moment. On a Seven-Out the whole offering (with Hype) settles immediately with **75% seized** as tribute. Craps Outs, Point Sets and blanks keep holding. A roll that clears the marker pays out the offering (with Hype). Held bonuses are pulled out *before* settleTurn, so they are never multiplied twice.

Designed as a fight against additive (cash-crew) builds — hype builds are unaffected; The Commander is their counter. Tuned with `scripts/sim/hierophant-escrow-sim.mjs` (2026-10-14): against a cash crew it costs ~14 points of clear rate, matching The Executive; the old rule (released next roll, 25% seized, no Hype) cost ~2.

```typescript
ruleParams: { rule: 'TRIBUTE', escrowSeizurePct: 0.75 }
```

**Boss moments (FB-036):**
- **Barks** (solemn, liturgical; he speaks for the order): `tributeSeized` always; `bigOffering` (held ≥ 10% of target, newly) 50%; `escrowReleased` 30%; win / loss by chance.
- **The offering bowl** (`OfferingBowl.tsx`, on the table): HELD $X between two candles, a coin pile scaled to what's held; coins drop in when crew cash is offered, rise out on a release (RELEASED +$X); a seizure flares the candles, burns embers off the bowl and sears TRIBUTE −$X under a bell toll and a minor choir. Driven by the server's `escrow { heldCents, releasedCents, seizedCents }`.
- **Roll log** (KI-083): in escrow fights crew cash reads "<crew>: $X → the offering"; "Released from the offering" and "The Hierophant: $X tribute" get their own lines; Net counts only what was paid.
- **Victory — THE EYE CLOSES** (`victoryCinematic`): his SVG eye (`cinematics/HierophantEye.tsx`) opens in a ring of candles before the sanctum doors, looks you over and closes; the candles go out one by one; the doors grind open and light floods in under a major choir (~8.2 s, hold 8.6 s).
- **Defeat — THE ORDER COLLECTS** (`defeatCinematic`): hooded figures close in, your bankroll drains into the bowl, the eye opens and burns, three bell tolls, candles out to black, "The order always collects." (~8.3 s).

**Comp:** The Covenant — **"The Order Protects"** (FB-036, replaced the old seizure-halving effect that did nothing once he was beaten — FB-029). Once per marker, the first Seven-Out doesn't cost a shooter: bets are still lost, Hype still resets, the point clears, and other seven-out consequences (Architect demolition, Emissary evaporation) still apply. `runs.covenant_spent_marker` stores the marker where it was used; the save is available whenever that ≠ `currentMarkerIndex`. It can save the last shooter. `turn:settled` carries `covenantSaved: true`; the client shows THE ORDER PROTECTS (`CovenantFlash`).

---

### The Sovereign — Floor 6

**Rule:** `TIDAL_SURGE` | **Target:** $500,000 | **Index:** 17

**The tide rhythm (FB-037).** The table runs on a four-stage tide — **LOW → EBB → HIGH → FLOW**, then repeats — that advances each time a come-out cycle resolves (Natural, Craps Out, Point Hit, Seven-Out); a point set at a stage stays at that stage until it resolves. Each stage is its own challenge (shared `getTideStage()`; enforced inline in `rolls.ts`):

| Stage | Name | Rule |
|---|---|---|
| LOW | **Dead Calm** | No odds bets — adding odds is rejected (422); the client disables the odds zone. |
| EBB / FLOW | **The Undertow** | A Seven-Out drags `undertowPct` (35%) of the bankroll — after the roll's settlement, rounded down to the dollar — out to sea. Applied before the state machine, so a drag below the minimum ends the run. A bankroll loss: The Covenant doesn't stop it. |
| HIGH | **High Tide** | A Seven-Out drowns `waveShooters` (2) shooters; can end the run. The Covenant (unused this marker) cancels the whole wave; Lefty re-rolling out of the 7 means no Seven-Out at all. |

`turn:settled` carries `tide { stage, nextStage, undertowCents?, waveShooters? }`; the receipt shows "The Sovereign: $X undertow" and a High Tide note. The old stage minimum bets (1×/2×/3×/2×) were removed — simulated cost ~0. Tuned with `scripts/sim/sovereign-tide-sim.mjs`: about −6 pts (cash crew), −5 (mixed), −14 (hype), pass-line players with Floor-6 comps.

```typescript
ruleParams: {
  rule: 'TIDAL_SURGE',
  stageLabels:  ['LOW TIDE', 'EBB', 'HIGH TIDE', 'FLOW'],
  stageEffects: ['DEAD_CALM', 'UNDERTOW', 'HIGH_TIDE', 'UNDERTOW'],
  undertowPct:  0.35,
  waveShooters: 2,
}
```

**Boss moments (FB-037):**
- **Barks** (regal, ancient, slow — he speaks like the sea): `waveHit` and `undertowHit` always; `highTide` (the tide turns to HIGH) 50%; win / loss by chance. A wave The Covenant turned back is silent; a run-ending wave is left to the defeat cinematic.
- **Tide dial** (`TideDial.tsx`, on the table): LOW · EBB · HIGH · FLOW with the current stage lit and the next marked, the stage name (teal / amber ⚠ / red ⚠) and its one-line rule.
- **The water line** (`TideWater.tsx`, a portal that never blocks input): translucent sea at 3 / 8 / 14 dvh for Dead Calm / Undertow / High Tide with a rolling surface. On a Seven-Out at the Undertow or High Tide the sea fills the whole screen (foam crest) and drains — dragging eight 💵 out of the bankroll readout (`data-bankroll-readout`) or the lost shooter pips (`data-shooter-pip`, swollen and struggling). Dead Calm waterlogs the Odds square. Stands aside on a run-ending roll.
- **Victory — THE CROWN SINKS** (`victoryCinematic`): the sea floods the screen, then his crown sinks like a pendulum through light shafts and bubbles and settles in the sand; "…the tide will return. It always does." (~9.2 s, hold 9.6 s).
- **Defeat — THE WAVE** (`defeatCinematic`): a dark wall of water breaks over the table and never drains; your crew and money sink into the deep as the light goes out; "Your run will not outlast this tide." (~8.1 s).

**Comp:** Poseidon's Favor — the shooter's first roll (`shooterRollCount === 0`) can't craps-out. A 2/3/12 becomes `NO_RESOLUTION` with `flags.crapsOutBlocked`: the Pass Line stays up, no −0.05 hype tick, and the run stays on the come-out (`IDLE_TABLE`). The client shows "POSEIDON'S FAVOR". The Grinder ignores this roll.

---

### The Commander — Floor 7

**Rule:** `ORBITAL_DECAY` | **Target:** $3,000,000 | **Index:** 20

**Orbital bleed (FB-038).** After every roll that isn't a Seven-Out (and doesn't clear the marker), Hype above 1.0× loses `bleedPct` (20%) of its height: `hype = 1 + (hype − 1) × 0.8`, applied after the state machine — the roll is paid at its full Hype, the bleed is what's carried forward. A Seven-Out resets Hype to 1.0× (plus crew Hype gained that roll); The Keepsake doesn't apply in his fight. Hype never drops below 1.0×. `turn:settled` carries `orbit { bleed, hype }`; the receipt notes "Orbital decay: −0.40× → 2.60×".

He is the fight against **hype builds** (The Hierophant is the fight against cash builds). The old rule — a tiered Seven-Out drain (0.4/0.6/0.8×) down to 0.25× plus a "death spiral" (−1 crew slot below 0.75×, max bet halved below 0.5×) — simulated **backwards**: cash crews −18 pts, hype crews +3. The bleed (`scripts/sim/commander-decay-sim.mjs`): hype crew ≈ −16, mixed ≈ −1.5, cash 0.

```typescript
ruleParams: { rule: 'ORBITAL_DECAY', bleedPct: 0.20 }
```

**Boss moments (FB-038)** — theme thread *"In space, no one can hear you scream"*:
- **Barks** (clipped mission-control speak): `orbitLost` (a Seven-Out from ≥ 1.5×) and `peakHype` (reaching On Fire, judged at the hype the roll paid at) always; `decaying` (bleed ≥ 0.2×) 35%; win / loss by chance.
- **Orbit gauge** (`OrbitGauge.tsx`, on the table): a planet; your ship circles it on an orbit whose radius is your hype (sprung), faster the lower it gets; 1.5×/2.5× rings; "▲ BURN" (thruster flare + rush) and "▼ ORBIT DECAY" (descending ping) each roll.
- **No one can hear you scream:** dread tagline "IN SPACE, NO ONE CAN HEAR YOU SCREAM."; the crowd cheer/groan are muffled in his fight (`muffledDest`: low-pass 420 Hz, 0.25 → 0.6 with hype); the dice flames gutter at On Fire (`useParticleEmitter(…, guttering)`).
- **Victory — ESCAPE VELOCITY** (`victoryCinematic`): engines ignite, the ship breaks orbit, the planet falls away, stars streak into hyperspace, the jump; "…orbital mechanics didn't account for you. Gravity's compliments." (~8 s, hold 8.4 s).
- **Defeat — LOSS OF SIGNAL** (`defeatCinematic`): MASTER CAUTION, re-entry (glow, plasma, shaking, a roar that **hard-cuts**), silent static, LOSS OF SIGNAL, "In space, no one can hear you scream." (~8.3 s).

**Comp:** Cargo Hold — `unlockedSlots` becomes 5.

---

### The Emissary — Floor 8

**Rule:** `TRANSMISSION_DELAY` | **Target:** $15,000,000 | **Index:** 23

**Signal lag + blackout (FB-039).** The crew fire as normal (dice and rescue effects — Lefty, the Mechanic, Floor Walker — act on the roll), but what they *add* — cash bonuses (after The Vig), Hype boosts and multipliers — is held **in transit** (`runs.signal_transit`) and **lands on the next roll** (that roll's settlement and the Hype it carries forward). On a **Seven-Out** the signal is lost: everything in transit (last roll's and this roll's) is dropped, and the whole crew goes **dark** for `blackoutRolls` (6) rolls — the cascade runs with no crew and cooldowns don't move (`runs.signal_dark_rolls`). A marker-clearing roll pays the cash in transit. `turn:settled` carries `signal { landed, sent, dropped, darkRolls, wasDark }`; the receipt shows crew cash "→ in transit", "Signal received" and "SIGNAL LOST".

Replaced a one-roll cash escrow (simulated ≈ −1 to −3 — a weaker copy of The Hierophant). Tuned with `scripts/sim/emissary-delay-sim.mjs`: ≈ −13 (cash), −14 (mixed), −18 (hype), pass-line players with Floor-8 comps — the boss who fights your crew itself. (The Architect's crew demolition is slated for a Convergence redesign, FB-040, so the two don't overlap.)

**History:** originally `FIRST_CONTACT_PROTOCOL` (come-out naturals nullified), retired in FB-026; then the one-roll escrow, replaced in FB-039.

```typescript
ruleParams: { rule: 'TRANSMISSION_DELAY', blackoutRolls: 6 }
```

**Boss moments (FB-039)** — translated alien text, in brackets:
- **Barks:** `signalLost` (a Seven-Out) and `contactRestored` (the blackout ends) always; `received` (a packet lands) 30%; win / loss by chance.
- **Transmission line** (`TransmissionLine.tsx`, on the table): CREW 👥 → TABLE 🎲 over a scrolling sine wave; the packet waits mid-line "IN TRANSIT +$X · +0.30×" and pops "RECEIVED …" (ping) next roll; a Seven-Out turns the line to red static ("SIGNAL LOST", static burst) with "NO SIGNAL · n" counting down, then "CONTACT RESTORED". While dark the crew rail greys out under scanline static.
- **Victory — MESSAGE RECEIVED** (`victoryCinematic`): dark screen, falling glyphs, INCOMING TRANSMISSION, his line decodes from cycling alien glyphs one character at a time, MESSAGE RECEIVED locks in; "[The entity pauses for 0.3 seconds. This is the equivalent of applause.]" (~8.4 s, hold 8.8 s).
- **Defeat — TRANSLATED** (`defeatCinematic`): your bankroll and crew dissolve into glyphs, a green tractor beam draws them up and out, the screen is left a sea of symbols; "[Translation complete. You will be studied.]" (~8.3 s).

**Comp:** The Frequency — every Natural on the come-out awards a flat 3% of the current marker target, for the rest of the run.

---

### The Architect — Floor 9 (Final Boss)

**Rule:** `CONVERGENCE` | **Target:** $60,000,000 | **Index:** 26

**Convergence (FB-040).** The fight is fought in rooms rebuilt from the eight bosses before him. At fight entry (`recruit.ts` on the pub exit; `dev.ts`; a fallback on the first roll) the server shuffles them (`shuffleConvergenceRooms`, server RNG) into `runs.convergence_rooms`. The first room is in force from the first roll; **every Seven-Out builds the next room — including one The Covenant saved and Sarge's TIME'S UP — and the rooms stack: every rule in force stays in force.** Each room's rule runs exactly as in that boss's own fight, except: The Foreman's room has no Payoff (just the 20% skim — the fight clears on bankroll); the Executive's PIP still ends the run; the Emissary's blackout lasts as long as his room (i.e. the rest of the fight).

**Rules in force:** `rolls.ts` builds `rulesInForce` (rule → params, counter, boss name) — a boss fight's single rule (counter = `bossPointHits`), or The Architect's rooms in force (`getRoomsInForce(order, bossPointHits)`), each with its own counter from `runs.convergence_state` (`{ clock, charm, rating, tide }` — Sarge, Le Prix, the Executive, the Sovereign; `getRoomCounter`). Every boss branch reads `ruleOn` / `paramsFor` / `counterOf`; Le Prix's cascade hook and The Foreman's skim hook come from their rooms. After the roll each room's counter moves as in its own fight (`advanceRuleCounter`; Le Prix's charm re-picked), and a new room's counter starts fresh (`enterRoom`: Executive at 2, Le Prix a random filled slot). The Hierophant's escrow and the Emissary's signal use their own columns.

**Counter:** `bossPointHits` is the Seven-Out count = rooms built − 1 (cap 7), held on Point Hit. `turn:settled` carries `convergence { rooms, added, state }` plus each room's own facts (`escrow`, `signal`, `tide`, `orbit`, `bossRating`, `charmedCrewSlot` …); the receipt notes "ROOM REBUILT — …".

**Tuning:** `scripts/sim/architect-convergence-sim.mjs` — stacking + random ≈ −19 / −24 / −20 (mixed / cash / hype) vs no rule; rotation alone was −3 to −5, softer than the old demolition.

**History:** until FB-040 each Seven-Out permanently removed the last crew member to fire and cut crew cash a further 15% (load-bearing); before 2026-10-13 a shrinking cascade window sat on top of that.

**Ends the game:** Index 26 is the final marker. A boss victory transitions to `GAME_OVER` (not `TRANSITION`), so the recruit/comp phase is never reached. The `compReward: 'NONE'` sentinel and the `BossVictoryCompPhase` early-return are defensive guards only.

```typescript
ruleParams: { rule: 'CONVERGENCE' }
```

**Comp:** None. `compReward: 'NONE'`.

---

## `BossRuleParams` Discriminated Union

```typescript
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';      taxPct: number }
  | { rule: 'DOUBLE_TIME';        rollLimit: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'CROSS_CALIBRATION' }
  | { rule: 'TRIBUTE';            escrowSeizurePct: number }
  | { rule: 'TIDAL_SURGE';        stageMultipliers: readonly [number, number, number, number]; stageLabels: readonly [string, string, string, string] }
  | { rule: 'ORBITAL_DECAY';      bleedPct: number }
  | { rule: 'FIRST_CONTACT_PROTOCOL' }   // retired
  | { rule: 'TRANSMISSION_DELAY'; blackoutRolls: number }
  | { rule: 'CONVERGENCE' };
```

TypeScript narrows the type inside each hook file via the `rule` discriminant. This prevents cross-boss param access bugs (e.g. accidentally reading Sarge's `rollLimit` when the active boss is The Hierophant).

---

## Adding a New Boss

1. **Add a union member to `BossRuleType`** in `packages/shared/src/config.ts`
2. **Add a union member to `BossRuleParams`** in `packages/shared/src/config.ts`
3. **Create a hook file** in `packages/shared/src/bossRules/` implementing `BossRuleHooks`. If the mechanic is handled entirely inline in `rolls.ts`, the file may export an empty `{}` hooks object — it still must be registered.
4. **Register it** in `packages/shared/src/bossRules/index.ts`
5. **Add or extend a `MarkerConfig`** in `GAUNTLET` with `isBoss: true` and a full `BossConfig` object
6. **Add a `CompRewardType`** and `COMP_PERK_IDS` entry if the new boss awards a new comp type; use `compReward: 'NONE'` if no comp should be awarded. Add a matching `COMP_DEFS` entry in `apps/web/src/components/CompCard.tsx`.
7. **Add a floor entry** to `FLOORS[]` in `packages/shared/src/floors.ts` with the correct `FloorAtmosphere` type. Keep `bossTitle` identical to the `BossConfig.title`.
8. **Add a floor theme** to `apps/web/src/lib/floorThemes.ts` and update the `THEMES` array and index clamp in `getFloorTheme`/`getFloorIndex`
9. **Server:** wire any inline mechanic logic into `rolls.ts`, and decide what the boss counter (`bossPointHits`) means for the rule. Hook calls are already plumbed — no structural changes needed for hook-based mechanics.
10. **UI (BossRoomHeader):** add a display branch for the new rule's HUD indicator if it has a visual counter (like the tide stage, Commander hype, Architect crew count)
11. **UI (other):** boss entry/victory/comp screens read from `BossConfig` fields — keep `ruleBlurb`/`ruleHeaderText` in step with what `rolls.ts` actually does
12. **Docs:** update this file, `floors.md`, and the boss/comp lines in `CLAUDE.md`

---

## Verification Checklist

| Scenario | Expected |
|---|---|
| Foreman fight, winning roll | Profit taxed 20%; skim added to the Cut (register rolls up, ka-ching) |
| Foreman fight, bankroll ≥ $200 | Nothing happens — no ADVANCE, no clear |
| Foreman fight, Cut reaches $25 | PAID IN FULL stamp + bell, then marker clear → pub; Cut resets |
| Sarge fight, blank on the 6th point-phase roll | SEVEN_OUT with `clockExpired`; shooter lost; bets lost; dice show TIME'S UP! |
| Sarge fight, Point Hit on the 6th roll | Normal win; clock resets |
| Sarge fight, blank before the limit | Clock ticks (`bossPointHits` +1); the table clock counts down |
| Sarge fight, real Seven-Out / come-out rolls | Normal; come-out never ticks the clock |
| Sarge fight, timeout with Grinder / Floor Walker / Lefty | Grinder pays; Floor Walker doesn't refund; Lefty doesn't save |
| Mme. Le Prix fight | Exactly one filled slot charmed per come-out (❤️); that crew produces no events; all others fire normally |
| Mme. Le Prix fight, charmed crew would have fired | `charmFired: true` in `turn:settled`; they knock on the glass; heartbeat on their rail slot |
| Mme. Le Prix fight, drag a crew member across the trapped slot | Refused (no reorder) |
| Mme. Le Prix fight, come-out resolves | `charmedCrewSlot` moves to a newly selected filled slot |
| Executive fight, Natural or Point Hit | `bossPointHits` increments (capped at 4); `bossRating.direction = 'up'` in `turn:settled` |
| Executive fight, Craps Out or Seven-Out above rating 0 | `bossPointHits` decrements; `bossRating.direction = 'down'`; no GAME_OVER |
| Executive fight, rating already at 0, bad roll | PIP fires: run transitions to GAME_OVER; `pipTermination: true` in `turn:settled` |
| Executive fight, rating at 4 (Exceptional), winning roll | Payout includes +15% gross profit bonus |
| Hierophant fight, crew bonus earned | Held in `pendingAdditiveCents` until a winning roll |
| Hierophant fight, Natural / Point Hit | Everything held (incl. this roll's) paid, × Hype |
| Hierophant fight, seven-out | Everything held (incl. this roll's) settles now, × Hype, 75% seized |
| Hierophant fight, marker-clearing roll | Bonuses held that roll are paid out; `pendingAdditiveCents` → 0 |
| Emissary fight, marker-clearing roll | The cash in transit is paid out; `signalTransit` → null, `signalDarkRolls` → 0 |
| Sovereign fight, tide stage | Advances on each come-out resolution: LOW → EBB → HIGH → FLOW |
| Sovereign fight, come-out under the tide minimum | Rejected (422) |
| Commander fight, roll at 2.0× hype (no Seven-Out) | Paid at 2.0×; carried forward as 1.8× (−20% of the height above 1.0×) |
| Commander fight, seven-out | Hype → 1.0× (The Keepsake doesn't apply) |
| Emissary fight, any roll | Crew cash / Hype / multipliers go into `signalTransit`; last roll's land on this one |
| Emissary fight, seven-out | Everything in transit dropped; `signalDarkRolls` → 6; crew don't fire until it counts down to 0 |
| Architect fight, seven-out | Last-fired crew (or highest occupied slot) removed; `removedCrewSlot` emitted; header "N CREW LEFT" |
| Architect fight, crew in slot 5 after a seven-out | Still fires (no shrinking window) |
| Architect boss defeat | Transitions to GAME_OVER (no comp awarded, no pub visit) |
| Poseidon's Favor, shooter's first roll is 2/3/12 | No loss, still come-out, Pass Line still up; "POSEIDON'S FAVOR" shown |
| All boss entry screens | `dreadTagline`, `entryLines`, `ruleBlurb` from config; no hardcoded strings |
| Floor 9 boss victory comp screen | `BossVictoryCompPhase` calls `onAdvance()` immediately via `useEffect`; returns `null` |
| `npm run typecheck` | Zero errors |

Integration coverage: `apps/api/src/__tests__/integration/bossRules.test.ts`.
