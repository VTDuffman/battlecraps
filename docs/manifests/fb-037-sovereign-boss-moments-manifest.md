# Implementation Manifest: FB-037 The Sovereign Boss Moments

**Design doc:** `docs/design/fb-037-sovereign-boss-moments-design.md`
**Status:** Phases 1–5 done locally (not pushed).

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

--- Playtest follow-ups (Phase 3): the wave now fills the whole screen with a foam crest and drags the lost shooter pips (swollen ~3×, struggling) down as it drains; the Undertow uses the same fill and drags eight 💵 out of the bankroll readout; Dead Calm's Odds square is waterlogged. ---

--- Implemented locally (2026-10-14): underwater throne room (light shafts swaying and dimming, 26 rising bubbles, a sand floor); the 👑 sinks over 3.6 s like a pendulum, drifting and rocking, and settles tilted in the sand with a sand puff (`playSandThud()`); `playUnderwater()` (muffled rumble + bubble bloops) throughout, `playSunkenChime()` with the line. ~8.0 s (≈3.2 s to read), hold 8.4 s. ---

## Phase 5: The Wave (defeat)
`THE_WAVE` defeat cinematic.

🛑 **Gate:** lose to the Sovereign locally.

--- Implemented locally (2026-10-14): a dark wall of water rises (0.9 s) and breaks — crash, screen jolt, foam splash — and does NOT drain; under water (rumble, bubbles) your real crew stand-ins (railCrew) and seven 💵 sink and turn into the deep (`playUndertow()`), the light fades to near-black, "Your run will not outlast this tide." in pale cyan. ~8.1 s, under the 9 s net. `TideWater` stands aside when `pendingDefeat` is set (no double crash). Win cinematic also floods in first (playtest). ---

## Phase 6: Dev Mode + docs
Presets: "Sovereign — Dead Calm, point on", "Sovereign — Undertow, point on", "Sovereign — High Tide, last two shooters", "Sovereign — one win from the crown". Docs: boss_framework, CLAUDE.md, backlog.

🛑 **Gate:** FB-037 complete → push.
