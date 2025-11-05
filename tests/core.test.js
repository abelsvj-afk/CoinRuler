const assert = require('assert');
const { monteCarloSimulation, computeBaselineFromDeposits } = require('../lib/core');

function testMonteCarlo() {
  const portfolio = { BTC: 0.01, XRP: 100, USDC: 1000, _prices: { BTC: 50000, XRP: 1 } };
  const outcomes = monteCarloSimulation(portfolio, 100);
  assert.ok(Array.isArray(outcomes), 'outcomes should be array');
  assert.strictEqual(outcomes.length, 100);
  const mean = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
  assert.ok(mean > 0, 'mean should be positive');
  console.log('monteCarloSimulation test passed');
}

function testComputeBaseline() {
  const deposits = [ { coin: 'XRP', amount: 5 }, { coin: 'XRP', amount: 3 } ];
  const baseline = computeBaselineFromDeposits(deposits, 'XRP');
  // minimum 10 XRP enforced by computeBaselineFromDeposits
  assert.strictEqual(baseline, 10);
  const btcDeposits = [ { coin: 'BTC', amount: 0.001 }, { coin: 'BTC', amount: 0.002 } ];
  const btcBaseline = computeBaselineFromDeposits(btcDeposits, 'BTC');
  assert.strictEqual(btcBaseline, 0.003);
  console.log('computeBaselineFromDeposits test passed');
}

function runAll() {
  testMonteCarlo();
  testComputeBaseline();
  console.log('All core tests passed');
}

runAll();
