// Monte Carlo simulation for portfolio risk analysis
import { PortfolioSnapshot, MonteCarloResult } from './types';

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

export function monteCarloSimulation(
  portfolio: PortfolioSnapshot = {},
  sims = 1000,
  days = 30
): MonteCarloResult {
  const coins = Object.keys(portfolio).filter(c => c && c !== '_prices');
  const prices = (portfolio._prices && typeof portfolio._prices === 'object') ? portfolio._prices : {};

  const startPrices: { [coin: string]: number } = {};
  for (const c of coins) {
    startPrices[c] = typeof prices[c] === 'number' && prices[c] > 0 ? prices[c] : (DEFAULT_PRICES[c] || 1);
  }

  if (!coins.length) {
    return { outcomes: [], mean: 0, median: 0, percentile_5: 0, percentile_95: 0 };
  }

  const results = new Array(sims);
  const dailyMu = 0;
  const dailySigma = 0.02;

  for (let i = 0; i < sims; i++) {
    let total = 0;
    for (const c of coins) {
      const amount = Number(portfolio[c]) || 0;
      let simulatedPrice = startPrices[c] || 1;
      
      for (let d = 0; d < days; d++) {
        const z = randn_bm();
        simulatedPrice = simulatedPrice * Math.exp(dailyMu - (dailySigma * dailySigma) / 2 + dailySigma * z);
      }
      total += simulatedPrice * amount;
    }
    results[i] = total;
  }

  const sorted = results.slice().sort((a, b) => a - b);
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const median = sorted[Math.floor(sims / 2)];
  const percentile_5 = sorted[Math.floor(sims * 0.05)];
  const percentile_95 = sorted[Math.floor(sims * 0.95)];

  return { outcomes: results, mean, median, percentile_5, percentile_95 };
}
