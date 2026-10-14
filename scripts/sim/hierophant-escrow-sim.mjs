// FB-036 tuning tool — run: npm run build -w @battlecraps/shared && node scripts/sim/hierophant-escrow-sim.mjs
// Monte Carlo of The Hierophant's escrow fight on the REAL shared engine
// (resolveRoll → base hype tick → resolveCascade with real crew → settleTurn),
// comparing today's rule against redesign variants. For scale, The Executive's
// fight is simulated the same way. Each boss is reported as a clear rate AND as
// the drop from its own no-boss baseline (same floor, same crew, same bets) —
// that drop is what the boss rule itself costs.
// Simplifications: one marker, no Pub, no comps, crew from the Starter roster,
// a fixed betting strategy, Lucky Charm-style seven-out hype carry ignored.
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
 * One fight. rule:
 *   none        — no boss rule (baseline)
 *   exec        — The Executive (rating 0–4 from 2, PIP at 0, +15% gross at 4)
 *   escrow      — hold crew additives; { release: 'next' | 'point', seize, hype }
 */
function fight({ marker, start, crew, slots, strategy, rule }) {
  const target = GAUNTLET[marker].targetCents;
  const maxBet = getMaxBet(marker);
  const minBet = getMinBet(marker);
  let bankroll = start, shooters = 5, hype = 1.0, streak = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  let slotsLive = crew.slice(0, slots).map((c) => ({ ...c, cooldownState: 0 }));
  while (slotsLive.length < 5) slotsLive.push(null);
  let rating = 2, bowl = 0;
  const stats = { seized: 0, crewEarned: 0, crewPaid: 0 };

  for (let guard = 0; guard < 2000; guard++) {
    // Place bets.
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      if (bankroll < minBet) return { cleared: false, stats };
      const stake = Math.min(maxBet, bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    if (strategy === 'odds' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0) {
      const stake = Math.min(bets.passLine * ODDS[point], bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    const dice = [d6(), d6()];
    let ctx = resolveRoll(dice, {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: target, shooters, unlockedSlots: Math.max(3, slots),
    });
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10 : ctx.rollResult === 'CRAPS_OUT' ? -0.05 : 0;
    ctx = { ...ctx, hype: Math.max(1.0, ctx.hype + tick) };
    const cascade = resolveCascade(slotsLive, ctx, () => [d6(), d6()]);
    const fc = cascade.finalContext;
    slotsLive = cascade.updatedCrewSlots;
    stats.crewEarned += fc.additives;

    const isEscrow   = rule.kind === 'escrow';
    const additives  = isEscrow ? 0 : fc.additives;
    let payout       = settleTurn({ ...fc, additives });

    // The Executive: +15% gross profit at Exceptional; PIP at Action Required.
    const bad = fc.rollResult === 'CRAPS_OUT' || fc.rollResult === 'SEVEN_OUT';
    const good = fc.rollResult === 'NATURAL' || fc.rollResult === 'POINT_HIT';
    if (rule.kind === 'exec') {
      if (bad && rating === 0) return { cleared: false, stats, pip: true };
      if (rating === 4) { const gp = payout - fc.baseStakeReturned; if (gp > 0) payout += Math.round(gp * 0.15 / 100) * 100; }
      rating = Math.max(0, Math.min(4, rating + (good ? 1 : bad ? -1 : 0)));
    }

    bankroll += payout;

    // Escrow.
    if (isEscrow) {
      const sevenOut = fc.rollResult === 'SEVEN_OUT';
      const releaseNow = rule.release === 'next' ? true
        : (fc.rollResult === 'POINT_HIT' || fc.rollResult === 'NATURAL');
      const amp = (c) => rule.hype ? Math.floor(c * fc.hype / 100) * 100 : c;
      if (sevenOut) {
        const pot = bowl + fc.additives;
        const paid = Math.floor(amp(pot) * (1 - rule.seize) / 100) * 100;
        stats.seized += amp(pot) - paid; stats.crewPaid += paid;
        bankroll += paid; bowl = 0;
      } else if (rule.release === 'next') {
        const paid = amp(bowl); bankroll += paid; stats.crewPaid += paid; bowl = fc.additives;
      } else if (releaseNow) {
        const paid = amp(bowl + fc.additives); bankroll += paid; stats.crewPaid += paid; bowl = 0;
      } else {
        bowl += fc.additives;
      }
    }

    // Advance state.
    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    hype = fc.hype;
    switch (fc.rollResult) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; break;
      case 'SEVEN_OUT':   phase = 'COME_OUT'; point = null; streak = 0; hype = 1.0; shooters--; shooterRolls = 0; blankStreak = 0;
                          slotsLive = slotsLive.map((s) => s && s.cooldownType === 'per_shooter' ? { ...s, cooldownState: 0 } : s); break;
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; break;
      default: break;
    }
    if (phase === 'COME_OUT') bets = { ...bets, passLine: 0, odds: 0 };

    // Clear check (bankroll; the bowl pays out on a clear).
    if (bankroll >= target) return { cleared: true, stats, bankroll: bankroll + bowl };
    if (shooters <= 0) return { cleared: false, stats };
  }
  return { cleared: false, stats };
}

const N = Number(process.env.SIM_N ?? 20_000);
const pct = (x) => `${(100 * x).toFixed(1).padStart(5)}%`;
function rate(opts) {
  let c = 0, seized = 0, earned = 0, paid = 0, pip = 0;
  for (let i = 0; i < N; i++) {
    const r = fight(opts);
    if (r.cleared) c++;
    if (r.pip) pip++;
    seized += r.stats.seized; earned += r.stats.crewEarned; paid += r.stats.crewPaid;
  }
  // Share of the bowl's total value (paid out + seized) that the order took.
  return { clear: c / N, seizedShare: seized + paid > 0 ? seized / (seized + paid) : 0, pip: pip / N };
}

const EXEC = 11, HIERO = 14;
// Arrive with ~1.1× the previous marker's target (cleared it, paid for a hire).
const startFor = (m) => Math.round(GAUNTLET[m - 1].targetCents * 1.1);

const VARIANTS = [
  { label: "today: next roll, 25%, no hype",  rule: { kind: 'escrow', release: 'next',  seize: 0.25, hype: false } },
  { label: "next roll, 25%, WITH hype",       rule: { kind: 'escrow', release: 'next',  seize: 0.25, hype: true  } },
  { label: "until win, 25%, with hype",       rule: { kind: 'escrow', release: 'point', seize: 0.25, hype: true  } },
  { label: "until win, 50%, with hype",       rule: { kind: 'escrow', release: 'point', seize: 0.50, hype: true  } },
  { label: "until win, 50%, no hype",         rule: { kind: 'escrow', release: 'point', seize: 0.50, hype: false } },
  { label: "until win, 75%, with hype",       rule: { kind: 'escrow', release: 'point', seize: 0.75, hype: true  } },
  { label: "until win, 100%, with hype",      rule: { kind: 'escrow', release: 'point', seize: 1.00, hype: true  } },
];

console.log(`N = ${N} fights per row. Clear rate (drop vs that floor's no-boss baseline).\n`);
for (const strategy of ['pass', 'odds']) {
  for (const [name, crew] of Object.entries(LINEUPS)) {
    console.log(`=== crew: ${name} · bets: ${strategy === 'odds' ? 'pass + max odds' : 'pass line only'} ===`);
    const execBase = rate({ marker: EXEC, start: startFor(EXEC), crew, slots: 3, strategy, rule: { kind: 'none' } });
    const exec     = rate({ marker: EXEC, start: startFor(EXEC), crew, slots: 3, strategy, rule: { kind: 'exec' } });
    console.log(`  The Executive (ref)                ${pct(exec.clear)}  (${(100 * (exec.clear - execBase.clear)).toFixed(1).padStart(6)} pts vs ${pct(execBase.clear).trim()} baseline)`);
    const base = rate({ marker: HIERO, start: startFor(HIERO), crew, slots: 4, strategy, rule: { kind: 'none' } });
    console.log(`  Hierophant baseline (no rule)      ${pct(base.clear)}`);
    for (const v of VARIANTS) {
      const r = rate({ marker: HIERO, start: startFor(HIERO), crew, slots: 4, strategy, rule: v.rule });
      console.log(`  ${v.label.padEnd(34)} ${pct(r.clear)}  (${(100 * (r.clear - base.clear)).toFixed(1).padStart(6)} pts)   order took ${pct(r.seizedShare)} of the bowl`);
    }
    console.log('');
  }
}
