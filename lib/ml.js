/**
 * Minimal ML scaffolding placeholder.
 * Exports predictShortTerm(portfolio) and trainReinforcement(memory)
 * These are stubs so the bot can call ML functions and store/replace real models later.
 */
const { MongoClient } = require('mongodb');

async function predictShortTerm(portfolio) {
  // Simple heuristic: compute weighted USD value and return a tiny random drift
  const prices = (portfolio && portfolio._prices) || {};
  let total = 0;
  for (const k of Object.keys(portfolio || {})) {
    if (k === '_prices') continue;
    const amt = Number(portfolio[k]) || 0;
    const p = Number(prices[k]) || (k === 'USDC' ? 1 : 0);
    total += amt * p;
  }
  // Return a prediction object with expected change percentage and confidence
  const changePct = (Math.random() - 0.5) * 0.02; // +/-1%
  const confidence = 0.5 + Math.random() * 0.4;
  return { expectedValue: total * (1 + changePct), changePct, confidence };
}

async function trainReinforcement(db) {
  // Naive trainer: look at memory entries and compute a simple policy summary
  if (!db) return { status: 'no-db' };
  try {
    const rows = await db.collection('memory').find({ type: 'analysis' }).sort({ timestamp: -1 }).limit(1000).toArray();
    // Count how often analysis suggested sells vs stakes
    let sell = 0, stake = 0;
    for (const r of rows) {
      if (r.monteCarloMean && r.monteCarloMean < 100) sell++;
      if (r.portfolio) stake += Object.keys(r.portfolio).length;
    }
    const policy = { sellSignals: sell, stakeSignals: stake, trainedAt: new Date() };
    await db.collection('models').updateOne({ name: 'naive_policy' }, { $set: { policy, updatedAt: new Date() } }, { upsert: true });
    return { status: 'ok', policy };
  } catch (e) {
    return { status: 'error', error: String(e) };
  }
}

module.exports = { predictShortTerm, trainReinforcement };
