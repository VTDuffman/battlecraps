# Implementation Manifest: FB-038 The Commander Boss Moments

**Design doc:** `docs/design/fb-038-commander-boss-moments-design.md`
**Status:** Pending approval.

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` (+ API integration suite whenever the server changes) before a phase is done. Push when Mike says. **All crew/player references gender-neutral.** Big wins, big losses.

---

## Phase 1: Orbital bleed (server + rule copy)
1. **Config:** `ORBITAL_DECAY` params → `{ bleedPct: 0.20 }`; drop tiers, floor, death spiral.
2. **Server:** bleed after settlement on non-Seven-Out rolls; Seven-Out → 1.0× (+ crew hype that roll); remove the death-spiral slot / max-bet code; `orbit { bleed }` on the payload; receipt note.
3. **Client:** header readout → minimal ("ORBIT DECAYING −20%/ROLL") until the gauge (Phase 3).
4. **Copy:** dreadTagline "IN SPACE, NO ONE CAN HEAR YOU SCREAM.", ruleBlurb, ruleHeaderText, entryLines; docs.
5. **Tests:** integration — bleed amounts, no bleed at 1.0×, Seven-Out reset, no spiral.

🛑 **Gate:** play the Commander locally.

## Phase 2: Barks
`orbitLost`, `peakHype` always; `decaying` 35%; win/loss by chance (design §5). Tests.

🛑 **Gate:** play locally.

## Phase 3: The orbit gauge + no one can hear you scream
1. **`OrbitGauge`** under the marker progress bar (planet horizon, ship altitude = hype, sinks by the bleed, thrusters on gains); replaces the header readout.
2. **Muffled crowd** in his fight (low-passed, quieter with lower hype). **Guttering flames** on the dice at On Fire.
3. Audio: `playThrusters()`, `playOrbitDecay()` (a soft descending ping).

🛑 **Gate:** does it feel like the air's gone out of the room?

## Phase 4: Escape Velocity (victory)
`ESCAPE_VELOCITY` cinematic + hold.

🛑 **Gate:** beat the Commander locally.

## Phase 5: Re-entry → Loss of Signal (defeat)
`LOSS_OF_SIGNAL` cinematic (roar → total silence → static → line).

🛑 **Gate:** lose to the Commander locally.

## Phase 6: Dev Mode + docs
Presets: "Commander — On Fire, point on", "Commander — one win from escape", "Commander — last shooter, point on". Docs: boss_framework, CLAUDE.md, backlog.

🛑 **Gate:** FB-038 complete → push.
