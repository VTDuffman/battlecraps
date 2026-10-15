// Late-game economy audit — run: npm run build -w @battlecraps/shared && node scripts/sim/gauntlet-economy-sim.mjs [mode]
//
// Monte Carlo of a whole run from Floor 4 (marker 9) to the end of the gauntlet
// on the REAL shared engine (resolveRoll → base hype tick → resolveCascade with
// real Starter crew → settleTurn), carrying bankroll between markers, applying
// comps as they're earned and each boss's current rule as rolls.ts does it.
//
// Modes:
//   chain    (default) one full run per sample, Floor 4 → The Architect; per-marker table
//   isolated each marker on its own, arriving with 1.1× the previous target (no carry)
//   options  rebalance options — before/after clear-rate curves for each
//   levers   one lever at a time — how much each comp / knob is worth
//   compare  the FB-037/038/039 boss reworks (Sovereign / Commander / Emissary) vs the rules they replaced
//   all      chain + isolated + levers + options + compare
// Env: SIM_N (samples per row, default 4000), SIM_SEED (deterministic RNG).
//
// Modelled per rolls.ts: Poseidon's Favor (before the cascade), The Vig (after),
// Load-Bearing (Architect, after Vig), The Hierophant's escrow, The Frequency,
// The Executive's rating / PIP / +15%, The Sovereign's tide (Dead Calm: no odds ·
// Undertow: a 7-out takes 35% of the bankroll · High Tide: a 7-out drowns 2 shooters),
// The Commander's orbital bleed (hype above 1.0× loses 20% after every roll), The
// Emissary's signal lag (crew cash / hype / multipliers land a roll late, a 7-out drops
// them) + 6-roll crew blackout after a 7-out, The Architect's demolition, The Covenant,
// The Keepsake, Member's Jacket, hype reset per marker, shooters reset per marker.
// `bossVersion: 'legacy'` swaps in the pre-FB-037/038/039 rules for Floors 6–8 (tide
// minimum bets; tiered 7-out hype decay + death spiral; one-roll crew-cash delay). Marker clear = bankroll + chips on the table ≥ target
// (the pre-roll auto-clear), checked after every roll.
// Simplifications: fixed betting strategy, no hardways, Starter crew only, the pub
// only charges for filling a newly opened slot (Starter = 2 × the cleared max bet),
// Le Prix/Sarge/Foreman not simulated (the run starts on Floor 4 with their comps).
import {
  resolveRoll, resolveCascade, settleTurn, getBaseHypeTick,
  getMaxBet, getMinBet, getBossMinBet, getTideStage, GAUNTLET,
  doorman, grinder, aceMcgee, closeCall, evenKeel,
  lookout, momentum, handicapper, echo, oddCouple,
} from '../../packages/shared/dist/index.js';

// ── RNG (optionally seeded so before/after comparisons share luck) ──────────
let rand = Math.random;
if (process.env.SIM_SEED) {
  let s = Number(process.env.SIM_SEED) >>> 0;
  rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const d6 = () => 1 + Math.floor(rand() * 6);

const ODDS    = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
const NO_HARD = { hard4: 0, hard6: 0, hard8: 0, hard10: 0 };
const FIRST   = 9;                      // Floor 4, marker 1 ($5k)
const LAST    = GAUNTLET.length - 1;    // 26 — The Architect
const BOSS    = { EXEC: 11, HIERO: 14, SOV: 17, CMDR: 20, EMI: 23, ARCH: 26 };

// Fill order = slot order. Slots 4 and 5 open after The Executive / The Commander.
const LINEUPS = {
  cash:  [doorman, grinder, aceMcgee, closeCall, evenKeel],
  hype:  [lookout, momentum, handicapper, echo, oddCouple],
  mixed: [doorman, aceMcgee, handicapper, momentum, closeCall],
};
const STRATEGIES = {
  pass:    'pass line at max',
  odds1x:  'pass at max + 1× odds',
  maxOdds: 'pass at max + max odds',
};

// ── Levers (the rebalance knobs). Identity = today's game. ──────────────────
const BASE_LEVERS = {
  targetMult:   () => 1,     // × GAUNTLET target, per marker
  maxBetPct:    () => 0.10,  // table max as a share of target, per marker
  additiveMult: () => 1,     // scales the target the crew see → their additives
  vig:          1.2,
  jacket:       () => 1,     // Member's Jacket: extra shooters at this marker
  keepsake:     true,
  covenant:     true,
  poseidon:     true,
  frequencyPct: 0.03,
  bossRules:    true,
  hires:        'slots',     // 'slots' = pay only to fill a new slot; 'floor' = also one hire per floor
  bossVersion:  'current',   // 'legacy' = the Floor 6–8 boss rules before FB-037/038/039
};

const LATE = (m) => m >= 12;   // Floors 5–9
const targetOf = (m, L) => Math.round(GAUNTLET[m].targetCents * L.targetMult(m));
const normalMaxBet = (m, L) => Math.floor(targetOf(m, L) * L.maxBetPct(m));
const minBetOf = (m, L) => Math.max(500, Math.round(normalMaxBet(m, L) / 6 / 500) * 500);
// Legacy Sovereign only: the tide's raised minimum bet (removed in FB-037).
function tideMin(m, L, stage) {
  if (m !== BOSS.SOV || !L.bossRules || L.bossVersion !== 'legacy') return null;
  const mult = [1, 2, 3, 2][stage % 4];
  return mult <= 1 ? null : Math.round(minBetOf(m, L) * mult / 500) * 500;
}
const maxBetOf = (m, L, stage = 0) => {
  const bm = tideMin(m, L, stage);
  return bm === null ? normalMaxBet(m, L) : Math.max(normalMaxBet(m, L), bm * 5);
};

// Current boss parameters, straight from config.
const SOV_PARAMS  = GAUNTLET[BOSS.SOV].boss.ruleParams;    // TIDAL_SURGE
const CMDR_PARAMS = GAUNTLET[BOSS.CMDR].boss.ruleParams;   // ORBITAL_DECAY
const EMI_PARAMS  = GAUNTLET[BOSS.EMI].boss.ruleParams;    // TRANSMISSION_DELAY
if (SOV_PARAMS.rule !== 'TIDAL_SURGE' || !SOV_PARAMS.stageEffects) throw new Error('Sovereign params changed — update the sim');
if (CMDR_PARAMS.rule !== 'ORBITAL_DECAY' || typeof CMDR_PARAMS.bleedPct !== 'number') throw new Error('Commander params changed — update the sim');
if (EMI_PARAMS.rule !== 'TRANSMISSION_DELAY' || typeof EMI_PARAMS.blackoutRolls !== 'number') throw new Error('Emissary params changed — update the sim');
const EMPTY_PACKET = { additives: 0, hype: 0, multipliers: [] };

// Sanity: the identity levers must reproduce the real config helpers.
for (let m = 0; m <= LAST; m++) {
  for (let st = 0; st < 4; st++) {
    const counter = m === BOSS.SOV ? st : 0;
    if (maxBetOf(m, BASE_LEVERS, counter) !== getMaxBet(m, counter)) throw new Error(`maxBet mismatch at ${m}/${st}`);
    if ((tideMin(m, BASE_LEVERS, counter) ?? null) !== getBossMinBet(m, counter)) throw new Error(`tide min mismatch at ${m}/${st}`);
  }
  if (minBetOf(m, BASE_LEVERS) !== getMinBet(m)) throw new Error(`minBet mismatch at ${m}`);
}

// ── One marker ───────────────────────────────────────────────────────────────
// Returns { cleared, bankroll, rolls, shootersUsed, death }.
function playMarker(m, st) {
  const { L, strategy } = st;
  const rules  = L.bossRules;
  const target = targetOf(m, L);
  const crewTarget = Math.round(target * L.additiveMult(m));
  const comps  = st.comps;
  const startShooters = 5 + (comps.jacket ? L.jacket(m) : 0);

  let bankroll = st.bankroll, shooters = startShooters, hype = 1.0, streak = 0;
  let phase = 'COME_OUT', point = null, prevTotal = null, shooterRolls = 0, blankStreak = 0;
  let bets = { passLine: 0, odds: 0, hardways: { ...NO_HARD } };
  let counter = m === BOSS.EXEC && rules ? 2 : 0;   // getBossEntryCounter
  let pending = 0, covenantSpent = false, rolls = 0;
  let transit = EMPTY_PACKET, dark = 0;               // current Emissary: signal in transit, blackout rolls left
  const isBoss = (b) => rules && m === b;
  const legacy = L.bossVersion === 'legacy';

  const end = (cleared, death = null) => ({ cleared, bankroll, rolls, shootersUsed: startShooters - shooters, death });

  for (let guard = 0; guard < 5000; guard++) {
    // ── Bets ──
    if (phase === 'COME_OUT' && bets.passLine === 0) {
      // Bet the normal table max (legacy Sovereign: raised to her tide minimum when it forces it).
      const minBet = (isBoss(BOSS.SOV) ? tideMin(m, L, counter) : null) ?? minBetOf(m, L);
      let maxBet = Math.max(normalMaxBet(m, L), minBet);
      if (legacy && isBoss(BOSS.CMDR) && hype < 0.5) maxBet = Math.floor(maxBet / 2 / 500) * 500;
      if (bankroll < minBet) return end(false, 'broke');
      const stake = Math.min(maxBet, bankroll);
      bankroll -= stake; bets = { ...bets, passLine: stake };
    }
    const tide = isBoss(BOSS.SOV) && !legacy ? getTideStage(SOV_PARAMS, counter).effect : null;
    if (strategy !== 'pass' && tide !== 'DEAD_CALM' && phase === 'POINT_ACTIVE' && bets.odds === 0 && bets.passLine > 0) {
      const mult = strategy === 'maxOdds' ? ODDS[point] : 1;
      const stake = Math.min(bets.passLine * mult, bankroll);
      if (stake > 0) { bankroll -= stake; bets = { ...bets, odds: stake }; }
    }

    // ── Roll ──
    const preHype = hype;
    const slotsActive = legacy && isBoss(BOSS.CMDR) && preHype < 0.75 ? Math.max(1, st.slots - 1) : st.slots;
    const dice = [d6(), d6()];
    let ctx = resolveRoll(dice, {
      phase, currentPoint: point, bets, hype, mechanicFreeze: null,
      previousRollTotal: prevTotal, shooterRollCount: shooterRolls, pointPhaseBlankStreak: blankStreak,
      markerTargetCents: crewTarget, shooters, unlockedSlots: slotsActive,
    });
    const poseidonBlocks = comps.poseidon && L.poseidon && shooterRolls === 0 && ctx.rollResult === 'CRAPS_OUT';
    const tick = ctx.rollResult === 'POINT_HIT' ? getBaseHypeTick(streak)
      : ctx.rollResult === 'NATURAL' ? 0.10
      : ctx.rollResult === 'CRAPS_OUT' && !poseidonBlocks ? -0.05 : 0;
    if (tick !== 0) ctx = { ...ctx, hype: Math.max(1.0, Math.round((ctx.hype + tick) * 10_000) / 10_000) };
    if (poseidonBlocks) {
      ctx = { ...ctx, rollResult: 'NO_RESOLUTION', resolvedBets: { ...ctx.resolvedBets, passLine: ctx.bets.passLine } };
    }
    // Current Emissary: during the blackout the crew don't fire (and cooldowns don't move).
    const signal = isBoss(BOSS.EMI) && !legacy;
    const blackedOut = signal && dark > 0;
    const cascade = resolveCascade(blackedOut ? st.crew.map(() => null) : st.crew, ctx, () => [d6(), d6()]);
    let fc = cascade.finalContext;
    if (!blackedOut) st.crew = cascade.updatedCrewSlots;
    const lastSlot = cascade.events.length > 0 ? (cascade.events[cascade.events.length - 1]?.slotIndex ?? null) : null;

    // Vig → (current Emissary: signal lag) → Load-Bearing → escrow hold
    let add = fc.additives;
    if (comps.vig && add > 0) add = Math.round(add * L.vig / 100) * 100;
    let sent = EMPTY_PACKET;
    if (signal) {
      // What the crew added this roll goes into transit; last roll's packet lands now
      // (a Seven-Out drops it). The base Hype tick isn't crew, so it's never delayed.
      const sevenOutNow = fc.rollResult === 'SEVEN_OUT';
      sent = { additives: add, hype: Math.round((fc.hype - ctx.hype) * 10_000) / 10_000, multipliers: fc.multipliers.slice(ctx.multipliers.length) };
      const landed = sevenOutNow ? EMPTY_PACKET : transit;
      fc = { ...fc, hype: Math.round((ctx.hype + landed.hype) * 10_000) / 10_000, multipliers: [...ctx.multipliers, ...landed.multipliers] };
      add = landed.additives;
      transit = sevenOutNow ? EMPTY_PACKET : sent;
      dark = sevenOutNow ? EMI_PARAMS.blackoutRolls : Math.max(0, dark - 1);
    }
    if (isBoss(BOSS.ARCH) && add > 0) add = Math.floor(add * Math.pow(0.85, counter) / 100) * 100;
    const escrowRule = isBoss(BOSS.HIERO) ? 'hiero' : legacy && isBoss(BOSS.EMI) ? 'emi' : null;
    const held = escrowRule ? add : 0;
    fc = { ...fc, additives: escrowRule ? 0 : add };

    // Settle (+ Executive Exceptional bonus)
    let payout = settleTurn(fc);
    const r = fc.rollResult;
    const bad = r === 'CRAPS_OUT' || r === 'SEVEN_OUT';
    const good = r === 'NATURAL' || r === 'POINT_HIT';
    if (isBoss(BOSS.EXEC)) {
      if (bad && counter === 0) { rolls++; return end(false, 'pip'); }
      if (counter === 4) { const gp = payout - fc.baseStakeReturned; if (gp > 0) payout += Math.round(gp * 0.15 / 100) * 100; }
    }
    bankroll += payout;
    if (comps.frequency && r === 'NATURAL' && phase === 'COME_OUT') {
      bankroll += Math.round(target * L.frequencyPct / 100) * 100;
    }

    // Escrow
    const withHype = (c) => Math.floor(c * fc.hype / 100) * 100;
    if (escrowRule === 'hiero') {
      const offering = pending + held;
      if (r === 'SEVEN_OUT' || good) {
        const pot = withHype(offering);
        bankroll += Math.floor(pot * (r === 'SEVEN_OUT' ? 0.25 : 1) / 100) * 100;
        pending = 0;
      } else pending = offering;
    } else if (escrowRule === 'emi') {
      bankroll += r === 'SEVEN_OUT' ? 0 : pending;
      pending = r === 'SEVEN_OUT' ? 0 : held;
    }

    // Current Sovereign: Undertow — a Seven-Out drags 35% of the bankroll out to sea.
    if (tide === 'UNDERTOW' && r === 'SEVEN_OUT') bankroll -= Math.floor(bankroll * SOV_PARAMS.undertowPct / 100) * 100;

    // ── Advance state ──
    rolls++;
    const sevenOut = r === 'SEVEN_OUT';
    const covenantSaves = sevenOut && comps.covenant && L.covenant && !covenantSpent;
    const lost = tide === 'HIGH_TIDE' ? SOV_PARAMS.waveShooters : 1;   // High Tide drowns 2 (The Covenant cancels it)
    bets = fc.resolvedBets ?? bets;
    prevTotal = fc.diceTotal; shooterRolls++;
    switch (r) {
      case 'POINT_SET':   phase = 'POINT_ACTIVE'; point = fc.diceTotal; blankStreak = 0; hype = fc.hype; break;
      case 'POINT_HIT':   phase = 'COME_OUT'; point = null; streak++; blankStreak = 0; hype = fc.hype; break;
      case 'NATURAL': case 'CRAPS_OUT': hype = fc.hype; blankStreak = 0; break;
      case 'NO_RESOLUTION': if (phase === 'POINT_ACTIVE') blankStreak++; hype = fc.hype; break;
      case 'SEVEN_OUT': {
        const cascadeDelta = Math.max(0, fc.hype - preHype);
        if (legacy && isBoss(BOSS.CMDR)) {
          const decay = preHype >= 2.5 ? 0.80 : preHype >= 1.5 ? 0.60 : 0.40;
          hype = Math.max(0.25, Math.round((preHype - decay + cascadeDelta) * 10_000) / 10_000);
        } else if (isBoss(BOSS.CMDR)) {
          hype = Math.max(1.0, 1.0 + cascadeDelta);   // no Keepsake in his fight
        } else {
          const base = comps.keepsake && L.keepsake ? 1.0 + (preHype - 1.0) / 2 : 1.0;
          hype = Math.max(1.0, base + cascadeDelta);
        }
        phase = 'COME_OUT'; point = null; streak = 0; blankStreak = 0;
        if (covenantSaves) covenantSpent = true;
        else { shooters = Math.max(0, shooters - lost); shooterRolls = 0; prevTotal = null; }
        break;
      }
      default: break;
    }
    if (phase === 'COME_OUT' && r !== 'NO_RESOLUTION') bets = { ...bets, passLine: 0, odds: 0 };

    // Boss counters
    if (isBoss(BOSS.EXEC)) counter = Math.max(0, Math.min(4, counter + (good ? 1 : bad ? -1 : 0)));
    if (isBoss(BOSS.SOV) && (good || bad)) counter = (counter + 1) % 4;   // tide advances per come-out cycle

    // Marker clear: bankroll + chips on the table (returned) ≥ target.
    const onTable = bets.passLine + bets.odds;
    if (bankroll + onTable >= target) {
      bankroll += onTable + (escrowRule === 'hiero' ? withHype(pending) : pending) + transit.additives;
      return end(true);
    }

    // Current Commander: orbital bleed — after a roll that isn't a Seven-Out, hype above 1.0× loses 20%.
    if (!legacy && isBoss(BOSS.CMDR) && !sevenOut && hype > 1.0) {
      hype = Math.round((1 + (hype - 1) * (1 - CMDR_PARAMS.bleedPct)) * 10_000) / 10_000;
    }

    // The Architect: each Seven-Out demolishes the last crew to fire (else the highest occupied slot).
    if (isBoss(BOSS.ARCH) && sevenOut) {
      let idx = lastSlot;
      if (idx === null) for (let i = st.slots - 1; i >= 0; i--) if (st.crew[i]) { idx = i; break; }
      if (idx !== null) st.crew = st.crew.map((c, i) => (i === idx ? null : c));
      counter = Math.min(5, counter + 1);
    }

    if (shooters <= 0) return end(false, 'shooters');
  }
  return end(false, 'guard');
}

// ── A run from marker `from` to `to` ─────────────────────────────────────────
function compsFor(m) {
  // Floors 1–3 are behind us when the run starts on Floor 4.
  return {
    vig: true, jacket: true, keepsake: true,
    boardSeat: m > BOSS.EXEC, covenant: m > BOSS.HIERO, poseidon: m > BOSS.SOV,
    cargo: m > BOSS.CMDR, frequency: m > BOSS.EMI,
  };
}
const slotsFor = (m) => (m > BOSS.CMDR ? 5 : m > BOSS.EXEC ? 4 : 3);
const crewFor = (lineup, slots) => {
  const c = LINEUPS[lineup].slice(0, slots).map((x) => ({ ...x, cooldownState: 0 }));
  while (c.length < 5) c.push(null);
  return c;
};

function runGauntlet({ lineup, strategy, levers = BASE_LEVERS, from = FIRST, to = LAST, startBankroll }) {
  const L = { ...BASE_LEVERS, ...levers };
  const st = {
    L, strategy, bankroll: startBankroll ?? Math.round(targetOf(from - 1, L) * 1.1),
    slots: slotsFor(from), crew: crewFor(lineup, slotsFor(from)), comps: compsFor(from),
  };
  const markers = [];
  for (let m = from; m <= to; m++) {
    // Pub: a newly opened slot is filled (Starter = 2 × the cleared marker's max bet).
    const slots = slotsFor(m);
    const prevTarget = targetOf(m - 1, L);
    if (m > from && slots > st.slots) {
      st.bankroll -= 2 * Math.floor(prevTarget * 0.10);
      const fresh = crewFor(lineup, slots);
      st.crew = st.crew.map((c, i) => c ?? (i < slots ? fresh[i] : null));
      st.slots = slots;
    } else if (m > from && L.hires === 'floor' && (m % 3) === 0) {
      st.bankroll -= 2 * Math.floor(prevTarget * 0.10);
    }
    // The Architect may have demolished crew — refill nothing (it's the last marker anyway).
    st.comps = compsFor(m);
    const arrival = st.bankroll / targetOf(m, L);
    const res = playMarker(m, st);
    markers.push({ m, arrival, ...res });
    st.bankroll = res.bankroll;
    if (!res.cleared) break;
  }
  return { markers, finished: markers.length === to - from + 1 && markers[markers.length - 1].cleared, finalBankroll: st.bankroll };
}

// ── Reporting ────────────────────────────────────────────────────────────────
const N = Number(process.env.SIM_N ?? 4000);
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const quant = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—');
const money = (c) => { const d = c / 100; return d >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `$${(d / 1e3).toFixed(0)}k` : `$${d.toFixed(0)}`; };
const bossName = (m) => GAUNTLET[m].boss?.name ?? '';

function chainStats(opts, n = N) {
  const per = {};
  for (let m = opts.from ?? FIRST; m <= (opts.to ?? LAST); m++) per[m] = { entered: 0, cleared: 0, arrivals: [], rolls: [], shooters: [], deaths: {} };
  let finished = 0; const finals = [];
  for (let i = 0; i < n; i++) {
    const run = runGauntlet(opts);
    for (const r of run.markers) {
      const p = per[r.m]; p.entered++; p.arrivals.push(r.arrival);
      if (r.cleared) { p.cleared++; p.rolls.push(r.rolls); p.shooters.push(r.shootersUsed); }
      else p.deaths[r.death] = (p.deaths[r.death] ?? 0) + 1;
    }
    if (run.finished) { finished++; finals.push(run.finalBankroll); }
  }
  return { per, finished: finished / n, finals, n };
}

function printChain(title, s) {
  console.log(`\n### ${title}`);
  console.log(`Finished the gauntlet: ${pct(s.finished)}` + (s.finals.length ? ` · final bankroll median ${money(median(s.finals))}, p90 ${money(quant(s.finals, 0.9))}, max ${money(Math.max(...s.finals))}` : ''));
  console.log('');
  console.log('| # | Marker | Target | Reached | Clear (given reached) | Median arrival ÷ target | Median rolls | Mean shooters used | Main loss |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [m, p] of Object.entries(s.per)) {
    if (!p.entered) { console.log(`| ${m} | ${bossName(+m) || '—'} | ${money(GAUNTLET[m].targetCents)} | 0% | — | — | — | — | — |`); continue; }
    const shooters = p.shooters.length ? (p.shooters.reduce((a, b) => a + b, 0) / p.shooters.length).toFixed(2) : '—';
    const death = Object.entries(p.deaths).sort((a, b) => b[1] - a[1])[0];
    console.log(`| ${m} | ${bossName(+m) || '—'} | ${money(GAUNTLET[m].targetCents)} | ${pct(p.entered / s.n)} | ${pct(p.cleared / p.entered)} | ${median(p.arrivals).toFixed(2)} | ${median(p.rolls) ?? '—'} | ${shooters} | ${death ? `${death[0]} ${pct(death[1] / p.entered)}` : '—'} |`);
  }
}

function isolatedRow(lineup, strategy, levers, n) {
  const row = {};
  for (let m = FIRST; m <= LAST; m++) {
    let c = 0;
    for (let i = 0; i < n; i++) if (runGauntlet({ lineup, strategy, levers, from: m, to: m }).markers[0].cleared) c++;
    row[m] = c / n;
  }
  return row;
}

function printIsolated(n, levers = BASE_LEVERS) {
  console.log('\n## Isolated markers — arrive with 1.1× the previous target, comps/slots as earned by then');
  console.log('Boss markers show rule-on / rule-off (rule cost in parentheses).\n');
  const ms = []; for (let m = FIRST; m <= LAST; m++) ms.push(m);
  console.log(`| Lineup · bets | ${ms.join(' | ')} |`);
  console.log(`|---|${ms.map(() => '---').join('|')}|`);
  for (const strategy of Object.keys(STRATEGIES)) for (const lineup of Object.keys(LINEUPS)) {
    const on  = isolatedRow(lineup, strategy, levers, n);
    const off = isolatedRow(lineup, strategy, { ...levers, bossRules: false }, n);
    const cells = ms.map((m) => GAUNTLET[m].isBoss
      ? `${(100 * on[m]).toFixed(0)}/${(100 * off[m]).toFixed(0)} (${(100 * (on[m] - off[m])).toFixed(0)})`
      : `${(100 * on[m]).toFixed(0)}`);
    console.log(`| ${lineup} · ${strategy} | ${cells.join(' | ')} |`);
  }
}

// ── Rebalance options ───────────────────────────────────────────────────────
const FLOOR_OF = (m) => Math.floor(m / 3) + 1;
const perFloor = (byFloor) => (m) => byFloor[FLOOR_OF(m)] ?? 1;          // { 5: x, 6: y, … }
const BOSS_ONLY_JACKET = (m) => (!LATE(m) || GAUNTLET[m].isBoss ? 1 : 0);

const OPTIONS = {
  'A · crew-cash taper': {
    note: 'Crew additives scale off a shrinking share of the target: ADDITIVE_MULT × 0.8 / 0.7 / 0.6 / 0.5 / 0.45 on Floors 5–9',
    levers: { additiveMult: perFloor({ 5: 0.8, 6: 0.7, 7: 0.6, 8: 0.5, 9: 0.45 }) },
  },
  'A+ · steeper taper': {
    note: 'As A but × 0.7 / 0.6 / 0.5 / 0.45 / 0.4',
    levers: { additiveMult: perFloor({ 5: 0.7, 6: 0.6, 7: 0.5, 8: 0.45, 9: 0.4 }) },
  },
  'B · comp diet': {
    note: "The Vig +20% → +10%; Member's Jacket's extra shooter only at boss markers from Floor 5",
    levers: { vig: 1.1, jacket: BOSS_ONLY_JACKET },
  },
  'C · steeper targets': {
    note: 'From Floor 5 every target is × 1.2 per marker on top of today (marker 26 → × 15.4, ≈ $924M)',
    levers: { targetMult: (m) => (LATE(m) ? Math.pow(1.2, m - 11) : 1) },
  },
  'C2 · boss targets × 2': {
    note: 'Floor 5–9 boss targets doubled (filler targets unchanged) — pressure concentrated on the boss rooms',
    levers: { targetMult: (m) => (LATE(m) && GAUNTLET[m].isBoss ? 2 : 1) },
  },
  'X · late table max 5%': {
    note: 'From Floor 5 the table max (and min bet) is 5% of the target — shown because it does NOT work',
    levers: { maxBetPct: (m) => (LATE(m) ? 0.05 : 0.10) },
  },
  'R · A + B': {
    note: 'Recommended package: crew-cash taper A + comp diet B',
    levers: { additiveMult: perFloor({ 5: 0.8, 6: 0.7, 7: 0.6, 8: 0.5, 9: 0.45 }), vig: 1.1, jacket: BOSS_ONLY_JACKET },
  },
};

const LATE_MS = []; for (let m = 12; m <= LAST; m++) LATE_MS.push(m);
const BOSS_MS = LATE_MS.filter((m) => GAUNTLET[m].isBoss);

function printOptions(n) {
  console.log('\n## Rebalance options — chained runs from Floor 4');
  console.log('"Finish | F5" = share of runs that reach Floor 5 and go on to beat The Architect. Marker columns = clear rate given reached (boss markers in bold).');
  console.log('"No-rule boss" = the same run with every boss rule switched off: the clear rate a boss rule has to cut into.');
  const combos = [['cash', 'pass'], ['mixed', 'pass'], ['hype', 'pass'], ['mixed', 'odds1x'], ['cash', 'maxOdds']];
  for (const [lineup, strategy] of combos) {
    console.log(`\n### ${lineup} crew · ${STRATEGIES[strategy]}\n`);
    console.log(`| Option | Finish \\| F5 | ${LATE_MS.map((m) => (GAUNTLET[m].isBoss ? `**${m}**` : m)).join(' | ')} | No-rule boss ${BOSS_MS.join('/')} |`);
    console.log(`|---|---|${LATE_MS.map(() => '---').join('|')}|---|`);
    for (const [label, levers] of [['Today', BASE_LEVERS], ...Object.entries(OPTIONS).map(([k, o]) => [k, { ...BASE_LEVERS, ...o.levers }])]) {
      const s  = chainStats({ lineup, strategy, levers }, n);
      const s0 = chainStats({ lineup, strategy, levers: { ...levers, bossRules: false } }, Math.floor(n / 2));
      const at = (x, m) => (x.per[m].entered ? x.per[m].cleared / x.per[m].entered : NaN);
      const reach = s.per[12].entered / s.n;
      const cells = LATE_MS.map((m) => (Number.isFinite(at(s, m)) ? (100 * at(s, m)).toFixed(0) : '—'));
      const base  = BOSS_MS.map((m) => (Number.isFinite(at(s0, m)) ? (100 * at(s0, m)).toFixed(0) : '—'));
      console.log(`| ${label} | ${pct(reach ? s.finished / reach : NaN)} | ${cells.join(' | ')} | ${base.join(' / ')} |`);
    }
  }
  console.log('\nOptions:');
  for (const [k, o] of Object.entries(OPTIONS)) console.log(`- **${k}** — ${o.note}`);
}

// ── Single-lever sensitivity ────────────────────────────────────────────────
const LEVERS = {
  "Member's Jacket off (F5+)":  { jacket: (m) => (LATE(m) ? 0 : 1) },
  'The Vig off':                { vig: 1.0 },
  'The Keepsake off':           { keepsake: false },
  'The Covenant off':           { covenant: false },
  "Poseidon's Favor off":       { poseidon: false },
  'Crew cash × 0.5 (F5+)':      { additiveMult: (m) => (LATE(m) ? 0.5 : 1) },
  'Crew cash off (F5+)':        { additiveMult: (m) => (LATE(m) ? 0 : 1) },
  'Table max 7.5% (F5+)':       { maxBetPct: (m) => (LATE(m) ? 0.075 : 0.10) },
  'Table max 5% (F5+)':         { maxBetPct: (m) => (LATE(m) ? 0.05 : 0.10) },
  'Targets × 1.15 per marker':  { targetMult: (m) => (LATE(m) ? Math.pow(1.15, m - 11) : 1) },
  'Targets × 1.3 per marker':   { targetMult: (m) => (LATE(m) ? Math.pow(1.3, m - 11) : 1) },
  'One extra hire per floor':   { hires: 'floor' },
  'Crew cash × 0.35 (F5+)':     { additiveMult: (m) => (LATE(m) ? 0.35 : 1) },
  'Crew cash × 0.5 + Jacket off (F5+)': { additiveMult: (m) => (LATE(m) ? 0.5 : 1), jacket: (m) => (LATE(m) ? 0 : 1) },
  '4 shooters (F5+)':           { jacket: (m) => (LATE(m) ? -1 : 1) },
  'Crew cash × 0.5 + 4 shooters (F5+)': { additiveMult: (m) => (LATE(m) ? 0.5 : 1), jacket: (m) => (LATE(m) ? -1 : 1) },
  'Boss targets × 2 (F5+)':     { targetMult: (m) => (LATE(m) && GAUNTLET[m].isBoss ? 2 : 1) },
};

function printLevers(n) {
  console.log('\n## Single-lever sensitivity — Finish | F5 (share of runs that reach Floor 5 and beat The Architect)');
  console.log('Last column: the five late boss markers with every boss rule OFF (cash crew · pass line) — the room a boss rule has.\n');
  const combos = [['cash', 'pass'], ['mixed', 'pass'], ['hype', 'pass'], ['mixed', 'odds1x']];
  console.log(`| Lever | ${combos.map(([l, s]) => `${l} · ${s}`).join(' | ')} | No-rule boss ${BOSS_MS.join('/')} |`);
  console.log(`|---|${combos.map(() => '---').join('|')}|---|`);
  for (const [label, lv] of [['Today', {}], ...Object.entries(LEVERS)]) {
    const cells = combos.map(([lineup, strategy]) => {
      const s = chainStats({ lineup, strategy, levers: { ...BASE_LEVERS, ...lv } }, n);
      const reach = s.per[12].entered / s.n;
      return pct(reach ? s.finished / reach : NaN);
    });
    const s0 = chainStats({ lineup: 'cash', strategy: 'pass', levers: { ...BASE_LEVERS, ...lv, bossRules: false } }, n);
    const base = BOSS_MS.map((m) => (s0.per[m].entered ? (100 * s0.per[m].cleared / s0.per[m].entered).toFixed(0) : '—'));
    console.log(`| ${label} | ${cells.join(' | ')} | ${base.join(' / ')} |`);
  }
}

// ── Boss reworks: current vs legacy Floor 6–8 rules ─────────────────────────
function printCompare(n) {
  const LEGACY = { ...BASE_LEVERS, bossVersion: 'legacy' };
  const at = (x, m) => (x.per[m].entered ? x.per[m].cleared / x.per[m].entered : NaN);
  const f = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : '—');
  console.log('\n## Boss reworks — current (FB-037/038/039) vs legacy Floor 6–8 rules');
  console.log('Chained runs: Finish | F5 and clear rate (given reached) at The Sovereign (17), The Commander (20), The Emissary (23).');
  console.log('Isolated: rule cost = clear rate with that boss rule on minus off, arriving with 1.1× the previous target.\n');
  console.log('| Lineup · bets | Finish \\| F5 legacy → current | Sovereign legacy → current | Commander | Emissary | Rule cost Sov legacy → current | Cmdr | Emi |');
  console.log('|---|---|---|---|---|---|---|---|');
  const combos = [['cash', 'pass'], ['mixed', 'pass'], ['hype', 'pass'], ['cash', 'odds1x'], ['mixed', 'odds1x'], ['hype', 'odds1x'], ['cash', 'maxOdds'], ['mixed', 'maxOdds']];
  for (const [lineup, strategy] of combos) {
    const cl = chainStats({ lineup, strategy, levers: LEGACY }, n);
    const cc = chainStats({ lineup, strategy, levers: BASE_LEVERS }, n);
    const fin = (x) => x.finished / (x.per[12].entered / x.n);
    const iso = (lv, m) => {
      let on = 0, off = 0;
      for (let i = 0; i < n; i++) {
        if (runGauntlet({ lineup, strategy, levers: lv, from: m, to: m }).markers[0].cleared) on++;
        if (runGauntlet({ lineup, strategy, levers: { ...lv, bossRules: false }, from: m, to: m }).markers[0].cleared) off++;
      }
      return (100 * (on - off) / n).toFixed(1);
    };
    const pair = (m) => `${f(at(cl, m))} → ${f(at(cc, m))}`;
    const cost = (m) => `${iso(LEGACY, m)} → ${iso(BASE_LEVERS, m)}`;
    console.log(`| ${lineup} · ${strategy} | ${f(fin(cl))} → ${f(fin(cc))} | ${pair(BOSS.SOV)} | ${pair(BOSS.CMDR)} | ${pair(BOSS.EMI)} | ${cost(BOSS.SOV)} | ${cost(BOSS.CMDR)} | ${cost(BOSS.EMI)} |`);
  }
}

const mode = process.argv[2] ?? 'chain';
console.log(`N = ${N} runs per row${process.env.SIM_SEED ? `, seed ${process.env.SIM_SEED}` : ''}. Start: Floor 4 (marker 9) with 1.1× the $4k target, Vig + Jacket + Keepsake, 3 slots.`);
if (mode === 'chain' || mode === 'all') {
  console.log('\n## Chained runs — today\'s rules');
  for (const strategy of Object.keys(STRATEGIES)) for (const lineup of Object.keys(LINEUPS)) {
    printChain(`${lineup} crew · ${STRATEGIES[strategy]}`, chainStats({ lineup, strategy }));
  }
  console.log('\n## Chained runs — boss rules OFF (what the economy does on its own)');
  for (const [lineup, strategy] of [['cash', 'pass'], ['mixed', 'pass'], ['hype', 'pass']]) {
    printChain(`${lineup} crew · ${STRATEGIES[strategy]} · no boss rules`, chainStats({ lineup, strategy, levers: { bossRules: false } }));
  }
}
if (mode === 'isolated' || mode === 'all') printIsolated(Math.max(500, Math.floor(N / 2)));
if (mode === 'levers'   || mode === 'all') printLevers(Math.floor(N / 2));
if (mode === 'options'  || mode === 'all') printOptions(N);
if (mode === 'compare'  || mode === 'all') printCompare(N);
