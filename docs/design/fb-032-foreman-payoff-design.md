# FB-032: The Foreman: "The Cut" and "The Payoff" (Design)

**Status:** Design agreed 2026-10-13. Ready for implementation.
**Author:** Mike + Claude

---

## 1. Summary

Rework the Floor 1 boss. The Foreman still skims every winning roll, but you no longer clear his room by reaching a bankroll target. Instead his skim, **the Cut**, accumulates on a cash-register counter, and when it reaches **the Payoff** he looks the other way and you move on.

Also introduces two per-boss systems, both piloted on the Foreman: **boss barks** (lines in `config.ts`) and **boss defeat cinematics** (a signature "you lost" moment before game over; the Foreman's is the dock door slamming shut, §8).

## 2. Decisions (2026-10-13)

| # | Question | Decision |
|---|---|---|
| 1 | Naming | The skim is **"the Cut"**; the clear amount is **"the Payoff"**. The Floor 1 comp stays **The Vig** (no clash). |
| 2 | Floor 2 starting bankroll may be lower than today (you can pay him off with less than $200 banked) | **Accept and measure** with Developer Mode before tuning. |
| 3 | Exit condition | **The Payoff is the only way out.** No bankroll marker for the Foreman fight. |
| 4 | Barks | **Foreman first**, built generically so other bosses can be added later. |

## 3. Mechanic

- **The Cut:** unchanged rate. 20% of the profit on every winning roll, rounded to the dollar (`extortionFee.ts`). Losing rolls are untaxed. Each roll's skim is added to a running total for the fight.
- **The Payoff:** **$25** to start (= 20% of ~$125 of winning rolls, the same amount of winning today's $200 target needs from a ~$100 arrival). Tunable via `ruleParams.payoffCents`.
- **Clearing:** when the Cut total reaches the Payoff, the roll that crossed it clears the marker through the normal marker-clear path (celebration → pub → Floor 2). Bankroll ≥ target **never** clears this marker.
- **Losing:** unchanged. Running out of shooters or bankroll is still game over.
- **Easier, not harder:** losses can't push you away from the Payoff, unlike a bankroll target.

### What still uses the Foreman marker's `targetCents` ($200)

Not the clear condition anymore, but it still drives **table max / min bet** (10% / ~1/60 of target), **pub hire costs** (`getCrewHireCost` uses the cleared marker's target) and **crew additive scaling** (`markerTargetCents`). Keep it at $200 so Floor 1 economy is unchanged.

## 4. Presentation

### Cash-register counter (front and center)
`THE CUT  $18 / $25` with **mechanical rolling digits**: each digit column scrolls like an old register. Shown large, centered under the table **in place of** the marker-progress bar (the only Cut readout; not in the boss header).

### Per-win "ka-ching"
Each taxed win: digits roll up, a small **ka-ching** pop at the register (reuses the existing `kaching-pop` keyframe) and a synthesized **register ka-ching** sound.

### Barks (pilot)
Short Foreman lines in the boss bark bubble (same style as the Executive's), chosen at random from a pool per trigger:

| Trigger | Example lines |
|---|---|
| A taxed win | "Keep 'em coming." · "That's my cut." · "Pleasure doing business." |
| Cut ≥ 50% of Payoff | "Now we're talkin'." · "Halfway to friends." |
| Cut ≥ 80% of Payoff | "Almost square, pal." · "One more and I don't see nothin'." |
| A losing roll *(occasional)* | "Tough break. My cut's still my cut." |
| The Payoff | "I didn't see nothin'. Get outta here." |

Barks are throttled (one at a time, not on every roll) so they stay fun.

### The Payoff moment
Register **bell DING**, the counter flashes, a **"PAID IN FULL"** stamp slams over the register, the Foreman's closing line, then the normal marker-clear celebration. Respects `prefers-reduced-motion` (fade instead of slam) and mute/volume.

## 5. Generic boss bark system

- `BossConfig.barks?: Partial<Record<BossBarkTrigger, readonly string[]>>` in `config.ts`, with the copy living next to the rest of each boss's text.
- `BossBarkTrigger` is a small shared union (`'win' | 'loss' | 'progress50' | 'progress80' | 'payoff'` to start; bosses opt into the triggers they use).
- Store: one `bossBark: { line, key } | null` slot plus `fireBossBark(trigger)` (picks a line, throttles, auto-clears), replacing nothing yet. **The Executive keeps its current barks**; migrating it is a follow-up once the system proves out.
- `BossRoomHeader` renders the bubble for any boss (generalizing the Executive's bubble).
- Adding barks to another boss later = add lines to its config + fire the right triggers.

## 6. Technical design

### Data
- New column `runs.boss_progress_cents bigint NOT NULL DEFAULT 0` (the existing `boss_roll_count` is a smallint counter; money needs BIGINT). Startup `ADD COLUMN IF NOT EXISTS` in `server.ts` + Drizzle migration. Generic name so future money-tracking bosses can reuse it.
- Reset to 0 on every marker entry (alongside `getBossEntryCounter`).

### Rule params
`{ rule: 'EXTORTION_FEE', taxPct: 0.20, payoffCents: 2_500 }`.

### Server (`rolls.ts`)
- Compute this roll's cut = payout before tax − payout after tax (already computed for `modifyPayout`).
- Add it to `bossProgressCents`; if it reaches `payoffCents`, the roll clears the marker (`hitMarker`) via the normal path.
- On the Foreman marker, **skip every bankroll-based clear**: the main settle path and the pre-roll auto-clear block.
- Emit `bossCut: { amount, total, payoff, paidOff }` on `turn:settled` and the HTTP roll response.

### Client
- Store: `bossProgressCents` (hydrated on load like `bossPointHits`), applied from `bossCut` on settlement; fire barks from it.
- `MarkerProgress` / auto-collect / **✓ TARGET MET — ADVANCE**: disabled on payoff-cleared markers (bankroll can't clear them).
- New `CashRegister` component (rolling digits) in `BossRoomHeader`; the Payoff moment overlay.
- Audio: `playRegisterKaChing()`, `playRegisterBell()` (standalone, like `playBossImpact`).

### Player-facing copy to update (single sources of truth per CLAUDE.md)
`config.ts` (`ruleBlurb`, `ruleHeaderText`, `entryLines`, `dreadTagline`, `flavorText`), `floors.ts` narrative if it mentions the tax, `CompCard.tsx` (The Vig unchanged), Sal in `tutorialBeats.ts` ("The Foreman takes his cut" → mention the payoff), How to Play (reads `ruleBlurb` automatically), `boss_framework.md`, PRD, CLAUDE.md game constants.

### Developer Mode
- `getBossCounterRange` / `BossCounterControl`: a **Cut so far ($)** control for the Foreman (writes `bossProgressCents`).
- Presets: "Foreman — one win from the Payoff", "Foreman — fresh fight".

## 7. Measuring Floor 2 impact (decision 2)
With Dev Mode: run the Foreman ~10–15 times from realistic defaults and note the bankroll you leave with. Compare against today's guaranteed $200+. If Floor 2 starts too lean, tune `payoffCents` up or add a kickback (deferred idea: "he slides you a little something").

## 8. Boss defeat cinematics (pilot: The Foreman, "DOCK CLOSED")

**Decision (2026-10-13):** losing a boss fight gets a signature "cinematic exit" before the game-over screen, so the player *feels* the loss. Built as a **per-boss system**, piloted on the Foreman (like barks), then rolled out.

### The Foreman: the dock door slams
1. **Balance due:** the register freezes and flashes **BALANCE DUE $7** (Payoff − Cut) in red, with a flat dead *thunk* (the inverse of the PAID IN FULL bell).
2. **The door:** a corrugated steel **roll-up door** rattles down from the top over the table (~600 ms, slight ease-in like gravity) and hits bottom with a heavy metal **CLANG** + small screen shake.
3. **Stencil:** **DOCK CLOSED** stenciled across the door; the Foreman, through it: *"Come back when you got my money."*
4. Hold ~1.5 s, then the normal game-over flow (unlock recap / GameOverScreen).

Synthesized audio (rattle = filtered noise ramp; clang = inharmonic metallic partials + low thud). `prefers-reduced-motion`: the door fades in instead of dropping; no shake.

### The system
- `BossConfig.defeatCinematic?: BossDefeatCinematicId` in `config.ts` (`'DOCK_CLOSED'` for the Foreman). A small registry maps ids → components, so each boss's moment is a self-contained component.
- **Trigger:** a roll that ends the run (`runStatus: 'GAME_OVER'`, not a victory) during a boss fight whose boss has a `defeatCinematic`. Covers both ways to lose: last shooter gone and bankroll below the minimum bet.
- **Timing:** like `pendingTransition`, the store holds the `GAME_OVER` status flip (`pendingDefeat`) while the cinematic plays over the table, then releases it. Safety timeout so a run can never get stuck.
- **The Executive's Pink Slip** stays as is for now (it's an overlay on the game-over screen); folding it into this system is a follow-up.
- **Dev Mode:** a "Defeat cinematic" preview button per boss (client-only, like the other previews).

### Roll-out ideas (later, one boss at a time)
Sarge: DISHONORABLE DISCHARGE stamp + dog tags drop · Mme. Le Prix: lipstick kiss on the screen, *"Au revoir, chéri."* · The Hierophant: wax seal EXCOMMUNICATED · The Sovereign: the tide washes over the table · The Commander: AIRLOCK cycles shut · The Emissary: static, SIGNAL LOST · The Architect: the table's blueprint tears in half.

## 9. Out of scope
- Barks and defeat cinematics for the other 8 bosses (pending the Foreman pilots).
- Migrating the Executive onto the generic bark system.
- A kickback/top-up on payoff (only if measurement says it's needed).
