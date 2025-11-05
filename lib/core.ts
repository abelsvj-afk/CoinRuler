// TypeScript migration of core.js (Monte Carlo simulation)
export interface Portfolio {
  [coin: string]: number | { [coin: string]: number } | undefined;
  _prices?: { [coin: string]: number };
}

const DEFAULT_PRICES: { [coin: string]: number } = {
  BTC: 30000,
  ETH: 2000,
  XRP: 0.5,
  USDC: 1,
};

function randn_bm(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function monteCarloSimulation(portfolio: Portfolio = {}, sims = 1000, days = 30): number[] {
  const coins = Object.keys(portfolio).filter(c => c && c !== '_prices');
  const prices = (portfolio._prices && typeof portfolio._prices === 'object') ? portfolio._prices : {};
  const startPrices: { [coin: string]: number } = {};
  for (const c of coins) {
    startPrices[c] = typeof prices[c] === 'number' && prices[c] > 0 ? prices[c] : (DEFAULT_PRICES[c] || 1);
  }
  if (!coins.length) return new Array(sims).fill(0);
  const results = new Array(sims);
  const dailyMu = 0;
  const dailySigma = 0.02;
  for (let i = 0; i < sims; i++) {
    let total = 0;
    for (const c of coins) {
      const amount = Number(portfolio[c]) || 0;
      let price = startPrices[c] || 1;
      let simulatedPrice = price;
      for (let d = 0; d < days; d++) {
        const z = randn_bm();
        simulatedPrice = simulatedPrice * Math.exp(dailyMu - (dailySigma * dailySigma) / 2 + dailySigma * z);
      }
      total += simulatedPrice * amount;
    }
    results[i] = total;
  }
  return results;
}
