// FB-040 tuning tool — run: npm run build -w @battlecraps/shared && node scripts/sim/architect-convergence-sim.mjs
// Monte Carlo of The Architect's fight (marker 26, $60M) on the REAL shared engine
// (resolveRoll → base hype tick → resolveCascade with real crew → settleTurn), modelled
// the same way as gauntlet-economy-sim.mjs (crew-cash floor taper, The Vig, Poseidon's
// Favor, The Covenant, The Keepsake, Member's Jacket, The Frequency, 5 crew slots).
//
// Arrival: 1.1× the $30M previous target, a full crew for the build.
//
// Rules compared:
//   none        no boss rule (the economy alone)
//   demolition  today: each 7-out removes the last crew to fire; crew cash × 0.85^N
//   forward     CONVERGENCE — each 7-out rebuilds the room as the next boss, Foreman → Emissary
//   reverse     CONVERGENCE — Emissary → Foreman ("the run rewinds")
//   random      CONVERGENCE — a random order per fight (no repeats)
//   room:<B>    one room for the whole fight (each boss's bite at Floor 9)
//
// Rooms (each boss's rule, adapted to one room — FB-040 decisions 2026-10-17):
//   Foreman     20% of winning profit skimmed (no Payoff — the room clears on bankroll)
//   Sarge       the 6th point-phase blank is a Seven-Out
//   Le Prix     one crew charmed per come-out (picked on entry and after each resolution)
//   Executive   rating from 2; +15% at Exceptional; a bad roll at Action Required ENDS THE RUN
//   Hierophant  crew cash held until a win (× Hype); a 7-out seizes 75%
//   Sovereign   tide per come-out — Dead Calm (no odds) / Undertow (7-out takes 35%) / High Tide (7-out drowns 2)
//   Commander   hype above 1.0× bleeds 20% every roll; 7-out resets (no Keepsake)
//   Emissary    crew effects land a roll late; a 7-out drops them and blacks the crew out for
//               6 rolls — the blackout CARRIES INTO THE NEXT ROOM
// A Seven-Out saved by The Covenant still rebuilds the room.
import {
  resolveRoll, resolveCascade, settleTurn, getBaseHypeTick, getMaxBet, getMinBet, getTideStage,
  pickEntryCharmSlot, BOSS_RULE_HOOKS, GAUNTLET, getCrewCashBaseCents,
  doorman, grinder, aceMcgee, closeCall, evenKeel, lookout, momentum, handicapper, echo, oddCouple,
} from '../../packages/shared/dist/index.js';

const rand = Math.random;
const d6 = () => 1 + Math.floor(rand() * 6);
const ODDS    = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
const NO_HARD = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };
const ARCH = 26;
const BOSS = { FORE: 2, SARGE: 5, PRIX: 8, EXEC: 11, HIERO: 14, SOV: 17, CMDR: 20, EMI: 23 };
const ROOMS_FORWARD = [BOSS.FORE, BOSS.SARGE, BOSS.PRIX, BOSS.EXEC, BOSS.HIERO, BOSS.SOV, BOSS.CMDR, BOSS.EMI];
const P = (b) => GAUNTLET[b].boss.ruleParams;
const FORE_P = P(BOSS.FORE), SARGE_P = P(BOSS.SARGE), PRIX_P = P(BOSS.PRIX), SOV_P = P(BOSS.SOV), CMDR_P = P(BOSS.CMDR), EMI_P = P(BOSS.EMI);
const EMPTY_PACKET = { additives: 0, hype: 0, multipliers: [] };

const LINEUPS = {
  cash:  [doorman, grinder, aceMcgee, closeCall, evenKeel],
  hype:  [lookout, momentum, handicapper, echo, oddCouple],
  mixed: [doorman, aceMcgee, handicapper, momentum, closeCall],
};

const TARGET   = GAUNTLET[ARCH].targetCents;
const MAX_BET  = getMaxBet(ARCH);
const MIN_BET  = getMinBet(ARCH);
const CASH_BASE = getCrewCashBaseCents(ARCH);
const START    = Math.round(GAUNTLET[ARCH - 1].targetCents * Number(process.env.SIM_ARRIVAL ?? 1.1));

function shuffled(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function roomOrder(rule) {
  rule = rule.replace(/^stack-/, '');
  if (rule === 'forward') return ROOMS_FORWARD;
  if (rule === 'reverse') return [...ROOMS_FORWARD].reverse();
  if (rule === 'random')  return shuffled(ROOMS_FORWARD);
  if (rule.startsWith('room:')) return Array(12).fill(BOSS[rule.slice(5)]);
  return null;
}

function fight({ lineup, strategy, rule }) {
  let crew = LINEUPS[lineup].map((c) => ({ ...c, cooldownState: 0 }));
  while (crew.length < 5) crew.push(null);
  const filled = () => crew.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const randBelow = (k) => Math.floor(rand() * k);

  const order = roomOrder(rule);
  let roomIdx = 0;
  const stack = rule.startsWith('stack-');
  const room = () => (order ? (order[Math.min(roomIdx, order.length - 1)] ?? null) : null);
  // Stacking: every room so far stays in force (convergence); otherwise just the current one.
  const activeRooms = () => new Set(!order ? [] : stack ? order.slice(0, roomIdx + 1) : [room()]);
  const entryCounter = (b) => (b === BOSS.EXEC ? 2 : b === BOSS.PRIX ? (pickEntryCharmSlot(crew, 5, randBelow) ?? 0) : 0);

  let bankroll = START, shooters = 6, hype = 1.0, streak = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  const ctr = { demo: 0 };
  if (order) ctr[room()] = entryCounter(room());
  let pending = 0, covenantSpent = false, sevenOuts = 0;
  let transit = EMPTY_PACKET, dark = 0;
  const end = (cleared, death = null) => ({ cleared, death, rooms: roomIdx + 1 });

  for (let guard = 0; guard < 5000; guard++) {
    const A = activeRooms();
    const has = (b) => A.has(b);
    const tide = has(BOSS.SOV) ? getTideStage(SOV_P, ctr[BOSS.SOV] ?? 0).effect : null;
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      if (bankroll < MIN_BET) return end(false, 'broke');
      const stake = Math.min(MAX_BET, bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    if (strategy !== 'pass' && tide !== 'DEAD_CALM' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0) {
      const stake = Math.min(bets.passLine * (strategy === 'maxOdds' ? ODDS[point] : 1), bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    const preHype = hype;
    let ctx = resolveRoll([d6(), d6()], {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: TARGET, crewCashBaseCents: CASH_BASE, shooters, unlockedSlots: 5,
    });
    const poseidon = shooterRolls === 0 && ctx.rollResult === 'CRAPS_OUT';
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10 : ctx.rollResult === 'CRAPS_OUT' && !poseidon ? -0.05 : 0;
    if (tick !== 0) ctx = { ...ctx, hype: Math.max(1.0, Math.round((ctx.hype + tick) * 10_000) / 10_000) };
    if (poseidon) ctx = { ...ctx, rollResult: 'NO_RESOLUTION', resolvedBets: { ...ctx.resolvedBets, passLine: ctx.bets.passLine } };

    const blackedOut = dark > 0;
    const charm = has(BOSS.PRIX);
    const cascade = resolveCascade(
      blackedOut ? crew.map(() => null) : crew, ctx, () => [d6(), d6()],
      charm ? BOSS_RULE_HOOKS.DISABLE_CREW : undefined, charm ? PRIX_P : undefined,
      charm ? { bossPointHits: ctr[BOSS.PRIX] ?? 0, markerIndex: BOSS.PRIX } : undefined,
    );
    let fc = cascade.finalContext;
    if (has(BOSS.SARGE) && phase === 'POINT_ACTIVE' && fc.rollResult === 'NO_RESOLUTION' && (ctr[BOSS.SARGE] ?? 0) + 1 >= SARGE_P.rollLimit) {
      fc = { ...fc, rollResult: 'SEVEN_OUT', resolvedBets: { passLine: 0, odds: 0, hardways: { ...NO_HARD } } };
    }
    if (!blackedOut) crew = cascade.updatedCrewSlots;
    const lastSlot = cascade.events.length > 0 ? (cascade.events[cascade.events.length - 1]?.slotIndex ?? null) : null;

    let add = fc.additives;
    if (add > 0) add = Math.round(add * 1.2 / 100) * 100;   // The Vig
    const sevenOutNow = fc.rollResult === 'SEVEN_OUT';
    if (has(BOSS.EMI)) {
      const sent = { additives: add, hype: Math.round((fc.hype - ctx.hype) * 10_000) / 10_000, multipliers: fc.multipliers.slice(ctx.multipliers.length) };
      const landed = sevenOutNow ? EMPTY_PACKET : transit;
      fc = { ...fc, hype: Math.round((ctx.hype + landed.hype) * 10_000) / 10_000, multipliers: [...ctx.multipliers, ...landed.multipliers] };
      add = landed.additives;
      transit = sevenOutNow ? EMPTY_PACKET : sent;
    }
    if (rule === 'demolition' && add > 0) add = Math.floor(add * Math.pow(0.85, ctr.demo) / 100) * 100;
    const held = has(BOSS.HIERO) ? add : 0;
    fc = { ...fc, additives: has(BOSS.HIERO) ? 0 : add };

    let payout = settleTurn(fc);
    const r = fc.rollResult;
    const bad = r === 'CRAPS_OUT' || r === 'SEVEN_OUT';
    const good = r === 'NATURAL' || r === 'POINT_HIT';
    if (has(BOSS.FORE)) {
      const profit = payout - fc.baseStakeReturned;
      if (profit > 0) payout -= Math.round(profit * FORE_P.taxPct / 100) * 100;
    }
    if (has(BOSS.EXEC)) {
      if (bad && ctr[BOSS.EXEC] === 0) return end(false, 'pip');
      if (ctr[BOSS.EXEC] === 4) { const gp = payout - fc.baseStakeReturned; if (gp > 0) payout += Math.round(gp * 0.15 / 100) * 100; }
    }
    bankroll += payout;
    if (r === 'NATURAL' && phase === 'COME_OUT') bankroll += Math.round(TARGET * 0.03 / 100) * 100;   // The Frequency

    const withHype = (c) => Math.floor(c * fc.hype / 100) * 100;
    if (has(BOSS.HIERO)) {
      const offering = pending + held;
      if (r === 'SEVEN_OUT' || good) { bankroll += Math.floor(withHype(offering) * (r === 'SEVEN_OUT' ? 0.25 : 1) / 100) * 100; pending = 0; }
      else pending = offering;
    }
    if (tide === 'UNDERTOW' && r === 'SEVEN_OUT') bankroll -= Math.floor(bankroll * SOV_P.undertowPct / 100) * 100;

    // Advance
    const sevenOut = r === 'SEVEN_OUT';
    const covenantSaves = sevenOut && !covenantSpent;
    const lost = tide === 'HIGH_TIDE' && !covenantSaves ? SOV_P.waveShooters : 1;
    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    if (dark > 0) dark--;
    switch (r) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; hype = fc.hype; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; hype = fc.hype; break;
      case 'NATURAL': case 'CRAPS_OUT': hype = fc.hype; blankStreak = 0; break;
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; hype = fc.hype; break;
      case 'SEVEN_OUT': {
        const cascadeDelta = Math.max(0, fc.hype - preHype);
        const base = has(BOSS.CMDR) ? 1.0 : 1.0 + (preHype - 1.0) / 2;   // The Keepsake (not in the Commander's room)
        hype = Math.max(1.0, base + cascadeDelta);
        phase = 'COME_OUT'; point = null; streak = 0; blankStreak = 0;
        if (covenantSaves) covenantSpent = true;
        else { shooters = Math.max(0, shooters - lost); shooterRolls = 0; prevTotal = null; }
        break;
      }
      default: break;
    }
    if (phase === 'COME_OUT' && r !== 'NO_RESOLUTION') bets = { ...bets, passLine: 0, odds: 0 };

    // Room counters
    if (has(BOSS.EXEC)) ctr[BOSS.EXEC] = Math.max(0, Math.min(4, (ctr[BOSS.EXEC] ?? 2) + (good ? 1 : bad ? -1 : 0)));
    if (has(BOSS.SARGE)) ctr[BOSS.SARGE] = r === 'NO_RESOLUTION' && phase === 'POINT_ACTIVE' ? (ctr[BOSS.SARGE] ?? 0) + 1 : 0;
    if (has(BOSS.PRIX) && (good || bad)) { const f = filled(); if (f.length) ctr[BOSS.PRIX] = f[randBelow(f.length)]; }
    if (has(BOSS.SOV) && (good || bad)) ctr[BOSS.SOV] = ((ctr[BOSS.SOV] ?? 0) + 1) % 4;

    const onTable = bets.passLine + bets.odds;
    if (bankroll + onTable >= TARGET) return end(true);

    if (has(BOSS.CMDR) && !sevenOut && hype > 1.0) hype = Math.round((1 + (hype - 1) * (1 - CMDR_P.bleedPct)) * 10_000) / 10_000;

    if (sevenOut) {
      sevenOuts++;
      if (rule === 'demolition') {
        let idx = lastSlot;
        if (idx === null) for (let i = 4; i >= 0; i--) if (crew[i]) { idx = i; break; }
        if (idx !== null) crew = crew.map((c, i) => (i === idx ? null : c));
        ctr.demo = Math.min(5, ctr.demo + 1);
      } else if (order) {
        // The room rebuilds. The Emissary's blackout carries into the next room.
        if (has(BOSS.EMI)) dark = EMI_P.blackoutRolls;
        roomIdx++;
        transit = EMPTY_PACKET;
        if (!stack) pending = 0;
        const next = room();
        if (next !== null && (!stack || ctr[next] === undefined)) ctr[next] = entryCounter(next);
      }
    }
    if (shooters <= 0) return end(false, 'shooters');
  }
  return end(false, 'guard');
}

const N = Number(process.env.SIM_N ?? 20_000);
const pct = (x) => `${(100 * x).toFixed(1).padStart(5)}%`;
function rate(opts) {
  let c = 0, rooms = 0; const deaths = {};
  for (let i = 0; i < N; i++) { const r = fight(opts); if (r.cleared) c++; else deaths[r.death] = (deaths[r.death] ?? 0) + 1; rooms += r.rooms; }
  return { clear: c / N, rooms: rooms / N, deaths };
}

const ROWS = process.env.SIM_SET === 'rooms'
  ? Object.keys(BOSS).map((b) => ({ label: `one room all fight: ${b}`, rule: `room:${b}` }))
  : [
    { label: 'today: demolition + load-bearing', rule: 'demolition' },
    { label: 'CONVERGENCE forward (Foreman first)', rule: 'forward' },
    { label: 'CONVERGENCE reverse (Emissary first)', rule: 'reverse' },
    { label: 'CONVERGENCE random order', rule: 'random' },
    { label: 'STACKING forward (rooms add up)', rule: 'stack-forward' },
    { label: 'STACKING reverse', rule: 'stack-reverse' },
    { label: 'STACKING random', rule: 'stack-random' },
  ];

console.log(`N = ${N} fights per row · The Architect: start $${(START / 100).toLocaleString()} → $${(TARGET / 100).toLocaleString()}, 6 shooters + The Covenant\n`);
for (const strategy of ['pass', 'odds1x']) {
  for (const lineup of ['mixed', 'cash', 'hype']) {
    console.log(`=== crew: ${lineup} · bets: ${strategy === 'pass' ? 'pass line only' : 'pass + 1× odds'} ===`);
    const base = rate({ lineup, strategy, rule: 'none' });
    console.log(`  baseline (no rule)                         ${pct(base.clear)}`);
    for (const row of ROWS) {
      const r = rate({ lineup, strategy, rule: row.rule });
      const d = Object.entries(r.deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / N).trim()}`).join(', ');
      console.log(`  ${row.label.padEnd(42)} ${pct(r.clear)} (${(100 * (r.clear - base.clear)).toFixed(1).padStart(6)} pts)  rooms ${r.rooms.toFixed(1)}  lost: ${d}`);
    }
    console.log('');
  }
}
