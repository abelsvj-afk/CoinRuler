// Read-only account summary helper
// - If full authenticated Coinbase credentials are present this would attempt to use them.
// - Otherwise it builds a safe summary from DB deposits and public spot prices.
try { require('dotenv').config(); } catch (e) {}
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { monteCarloSimulation } = require('./lib/core');

const MONGODB_URI = process.env.MONGODB_URI || null;
const DATABASE_NAME = process.env.DATABASE_NAME || 'cryptoAdvisorUltimate';

async function fetchSpotPrice(symbol) {
  try {
    const res = await axios.get(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`);
    return parseFloat(res.data.data.amount);
  } catch (err) {
    console.warn('Price fetch failed for', symbol, err && err.message ? err.message : err);
    return null;
  }
}

async function buildPortfolioFromDeposits(db) {
  const deposits = db ? db.collection('deposits') : null;
  const portfolio = {};
  if (!deposits) return portfolio;
  try {
    const rows = await deposits.find().toArray();
    for (const r of rows) {
      const c = (r.coin || '').toUpperCase();
      const amt = Number(r.amount) || 0;
      portfolio[c] = (portfolio[c] || 0) + amt;
    }
  } catch (err) {
    console.warn('Could not read deposits to build portfolio:', err && err.message ? err.message : err);
  }
  return portfolio;
}

async function run() {
  console.log('Account summary - read-only (DRY).');
  let client = null;
  let db = null;
  if (MONGODB_URI) {
    try {
      client = await MongoClient.connect(MONGODB_URI);
      db = client.db(DATABASE_NAME);
      console.log('Connected to MongoDB.');
    } catch (err) {
      console.warn('Mongo connect failed:', err && err.message ? err.message : err);
      db = null;
    }
  } else {
    console.log('No MONGODB_URI provided — falling back to public price-only summary.');
  }

  // Prefer the latest persisted portfolio snapshot (the bot writes these).
  let portfolio = {};
  try {
    const latest = db ? await db.collection('portfolioSnapshots').find().sort({ timestamp: -1 }).limit(1).toArray() : [];
    if (latest && latest.length) {
      portfolio = latest[0].portfolio || {};
      console.log('Using latest portfolioSnapshot from DB.');
    } else {
      // Try to build a portfolio from deposits (safe, read-only)
      portfolio = await buildPortfolioFromDeposits(db);
      if (!Object.keys(portfolio).length) {
        console.log('No deposits/snapshots found in DB. Using fallback mock portfolio.');
        portfolio.BTC = 0.002;
        portfolio.XRP = 15;
        portfolio.ETH = 0.1;
        portfolio.USDC = 500;
      }
    }
  } catch (err) {
    console.warn('Error while attempting to read portfolioSnapshot:', err && err.message ? err.message : err);
    portfolio = await buildPortfolioFromDeposits(db);
  }

  // Fetch prices for coins present
  const coins = Object.keys(portfolio).filter(Boolean);
  const prices = {};
  for (const c of coins) {
    const p = await fetchSpotPrice(c);
    prices[c] = p;
  }

  // Compute USD values
  let totalUsd = 0;
  const breakdown = [];
  for (const c of coins) {
    const amt = portfolio[c] || 0;
    const price = prices[c] || 0;
    const usd = amt * price;
    totalUsd += usd;
    breakdown.push({ coin: c, amount: amt, price, usd });
  }

  console.log('Portfolio breakdown:');
  for (const b of breakdown) {
    console.log(`- ${b.coin}: ${b.amount} @ ${b.price || 'N/A'} USD => ${b.usd ? b.usd.toFixed(2) : 'N/A'} USD`);
  }
  console.log('Estimated total USD value:', totalUsd.toFixed(2));

  // Run Monte Carlo based on this portfolio
  try {
    const mc = monteCarloSimulation(portfolio, 500);
    const mean = mc.reduce((a, b) => a + b, 0) / mc.length;
    console.log('Monte Carlo mean portfolio value (sample 500 sims):', Math.round(mean));
  } catch (err) {
    console.warn('Monte Carlo simulation failed:', err && err.message ? err.message : err);
  }

  if (client) await client.close();
}

run().catch(err => { console.error('account_summary error:', err && err.stack ? err.stack : err); process.exit(1); });
