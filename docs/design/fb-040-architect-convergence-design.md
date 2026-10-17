# FB-040: The Architect — Convergence (Design)

**Status:** Design agreed 2026-10-17. Ready for implementation.
**Pattern:** boss #9 — the final boss — of the per-boss "moments" roll-out (FB-032 Foreman → FB-039 Emissary). Big wins, big losses. Includes a rule redesign, tuned by simulation. Builds on FB-042 (boss trackers on the table).

---

## 1. Summary

The Architect (Floor 9, The Null Space — The Zero Chamber, `CONVERGENCE`, $30M → $60M, no comp). He built every room you've been in.

**Today:** each Seven-Out permanently removes the last crew member to fire, and each one cuts crew cash a further 15% (load-bearing). Simulated (`scripts/sim/architect-convergence-sim.mjs`, real engine, Floor-9 comps, pass line, arriving with $30M): mixed −9.6, cash −14.0, hype −7.5 pts. It overlaps The Emissary's blackout (both take your crew away). No barks, no cinematics; a header readout ("N CREW LEFT").

**New:** **Convergence.** The fight opens in a room rebuilt from one of the bosses you've beaten, under that boss's rule. **Every Seven-Out rebuilds another room — and the rooms stack:** every rule in force stays in force. The order is random. Survive long enough and you're fighting four or five bosses at once on one table. The table itself changes with each room: its felt, its theme, its tracker.

## 2. Decisions (2026-10-17)

| # | Question | Decision |
|---|---|---|
| 1 | Room order | **Random** (no repeats), drawn at fight entry — chosen on evidence (§4). |
| 2 | Rotate or stack | **Stack.** Every Seven-Out adds the next room's rule on top. Rotation alone was softer than today's rule. |
| 3 | The Executive's PIP | **Still ends the run.** It's the final boss. |
| 4 | The Emissary's blackout | **Carries on** (with stacking the Emissary's room stays in force; the blackout always applies after a Seven-Out once he's in). |
| 5 | Something of his own, constant across rooms | **No — the rooms are enough** for now. Experiment later. |
| 6 | The felt / theme per room | **Yes — go big.** Each rebuild switches the table to the newest room's floor. |
| 7 | Crew demolition + load-bearing | **Retired.** |

## 3. The rule — Convergence

- **Room order:** at fight entry the server shuffles the eight previous bosses (Foreman, Sarge, Le Prix, Executive, Hierophant, Sovereign, Commander, Emissary) with the server RNG and stores the order on the run. Rooms in force = the first `sevenOuts + 1` of it.
- **The first room** is in force from the fight's first roll (its boss-entry cinematic builds it).
- **A Seven-Out** — including one saved by The Covenant, and Sarge's TIME'S UP — rebuilds the next room. Its state starts fresh (§3.2); everything already in force stays.
- **The counter:** `bossPointHits` stays the Seven-Out count (= rooms in force − 1), now capped at 7.
- **Clears on bankroll** as today. No comp.

### 3.1 Each room's rule (as in that boss's own fight, unless noted)

| Room | Rule in his fight |
|---|---|
| The Foreman | 20% of every winning profit is skimmed. **No Payoff** — the room never clears the marker. |
| Sarge | Double Time: the 6th point-phase blank is a Seven-Out (crew can't rescue it). |
| Mme. Le Prix | One crew member charmed per come-out (under her glass on the table). |
| The Executive | Performance Review from Strong (2); +15% at Exceptional; **a bad roll at Action Required ends the run** (PIP). |
| The Hierophant | Crew cash held until a win, paid × Hype; a Seven-Out seizes 75%. |
| The Sovereign | The tide per come-out: Dead Calm (no odds) · Undertow (a Seven-Out takes 35% of the bankroll) · High Tide (a Seven-Out drowns 2 shooters; The Covenant cancels the wave). |
| The Commander | Orbital bleed: Hype above 1.0× loses 20% of its height every roll; a Seven-Out resets (no Keepsake while he's in). |
| The Emissary | Signal lag: crew effects land a roll late; a Seven-Out drops what's in transit and blacks the crew out for 6 rolls. |

### 3.2 Room state

| Room | State | Storage | Starts at |
|---|---|---|---|
| Sarge | clock rolls used | `convergence_state.clock` | 0 |
| Le Prix | charmed slot | `convergence_state.charm` | `pickEntryCharmSlot()` |
| Executive | rating | `convergence_state.rating` | 2 |
| Sovereign | tide stage | `convergence_state.tide` | 0 |
| Hierophant | escrow | `pending_additive_cents` (existing) | 0 |
| Emissary | transit / blackout | `signal_transit` / `signal_dark_rolls` (existing) | empty / 0 |
| Foreman, Commander | — | — | — |

New columns: `runs.convergence_rooms` (jsonb, the 8 boss marker indices in order, set at fight entry; null elsewhere) and `runs.convergence_state` (jsonb). Startup `ADD COLUMN IF NOT EXISTS` + Drizzle migration. Reset on every marker entry; dev create / jump set them.

### 3.3 Order of application in `rolls.ts` (rooms in force only)

1. Poseidon's Favor → cascade (Le Prix's hook skips the charmed slot; the Emissary's blackout nulls the crew) → Sarge's timeout.
2. The Vig → Emissary lag (swap in what landed) → Hierophant escrow hold.
3. `settleTurn()` → Foreman skim (20% of the winning profit) → Executive +15% at Exceptional (on what's left — the existing order in `rolls.ts`) → The Frequency → Hierophant release / seizure → Undertow.
4. State advance: High Tide drowns 2 (The Covenant cancels) → Keepsake (not with the Commander in) → Commander bleed → room counters → **PIP check** (ends the run) → **on a Seven-Out, add the next room**.

**Core refactor:** `rolls.ts` branches on a single `activeBossRule` and keeps one counter (`bossPointHits`) for Sarge / Le Prix / Executive / Sovereign. Replace with `activeRules: Set<BossRuleType>` + per-rule state accessors (for every other boss: `{boss.rule}` and `bossPointHits`, unchanged behaviour). Each boss branch becomes `activeRules.has(rule)` and reads its own state. The existing boss integration tests must pass untouched.

### 3.4 Payload

`turn:settled` + HTTP in his fight carry `convergence { rooms: number[] /* in force, in order */, added: number | null /* the room built this roll */, state }`, plus each room's existing facts (`escrow`, `signal`, `tide`, `orbit`, `bossRating`, `charmedCrewSlot`, `clockExpired`, `pipTermination` …). `removedCrewSlot` is retired. Receipt notes per room as in each boss's fight, plus "ROOM REBUILT — The Executive".

## 4. Evidence (simulated)

`scripts/sim/architect-convergence-sim.mjs` — 3,000–20,000 fights per row, arriving with $30M (1.1× gives the same picture), Floor-9 comps, Starter crew, 5 slots. Pass line; points vs no rule.

| Rule | Mixed | Cash | Hype |
|---|---|---|---|
| No rule | 99.7% | 98.1% | 94.2% |
| Today (demolition) | −9.6 | −14.0 | −7.5 |
| Rotation, forward / reverse / random | −1.1 / −4.0 / −2.6 | −2.7 / −6.6 / −5.2 | −2.0 / −5.7 / −4.7 |
| Stacking, forward | −6.8 | −17.4 | −9.9 |
| Stacking, reverse | −34.3 | −32.4 | −35.6 |
| **Stacking, random** | **−19.2** | **−23.9** | **−20.4** |

- The fight is short: you double up in ~3 rooms, so a run sees 3–4 rooms on average. Rotating one rule at a time barely bites at Floor 9 (most rooms alone cost 0.5–3 pts; only the Emissary bites, −14).
- Stacking + random lands in the hardest-boss band for every build (mixed is the balance target).
- The PIP decides 7–8% of stacked fights (the review stays in force once it's in) — intended brutality; tune later if it plays badly.

## 5. Presentation — the table rebuilds

- **The rooms rail** (top of the table well): eight tiles. Rooms in force are lit with their boss's sigil and a live readout (Sarge `04`, the Executive `STRONG`, the tide `EBB`, the bowl `$1.2M`, the orbit `2.10×`, the signal `IN TRANSIT` / `NO SIGNAL 3`, the Foreman `−20%`, Le Prix the charmed crew's emoji). Rooms not yet built are blueprint tiles with "?" — the order is unknown.
- **The newest room's tracker** fills the rest of the well, full size (FB-042). Older rooms live on as their tiles. (Le Prix's glass, TideWater's flood, the transmission line's crew blackout etc. still play whenever their room is in force.)
- **The felt becomes the newest room's floor** — felt colour, texture, fonts, flashes (a theme override on top of Floor 9). The boss header stays The Architect's (Null Space styling), so it's always his fight.
- **The rebuild** (each Seven-Out, and the first room at fight entry): the table dissolves into glowing blueprint lines (cyan grid, drafting strokes), a new tile lights on the rail, and the room redraws as the next boss's — felt, tracker and all — with a drafting / construction sound. The signature moment.

## 6. Barks

- **The Architect narrates each rebuild** (always): one line per room — e.g. "The loading dock. You remember the smell." · "Sarge's clock. Still ticking." · "Her parlour. She kept your seat warm." · "The corner office. Your review is overdue." · "The temple. The offering plate is out." · "The tide is coming in." · "Orbit. Hold on." · "The signal. Can you hear me?" — plus a generic line.
- **Echoes:** each room's own events (Sarge's clockLow, Le Prix's charmFired, the Sovereign's wave …) bark in that boss's voice from their config, rendered as a glitched echo (monochrome, a scanline jitter, the room boss's name as attribution).
- Win / loss by chance (his own lines).

## 7. Win: THE PATTERN BREAKS

Every room you fought flashes past in reverse — each tile and felt flickering by — the blueprint grid tears, the space folds in on itself to a point and goes white; "…the pattern was incomplete after all. Interesting." Then the gauntlet victory sequence (VictoryExplosion → VictoryRecap → VictorySendoff). Check how a boss `victoryCinematic` hands off to the final victory flow (it's the only boss whose win ends the run) before building. ~8 s.

## 8. Loss: ARCHIVED

Your table is redrawn as a blueprint — felt, chips, crew — the sheet rolls up, is stamped **ARCHIVED · RUN #N**, and slides into a drawer full of other rolled blueprints, which shuts. "Filed. I'll build the next one from you." The run feeds the next table: the roguelike loop. ~8 s. (`defeatAnnouncement` → 'ARCHIVED'.)

## 9. Copy

- `dreadTagline`: "EVERY ROOM YOU SURVIVED. AT ONCE."
- `entryLines`: "Every table you beat was a draft. This is the blueprint." · "Each time you seven out, I rebuild another room — and it stays." · "By the end, you'll be fighting all of them at once."
- `ruleBlurb`: "Convergence: the fight opens in a room rebuilt from one of the bosses you've beaten, under that boss's rule. Every seven-out rebuilds another — and they stack: every rule stays in force. The order is random. The Executive's review can still end your run."
- `ruleHeaderText`: "CONVERGENCE — EVERY 7-OUT ADDS ANOTHER BOSS'S RULE · THEY STACK"
- `victoryCinematic` line = the victory quote; `defeatCinematic` line: "Filed. I'll build the next one from you."
- `floors.ts` Floor 9 intro / teaser; `boss_framework.md`, `floors.md`, PRD, CLAUDE.md (the CONVERGENCE constraint is rewritten), help (`CrewAndBossesSection`).
