# Implementation Manifest: FB-042 Under the Glass

**Design doc:** `docs/design/fb-042-under-the-glass-design.md`
**Status:** Not started.

**Rules:** each phase ends at a 🛑 gate. `npm run typecheck`, `npm run build`, `npm run test` before a phase is done. Commit locally per phase; push when Mike says. After each phase: explicit test steps (Dev presets) + what to look for, **including a phone-width check**. The dice must always pass over the tracker. All crew/player references gender-neutral.

---

## Phase 1: The glass well + The Commander
1. `BossTableWell`: rendered in the green space in place of `FloorEmblem` for boss markers that have a table tracker; picks the tracker by `boss.rule` (display marker / `isCleared` logic carried over from `MarkerProgress`).
2. The glass layer (sheen, inset edge, felt rim); tracker → glass → dice layering; no stacking layer above the dice.
3. Fit-to-space (`ResizeObserver` scale, max scale).
4. Move `OrbitGauge` out of `MarkerProgress` into the well; size pass.

🛑 **Gate:** Commander presets on desktop + phone width — dice fly over the gauge, nothing clipped.

## Phase 2: Every other tracker
1. `PerformanceMeter`, `OfferingBowl`, `TideDial`, `TransmissionLine` → the well; size pass each.
2. `SargeClock` out of `BossRoomHeader` → the well as a big clock face.
3. `CashRegister` → the well; small "CUT $X / $25" readout in the status section.
4. Pop-ups (RECEIVED, +15%, PAID IN FULL, bowl coins) fit inside the well.

🛑 **Gate:** each boss's presets, desktop + phone.

## Phase 3: Le Prix under the glass
1. Trapped state: the charmed crew member's portrait sinks from the rail into the well (pink haze, heart pulse); faint outline + ❤️ left in the slot; slot not draggable.
2. Charm moves: release back to the rail; `CharmFlight` lands on the glass; next one pulled down. Entry charm starts at the glass.
3. `charmFired`: press against the glass + muffled knock + daze.
4. THE ROSE: glass cracks, crew member freed, then the rose. SHE TAKES THE CREW: trapped one leaves from the glass first (or the alternative — decide here).

🛑 **Gate:** Le Prix presets — charm move, fired, win, loss.

## Phase 4: Polish + docs
1. Remove the boss-room squeeze (`compact` GameStatus, `#wall-divider` padding); check the header on a phone.
2. Optional: dice shadow on the glass; glint per throw.
3. Docs: `CLAUDE.md`, `boss_framework.md`, backlog FB-042 → Implemented.

🛑 **Gate:** FB-042 complete → push.
