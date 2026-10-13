// FB-032 tuning tool — run: node scripts/sim/foreman-payoff-sim.mjs
// Monte Carlo of The Foreman fight (old $200-bankroll rule vs Payoff amounts)
// carried into Floor 2 Marker 1. Crew-less baseline, flat max pass-line bet;
// trust the comparison between rules, not the absolute percentages.
// Mirrors game rules: hype ticks before payout, 20% tax on amplified profit
// (rounded to the dollar), 5 shooters, $5 min bet, max bet = 10% of target.
// Carry each Foreman clear into Floor 2 Marker 1 ($300 target, $30 max, no tax,
// fresh 5 shooters + hype 1.0) and report end-to-end survival.
const d6 = () => 1 + Math.floor(Math.random() * 6);
function play({ start, target, maxBet, tax, clearRule }) {
  let bankroll = start, shooters = 5, hype = 1.0, streak = 0, cut = 0;
  const clears = () => clearRule === 'bank' ? bankroll >= target : cut >= clearRule;
  const win = (stake) => {
    const amp = Math.floor(stake * hype);
    const t = tax ? Math.round((amp * tax) / 100) * 100 : 0;
    cut += t; bankroll += amp - t;
  };
  while (true) {
    if (shooters <= 0 || bankroll < 500) return { cleared: false, bankroll };
    const bet = Math.min(maxBet, bankroll); bankroll -= bet;
    let s = d6() + d6();
    if (s === 7 || s === 11) { hype += 0.10; bankroll += bet; win(bet); }
    else if (s === 2 || s === 3 || s === 12) { hype = Math.max(1, hype - 0.05); }
    else { const pt = s; while (true) { s = d6() + d6();
      if (s === pt) { hype += 0.15 + 0.05 * Math.min(streak, 3); streak++; bankroll += bet; win(bet); break; }
      if (s === 7) { shooters--; hype = 1.0; streak = 0; break; } } }
    if (clears()) return { cleared: true, bankroll };
  }
}
const N = 200_000, $ = (c) => `$${Math.round(c / 100)}`;
for (const start of [10_000, 12_000]) {
  console.log(`\n=== Arrive at the Foreman with ${$(start)} ===`);
  console.log('rule              Foreman clear   F2-M1 clear (if reached)   through both');
  for (const rule of ['bank', 2_000, 2_500, 3_000, 3_500]) {
    let fc = 0, both = 0;
    for (let i = 0; i < N; i++) {
      const f = play({ start, target: 20_000, maxBet: 2_000, tax: 0.20, clearRule: rule });
      if (!f.cleared) continue; fc++;
      const m = play({ start: f.bankroll, target: 30_000, maxBet: 3_000, tax: 0, clearRule: 'bank' });
      if (m.cleared) both++;
    }
    const label = rule === 'bank' ? 'old ($200 bank)' : `Payoff ${$(rule)}`;
    console.log(`${label.padEnd(16)}  ${(100*fc/N).toFixed(1).padStart(6)}%        ${(100*both/fc).toFixed(1).padStart(6)}%                  ${(100*both/N).toFixed(1).padStart(5)}%`);
  }
}
