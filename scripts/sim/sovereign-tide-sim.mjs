// FB-037 tuning tool — run: npm run build -w @battlecraps/shared && node scripts/sim/sovereign-tide-sim.mjs
// Monte Carlo of The Sovereign's fight on the REAL shared engine (resolveRoll →
// base hype tick → resolveCascade with real crew → settleTurn), comparing
// today's tide (stage minimum bets only) against "rogue wave" variants: a
// Seven-Out at certain tide stages drowns extra shooters. Also pressure-tests
// how The Covenant (once per marker, a Seven-Out doesn't cost a shooter)
// should treat a wave.
//
// Floor-6-realistic comps: Member's Jacket (6 shooters), The Keepsake (7-out
// keeps half the hype above 1.0×), The Vig (crew cash +20%), Board Seat (4 crew
// slots), The Covenant (variable). Each row is compared against the same setup
// with no tide rule at all.
// Tide (mirrors rolls.ts): stage = counter % 4 — LOW / EBB / HIGH / FLOW with
// min Pass Line 1× / 2× / 3× / 2× the table minimum; the counter advances when a
// come-out cycle resolves (Natural, Craps, Point Hit, Seven-Out), so a point
// set at HIGH TIDE stays HIGH until it resolves. Can't cover the stage minimum
// on a come-out → stuck → run over.
import {
  resolveRoll, resolveCascade, settleTurn, getBaseHypeTick, getMaxBet, getMinBet, GAUNTLET,
  doorman, grinder, aceMcgee, closeCall, lookout, momentum, handicapper, echo,
} from '../../packages/shared/dist/index.js';

const d6   = () => 1 + Math.floor(Math.random() * 6);
const ODDS = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
const NO_HARD = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };
const STAGE_MULT = [1, 2, 3, 2];
const STAGE = ['LOW', 'EBB', 'HIGH', 'FLOW'];

const LINEUPS = {
  cash:  [doorman, grinder, aceMcgee, closeCall],
  hype:  [lookout, momentum, handicapper, echo],
  mixed: [doorman, aceMcgee, handicapper, momentum],
};

/**
 * rule: { tide: boolean, wave: { stages: string[], cost: number } | null,
 *         lowCap?: number      — LOW TIDE ("the shallows"): max Pass Line × this
 *         undertow?: number    — EBB / FLOW: a Seven-Out drags this share of the bankroll
 *         highProfit?: number  — HIGH TIDE: winning profit × this }
 * covenant: 'none' | 'all' (the save cancels the whole Seven-Out, wave and all)
 *         | 'one' (the save spares one shooter; a wave still costs cost − 1)
 */
function fight({ marker, start, crew, strategy, rule, covenant }) {
  const target = GAUNTLET[marker].targetCents;
  const maxBet = getMaxBet(marker);
  const minBet = getMinBet(marker);
  let bankroll = start, shooters = 6, hype = 1.0, streak = 0, tide = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  let slots = crew.map((c) => ({ ...c, cooldownState: 0 }));
  while (slots.length < 5) slots.push(null);
  let covenantLeft = covenant !== 'none';
  const st = { waves: 0, waveShooters: 0, covenantOnWave: 0, stuck: false };

  for (let guard = 0; guard < 3000; guard++) {
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      const stageMin = rule.tide ? Math.round(minBet * STAGE_MULT[tide % 4] / 500) * 500 : minBet;
      if (bankroll < stageMin) { st.stuck = rule.tide && bankroll >= minBet; return { cleared: false, st }; }
      const capped = rule.lowCap && STAGE[tide % 4] === 'LOW' ? Math.floor(maxBet * rule.lowCap / 500) * 500 : maxBet;
      const stake = Math.min(Math.max(capped, minBet), bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    if (strategy === 'odds' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0 && !(rule.lowNoOdds && STAGE[tide % 4] === 'LOW')) {
      const stake = Math.min(bets.passLine * ODDS[point], bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    let ctx = resolveRoll([d6(), d6()], {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: target, shooters, unlockedSlots: 4,
    });
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10 : ctx.rollResult === 'CRAPS_OUT' ? -0.05 : 0;
    ctx = { ...ctx, hype: Math.max(1.0, ctx.hype + tick) };
    const cascade = resolveCascade(slots, ctx, () => [d6(), d6()]);
    let fc = cascade.finalContext;
    slots = cascade.updatedCrewSlots;
    // The Vig: crew cash +20% (rounded to the dollar).
    fc = { ...fc, additives: Math.round(fc.additives * 1.2 / 100) * 100 };
    let payout = settleTurn(fc);
    if (rule.highProfit && STAGE[tide % 4] === 'HIGH') {
      const profit = payout - fc.baseStakeReturned;
      if (profit > 0) payout += Math.round(profit * (rule.highProfit - 1) / 100) * 100;
    }
    bankroll += payout;

    const result = fc.rollResult;
    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    const prevHype = hype;
    hype = fc.hype;
    switch (result) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; break;
      case 'SEVEN_OUT': {
        phase = 'COME_OUT'; point = null; streak = 0; blankStreak = 0;
        hype = Math.max(1.0, 1 + (prevHype - 1) / 2);   // The Keepsake
        const stage = STAGE[tide % 4];
        if (rule.undertow && (stage === 'EBB' || stage === 'FLOW')) {
          const dragged = Math.round(bankroll * rule.undertow / 100) * 100;
          bankroll -= dragged; st.undertow = (st.undertow ?? 0) + dragged;
        }
        const isWave = rule.wave !== null && rule.wave.stages.includes(stage);
        let cost = isWave ? rule.wave.cost : 1;
        if (isWave) st.waves++;
        if (covenantLeft) {
          covenantLeft = false;
          if (isWave) st.covenantOnWave++;
          cost = covenant === 'all' ? 0 : cost - 1;
        }
        if (isWave) st.waveShooters += cost;
        if (cost > 0) {
          shooters -= cost; shooterRolls = 0;
          slots = slots.map((s) => s && s.cooldownType === 'per_shooter' ? { ...s, cooldownState: 0 } : s);
        }
        break;
      }
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; break;
      default: break;
    }
    if (result === 'NATURAL' || result === 'CRAPS_OUT' || result === 'POINT_HIT' || result === 'SEVEN_OUT') tide++;
    if (phase === 'COME_OUT') bets = { ...bets, passLine: 0, odds: 0 };

    if (bankroll >= target) return { cleared: true, st };
    if (shooters <= 0) return { cleared: false, st };
  }
  return { cleared: false, st };
}

const N = Number(process.env.SIM_N ?? 20_000);
const pct = (x) => `${(100 * x).toFixed(1).padStart(5)}%`;
function rate(opts) {
  let c = 0, waves = 0, waveShooters = 0, covOnWave = 0, stuck = 0;
  for (let i = 0; i < N; i++) {
    const r = fight(opts);
    if (r.cleared) c++;
    waves += r.st.waves; waveShooters += r.st.waveShooters; covOnWave += r.st.covenantOnWave; if (r.st.stuck) stuck++;
  }
  return { clear: c / N, waves: waves / N, waveShooters: waveShooters / N, covOnWave: covOnWave / N, stuck: stuck / N };
}

const SOVEREIGN = 17;
const start = Math.round(GAUNTLET[SOVEREIGN - 1].targetCents * 1.1);

const NONE  = { tide: false, wave: null };
const TODAY = { tide: true,  wave: null };
const RHYTHM = (o = {}) => ({ tide: true, wave: { stages: ['HIGH'], cost: 2 }, lowCap: 0.5, undertow: 0.10, highProfit: 1.5, ...o });
const ROWS_RHYTHM = [
  { label: 'today (stage minimums only)',         rule: TODAY,                                  covenant: 'all' },
  { label: 'RHYTHM: ½ max · 10% · 1.5× + wave',     rule: RHYTHM(),                               covenant: 'all' },
  { label: 'rhythm, HIGH without the wave',         rule: RHYTHM({ wave: null }),                 covenant: 'all' },
  { label: 'rhythm, undertow 15%',                  rule: RHYTHM({ undertow: 0.15 }),             covenant: 'all' },
  { label: 'rhythm, shallows ⅓ max',                rule: RHYTHM({ lowCap: 1 / 3 }),              covenant: 'all' },
  { label: 'rhythm, ⅓ max · 15%',                   rule: RHYTHM({ lowCap: 1 / 3, undertow: 0.15 }), covenant: 'all' },
  { label: 'shallows ½ only (no other stage rules)', rule: { tide: true, wave: null, lowCap: 0.5 }, covenant: 'all' },
  { label: 'undertow 10% only',                      rule: { tide: true, wave: null, undertow: 0.10 }, covenant: 'all' },
];
const ROWS_CALM = [
  { label: 'calm (no odds) · 25% · 1.25× + wave', rule: RHYTHM({ lowCap: null, lowNoOdds: true, undertow: 0.25, highProfit: 1.25 }), covenant: 'all' },
  { label: 'calm (no odds) · 25% · 1.0× + wave',  rule: RHYTHM({ lowCap: null, lowNoOdds: true, undertow: 0.25, highProfit: 1.0 }),  covenant: 'all' },
  { label: 'calm (no odds) · 35% · 1.25× + wave', rule: RHYTHM({ lowCap: null, lowNoOdds: true, undertow: 0.35, highProfit: 1.25 }), covenant: 'all' },
  { label: 'calm (no odds) · 35% · 1.0× + wave',  rule: RHYTHM({ lowCap: null, lowNoOdds: true, undertow: 0.35, highProfit: 1.0 }),  covenant: 'all' },
];
const ROWS_TUNED = [
  { label: 'rhythm ⅓ · 25% · 1.0× + wave',  rule: RHYTHM({ lowCap: 1 / 3, undertow: 0.25, highProfit: 1.0 }), covenant: 'all' },
  { label: 'rhythm ⅓ · 25% · 1.5× + wave',  rule: RHYTHM({ lowCap: 1 / 3, undertow: 0.25 }),                  covenant: 'all' },
  { label: 'rhythm ½ · 25% · 1.25× + wave', rule: RHYTHM({ undertow: 0.25, highProfit: 1.25 }),              covenant: 'all' },
  { label: 'rhythm ⅓ · 35% · 1.0× + wave',  rule: RHYTHM({ lowCap: 1 / 3, undertow: 0.35, highProfit: 1.0 }), covenant: 'all' },
  { label: 'undertow 25% only',             rule: { tide: true, wave: null, undertow: 0.25 },               covenant: 'all' },
];
const ROWS = process.env.SIM_SET === 'calm' ? ROWS_CALM : process.env.SIM_SET === 'tuned' ? ROWS_TUNED : process.env.SIM_SET === 'wave' ? [
  { label: 'today (stage minimums only)',     rule: TODAY,                                                  covenant: 'all' },
  { label: 'wave HIGH ×2 · no Covenant',      rule: { tide: true, wave: { stages: ['HIGH'], cost: 2 } },   covenant: 'none' },
  { label: 'wave HIGH ×2 · Covenant = all',   rule: { tide: true, wave: { stages: ['HIGH'], cost: 2 } },   covenant: 'all' },
  { label: 'wave HIGH ×2 · Covenant = one',   rule: { tide: true, wave: { stages: ['HIGH'], cost: 2 } },   covenant: 'one' },
  { label: 'wave HIGH ×3 · Covenant = all',   rule: { tide: true, wave: { stages: ['HIGH'], cost: 3 } },   covenant: 'all' },
  { label: 'wave HIGH+EBB+FLOW ×2 · Cov = all', rule: { tide: true, wave: { stages: ['EBB', 'HIGH', 'FLOW'], cost: 2 } }, covenant: 'all' },
] : ROWS_RHYTHM;

console.log(`N = ${N} fights per row · The Sovereign (marker ${SOVEREIGN}), start ${Math.round(start / 100).toLocaleString()} → target ${Math.round(GAUNTLET[SOVEREIGN].targetCents / 100).toLocaleString()}`);
console.log(`Clear rate (pts vs the no-rule baseline with the same Covenant setting) · waves hit / shooters lost to waves per fight · Covenant used on a wave\n`);
for (const strategy of ['pass', 'odds']) {
  for (const [name, crew] of Object.entries(LINEUPS)) {
    console.log(`=== crew: ${name} · bets: ${strategy === 'odds' ? 'pass + max odds' : 'pass line only'} ===`);
    const baseAll  = rate({ marker: SOVEREIGN, start, crew, strategy, rule: NONE, covenant: 'all' });
    const baseNone = rate({ marker: SOVEREIGN, start, crew, strategy, rule: NONE, covenant: 'none' });
    console.log(`  baseline, no tide (Covenant held)       ${pct(baseAll.clear)}`);
    console.log(`  baseline, no tide (no Covenant)         ${pct(baseNone.clear)}`);
    for (const row of ROWS) {
      const r = rate({ marker: SOVEREIGN, start, crew, strategy, rule: row.rule, covenant: row.covenant });
      const base = row.covenant === 'none' ? baseNone : baseAll;
      const extra = row.rule.wave ? `  waves ${r.waves.toFixed(2)} · lost ${r.waveShooters.toFixed(2)} · Cov on wave ${pct(r.covOnWave)}` : `  stuck below the tide minimum ${pct(r.stuck)}`;
      console.log(`  ${row.label.padEnd(38)} ${pct(r.clear)} (${(100 * (r.clear - base.clear)).toFixed(1).padStart(6)} pts)${extra}`);
    }
    console.log('');
  }
}
