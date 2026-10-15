// FB-038 tuning tool — run: npm run build -w @battlecraps/shared && node scripts/sim/commander-decay-sim.mjs
// Monte Carlo of The Commander's fight (marker 20) on the REAL shared engine
// (resolveRoll → base hype tick → resolveCascade with real crew → settleTurn),
// comparing his current Orbital Decay against a no-rule baseline and variants.
//
// Floor-7-realistic comps: The Vig (crew cash +20%), Member's Jacket (6
// shooters), Board Seat (4 crew slots), The Covenant (once per marker the
// first Seven-Out keeps the shooter), Poseidon's Favor (each shooter's
// first-roll craps-out doesn't count), The Keepsake (7-out keeps half the hype
// above 1.0× — NOT applied in his fight, applied in the baseline).
// Orbital Decay (mirrors rolls.ts): on a Seven-Out hype −= 0.8 (≥2.5×) / 0.6
// (≥1.5×) / 0.4, floor 0.25 (instead of resetting); death spiral checked at the
// start of each roll: hype < 0.75 → one fewer cascade slot; < 0.5 → max bet ½.
import {
  resolveRoll, resolveCascade, settleTurn, getBaseHypeTick, getMaxBet, getMinBet, GAUNTLET,
  doorman, grinder, aceMcgee, closeCall, lookout, momentum, handicapper, echo,
} from '../../packages/shared/dist/index.js';

const d6   = () => 1 + Math.floor(Math.random() * 6);
const ODDS = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
const NO_HARD = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };

const LINEUPS = {
  cash:  [doorman, grinder, aceMcgee, closeCall],
  hype:  [lookout, momentum, handicapper, echo],
  mixed: [doorman, aceMcgee, handicapper, momentum],
};

/**
 * rule: null (baseline) | today's decay { tiers, floor, spiral }
 *     | { kind: 'bleed', b }   — every roll hype bleeds b of its height above 1.0; 7-out resets to 1.0
 *     | { kind: 'thin', f }    — every hype gain (base tick + crew) × f; 7-out resets to 1.0
 *     | { kind: 'reset' }      — only removes The Keepsake (7-out resets to 1.0)
 */
function fight({ marker, start, crew, strategy, rule }) {
  const target = GAUNTLET[marker].targetCents;
  const maxBet = getMaxBet(marker);
  const minBet = getMinBet(marker);
  let bankroll = start, shooters = 6, hype = 1.0, streak = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  let slots = crew.map((c) => ({ ...c, cooldownState: 0 }));
  while (slots.length < 5) slots.push(null);
  let covenant = true;
  const st = { minHype: 1, spiralRolls: 0, rolls: 0 };

  for (let guard = 0; guard < 4000; guard++) {
    const kind     = rule?.kind ?? (rule ? 'decay' : null);
    const spiral   = kind === 'decay' && rule.spiral && hype < 0.75;
    const halved   = kind === 'decay' && rule.spiral && hype < 0.5;
    const tableMax = halved ? Math.max(minBet, Math.floor(maxBet / 2 / 500) * 500) : maxBet;
    if (spiral) st.spiralRolls++;
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      if (bankroll < minBet) return { cleared: false, st };
      const stake = Math.min(tableMax, bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    if (strategy === 'odds' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0) {
      const stake = Math.min(bets.passLine * ODDS[point], bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    let ctx = resolveRoll([d6(), d6()], {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: target, shooters, unlockedSlots: spiral ? 3 : 4,
    });
    // Poseidon's Favor: the shooter's first-roll craps-out doesn't count.
    const poseidon = shooterRolls === 0 && ctx.rollResult === 'CRAPS_OUT';
    if (poseidon) ctx = { ...ctx, rollResult: 'NO_RESOLUTION', resolvedBets: bets, basePassLinePayout: 0, baseStakeReturned: 0 };
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10 : ctx.rollResult === 'CRAPS_OUT' ? -0.05 : 0;
    const gain   = kind === 'thin' && tick > 0 ? tick * rule.f : tick;
    const seeded = ctx.hype + gain;
    ctx = { ...ctx, hype: kind === 'decay' ? seeded : Math.max(1.0, seeded) };
    const activeSlots = spiral ? slots.map((s, i) => (i >= 3 ? null : s)) : slots;
    const cascade = resolveCascade(activeSlots, ctx, () => [d6(), d6()]);
    let fc = cascade.finalContext;
    slots = cascade.updatedCrewSlots.map((s, i) => s ?? slots[i]);
    fc = { ...fc, additives: Math.round(fc.additives * 1.2 / 100) * 100 };   // The Vig
    bankroll += settleTurn(fc);
    st.rolls++;

    const result = fc.rollResult;
    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    const prevHype = hype;
    let crewDelta = fc.hype - ctx.hype;
    if (kind === 'thin' && crewDelta > 0) { crewDelta *= rule.f; fc = { ...fc, hype: ctx.hype + crewDelta }; }
    hype = fc.hype;
    switch (result) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; break;
      case 'SEVEN_OUT': {
        phase = 'COME_OUT'; point = null; streak = 0; blankStreak = 0;
        if (kind === 'bleed' || kind === 'thin' || kind === 'reset') {
          hype = 1.0;
        } else if (rule) {
          const decay = prevHype >= 2.5 ? rule.tiers[2] : prevHype >= 1.5 ? rule.tiers[1] : rule.tiers[0];
          hype = Math.max(rule.floor, prevHype - decay + crewDelta);
        } else {
          hype = Math.max(1.0, 1 + (prevHype - 1) / 2);   // The Keepsake
        }
        if (covenant) covenant = false;
        else { shooters--; shooterRolls = 0; slots = slots.map((s) => s && s.cooldownType === 'per_shooter' ? { ...s, cooldownState: 0 } : s); }
        break;
      }
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; break;
      default: break;
    }
    if (kind === 'bleed' && result !== 'SEVEN_OUT' && hype > 1) hype = 1 + (hype - 1) * (1 - rule.b);
    st.minHype = Math.min(st.minHype, hype);
    if (phase === 'COME_OUT') bets = { ...bets, passLine: 0, odds: 0 };
    if (bankroll >= target) return { cleared: true, st };
    if (shooters <= 0) return { cleared: false, st };
  }
  return { cleared: false, st };
}

const N = Number(process.env.SIM_N ?? 20_000);
const pct = (x) => `${(100 * x).toFixed(1).padStart(5)}%`;
function rate(opts) {
  let c = 0, minHype = 0, spiral = 0, rolls = 0;
  for (let i = 0; i < N; i++) {
    const r = fight(opts);
    if (r.cleared) c++;
    minHype += r.st.minHype; spiral += r.st.spiralRolls; rolls += r.st.rolls;
  }
  return { clear: c / N, minHype: minHype / N, spiralShare: rolls ? spiral / rolls : 0, rolls: rolls / N };
}

const COMMANDER = 20;
const start = Math.round(GAUNTLET[COMMANDER - 1].targetCents * 1.1);
const TODAY = { tiers: [0.4, 0.6, 0.8], floor: 0.25, spiral: true };
const ROWS_ALT = [
  { label: "today (−0.4/−0.6/−0.8, floor 0.25)", rule: TODAY },
  { label: 'no Keepsake only (7-out → 1.0×)',     rule: { kind: 'reset' } },
  { label: 'bleed 15%/roll above 1.0×',          rule: { kind: 'bleed', b: 0.15 } },
  { label: 'bleed 25%/roll above 1.0×',          rule: { kind: 'bleed', b: 0.25 } },
  { label: 'thin air: hype gains ×0.5',          rule: { kind: 'thin', f: 0.5 } },
  { label: 'thin air: hype gains ×0.25',         rule: { kind: 'thin', f: 0.25 } },
];
const ROWS = process.env.SIM_SET === 'alt' ? ROWS_ALT : [
  { label: "today (−0.4/−0.6/−0.8, floor 0.25)", rule: TODAY },
  { label: 'decay ×1.5 (−0.6/−0.9/−1.2)',        rule: { ...TODAY, tiers: [0.6, 0.9, 1.2] } },
  { label: 'decay ×2 (−0.8/−1.2/−1.6)',          rule: { ...TODAY, tiers: [0.8, 1.2, 1.6] } },
  { label: 'today, floor 0.1',                    rule: { ...TODAY, floor: 0.1 } },
];

console.log(`N = ${N} fights per row · The Commander (marker ${COMMANDER}), start ${Math.round(start / 100).toLocaleString()} → target ${Math.round(GAUNTLET[COMMANDER].targetCents / 100).toLocaleString()}`);
console.log('Clear rate (pts vs the no-rule baseline, Keepsake on) · avg rolls · lowest hype reached · share of rolls in the death spiral\n');
for (const strategy of ['pass', 'odds']) {
  for (const [name, crew] of Object.entries(LINEUPS)) {
    console.log(`=== crew: ${name} · bets: ${strategy === 'odds' ? 'pass + max odds' : 'pass line only'} ===`);
    const base = rate({ marker: COMMANDER, start, crew, strategy, rule: null });
    console.log(`  baseline (no rule)                     ${pct(base.clear)}  rolls ${base.rolls.toFixed(0)}`);
    for (const row of ROWS) {
      const r = rate({ marker: COMMANDER, start, crew, strategy, rule: row.rule });
      console.log(`  ${row.label.padEnd(38)} ${pct(r.clear)} (${(100 * (r.clear - base.clear)).toFixed(1).padStart(6)} pts)  rolls ${r.rolls.toFixed(0)} · low hype ${r.minHype.toFixed(2)} · spiral ${pct(r.spiralShare)}`);
    }
    console.log('');
  }
}
