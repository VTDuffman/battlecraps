# FB-034: Mme. Le Prix Boss Moments (Design)

**Status:** Design agreed 2026-10-13. Ready for implementation.
**Pattern:** boss #3 of the per-boss "moments" roll-out (FB-032 Foreman, FB-033 Sarge).

---

## 1. Summary

Give Mme. Le Prix (Floor 3, The Riverboat, "The Enchantment") her voice, a visible charm, and signature win/loss moments. Mechanic unchanged: before each come-out she charms one filled crew slot, which sits out the cascade until the point resolves; then she picks someone new.

**Already exists (keep):** 💋 sigil; ❤️ on the charmed portrait; "OOH LA LA!" bark + charm sting (C–E–G) when the charmed crew's ability *would* have fired (`charmFired`).

## 2. Decisions (2026-10-13)

| # | Question | Decision |
|---|---|---|
| 1 | Voice | **Soft, purring, lowercase** French-flavored, flirtatious and faintly condescending (the opposite of Sarge's caps). The floor text already says *"She does not raise her voice."* |
| 2 | Charm drama | **The heart's flight** + harp glissando. |
| 3 | Win moment | **The rose.** |
| 4 | Loss moment | **She takes the crew.** |
| 5 | Language | **Crew and player references are gender-neutral** ("this one", "they", "them"). The crew includes all genders (e.g. Hype-Train Holly). Bosses are written characters and keep their pronouns. |

## 3. Barks

| Trigger (event) | Lines |
|---|---|
| `charmed` (a new charm is chosen) | "ah… this one, I think." · "come, chéri." · "you won't mind if I borrow this one?" |
| `charmFired` (charmed crew would have fired) | "non, non. they are busy." · "tsk. they work for me tonight." |
| `win` (chance) | "bravo, petit." · "lucky… for now." |
| `loss` (chance) | "quel dommage." · "tragique." |

Events come from `deriveBossBarkEvents()` for `DISABLE_CREW`: `charmFired` (server flag) > `charmed` (the charmed slot changed this roll, i.e. a come-out resolved). They pair with, not replace, the existing OOH LA LA crew bark.

## 4. Charm drama: the heart's flight

When she charms someone new (come-out resolution, and the entry charm after the boss intro):
1. The ❤️ **lifts off** the previously charmed portrait,
2. **floats up** to her name in the boss header,
3. **drifts down** onto the newly charmed portrait (~1.2 s, gentle arcs),
4. with a soft **harp glissando**; the charmed portrait keeps a faint **pink glow**.
Reduced motion: the heart cross-fades between portraits. Implemented as a portal overlay measuring portrait / header positions (like `BossBarkFloat`).

## 5. Win moment: the rose

On the roll that clears her marker (celebration held via `celebrationHoldUntil`):
1. A single **red rose** arcs in from the top and **lands on the table** (slight bounce, settles at an angle),
2. a few **petals** drift and scatter,
3. a **harp flourish**,
4. her line: *"…improbable. You may keep your winnings."*
~4 s. `victoryCinematic { id: 'THE_ROSE', line }`.

## 6. Loss moment: she takes the crew

When she ends the run:
1. A ❤️ blooms on **every** crew portrait (staggered),
2. one by one the portraits **drift up and away** toward her name and fade,
3. a big glossy **lipstick kiss** presses onto the screen like a stamp on glass (soft "mwah" + thud),
4. her line: *"Your crew stays with me tonight. Au revoir, chéri."*
~6 s, then game over. `defeatCinematic { id: 'SHE_TAKES_THE_CREW', line }`. Uses the real crew portraits (measured from the rail) so it's *your* crew that leaves.

## 7. Copy
All copy in `config.ts`. Existing rule text is already neutral ("That crew member…"). Add a CLAUDE.md rule: player/crew references in player-facing copy are gender-neutral.

## 8. Out of scope
Her mechanic; the other six bosses; migrating the Executive's barks.
