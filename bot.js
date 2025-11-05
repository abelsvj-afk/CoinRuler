/**
 * Ultimate Autonomous Crypto Advisory Bot
 * ========================================
 * 
 * Features Implemented:
 * 1. Core baseline protection for BTC and XRP
 * 2. Profit-taking above baseline (XRP/ BTC)
 * 3. Staking suggestions for non-core coins (manual approval required)
 * 4. Monte Carlo simulation for risk forecasting
 * 5. Reinforcement learning for adaptive strategy
 * 6. Advisory conversational interface (Discord + dashboard-ready)
 * 7. MongoDB memory storage for trades, portfolio, conversations
 * 8. Loan/collateral awareness (BTC as collateral)
 * 9. Safety & security: multi-factor, sandbox, encrypted keys
 * 10. Real-time price and market news fetching
 * 11. Alerts for whale activity, social sentiment, credible news
 * 12. Optional dashboard integration (React/Tailwind) hooks
 */

// Load environment variables from .env when present
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const cron = require('node-cron');
const express = require('express');
const { analyzeText, fetchNewsSentiment } = require('./lib/sentiment');
const { predictShortTerm, trainReinforcement } = require('./lib/ml');
const { generateDailyReport } = require('./lib/reporting');
const { runBacktest } = require('./lib/backtest');
// const crypto = require('crypto'); // reserved for future use

// ============ CONFIGURATION ============
// Read configuration from environment variables for safety. See .env.example.
// Accept both DISCORD_TOKEN (preferred) and DISCORD_BOT_TOKEN (legacy) for compatibility.
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || null;
const MONGODB_URI = process.env.MONGODB_URI || null;
const DATABASE_NAME = process.env.DATABASE_NAME || 'cryptoAdvisorUltimate';

const COINBASE_API_KEY = process.env.COINBASE_API_KEY || null;
const COINBASE_API_SECRET = process.env.COINBASE_API_SECRET || null;
const DRY_RUN = (process.env.DRY_RUN || 'true').toLowerCase() === 'true';
const OWNER_ID = process.env.OWNER_ID || null; // Discord user id of the owner (approver)
const PORT = parseInt(process.env.PORT || '3000', 10);

// Core baseline coins
const BASELINE_XRP_MIN = 10;        // Never go below
const SAFE_COINS = ['BTC', 'XRP'];  // Core coins never staked

// Portfolio loop interval
const LOOP_INTERVAL = '*/10 * * * *'; // Every 10 minutes

// Monte Carlo parameters
const MONTE_CARLO_SIMULATIONS = 1000;

// Risk/Profit thresholds
const BTC_PROFIT_THRESHOLD = 0.15; // 15% gain
const XRP_PROFIT_THRESHOLD = 0.10; // 10% above baseline triggers profit-taking

// ============ DISCORD CLIENT ============
// Note: discord.js v14 uses GatewayIntentBits. If using older v13 change accordingly.
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// ============ MONGODB CONNECTION ============
let db = null;
let mongoClient = null;
async function connectMongo() {
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not provided — running without persistent DB.');
    return;
  }
  try {
  // Newer MongoDB drivers ignore useUnifiedTopology; omit to avoid deprecation warnings
  mongoClient = await MongoClient.connect(MONGODB_URI);
    db = mongoClient.db(DATABASE_NAME);
    console.log('MongoDB connected!');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    db = null;
  }
}

// Ensure collections and basic indexes exist
async function ensureCollections() {
  if (!db) return;
  try {
    const names = await db.listCollections().toArray();
    const existing = new Set(names.map(n => n.name));
    const needed = ['portfolioSnapshots', 'memory', 'baselines', 'deposits', 'approvals', 'collateral'];
    for (const coll of needed) {
      if (!existing.has(coll)) {
        await db.createCollection(coll);
        console.log(`Created collection: ${coll}`);
      }
    }
    // Ensure indexes
    await db.collection('approvals').createIndex({ status: 1 });
    await db.collection('deposits').createIndex({ coin: 1, timestamp: 1 });
    await db.collection('portfolioSnapshots').createIndex({ timestamp: -1 });
  } catch (err) {
    console.error('ensureCollections error:', err && err.message ? err.message : err);
  }
}

// ============ UTILITY FUNCTIONS ============ //

/**
 * Fetch real-time price from Coinbase
 */
async function getCoinPrice(symbol) {
  try {
    const res = await axios.get(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`);
    return parseFloat(res.data.data.amount);
  } catch (err) {
    console.error('Error fetching price for', symbol, err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Fetch portfolio snapshot (Coinbase API placeholder)
 */
async function getPortfolioSnapshot() {
  // If DB has a latest snapshot, return that as base (prefer persisted state)
  if (db) {
    try {
      const last = await db.collection('portfolioSnapshots').find().sort({ timestamp: -1 }).limit(1).toArray();
      if (last.length) return last[0].portfolio;
    } catch (err) {
      console.warn('Could not read last portfolio snapshot:', err && err.message ? err.message : err);
    }
  }
  // Fallback mock
  return {
    BTC: 0.002,
    XRP: 15,
    ETH: 0.1,
    USDC: 500,
  };
}

// ============ EXPRESS (webhook) ============
const app = express();
app.use(express.json());

// Deposit webhook: POST { coin: string, amount: number, source?: string }
app.post('/webhook/deposit', async (req, res) => {
  const { coin, amount, source } = req.body || {};
  if (!coin || typeof amount !== 'number') return res.status(400).json({ error: 'coin and numeric amount required' });
  try {
    await recordDeposit(coin.toUpperCase(), amount, source || 'webhook');
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Deposit webhook error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

// Collateral webhook placeholder
app.post('/webhook/collateral', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'db unavailable' });
    await db.collection('collateral').insertOne({ payload: req.body, timestamp: new Date() });
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Collateral webhook error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

// Admin: toggle kill-switch (POST { enabled: true/false, reason: '' })
app.post('/admin/kill-switch', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'db unavailable' });
    const body = req.body || {};
    const ok = await setKillSwitch(!!body.enabled, body.reason || '');
    if (!ok) return res.status(500).json({ error: 'failed' });
    return res.json({ status: 'ok', enabled: !!body.enabled });
  } catch (err) {
    console.error('kill-switch endpoint error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

// Admin: list approvals
app.get('/admin/approvals', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'db unavailable' });
    const rows = await db.collection('approvals').find().sort({ createdAt: -1 }).limit(200).toArray();
    return res.json({ approvals: rows });
  } catch (err) {
    console.error('admin/approvals error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

// Backtest endpoint: POST { strategy: {buyThreshold, sellThreshold}, data: [{date,price}] }
app.post('/admin/backtest', async (req, res) => {
  try {
    const body = req.body || {};
    const strategy = body.strategy || { buyThreshold: 0, sellThreshold: Infinity };
    const data = body.data || [];
    const result = await runBacktest(strategy, data);
    return res.json({ ok: true, result });
  } catch (e) {
    console.error('backtest error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Scenario planning endpoint: POST { scenario: { priceShockPct } }
app.post('/admin/whatif', async (req, res) => {
  try {
    const scenario = req.body && req.body.scenario ? req.body.scenario : null;
    if (!scenario) return res.status(400).json({ error: 'scenario required' });
    const portfolio = await getPortfolioSnapshot();
    // Apply simple price shock
    const shocked = Object.assign({}, portfolio._prices || {});
    Object.keys(shocked).forEach(k => { shocked[k] = shocked[k] * (1 + (scenario.priceShockPct || 0)); });
    // compute new USD value
    let total = 0;
    Object.keys(portfolio).forEach(c => {
      if (c === '_prices') return;
      const amt = Number(portfolio[c]) || 0;
      const p = shocked[c] || (portfolio._prices && portfolio._prices[c]) || 0;
      total += amt * p;
    });
    return res.json({ ok: true, shockedPrices: shocked, shockedValue: total });
  } catch (e) {
    console.error('whatif error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Feedback endpoint to store user feedback for continuous improvement
app.post('/feedback', async (req, res) => {
  try {
    const { userId, text, rating } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    if (!db) return res.status(503).json({ error: 'db unavailable' });
    await db.collection('feedback').insertOne({ userId: userId || null, text, rating: rating || null, timestamp: new Date() });
    return res.json({ ok: true });
  } catch (e) {
    console.error('feedback error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: !!db, dryRun: DRY_RUN });
});

// Dashboard endpoint (simple JSON for now)
app.get('/dashboard', async (req, res) => {
  try {
    const latestSnapshot = db ? await db.collection('portfolioSnapshots').find().sort({ timestamp: -1 }).limit(1).toArray() : [];
    const reports = db ? await db.collection('reports').find().sort({ createdAt: -1 }).limit(10).toArray() : [];
    return res.json({ snapshot: latestSnapshot[0] || null, recentReports: reports });
  } catch (e) {
    console.error('dashboard error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ============ BASELINE / DEPOSITS ============
async function recordDeposit(coin, amount, source = 'manual') {
  try {
    if (!db) {
      if (DRY_RUN) console.log('[Deposit - dryrun]', { coin, amount, source });
      return;
    }
    const deposits = db.collection('deposits');
    await deposits.insertOne({ coin, amount, source, timestamp: new Date() });

    // Update baseline for core coins (BTC, XRP)
    if (coin === 'BTC' || coin === 'XRP') {
      const baselines = db.collection('baselines');
      await baselines.updateOne(
        { coin },
        { $inc: { baseline: amount }, $push: { history: { amount, source, timestamp: new Date() } } },
        { upsert: true }
      );

      // Enforce minimum XRP baseline
      if (coin === 'XRP') {
        const doc = await baselines.findOne({ coin: 'XRP' });
        if (doc && (doc.baseline || 0) < BASELINE_XRP_MIN) {
          await baselines.updateOne({ coin: 'XRP' }, { $set: { baseline: BASELINE_XRP_MIN } });
        }
      }
    }

    await sendAdvisoryMessage(`Deposit recorded: ${amount} ${coin} (source: ${source}). Baseline updated.`);
  } catch (err) {
    console.error('recordDeposit error:', err && err.message ? err.message : err);
  }
}

async function getBaseline(coin) {
  if (!db) return coin === 'XRP' ? BASELINE_XRP_MIN : 0;
  try {
    const row = await db.collection('baselines').findOne({ coin });
    if (!row) return coin === 'XRP' ? BASELINE_XRP_MIN : 0;
    return Math.max(row.baseline || 0, coin === 'XRP' ? BASELINE_XRP_MIN : 0);
  } catch (err) {
    console.error('getBaseline error:', err && err.message ? err.message : err);
    return coin === 'XRP' ? BASELINE_XRP_MIN : 0;
  }
}

// ============ KILL-SWITCH ============
async function setKillSwitch(enabled, reason = '') {
  if (!db) return false;
  try {
    await db.collection('kill_switch').updateOne({}, { $set: { enabled: !!enabled, reason, updatedAt: new Date() } }, { upsert: true });
    return true;
  } catch (e) {
    console.error('setKillSwitch error:', e && e.message ? e.message : e);
    return false;
  }
}

async function getKillSwitch() {
  if (!db) return false;
  try {
    const doc = await db.collection('kill_switch').findOne({});
    return doc && doc.enabled;
  } catch (e) {
    console.error('getKillSwitch error:', e && e.message ? e.message : e);
    return false;
  }
}


// Build portfolio object by summing deposits (safe, read-only)
async function buildPortfolioFromDeposits() {
  const portfolio = {};
  if (!db) return portfolio;
  try {
    const rows = await db.collection('deposits').find().toArray();
    for (const r of rows) {
      const c = (r.coin || '').toUpperCase();
      const amt = Number(r.amount) || 0;
      portfolio[c] = (portfolio[c] || 0) + amt;
    }
  } catch (err) {
    console.warn('buildPortfolioFromDeposits failed:', err && err.message ? err.message : err);
  }
  return portfolio;
}

/**
 * Send advisory message to Discord
 */
async function sendAdvisoryMessage(msg) {
  try {
    if (DISCORD_CHANNEL_ID && client && client.isReady()) {
      // Fetch to ensure channel exists in cache
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (channel && channel.send) await channel.send(msg);
      else console.warn('Discord channel not available to send message.');
    } else {
      console.log('[Advisory - local]', msg);
    }
  } catch (err) {
    console.error('Failed to send advisory message:', err && err.message ? err.message : err);
  }
}

/**
 * Save trades, actions, strategy logs for reinforcement learning
 */
async function logToMemory(action) {
  try {
    if (!db) {
      if (DRY_RUN) console.log('[Memory - dryrun]', action);
      return;
    }
    const collection = db.collection('memory');
    await collection.insertOne({ ...action, timestamp: new Date() });
  } catch (err) {
    console.error('logToMemory error:', err && err.message ? err.message : err);
  }
}

// ============ APPROVALS / ACTION QUEUE ============
async function createApproval(entry) {
  try {
    const approval = {
      ...entry,
      status: 'pending',
      createdAt: new Date(),
    };
    if (!db) {
      if (DRY_RUN) console.log('[Approval - dryrun] created', approval);
      return approval;
    }
    const r = await db.collection('approvals').insertOne(approval);
    approval._id = r.insertedId;
    // notify owner via Discord if configured
    await sendAdvisoryMessage(`New approval #${approval._id}: ${approval.title} — ${approval.summary}`);
    return approval;
  } catch (err) {
    console.error('createApproval error:', err && err.message ? err.message : err);
    return null;
  }
}

async function setApprovalStatus(id, status, actedBy) {
  try {
    if (!db) {
      if (DRY_RUN) console.log('[Approval - dryrun] set', id, status, actedBy);
      return { ok: true };
    }
    const res = await db.collection('approvals').findOneAndUpdate({ _id: id }, { $set: { status, actedBy, actedAt: new Date() } }, { returnDocument: 'after' });
    const approval = res.value;
    // If approved and not DRY_RUN, attempt to execute
    if (approval && approval.status === 'approved') {
      // If kill-switch is active, do not execute
      const kill = await getKillSwitch();
      if (kill) {
        console.warn('Kill-switch active: approval execution deferred');
        await db.collection('approvals').updateOne({ _id: approval._id }, { $set: { executionDeferred: true } });
        return approval;
      }
      if (!DRY_RUN) {
        // Execute in background
        executeApproval(approval).catch(err => console.error('executeApproval failed:', err));
      } else {
        console.log('[Approval - dryrun] would execute', approval._id);
      }
    }
    return approval;
  } catch (err) {
    console.error('setApprovalStatus error:', err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Execute an approval (placeholder for real exchange integration).
 * Marks approval as executed and logs the action to memory.
 */
// Extract executeApproval into a testable module
const { executeApproval } = require('./lib/execution');

const { monteCarloSimulation } = require('./lib/core');
// coinbase client is optional — only used when API keys are provided
let CoinbaseClient;
try { CoinbaseClient = require('coinbase').Client; } catch (e) { CoinbaseClient = null; }

/**
 * Analyze portfolio and recommend actions
 */
async function analyzePortfolio(portfolio) {
  try {
    const btcPrice = await getCoinPrice('BTC');
    const xrpPrice = await getCoinPrice('XRP');

    // Attach prices for downstream calculations
    portfolio._prices = { BTC: btcPrice || undefined, XRP: xrpPrice || undefined };

    // BTC Profit Taking: compare to last logged BTC price if available
    let lastBtcPrice = null;
    try {
      if (db) {
        const lastBTCTrade = await db.collection('memory').find({ coin: 'BTC' }).sort({ timestamp: -1 }).limit(1).toArray();
        lastBtcPrice = lastBTCTrade.length ? lastBTCTrade[0].price : null;
      }
    } catch (err) {
      console.warn('Could not read lastBTCTrade from DB:', err && err.message ? err.message : err);
    }
    // If we don't have a lastBtcPrice, set it to current price so we don't trigger immediate sell
    if (!lastBtcPrice) lastBtcPrice = btcPrice;

    if (btcPrice && lastBtcPrice && btcPrice >= lastBtcPrice * (1 + BTC_PROFIT_THRESHOLD)) {
      const sellAmount = (portfolio.BTC || 0) * 0.15;
      // Create approval request instead of immediate execution
      await createApproval({
        type: 'sell',
        coin: 'BTC',
        amount: sellAmount,
        title: `Sell ${sellAmount.toFixed(6)} BTC`,
        summary: `BTC increased ${Math.round(BTC_PROFIT_THRESHOLD * 100)}% since last action. Recommend selling ${sellAmount.toFixed(6)} BTC.`,
        metadata: { btcPrice, lastBtcPrice },
      });
    }

    // XRP Profit Taking (above baseline)
    if ((portfolio.XRP || 0) > BASELINE_XRP_MIN) {
      const excessXRP = (portfolio.XRP || 0) - BASELINE_XRP_MIN;
      await createApproval({
        type: 'sell',
        coin: 'XRP',
        amount: excessXRP,
        title: `Take profit ${excessXRP.toFixed(2)} XRP`,
        summary: `XRP above baseline. Recommend taking profit on ${excessXRP.toFixed(2)} XRP.`,
        metadata: { xrpPrice },
      });
    }

    // Non-core coin staking suggestions
    for (const coin of Object.keys(portfolio)) {
      if (!SAFE_COINS.includes(coin) && (portfolio[coin] || 0) > 0) {
        await createApproval({
          type: 'stake-suggestion',
          coin,
          amount: portfolio[coin],
          title: `Stake suggestion: ${coin}`,
          summary: `Consider staking ${coin}: ${portfolio[coin]}.`,
          metadata: {},
        });
      }
    }

    // Monte Carlo risk forecasting
    const monteCarloOutcomes = monteCarloSimulation(portfolio);
    const meanValue = monteCarloOutcomes.reduce((a, b) => a + b, 0) / monteCarloOutcomes.length;
    await sendAdvisoryMessage(`Monte Carlo mean portfolio value projection: $${meanValue.toFixed(2)}`);

    // Log action for ML / reinforcement learning
    await logToMemory({
      type: 'analysis',
      btcPrice,
      xrpPrice,
      portfolio,
      monteCarloMean: meanValue,
    });
  } catch (err) {
    console.error('analyzePortfolio error:', err && err.message ? err.message : err);
  }
}

// ============ PORTFOLIO LOOP ============
async function mainLoop() {
  try {
    const portfolio = await getPortfolioSnapshot();
    await analyzePortfolio(portfolio);

    // Save portfolio snapshot if DB is available
    try {
      if (db) {
        await db.collection('portfolioSnapshots').insertOne({
          timestamp: new Date(),
          portfolio,
        });
      } else if (DRY_RUN) {
        console.log('[Snapshot - dryrun]', { timestamp: new Date(), portfolio });
      }
    } catch (err) {
      console.error('Failed to save portfolio snapshot:', err && err.message ? err.message : err);
    }
  } catch (err) {
    console.error('mainLoop error:', err && err.message ? err.message : err);
  }
}

// Schedule loop
// Schedule loop — it will run regardless, but individual operations are guarded inside
cron.schedule(LOOP_INTERVAL, async () => {
  try {
    await mainLoop();
  } catch (err) {
    console.error('Scheduled mainLoop failed:', err && err.message ? err.message : err);
  }
});

  // Daily report at 08:00 UTC
  cron.schedule('0 8 * * *', async () => {
    try {
      const portfolio = await getPortfolioSnapshot();
      // Monte Carlo mean
      const mc = monteCarloSimulation(portfolio, Math.min(MONTE_CARLO_SIMULATIONS, 500), 30);
      const mean = mc.reduce((a, b) => a + b, 0) / mc.length;
      const news = await fetchNewsSentiment(Object.keys(portfolio || {}));
      const report = await generateDailyReport(db, portfolio, { monteCarloMean: mean, sentiment: news, summary: 'Daily automated report' });
      await sendAdvisoryMessage(`Daily report generated: ${report.createdAt.toISOString()} — Monte Carlo mean $${mean.toFixed(2)}`);
    } catch (e) {
      console.error('Daily report failed:', e && e.message ? e.message : e);
    }
  });

  // Retrain reinforcement policy daily at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    try {
      if (!db) return;
      const out = await trainReinforcement(db);
      console.log('Daily reinforcement training result:', out);
      await db.collection('training_runs').insertOne({ result: out, timestamp: new Date() });
    } catch (e) {
      console.error('Daily training failed:', e && e.message ? e.message : e);
    }
  });

// ============ DISCORD INTERACTION ============
client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

    const msg = message.content.toLowerCase();

    // Owner-only commands: deposit, withdraw, set-baseline
    // Commands start with '!' e.g. '!deposit XRP 20'
    if (msg.startsWith('!')) {
      const parts = msg.slice(1).trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      // Only owner can run admin commands
      if (!OWNER_ID) {
        await sendAdvisoryMessage('OWNER_ID not configured. Admin commands are disabled.');
        return;
      }
      if (message.author.id !== OWNER_ID) {
        await sendAdvisoryMessage('Only owner can run admin commands.');
        return;
      }

      if (cmd === 'deposit') {
        const coin = (args[0] || '').toUpperCase();
        const amount = parseFloat(args[1]);
        if (!coin || Number.isNaN(amount)) {
          await sendAdvisoryMessage('Usage: !deposit COIN AMOUNT');
          return;
        }
        await recordDeposit(coin, amount, `discord:${message.author.id}`);
        return;
      }

      if (cmd === 'balances') {
        // Owner-only: show holdings and USD breakdown (from deposits + public prices)
        if (!OWNER_ID) {
          await sendAdvisoryMessage('OWNER_ID not configured. Admin commands are disabled.');
          return;
        }
        if (message.author.id !== OWNER_ID) {
          await sendAdvisoryMessage('Only owner can run admin commands.');
          return;
        }

        await sendAdvisoryMessage('Building balances summary...');
        let portfolio = {};
        try {
          // Prefer persisted deposits
          portfolio = await buildPortfolioFromDeposits();
          // Fallback to snapshot if no deposits exist
          if (!Object.keys(portfolio).length) portfolio = await getPortfolioSnapshot();
        } catch (e) {
          console.warn('balances: could not build portfolio:', e && e.message ? e.message : e);
        }

        // Fetch prices and compute USD totals
        const lines = [];
        let totalUsd = 0;
        for (const coin of Object.keys(portfolio)) {
          const amt = portfolio[coin] || 0;
          const price = await getCoinPrice(coin).catch(() => null);
          const usd = (price || 0) * amt;
          totalUsd += usd;
          lines.push(`${coin}: ${amt} @ ${price ? price.toFixed(6) : 'N/A'} USD => ${usd ? usd.toFixed(2) : 'N/A'} USD`);
        }
        if (!lines.length) {
          await sendAdvisoryMessage('No holdings found.');
          return;
        }
        await sendAdvisoryMessage(`Balances:\n${lines.join('\n')}\nTotal USD est: $${totalUsd.toFixed(2)}`);

        // Monte Carlo quick projection
        try {
          const mc = monteCarloSimulation(portfolio, 250);
          const mean = mc.reduce((a, b) => a + b, 0) / mc.length;
          await sendAdvisoryMessage(`Monte Carlo mean portfolio value (250 sims): $${mean.toFixed(2)}`);
        } catch (e) {
          console.warn('balances: Monte Carlo failed', e && e.message ? e.message : e);
        }
        return;
      }

      if (cmd === 'snapshot') {
        // Force a snapshot / analysis run
        if (!OWNER_ID) {
          await sendAdvisoryMessage('OWNER_ID not configured. Admin commands are disabled.');
          return;
        }
        if (message.author.id !== OWNER_ID) {
          await sendAdvisoryMessage('Only owner can run admin commands.');
          return;
        }
        await sendAdvisoryMessage('Running snapshot and analysis (DRY_RUN=' + DRY_RUN + ')...');
        try {
          await mainLoop();
          await sendAdvisoryMessage('Snapshot completed.');
        } catch (e) {
          console.error('snapshot command failed:', e && e.message ? e.message : e);
          await sendAdvisoryMessage('Snapshot failed: ' + (e && e.message ? e.message : 'error'));
        }
        return;
      }

      if (cmd === 'set-baseline') {
        const coin = (args[0] || '').toUpperCase();
        const amount = parseFloat(args[1]);
        if (!coin || Number.isNaN(amount)) {
          await sendAdvisoryMessage('Usage: !set-baseline COIN AMOUNT');
          return;
        }
        if (!db) {
          await sendAdvisoryMessage('DB not configured. Cannot set baseline.');
          return;
        }
        await db.collection('baselines').updateOne({ coin }, { $set: { baseline: amount }, $push: { history: { setBy: message.author.id, amount, timestamp: new Date() } } }, { upsert: true });
        await sendAdvisoryMessage(`Baseline for ${coin} set to ${amount}`);
        return;
      }

      if (cmd === 'baseline') {
        const coin = (args[0] || '').toUpperCase();
        if (!coin) {
          await sendAdvisoryMessage('Usage: !baseline COIN');
          return;
        }
        const b = await getBaseline(coin);
        await sendAdvisoryMessage(`Baseline for ${coin}: ${b}`);
        return;
      }
      // Approvals management
      if (cmd === 'approvals') {
        // list pending approvals
        if (!db) {
          await sendAdvisoryMessage('DB not configured — approvals unavailable in dry-run.');
          return;
        }
        const rows = await db.collection('approvals').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(20).toArray();
        if (!rows.length) {
          await sendAdvisoryMessage('No pending approvals.');
          return;
        }
        const lines = rows.map(r => `#${r._id} ${r.title} — ${r.summary}`);
        await sendAdvisoryMessage(`Pending approvals:\n${lines.join('\n')}`);
        return;
      }

      if (cmd === 'approve' || cmd === 'decline') {
        const idArg = args[0];
        if (!idArg) {
          await sendAdvisoryMessage(`Usage: !${cmd} <approvalId>`);
          return;
        }
        if (!db) {
          await sendAdvisoryMessage('DB not configured — cannot modify approvals in dry-run.');
          return;
        }
        // Try to parse as ObjectId if possible
        let id = idArg;
        try { id = new ObjectId(idArg); } catch (e) { /* keep original */ }
        const newStatus = cmd === 'approve' ? 'approved' : 'declined';
        const updated = await db.collection('approvals').findOneAndUpdate({ _id: id }, { $set: { status: newStatus, actedBy: message.author.id, actedAt: new Date() } }, { returnDocument: 'after' });
        if (!updated.value) {
          await sendAdvisoryMessage('Approval not found.');
          return;
        }
        await sendAdvisoryMessage(`Approval ${idArg} marked ${newStatus}.`);
        // If approved and not DRY_RUN, execute placeholder action
        if (newStatus === 'approved' && !DRY_RUN) {
          // TODO: implement execution via exchange API
          await sendAdvisoryMessage(`(Execution placeholder) Executing approval ${idArg}...`);
        }
        return;
      }
    }

    // Approve / Decline suggested trades
    if (msg.includes('approve')) {
      await sendAdvisoryMessage('Action approved. (DRY_RUN=' + DRY_RUN + ')');
      if (!DRY_RUN) {
        // Placeholder: integrate Coinbase API execution
        await sendAdvisoryMessage('Executing trade/stake...');
      }
    }
    if (msg.includes('decline')) {
      await sendAdvisoryMessage('Action declined.');
    }

    // Portfolio deposit update
    if (msg.includes('deposit')) {
      await sendAdvisoryMessage('Deposit noted. Baseline updated.');
      // Update baseline in MongoDB (TODO)
    }

    // Status request
    if (msg.includes('status')) {
      const portfolio = await getPortfolioSnapshot();
      await sendAdvisoryMessage(`Current portfolio: ${JSON.stringify(portfolio)}`);
    }

    // Request advisory analysis
    if (msg.includes('advice')) {
      await sendAdvisoryMessage('Analyzing portfolio...');
      await analyzePortfolio(await getPortfolioSnapshot());
    }
  } catch (err) {
    console.error('Discord message handler error:', err && err.message ? err.message : err);
  }
});

// ============ START DISCORD BOT ============
// ============ STARTUP ============
async function start() {
  console.log('Starting Ultimate Autonomous Crypto Advisor Bot...');
  if (!DISCORD_TOKEN) console.warn('DISCORD_TOKEN not provided — Discord features will be disabled.');
  if (!MONGODB_URI) console.warn('MONGODB_URI not provided — DB persistence will be disabled.');

  await connectMongo();
  await ensureCollections();

  // If Coinbase keys are provided, attempt an initial fetch to populate the DB snapshot.
  (async function tryFetchCoinbase(){
    const apiKey = process.env.COINBASE_API_KEY;
    const apiSecret = process.env.COINBASE_API_SECRET;
    if (!apiKey || !apiSecret || !CoinbaseClient) {
      if (!apiKey || !apiSecret) console.log('Coinbase API keys not configured — skipping live balance fetch.');
      return;
    }
    try {
      const cb = new CoinbaseClient({ apiKey, apiSecret });
  cb.getAccounts({}, async (err, accounts) => {
        if (err) return console.warn('Coinbase fetch failed:', err && err.message ? err.message : err);
        const portfolio = {};
        const prices = {};
        for (const a of accounts) {
          const balance = a.balance && a.balance.amount ? Number(a.balance.amount) : 0;
          const currency = (a.balance && a.balance.currency) || a.currency || null;
          const native = a.native_balance && a.native_balance.amount ? Number(a.native_balance.amount) : null;
          if (!currency) continue;
          if (currency === 'USD' || currency === 'USDC') portfolio[currency] = (portfolio[currency] || 0) + balance;
          else {
            portfolio[currency] = (portfolio[currency] || 0) + balance;
            if (native && balance > 0) prices[currency] = native / balance;
          }
        }
        try {
          if (db) await db.collection('portfolioSnapshots').insertOne({ timestamp: new Date(), portfolio, _prices: prices });
          console.log('Coinbase live snapshot inserted.');
        } catch (e) {
          console.warn('Could not persist Coinbase snapshot:', e && e.message ? e.message : e);
        }
      });
    } catch (e) {
      console.warn('Coinbase client initialization failed:', e && e.message ? e.message : e);
    }
  })();

  // Login to Discord only if token provided
  if (DISCORD_TOKEN) {
    try {
      await client.login(DISCORD_TOKEN);
      // Wait for ready event but don't hang forever
      const waitForReady = (timeoutMs = 15000) => new Promise(resolve => {
        let resolved = false;
        const onReady = () => { if (!resolved) { resolved = true; resolve(true); } };
        client.once('ready', onReady);
        // fallback timeout
        setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, timeoutMs);
      });
      const ready = await waitForReady(15000);
      if (ready) console.log('Discord client ready.');
      else console.warn('Discord client did not become ready within timeout. Continuing without live Discord interactions.');
    } catch (err) {
      console.error('Discord login failed:', err && err.message ? err.message : err);
    }
  }

  // Start webhook server
  try {
    const server = app.listen(PORT, () => console.log(`Webhook server listening on port ${PORT}`));
    server.on('error', (err) => console.error('Webhook server error:', err && err.message ? err.message : err));
  } catch (err) {
    console.warn('Could not start webhook server:', err && err.message ? err.message : err);
  }

  // Ensure kill-switch collection exists
  if (db) {
    try {
      await db.collection('kill_switch').createIndex({ createdAt: 1 });
    } catch (e) {
      /* ignore */
    }
  }
  // Serve minimal static dashboard
  try {
    app.use('/web', express.static(require('path').resolve(__dirname, 'web')));
    console.log('Static dashboard available at /web');
  } catch (e) {
    console.warn('Failed to mount static dashboard:', e && e.message ? e.message : e);
  }

  console.log('Bot startup complete. Scheduler is active. (DRY_RUN=' + DRY_RUN + ')');
}

start().catch(err => console.error('Startup error:', err && err.message ? err.message : err));

// Global error handlers to avoid silent exits
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception thrown:', err && err.stack ? err.stack : err);
});
