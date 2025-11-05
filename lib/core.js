/**
 * Minimal Monte Carlo simulation helper for the project.
 * Exports monteCarloSimulation(portfolio, sims = 1000, days = 30)
 *
 * This is a safety-first, deterministic-ish implementation used to
 * satisfy runtime imports and provide basic projections.
 */
const DEFAULT_PRICES = {
  BTC: 30000,
  ETH: 2000,
  XRP: 0.5,
  USDC: 1,
};

function randn_bm() {
  // Box–Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function monteCarloSimulation(portfolio = {}, sims = 1000, days = 30) {
  // Build starting USD value and per-coin starting prices
  const coins = Object.keys(portfolio).filter(c => c && c !== '_prices');
  const prices = (portfolio._prices && typeof portfolio._prices === 'object') ? portfolio._prices : {};

  const startPrices = {};
  for (const c of coins) {
    startPrices[c] = typeof prices[c] === 'number' && prices[c] > 0 ? prices[c] : (DEFAULT_PRICES[c] || 1);
  }

  // If no coins, return an array of zeros so callers can safely reduce it
  if (!coins.length) return new Array(sims).fill(0);

  const results = new Array(sims);
  // Simple daily return model: mean 0, sd 0.02 (2%) per day
  const dailyMu = 0;
  const dailySigma = 0.02;

  for (let i = 0; i < sims; i++) {
    let total = 0;
    for (const c of coins) {
      const amount = Number(portfolio[c]) || 0;
      let price = startPrices[c] || 1;
      // Simulate geometric Brownian motion over `days`
      let simulatedPrice = price;
      for (let d = 0; d < days; d++) {
        const z = randn_bm();
        // Euler discretization of GBM
        simulatedPrice = simulatedPrice * Math.exp(dailyMu - (dailySigma * dailySigma) / 2 + dailySigma * z);
      }
      total += simulatedPrice * amount;
    }
    results[i] = total;
  }
  return results;
}

module.exports = { monteCarloSimulation };
/**
 * Core pure helpers for CoinRuler
 */
function monteCarloSimulation(portfolio, simulations = 1000) {
  const MONTE_CARLO_SIMULATIONS = simulations;
  let outcomes = [];
  for (let i = 0; i < MONTE_CARLO_SIMULATIONS; i++) {
    const btcVol = (Math.random() - 0.5) * 0.2; // ±10%
    const xrpVol = (Math.random() - 0.5) * 0.3; // ±15%
    let btcSim = (portfolio.BTC || 0) * (1 + btcVol);
    let xrpSim = (portfolio.XRP || 0) * (1 + xrpVol);
    let usdSim = portfolio.USDC || 0; // Stable
    const btcPrice = portfolio._prices && portfolio._prices.BTC ? portfolio._prices.BTC : 50000;
    const xrpPrice = portfolio._prices && portfolio._prices.XRP ? portfolio._prices.XRP : 1;
    outcomes.push(btcSim * btcPrice + xrpSim * xrpPrice + usdSim);
  }
  return outcomes;
}

function computeBaselineFromDeposits(deposits, coin, baselineMin = 0) {
  // deposits: array of { coin, amount }
  const total = deposits.filter(d => d.coin === coin).reduce((s, d) => s + (d.amount || 0), 0);
  if (coin === 'XRP') return Math.max(total, Math.max(baselineMin, 10));
  return Math.max(total, baselineMin);
}

module.exports = {
  monteCarloSimulation,
  computeBaselineFromDeposits,
};
