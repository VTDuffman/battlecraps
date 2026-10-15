// FB-039 tuning tool — run: npm run build -w @battlecraps/shared && node scripts/sim/emissary-delay-sim.mjs
// Monte Carlo of The Emissary's fight (marker 23) on the REAL shared engine
// (resolveRoll → base hype tick → resolveCascade with real crew → settleTurn).
//
// Floor-8-realistic comps: The Vig (crew cash +20%), Member's Jacket (6
// shooters), The Keepsake (7-out keeps half the hype above 1.0×), Board Seat +
// Cargo Hold (5 crew slots), The Covenant (once per marker the first Seven-Out
// keeps the shooter), Poseidon's Favor (first-roll craps-out doesn't count).
// Rules:
//   none      — baseline
//   delay     — today: crew cash held one roll, released flat next roll;
//               a Seven-Out evaporates everything held (incl. this roll's)
//   evensOdds — "untranslatable": Odds pay even money instead of true odds
//   noOdds    — Odds bets don't exist at his table
//   lag / lag2 / lagKeep — "signal lag": every crew effect (cash, hype boosts,
//               multipliers) computed on a roll lands 1 (lag, lagKeep) or 2
//               (lag2) rolls later; a Seven-Out drops everything in transit
//               (lag, lag2) or not (lagKeep).
//   blackout:K — after a Seven-Out the whole crew is out of contact (can't fire)
//               for the next K rolls ('blackout:shooter' = until the next point
//               is hit); combinable with lag as 'lag+blackout:K'.
import {
  resolveRoll, resolveCascade, settleTurn, getBaseHypeTick, getMaxBet, getMinBet, GAUNTLET,
  doorman, grinder, aceMcgee, closeCall, bookkeeper, lookout, momentum, handicapper, echo, oddCouple,
} from '../../packages/shared/dist/index.js';

const d6   = () => 1 + Math.floor(Math.random() * 6);
const ODDS = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
const NO_HARD = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };

const LINEUPS = {
  cash:  [doorman, grinder, aceMcgee, closeCall, bookkeeper],
  hype:  [lookout, momentum, handicapper, echo, oddCouple],
  mixed: [doorman, aceMcgee, handicapper, momentum, grinder],
};

function fight({ marker, start, crew, strategy, rule }) {
  const target = GAUNTLET[marker].targetCents;
  const maxBet = getMaxBet(marker);
  const minBet = getMinBet(marker);
  let bankroll = start, shooters = 6, hype = 1.0, streak = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  let slots = crew.map((c) => ({ ...c, cooldownState: 0 }));
  while (slots.length < 5) slots.push(null);
  let covenant = true, held = 0;
  /** Signal lag: packets in transit — { additives, hype, mults, rollsLeft }. */
  let transit = [];
  const lagRolls = rule === 'lag2' ? 2 : 1;
  const blackoutK = rule.includes('blackout:') ? rule.split('blackout:')[1] : null;
  const isLag = rule === 'lag' || rule === 'lag2' || rule === 'lagKeep' || rule.startsWith('lag+');
  let dark = 0;              // rolls of blackout left
  let darkUntilHit = false;  // 'shooter' variant
  const st = { lost: 0, earned: 0 };

  for (let guard = 0; guard < 4000; guard++) {
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      if (bankroll < minBet) return { cleared: false, st };
      const stake = Math.min(maxBet, bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    if (strategy === 'odds' && rule !== 'noOdds' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0) {
      const stake = Math.min(bets.passLine * ODDS[point], bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    let ctx = resolveRoll([d6(), d6()], {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: target, shooters, unlockedSlots: 5,
    });
    if (shooterRolls === 0 && ctx.rollResult === 'CRAPS_OUT') {   // Poseidon's Favor
      ctx = { ...ctx, rollResult: 'NO_RESOLUTION', resolvedBets: bets, basePassLinePayout: 0, baseStakeReturned: 0 };
    }
    if (rule === 'evensOdds' && ctx.rollResult === 'POINT_HIT' && bets.odds > 0) {
      ctx = { ...ctx, baseOddsPayout: bets.odds };   // even money
    }
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10 : ctx.rollResult === 'CRAPS_OUT' ? -0.05 : 0;
    ctx = { ...ctx, hype: Math.max(1.0, ctx.hype + tick) };
    const isDark = dark > 0 || darkUntilHit;
    if (dark > 0) dark--;
    const cascade = resolveCascade(isDark ? [null, null, null, null, null] : slots, ctx, () => [d6(), d6()]);
    let fc = cascade.finalContext;
    if (!isDark) slots = cascade.updatedCrewSlots;
    fc = { ...fc, additives: Math.round(fc.additives * 1.2 / 100) * 100 };   // The Vig
    st.earned += fc.additives;

    const sevenOut = fc.rollResult === 'SEVEN_OUT';
    if (isLag) {
      // What the crew did this roll goes into transit; what's arriving lands now.
      const crewHype  = fc.hype - ctx.hype;
      const crewMults = fc.multipliers.slice(ctx.multipliers.length);
      const arriving  = transit.filter((t) => t.rollsLeft === 1);
      transit = transit.filter((t) => t.rollsLeft > 1).map((t) => ({ ...t, rollsLeft: t.rollsLeft - 1 }));
      const dropped = sevenOut && rule !== 'lagKeep';
      const landAdd  = dropped ? 0 : arriving.reduce((a, t) => a + t.additives, 0);
      const landHype = dropped ? 0 : arriving.reduce((a, t) => a + t.hype, 0);
      const landMult = dropped ? [] : arriving.flatMap((t) => t.mults);
      fc = { ...ctx, resolvedBets: fc.resolvedBets, additives: landAdd, hype: ctx.hype + landHype, multipliers: [...ctx.multipliers, ...landMult] };
      bankroll += settleTurn(fc);
      if (dropped) { st.lost += arriving.reduce((a, t) => a + t.additives, 0) + transit.reduce((a, t) => a + t.additives, 0); transit = []; }
      if (!sevenOut || rule === 'lagKeep') transit.push({ additives: Math.round(cascade.finalContext.additives * 1.2 / 100) * 100, hype: crewHype, mults: crewMults, rollsLeft: lagRolls });
      else st.lost += Math.round(cascade.finalContext.additives * 1.2 / 100) * 100;
    } else if (rule === 'delay') {
      bankroll += settleTurn({ ...fc, additives: 0 });
      if (sevenOut) { st.lost += held + fc.additives; held = 0; }
      else { bankroll += held; held = fc.additives; }
    } else {
      bankroll += settleTurn(fc);
    }

    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    const prevHype = hype;
    hype = fc.hype;
    switch (fc.rollResult) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; darkUntilHit = false; break;
      case 'SEVEN_OUT':
        phase = 'COME_OUT'; point = null; streak = 0; blankStreak = 0;
        hype = Math.max(1.0, 1 + (prevHype - 1) / 2);   // The Keepsake
        if (blackoutK === 'shooter') darkUntilHit = true;
        else if (blackoutK !== null) dark = Number(blackoutK);
        if (covenant) covenant = false;
        else { shooters--; shooterRolls = 0; slots = slots.map((s) => s && s.cooldownType === 'per_shooter' ? { ...s, cooldownState: 0 } : s); }
        break;
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; break;
      default: break;
    }
    if (phase === 'COME_OUT') bets = { ...bets, passLine: 0, odds: 0 };
    if (bankroll >= target) return { cleared: true, st };
    if (shooters <= 0) return { cleared: false, st };
  }
  return { cleared: false, st };
}

const N = Number(process.env.SIM_N ?? 20_000);
const pct = (x) => `${(100 * x).toFixed(1).padStart(5)}%`;
function rate(opts) {
  let c = 0, lost = 0, earned = 0;
  for (let i = 0; i < N; i++) { const r = fight(opts); if (r.cleared) c++; lost += r.st.lost; earned += r.st.earned; }
  return { clear: c / N, lostShare: earned ? lost / earned : 0 };
}

const EMISSARY = 23;
const start = Math.round(GAUNTLET[EMISSARY - 1].targetCents * 1.1);
const ROWS_BLACKOUT = [
  { label: 'today: delay one roll, 7-out evaporates', rule: 'delay' },
  { label: 'blackout 3 rolls after a 7-out',          rule: 'blackout:3' },
  { label: 'blackout 6 rolls after a 7-out',          rule: 'blackout:6' },
  { label: 'blackout until the next point hit',       rule: 'blackout:shooter' },
  { label: 'lag 1 + blackout 3',                      rule: 'lag+blackout:3' },
  { label: 'lag 1 + blackout 6',                      rule: 'lag+blackout:6' },
];
const ROWS = process.env.SIM_SET === 'blackout' ? ROWS_BLACKOUT : [
  { label: 'today: delay one roll, 7-out evaporates', rule: 'delay' },
  { label: 'SIGNAL LAG 1 roll, 7-out drops transit',  rule: 'lag' },
  { label: 'signal lag 1 roll, nothing dropped',     rule: 'lagKeep' },
  { label: 'signal lag 2 rolls, 7-out drops transit', rule: 'lag2' },
  { label: 'odds pay even money',                     rule: 'evensOdds' },
  { label: 'no odds bets at all',                     rule: 'noOdds' },
];

console.log(`N = ${N} fights per row · The Emissary (marker ${EMISSARY}), start ${Math.round(start / 100).toLocaleString()} → target ${Math.round(GAUNTLET[EMISSARY].targetCents / 100).toLocaleString()}\n`);
for (const strategy of ['pass', 'odds']) {
  for (const [name, crew] of Object.entries(LINEUPS)) {
    console.log(`=== crew: ${name} · bets: ${strategy === 'odds' ? 'pass + max odds' : 'pass line only'} ===`);
    const base = rate({ marker: EMISSARY, start, crew, strategy, rule: 'none' });
    console.log(`  baseline (no rule)                         ${pct(base.clear)}`);
    for (const row of ROWS) {
      if (strategy === 'pass' && (row.rule === 'evensOdds' || row.rule === 'noOdds')) continue;
      const r = rate({ marker: EMISSARY, start, crew, strategy, rule: row.rule });
      const extra = row.rule === 'delay' || row.rule.startsWith('lag') ? `  crew cash lost ${pct(r.lostShare)}` : '';
      console.log(`  ${row.label.padEnd(42)} ${pct(r.clear)} (${(100 * (r.clear - base.clear)).toFixed(1).padStart(6)} pts)${extra}`);
    }
    console.log('');
  }
}
