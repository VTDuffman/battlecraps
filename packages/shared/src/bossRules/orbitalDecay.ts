// =============================================================================
// BATTLECRAPS — ORBITAL DECAY BOSS RULE HOOKS
// packages/shared/src/bossRules/orbitalDecay.ts
//
// The Commander's mechanic (FB-038): the orbital bleed. After every roll that
// isn't a Seven-Out, hype above 1.0× loses bleedPct (20%) of its height —
// hype = 1 + (hype − 1) × (1 − bleedPct) — so hype has to keep being fed to
// stay up. A Seven-Out resets hype to 1.0× (The Keepsake doesn't apply in his
// fight). Hype never drops below 1.0×. It counters hype builds and leaves cash
// builds alone (the mirror of The Hierophant).
//
// Applied inline in rolls.ts after the state machine (it changes the hype
// carried to the next roll; this roll was paid at its full hype). No hooks.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const orbitalDecayHooks: BossRuleHooks = {};
