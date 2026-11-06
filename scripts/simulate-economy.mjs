// Deterministic model of virtual currency. No network, advertising or purchase SDK.
import { writeFileSync, mkdirSync } from 'node:fs';
let seed = 20261106;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const scenarios = [
  { name: 'Modéré', claimRate: 0.25, betsPerDay: 1 },
  { name: 'Régulier', claimRate: 0.6, betsPerDay: 3 },
  { name: 'Assidu', claimRate: 0.95, betsPerDay: 8 },
];
const reports = scenarios.map((scenario) => {
  const balances = Array(1000).fill(0);
  let issued = 0,
    staked = 0,
    paid = 0,
    tickets = 0,
    starved = 0;
  for (let day = 0; day < 30; day++)
    for (let player = 0; player < 1000; player++) {
      if (random() < scenario.claimRate) {
        balances[player] += 500;
        issued += 500;
      }
      for (let bet = 0; bet < scenario.betsPerDay; bet++) {
        if (balances[player] < 100) {
          starved++;
          break;
        }
        // An illustrative fair 50/50 outcome with 1.90 decimal quote; not calibrated to real players.
        balances[player] -= 100;
        staked += 100;
        tickets++;
        if (random() < 0.5) {
          balances[player] += 190;
          paid += 190;
        }
      }
    }
  balances.sort((a, b) => a - b);
  return {
    ...scenario,
    players: 1000,
    days: 30,
    issuedVerse: issued,
    stakesVerse: staked,
    payoutsVerse: paid,
    tickets,
    blockedForBalance: starved,
    circulationVerse: balances.reduce((a, b) => a + b, 0),
    medianBalance: balances[500],
    p95Balance: balances[950],
    accountingValid: balances.reduce((a, b) => a + b, 0) === issued - staked + paid,
  };
});
const report = {
  seed: 20261106,
  assumptions:
    '1000 synthetic players, 30 days, bonus 500 V/24h, stake 100 V, win probability .5 and quote1.90; virtual currency only. Illustrative behavior, not a revenue forecast.',
  scenarios: reports,
  revenue: {
    enabled: false,
    monthlyEuros: 0,
    breakEvenFormula:
      'monthlyOperatingCost / netMonthlyRevenuePerActivePlayer; undefined while revenue per player is zero',
  },
};
mkdirSync('docs/economy', { recursive: true });
writeFileSync('docs/economy/simulation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
