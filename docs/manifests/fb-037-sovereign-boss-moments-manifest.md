# Implementation Manifest: FB-037 The Sovereign Boss Moments

**Design doc:** `docs/design/fb-037-sovereign-boss-moments-design.md`
**Status:** Phases 1–3 done locally (not pushed).

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: The tide rhythm (server + rule copy)
1. **Shared/config:** `TIDAL_SURGE` params → stage rules (LOW no odds, EBB/FLOW undertow 0.35, HIGH wave 2); drop stage minimums (`validateBet` + `getBossMinBet` TIDAL_SURGE branch).
2. **Server:** reject odds placed during a LOW-tide point; undertow on a Seven-Out at EBB/FLOW (35% of the post-settlement bankroll, floored to $); wave at HIGH (2 shooters; The Covenant cancels it; can end the run). `tide { stage, nextStage, undertowCents?, waveShooters? }` on `turn:settled` + HTTP. Receipt lines.
3. **Client (minimal):** odds controls disabled at Dead Calm with a reason; header readout shows the stage rule.
4. **Copy:** ruleBlurb, ruleHeaderText, entry lines; docs.
5. **Tests:** integration — Dead Calm odds rejected, undertow amount, wave −2, Covenant cancels the wave, Lefty escapes, wave on the last shooter(s).

🛑 **Gate:** play the Sovereign locally — does each stage read?

--- Implemented locally (2026-10-14): shared `getTideStage()` + params (`stageEffects`, `undertowPct` 0.35, `waveShooters` 2); `getBossMinBet` returns null (minimums gone); server rejects odds at Dead Calm (422), applies the undertow before the state machine, the wave via `computeNextState(…, sevenOutShooters)`, `tide` payload + receipt lines; header shows tide · stage name · one-line rule · next; odds zone disabled at Dead Calm; copy (rule blurb, header text, entry line, floor teaser) + docs. Integration 143 (8 new). ---

## Phase 2: Barks
`waveHit` / `undertowHit` always, `highTide` 50%, win/loss by chance (design §5). Tests.

🛑 **Gate:** play locally.

--- Implemented locally (2026-10-14): shared TIDAL_SURGE events (waveHit / undertowHit always; highTide on the turn to HIGH, 50%) + lines incl. win/loss; store passes `tide`. Shared 468 tests. ---

## Phase 3: The water line + tide dial
`TideWater` (rising sea along the bottom, surface + foam, surge on undertow, crest on wave), `TideDial` (current + next stage, one-line rule). Audio: `playSwell()`, `playUndertow()`, `playWaveCrash()`.

🛑 **Gate:** can you feel the tide coming?

--- Implemented locally (2026-10-14): `TideDial` (shipped early, front and center). `TideWater` portal (pointer-events none): translucent sea at 3 / 8 / 14 dvh for Dead Calm / Undertow / High Tide with two scrolling surface layers; on the Undertow the water surges to 30 dvh and drains, "UNDERTOW −$X" sinks; on the wave a crest sweeps across and breaks, "THE WAVE — N SHOOTERS DROWNED"; swell on a turn of the tide. Audio: `playSwell()`, `playUndertow()`, `playWaveCrash()`. Store `lastTide {…, key}`. ---

## Phase 4: The Crown Sinks (victory)
`THE_CROWN_SINKS` victory cinematic + hold.

🛑 **Gate:** beat the Sovereign locally.

## Phase 5: The Wave (defeat)
`THE_WAVE` defeat cinematic.

🛑 **Gate:** lose to the Sovereign locally.

## Phase 6: Dev Mode + docs
Presets: "Sovereign — Dead Calm, point on", "Sovereign — Undertow, point on", "Sovereign — High Tide, last two shooters", "Sovereign — one win from the crown". Docs: boss_framework, CLAUDE.md, backlog.

🛑 **Gate:** FB-037 complete → push.
